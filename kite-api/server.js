const express = require("express");
const cors = require("cors");
const fs = require("fs");
const csv = require("csv-parser");
const { KiteConnect } = require("kiteconnect");
const path = require("path");
const { KiteTicker } = require("kiteconnect");
const http = require('http');
const WebSocket = require('ws');

const KITE_API_KEY = "r1a7qo9w30bxsfax";    // Your Kite API Key
const KITE_API_SECRET = "dg9xa47tsayepnnb2xhdk0vk081cec36"; // 👈 Put your Kite API Secret
let KITE_ACCESS_TOKEN = ""; // Will be set after callback
const NIFTY_500_CSV_PATH = "./nifty500.csv";
const { loadNifty500Symbols, loadBullishScanSymbols, loadBearishScanSymbols, calculateRSI } = require("./utils");
const { logRSIForFilteredTokens } = require("./rsiLogger");
const {setupTickerWithFiltered} = require("./ticker");

const app = express();
app.use(cors());

const kc = new KiteConnect({ api_key: KITE_API_KEY });

// --------------------------------------------------------------
// Route: /login/callback?request_token=xxx
// --------------------------------------------------------------
app.get("/login/callback", async (req, res) => {
  const request_token = req.query.request_token;

  if (!request_token) {
    return res.status(400).send("Missing request_token");
  }

  try {
    const session = await kc.generateSession(request_token, KITE_API_SECRET);
    KITE_ACCESS_TOKEN = session.access_token;

    kc.setAccessToken(KITE_ACCESS_TOKEN);
    console.log("✅ New Access Token:", KITE_ACCESS_TOKEN);

    const profile = await kc.getProfile();
    console.log("👤 User Profile:", profile);

    res.send(`Access Token received and set! ✅<br/>User Profile: ${JSON.stringify(profile)}`);
  } catch (error) {
    console.error("❌ Failed to generate session:", error);
    res.status(500).send("Error generating access token");
  }
});

// --------------------------------------------------------------
// Watch for new bullish or bearish scan files
// --------------------------------------------------------------
const downloadsDir = path.join(require("os").homedir(), "Downloads");
const targetDir = __dirname;

// Utility to keep track of last bullish/bearish scan symbols for subscription
let lastBullishSymbols = new Set();
let lastBearishSymbols = new Set();
let lastNifty500Response = null; // Store last response for change detection

// --- Notify clients on subscription change ---
let wsClients = [];
function notifyClientsNifty500Change(data) {
  wsClients.forEach(ws => {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify({ type: "nifty500", data }));
    }
  });
}

function refreshScansAndSubscribe() {
  Promise.all([
    loadBullishScanSymbols(),
    loadBearishScanSymbols(),
    kc.getInstruments("NSE"),
    loadNifty500Symbols()
  ]).then(([bullishScanSymbols, bearishScanSymbols, instruments, nifty500Symbols]) => {
    try {
      // Convert to Set for comparison
      const bullishSet = bullishScanSymbols ? new Set(bullishScanSymbols) : new Set();
      const bearishSet = bearishScanSymbols ? new Set(bearishScanSymbols) : new Set();

      // Only update and resubscribe if bullish or bearish scan symbols have changed
      let shouldUpdate = false;
      if (
        bullishSet.size !== lastBullishSymbols.size ||
        bearishSet.size !== lastBearishSymbols.size ||
        [...bullishSet].some(s => !lastBullishSymbols.has(s)) ||
        [...bearishSet].some(s => !lastBearishSymbols.has(s))
      ) {
        shouldUpdate = true;
        lastBullishSymbols = bullishSet;
        lastBearishSymbols = bearishSet;
      }

      if (!shouldUpdate) {
        console.log("No change in bullish/bearish scan symbols, skipping re-subscription.");
        return;
      }

      let filtered = instruments.filter(
        inst =>
          inst.instrument_type === "EQ" &&
          nifty500Symbols.has(inst.tradingsymbol.toUpperCase())
      );
      // Merge bullish and bearish tokens
      let scanSymbols = new Set();
      bullishSet.forEach(s => scanSymbols.add(s));
      bearishSet.forEach(s => scanSymbols.add(s));
      if (scanSymbols.size > 0) {
        filtered = filtered.filter(inst => scanSymbols.has(inst.tradingsymbol.toUpperCase()));
      }
      try {
        setupTickerWithFiltered(filtered, KITE_API_KEY, KITE_ACCESS_TOKEN, kc);
      } catch (err) {
        console.error("Error in setupTickerWithFiltered:", err);
      }
      console.log(`✅ Subscribed to ${filtered.length} tokens (bullish+bearish)`);

      // Prepare response as in /api/nifty500
      const { tokenRSI } = require("./ticker");
      filtered = filtered.map(inst => ({
        ...inst,
        rsi: tokenRSI[inst.instrument_token] || null,
        isBullish: bullishSet.has(inst.tradingsymbol.toUpperCase()),
        isBearish: bearishSet.has(inst.tradingsymbol.toUpperCase())
      }));
      const bullishList = filtered.filter(inst => inst.isBullish);
      const bearishList = filtered.filter(inst => inst.isBearish);

      const response = {
        instruments: filtered,
        bullishTokens: bullishList,
        bearishTokens: bearishList
      };

      // Only notify if changed
      if (JSON.stringify(response) !== JSON.stringify(lastNifty500Response)) {
        lastNifty500Response = response;
        notifyClientsNifty500Change(response);
      }
      // Here you can also update your order logic to use only the latest bullish/bearish tokens
    } catch (err) {
      console.error("Error in refreshScansAndSubscribe:", err);
    }
  }).catch(err => {
    console.error("Promise error in refreshScansAndSubscribe:", err);
  });
}

fs.watch(downloadsDir, (eventType, filename) => {
  if (
    filename &&
    (/^bullish scan_ScanResults.*\.csv$/i.test(filename) || /^bearish scan_ScanResults.*\.csv$/i.test(filename)) &&
    eventType === "rename"
  ) {
    const srcPath = path.join(downloadsDir, filename);
    const destPath = path.join(targetDir, filename);
    setTimeout(() => {
      fs.access(srcPath, fs.constants.F_OK, (err) => {
        if (!err) {
          fs.rename(srcPath, destPath, (err) => {
            if (err) {
              console.error(`❌ Failed to move ${filename}:`, err.message);
            } else {
              console.log(`✅ Moved ${filename} to kite-api folder`);
              // Only refresh for the scan type that changed
              if (/^bullish scan_ScanResults.*\.csv$/i.test(filename)) {
                // Only update bullish tokens for subscription/orders
                refreshScansAndSubscribe();
              } else if (/^bearish scan_ScanResults.*\.csv$/i.test(filename)) {
                // Only update bearish tokens for subscription/orders
                refreshScansAndSubscribe();
              }
            }
          });
        }
      });
    }, 1000);
  }
});

// SSE RSI Stream
app.get("/api/nifty500/rsi-stream", async (req, res) => {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.flushHeaders();

  const period = 14;
  const { streamingTokens, tokenCloses, tokenRSI, lastFiltered } = require("./ticker");
  // Build a map for quick lookup
  const lastFilteredMap = (lastFiltered || []).reduce((acc, inst) => {
    acc[inst.instrument_token] = inst;
    return acc;
  }, {});

  let lastSent = null;

  function buildRsiData() {
    return streamingTokens.map(token => {
      const inst = lastFilteredMap[token] || {};
      const closes = tokenCloses[token]?.map(c => c.close) || [];
      return {
        instrument_token: token,
        tradingsymbol: inst.tradingsymbol || token,
        name: inst.name || '',
        close: closes.length ? closes[closes.length - 1] : null,
        rsi: tokenRSI[token] ?? null,
        is_bullish: inst.is_bullish,
        is_bearish: inst.is_bearish
      };
    });
  }

  // Wait until all tokens have an RSI value before sending first data
  function allTokensHaveRSI(rsiData) {
    return rsiData.length > 0 && rsiData.every(t => t.rsi !== null && t.rsi !== undefined);
  }

  const interval = setInterval(() => {
    const rsiData = buildRsiData();
    if (!allTokensHaveRSI(rsiData)) return; // Wait until all tokens have RSI
    const rsiDataStr = JSON.stringify(rsiData);
    if (rsiDataStr !== lastSent) {
      res.write(`data: ${rsiDataStr}\n\n`);
      lastSent = rsiDataStr;
    }
  }, 2000);

  req.on("close", () => {
    clearInterval(interval);
  });
});

// --- WebSocket server for live RSI/token updates ---
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

wss.on("connection", (ws) => {
  wsClients.push(ws);
  // Send latest nifty500 data on connect if available
  if (lastNifty500Response) {
    ws.send(JSON.stringify({ type: "nifty500", data: lastNifty500Response }));
  }
  ws.on("close", () => {
    wsClients = wsClients.filter(client => client !== ws);
  });
});

function buildRsiDataWS() {
  let { tokenCloses, tokenRSI, lastFiltered } = require("./ticker");
  // Use filtered instruments from lastFiltered for name lookup
  const lastFilteredMap = (lastFiltered || []).reduce((acc, inst) => {
    acc[inst.instrument_token] = inst;
    return acc;
  }, {});
  return Object.keys(tokenRSI).map(token => {
    // Always get instrument details from lastFiltered (filtered instruments from /api/nifty500)
    const inst = lastFilteredMap[token];
    let tradingsymbol = inst ? inst.tradingsymbol : token;
    let name = inst ? inst.name : tradingsymbol;
    const closes = inst && inst.instrument_token && tokenCloses[inst.instrument_token]?.map(c => c.close) || [];
    return {
      instrument_token: token,
      tradingsymbol,
      name,
      close: closes.length ? closes[closes.length - 1] : null,
      rsi: tokenRSI[token] ?? null
    };
  });
}

let lastWSData = null;
setInterval(() => {
  const rsiData = buildRsiDataWS();
  if (rsiData.length === 0) {
    // Log for debugging if no tokens with RSI are available
    console.log('WS: No tokens with RSI to send');
    return;
  }
  const rsiDataStr = JSON.stringify(rsiData);
  if (rsiDataStr !== lastWSData) {
   // console.log('WS: Sending data to clients:', rsiDataStr);
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(rsiDataStr);
      }
    });
    lastWSData = rsiDataStr;
  }
}, 2000);

// --------------------------------------------------------------
// Main Route
// --------------------------------------------------------------
app.get("/api/nifty500", async (req, res) => {
  try {
    if (!KITE_ACCESS_TOKEN) {
      return res.status(400).send("Access token is not set. Complete login first.");
    }

    const instruments = await kc.getInstruments("NSE");
    console.log(`✅ Loaded ${instruments.length} instruments from NSE`);

    kc.getProfile()
      .then(data => {
        console.log("Access Token working, Profile:", data);
      })
      .catch(error => {
        console.error("Access Token error for profile:", error);
      });

    const nifty500Symbols = await loadNifty500Symbols();
    const bullishScanSymbols = await loadBullishScanSymbols();
    const bearishScanSymbols = await loadBearishScanSymbols();

    let filtered = instruments.filter(
      inst =>
        inst.instrument_type === "EQ" &&
        nifty500Symbols.has(inst.tradingsymbol.toUpperCase())
    );

    // Merge bullish and bearish tokens
    let scanSymbols = new Set();
    if (bullishScanSymbols) bullishScanSymbols.forEach(s => scanSymbols.add(s));
    if (bearishScanSymbols) bearishScanSymbols.forEach(s => scanSymbols.add(s));
    if (scanSymbols.size > 0) {
      filtered = filtered.filter(inst => scanSymbols.has(inst.tradingsymbol.toUpperCase()));
    }

    // Add latest RSI and isBullish/isBearish to each instrument
    const { tokenRSI } = require("./ticker");
    filtered = filtered.map(inst => ({
      ...inst,
      rsi: tokenRSI[inst.instrument_token] || null,
      isBullish: bullishScanSymbols && bullishScanSymbols.has(inst.tradingsymbol.toUpperCase()),
      isBearish: bearishScanSymbols && bearishScanSymbols.has(inst.tradingsymbol.toUpperCase())
    }));

    const tokens = filtered.map(inst => inst.instrument_token);
    console.log(`✅ Matched ${tokens.length} tokens after bullish+bearish scan filter`);

    //logRSIForFilteredTokens(filtered);
    setupTickerWithFiltered(filtered, KITE_API_KEY, KITE_ACCESS_TOKEN, kc);

    // Send both bullish and bearish tokens separately in the response
    const bullishList = filtered.filter(inst => inst.isBullish);
    const bearishList = filtered.filter(inst => inst.isBearish);

    res.json({
      instruments: filtered,
      bullishTokens: bullishList,
      bearishTokens: bearishList
    });
  } catch (err) {
    console.error("❌ Error:", err.message);
    res.status(500).json({ error: "Failed to load Nifty 500 instruments" });
  }
});

// --------------------------------------------------------------
server.listen(5000, () => {
  console.log("🚀 Server running on http://localhost:5000");
  console.log("🚀 WebSocket running on ws://localhost:5000");
});
