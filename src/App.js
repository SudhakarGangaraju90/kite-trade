import logo from './logo.svg';
import './App.css';
import { KiteConnect } from "kiteconnect";
import { useEffect, useState } from "react";
import { BrowserRouter as Router, Route, Routes, useNavigate, useLocation } from "react-router-dom";

const KITE_API_KEY = "r1a7qo9w30bxsfax"; // Replace with your Kite API key
const KITE_ACCESS_TOKEN = "z6rpi8zrkqbngkopekewpo0rnfj9j0i6"; // Obtain via login flow

const kc = new KiteConnect({ api_key: KITE_API_KEY });
kc.setAccessToken(KITE_ACCESS_TOKEN);

function App() {
  const [profile, setProfile] = useState(null);
  const [bullishTokens, setBullishTokens] = useState([]);
  const [requestToken, setRequestToken] = useState(localStorage.getItem("kite_request_token") || "");

  const handleKiteLogin = () => {
    window.location.href = "https://kite.trade/connect/login?api_key=r1a7qo9w30bxsfax";
  };

  const handleGetData = () => {
    fetch(`http://localhost:5000/api/nifty500`)
      .then(res => res.json())
      .then(data => {
        setProfile(data.profile);
        setBullishTokens(data.instruments || []);
      })
      .catch(err => console.error(err));
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f4f6fb", fontFamily: "Segoe UI, Arial, sans-serif" }}>
      {/* Left Pane: Buttons */}
      <aside style={{
        width: 240,
        background: "#1e293b",
        padding: "2rem 1rem",
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        boxShadow: "2px 0 8px #0001"
      }}>
        <img src={logo} alt="logo" style={{ width: 60, height: 60, marginBottom: 24 }} />
        <h2 style={{ color: "#fff", marginBottom: 32, fontSize: 22 }}>Kite Nifty 500</h2>
        <button
          onClick={() => {
            window.open("https://kite.trade/connect/login?api_key=r1a7qo9w30bxsfax", "_blank", "noopener,noreferrer");
          }}
          style={{
            background: "#2563eb",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            padding: "0.7rem 1.5rem",
            fontSize: "1rem",
            marginBottom: 16,
            cursor: "pointer",
            width: "100%",
            boxShadow: "0 2px 8px #0001"
          }}
        >
          Kite Login
        </button>
        <button
          onClick={handleGetData}
          style={{
            background: "#22c55e",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            padding: "0.7rem 1.5rem",
            fontSize: "1rem",
            cursor: "pointer",
            width: "100%",
            boxShadow: "0 2px 8px #0001"
          }}
        >
          Get Data
        </button>
      </aside>
      {/* Main Content */}
      <main style={{ flex: 1, maxWidth: 900, margin: "0 auto", padding: "2rem 2rem" }}>
        {profile && (
          <div style={{
            background: "#fff",
            borderRadius: 8,
            boxShadow: "0 2px 8px #0001",
            padding: "1.5rem",
            marginBottom: "2rem"
          }}>
            <h2 style={{ color: "#2563eb", marginBottom: 8 }}>User Profile</h2>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>
                <tr>
                  <td style={{ fontWeight: "bold", padding: 6 }}>User Name</td>
                  <td style={{ padding: 6 }}>{profile.user_name}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: "bold", padding: 6 }}>User ID</td>
                  <td style={{ padding: 6 }}>{profile.user_id}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: "bold", padding: 6 }}>Email</td>
                  <td style={{ padding: 6 }}>{profile.email}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: "bold", padding: 6 }}>Broker</td>
                  <td style={{ padding: 6 }}>{profile.broker}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
        {Array.isArray(bullishTokens) && bullishTokens.length > 0 && (
          <div style={{
            background: "#fff",
            borderRadius: 8,
            boxShadow: "0 2px 8px #0001",
            padding: "1.5rem"
          }}>
           
            <h3 style={{ marginTop: 32, color: "#2563eb" }}>Bullish Tokens (Nifty 500 & Scan)</h3>
            <div style={{ overflowX: "auto" }}>
              <table style={{
                width: "100%",
                borderCollapse: "collapse",
                marginTop: 10,
                fontSize: "0.98rem"
              }}>
                <thead>
                  <tr style={{ background: "#f1f5f9" }}>
                    <th style={{textAlign:'left',  padding: 8, borderBottom: "2px solid #e2e8f0" }}>Name</th>
                    <th style={{ textAlign:'left', padding: 8, borderBottom: "2px solid #e2e8f0" }}>Chart Link</th>
                  </tr>
                </thead>
                <tbody>
                  {bullishTokens.map(token => (
                    <tr key={token.instrument_token}>
                      <td style={{ padding: 8, borderBottom: "1px solid #e2e8f0" }}>{token.name}- {token.instrument_token} - {token.close}</td>
                      <td style={{ padding: 8, borderBottom: "1px solid #e2e8f0" }}>
                        <a
                          href={`https://kite.zerodha.com/chart/ext/ciq/NSE/${token.tradingsymbol}/${token.instrument_token}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: "#2563eb", textDecoration: "underline" }}
                        >
                          View Chart
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
