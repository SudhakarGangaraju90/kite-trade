const fs = require("fs");
const path = require("path");

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
