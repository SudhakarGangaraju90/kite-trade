const express = require("express");
const cors = require("cors");
const fs = require("fs");
const csv = require("csv-parser");
const { KiteConnect } = require("kiteconnect");
const path = require("path");
const { KiteTicker } = require("kiteconnect");

const KITE_API_KEY = "r1a7qo9w30bxsfax";    // Your Kite API Key
const KITE_API_SECRET = "dg9xa47tsayepnnb2xhdk0vk081cec36"; // 👈 Put your Kite API Secret
let KITE_ACCESS_TOKEN = ""; // Will be set after callback
const NIFTY_500_CSV_PATH = "./nifty500.csv";
const { loadNifty500Symbols, loadBullishScanSymbols, calculateRSI } = require("./utils");
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
// Watch for new bullish scan files
// --------------------------------------------------------------
const downloadsDir = path.join(require("os").homedir(), "Downloads");
const targetDir = __dirname;

fs.watch(downloadsDir, (eventType, filename) => {
  if (
    filename &&
    /^bullish scan_ScanResults.*\.csv$/i.test(filename) &&
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

  const interval = setInterval(() => {
    const rsiData = streamingTokens.map(token => {
      const closes = tokenCloses[token]?.map(c => c.close) || [];
      const rsi = calculateRSI(closes, period);
      return { instrument_token: token, rsi };
    });
    res.write(`data: ${JSON.stringify(rsiData)}\n\n`);
  }, 5000);

  req.on("close", () => {
    clearInterval(interval);
  });
});

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

    let filtered = instruments.filter(
      inst =>
        inst.instrument_type === "EQ" &&
        nifty500Symbols.has(inst.tradingsymbol.toUpperCase())
    );

    if (bullishScanSymbols && bullishScanSymbols.size > 0) {
      filtered = filtered.filter(inst =>
        bullishScanSymbols.has(inst.tradingsymbol.toUpperCase())
      );
    }

    const tokens = filtered.map(inst => inst.instrument_token);
    console.log(`✅ Matched ${tokens.length} tokens after bullish scan filter`);

    //logRSIForFilteredTokens(filtered);
    setupTickerWithFiltered(filtered, KITE_API_KEY, KITE_ACCESS_TOKEN, kc);

    res.json({ instruments: filtered });
  } catch (err) {
    console.error("❌ Error:", err.message);
    res.status(500).json({ error: "Failed to load Nifty 500 instruments" });
  }
});

// --------------------------------------------------------------
app.listen(5000, () => {
  console.log("🚀 Server running on http://localhost:5000");
});
