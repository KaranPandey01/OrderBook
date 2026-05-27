import { useState } from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:8080";

export default function AuthPage({ onAuth }) {
    const [mode, setMode] = useState("login");
    const [form, setForm] = useState({ username: "", email: "", password: "" });
    const [err, setErr] = useState(null);
    const [loading, setLoading] = useState(false);

    async function submit(e) {
        e.preventDefault();
        setErr(null);
        setLoading(true);
        try {
            const endpoint = mode === "login" ? "/auth/login" : "/auth/signup";
            const body = mode === "login"
                ? { username: form.username, password: form.password }
                : { username: form.username, email: form.email, password: form.password };
            const r = await fetch(`${API}${endpoint}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body)
            });
            const data = await r.json();
            if (!r.ok) { setErr(data.detail || "something went wrong"); return; }
            onAuth(data.access_token, data.username);
        } catch {
            setErr("cannot reach API — is uvicorn running on :8080?");
        } finally {
            setLoading(false);
        }
    }

    const inp = {
        width: "100%", padding: "10px 12px", background: "#08080f",
        border: "1px solid #181828", borderRadius: 6, color: "#d0d0f0",
        fontSize: 12, fontFamily: "inherit", boxSizing: "border-box", outline: "none"
    };

    return (
        <div style={{ minHeight: "100vh", background: "#070710", fontFamily: "'IBM Plex Mono', monospace", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />
            <div style={{ width: "100%", maxWidth: 400, padding: "0 20px" }}>
                <div style={{ textAlign: "center", marginBottom: 32 }}>
                    <div style={{ fontSize: 28, fontWeight: 700, color: "#d0d0f0", marginBottom: 6 }}>◈ ORDERBOOK</div>
                    <div style={{ fontSize: 11, color: "#3a3a6a", letterSpacing: "0.1em" }}>C++ LIMIT ORDER BOOK ENGINE</div>
                </div>
                <div style={{ background: "#0b0b16", border: "1px solid #181828", borderRadius: 12, overflow: "hidden" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
                        {["login", "signup"].map(m => (
                            <button key={m} onClick={() => { setMode(m); setErr(null); }} style={{
                                padding: "12px", background: mode === m ? "#0f0f20" : "transparent",
                                border: "none", borderBottom: `2px solid ${mode === m ? "#5a5acc" : "#181828"}`,
                                color: mode === m ? "#a0a0e0" : "#3a3a6a",
                                fontSize: 10, fontFamily: "inherit", cursor: "pointer",
                                fontWeight: mode === m ? 700 : 400, letterSpacing: "0.12em",
                                textTransform: "uppercase", transition: "all 0.15s"
                            }}>{m}</button>
                        ))}
                    </div>
                    <form onSubmit={submit} style={{ padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
                        <div>
                            <div style={{ fontSize: 9, color: "#3a3a6a", letterSpacing: "0.12em", marginBottom: 6 }}>USERNAME</div>
                            <input value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} placeholder="your_username" style={inp} />
                        </div>
                        {mode === "signup" && (
                            <div>
                                <div style={{ fontSize: 9, color: "#3a3a6a", letterSpacing: "0.12em", marginBottom: 6 }}>EMAIL</div>
                                <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="you@example.com" style={inp} />
                            </div>
                        )}
                        <div>
                            <div style={{ fontSize: 9, color: "#3a3a6a", letterSpacing: "0.12em", marginBottom: 6 }}>PASSWORD</div>
                            <input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder={mode === "signup" ? "min 6 characters" : "••••••••"} style={inp} />
                        </div>
                        {err && (
                            <div style={{ background: "#180808", border: "1px solid #3a1818", borderRadius: 6, padding: "10px 12px", fontSize: 11, color: "#c04040" }}>
                                ✕ {err}
                            </div>
                        )}
                        <button type="submit" disabled={loading} style={{
                            padding: 12, background: "#0f0f24", border: "1px solid #3a3a7a", borderRadius: 6,
                            color: loading ? "#3a3a6a" : "#8080cc", fontSize: 11, fontFamily: "inherit",
                            cursor: loading ? "not-allowed" : "pointer", fontWeight: 700, letterSpacing: "0.1em", marginTop: 4
                        }}>
                            {loading ? "..." : mode === "login" ? "ENTER THE BOOK →" : "CREATE ACCOUNT →"}
                        </button>
                        <div style={{ fontSize: 10, color: "#2a2a5a", textAlign: "center" }}>
                            {mode === "login"
                                ? <span>no account? <span onClick={() => setMode("signup")} style={{ color: "#5a5a9a", cursor: "pointer" }}>sign up</span></span>
                                : <span>already registered? <span onClick={() => setMode("login")} style={{ color: "#5a5a9a", cursor: "pointer" }}>log in</span></span>
                            }
                        </div>
                    </form>
                </div>
                <div style={{ textAlign: "center", marginTop: 20, fontSize: 9, color: "#1e1e3a", lineHeight: 1.8 }}>
                    JWT auth · bcrypt passwords · SQLite · FastAPI · C++ engine
                </div>
            </div>
        </div>
    );
}