#pragma once
#include <map>
#include <deque>
#include <unordered_map>
#include <vector>
#include <string>
#include <functional>
#include <stdexcept>

enum class Side { BUY, SELL };

struct Order {
    uint64_t oid;
    std::string sym;
    double px;
    int qty;
    uint64_t ts;
    Side side;
};

struct Trade {
    uint64_t buy_oid;
    uint64_t sell_oid;
    double exec_px;
    int exec_qty;
};

struct Level {
    double px;
    int total_qty;
};

struct BookSnap {
    std::vector<Level> bids;
    std::vector<Level> asks;
    double spread;
};

struct ORef {
    double px;
    Side side;
    std::deque<Order>::iterator it;
};

class OrderBook {
public:
    OrderBook(const std::string& symbol);

    std::vector<Trade> submit(uint64_t oid, Side side, double px, int qty, uint64_t ts);
    void cancel(uint64_t oid);
    BookSnap snapshot(int depth = 10) const;

    double best_bid() const;
    double best_ask() const;
    size_t order_count() const;

private:
    std::string sym_;
    std::map<double, std::deque<Order>, std::greater<double>> bids_;
    std::map<double, std::deque<Order>> asks_;
    std::unordered_map<uint64_t, ORef> idx_;

    void rest(Order& o);
    bool crosses(const Order& incoming, double resting_px) const;
};