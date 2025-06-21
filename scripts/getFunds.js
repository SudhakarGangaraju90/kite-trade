const { KiteConnect } = require("kiteconnect");

// Replace with your actual API key and access token
const apiKey = "your_api_key";
const accessToken = "your_access_token";

const kc = new KiteConnect({ api_key: apiKey });
kc.setAccessToken(accessToken);

kc.getMargins()
  .then(margins => {
    // This will show your funds and margin details
    console.log("Funds/Margins:", margins);
  })
  .catch(err => {
    console.error("Error fetching funds:", err.message);
  });