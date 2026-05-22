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
    target_compile_options(ob_engine PRIVATE -O3 -march=native)
endif()