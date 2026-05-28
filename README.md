<div align="center">

# ◈ OrderBook Engine

**A high-performance limit order book with price-time priority matching, built in C++17**

[![C++17](https://img.shields.io/badge/C%2B%2B-17-blue?style=flat-square&logo=cplusplus)](https://isocpp.org/)
[![Python](https://img.shields.io/badge/Python-3.13-blue?style=flat-square&logo=python)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-green?style=flat-square&logo=fastapi)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-18-blue?style=flat-square&logo=react)](https://react.dev)
[![License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](LICENSE)

*Designed to demonstrate the exact systems engineering patterns used in production trading infrastructure*

[Architecture](#architecture) • [Benchmark](#benchmark) • [Design Decisions](#design-decisions) • [Setup](#setup) • [API](#api-reference)

</div>

---

## What This Is

A production-grade limit order book engine that processes **820,000+ orders/second** sustained, built from first principles. The core matching engine is C++17 with integer tick pricing to eliminate IEEE 754 floating-point correctness bugs — the same class of issue that causes silent failures in naive implementations.

This is not a toy. Every design decision is documented, benchmarked, and defensible under technical scrutiny.

---

## Benchmark

*Measured on Windows AMD64, Python 3.13.1, C++17 compiled with MSVC /O2*
*Engine called via pybind11 — overhead included in measurements*

```
=======================================================
 OrderBook Engine Benchmark
 Honest C++ engine vs C++ naive baseline (same language)
=======================================================

 N Orders      Time (ms)      Throughput
 ──────────────────────────────────────────
 10,000         9.8           1,019,929/sec
 100,000        127.9           781,767/sec
 500,000        691.1           723,465/sec
 1,000,000    1,216.5           822,037/sec

 Platform: Windows AMD64  |  Python 3.13.1  |  C++17 MSVC
```

**Note on methodology**: The naive baseline is a pure C++ implementation (`engine/naive_engine.hpp`) — same language, same compiler, same machine. This is an honest algorithmic comparison: `O(log n)` sorted map vs `O(n)` vector scan. Earlier benchmarks that compared against a Python baseline have been removed as they measured language speed, not algorithm correctness.

**Why throughput drops at scale**: At 10K orders the book is shallow — matches clear quickly. At 1M orders the book accumulates depth, increasing map traversal and cache pressure. **822K/sec is the honest sustained number to cite.**

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                              │
│  React 18 + D3.js  ──  Live depth chart, price chart, analytics │
│  IBM Plex Mono UI  ──  Dark terminal aesthetic                   │
└────────────────────────┬────────────────────────────────────────┘
                         │ HTTP/REST  Authorization: Bearer <JWT>
┌────────────────────────▼────────────────────────────────────────┐
│                        API LAYER                                 │
│  FastAPI (Python)  ──  8 REST endpoints, CORS, Pydantic          │
│  JWT (HS256)       ──  24hr tokens, auto-refresh, bcrypt hashing │
│  SQLite + WAL      ──  Concurrent reads, portfolio persistence   │
│  python-dotenv     ──  Secure environment variable loading       │
└────────────────────────┬────────────────────────────────────────┘
                         │ pybind11 (.pyd shared library)
┌────────────────────────▼────────────────────────────────────────┐
│                     C++ MATCHING ENGINE                          │
│  std::map<int64_t, deque<Order>>  ──  Price-time priority        │
│  unordered_map<order_id, iterator>  ──  O(1) cancel              │
│  Integer tick pricing (int64_t)   ──  No floating-point bugs     │
│  Price-time priority FIFO         ──  Exchange-accurate fills    │
└─────────────────────────────────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────────┐
│                     PERSISTENCE LAYER                            │
│  SQLite (WAL mode)  ──  Users, portfolio, trades, orders         │
│  busy_timeout=30s   ──  Concurrent write protection              │
│  Per-user history   ──  Reloads on every login                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Core Data Structures

### Price Level Storage

```cpp
// Bids: descending price order — best bid always at begin()
std::map<int64_t, std::deque<Order>, std::greater<int64_t>> bids_;

// Asks: ascending price order — best ask always at begin()
std::map<int64_t, std::deque<Order>> asks_;

// O(1) cancel index — direct iterator into the deque
std::unordered_map<uint64_t, ORef> idx_;
```

**Why `int64_t` not `double`**: `$100.10` stored as IEEE 754 is `100.09999999999999431...`. Two orders at "the same price" could key to different map buckets. Fix: multiply by tick size (100) and store as `10010`. Integer comparison is exact.

**Why `std::map` not `std::unordered_map`**: The sorted map gives `O(1)` best price via `begin()` — no separate min/max tracker needed. For an order book where best bid/ask is the hot path, sorted order is not overhead, it's the feature.

**Why `std::deque` not `std::vector`**: `pop_front()` is `O(1)` on deque vs `O(n)` on vector. Cancel stores a direct `deque::iterator` — erasing from a vector invalidates all iterators, breaking the cancel index.

### Matching Loop

```
Incoming BUY order at price P:
  while book has asks AND best_ask <= P:
    fill as much as possible from front of best ask level (FIFO)
    generate Trade record
    decrement quantities
    if level exhausted: remove from map
  if remaining qty > 0: rest in bids at price P
```

Complexity: `O(k log n)` where `k` = number of price levels consumed, `n` = total price levels in book.

### Cancel in O(1)

```cpp
struct ORef {
    int64_t px_ticks;
    Side side;
    std::deque<Order>::iterator it;  // direct pointer into deque
};

void cancel(uint64_t oid) {
    auto& ref = idx_.at(oid);          // O(1) hash lookup
    auto& lvl = bids_.at(ref.px_ticks);
    lvl.erase(ref.it);                 // O(1) deque erase via iterator
    if (lvl.empty()) bids_.erase(ref.px_ticks);
    idx_.erase(oid);
}
```

---

## Features

### Trading Engine
- ✅ Price-time priority matching (exchange-accurate)
- ✅ Integer tick pricing — eliminates IEEE 754 correctness bugs
- ✅ O(1) order cancel via `unordered_map<order_id, deque::iterator>`
- ✅ Partial fills — remainder rests in book automatically
- ✅ Multi-level fills — single order sweeps multiple price levels
- ✅ Real-time spread calculation

### API & Auth
- ✅ JWT authentication (HS256, 24hr expiry, auto-refresh)
- ✅ bcrypt password hashing (direct, no passlib dependency)
- ✅ Protected routes — all trading endpoints require valid token
- ✅ Token expiry detection on frontend with silent refresh
- ✅ 8 REST endpoints with full Pydantic validation

### Portfolio System
- ✅ Deposit / withdraw funds (balance enforced on BUY orders)
- ✅ Real-time balance deduction on order submission
- ✅ Automatic refund on order cancel
- ✅ Holdings tracker with average price calculation
- ✅ Full transaction history (DEPOSIT, WITHDRAW, BUY, SELL, REFUND)

### Persistence
- ✅ SQLite with WAL mode — concurrent reads during writes
- ✅ `busy_timeout=30s` — eliminates "database is locked" errors
- ✅ Full session restore on login — trades, orders, price history, balance
- ✅ Per-user isolation — multiple users, separate portfolios

### Frontend Dashboard
- ✅ Live D3.js depth chart — smooth transitions, no flickering
- ✅ Price history chart — appears on first trade execution
- ✅ Volume-by-price analytics
- ✅ Order history table with timestamps
- ✅ Trade tape — real-time execution log
- ✅ Order blotter — resting orders with cancel button
- ✅ Crossing warning — detects instant execution before submit
- ✅ AI trading assistant — Gemini 2.5 Flash with live market context

---

## Project Structure

```
orderbook/
├── engine/
│   ├── orderbook.hpp          # Core data structures + class interface
│   ├── orderbook.cpp          # Matching engine implementation
│   ├── bindings.cpp           # pybind11 Python bridge
│   └── naive_engine.hpp       # C++ naive baseline for honest benchmarking
│
├── api/
│   ├── main.py                # FastAPI routes, Gemini AI proxy
│   ├── auth.py                # JWT, bcrypt, SQLite, portfolio operations
│   └── models.py              # Pydantic request/response schemas
│
├── frontend/
│   └── src/
│       ├── App.jsx            # Auth routing, JWT expiry handling
│       ├── AuthPage.jsx       # Login / signup
│       ├── BookView.jsx       # Full trading dashboard
│       └── Portfolio.jsx      # Deposit, withdraw, holdings, history
│
├── bench/
│   └── benchmark.py           # Throughput benchmark with honest baseline
│
├── DESIGN.md                  # Every data structure decision explained
├── CMakeLists.txt             # C++ build configuration
└── requirements.txt           # Python dependencies
```

---

## Setup

### Prerequisites

- Windows: Visual Studio Build Tools 2022+ with "Desktop development with C++"
- CMake 3.15+
- Python 3.11+
- Node.js 18+

### Build C++ Engine

```bash
# Install Python dependencies
pip install -r requirements.txt
pip install pybind11

# Get pybind11 cmake path
python -c "import pybind11; print(pybind11.get_cmake_dir())"

# Build (Windows)
mkdir build && cd build
cmake .. -G "Visual Studio 18 2026" -A x64 \
  -Dpybind11_DIR="<path from above command>"
cmake --build . --config Release
cd ..
copy build\Release\ob_engine.cp313-win_amd64.pyd build\

# Verify
python -c "import sys; sys.path.insert(0,'build'); import ob_engine; \
  b = ob_engine.OrderBook('AAPL', 100); print('engine ok:', b.order_count())"
```

### Environment

```bash
# Create .env in project root
echo "GEMINI_API_KEY=your_key_here" > .env
# Get free key at https://aistudio.google.com/apikey
```

### Run

```bash
# Terminal 1 — API (port 8080)
uvicorn api.main:app --reload --reload-dir api --port 8080

# Terminal 2 — Frontend (port 5173)
cd frontend && npm install && npm run dev
```

Open `http://localhost:5173`

### Benchmark

```bash
python bench/benchmark.py
```

---

## API Reference

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/auth/signup` | ❌ | Create account, returns JWT |
| POST | `/auth/login` | ❌ | Authenticate, returns JWT |
| GET | `/auth/me` | ✅ | Token info + expiry timestamp |
| POST | `/auth/refresh` | ✅ | Refresh JWT before expiry |
| GET | `/portfolio` | ✅ | Balance, holdings, transactions |
| POST | `/portfolio/deposit` | ✅ | Add funds |
| POST | `/portfolio/withdraw` | ✅ | Withdraw funds |
| POST | `/order/{symbol}` | ✅ | Submit order, returns trades |
| DELETE | `/order/{symbol}/{oid}` | ✅ | Cancel order, refunds BUY cost |
| GET | `/book/{symbol}` | ✅ | Snapshot: top N bid/ask levels |
| GET | `/history/{symbol}` | ✅ | User's trade + order history |
| POST | `/ai/chat` | ✅ | Gemini AI with live market context |
| GET | `/health` | ❌ | Server status + Gemini config check |

---

## Design Decisions

See [DESIGN.md](DESIGN.md) for full explanation of every non-obvious choice:

- Why `int64_t` ticks over `double` prices
- Why `std::map` over `std::unordered_map` for price levels
- Why `std::deque` over `std::vector` for time priority
- Why a direct iterator in the cancel index
- Why SQLite with WAL mode instead of PostgreSQL
- Benchmark methodology and why the naive baseline is C++

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Matching engine | C++17 | Performance, determinism |
| Price representation | `int64_t` ticks | Eliminates floating-point bugs |
| Python bridge | pybind11 | Zero-overhead C++→Python FFI |
| REST API | FastAPI | Async, Pydantic validation, OpenAPI |
| Authentication | JWT HS256 + bcrypt | Stateless, secure, industry standard |
| Database | SQLite + WAL mode | Concurrent reads, zero config |
| Frontend | React 18 + D3.js | Component model + SVG data viz |
| Build | CMake 3.15 | Cross-platform C++ build |
| AI Assistant | Gemini 2.5 Flash | Free tier, live market context |

---

## Known Limitations & Production Notes

- `allow_origins=["*"]` — acceptable for demo; production would restrict to specific domain
- SQLite — appropriate for single-process; swap for PostgreSQL + asyncpg under concurrent load
- Secret key hardcoded in `auth.py` — production uses AWS Parameter Store or Vault
- Single uvicorn worker — production uses gunicorn with multiple workers + nginx

These limitations are deliberate trade-offs for a portfolio project, not oversights.

---

<div align="center">

Built by [Karan Pandey](https://github.com/KaranPandey01) • SRM Institute of Science and Technology

*"The matching loop, the iterator-based cancel, the try_match lambda — these are clean and correct. You didn't write toy code."*

</div>