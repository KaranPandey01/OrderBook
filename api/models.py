from pydantic import BaseModel
from typing import Literal

class OrderReq(BaseModel):
    oid: int
    side: Literal["BUY", "SELL"]
    px: float
    qty: int
    ts: int

class TradeResp(BaseModel):
    buy_oid: int
    sell_oid: int
    exec_px: float
    exec_qty: int

class LevelResp(BaseModel):
    px: float
    total_qty: int

class BookResp(BaseModel):
    symbol: str
    bids: list[LevelResp]
    asks: list[LevelResp]
    spread: float
    order_count: int