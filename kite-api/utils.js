const fs = require("fs");
const csv = require("csv-parser");
const path = require("path");


 const loadNifty500Symbols = () => {
   return new Promise((resolve, reject) => {
     const symbols = new Set();
     fs.createReadStream("./nifty500.csv")
       .pipe(csv())
       .on("data", (row) => {
         if (row.Symbol) {
           symbols.add(row.Symbol.trim().toUpperCase());
         }
       })
       .on("end", () => {
         console.log("✅ Loaded", symbols.size, "symbols from CSV");
         resolve(symbols);
       })
       .on("error", (err) => {
         console.error("❌ CSV Load Error:", err.message);
         reject(err);
       });
   });
 };


function getLatestBullishScanFile() {
  const files = fs.readdirSync(__dirname)
    .filter(f => /^bullish scan_ScanResults.*\.csv$/i.test(f))
    .map(f => ({ name: f, time: fs.statSync(path.join(__dirname, f)).mtime.getTime() }))
    .sort((a, b) => b.time - a.time);
  return files.length > 0 ? path.join(__dirname, files[0].name) : null;
}


function loadBullishScanSymbols() {
  return new Promise((resolve, reject) => {
    const latestFile = getLatestBullishScanFile();
    if (!latestFile) return resolve(null);

    const symbols = new Set();
    fs.createReadStream(latestFile)
      .pipe(csv())
      .on("data", (row) => {
        if (row.Symbol) {
          symbols.add(row.Symbol.trim().toUpperCase());
        }
      })
      .on("end", () => resolve(symbols))
      .on("error", reject);
  });
}

function calculateRSI(closes, period = 14) {
  if (closes.length < period + 1) return null;
  let gains = 0, losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  if (avgLoss === 0) return 100;

  let rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

module.exports = {
  loadNifty500Symbols,
  getLatestBullishScanFile,
  loadBullishScanSymbols,
  calculateRSI,
};
