import logo from './logo.svg';
import './App.css';
import { KiteConnect } from "kiteconnect";
import { useEffect, useState, useRef } from "react";

const KITE_API_KEY = "r1a7qo9w30bxsfax"; // Your Kite API key
const KITE_ACCESS_TOKEN = "z6rpi8zrkqbngkopekewpo0rnfj9j0i6"; // Your access token

const kc = new KiteConnect({ api_key: KITE_API_KEY });
kc.setAccessToken(KITE_ACCESS_TOKEN);

function App() {
  const [profile, setProfile] = useState(null);
  const [liveTokens, setLiveTokens] = useState([]);
  const [instruments, setInstruments] = useState([]);
  const [bullishTokens, setBullishTokens] = useState([]);
  const [bearishTokens, setBearishTokens] = useState([]);
  const wsRef = useRef(null);
  const reconnectRef = useRef(null);
  const chartWindowRefs = useRef({}); // To track opened chart windows

  useEffect(() => {
    const connectWS = () => {
      const ws = new WebSocket("ws://localhost:5000");
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("✅ WebSocket connected");
      };
      ws.onerror = (err) => {
        console.error("❌ WebSocket error:", err);
      };
      ws.onclose = () => {
        console.log("⚡️ WebSocket closed, reconnecting in 2s...");
        reconnectRef.current = setTimeout(connectWS, 2000);
      };
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          
          if (msg.type === "nifty500") {
            setInstruments(msg.data.instruments);
            setBullishTokens(msg.data.bullishTokens || []);
            setBearishTokens(msg.data.bearishTokens || []);
          } else {
            // RSI or Live Tokens
            if (!instruments.length) return;

            const data = Array.isArray(msg) ? msg : msg.data;

            const updatedTokens = data.map(token => {
              const instrument = instruments.find(
                inst => String(inst.instrument_token) === String(token.instrument_token)
              );
              return {
                ...token,
                name: instrument?.name || token.tradingsymbol,
                tradingsymbol: instrument?.tradingsymbol || token.tradingsymbol
              };
            });

            // --- Auto-open chart if order detected (BUY/SELL) ---
            updatedTokens.forEach(token => {
              // You must ensure your backend sends a property like token.hasOrder or token.orderType
              // Here, we check for a custom property 'orderPlaced' (boolean) or similar
              if (token.orderPlaced && !chartWindowRefs.current[token.instrument_token]) {
                const url = `https://kite.zerodha.com/chart/ext/ciq/NSE/${token.tradingsymbol}/${token.instrument_token}`;
                // Open chart in new window/tab (avoid popup blockers by using _blank)
                chartWindowRefs.current[token.instrument_token] = window.open(url, "_blank", "noopener,noreferrer");
              }
            });

            setLiveTokens(updatedTokens);
          }
        } catch (error) {
          console.error("❌ Failed to parse WebSocket message:", error);
        }
      };
    };
    connectWS();

    return () => {
      if (wsRef.current) wsRef.current.close();
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
    };
  }, [instruments.length]);

  const handleGetData = async () => {
    try {
      const res = await fetch("http://localhost:5000/api/nifty500");
      const data = await res.json();
      setProfile(data.profile);
      setInstruments(data.instruments);
      setBullishTokens(data.bullishTokens || []);
      setBearishTokens(data.bearishTokens || []);
    } catch (error) {
      console.error(error);
    }
  };
  
  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f4f6fb", fontFamily: "Segoe UI, Arial, sans-serif" }}>
      {/* Left Pane */}
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
          onClick={() => window.open("https://kite.trade/connect/login?api_key=r1a7qo9w30bxsfax", "_blank", "noopener,noreferrer")}
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
                <tr><td style={{ fontWeight: "bold", padding: 6 }}>User Name</td><td style={{ padding: 6 }}>{profile.user_name}</td></tr>
                <tr><td style={{ fontWeight: "bold", padding: 6 }}>User ID</td><td style={{ padding: 6 }}>{profile.user_id}</td></tr>
                <tr><td style={{ fontWeight: "bold", padding: 6 }}>Email</td><td style={{ padding: 6 }}>{profile.email}</td></tr>
                <tr><td style={{ fontWeight: "bold", padding: 6 }}>Broker</td><td style={{ padding: 6 }}>{profile.broker}</td></tr>
              </tbody>
            </table>
          </div>
        )}

        <div style={{ display: "flex", gap: "2rem", justifyContent: "center", alignItems: "flex-start" }}>
          {/* Bullish Tokens */}
          <div style={{
            flex: 1,
            background: "#fff",
            borderRadius: 8,
            boxShadow: "0 2px 8px #0001",
            padding: "1.5rem"
          }}>
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
                {liveTokens.filter(token =>
                  bullishTokens.some(b => String(b.instrument_token) === String(token.instrument_token))
                ).map(token => (
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

          {/* Bearish Tokens */}
          <div style={{
            flex: 1,
            background: "#fff",
            borderRadius: 8,
            boxShadow: "0 2px 8px #0001",
            padding: "1.5rem"
          }}>
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
                {liveTokens.filter(token =>
                  bearishTokens.some(b => String(b.instrument_token) === String(token.instrument_token))
                ).map(token => (
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
      </main>
    </div>
  );
}

export default App;
