import { useState } from "react";
import AuthPage from "./AuthPage";
import BookView from "./BookView";

export default function App() {
    const [token, setToken] = useState(null);
    const [username, setUsername] = useState(null);

    function handleAuth(tok, user) {
        setToken(tok);
        setUsername(user);
    }

    function handleLogout() {
        setToken(null);
        setUsername(null);
    }

    if (!token) return <AuthPage onAuth={handleAuth} />;
    return <BookView symbol="AAPL" token={token} username={username} onLogout={handleLogout} />;
}