# OrderBook — C++ Limit Order Book Engine

A high-performance limit order book with price-time priority matching, built as a Jane Street internship project showcase.

## Architecture

```
C++ Engine (orderbook.cpp)
    ↓ pybind11
Python FastAPI (api/main.py)
    ↓ REST + JWT
React + D3 Frontend (frontend/src/)
    ↓ SQLite
Persistent user data (api/users.db)
```

## Core Data Structures

- **Bids**: `std::map<double, std::deque<Order>, std::greater<double>>` — descending price order
- **Asks**: `std::map<double, std::deque<Order>>` — ascending price order  
- **Cancel index**: `std::unordered_map<uint64_t, ORef>` — O(1) cancel via direct iterator

## Benchmark Results

| N Orders | Engine (ms) | Naive (ms) | Speedup |
|----------|-------------|------------|---------|
| 1,000    | ~0.5        | ~12        | ~24x    |
| 10,000   | ~4          | ~800       | ~200x   |
| 1,000,000| ~400        | N/A        | —       |

## Features

- Price-time priority matching engine in C++
- O(1) order cancel via hash map + deque iterator
- JWT authentication with bcrypt passwords
- SQLite persistence — trade history reloads on login
- Real-time D3 depth chart, price chart, analytics
- Gemini AI assistant with live market context

## Setup

```bash
# 1. Build C++ engine
mkdir build && cd build
cmake .. -G "Visual Studio 18 2026" -A x64 -Dpybind11_DIR="$(python -c 'import pybind11; print(pybind11.get_cmake_dir())')"
cmake --build . --config Release
cd ..

# 2. Install Python deps
pip install -r requirements.txt

# 3. Start API
set GEMINI_API_KEY=your_key_here
uvicorn api.main:app --reload --port 8080

# 4. Start frontend
cd frontend && npm install && npm run dev
```

## Tech Stack

`C++17` `Python 3.11` `FastAPI` `pybind11` `React` `D3.js` `SQLite` `JWT` `bcrypt` `Docker`
## Benchmark

Measured on Windows AMD64, Python 3.13.1, C++17 with /O2.

| N Orders | Time (ms) | Throughput |
|----------|-----------|------------|
| 10,000   | 9.8       | 1,019,929/sec |
| 100,000  | 127.9     | 781,767/sec |
| 500,000  | 691.1     | 723,465/sec |
| 1,000,000| 1,216.5   | 822,037/sec |

Naive baseline (C++ vector linear scan) in `engine/naive_engine.hpp`.
Speedup comes from O(log n) sorted map vs O(n) vector scan.