#include "orderbook.hpp"

OrderBook::OrderBook(const std::string& symbol) : sym_(symbol) {}

bool OrderBook::crosses(const Order& inc, double rest_px) const {
    if (inc.side == Side::BUY)  return inc.px >= rest_px;
    if (inc.side == Side::SELL) return inc.px <= rest_px;
    return false;
}

void OrderBook::rest(Order& o) {
    if (o.side == Side::BUY) {
        bids_[o.px].push_back(o);
        auto& lvl = bids_[o.px];
        auto it = std::prev(lvl.end());
        idx_[o.oid] = { o.px, Side::BUY, it };
    } else {
        asks_[o.px].push_back(o);
        auto& lvl = asks_[o.px];
        auto it = std::prev(lvl.end());
        idx_[o.oid] = { o.px, Side::SELL, it };
    }
}

std::vector<Trade> OrderBook::submit(uint64_t oid, Side side, double px, int qty, uint64_t ts) {
    Order incoming { oid, sym_, px, qty, ts, side };
    std::vector<Trade> trades;

    auto try_match = [&](auto& opp_side) {
        while (incoming.qty > 0 && !opp_side.empty()) {
            auto& [best_px, lvl] = *opp_side.begin();
            if (!crosses(incoming, best_px)) break;

            while (incoming.qty > 0 && !lvl.empty()) {
                auto& resting = lvl.front();
                int fill = std::min(incoming.qty, resting.qty);

                Trade t;
                t.exec_px  = best_px;
                t.exec_qty = fill;
                t.buy_oid  = (side == Side::BUY)  ? incoming.oid : resting.oid;
                t.sell_oid = (side == Side::SELL) ? incoming.oid : resting.oid;
                trades.push_back(t);

                incoming.qty  -= fill;
                resting.qty   -= fill;

                if (resting.qty == 0) {
                    idx_.erase(resting.oid);
                    lvl.pop_front();
                }
            }
            if (lvl.empty()) opp_side.erase(opp_side.begin());
        }
    };

    if (side == Side::BUY)  try_match(asks_);
    else                     try_match(bids_);

    if (incoming.qty > 0) rest(incoming);

    return trades;
}

void OrderBook::cancel(uint64_t oid) {
    auto found = idx_.find(oid);
    if (found == idx_.end()) throw std::runtime_error("order not found");

    auto& ref = found->second;
    if (ref.side == Side::BUY) {
        auto& lvl = bids_.at(ref.px);
        lvl.erase(ref.it);
        if (lvl.empty()) bids_.erase(ref.px);
    } else {
        auto& lvl = asks_.at(ref.px);
        lvl.erase(ref.it);
        if (lvl.empty()) asks_.erase(ref.px);
    }
    idx_.erase(found);
}

BookSnap OrderBook::snapshot(int depth) const {
    BookSnap snap;

    int i = 0;
    for (auto& [px, lvl] : bids_) {
        if (i++ >= depth) break;
        int total = 0;
        for (auto& o : lvl) total += o.qty;
        snap.bids.push_back({ px, total });
    }

    i = 0;
    for (auto& [px, lvl] : asks_) {
        if (i++ >= depth) break;
        int total = 0;
        for (auto& o : lvl) total += o.qty;
        snap.asks.push_back({ px, total });
    }

    snap.spread = (!snap.bids.empty() && !snap.asks.empty())
        ? snap.asks[0].px - snap.bids[0].px
        : -1.0;

    return snap;
}

double OrderBook::best_bid() const {
    if (bids_.empty()) return -1.0;
    return bids_.begin()->first;
}

double OrderBook::best_ask() const {
    if (asks_.empty()) return -1.0;
    return asks_.begin()->first;
}

size_t OrderBook::order_count() const {
    return idx_.size();
}