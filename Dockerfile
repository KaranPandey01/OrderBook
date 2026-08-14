# syntax=docker/dockerfile:1

# ---------- Stage 1: Build React frontend ----------
FROM node:20-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN chmod +x node_modules/.bin/*
RUN npm run build
# Output at /app/frontend/dist (Vite default — confirm in vite.config.js)

# ---------- Stage 2: Build C++ engine (ob_engine pybind11 module) ----------
FROM python:3.11-slim AS engine-build
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential cmake git \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY CMakeLists.txt ./
COPY engine/ ./engine/
RUN pip install --no-cache-dir pybind11
RUN cmake -B build -DCMAKE_BUILD_TYPE=Release && \
    cmake --build build --config Release -j$(nproc)
# pybind11_add_module(ob_engine ...) outputs to /app/build/ob_engine*.so

# ---------- Stage 3: Final runtime image ----------
FROM python:3.11-slim
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libstdc++6 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Backend source — stays as a package at /app/api so
# `from api.models import ...` / `from api.auth import ...` resolve
COPY api/ ./api/

# Compiled ob_engine .so goes to /app/build/, matching main.py's
# sys.path.insert(0, '../build') relative to api/main.py
COPY --from=engine-build /app/build/*.so ./build/

# React build output served as static files
COPY --from=frontend-build /app/frontend/dist ./static

# Persistent SQLite lives on a Render volume, e.g. mounted at /data
# api/auth.py must read DB_PATH from env for this to matter (see auth.py fix)
ENV DB_PATH=/data/orderbook.db
ENV PORT=8000

EXPOSE 8000
CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]