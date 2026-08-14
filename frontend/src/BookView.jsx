import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";

const API = import.meta.env.VITE_API_URL || "/api";

function Tip({ text }) {
    const [show, setShow] = useState(false);
    return (
        <span style={{ position: "relative", display: "inline-flex", alignItems: "center", marginLeft: 4 }}
            onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
            <span style={{ width: 13, height: 13, borderRadius: "50%", background: "#111120", border: "1px solid #2a2a4a", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 8, color: "#4a4a7a", cursor: "help" }}>?</span>
            {show && (
                <div style={{ position: "absolute", zIndex: 999, bottom: "calc(100% + 6px)", left: "50%", transform: "translateX(-50%)", width: 200, background: "#080814", border: "1px solid #2a2a4a", borderRadius: 6, padding: "8px 10px", fontSize: 10, color: "#7070a0", lineHeight: 1.6, pointerEvents: "none", boxShadow: "0 8px 24px rgba(0,0,0,0.8)", whiteSpace: "normal" }}>
                    {text}
                    <div style={{ position: "absolute", top: "100%", left: "50%", transform: "translateX(-50%)", borderLeft: "5px solid transparent", borderRight: "5px solid transparent", borderTop: "5px solid #2a2a4a" }} />
                </div>
            )}
        </span>
    );
}

function Stat({ label, value, tip, color, sub }) {
    return (
        <div style={{ background: "#0b0b16", border: "1px solid #181828", borderRadius: 8, padding: "10px 14px", minWidth: 0 }}>
            <div style={{ fontSize: 9, color: "#3a3a5a", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4, display: "flex", alignItems: "center" }}>
                {label}{tip && <Tip text={tip} />}
            </div>
            <div style={{ fontSize: 17, fontWeight: 700, color: color || "#d0d0f0", fontFamily: "monospace", lineHeight: 1 }}>{value}</div>
            {sub && <div style={{ fontSize: 9, color: "#3a3a5a", marginTop: 3 }}>{sub}</div>}
        </div>
    );
}

function Panel({ title, tip, children }) {
    return (
        <div style={{ background: "#0b0b16", border: "1px solid #181828", borderRadius: 10, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", padding: "8px 14px", borderBottom: "1px solid #181828", background: "#08080f" }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: "#3a3a6a", letterSpacing: "0.14em", textTransform: "uppercase" }}>{title}</span>
                {tip && <Tip text={tip} />}
            </div>
            <div style={{ padding: 14 }}>{children}</div>
        </div>
    );
}

function AIAssistant({ book, trades, pnl, vwap, username, token, balance }) {
    const [open, setOpen] = useState(false);
    const [msgs, setMsgs] = useState([
        { role: "assistant", content: `Hey ${username}! I'm your AI trading assistant powered by Gemini. I can see your live order book, portfolio balance (₹${balance?.toFixed(2) || "0.00"}), trades, and P&L. Ask me anything.` }
    ]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const bottomRef = useRef(null);

    useEffect(() => {
        if (open && bottomRef.current) bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }, [msgs, open]);

    function buildContext() {
        const bestBid = book?.bids?.[0]?.px;
        const bestAsk = book?.asks?.[0]?.px;
        const totalVol = trades.reduce((s, t) => s + t.exec_qty, 0);
        return `You are an expert trading assistant inside a real-time limit order book dashboard. User: ${username}.

LIVE MARKET DATA (AAPL):
- Best Bid: ${bestBid ? "$" + bestBid : "none"}
- Best Ask: ${bestAsk ? "$" + bestAsk : "none"}
- Spread: ${book?.spread >= 0 ? "$" + book.spread?.toFixed(2) : "none"}
- Live Orders: ${book?.order_count ?? 0}
- Top Bids: ${book?.bids?.slice(0, 3).map(l => `$${l.px} x ${l.total_qty}`).join(", ") || "none"}
- Top Asks: ${book?.asks?.slice(0, 3).map(l => `$${l.px} x ${l.total_qty}`).join(", ") || "none"}
- Trades: ${trades.length} (${totalVol} shares)
- VWAP: ${vwap ? "$" + vwap.toFixed(2) : "none"}
- P&L: ${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)}
- Portfolio Balance: ₹${balance?.toFixed(2) || "0.00"}
- Recent: ${trades.slice(0, 5).map(t => `${t.exec_qty}@$${parseFloat(t.exec_px).toFixed(2)}`).join(", ") || "none"}

ENGINE: C++ matching engine, price-time priority, O(1) cancel via hash map + deque iterator, pybind11 bridge, JWT auth, SQLite persistence, portfolio/wallet system.

Be concise (under 120 words), use live numbers, give specific actionable advice.`;
    }

    async function send() {
        if (!input.trim() || loading) return;
        const userMsg = input.trim();
        setInput("");
        setMsgs(prev => [...prev, { role: "user", content: userMsg }]);
        setLoading(true);
        try {
            const history = msgs.slice(-6).map(m => ({ role: m.role, content: m.content }));
            const r = await fetch(`${API}/ai/chat`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                body: JSON.stringify({ system: buildContext(), messages: [...history, { role: "user", content: userMsg }] })
            });
            const data = await r.json();
            if (!r.ok) setMsgs(prev => [...prev, { role: "assistant", content: `Error: ${data.detail}` }]);
            else setMsgs(prev => [...prev, { role: "assistant", content: data.text || "no response" }]);
        } catch {
            setMsgs(prev => [...prev, { role: "assistant", content: "connection error" }]);
        } finally { setLoading(false); }
    }

    const suggestions = ["What should I trade?", "Explain the spread", "How does O(1) cancel work?", "What is VWAP?", "How to make profit?", "What is price-time priority?"];

    return (
        <>
            <button onClick={() => setOpen(o => !o)} style={{ position: "fixed", bottom: 24, right: 24, width: 52, height: 52, borderRadius: "50%", background: open ? "#1a1a3a" : "#111130", border: "1px solid #3a3a7a", color: "#8080cc", fontSize: 20, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 20px rgba(80,80,200,0.3)", zIndex: 100 }}>
                {open ? "✕" : "✦"}
            </button>
            {open && (
                <div style={{ position: "fixed", bottom: 88, right: 24, width: 360, height: 520, background: "#0a0a18", border: "1px solid #2a2a4a", borderRadius: 12, display: "flex", flexDirection: "column", zIndex: 100, boxShadow: "0 8px 40px rgba(0,0,0,0.8)", fontFamily: "'IBM Plex Mono', monospace" }}>
                    <div style={{ padding: "12px 16px", borderBottom: "1px solid #1a1a2a", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: "#8080cc" }}>✦ AI Trading Assistant</div>
                            <div style={{ fontSize: 9, color: "#3a3a6a" }}>live market + portfolio · Gemini</div>
                        </div>
                        <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#2a8a5a", boxShadow: "0 0 6px #2a8a5a" }} />
                    </div>
                    <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
                        {msgs.map((m, i) => (
                            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: m.role === "user" ? "flex-end" : "flex-start" }}>
                                <div style={{ maxWidth: "85%", padding: "8px 11px", borderRadius: m.role === "user" ? "10px 10px 2px 10px" : "10px 10px 10px 2px", background: m.role === "user" ? "#141430" : "#0e0e20", border: `1px solid ${m.role === "user" ? "#2a2a5a" : "#181828"}`, fontSize: 11, color: m.role === "user" ? "#a0a0e0" : "#8080b0", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                                    {m.content}
                                </div>
                            </div>
                        ))}
                        {loading && <div style={{ padding: "8px 11px", borderRadius: "10px 10px 10px 2px", background: "#0e0e20", border: "1px solid #181828", fontSize: 11, color: "#4a4a7a", alignSelf: "flex-start" }}>thinking...</div>}
                        <div ref={bottomRef} />
                    </div>
                    {msgs.length <= 1 && (
                        <div style={{ padding: "0 14px 10px", display: "flex", flexWrap: "wrap", gap: 5 }}>
                            {suggestions.map(s => <button key={s} onClick={() => setInput(s)} style={{ padding: "4px 8px", background: "#0e0e20", border: "1px solid #1e1e3a", borderRadius: 4, color: "#4a4a7a", fontSize: 9, fontFamily: "inherit", cursor: "pointer" }}>{s}</button>)}
                        </div>
                    )}
                    <div style={{ padding: "10px 14px", borderTop: "1px solid #1a1a2a", display: "flex", gap: 8 }}>
                        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && send()} placeholder="ask anything..." style={{ flex: 1, padding: "8px 10px", background: "#08080f", border: "1px solid #1a1a2a", borderRadius: 6, color: "#c0c0e0", fontSize: 11, fontFamily: "inherit", outline: "none" }} />
                        <button onClick={send} disabled={loading} style={{ padding: "8px 12px", background: "#111128", border: "1px solid #2a2a5a", borderRadius: 6, color: "#6060aa", fontSize: 11, fontFamily: "inherit", cursor: loading ? "not-allowed" : "pointer" }}>→</button>
                    </div>
                </div>
            )}
        </>
    );
}

export default function BookView({ symbol = "AAPL", token, username, onLogout, onPortfolio, tokenTimeLeft }) {
    const depthRef = useRef(null);
    const chartRef = useRef(null);
    const prevBook = useRef(null);
    const [book, setBook] = useState(null);
    const [trades, setTrades] = useState([]);
    const [priceHistory, setPriceHistory] = useState([]);
    const [form, setForm] = useState({ side: "BUY", px: "150.00", qty: "10" });
    const [oidCounter, setOidCounter] = useState(() => Math.floor(Date.now() / 1000) % 100000);
    const [err, setErr] = useState(null);
    const [flash, setFlash] = useState(null);
    const [pendingOrders, setPendingOrders] = useState([]);
    const [showOnboard, setShowOnboard] = useState(true);
    const [tab, setTab] = useState("DEPTH");
    const [pnl, setPnl] = useState(0);
    const [allOrders, setAllOrders] = useState([]);
    const [volByPrice, setVolByPrice] = useState({});
    const [historyLoaded, setHistoryLoaded] = useState(false);
    const [balance, setBalance] = useState(0);
    const [depositAmt, setDepositAmt] = useState("");
    const [depositMsg, setDepositMsg] = useState(null);

    const authHdr = { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" };

    async function loadBalance() {
        try {
            const r = await fetch(`${API}/portfolio`, { headers: authHdr });
            if (r.ok) { const d = await r.json(); setBalance(d.cash_balance || 0); }
        } catch {}
    }

    useEffect(() => {
        loadBalance();
        const iv = setInterval(loadBalance, 5000);
        return () => clearInterval(iv);
    }, [token]);

    useEffect(() => {
        async function loadHistory() {
            try {
                const r = await fetch(`${API}/history/${symbol}`, { headers: { "Authorization": `Bearer ${token}` } });
                if (!r.ok) return;
                const data = await r.json();
                if (data.trades?.length > 0) {
                    const loaded = data.trades.map(t => ({ ...t, id: Math.random(), exec_px: parseFloat(t.exec_px), exec_qty: parseInt(t.exec_qty) }));
                    setTrades([...loaded].reverse());
                    setPriceHistory(data.trades.map(t => ({ px: parseFloat(t.exec_px), t: t.created_at })));
                    const vol = {};
                    data.trades.forEach(t => { const k = parseFloat(t.exec_px).toFixed(2); vol[k] = (vol[k] || 0) + parseInt(t.exec_qty); });
                    setVolByPrice(vol);
                }
                if (data.orders?.length > 0) {
                    setAllOrders(data.orders.map(o => ({ ...o, px: parseFloat(o.px), qty: parseInt(o.qty) })));
                    setPendingOrders(data.orders.filter(o => o.status === "resting").map(o => ({ ...o, px: parseFloat(o.px) })));
                }
                setHistoryLoaded(true);
            } catch { setHistoryLoaded(true); }
        }
        loadHistory();
    }, [symbol, token]);

    useEffect(() => {
        const poll = setInterval(async () => {
            try {
                const r = await fetch(`${API}/book/${symbol}?depth=15`, { headers: { "Authorization": `Bearer ${token}` } });
                if (r.status === 401) { onLogout(); return; }
                setBook(await r.json());
                setErr(null);
            } catch { setErr("API offline"); }
        }, 300);
        return () => clearInterval(poll);
    }, [symbol, token]);

    useEffect(() => {
        if (!book || !depthRef.current) return;
        const prev = prevBook.current;
        const same = prev && JSON.stringify(prev.bids) === JSON.stringify(book.bids) && JSON.stringify(prev.asks) === JSON.stringify(book.asks);
        if (same) return;
        prevBook.current = book;
        const W = depthRef.current.clientWidth || 600;
        const H = 260; const ml = 6, mr = 6, mt = 6, mb = 18;
        const iw = W - ml - mr; const ih = H - mt - mb; const mid = iw / 2;
        const all = [...book.bids, ...book.asks];
        if (all.length === 0) return;
        const maxQ = d3.max(all, d => d.total_qty) || 1;
        const priceOrder = [...book.asks].reverse().map(d => String(d.px)).concat(book.bids.map(d => String(d.px)));
        const yScale = d3.scaleBand().domain(priceOrder).range([0, ih]).padding(0.15);
        const xScale = d3.scaleLinear().domain([0, maxQ]).range([0, mid - 8]);
        const svg = d3.select(depthRef.current);
        svg.attr("width", W).attr("height", H);
        let g = svg.select("g.main");
        if (g.empty()) {
            g = svg.append("g").attr("class", "main").attr("transform", `translate(${ml},${mt})`);
            g.append("line").attr("class", "ml").attr("stroke", "#1e1e30").attr("stroke-width", 1).attr("stroke-dasharray", "3,4");
            g.append("text").attr("class", "bl").attr("text-anchor", "middle").attr("font-size", 9).attr("fill", "#2a6a4a").attr("font-family", "monospace");
            g.append("text").attr("class", "al").attr("text-anchor", "middle").attr("font-size", 9).attr("fill", "#6a2a2a").attr("font-family", "monospace");
        }
        g.select(".ml").attr("x1", mid).attr("x2", mid).attr("y1", 0).attr("y2", ih);
        g.select(".bl").attr("x", mid / 2).attr("y", ih + 13).text("← BIDS");
        g.select(".al").attr("x", mid + mid / 2).attr("y", ih + 13).text("ASKS →");
        const as = g.selectAll("rect.ask").data([...book.asks].reverse(), d => d.px);
        as.enter().append("rect").attr("class", "ask").attr("fill", "#c04040").attr("opacity", 0.6).attr("rx", 2).attr("x", mid + 8).attr("width", 0).attr("height", 0).attr("y", ih)
            .merge(as).transition().duration(250).attr("y", d => yScale(String(d.px))).attr("height", yScale.bandwidth()).attr("width", d => xScale(d.total_qty));
        as.exit().transition().duration(150).attr("width", 0).remove();
        const bs = g.selectAll("rect.bid").data(book.bids, d => d.px);
        bs.enter().append("rect").attr("class", "bid").attr("fill", "#2a8a5a").attr("opacity", 0.6).attr("rx", 2).attr("width", 0).attr("height", 0).attr("y", ih)
            .merge(bs).transition().duration(250).attr("y", d => yScale(String(d.px))).attr("height", yScale.bandwidth()).attr("x", d => mid - 8 - xScale(d.total_qty)).attr("width", d => xScale(d.total_qty));
        bs.exit().transition().duration(150).attr("width", 0).remove();
        const ps = g.selectAll("text.pxl").data(priceOrder, d => d);
        ps.enter().append("text").attr("class", "pxl").attr("text-anchor", "middle").attr("font-size", 8).attr("fill", "#2a2a4a").attr("font-family", "monospace")
            .merge(ps).transition().duration(250).attr("x", mid).attr("y", d => (yScale(d) || 0) + yScale.bandwidth() / 2).attr("dy", "0.35em").text(d => parseFloat(d).toFixed(2));
        ps.exit().remove();
    }, [book]);

    useEffect(() => {
        if (!chartRef.current || priceHistory.length === 0) return;

        const pts = priceHistory.length === 1
            ? [priceHistory[0], { ...priceHistory[0] }]
            : priceHistory;

        const W = chartRef.current.clientWidth || 600;
        const H = 220;
        const m = { t: 16, r: 60, b: 28, l: 56 };
        const iw = W - m.l - m.r;
        const ih = H - m.t - m.b;

        const xScale = d3.scaleLinear().domain([0, pts.length - 1]).range([0, iw]);
        const prices = pts.map(d => d.px);
        const pMin = Math.min(...prices);
        const pMax = Math.max(...prices);
        const pad = (pMax - pMin) * 0.15 || 2;
        const yScale = d3.scaleLinear().domain([pMin - pad, pMax + pad]).range([ih, 0]);

        const line = d3.line().x((d, i) => xScale(i)).y(d => yScale(d.px)).curve(d3.curveMonotoneX);
        const area = d3.area().x((d, i) => xScale(i)).y0(ih).y1(d => yScale(d.px)).curve(d3.curveMonotoneX);

        const svg = d3.select(chartRef.current);
        svg.selectAll("*").remove();
        svg.attr("width", W).attr("height", H);

        const defs = svg.append("defs");
        const grad = defs.append("linearGradient").attr("id", "cg2").attr("x1", 0).attr("x2", 0).attr("y1", 0).attr("y2", 1);
        grad.append("stop").attr("offset", "0%").attr("stop-color", "#2a8a5a").attr("stop-opacity", 0.35);
        grad.append("stop").attr("offset", "100%").attr("stop-color", "#2a8a5a").attr("stop-opacity", 0);

        const g = svg.append("g").attr("transform", `translate(${m.l},${m.t})`);

        g.selectAll(".grid")
            .data(yScale.ticks(4)).enter()
            .append("line").attr("x1", 0).attr("x2", iw)
            .attr("y1", d => yScale(d)).attr("y2", d => yScale(d))
            .attr("stroke", "#111120").attr("stroke-width", 1);

        g.append("path").datum(pts).attr("fill", "url(#cg2)").attr("d", area);
        g.append("path").datum(pts).attr("fill", "none").attr("stroke", "#2a8a5a").attr("stroke-width", 2).attr("d", line);

        g.append("g")
            .call(d3.axisLeft(yScale).ticks(4).tickFormat(d => `$${d.toFixed(2)}`))
            .selectAll("text").style("fill", "#3a3a5a").style("font-size", "9px").style("font-family", "monospace");
        g.selectAll(".domain, .tick line").attr("stroke", "#1e1e2e");

        const last = pts[pts.length - 1];
        const lastX = xScale(pts.length - 1);
        const lastY = yScale(last.px);

        g.append("line")
            .attr("x1", lastX).attr("x2", iw + 2)
            .attr("y1", lastY).attr("y2", lastY)
            .attr("stroke", "#2a8a5a").attr("stroke-width", 0.5)
            .attr("stroke-dasharray", "3,3").attr("opacity", 0.5);

        g.append("circle")
            .attr("cx", lastX).attr("cy", lastY)
            .attr("r", 4).attr("fill", "#2a8a5a")
            .attr("stroke", "#07070f").attr("stroke-width", 2);

        g.append("rect")
            .attr("x", iw + 4).attr("y", lastY - 9)
            .attr("width", 50).attr("height", 16)
            .attr("fill", "#0a1e12").attr("rx", 3);

        g.append("text")
            .attr("x", iw + 8).attr("y", lastY + 3)
            .attr("font-size", 9).attr("fill", "#2a8a5a")
            .attr("font-family", "monospace")
            .text(`$${last.px.toFixed(2)}`);

    }, [priceHistory]);

    async function submitOrder(e) {
        e.preventDefault();
        const oid = oidCounter;
        setOidCounter(c => c + 1);
        const body = { oid, side: form.side, px: parseFloat(form.px), qty: parseInt(form.qty), ts: Date.now() };
        if (form.side === "BUY" && body.px * body.qty > balance) {
            setFlash({ msg: `insufficient funds — need ₹${(body.px * body.qty).toFixed(2)}, have ₹${balance.toFixed(2)}`, color: "#c04040" });
            setTimeout(() => setFlash(null), 3000);
            return;
        }
        setAllOrders(prev => [{ ...body, status: "resting", at: new Date().toISOString() }, ...prev].slice(0, 200));
        try {
            const r = await fetch(`${API}/order/${symbol}`, { method: "POST", headers: authHdr, body: JSON.stringify(body) });
            if (r.status === 401) { onLogout(); return; }
            const result = await r.json();
            if (!r.ok) {
                setFlash({ msg: result.detail || "order failed", color: "#c04040" });
                setAllOrders(prev => prev.filter(o => o.oid !== oid));
                setTimeout(() => setFlash(null), 3000);
                return;
            }
            if (result.length > 0) {
                const newTrades = result.map(t => ({ ...t, at: Date.now(), id: Math.random(), exec_px: parseFloat(t.exec_px), exec_qty: parseInt(t.exec_qty) }));
                setTrades(prev => [...newTrades, ...prev].slice(0, 200));
                setAllOrders(prev => prev.map(o => o.oid === oid ? { ...o, status: "filled" } : o));
                setPriceHistory(prev => [...prev, ...newTrades.map(t => ({ px: t.exec_px, t: Date.now() }))].slice(-100));
                setTab("CHART");
                const qty = result.reduce((s, t) => s + t.exec_qty, 0);
                const avg = result.reduce((s, t) => s + t.exec_px * t.exec_qty, 0) / qty;
                setPnl(prev => prev + (body.side === "SELL" ? avg * qty : -avg * qty));
                setVolByPrice(prev => { const n = { ...prev }; result.forEach(t => { const k = parseFloat(t.exec_px).toFixed(2); n[k] = (n[k] || 0) + t.exec_qty; }); return n; });
                setFlash({ msg: `⚡ ${qty} @ $${avg.toFixed(2)}`, color: "#2a8a5a" });
            } else {
                setPendingOrders(prev => [...prev, { oid, ...body }].slice(-20));
                setFlash({ msg: `resting @ $${body.px.toFixed(2)}`, color: "#4a4a9a" });
            }
            loadBalance();
            setTimeout(() => setFlash(null), 2000);
        } catch { setErr("submit failed"); }
    }

    async function cancelOrder(oid) {
        try {
            const r = await fetch(`${API}/order/${symbol}/${oid}`, { method: "DELETE", headers: authHdr });
            if (r.status === 401) { onLogout(); return; }
            setPendingOrders(prev => prev.filter(o => o.oid !== oid));
            setAllOrders(prev => prev.map(o => o.oid === oid ? { ...o, status: "cancelled" } : o));
            loadBalance();
        } catch { setErr("cancel failed"); }
    }

    async function quickDeposit() {
        const amt = parseFloat(depositAmt);
        if (!amt || amt <= 0) return;
        try {
            const r = await fetch(`${API}/portfolio/deposit`, { method: "POST", headers: authHdr, body: JSON.stringify({ amount: amt }) });
            const d = await r.json();
            if (r.ok) { setDepositMsg({ text: `+₹${amt.toLocaleString("en-IN")} added`, ok: true }); setDepositAmt(""); loadBalance(); }
            else setDepositMsg({ text: d.detail, ok: false });
            setTimeout(() => setDepositMsg(null), 3000);
        } catch {}
    }

    const bestBid = book?.bids?.[0]?.px;
    const bestAsk = book?.asks?.[0]?.px;
    const totalVol = trades.reduce((s, t) => s + t.exec_qty, 0);
    const vwap = trades.length > 0 ? trades.reduce((s, t) => s + t.exec_px * t.exec_qty, 0) / totalVol : null;
    const willCross = form.side === "BUY" ? (bestAsk && parseFloat(form.px) >= bestAsk) : (bestBid && parseFloat(form.px) <= bestBid);
    const canAfford = form.side !== "BUY" || (parseFloat(form.px) * parseInt(form.qty || 0) <= balance);
    const topVolPrices = Object.entries(volByPrice).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const maxVol = topVolPrices[0]?.[1] || 1;
    const TABS = ["DEPTH", "CHART", "ANALYTICS", "HISTORY"];
    const inp = { width: "100%", padding: "8px 10px", background: "#08080f", border: "1px solid #181828", borderRadius: 5, color: "#d0d0f0", fontSize: 12, fontFamily: "inherit", boxSizing: "border-box", outline: "none" };

    return (
        <div style={{ minHeight: "100vh", background: "#070710", fontFamily: "'IBM Plex Mono', monospace", color: "#c0c0e0" }}>
            <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />

            {showOnboard && (
                <div style={{ position: "fixed", inset: 0, background: "rgba(4,4,10,0.97)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <div style={{ background: "#0b0b18", border: "1px solid #2a2a4a", borderRadius: 12, padding: "36px 44px", maxWidth: 500, width: "92%" }}>
                        <div style={{ fontSize: 10, color: "#3a3a6a", letterSpacing: "0.15em", marginBottom: 10 }}>WELCOME BACK, {username?.toUpperCase()}</div>
                        <div style={{ fontSize: 22, fontWeight: 700, color: "#e0e0ff", marginBottom: 20 }}>Order Book Engine</div>
                        {[
                            ["📗 BIDS / ASKS", "Green = buy orders, Red = sell orders. Cross the spread to execute instantly."],
                            ["💰 PORTFOLIO", "Click ◈ PORTFOLIO in the header to deposit funds, withdraw, and view holdings."],
                            ["⚡ BALANCE CHECK", "BUY orders are rejected if you don't have enough balance. Deposit first."],
                            ["✦ AI ASSISTANT", "Purple button bottom-right — Gemini-powered live trade guidance."],
                            ["💾 PERSISTENT", "Your trade history and portfolio reload on every login."],
                        ].map(([t, d]) => (
                            <div key={t} style={{ display: "flex", gap: 12, marginBottom: 10 }}>
                                <div style={{ fontSize: 10, fontWeight: 700, color: "#7070a0", minWidth: 130 }}>{t}</div>
                                <div style={{ fontSize: 10, color: "#4a4a6a", lineHeight: 1.5 }}>{d}</div>
                            </div>
                        ))}
                        <button onClick={() => setShowOnboard(false)} style={{ width: "100%", marginTop: 16, padding: 12, background: "#111130", border: "1px solid #3a3a7a", borderRadius: 6, color: "#8080cc", fontSize: 11, fontFamily: "inherit", cursor: "pointer", fontWeight: 700 }}>
                            ENTER THE BOOK →
                        </button>
                    </div>
                </div>
            )}

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px", borderBottom: "1px solid #141424", background: "#06060e" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#d0d0f0" }}>◈ ORDERBOOK</span>
                    <span style={{ background: "#111124", border: "1px solid #1e1e34", borderRadius: 4, padding: "2px 8px", fontSize: 10, color: "#5a5a8a" }}>{symbol}</span>
                    <span style={{ background: "#111124", border: "1px solid #1e1e34", borderRadius: 4, padding: "2px 8px", fontSize: 10, color: "#3a6a3a" }}>C++ ENGINE</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {flash && <div style={{ fontSize: 11, color: flash.color, padding: "3px 10px", background: "#0a0a18", border: `1px solid ${flash.color}40`, borderRadius: 4 }}>{flash.msg}</div>}
                    {tokenTimeLeft && tokenTimeLeft < 10 * 60 * 1000 && (
                        <div style={{ fontSize: 9, color: "#aaaa40", padding: "3px 8px", background: "#1a1a0a", border: "1px solid #3a3a1a", borderRadius: 4 }}>
                            session ~{Math.ceil(tokenTimeLeft / 60000)}m left
                        </div>
                    )}
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ width: 6, height: 6, borderRadius: "50%", background: err ? "#c04040" : "#2a8a5a", boxShadow: err ? "none" : "0 0 6px #2a8a5a" }} />
                        <span style={{ fontSize: 9, color: err ? "#804040" : "#2a6a4a" }}>{err || "LIVE"}</span>
                    </div>
                    <span style={{ fontSize: 10, color: "#4a4a7a" }}>@{username}</span>
                    <span style={{ fontSize: 10, color: "#2a8a5a", fontFamily: "monospace" }}>₹{balance.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    <button onClick={onPortfolio} style={{ background: "#0a0a1e", border: "1px solid #2a2a5a", borderRadius: 4, color: "#6060cc", fontSize: 9, fontFamily: "inherit", cursor: "pointer", padding: "4px 10px", fontWeight: 700 }}>◈ PORTFOLIO</button>
                    <button onClick={onLogout} style={{ background: "none", border: "1px solid #2a1a1a", borderRadius: 4, color: "#604040", fontSize: 9, fontFamily: "inherit", cursor: "pointer", padding: "4px 8px" }}>logout</button>
                </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 8, padding: "12px 20px" }}>
                <Stat label="Best Bid" value={bestBid ? `$${bestBid.toFixed(2)}` : "—"} color="#2a8a5a" tip="Highest buy price in the book" />
                <Stat label="Best Ask" value={bestAsk ? `$${bestAsk.toFixed(2)}` : "—"} color="#c04040" tip="Lowest sell price in the book" />
                <Stat label="Spread" value={book?.spread >= 0 ? `$${book.spread.toFixed(2)}` : "—"} color="#6060a0" tip="Gap between best ask and best bid" />
                <Stat label="Live Orders" value={book?.order_count ?? "—"} tip="Unfilled orders in the book" />
                <Stat label="Trades" value={trades.length} sub={totalVol > 0 ? `${totalVol} shares` : undefined} tip="Executed trades this session" />
                <Stat label="VWAP" value={vwap ? `$${vwap.toFixed(2)}` : "—"} color="#8080c0" tip="Volume weighted average price" />
                <Stat label="Balance" value={`₹${balance.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`} color="#2a8a5a" tip="Available cash to trade" />
                <Stat label="P&L" value={`${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)}`} color={pnl > 0 ? "#2a8a5a" : pnl < 0 ? "#c04040" : "#6060a0"} tip="Session realized profit and loss" />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 12, padding: "0 20px 80px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <div style={{ background: "#0b0b16", border: "1px solid #181828", borderRadius: 10, overflow: "hidden" }}>
                        <div style={{ display: "flex", borderBottom: "1px solid #181828" }}>
                            {TABS.map(t => (
                                <button key={t} onClick={() => setTab(t)} style={{ padding: "9px 18px", background: "none", border: "none", borderBottom: tab === t ? "2px solid #5a5acc" : "2px solid transparent", color: tab === t ? "#a0a0e0" : "#3a3a6a", fontSize: 9, fontFamily: "inherit", cursor: "pointer", letterSpacing: "0.12em", fontWeight: tab === t ? 700 : 400 }}>{t}</button>
                            ))}
                        </div>
                        <div style={{ padding: 16 }}>
                            {tab === "DEPTH" && (
                                <div>
                                    <svg ref={depthRef} style={{ width: "100%", display: "block" }} />
                                    {(!book || (book.bids.length === 0 && book.asks.length === 0)) && (
                                        <div style={{ textAlign: "center", padding: 20, fontSize: 10, color: "#2a2a4a" }}>book is empty — place some orders</div>
                                    )}
                                </div>
                            )}
                            {tab === "CHART" && (
                                <div>
                                    <div style={{ fontSize: 9, color: "#3a3a5a", marginBottom: 10, display: "flex", justifyContent: "space-between" }}>
                                        <span>LAST TRADE PRICE — all-time history</span>
                                        <span style={{ color: "#2a2a4a" }}>{priceHistory.length} pts</span>
                                    </div>
                                    {priceHistory.length === 0
                                        ? <div style={{ textAlign: "center", padding: "40px 0", fontSize: 10, color: "#2a2a4a" }}>execute a trade to see the price chart</div>
                                        : <svg ref={chartRef} style={{ width: "100%", display: "block", minHeight: 220 }} />
                                    }
                                </div>
                            )}
                            {tab === "ANALYTICS" && (
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                                    <div>
                                        <div style={{ fontSize: 9, color: "#3a3a5a", marginBottom: 10 }}>VOLUME BY PRICE LEVEL</div>
                                        {topVolPrices.length === 0 ? <div style={{ fontSize: 10, color: "#2a2a4a" }}>no trades yet</div>
                                            : topVolPrices.map(([px, vol]) => (
                                                <div key={px} style={{ marginBottom: 7 }}>
                                                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#5050a0", marginBottom: 2 }}><span>${px}</span><span>{vol}</span></div>
                                                    <div style={{ height: 4, background: "#111120", borderRadius: 2 }}>
                                                        <div style={{ height: "100%", width: `${(vol / maxVol) * 100}%`, background: "#4a4a9a", borderRadius: 2 }} />
                                                    </div>
                                                </div>
                                            ))
                                        }
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 9, color: "#3a3a5a", marginBottom: 10 }}>MARKET STATS</div>
                                        {[
                                            ["Total Trades", trades.length],
                                            ["Total Volume", `${totalVol} shares`],
                                            ["VWAP", vwap ? `$${vwap.toFixed(3)}` : "—"],
                                            ["Session P&L", `${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)}`],
                                            ["Cash Balance", `₹${balance.toFixed(2)}`],
                                            ["Bid Levels", book?.bids?.length ?? 0],
                                            ["Ask Levels", book?.asks?.length ?? 0],
                                            ["Spread", book?.spread >= 0 ? `$${book.spread.toFixed(3)}` : "—"],
                                        ].map(([k, v]) => (
                                            <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid #111120", fontSize: 10 }}>
                                                <span style={{ color: "#3a3a6a" }}>{k}</span><span style={{ color: "#8080b0" }}>{v}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {tab === "HISTORY" && (
                                <div>
                                    <div style={{ fontSize: 9, color: "#3a3a5a", marginBottom: 10 }}>ORDER HISTORY — all time @{username}</div>
                                    {!historyLoaded ? <div style={{ fontSize: 10, color: "#2a2a4a", textAlign: "center", padding: 20 }}>loading...</div>
                                        : allOrders.length === 0 ? <div style={{ fontSize: 10, color: "#2a2a4a", textAlign: "center", padding: 20 }}>no orders yet</div>
                                        : (
                                            <div style={{ maxHeight: 280, overflowY: "auto" }}>
                                                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
                                                    <thead><tr>{["OID", "SIDE", "PRICE", "QTY", "STATUS", "TIME"].map(h => <td key={h} style={{ padding: "4px 8px", borderBottom: "1px solid #111120", fontSize: 9, color: "#3a3a5a" }}>{h}</td>)}</tr></thead>
                                                    <tbody>
                                                        {allOrders.map((o, i) => (
                                                            <tr key={i} style={{ borderBottom: "1px solid #0e0e1c" }}>
                                                                <td style={{ padding: "5px 8px", color: "#3a3a5a" }}>#{o.oid}</td>
                                                                <td style={{ padding: "5px 8px", color: o.side === "BUY" ? "#2a8a5a" : "#c04040", fontWeight: 700 }}>{o.side}</td>
                                                                <td style={{ padding: "5px 8px", color: "#8080b0" }}>${parseFloat(o.px).toFixed(2)}</td>
                                                                <td style={{ padding: "5px 8px", color: "#6060a0" }}>{o.qty}</td>
                                                                <td style={{ padding: "5px 8px", color: o.status === "filled" ? "#2a8a5a" : o.status === "cancelled" ? "#604040" : "#404080" }}>{o.status}</td>
                                                                <td style={{ padding: "5px 8px", color: "#2a2a4a", fontSize: 8 }}>{typeof o.at === "string" ? o.at.slice(0, 16).replace("T", " ") : "—"}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )
                                    }
                                </div>
                            )}
                        </div>
                    </div>

                    <Panel title="Trade Tape" tip="Real-time log of executed trades">
                        {trades.length === 0 ? <div style={{ fontSize: 10, color: "#2a2a4a", textAlign: "center", padding: 10 }}>no trades yet</div>
                            : (
                                <div style={{ maxHeight: 140, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
                                    {trades.map((t, i) => (
                                        <div key={t.id || i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 8px", background: i === 0 ? "#0a1218" : "transparent", borderRadius: 4 }}>
                                            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                                <span style={{ color: "#2a8a5a", fontWeight: 700, fontSize: 12 }}>{t.exec_qty}</span>
                                                <span style={{ color: "#2a2a4a", fontSize: 9 }}>@</span>
                                                <span style={{ color: "#d0d0f0", fontWeight: 700, fontSize: 13 }}>${parseFloat(t.exec_px).toFixed(2)}</span>
                                            </div>
                                            <span style={{ fontSize: 9, color: "#2a2a4a" }}>#{t.buy_oid}×#{t.sell_oid}</span>
                                        </div>
                                    ))}
                                </div>
                            )
                        }
                    </Panel>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <Panel title="Place Order" tip="Submit a limit order. BUY orders require sufficient balance.">
                        <form onSubmit={submitOrder} style={{ display: "flex", flexDirection: "column", gap: 11 }}>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                                {["BUY", "SELL"].map(s => (
                                    <button key={s} type="button" onClick={() => setForm(f => ({ ...f, side: s }))} style={{ padding: 9, border: `1px solid ${form.side === s ? (s === "BUY" ? "#2a8a5a" : "#c04040") : "#181828"}`, borderRadius: 5, background: form.side === s ? (s === "BUY" ? "#081810" : "#180808") : "#090912", color: form.side === s ? (s === "BUY" ? "#2a8a5a" : "#c04040") : "#303050", fontSize: 11, fontFamily: "inherit", cursor: "pointer", fontWeight: 700 }}>
                                        {s === "BUY" ? "▲ BUY" : "▼ SELL"}
                                    </button>
                                ))}
                            </div>
                            {[{ k: "px", label: "LIMIT PRICE", step: "0.01", tip: "Order executes at this price or better" }, { k: "qty", label: "QUANTITY", step: "1", tip: "Number of shares" }].map(({ k, label, step, tip }) => (
                                <div key={k}>
                                    <div style={{ fontSize: 9, color: "#3a3a5a", marginBottom: 4, display: "flex", alignItems: "center", letterSpacing: "0.1em" }}>{label}<Tip text={tip} /></div>
                                    <input type="number" step={step} value={form[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} style={inp} />
                                </div>
                            ))}
                            {form.side === "BUY" && form.px && form.qty && (
                                <div style={{ fontSize: 9, color: canAfford ? "#3a3a5a" : "#c04040", background: "#08080f", border: `1px solid ${canAfford ? "#141424" : "#4a1a1a"}`, borderRadius: 5, padding: "6px 10px" }}>
                                    {canAfford ? `cost: ₹${(parseFloat(form.px) * parseInt(form.qty || 0)).toFixed(2)} / ₹${balance.toFixed(2)} available` : `⚠ need ₹${(parseFloat(form.px) * parseInt(form.qty || 0)).toFixed(2)}, have ₹${balance.toFixed(2)}`}
                                </div>
                            )}
                            <div style={{ background: "#08080f", border: `1px solid ${willCross ? "#4a4a1a" : "#141424"}`, borderRadius: 5, padding: "7px 10px", fontSize: 9, color: willCross ? "#aaaa40" : "#303050" }}>
                                {willCross ? "⚡ will execute immediately" : "order will rest in book"}
                            </div>
                            <button type="submit" disabled={form.side === "BUY" && !canAfford} style={{ padding: 11, background: form.side === "BUY" ? (canAfford ? "#081810" : "#180808") : "#180808", border: `1px solid ${form.side === "BUY" ? (canAfford ? "#2a8a5a" : "#604040") : "#c04040"}`, borderRadius: 5, color: form.side === "BUY" ? (canAfford ? "#2a8a5a" : "#604040") : "#c04040", fontSize: 11, fontFamily: "inherit", cursor: canAfford || form.side === "SELL" ? "pointer" : "not-allowed", fontWeight: 700 }}>
                                {form.side === "BUY" ? "▲ BUY" : "▼ SELL"} {form.qty} @ ${parseFloat(form.px || 0).toFixed(2)}
                            </button>
                        </form>
                    </Panel>

                    <Panel title="Quick Deposit" tip="Add funds without leaving the trading view">
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 10 }}>
                            {[1000, 5000, 10000, 50000].map(p => (
                                <button key={p} onClick={() => setDepositAmt(String(p))} style={{ padding: "4px 8px", background: depositAmt === String(p) ? "#0a1e12" : "#0a0a18", border: `1px solid ${depositAmt === String(p) ? "#2a8a5a" : "#181828"}`, borderRadius: 4, color: depositAmt === String(p) ? "#2a8a5a" : "#4a4a7a", fontSize: 9, fontFamily: "inherit", cursor: "pointer" }}>
                                    ₹{(p / 1000).toFixed(0)}K
                                </button>
                            ))}
                        </div>
                        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                            <input type="number" value={depositAmt} onChange={e => setDepositAmt(e.target.value)} placeholder="custom amount" style={{ ...inp, flex: 1, fontSize: 11 }} />
                            <button onClick={quickDeposit} style={{ padding: "8px 12px", background: "#081810", border: "1px solid #2a8a5a", borderRadius: 5, color: "#2a8a5a", fontSize: 10, fontFamily: "inherit", cursor: "pointer", fontWeight: 700 }}>+ ADD</button>
                        </div>
                        {depositMsg && <div style={{ fontSize: 10, color: depositMsg.ok ? "#2a8a5a" : "#c04040", padding: "5px 8px", background: "#08080f", borderRadius: 4 }}>{depositMsg.text}</div>}
                        <button onClick={onPortfolio} style={{ width: "100%", padding: "7px", background: "none", border: "1px solid #1e1e34", borderRadius: 5, color: "#4a4a7a", fontSize: 9, fontFamily: "inherit", cursor: "pointer", marginTop: 6 }}>
                            view full portfolio →
                        </button>
                    </Panel>

                    <Panel title="Order Blotter" tip="Resting orders — click cancel to remove and get refund">
                        {pendingOrders.length === 0 ? <div style={{ fontSize: 10, color: "#2a2a4a", textAlign: "center", padding: 10 }}>no resting orders</div>
                            : (
                                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                                    {pendingOrders.map((o, i) => (
                                        <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#08080f", border: "1px solid #141424", borderRadius: 5, padding: "7px 10px" }}>
                                            <div>
                                                <span style={{ color: o.side === "BUY" ? "#2a8a5a" : "#c04040", fontSize: 10, fontWeight: 700 }}>{o.side}</span>
                                                <span style={{ color: "#505080", fontSize: 10 }}> {o.qty}@${parseFloat(o.px).toFixed(2)}</span>
                                                <div style={{ fontSize: 8, color: "#2a2a4a" }}>#{o.oid}</div>
                                            </div>
                                            <button onClick={() => cancelOrder(o.oid)} style={{ background: "#180808", border: "1px solid #301818", borderRadius: 4, color: "#804040", fontSize: 9, fontFamily: "inherit", cursor: "pointer", padding: "3px 7px" }}>✕ cancel</button>
                                        </div>
                                    ))}
                                </div>
                            )
                        }
                    </Panel>
                </div>
            </div>

            <AIAssistant book={book} trades={trades} pnl={pnl} vwap={vwap} username={username} token={token} balance={balance} />

            <style>{`
                * { box-sizing: border-box; margin: 0; padding: 0; }
                body { background: #070710; }
                input:focus { border-color: #3a3a7a !important; }
                ::-webkit-scrollbar { width: 3px; } ::-webkit-scrollbar-track { background: #08080f; } ::-webkit-scrollbar-thumb { background: #1e1e30; border-radius: 2px; }
            `}</style>
        </div>
    );
}