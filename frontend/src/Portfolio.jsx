import { useEffect, useState } from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:8080";

function fmt(n) {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(n);
}

export default function Portfolio({ token, username, onBack }) {
    const [data, setData] = useState(null);
    const [depositAmt, setDepositAmt] = useState("");
    const [withdrawAmt, setWithdrawAmt] = useState("");
    const [msg, setMsg] = useState(null);
    const [loading, setLoading] = useState(false);
    const [tab, setTab] = useState("overview");

    const authHdr = { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" };

    async function loadPortfolio() {
        const r = await fetch(`${API}/portfolio`, { headers: authHdr });
        if (r.ok) setData(await r.json());
    }

    useEffect(() => {
        loadPortfolio();
        const iv = setInterval(loadPortfolio, 3000);
        return () => clearInterval(iv);
    }, []);

    async function deposit() {
        const amt = parseFloat(depositAmt);
        if (!amt || amt <= 0) return;
        setLoading(true);
        try {
            const r = await fetch(`${API}/portfolio/deposit`, {
                method: "POST", headers: authHdr,
                body: JSON.stringify({ amount: amt })
            });
            const d = await r.json();
            if (!r.ok) { setMsg({ text: d.detail, ok: false }); return; }
            setMsg({ text: `₹${amt.toLocaleString("en-IN")} deposited successfully`, ok: true });
            setDepositAmt("");
            loadPortfolio();
        } catch { setMsg({ text: "deposit failed", ok: false }); }
        finally { setLoading(false); setTimeout(() => setMsg(null), 3000); }
    }

    async function withdraw() {
        const amt = parseFloat(withdrawAmt);
        if (!amt || amt <= 0) return;
        setLoading(true);
        try {
            const r = await fetch(`${API}/portfolio/withdraw`, {
                method: "POST", headers: authHdr,
                body: JSON.stringify({ amount: amt })
            });
            const d = await r.json();
            if (!r.ok) { setMsg({ text: d.detail, ok: false }); return; }
            setMsg({ text: `₹${amt.toLocaleString("en-IN")} withdrawn`, ok: true });
            setWithdrawAmt("");
            loadPortfolio();
        } catch { setMsg({ text: "withdrawal failed", ok: false }); }
        finally { setLoading(false); setTimeout(() => setMsg(null), 3000); }
    }

    const presets = [1000, 5000, 10000, 25000, 50000, 100000];

    const pnl = data ? data.total_value - data.total_deposited : 0;
    const pnlPct = data && data.total_deposited > 0 ? (pnl / data.total_deposited) * 100 : 0;

    const s = {
        page: { minHeight: "100vh", background: "#070710", fontFamily: "'IBM Plex Mono', monospace", color: "#c0c0e0" },
        header: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 24px", borderBottom: "1px solid #141424", background: "#06060e" },
        card: { background: "#0b0b16", border: "1px solid #181828", borderRadius: 10, padding: 20 },
        label: { fontSize: 9, color: "#3a3a5a", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4 },
        val: { fontSize: 22, fontWeight: 700, fontFamily: "monospace" },
        inp: { width: "100%", padding: "10px 12px", background: "#08080f", border: "1px solid #181828", borderRadius: 6, color: "#d0d0f0", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box", outline: "none" },
        btn: (color) => ({ padding: "10px 20px", background: color === "green" ? "#081810" : "#180808", border: `1px solid ${color === "green" ? "#2a8a5a" : "#c04040"}`, borderRadius: 6, color: color === "green" ? "#2a8a5a" : "#c04040", fontSize: 11, fontFamily: "inherit", cursor: "pointer", fontWeight: 700, width: "100%" }),
        tab: (active) => ({ padding: "8px 20px", background: "none", border: "none", borderBottom: `2px solid ${active ? "#5a5acc" : "transparent"}`, color: active ? "#a0a0e0" : "#3a3a6a", fontSize: 9, fontFamily: "inherit", cursor: "pointer", letterSpacing: "0.12em", fontWeight: active ? 700 : 400 }),
    };

    return (
        <div style={s.page}>
            <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />

            <div style={s.header}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <button onClick={onBack} style={{ background: "none", border: "1px solid #1e1e2e", borderRadius: 4, color: "#5a5a8a", fontSize: 11, fontFamily: "inherit", cursor: "pointer", padding: "4px 10px" }}>← back</button>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#d0d0f0" }}>◈ PORTFOLIO</span>
                    <span style={{ background: "#111124", border: "1px solid #1e1e34", borderRadius: 4, padding: "2px 8px", fontSize: 10, color: "#5a5a8a" }}>@{username}</span>
                </div>
                {msg && (
                    <div style={{ fontSize: 11, color: msg.ok ? "#2a8a5a" : "#c04040", padding: "4px 12px", background: "#0a0a18", border: `1px solid ${msg.ok ? "#1a4a2a" : "#4a1a1a"}`, borderRadius: 4 }}>
                        {msg.text}
                    </div>
                )}
            </div>

            <div style={{ padding: 24 }}>
                {!data ? (
                    <div style={{ textAlign: "center", padding: 60, color: "#2a2a4a" }}>loading portfolio...</div>
                ) : (
                    <>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 24 }}>
                            {[
                                { label: "Total Portfolio Value", val: fmt(data.total_value), color: "#d0d0f0" },
                                { label: "Cash Balance", val: fmt(data.cash_balance), color: "#2a8a5a" },
                                { label: "Invested", val: fmt(data.invested_value), color: "#8080c0" },
                                { label: "Total Deposited", val: fmt(data.total_deposited), color: "#6060a0" },
                                { label: "Total P&L", val: `${pnl >= 0 ? "+" : ""}${fmt(pnl)}`, color: pnl >= 0 ? "#2a8a5a" : "#c04040" },
                                { label: "Returns", val: `${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(2)}%`, color: pnlPct >= 0 ? "#2a8a5a" : "#c04040" },
                            ].map(({ label, val, color }) => (
                                <div key={label} style={s.card}>
                                    <div style={s.label}>{label}</div>
                                    <div style={{ ...s.val, color, fontSize: 18 }}>{val}</div>
                                </div>
                            ))}
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>

                            <div style={s.card}>
                                <div style={{ fontSize: 11, fontWeight: 700, color: "#3a3a6a", letterSpacing: "0.12em", marginBottom: 16 }}>ADD FUNDS</div>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
                                    {presets.map(p => (
                                        <button key={p} onClick={() => setDepositAmt(String(p))} style={{
                                            padding: "4px 10px", background: depositAmt === String(p) ? "#0a1e12" : "#0a0a18",
                                            border: `1px solid ${depositAmt === String(p) ? "#2a8a5a" : "#181828"}`,
                                            borderRadius: 4, color: depositAmt === String(p) ? "#2a8a5a" : "#4a4a7a",
                                            fontSize: 10, fontFamily: "inherit", cursor: "pointer"
                                        }}>₹{(p / 1000).toFixed(0)}K</button>
                                    ))}
                                </div>
                                <input type="number" value={depositAmt} onChange={e => setDepositAmt(e.target.value)}
                                    placeholder="or enter custom amount" style={{ ...s.inp, marginBottom: 10 }} />
                                {depositAmt && (
                                    <div style={{ fontSize: 10, color: "#3a3a5a", marginBottom: 10 }}>
                                        depositing {fmt(parseFloat(depositAmt) || 0)}
                                    </div>
                                )}
                                <button onClick={deposit} disabled={loading || !depositAmt} style={s.btn("green")}>
                                    + ADD FUNDS
                                </button>
                            </div>

                            <div style={s.card}>
                                <div style={{ fontSize: 11, fontWeight: 700, color: "#3a3a6a", letterSpacing: "0.12em", marginBottom: 16 }}>WITHDRAW FUNDS</div>
                                <div style={{ background: "#08080f", border: "1px solid #141424", borderRadius: 6, padding: "10px 12px", marginBottom: 14 }}>
                                    <div style={{ fontSize: 9, color: "#3a3a5a", marginBottom: 2 }}>AVAILABLE TO WITHDRAW</div>
                                    <div style={{ fontSize: 18, fontWeight: 700, color: "#2a8a5a" }}>{fmt(data.cash_balance)}</div>
                                </div>
                                <input type="number" value={withdrawAmt} onChange={e => setWithdrawAmt(e.target.value)}
                                    placeholder="amount to withdraw" style={{ ...s.inp, marginBottom: 10 }} />
                                {withdrawAmt && (
                                    <div style={{ fontSize: 10, color: parseFloat(withdrawAmt) > data.cash_balance ? "#c04040" : "#3a3a5a", marginBottom: 10 }}>
                                        {parseFloat(withdrawAmt) > data.cash_balance ? "⚠ exceeds available balance" : `withdrawing ${fmt(parseFloat(withdrawAmt) || 0)}`}
                                    </div>
                                )}
                                <button onClick={withdraw} disabled={loading || !withdrawAmt || parseFloat(withdrawAmt) > data.cash_balance} style={s.btn("red")}>
                                    - WITHDRAW
                                </button>
                            </div>

                            <div style={s.card}>
                                <div style={{ fontSize: 11, fontWeight: 700, color: "#3a3a6a", letterSpacing: "0.12em", marginBottom: 16 }}>HOLDINGS</div>
                                {data.holdings.length === 0 ? (
                                    <div style={{ fontSize: 10, color: "#2a2a4a", textAlign: "center", padding: "20px 0" }}>no positions — buy some stocks</div>
                                ) : (
                                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                        {data.holdings.map(h => (
                                            <div key={h.symbol} style={{ background: "#08080f", border: "1px solid #141424", borderRadius: 6, padding: "10px 12px" }}>
                                                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                                                    <span style={{ fontSize: 12, fontWeight: 700, color: "#8080cc" }}>{h.symbol}</span>
                                                    <span style={{ fontSize: 11, color: "#d0d0f0" }}>{h.qty} shares</span>
                                                </div>
                                                <div style={{ display: "flex", justifyContent: "space-between" }}>
                                                    <span style={{ fontSize: 10, color: "#3a3a5a" }}>avg {fmt(h.avg_px)}</span>
                                                    <span style={{ fontSize: 10, color: "#6060a0" }}>{fmt(h.qty * h.avg_px)}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div style={{ ...s.card, marginTop: 16 }}>
                            <div style={{ display: "flex", borderBottom: "1px solid #181828", marginBottom: 14 }}>
                                {["overview", "deposits", "trades"].map(t => (
                                    <button key={t} onClick={() => setTab(t)} style={s.tab(tab === t)}>{t.toUpperCase()}</button>
                                ))}
                            </div>

                            {tab === "overview" && (
                                <div>
                                    <div style={{ fontSize: 9, color: "#3a3a5a", marginBottom: 12 }}>RECENT TRANSACTIONS</div>
                                    {data.transactions.length === 0 ? (
                                        <div style={{ fontSize: 10, color: "#2a2a4a", textAlign: "center", padding: 20 }}>no transactions yet</div>
                                    ) : (
                                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                                            <thead>
                                                <tr>{["TYPE", "AMOUNT", "DESCRIPTION", "BALANCE AFTER", "TIME"].map(h => (
                                                    <td key={h} style={{ padding: "4px 10px", borderBottom: "1px solid #111120", fontSize: 9, color: "#3a3a5a" }}>{h}</td>
                                                ))}</tr>
                                            </thead>
                                            <tbody>
                                                {data.transactions.map((t, i) => (
                                                    <tr key={i} style={{ borderBottom: "1px solid #0e0e1c" }}>
                                                        <td style={{ padding: "8px 10px" }}>
                                                            <span style={{
                                                                padding: "2px 6px", borderRadius: 3, fontSize: 9, fontWeight: 700,
                                                                background: t.txn_type === "DEPOSIT" ? "#0a1e12" : t.txn_type === "WITHDRAW" ? "#1e0a0a" : t.txn_type === "BUY" ? "#0a0a1e" : "#0a1a12",
                                                                color: t.txn_type === "DEPOSIT" ? "#2a8a5a" : t.txn_type === "WITHDRAW" ? "#c04040" : t.txn_type === "BUY" ? "#6060cc" : "#2a9a6a",
                                                            }}>{t.txn_type}</span>
                                                        </td>
                                                        <td style={{ padding: "8px 10px", color: t.txn_type === "BUY" || t.txn_type === "WITHDRAW" ? "#c04040" : "#2a8a5a", fontWeight: 700 }}>
                                                            {t.txn_type === "BUY" || t.txn_type === "WITHDRAW" ? "-" : "+"}{fmt(t.amount)}
                                                        </td>
                                                        <td style={{ padding: "8px 10px", color: "#5a5a8a", fontSize: 10 }}>{t.description}</td>
                                                        <td style={{ padding: "8px 10px", color: "#8080b0" }}>{fmt(t.balance_after)}</td>
                                                        <td style={{ padding: "8px 10px", color: "#2a2a4a", fontSize: 9 }}>{t.created_at?.slice(0, 16).replace("T", " ")}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                            )}

                            {tab === "deposits" && (
                                <div>
                                    <div style={{ fontSize: 9, color: "#3a3a5a", marginBottom: 12 }}>DEPOSIT / WITHDRAWAL HISTORY</div>
                                    {data.transactions.filter(t => t.txn_type === "DEPOSIT" || t.txn_type === "WITHDRAW").length === 0 ? (
                                        <div style={{ fontSize: 10, color: "#2a2a4a", textAlign: "center", padding: 20 }}>no deposits yet</div>
                                    ) : (
                                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                            {data.transactions.filter(t => t.txn_type === "DEPOSIT" || t.txn_type === "WITHDRAW").map((t, i) => (
                                                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#08080f", border: "1px solid #141424", borderRadius: 6, padding: "10px 14px" }}>
                                                    <div>
                                                        <span style={{ fontSize: 11, fontWeight: 700, color: t.txn_type === "DEPOSIT" ? "#2a8a5a" : "#c04040" }}>{t.txn_type}</span>
                                                        <div style={{ fontSize: 9, color: "#2a2a4a", marginTop: 2 }}>{t.created_at?.slice(0, 16).replace("T", " ")}</div>
                                                    </div>
                                                    <div style={{ textAlign: "right" }}>
                                                        <div style={{ fontSize: 14, fontWeight: 700, color: t.txn_type === "DEPOSIT" ? "#2a8a5a" : "#c04040" }}>
                                                            {t.txn_type === "DEPOSIT" ? "+" : "-"}{fmt(t.amount)}
                                                        </div>
                                                        <div style={{ fontSize: 9, color: "#3a3a5a" }}>bal: {fmt(t.balance_after)}</div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {tab === "trades" && (
                                <div>
                                    <div style={{ fontSize: 9, color: "#3a3a5a", marginBottom: 12 }}>TRADE TRANSACTIONS</div>
                                    {data.transactions.filter(t => t.txn_type === "BUY" || t.txn_type === "SELL").length === 0 ? (
                                        <div style={{ fontSize: 10, color: "#2a2a4a", textAlign: "center", padding: 20 }}>no trades yet</div>
                                    ) : (
                                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                            {data.transactions.filter(t => t.txn_type === "BUY" || t.txn_type === "SELL").map((t, i) => (
                                                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#08080f", border: "1px solid #141424", borderRadius: 6, padding: "8px 14px" }}>
                                                    <div>
                                                        <span style={{ fontSize: 10, fontWeight: 700, color: t.txn_type === "BUY" ? "#6060cc" : "#2a8a5a" }}>{t.txn_type}</span>
                                                        <span style={{ fontSize: 10, color: "#4a4a7a", marginLeft: 8 }}>{t.description}</span>
                                                    </div>
                                                    <div style={{ textAlign: "right" }}>
                                                        <div style={{ fontSize: 12, fontWeight: 700, color: t.txn_type === "BUY" ? "#c04040" : "#2a8a5a" }}>
                                                            {t.txn_type === "BUY" ? "-" : "+"}{fmt(t.amount)}
                                                        </div>
                                                        <div style={{ fontSize: 9, color: "#3a3a5a" }}>{t.created_at?.slice(0, 16).replace("T", " ")}</div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}