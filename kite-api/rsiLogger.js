const { calculateRSI } = require("./utils");
const { KiteConnect } = require("kiteconnect");

const KITE_API_KEY = "r1a7qo9w30bxsfax";
let KITE_ACCESS_TOKEN = ""; // Set this from your main server if needed

const kc = new KiteConnect({ api_key: KITE_API_KEY });

async function logRSIForFilteredTokens(filtered) {
  try {
    const tokensToFetch = filtered.slice(0, 10);
    const period = 14;
    const interval = "minute";
    const now = new Date();
    const to = now.toISOString().slice(0, 19) + "Z";
    const from = new Date(now.getTime() - 60 * 1000 * (period + 2)).toISOString().slice(0, 19) + "Z";

    for (const inst of tokensToFetch) {
      try {
        const candles = await kc.getHistoricalData(inst.instrument_token, from, to, interval);
        const closes = candles.map(c => c[4]);
        const rsi = calculateRSI(closes, period);
        console.log(`RSI for ${inst.tradingsymbol} (${inst.instrument_token}):`, rsi);
      } catch (e) {
        console.error(`Error fetching RSI for ${inst.tradingsymbol}:`, e.message);
      }
    }
  } catch (err) {
    console.error("❌ Error in logRSIForFilteredTokens:", err.message);
  }
}

module.exports = { logRSIForFilteredTokens };
