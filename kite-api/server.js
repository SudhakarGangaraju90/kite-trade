const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const http = require("http");
const WebSocket = require("ws");
const { KiteConnect } = require("kiteconnect");

const {
  loadNifty500Symbols,
  loadBullishScanSymbols,
  loadBearishScanSymbols,
} = require("./utils");

const {
  setupTickerWithFiltered,
  tokenCloses,
  tokenRsiState,
  tokenRSI,
  currentMinuteData,
} = require("./ticker");

const KITE_API_KEY = "r1a7qo9w30bxsfax"; // Your Kite API Key
const KITE_API_SECRET = "dg9xa47tsayepnnb2xhdk0vk081cec36"; // 👈 Put your Kite API Secret
let KITE_ACCESS_TOKEN = ""; // Will be set after callback
const downloadsDir = path.join(require("os").homedir(), "Downloads");
const targetDir = __dirname;

const app = express();
app.use(cors());

const kc = new KiteConnect({ api_key: KITE_API_KEY });

// State
let lastBullishSymbols = new Set();
let lastBearishSymbols = new Set();
let lastNifty500Response = null;

let wsClients = [];

function notifyClientsNifty500Change(data) {
  wsClients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "nifty500", data }));
    }
  });
}

// Refresh and subscribe
async function refreshScansAndSubscribe() {
  try {
    const bullishScanSymbols = await loadBullishScanSymbols();
    const bearishScanSymbols = await loadBearishScanSymbols();
    const instruments = await kc.getInstruments("NSE");
    const nifty500Symbols = await loadNifty500Symbols();

    const bullishSet = new Set(bullishScanSymbols);
    const bearishSet = new Set(bearishScanSymbols);

    // Check for changes
    let shouldUpdate = false;
    if (
      bullishSet.size !== lastBullishSymbols.size ||
      bearishSet.size !== lastBearishSymbols.size ||
      [...bullishSet].some((s) => !lastBullishSymbols.has(s)) ||
      [...bearishSet].some((s) => !lastBearishSymbols.has(s))
    ) {
      shouldUpdate = true;
      lastBullishSymbols = bullishSet;
      lastBearishSymbols = bearishSet;
    }
    if (!shouldUpdate) {
      console.log("No change in bullish/bearish scan symbols.");
      return;
    }

    let filtered = instruments.filter(
      (inst) =>
        inst.instrument_type === "EQ" && nifty500Symbols.has(inst.tradingsymbol.toUpperCase())
    );
    const scanSymbols = new Set([
      ...Array.from(bullishSet),
      ...Array.from(bearishSet),
    ]);
    if (scanSymbols.size > 0) {
      filtered = filtered.filter((inst) =>
        scanSymbols.has(inst.tradingsymbol.toUpperCase())
      );
    }

    await setupTickerWithFiltered(filtered, KITE_API_KEY, KITE_ACCESS_TOKEN, kc);

    // Build Response
    const enhanced = filtered.map((inst) => {
      const token = inst.instrument_token;
      return {
        ...inst,
        rsi: tokenRSI[token] ?? null,
        isBullish: bullishSet.has(inst.tradingsymbol.toUpperCase()),
        isBearish: bearishSet.has(inst.tradingsymbol.toUpperCase()),
      };
    });
    const bullishList = enhanced.filter((i) => i.isBullish);
    const bearishList = enhanced.filter((i) => i.isBearish);

    const response = {
      instruments: enhanced,
      bullishTokens: bullishList,
      bearishTokens: bearishList,
    };
    if (JSON.stringify(response) !== JSON.stringify(lastNifty500Response)) {
      lastNifty500Response = response;
      notifyClientsNifty500Change(response);
    }
  } catch (err) {
    console.error("Error in refreshScansAndSubscribe:", err);
  }
}

// Watch downloads directory for new scans
fs.watch(downloadsDir, (eventType, filename) => {
  if (
    filename &&
    (/^bullish scan_ScanResults.*\.csv$/i.test(filename) ||
      /^bearish scan_ScanResults.*\.csv$/i.test(filename)) &&
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
              console.log(`✅ Moved ${filename} to app directory`);
              refreshScansAndSubscribe();
            }
          });
        }
      });
    }, 1000);
  }
});

// Route: /login/callback
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

// Route: /api/nifty500
app.get("/api/nifty500", async (req, res) => {
  if (!KITE_ACCESS_TOKEN) {
    return res.status(400).send("Access token is not set. Complete login first.");
  }

  try {
    const instruments = await kc.getInstruments("NSE");
    const nifty500Symbols = await loadNifty500Symbols();
    const bullishScanSymbols = await loadBullishScanSymbols();
    const bearishScanSymbols = await loadBearishScanSymbols();

    let filtered = instruments.filter(
      (inst) =>
        inst.instrument_type === "EQ" && nifty500Symbols.has(inst.tradingsymbol.toUpperCase())
    );
    const scanSymbols = new Set([
      ...Array.from(bullishScanSymbols),
      ...Array.from(bearishScanSymbols),
    ]);
    if (scanSymbols.size > 0) {
      filtered = filtered.filter((inst) => scanSymbols.has(inst.tradingsymbol.toUpperCase()));
    }

    const enhanced = filtered.map((inst) => {
      const token = inst.instrument_token;
      return {
        ...inst,
        rsi: tokenRSI[token] ?? null,
        isBullish: bullishScanSymbols.has(inst.tradingsymbol.toUpperCase()),
        isBearish: bearishScanSymbols.has(inst.tradingsymbol.toUpperCase()),
      };
    });
    const bullishList = enhanced.filter((i) => i.isBullish);
    const bearishList = enhanced.filter((i) => i.isBearish);

    await setupTickerWithFiltered(filtered, KITE_API_KEY, KITE_ACCESS_TOKEN, kc);

    res.json({
      instruments: enhanced,
      bullishTokens: bullishList,
      bearishTokens: bearishList,
    });
  } catch (err) {
    console.error("❌ Error:", err.message);
    res.status(500).json({ error: "Failed to load Nifty 500 instruments" });
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

  const interval = setInterval(() => {
    const data = Object.keys(tokenRsiState).map((token) => {
      return {
        instrument_token: token,
        rsi: tokenRSI[token] ?? null,
      };
    });
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }, 2000);

  req.on("close", () => {
    clearInterval(interval);
  });
});

// WebSocket for Nifty500 + RSI
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
wss.on("connection", (ws) => {
  wsClients.push(ws);
  if (lastNifty500Response) {
    ws.send(JSON.stringify({ type: "nifty500", data: lastNifty500Response }));
  }
  ws.on("close", () => {
    wsClients = wsClients.filter((client) => client !== ws);
  });
});

// RSI WebSocket
setInterval(() => {
  const data = Object.keys(tokenRsiState).map((token) => {
    return {
      instrument_token: token,
      rsi: tokenRSI[token] ?? null,
    };
  });
  if (data.length > 0) {
    const dataStr = JSON.stringify(data);
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(dataStr);
      }
    });
  }
}, 2000);

// --------------------------------------------------------------
server.listen(5000, () => {
  console.log("🚀 Server running on http://localhost:5000");
  console.log("🚀 WebSocket running on ws://localhost:5000");
});
