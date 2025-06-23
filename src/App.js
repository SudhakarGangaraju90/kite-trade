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
  const [requestToken, setRequestToken] = useState(localStorage.getItem("kite_request_token") || "");
  const [liveTokens, setLiveTokens] = useState([]);
  const [instruments, setInstruments] = useState([]);
  const [bullishTokens, setBullishTokens] = useState([]);
  const [bearishTokens, setBearishTokens] = useState([]);

  useEffect(() => {
    let ws;
    let reconnectTimeout;
    function connectWS() {
      ws = new window.WebSocket("ws://localhost:5000");
      ws.onopen = () => {
        console.log('WebSocket connection opened');
      };
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "nifty500") {
            setInstruments(msg.data.instruments);
            setBullishTokens(msg.data.bullishTokens || []);
            setBearishTokens(msg.data.bearishTokens || []);
          } else {
            // RSI/Live tokens
            if (instruments.length === 0) return;
            const data = Array.isArray(msg) ? msg : msg.data;
            const updatedTokens = data.map(token => {
              const instrument = instruments.find(inst => String(inst.instrument_token) === String(token.instrument_token));
              return {
                ...token,
                name: instrument ? instrument.name : token.tradingsymbol,
                tradingsymbol: instrument ? instrument.tradingsymbol : token.tradingsymbol
              };
            });
            setLiveTokens(updatedTokens);
          }
        } catch (e) {}
      };
      ws.onerror = (err) => {
        console.error('WebSocket error:', err);
      };
      ws.onclose = (e) => {
        console.log('WebSocket closed', e);
        reconnectTimeout = setTimeout(connectWS, 2000);
      };
    }
    connectWS();
    return () => {
      if (ws) ws.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, [instruments]);

  const handleKiteLogin = () => {
    window.open("https://kite.trade/connect/login?api_key=r1a7qo9w30bxsfax", "_blank", "noopener,noreferrer");
  };

  const handleGetData = () => {
    fetch(`http://localhost:5000/api/nifty500`)
      .then(res => res.json())
      .then(data => {
        setProfile(data.profile);
        setInstruments(data.instruments);
        setBullishTokens(data.bullishTokens || []);
        setBearishTokens(data.bearishTokens || []);
      })
      .catch(err => console.error(err));
  };

  // Use liveTokens for display if available
  const tokensWithRSI = liveTokens;

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
      <main style={{ flex: 1, maxWidth: 1200, margin: "0 auto", padding: "2rem 2rem" }}>
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
        <div style={{ display: "flex", gap: "2rem", justifyContent: "center", alignItems: "flex-start" }}>
          {/* Bullish Table */}
          <div style={{ flex: 1, background: "#fff", borderRadius: 8, boxShadow: "0 2px 8px #0001", padding: "1.5rem" }}>
            <h2 style={{ color: "#22c55e", marginBottom: 16 }}>Bullish Tokens</h2>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.98rem" }}>
              <thead>
                <tr style={{ background: "#f1f5f9" }}>
                  <th style={{ padding: 8, borderBottom: "2px solid #e2e8f0" }}>Name</th>
                  <th style={{ padding: 8, borderBottom: "2px solid #e2e8f0" }}>RSI</th>
                  <th style={{ padding: 8, borderBottom: "2px solid #e2e8f0" }}>Chart Link</th>
                </tr>
              </thead>
              <tbody>
                {liveTokens
                  .filter(token =>
                    bullishTokens.some(b => String(b.instrument_token) === String(token.instrument_token))
                  )
                  .map(token => (
                    <tr key={token.instrument_token}>
                      <td style={{ padding: 8, borderBottom: "1px solid #e2e8f0" }}>{token.name}</td>
                      <td style={{ padding: 8, borderBottom: "1px solid #e2e8f0" }}>
                        {token.rsi !== undefined && token.rsi !== null ? token.rsi.toFixed(2) : "-"}
                      </td>
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
          {/* Bearish Table */}
          <div style={{ flex: 1, background: "#fff", borderRadius: 8, boxShadow: "0 2px 8px #0001", padding: "1.5rem" }}>
            <h2 style={{ color: "#dc2626", marginBottom: 16 }}>Bearish Tokens</h2>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.98rem" }}>
              <thead>
                <tr style={{ background: "#f1f5f9" }}>
                  <th style={{ padding: 8, borderBottom: "2px solid #e2e8f0" }}>Name</th>
                  <th style={{ padding: 8, borderBottom: "2px solid #e2e8f0" }}>RSI</th>
                  <th style={{ padding: 8, borderBottom: "2px solid #e2e8f0" }}>Chart Link</th>
                </tr>
              </thead>
              <tbody>
                {liveTokens
                  .filter(token =>
                    bearishTokens.some(b => String(b.instrument_token) === String(token.instrument_token))
                  )
                  .map(token => (
                    <tr key={token.instrument_token}>
                      <td style={{ padding: 8, borderBottom: "1px solid #e2e8f0" }}>{token.name}</td>
                      <td style={{ padding: 8, borderBottom: "1px solid #e2e8f0" }}>
                        {token.rsi !== undefined && token.rsi !== null ? token.rsi.toFixed(2) : "-"}
                      </td>
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
        {/* Tokens Table */}
        {/*<div style={{ display: "flex", justifyContent: "center", margin: "2rem 0" }}>
          <table style={{ width: "90%", borderCollapse: "separate", borderSpacing: 0, background: "#fff", borderRadius: 12, boxShadow: "0 2px 16px #0001", overflow: "hidden" }}>
            <thead>
              <tr style={{ background: "#f1f5f9" }}>
                <th style={{ textAlign: "left", color: "#2563eb", padding: 12, fontSize: 17, borderBottom: "2px solid #e2e8f0" }}>Name</th>
                <th style={{ textAlign: "left", color: "#2563eb", padding: 12, fontSize: 17, borderBottom: "2px solid #e2e8f0" }}>Close</th>
                <th style={{ textAlign: "left", color: "#2563eb", padding: 12, fontSize: 17, borderBottom: "2px solid #e2e8f0" }}>RSI</th>
                <th style={{ textAlign: "left", color: "#2563eb", padding: 12, fontSize: 17, borderBottom: "2px solid #e2e8f0" }}>Chart Link</th>
              </tr>
            </thead>
            <tbody>
              {tokensWithRSI.map((token, i) => (
                <tr key={token.instrument_token || i} style={{ background: i % 2 === 0 ? "#f9fafb" : "#fff", transition: "background 0.2s" }}>
                  <td style={{ padding: 12, fontWeight: 500 }}>{token.name}</td>
                  <td style={{ padding: 12 }}>{token.close}</td>
                  <td style={{ padding: 12, color: token.rsi >= 70 ? "#dc2626" : token.rsi <= 30 ? "#22c55e" : "#334155", fontWeight: 600 }}>{token.rsi !== undefined ? token.rsi.toFixed(2) : '-'}</td>
                  <td style={{ padding: 12 }}>
                    <a
                      href={`https://kite.zerodha.com/chart/ext/ciq/NSE/${token.tradingsymbol}/${token.instrument_token}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "#2563eb", textDecoration: "underline", fontWeight: 500 }}
                    >
                      View Chart
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>*/}
      </main>
    </div>
  );
}

export default App;
