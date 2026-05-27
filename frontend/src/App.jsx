import { useState, useEffect } from "react";
import AuthPage from "./AuthPage";
import BookView from "./BookView";
import Portfolio from "./Portfolio";

const API = import.meta.env.VITE_API_URL || "http://localhost:8080";

export default function App() {
    const [token, setToken] = useState(null);
    const [username, setUsername] = useState(null);
    const [view, setView] = useState("book");
    const [tokenExpiry, setTokenExpiry] = useState(null);
    const [timeLeft, setTimeLeft] = useState(null);

    function handleAuth(tok, user) {
        setToken(tok);
        setUsername(user);
        const payload = JSON.parse(atob(tok.split(".")[1]));
        setTokenExpiry(payload.exp * 1000);
    }

    function handleLogout() {
        setToken(null);
        setUsername(null);
        setTokenExpiry(null);
        setView("book");
    }

    useEffect(() => {
        if (!tokenExpiry) return;
        const tick = setInterval(() => {
            const left = tokenExpiry - Date.now();
            setTimeLeft(left);
            if (left <= 0) handleLogout();
            if (left <= 5 * 60 * 1000) {
                fetch(`${API}/auth/refresh`, {
                    method: "POST",
                    headers: { "Authorization": `Bearer ${token}` }
                }).then(r => r.json()).then(d => {
                    if (d.access_token) {
                        setToken(d.access_token);
                        const payload = JSON.parse(atob(d.access_token.split(".")[1]));
                        setTokenExpiry(payload.exp * 1000);
                    }
                }).catch(() => {});
            }
        }, 10000);
        return () => clearInterval(tick);
    }, [tokenExpiry, token]);

    if (!token) return <AuthPage onAuth={handleAuth} />;

    if (view === "portfolio") return (
        <Portfolio token={token} username={username} onBack={() => setView("book")} />
    );

    return (
        <BookView
            symbol="AAPL"
            token={token}
            username={username}
            onLogout={handleLogout}
            onPortfolio={() => setView("portfolio")}
            tokenTimeLeft={timeLeft}
        />
    );
}