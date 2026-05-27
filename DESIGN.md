# Design Decisions

Every non-obvious choice in this codebase is documented here. These are the questions you'll be asked in a technical interview.

---

## 1. Why integer ticks instead of double for prices?

**The bug with double**: `bids_` and `asks_` are keyed on price. If prices are `double`, two orders at "100.10" could produce different keys due to IEEE 754 rounding — `100.10` stored in memory is actually `100.09999999999999431565...`. This means orders at the same price level could end up in different map buckets, which is a silent correctness bug in production.

**The fix**: All prices are stored as `int64_t` in ticks. A tick size of `100` means prices are in units of `0.01` — so `$150.00` becomes `15000` ticks internally. Conversion happens exactly once at the API boundary.

```cpp
int64_t tick_size_micros = 100;  // 0.01 precision
int64_t px_ticks = static_cast<int64_t>(std::round(px * tick_size_micros));
```

Integer comparison is exact. Two orders at `$100.10` always hash to `10010`.

---

## 2. Why std::map over std::unordered_map for price levels?

`std::map<int64_t, deque<Order>>` gives:
- `O(log n)` insert and delete
- `O(1)` best bid/ask via `begin()` — the map is always sorted
- Efficient range queries for partial fills across multiple levels

`std::unordered_map` would give `O(1)` average insert/delete but:
- No ordering — you'd need a separate min/max tracker updated on every insert/delete
- That tracker adds complexity and a second data structure to keep in sync
- Cache behavior is worse for the common case (accessing best price only)

The sorted map wins for an order book because **best price access is the hot path**.

---

## 3. Why std::deque over std::vector for orders within a price level?

Each price level holds a `std::deque<Order>` not a `std::vector<Order>`.

Price-time priority means the **oldest order at a price level fills first** (FIFO). This means we always pop from the front. For `std::vector`, `erase(begin())` is `O(n)` — it shifts every remaining element. For `std::deque`, `pop_front()` is `O(1)`.

More critically: the cancel index stores a direct `std::deque::iterator` pointing into the deque. For `std::vector`, erasing any element invalidates all iterators — the cancel index would be corrupted. `std::deque` only invalidates iterators at the erased position; all other iterators remain valid.

---

## 4. Why store a direct iterator in the cancel index instead of just the price?

The cancel index is `unordered_map<uint64_t, ORef>` where `ORef` holds:
```cpp
struct ORef {
    int64_t px_ticks;
    Side side;
    std::deque<Order>::iterator it;  // direct pointer into the deque
};
```

**Alternative**: store just `px_ticks` and `side`, then linear-scan the deque on cancel.

**Why the iterator wins**: A price level under heavy load could have hundreds of orders. Linear scan is `O(depth_of_level)`. With the iterator, cancel is `O(1)` — hash lookup plus a constant-time deque erase. Real exchanges have cancel rates as high as 90% of order flow. At 1M orders/sec, the difference between `O(1)` and `O(n)` cancel is the difference between a working system and a melting one.

---

## 5. Why SQLite instead of PostgreSQL?

SQLite is appropriate here because:
- Single-process writes (one uvicorn worker)
- WAL mode enables concurrent reads alongside writes
- No separate database server to manage for a demo/portfolio project

In production with multiple API workers you'd switch to PostgreSQL with a connection pool (asyncpg + SQLAlchemy async). The schema and query patterns in this codebase map directly to PostgreSQL with no logic changes.

---

## 6. Why `allow_origins=["*"]` in CORS?

Acceptable for a portfolio project where the API is not publicly exposed. In production this would be restricted to the specific frontend domain:

```python
allow_origins=["https://your-domain.com"]
```

---

## 7. Benchmark methodology note

The benchmark (`bench/benchmark.py`) measures throughput of the C++ engine called via pybind11. The naive baseline is a pure C++ implementation (`engine/naive_engine.hpp`) — same language, same compiler, same machine. This is an honest apples-to-apples comparison of algorithmic complexity: `O(log n)` sorted map vs `O(n)` vector scan.

Earlier versions of this benchmark compared against a Python list baseline, which was not a fair comparison (language speed, not algorithm speed). That was corrected.