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
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
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
    conn.commit()
    conn.close()

def hash_pw(pw: str) -> str:
    return bcrypt.hashpw(pw[:72].encode(), bcrypt.gensalt()).decode()

def verify_pw(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain[:72].encode(), hashed.encode())

def make_token(username: str) -> str:
    exp = datetime.utcnow() + timedelta(hours=TOKEN_EXP_HOURS)
    return jwt.encode({"sub": username, "exp": exp}, SECRET, algorithm=ALGO)

def get_current_user(token: str = Depends(oauth2_scheme)) -> str:
    err = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="invalid or expired token",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET, algorithms=[ALGO])
        username = payload.get("sub")
        if not username:
            raise err
        return username
    except JWTError:
        raise err

def create_user(username: str, email: str, password: str) -> dict:
    conn = get_db()
    try:
        conn.execute(
            "INSERT INTO users (username, email, hashed_pw, created_at) VALUES (?, ?, ?, ?)",
            (username, email, hash_pw(password), datetime.utcnow().isoformat())
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
    row = conn.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
    conn.close()
    if not row or not verify_pw(password, row["hashed_pw"]):
        raise HTTPException(status_code=401, detail="incorrect username or password")
    return {"username": row["username"], "email": row["email"]}