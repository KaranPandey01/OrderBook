cmake_minimum_required(VERSION 3.15)
project(orderbook)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_BUILD_TYPE Release)

find_package(Python3 COMPONENTS Interpreter Development REQUIRED)
find_package(pybind11 CONFIG REQUIRED)

pybind11_add_module(ob_engine
    engine/orderbook.cpp
    engine/bindings.cpp
)

if(MSVC)
    target_compile_options(ob_engine PRIVATE /O2 /arch:AVX2)
else()
    # NOTE: -march=native was replaced with x86-64-v2, a portable
    # baseline (SSE4.2 + POPCNT). -march=native bakes in the exact
    # CPU features of whatever machine builds the Docker image,
    # which can differ from the machine that runs the container —
    # causing SIGILL (exit code 132) at startup on cloud hosts like
    # Render. x86-64-v2 is safe on virtually all modern cloud CPUs
    # while still giving a solid optimization uplift over the
    # x86-64 baseline.
    target_compile_options(ob_engine PRIVATE -O3 -march=x86-64-v2)
endif()