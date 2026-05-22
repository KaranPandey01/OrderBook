import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'build'))

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import httpx
import ob_engine as eng
from api.models import OrderReq, TradeResp, LevelResp, BookResp
from api.auth import init_db, create_user, authenticate_user, make_token, get_current_user, get_db
from datetime import datetime

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
init_db()

books: dict[str, eng.OrderBook] = {}

def get_book(sym: str) -> eng.OrderBook:
    if sym not in books:
        books[sym] = eng.OrderBook(sym)
    return books[sym]

def init_user_tables():
    conn = get_db()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS user_trades (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL,
            symbol TEXT NOT NULL,
            buy_oid INTEGER,
            sell_oid INTEGER,
            exec_px REAL,
            exec_qty INTEGER,
            created_at TEXT NOT NULL
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS user_orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL,
            oid INTEGER NOT NULL,
            symbol TEXT NOT NULL,
            side TEXT NOT NULL,
            px REAL NOT NULL,
            qty INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'resting',
            created_at TEXT NOT NULL
        )
    """)
    conn.commit()
    conn.close()

init_user_tables()

class SignupReq(BaseModel):
    username: str
    email: str
    password: str

class LoginReq(BaseModel):
    username: str
    password: str

class AIReq(BaseModel):
    messages: list
    system: str

@app.post("/auth/signup")
def signup(req: SignupReq):
    if len(req.username) < 3:
        raise HTTPException(400, "username must be at least 3 characters")
    if len(req.password) < 6:
        raise HTTPException(400, "password must be at least 6 characters")
    user = create_user(req.username, req.email, req.password)
    token = make_token(user["username"])
    return {"access_token": token, "token_type": "bearer", "username": user["username"]}

@app.post("/auth/login")
def login(req: LoginReq):
    user = authenticate_user(req.username, req.password)
    token = make_token(user["username"])
    return {"access_token": token, "token_type": "bearer", "username": user["username"]}

@app.get("/auth/me")
def me(username: str = Depends(get_current_user)):
    return {"username": username}

@app.post("/order/{symbol}", response_model=list[TradeResp])
def submit_order(symbol: str, req: OrderReq, username: str = Depends(get_current_user)):
    book = get_book(symbol)
    side = eng.Side.BUY if req.side == "BUY" else eng.Side.SELL
    trades = book.submit(req.oid, side, req.px, req.qty, req.ts)
    conn = get_db()
    now = datetime.utcnow().isoformat()
    conn.execute(
        "INSERT INTO user_orders (username, oid, symbol, side, px, qty, status, created_at) VALUES (?,?,?,?,?,?,?,?)",
        (username, req.oid, symbol, req.side, req.px, req.qty, "filled" if trades else "resting", now)
    )
    for t in trades:
        conn.execute(
            "INSERT INTO user_trades (username, symbol, buy_oid, sell_oid, exec_px, exec_qty, created_at) VALUES (?,?,?,?,?,?,?)",
            (username, symbol, t.buy_oid, t.sell_oid, t.exec_px, t.exec_qty, now)
        )
    conn.commit()
    conn.close()
    return [TradeResp(buy_oid=t.buy_oid, sell_oid=t.sell_oid, exec_px=t.exec_px, exec_qty=t.exec_qty) for t in trades]

@app.delete("/order/{symbol}/{oid}")
def cancel_order(symbol: str, oid: int, username: str = Depends(get_current_user)):
    book = get_book(symbol)
    try:
        book.cancel(oid)
    except RuntimeError as e:
        raise HTTPException(404, str(e))
    conn = get_db()
    conn.execute("UPDATE user_orders SET status='cancelled' WHERE username=? AND oid=?", (username, oid))
    conn.commit()
    conn.close()
    return {"status": "cancelled", "oid": oid}

@app.get("/book/{symbol}", response_model=BookResp)
def get_book_snap(symbol: str, depth: int = 10, username: str = Depends(get_current_user)):
    book = get_book(symbol)
    snap = book.snapshot(depth)
    return BookResp(
        symbol=symbol,
        bids=[LevelResp(px=l.px, total_qty=l.total_qty) for l in snap.bids],
        asks=[LevelResp(px=l.px, total_qty=l.total_qty) for l in snap.asks],
        spread=snap.spread,
        order_count=book.order_count()
    )

@app.get("/history/{symbol}")
def get_history(symbol: str, username: str = Depends(get_current_user)):
    conn = get_db()
    trades = conn.execute(
        "SELECT * FROM user_trades WHERE username=? AND symbol=? ORDER BY created_at ASC LIMIT 200",
        (username, symbol)
    ).fetchall()
    orders = conn.execute(
        "SELECT * FROM user_orders WHERE username=? AND symbol=? ORDER BY created_at DESC LIMIT 200",
        (username, symbol)
    ).fetchall()
    conn.close()
    return {
        "trades": [dict(t) for t in trades],
        "orders": [dict(o) for o in orders]
    }

@app.post("/ai/chat")
async def ai_chat(req: AIReq, username: str = Depends(get_current_user)):
    key = GEMINI_API_KEY
    if not key:
        raise HTTPException(500, "GEMINI_API_KEY not set on server — restart uvicorn with $env:GEMINI_API_KEY=your_key")

    contents = []
    for m in req.messages:
        role = "model" if m["role"] == "assistant" else "user"
        contents.append({"role": role, "parts": [{"text": m["content"]}]})

    if not contents or contents[0]["role"] == "model":
        contents.insert(0, {"role": "user", "parts": [{"text": "hello"}]})

    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={key}"

    async with httpx.AsyncClient() as client:
        r = await client.post(
            url,
            json={
                "system_instruction": {"parts": [{"text": req.system}]},
                "contents": contents,
                "generationConfig": {"maxOutputTokens": 800, "temperature": 0.7}
            },
            timeout=30.0
        )
        data = r.json()
        if "error" in data:
            raise HTTPException(500, data["error"].get("message", "gemini error"))
        try:
            text = data["candidates"][0]["content"]["parts"][0]["text"]
        except (KeyError, IndexError):
            raise HTTPException(500, f"unexpected gemini response: {str(data)[:200]}")
        return {"text": text}

@app.get("/health")
def health():
    gemini_status = "configured" if GEMINI_API_KEY else "missing — set GEMINI_API_KEY env var"
    return {"status": "ok", "active_books": list(books.keys()), "gemini": gemini_status}