import sqlite3
import os
import bcrypt
from datetime import datetime, timedelta
from jose import JWTError, jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

SECRET = "ob_secret_key_change_in_prod_32chars"
ALGO = "HS256"
TOKEN_EXP_HOURS = 24
DB_PATH = os.path.join(os.path.dirname(__file__), "users.db")

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

def get_db():
    conn = sqlite3.connect(DB_PATH, timeout=30, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA busy_timeout=30000")
    return conn

def init_db():
    conn = get_db()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            hashed_pw TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS portfolio (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            cash_balance REAL NOT NULL DEFAULT 0.0,
            total_deposited REAL NOT NULL DEFAULT 0.0,
            updated_at TEXT NOT NULL
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL,
            txn_type TEXT NOT NULL,
            amount REAL NOT NULL,
            description TEXT,
            balance_after REAL NOT NULL,
            created_at TEXT NOT NULL
        )
    """)
    conn.commit()
    conn.close()

def hash_pw(pw: str) -> str:
    return bcrypt.hashpw(pw[:72].encode(), bcrypt.gensalt()).decode()

def verify_pw(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain[:72].encode(), hashed.encode())

def make_token(username: str) -> str:
    exp = datetime.utcnow() + timedelta(hours=TOKEN_EXP_HOURS)
    return jwt.encode({"sub": username, "exp": exp, "iat": datetime.utcnow().timestamp()}, SECRET, algorithm=ALGO)

def get_current_user(token: str = Depends(oauth2_scheme)) -> str:
    err = HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid or expired token", headers={"WWW-Authenticate": "Bearer"})
    try:
        payload = jwt.decode(token, SECRET, algorithms=[ALGO])
        username = payload.get("sub")
        if not username:
            raise err
        return username
    except JWTError:
        raise err

def get_token_info(token: str = Depends(oauth2_scheme)) -> dict:
    err = HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid token")
    try:
        return jwt.decode(token, SECRET, algorithms=[ALGO])
    except JWTError:
        raise err

def create_user(username: str, email: str, password: str) -> dict:
    conn = get_db()
    try:
        conn.execute(
            "INSERT INTO users (username, email, hashed_pw, created_at) VALUES (?, ?, ?, ?)",
            (username, email, hash_pw(password), datetime.utcnow().isoformat())
        )
        conn.execute(
            "INSERT INTO portfolio (username, cash_balance, total_deposited, updated_at) VALUES (?, ?, ?, ?)",
            (username, 0.0, 0.0, datetime.utcnow().isoformat())
        )
        conn.commit()
        return {"username": username, "email": email}
    except sqlite3.IntegrityError as e:
        msg = str(e)
        if "username" in msg:
            raise HTTPException(status_code=400, detail="username already taken")
        raise HTTPException(status_code=400, detail="email already registered")
    finally:
        conn.close()

def authenticate_user(username: str, password: str) -> dict:
    conn = get_db()
    try:
        row = conn.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
        if not row or not verify_pw(password, row["hashed_pw"]):
            raise HTTPException(status_code=401, detail="incorrect username or password")
        return {"username": row["username"], "email": row["email"]}
    finally:
        conn.close()

def get_portfolio(username: str) -> dict:
    conn = get_db()
    try:
        row = conn.execute("SELECT * FROM portfolio WHERE username = ?", (username,)).fetchone()
        if not row:
            conn.execute(
                "INSERT INTO portfolio (username, cash_balance, total_deposited, updated_at) VALUES (?, ?, ?, ?)",
                (username, 0.0, 0.0, datetime.utcnow().isoformat())
            )
            conn.commit()
            row = conn.execute("SELECT * FROM portfolio WHERE username = ?", (username,)).fetchone()
        return dict(row)
    finally:
        conn.close()

def deposit_funds(username: str, amount: float) -> dict:
    if amount <= 0:
        raise HTTPException(400, "deposit amount must be positive")
    if amount > 10_000_000:
        raise HTTPException(400, "maximum single deposit is ₹1,00,00,000")
    conn = get_db()
    try:
        portfolio = conn.execute("SELECT * FROM portfolio WHERE username = ?", (username,)).fetchone()
        if not portfolio:
            conn.execute(
                "INSERT INTO portfolio (username, cash_balance, total_deposited, updated_at) VALUES (?, ?, ?, ?)",
                (username, 0.0, 0.0, datetime.utcnow().isoformat())
            )
            conn.commit()
            portfolio = conn.execute("SELECT * FROM portfolio WHERE username = ?", (username,)).fetchone()
        new_balance = portfolio["cash_balance"] + amount
        new_deposited = portfolio["total_deposited"] + amount
        now = datetime.utcnow().isoformat()
        conn.execute(
            "UPDATE portfolio SET cash_balance=?, total_deposited=?, updated_at=? WHERE username=?",
            (new_balance, new_deposited, now, username)
        )
        conn.execute(
            "INSERT INTO transactions (username, txn_type, amount, description, balance_after, created_at) VALUES (?,?,?,?,?,?)",
            (username, "DEPOSIT", amount, "Funds deposited", new_balance, now)
        )
        conn.commit()
        return {"cash_balance": new_balance, "total_deposited": new_deposited}
    finally:
        conn.close()

def withdraw_funds(username: str, amount: float) -> dict:
    if amount <= 0:
        raise HTTPException(400, "withdrawal amount must be positive")
    conn = get_db()
    try:
        portfolio = conn.execute("SELECT * FROM portfolio WHERE username = ?", (username,)).fetchone()
        if not portfolio or portfolio["cash_balance"] < amount:
            bal = portfolio["cash_balance"] if portfolio else 0
            raise HTTPException(400, f"insufficient balance. available: ₹{bal:.2f}")
        new_balance = portfolio["cash_balance"] - amount
        now = datetime.utcnow().isoformat()
        conn.execute("UPDATE portfolio SET cash_balance=?, updated_at=? WHERE username=?", (new_balance, now, username))
        conn.execute(
            "INSERT INTO transactions (username, txn_type, amount, description, balance_after, created_at) VALUES (?,?,?,?,?,?)",
            (username, "WITHDRAW", amount, "Funds withdrawn", new_balance, now)
        )
        conn.commit()
        return {"cash_balance": new_balance}
    finally:
        conn.close()