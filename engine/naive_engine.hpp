#pragma once
#include <vector>
#include <algorithm>
#include <cstdint>

struct NaiveOrder {
    uint64_t oid;
    double px;
    int qty;
    bool is_buy;
};

struct NaiveTrade {
    double exec_px;
    int exec_qty;
};

class NaiveOrderBook {
public:
    std::vector<NaiveTrade> submit(uint64_t oid, bool is_buy, double px, int qty) {
        std::vector<NaiveTrade> trades;
        auto& opp = is_buy ? asks_ : bids_;
        int remaining = qty;

        for (auto& o : opp) {
            if (remaining == 0) break;
            bool cross = is_buy ? (px >= o.px) : (px <= o.px);
            if (!cross) continue;
            int fill = std::min(remaining, o.qty);
            trades.push_back({ o.px, fill });
            remaining -= fill;
            o.qty -= fill;
        }

        opp.erase(std::remove_if(opp.begin(), opp.end(),
            [](const NaiveOrder& o) { return o.qty == 0; }), opp.end());

        if (remaining > 0) {
            if (is_buy) bids_.push_back({ oid, px, remaining, true });
            else        asks_.push_back({ oid, px, remaining, false });
        }
        return trades;
    }

    size_t order_count() const { return bids_.size() + asks_.size(); }

private:
    std::vector<NaiveOrder> bids_;
    std::vector<NaiveOrder> asks_;
};