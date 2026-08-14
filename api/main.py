import sys
import os
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '.env'))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'build'))

from fastapi import FastAPI, HTTPException, Depends, APIRouter
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import httpx
import ob_engine as eng
from api.models import OrderReq, TradeResp, LevelResp, BookResp
from api.auth import (
    init_db, create_user, authenticate_user, make_token,
    get_current_user, get_token_info, get_db,
    get_portfolio, deposit_funds, withdraw_funds
)
from datetime import datetime
import sqlite3

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")

app = FastAPI()
api_router = APIRouter(prefix="/api")
init_db()

books: dict[str, eng.OrderBook] = {}

def get_book(sym: str) -> eng.OrderBook:
    if sym not in books:
        books[sym] = eng.OrderBook(sym)
    return books[sym]

def init_user_tables():
    conn = get_db()
    try:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS user_trades (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL,
                symbol TEXT NOT NULL,
                buy_oid INTEGER,
                sell_oid INTEGER,
                exec_px REAL,
                exec_qty INTEGER,
                side TEXT,
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
        conn.execute("""
            CREATE TABLE IF NOT EXISTS holdings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL,
                symbol TEXT NOT NULL,
                qty INTEGER NOT NULL DEFAULT 0,
                avg_px REAL NOT NULL DEFAULT 0.0,
                updated_at TEXT NOT NULL,
                UNIQUE(username, symbol)
            )
        """)
        try:
            conn.execute("ALTER TABLE user_trades ADD COLUMN side TEXT")
        except sqlite3.OperationalError:
            pass
        conn.commit()
    finally:
        conn.close()

init_user_tables()


class SignupReq(BaseModel):
    username: str
    email: str
    password: str

class LoginReq(BaseModel):
    username: str
    password: str

class DepositReq(BaseModel):
    amount: float

class WithdrawReq(BaseModel):
    amount: float

class AIReq(BaseModel):
    messages: list
    system: str


@api_router.post("/auth/signup")
def signup(req: SignupReq):
    if len(req.username) < 3:
        raise HTTPException(400, "username must be at least 3 characters")
    if len(req.password) < 6:
        raise HTTPException(400, "password must be at least 6 characters")
    user = create_user(req.username, req.email, req.password)
    token = make_token(user["username"])
    return {"access_token": token, "token_type": "bearer", "username": user["username"]}

@api_router.post("/auth/login")
def login(req: LoginReq):
    user = authenticate_user(req.username, req.password)
    token = make_token(user["username"])
    return {"access_token": token, "token_type": "bearer", "username": user["username"]}

@api_router.get("/auth/me")
def me(payload: dict = Depends(get_token_info)):
    return {"username": payload.get("sub"), "issued_at": payload.get("iat"), "expires_at": payload.get("exp")}

@api_router.post("/auth/refresh")
def refresh_token(username: str = Depends(get_current_user)):
    token = make_token(username)
    return {"access_token": token, "token_type": "bearer", "username": username}


@api_router.get("/portfolio")
def portfolio(username: str = Depends(get_current_user)):
    conn = get_db()
    try:
        p = conn.execute("SELECT * FROM portfolio WHERE username=?", (username,)).fetchone()
        if not p:
            conn.execute(
                "INSERT INTO portfolio (username, cash_balance, total_deposited, updated_at) VALUES (?,?,?,?)",
                (username, 0.0, 0.0, datetime.utcnow().isoformat())
            )
            conn.commit()
            p = conn.execute("SELECT * FROM portfolio WHERE username=?", (username,)).fetchone()
        holdings = conn.execute("SELECT * FROM holdings WHERE username=? AND qty > 0", (username,)).fetchall()
        txns = conn.execute("SELECT * FROM transactions WHERE username=? ORDER BY created_at DESC LIMIT 100", (username,)).fetchall()
        holdings_list = [dict(h) for h in holdings]
        txns_list = [dict(t) for t in txns]
        invested = sum(h["qty"] * h["avg_px"] for h in holdings_list)
        return {
            "cash_balance": p["cash_balance"],
            "total_deposited": p["total_deposited"],
            "invested_value": invested,
            "total_value": p["cash_balance"] + invested,
            "holdings": holdings_list,
            "transactions": txns_list,
        }
    finally:
        conn.close()

@api_router.post("/portfolio/deposit")
def deposit(req: DepositReq, username: str = Depends(get_current_user)):
    return deposit_funds(username, req.amount)

@api_router.post("/portfolio/withdraw")
def withdraw(req: WithdrawReq, username: str = Depends(get_current_user)):
    return withdraw_funds(username, req.amount)


@api_router.post("/order/{symbol}", response_model=list[TradeResp])
def submit_order(symbol: str, req: OrderReq, username: str = Depends(get_current_user)):
    conn = get_db()
    try:
        now = datetime.utcnow().isoformat()

        if req.side == "BUY":
            cost = req.px * req.qty
            portfolio = conn.execute("SELECT cash_balance FROM portfolio WHERE username=?", (username,)).fetchone()
            bal = portfolio["cash_balance"] if portfolio else 0
            if bal < cost:
                raise HTTPException(400, f"insufficient funds. need ₹{cost:.2f}, have ₹{bal:.2f}")

        book = get_book(symbol)
        side = eng.Side.BUY if req.side == "BUY" else eng.Side.SELL
        trades = book.submit(req.oid, side, req.px, req.qty, req.ts)

        if req.side == "BUY":
            actual_cost = sum(t.exec_px * t.exec_qty for t in trades)
            reserved_but_not_used = req.px * req.qty - actual_cost
            conn.execute(
                "UPDATE portfolio SET cash_balance = cash_balance - ?, updated_at=? WHERE username=?",
                (actual_cost, now, username)
            )
            if actual_cost > 0:
                new_bal = conn.execute("SELECT cash_balance FROM portfolio WHERE username=?", (username,)).fetchone()["cash_balance"]
                conn.execute(
                    "INSERT INTO transactions (username, txn_type, amount, description, balance_after, created_at) VALUES (?,?,?,?,?,?)",
                    (username, "BUY", actual_cost, f"BUY {req.qty} {symbol} @ ₹{req.px:.2f}", new_bal, now)
                )

        elif req.side == "SELL" and trades:
            proceeds = sum(t.exec_px * t.exec_qty for t in trades)
            conn.execute(
                "UPDATE portfolio SET cash_balance = cash_balance + ?, updated_at=? WHERE username=?",
                (proceeds, now, username)
            )
            new_bal = conn.execute("SELECT cash_balance FROM portfolio WHERE username=?", (username,)).fetchone()["cash_balance"]
            conn.execute(
                "INSERT INTO transactions (username, txn_type, amount, description, balance_after, created_at) VALUES (?,?,?,?,?,?)",
                (username, "SELL", proceeds, f"SELL {sum(t.exec_qty for t in trades)} {symbol}", new_bal, now)
            )

        conn.execute(
            "INSERT INTO user_orders (username, oid, symbol, side, px, qty, status, created_at) VALUES (?,?,?,?,?,?,?,?)",
            (username, req.oid, symbol, req.side, req.px, req.qty, "filled" if trades else "resting", now)
        )

        for t in trades:
            conn.execute(
                "INSERT INTO user_trades (username, symbol, buy_oid, sell_oid, exec_px, exec_qty, side, created_at) VALUES (?,?,?,?,?,?,?,?)",
                (username, symbol, t.buy_oid, t.sell_oid, t.exec_px, t.exec_qty, req.side, now)
            )
            if req.side == "BUY":
                existing = conn.execute("SELECT * FROM holdings WHERE username=? AND symbol=?", (username, symbol)).fetchone()
                if existing:
                    new_qty = existing["qty"] + t.exec_qty
                    new_avg = (existing["avg_px"] * existing["qty"] + t.exec_px * t.exec_qty) / new_qty
                    conn.execute("UPDATE holdings SET qty=?, avg_px=?, updated_at=? WHERE username=? AND symbol=?", (new_qty, new_avg, now, username, symbol))
                else:
                    conn.execute("INSERT INTO holdings (username, symbol, qty, avg_px, updated_at) VALUES (?,?,?,?,?)", (username, symbol, t.exec_qty, t.exec_px, now))
            elif req.side == "SELL":
                existing = conn.execute("SELECT * FROM holdings WHERE username=? AND symbol=?", (username, symbol)).fetchone()
                if existing:
                    new_qty = max(0, existing["qty"] - t.exec_qty)
                    conn.execute("UPDATE holdings SET qty=?, updated_at=? WHERE username=? AND symbol=?", (new_qty, now, username, symbol))

        conn.commit()
        return [TradeResp(buy_oid=t.buy_oid, sell_oid=t.sell_oid, exec_px=t.exec_px, exec_qty=t.exec_qty) for t in trades]

    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        conn.close()


@api_router.delete("/order/{symbol}/{oid}")
def cancel_order(symbol: str, oid: int, username: str = Depends(get_current_user)):
    conn = get_db()
    try:
        order = conn.execute(
            "SELECT * FROM user_orders WHERE username=? AND oid=? AND status='resting'",
            (username, oid)
        ).fetchone()
        book = get_book(symbol)
        try:
            book.cancel(oid)
        except RuntimeError as e:
            raise HTTPException(404, str(e))
        now = datetime.utcnow().isoformat()
        if order and order["side"] == "BUY":
            refund = order["px"] * order["qty"]
            conn.execute("UPDATE portfolio SET cash_balance = cash_balance + ?, updated_at=? WHERE username=?", (refund, now, username))
            new_bal = conn.execute("SELECT cash_balance FROM portfolio WHERE username=?", (username,)).fetchone()["cash_balance"]
            conn.execute(
                "INSERT INTO transactions (username, txn_type, amount, description, balance_after, created_at) VALUES (?,?,?,?,?,?)",
                (username, "REFUND", refund, f"Cancelled BUY {order['qty']} {symbol} @ ₹{order['px']:.2f}", new_bal, now)
            )
        conn.execute("UPDATE user_orders SET status='cancelled' WHERE username=? AND oid=?", (username, oid))
        conn.commit()
        return {"status": "cancelled", "oid": oid}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        conn.close()


@api_router.get("/book/{symbol}", response_model=BookResp)
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


@api_router.get("/history/{symbol}")
def get_history(symbol: str, username: str = Depends(get_current_user)):
    conn = get_db()
    try:
        trades = conn.execute(
            "SELECT * FROM user_trades WHERE username=? AND symbol=? ORDER BY created_at ASC LIMIT 200",
            (username, symbol)
        ).fetchall()
        orders = conn.execute(
            "SELECT * FROM user_orders WHERE username=? AND symbol=? ORDER BY created_at DESC LIMIT 200",
            (username, symbol)
        ).fetchall()
        return {"trades": [dict(t) for t in trades], "orders": [dict(o) for o in orders]}
    finally:
        conn.close()


@api_router.post("/ai/chat")
async def ai_chat(req: AIReq, username: str = Depends(get_current_user)):
    key = GEMINI_API_KEY
    if not key:
        raise HTTPException(500, "GEMINI_API_KEY not set on server")
    contents = []
    for m in req.messages:
        role = "model" if m["role"] == "assistant" else "user"
        contents.append({"role": role, "parts": [{"text": m["content"]}]})
    if not contents or contents[0]["role"] == "model":
        contents.insert(0, {"role": "user", "parts": [{"text": "hello"}]})
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_API_KEY}"
    async with httpx.AsyncClient() as client:
        r = await client.post(url, json={
            "system_instruction": {"parts": [{"text": req.system}]},
            "contents": contents,
            "generationConfig": {"maxOutputTokens": 800, "temperature": 0.7}
        }, timeout=30.0)
        data = r.json()
        if "error" in data:
            raise HTTPException(500, data["error"].get("message", "gemini error"))
        try:
            text = data["candidates"][0]["content"]["parts"][0]["text"]
        except (KeyError, IndexError):
            raise HTTPException(500, f"unexpected gemini response: {str(data)[:200]}")
        return {"text": text}


@api_router.get("/health")
def health():
    return {"status": "ok", "active_books": list(books.keys()), "gemini": "configured" if GEMINI_API_KEY else "missing"}


app.include_router(api_router)

# Serve the React build. html=True falls back to index.html for any
# unmatched GET path (client-side routes like /portfolio, /dashboard),
# so refreshing on those pages loads the app instead of 404ing.
# This MUST be the last thing registered — it's a catch-all mount.
app.mount("/", StaticFiles(directory="static", html=True), name="static")