#pragma once
#include <map>
#include <deque>
#include <unordered_map>
#include <vector>
#include <string>
#include <functional>
#include <stdexcept>
#include <cstdint>
#include <cmath>

enum class Side { BUY, SELL };

inline int64_t to_ticks(double px, int64_t tick_size_micros) {
    return static_cast<int64_t>(std::round(px * tick_size_micros));
}

inline double from_ticks(int64_t ticks, int64_t tick_size_micros) {
    return static_cast<double>(ticks) / tick_size_micros;
}

struct Order {
    uint64_t oid;
    std::string sym;
    int64_t px_ticks;
    int qty;
    uint64_t ts;
    Side side;
};

struct Trade {
    uint64_t buy_oid;
    uint64_t sell_oid;
    int64_t exec_px_ticks;
    int exec_qty;
    double exec_px;
};

struct Level {
    double px;
    int64_t px_ticks;
    int total_qty;
};

struct BookSnap {
    std::vector<Level> bids;
    std::vector<Level> asks;
    double spread;
};

struct ORef {
    int64_t px_ticks;
    Side side;
    std::deque<Order>::iterator it;
};

class OrderBook {
public:
    OrderBook(const std::string& symbol, int64_t tick_size_micros = 100);

    std::vector<Trade> submit(uint64_t oid, Side side, double px, int qty, uint64_t ts);
    void cancel(uint64_t oid);
    BookSnap snapshot(int depth = 10) const;

    double best_bid() const;
    double best_ask() const;
    size_t order_count() const;

private:
    std::string sym_;
    int64_t tick_;
    std::map<int64_t, std::deque<Order>, std::greater<int64_t>> bids_;
    std::map<int64_t, std::deque<Order>> asks_;
    std::unordered_map<uint64_t, ORef> idx_;

    void rest(Order& o);
    bool crosses(const Order& incoming, int64_t resting_px_ticks) const;
};