const { KiteTicker } = require("kiteconnect");

const tokenCloses = {};
const tokenRsiState = {};
const tokenRSI = {};
let ticker = null;

let streamingTokens = [];
let tokens = [];
let lastFiltered = [];
let orderInProgress = false;

let bullishScanSet = new Set();
let bearishScanSet = new Set();
let tokenToSymbol = {};
const currentMinuteData = {};
const rsiActive = {};



/**
 * Returns formatted date (YYYY-MM-DD HH:mm:00).
 */
function toKiteFormat(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:00`;
}

/**
 * Initialize RSI by downloading at least 500 mins of data
 * (Previous Day + Today).
 */
async function initializeRsiWithHistoricalData(kc, tokens, period = 14) {
  const now = new Date();

  // Get prev trading day
  let prevDay = new Date();
  prevDay.setDate(prevDay.getDate() - 1);
  if (prevDay.getDay() === 0) prevDay.setDate(prevDay.getDate() - 2);
  if (prevDay.getDay() === 6) prevDay.setDate(prevDay.getDate() - 1);

  const prevFrom = new Date(prevDay.getFullYear(), prevDay.getMonth(), prevDay.getDate(), 9, 15, 0);
  const prevTo = new Date(prevDay.getFullYear(), prevDay.getMonth(), prevDay.getDate(), 15, 29, 0);
  const todayFrom = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 15, 0);
  const todayTo = now;

  for (const token of tokens) {
    try {
      const prevData = await kc.getHistoricalData(token, "minute", toKiteFormat(prevFrom), toKiteFormat(prevTo));
      const todayData = await kc.getHistoricalData(token, "minute", toKiteFormat(todayFrom), toKiteFormat(todayTo));

      const allData = [
        ...(prevData?.map(c => ({ timestamp: new Date(c.date).getTime(), close: c.close })) || []),
        ...(todayData?.map(c => ({ timestamp: new Date(c.date).getTime(), close: c.close })) || []),
      ];

      tokenCloses[token] = allData;

      if (allData.length >= period + 1) {
        let gains = 0,
            losses = 0;

        const closesArr = allData.map(c => c.close);
        for (let i = 1; i <= period; i++) {
          const diff = closesArr[i] - closesArr[i - 1];
          if (diff > 0) gains += diff;
          else losses -= diff;
        }

        let avgGain = gains / period;
        let avgLoss = losses / period;

        for (let i = period + 1; i < closesArr.length; i++) {
          const diff = closesArr[i] - closesArr[i - 1];
          const gain = diff > 0 ? diff : 0;
          const loss = diff < 0 ? -diff : 0;

          avgGain = ((avgGain * (period - 1)) + gain) / period;
          avgLoss = ((avgLoss * (period - 1)) + loss) / period;
        }

        const rs = avgLoss === 0 ? 0 : avgGain / avgLoss;
        const rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + rs);

        tokenRsiState[token] = {
          avgGain,
          avgLoss,
          lastRsi: rsi,
        };
        tokenRSI[token] = rsi;

      //  console.log(`✅ RSI initialized for ${tokenToSymbol[token]} (${token}) -> ${rsi.toFixed(2)}`);
      }
    } catch (e) {
      console.error(`Error initializing RSI for ${token}: ${e.message}`);
      tokenCloses[token] = [];
    }
  }
}

/**
 * Final RSI for new confirmed 1-minute candle.
 */
function finalizeRsiForToken(token, data) {
  if (!tokenRsiState[token]) return;

  const state = tokenRsiState[token];
  if (!tokenCloses[token]) tokenCloses[token] = [];

  const timestamp = new Date(data.hour, data.minute).getTime();
  tokenCloses[token].push({ timestamp, close: data.close });
  if (tokenCloses[token].length > 500) {
    tokenCloses[token].shift();
  }

  const closesArr = tokenCloses[token];
  const prevClose = closesArr[closesArr.length - 2]?.close;

  if (prevClose == null) {
    console.log(`⏳ Not enough data points for RSI for ${tokenToSymbol[token]}. Skipping...`);
    return;
  }

  const diff = data.close - prevClose;
  const gain = diff > 0 ? diff : 0;
  const loss = diff < 0 ? -diff : 0;

  state.avgGain = ((state.avgGain * (14 - 1)) + gain) / 14;
  state.avgLoss = ((state.avgLoss * (14 - 1)) + loss) / 14;

  const rs = state.avgLoss === 0 ? 0 : state.avgGain / state.avgLoss;
  const newRsi = state.avgLoss === 0 ? 100 : 100 - (100 / (1 + rs));
  state.lastRsi = newRsi;

  tokenRSI[token] = newRsi;

  //console.log(`✅ Final RSI for ${tokenToSymbol[token]} (${token}): ${newRsi.toFixed(2)}`);
}

/**
 * Placeholder for actual order placement.
 */
/**
 * Place or Exit an Order.
 * 
 * 1. If an open position for the token is found:
 *    - Check if target price is met -> Exit the position.
 * 2. If no open position:
 *    - Validate RSI and bullish/bearish scan constraints.
 *    - Place a new entry order.
 */
/**
 * Place an entry order if no position.
 * Place an exit order if position already exists.
 */
/**
 * Place order based on RSI and bullish/bearish sets.
 * Quantity = 1, Target Profit = +/- 3
 */
const entryPlaced = {};
const exitPlaced = {};
async function placeOrder(token, rsi, kc, tokenCloses) {
  const symbol = tokenToSymbol[token];
  if (!symbol) return;

  // ✅ Decide orderType based on RSI and scan sets
  let orderType = null;
  if (bullishScanSet.has(symbol) && rsi >= 67 && rsi <= 70) {
    orderType = "BUY";
  } else if (bearishScanSet.has(symbol) && rsi <= 36 && rsi >= 30) {
    orderType = "SELL";
  }

  // ✅ No signal, skip
  if (!orderType) return;

  const entryKey = `${token}_${orderType}`;
  const exitKey = `${token}_${orderType}`;

  // ✅ Check for any open MIS position (across all tokens)
  const positionsResp = await kc.getPositions();
  const intradayPositions = positionsResp.net.filter(pos => pos.product === "MIS" && pos.quantity !== 0);

  // If there are open positions, only place exit order for this token if needed, do not place new entry order
  const openPos = intradayPositions.find(pos => pos.tradingsymbol === symbol && pos.exchange === "NSE");
  if (intradayPositions.length > 0) {
    // If there is any open position, do NOT place a new entry order for any token
    // Only place exit order for this token if needed and not already placed
    if (openPos && !exitPlaced[exitKey]) {
      const qty = Math.abs(openPos.quantity);
      const lastClose = openPos.last_price || openPos.average_price;
      if (!lastClose) return;
      let exitPrice;
      if (openPos.quantity > 0) {
        // Long position, exit with SELL
        exitPrice = Math.round((lastClose + 3) * 100) / 100;
      } else {
        // Short position, exit with BUY
        exitPrice = Math.round((lastClose - 3) * 100) / 100;
      }
      
      try {
        await kc.placeOrder("regular", {
          exchange: openPos.exchange,
          tradingsymbol: openPos.tradingsymbol,
          transaction_type: openPos.quantity > 0 ? "SELL" : "BUY",
          quantity: qty,
          order_type: "LIMIT",
          price: exitPrice,
          product: "MIS",
          variety: "regular",
        });
        exitPlaced[exitKey] = true;
        console.log(`🎯 Exit order placed for ${symbol}, quantity ${qty}, target price ${exitPrice}`);
      } catch (exitErr) {
        console.error(`❌ Error placing exit order for ${symbol}: ${exitErr.message}`);
      }
    }
    // Do not place any new entry order while any MIS position is open
    return;
  }

  // ✅ Reset flags if position is closed
  entryPlaced[entryKey] = false;
  exitPlaced[exitKey] = false;

  // ✅ Skip if already placed
  if (entryPlaced[entryKey]) return;

  // ✅ Begin placing order
  if (!orderInProgress) {
    orderInProgress = true;

    try {
      const available = (await kc.getMargins()).equity.available.cash;
      const lastClose = tokenCloses[token]?.slice(-1)[0]?.close;

      if (!lastClose || available < lastClose) {
        orderInProgress = false;
        return;
      }

      // ✅ Quantity and Target Profit
      const quantity = 1;
      const exitPrice = orderType === "BUY"
        ? Math.round((lastClose + 3) * 100) / 100
        : Math.round((lastClose - 3) * 100) / 100;

      // ✅ Place Entry Order
      await kc.placeOrder("regular", {
        exchange: "NSE",
        tradingsymbol: symbol,
        transaction_type: orderType,
        quantity,
        order_type: "MARKET",
        product: "MIS",
        variety: "regular",
      });
      entryPlaced[entryKey] = true;

      // Mark token as bought for UI highlight
      global.boughtTokens = global.boughtTokens || {};
      if (orderType === "BUY") {
        global.boughtTokens[token] = true;
      } else if (orderType === "SELL") {
        global.boughtTokens[token] = false;
      }

      console.log(`✅ ${orderType} order placed for ${symbol}, quantity ${quantity}, entry price ${lastClose}`);

      // ✅ Place Exit Order only if not already placed
      if (!exitPlaced[exitKey]) {
        await kc.placeOrder("regular", {
          exchange: "NSE",
          tradingsymbol: symbol,
          transaction_type: orderType === "BUY" ? "SELL" : "BUY",
          quantity,
          order_type: "LIMIT",
          price: exitPrice,
          product: "MIS",
          variety: "regular",
        });
        exitPlaced[exitKey] = true;
        console.log(`🎯 Exit order placed for ${symbol}, quantity ${quantity}, target price ${exitPrice}`);
      }
    } catch (err) {
      console.error(`❌ Error placing ${orderType} order for ${symbol}: ${err.message}`);
    } finally {
      orderInProgress = false;
    }
  }
}





/**
 * Main setup for Ticker.
 */
async function setupTickerWithFiltered(filtered, apiKey, accessToken, kc) {
  const { loadBullishScanSymbols, loadBearishScanSymbols } = require('./utils');

  bullishScanSet = new Set(Array.from(await loadBullishScanSymbols(), s => s.toUpperCase()));
  bearishScanSet = new Set(Array.from(await loadBearishScanSymbols(), s => s.toUpperCase()));
  const scanSymbols = new Set([...bullishScanSet, ...bearishScanSet]);

  const mergedFiltered = filtered.filter(inst =>
    scanSymbols.has(inst.tradingsymbol.toUpperCase())
  );
  tokens = mergedFiltered.map(inst => Number(inst.instrument_token));
  lastFiltered = mergedFiltered;

  tokenToSymbol = {};
  mergedFiltered.forEach(inst => {
    tokenToSymbol[inst.instrument_token] = inst.tradingsymbol;
  });

  await initializeRsiWithHistoricalData(kc, tokens, 14);

  if (ticker) {
    try {
      // Fix: Only call removeAllListeners if it exists (KiteTicker >= 4.x)
      if (typeof ticker.removeAllListeners === "function") {
        ticker.removeAllListeners();
      }
      ticker.disconnect();
    } catch (err) {
      console.warn("Ticker cleanup error:", err.message);
    }
    ticker = null;
  }

  ticker = new KiteTicker({ api_key: apiKey, access_token: accessToken });
  streamingTokens = tokens;
  setupTickerHandlers.kc = () => kc;
  setupTickerHandlers();
  setImmediate(() => ticker.connect());
}
function startRsiInterval() {
  setInterval(() => {
    const now = new Date();
    const nowIST = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));

    for (const token of Object.keys(currentMinuteData)) {
      const data = currentMinuteData[token];
      if (!data) continue;

      // Finalize RSI for the LAST minute
      finalizeRsiForToken(token, data);
    }
  }, 60_000);
}


function setupTickerHandlers() {
  ticker.on("connect", () => {
    if (streamingTokens.length > 0) {
      ticker.subscribe(streamingTokens);
      ticker.setMode(ticker.modeFull, streamingTokens);
      console.log("✅ Ticker connected and subscribed:", streamingTokens.length);
    }
    startRsiInterval(); // ✅ START RSI CALCULATION EVERY MINUTE
  });

  ticker.on("ticks", (ticks) => {
  const now = new Date();
  const nowIST = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));

  ticks.forEach((tick) => {
    const token = tick.instrument_token;

    // Maintain latest price
    const minute = nowIST.getMinutes();
    const hour = nowIST.getHours();

    if (!currentMinuteData[token]) {
      currentMinuteData[token] = { hour, minute, close: tick.last_price };
    } else {
      currentMinuteData[token].close = tick.last_price;
    }

    // ✅ NEW: LIVE RSI CALCULATION
    if (tokenRsiState[token]) {
      const state = tokenRsiState[token];
      const closesArr = tokenCloses[token];
      if (!closesArr || closesArr.length < 2) return;

      const prevClose = closesArr[closesArr.length - 1]?.close;

      if (prevClose != null) {
        const diff = tick.last_price - prevClose;
        const gain = diff > 0 ? diff : 0;
        const loss = diff < 0 ? -diff : 0;

        // Temporary RSI using CURRENT tick
        const avgGainLive = ((state.avgGain * (14 - 1)) + gain) / 14;
        const avgLossLive = ((state.avgLoss * (14 - 1)) + loss) / 14;

        const rsLive = avgLossLive === 0 ? 0 : avgGainLive / avgLossLive;
        const rsiLive = avgLossLive === 0 ? 100 : 100 - (100 / (1 + rsLive));

        tokenRSI[token] = rsiLive;

        // ✅ DECISION: Call only one placeOrder
        if (typeof setupTickerHandlers.kc === "function") {
          const kcInstance = setupTickerHandlers.kc();
          
         // if (rsiLive > 67) {
            placeOrder(token, rsiLive, kcInstance, tokenCloses);
         // } else if (rsiLive < 36) {
          //  placeOrder(token, rsiLive, kcInstance, tokenCloses, "SELL");
         // }
        }

        // 👉 Send RSI data to WS listeners as before
        if (typeof global.rsiTickListeners === "undefined") global.rsiTickListeners = [];
        if (global.rsiTickListeners.length > 0) {
          const lastFilteredMap = (lastFiltered || []).reduce((acc, inst) => {
            acc[inst.instrument_token] = inst;
            return acc;
          }, {});
          const rsiData = Object.keys(tokenRSI).map(tokenKey => {
            const inst = lastFilteredMap[tokenKey];
            let tradingsymbol = inst ? inst.tradingsymbol : tokenKey;
            let name = inst ? inst.name : tradingsymbol;
            const closes = inst && inst.instrument_token && tokenCloses[inst.instrument_token]?.map(c => c.close) || [];
            return {
              instrument_token: tokenKey,
              tradingsymbol,
              name,
              close: closes.length ? closes[closes.length - 1] : null,
              rsi: tokenRSI[tokenKey] ?? null
            };
          });
          global.rsiTickListeners.forEach(fn => fn(rsiData));
        }
      }
    }
  });
});



  ticker.on("error", (err) => {
    if (!err.message?.includes("WebSocket was closed before the connection was established")) {
      console.error("❌ Ticker error:", err.message);
    } else {
      console.warn("Ticker warning:", err.message);
    }
  });
}

// Add this at the end of the file to allow WS to register listeners
function onRsiTickUpdate(listener) {
  if (typeof global.rsiTickListeners === "undefined") global.rsiTickListeners = [];
  global.rsiTickListeners.push(listener);
}

module.exports = {
  setupTickerWithFiltered,
  tokenCloses,
  streamingTokens,
  tokens,
  tokenRsiState,
  tokenRSI,
  lastFiltered,
  bullishScanSet,
  bearishScanSet,
  onRsiTickUpdate
};
