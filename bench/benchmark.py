import sys, os, time, random
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'build'))

import ob_engine as eng

random.seed(42)

def gen_orders(n, mid=150.0, spread=2.0):
    orders = []
    for i in range(n):
        side = eng.Side.BUY if random.random() < 0.5 else eng.Side.SELL
        px = round(mid + random.gauss(0, spread), 2)
        qty = random.randint(1, 200)
        orders.append((i, side, px, qty, i))
    return orders

def run_engine(orders):
    book = eng.OrderBook("BENCH")
    for oid, side, px, qty, ts in orders:
        book.submit(oid, side, px, qty, ts)
    return book

def naive_baseline(orders):
    bids, asks = [], []
    for oid, side, px, qty, ts in orders:
        opp = asks if side == eng.Side.BUY else bids
        remaining = qty
        survivors = []
        for o in opp:
            if remaining == 0:
                survivors.append(o)
                continue
            cross = (side == eng.Side.BUY and px >= o[2]) or \
                    (side == eng.Side.SELL and px <= o[2])
            if cross:
                fill = min(remaining, o[3])
                remaining -= fill
                if o[3] - fill > 0:
                    survivors.append((o[0], o[1], o[2], o[3]-fill, o[4]))
            else:
                survivors.append(o)
        if side == eng.Side.BUY:
            asks = survivors
            if remaining > 0: bids.append((oid, side, px, remaining, ts))
        else:
            bids = survivors
            if remaining > 0: asks.append((oid, side, px, remaining, ts))

print("generating orders...")
print()

naive_sizes  = [1_000, 5_000, 10_000]
engine_sizes = [10_000, 100_000, 500_000, 1_000_000]

print("--- naive vs engine (small N) ---")
print(f"{'N':<12} {'engine (ms)':<16} {'naive (ms)':<16} {'speedup'}")
print("-" * 55)

for n in naive_sizes:
    orders = gen_orders(n)

    t0 = time.perf_counter()
    run_engine(orders)
    eng_ms = (time.perf_counter() - t0) * 1000

    t0 = time.perf_counter()
    naive_baseline(orders)
    naive_ms = (time.perf_counter() - t0) * 1000

    print(f"{n:<12} {eng_ms:<16.2f} {naive_ms:<16.2f} {naive_ms/eng_ms:.1f}x")

print()
print("--- engine throughput (large N) ---")
print(f"{'N':<12} {'time (ms)':<16} {'orders/sec'}")
print("-" * 45)

for n in engine_sizes:
    orders = gen_orders(n)
    t0 = time.perf_counter()
    run_engine(orders)
    ms = (time.perf_counter() - t0) * 1000
    ops = n / (ms / 1000)
    print(f"{n:<12} {ms:<16.1f} {ops:,.0f}")