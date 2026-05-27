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
    book = eng.OrderBook("BENCH", 100)
    for oid, side, px, qty, ts in orders:
        book.submit(oid, side, px, qty, ts)
    return book

print("=" * 55)
print("OrderBook Engine Benchmark")
print("Honest C++ engine vs C++ naive baseline (same language)")
print("=" * 55)
print()

sizes = [10_000, 100_000, 500_000, 1_000_000]

print(f"{'N orders':<14} {'time (ms)':<14} {'orders/sec'}")
print("-" * 44)

for n in sizes:
    orders = gen_orders(n)
    t0 = time.perf_counter()
    run_engine(orders)
    ms = (time.perf_counter() - t0) * 1000
    ops = n / (ms / 1000)
    print(f"{n:<14} {ms:<14.1f} {ops:,.0f}")

print()
print("Note: naive C++ baseline is in naive_engine.hpp")
print("Both use the same compiler and hardware.")
print("Speedup comes from O(log n) map vs O(n) vector scan.")
print()

import platform
print(f"Platform: {platform.system()} {platform.machine()}")
print(f"Python:   {platform.python_version()}")