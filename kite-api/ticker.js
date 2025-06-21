const { KiteTicker } = require("kiteconnect");

const tokenCloses = {};
const tokenRsiState = {};
const tokenRSI = {};
let ticker = null;
let streamingTokens = [];
let lastFiltered = [];

// Maintain in-memory current 1-minute candle data
const currentMinuteData = {};

/**
 * Returns formatted date (YYYY-MM-DD HH:mm:00).
 */
function toKiteFormat(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:00`;
}

/**
 * RSI fetch using historical data.
 */
async function fetchHistoricalCloses(kc, tokens, period = 14) {
  const now = new Date();
  let prevDay = new Date();
  prevDay.setDate(prevDay.getDate() - 1);
  if (prevDay.getDay() === 0) prevDay.setDate(prevDay.getDate() - 2);
  if (prevDay.getDay() === 6) prevDay.setDate(prevDay.getDate() - 1);

  const from = new Date(prevDay.getFullYear(), prevDay.getMonth(), prevDay.getDate(), 9, 15, 0);
  const to = new Date(prevDay.getFullYear(), prevDay.getMonth(), prevDay.getDate(), 15, 29, 0);
  const fromStr = toKiteFormat(from);
  const toStr = toKiteFormat(to);

  for (const token of tokens) {
    try {
      console.log(`Fetching prev day minute data for ${token}: ${fromStr} to ${toStr}`);
      const candles = await kc.getHistoricalData(token, "minute", fromStr, toStr);
      let closes = candles.map(c => ({ timestamp: new Date(c.date).getTime(), close: c.close }));

      tokenCloses[token] = closes;

      if (closes.length >= period + 1) {
        let gains = 0, losses = 0;
        const closesArr = closes.map(c => c.close);
        for (let i = 1; i <= period; i++) {
          const diff = closesArr[i] - closesArr[i - 1];
          if (diff > 0) gains += diff;
          else losses -= diff;
        }
        let avgGain = gains / period;
        let avgLoss = losses / period;

        let rs = avgLoss === 0 ? 0 : avgGain / avgLoss;
        let rsi = avgLoss === 0 ? 100 : 100 - (100 / (1 + rs));

        for (let i = period + 1; i < closesArr.length; i++) {
          const diff = closesArr[i] - closesArr[i - 1];
          const gain = diff > 0 ? diff : 0;
          const loss = diff < 0 ? -diff : 0;

          avgGain = ((avgGain * (period - 1)) + gain) / period;
          avgLoss = ((avgLoss * (period - 1)) + loss) / period;

          rs = avgLoss === 0 ? 0 : avgGain / avgLoss;
          rsi = avgLoss === 0 ? 100 : 100 - (100 / (1 + rs));
        }

        tokenRsiState[token] = {
          avgGain,
          avgLoss,
          lastRsi: rsi,
        };
        tokenRSI[token] = rsi;

        console.log(`Previous day RSI for ${token}: ${rsi}`);
      }
    } catch (e) {
      tokenCloses[token] = [];
      console.error(`Error fetching prev day data for ${token}: ${e.message}`);
    }
  }
}

async function setupTickerWithFiltered(filtered, apiKey, accessToken, kc) {
  const tokens = filtered.map(inst => Number(inst.instrument_token));
  lastFiltered = filtered;
  streamingTokens = tokens;

  await fetchHistoricalCloses(kc, tokens, 14);

  if (ticker) {
    ticker.disconnect();
    ticker = null;
  }

  ticker = new KiteTicker({ api_key: apiKey, access_token: accessToken });
  ticker.on("connect", () => {
    ticker.subscribe(tokens);
    ticker.setMode(ticker.modeFull, tokens);
    console.log("✅ Ticker connected and subscribed to tokens:", tokens.length);
  });

  ticker.on("ticks", (ticks) => {
    const now = new Date();
    const nowIST = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));

    ticks.forEach(tick => {
      const token = tick.instrument_token;

      // Aggregate ticks into 1-minute closes
      const minute = nowIST.getMinutes();
      const hour = nowIST.getHours();
      const key = `${token}_${hour}_${minute}`;

      if (!currentMinuteData[token]) {
        currentMinuteData[token] = { hour, minute, close: tick.last_price };
      } else {
        // Always keep updating the latest close
        currentMinuteData[token].close = tick.last_price;
      }

      // At end of the minute, finalize
      if (nowIST.getSeconds() === 59) {
        const data = currentMinuteData[token];
        if (data && data.hour === hour && data.minute === minute) {
          // Finalize this minute's close
          if (!tokenCloses[token]) tokenCloses[token] = [];
          
          const timestamp = nowIST.getTime();
          
          // Push this 1-minute close
          tokenCloses[token].push({ timestamp, close: data.close });
          
          if (tokenCloses[token].length > 500) {
            tokenCloses[token].shift();
          }

          // RSI calculation
          if (tokenRsiState[token]) {
            const state = tokenRsiState[token];
            const closesArr = tokenCloses[token];
            const prevClose = closesArr[closesArr.length - 2]?.close;

            if (prevClose != null) {
              const diff = data.close - prevClose;
              const gain = diff > 0 ? diff : 0;
              const loss = diff < 0 ? -diff : 0;

              state.avgGain = ((state.avgGain * (14 - 1)) + gain) / 14;
              state.avgLoss = ((state.avgLoss * (14 - 1)) + loss) / 14;

              const rs = state.avgLoss === 0 ? 0 : state.avgGain / state.avgLoss;
              const newRsi = state.avgLoss === 0 ? 100 : 100 - (100 / (1 + rs));

              state.lastRsi = newRsi;
              tokenRSI[token] = newRsi;

              console.log(`Updated RSI for ${token} at ${hour}:${minute}: ${newRsi}`);
            }
          }
        }
      }
    });
  });

  ticker.on("error", (err) => {
    console.error("❌ Ticker error:", err.message);
  });

  ticker.connect();
}

module.exports = {
  setupTickerWithFiltered,
  tokenCloses,
  streamingTokens,
  tokenRsiState,
  tokenRSI,
};
