#include <pybind11/pybind11.h>
#include <pybind11/stl.h>
#include "orderbook.hpp"

namespace py = pybind11;

PYBIND11_MODULE(ob_engine, m) {

    py::enum_<Side>(m, "Side")
        .value("BUY",  Side::BUY)
        .value("SELL", Side::SELL)
        .export_values();

    py::class_<Trade>(m, "Trade")
        .def_readonly("buy_oid",   &Trade::buy_oid)
        .def_readonly("sell_oid",  &Trade::sell_oid)
        .def_readonly("exec_px",   &Trade::exec_px)
        .def_readonly("exec_qty",  &Trade::exec_qty);

    py::class_<Level>(m, "Level")
        .def_readonly("px",        &Level::px)
        .def_readonly("total_qty", &Level::total_qty);

    py::class_<BookSnap>(m, "BookSnap")
        .def_readonly("bids",   &BookSnap::bids)
        .def_readonly("asks",   &BookSnap::asks)
        .def_readonly("spread", &BookSnap::spread);

    py::class_<OrderBook>(m, "OrderBook")
        .def(py::init<const std::string&>())
        .def("submit",      &OrderBook::submit)
        .def("cancel",      &OrderBook::cancel)
        .def("snapshot",    &OrderBook::snapshot, py::arg("depth") = 10)
        .def("best_bid",    &OrderBook::best_bid)
        .def("best_ask",    &OrderBook::best_ask)
        .def("order_count", &OrderBook::order_count);
}