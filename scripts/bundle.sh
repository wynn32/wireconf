#!/bin/bash
set -e

# Bundler for WireGuard Management System
# Packages frontend (built), backend, and scripts into a zip file.

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST_DIR="$REPO_ROOT/bundle_tmp"
BUNDLE_NAME="wireguard-mgmt.zip"

echo "================================================"
echo "  WireGuard Management System - Bundler"
echo "================================================"

# 1. Build Frontend
echo "[1/4] Building Frontend..."
cd "$REPO_ROOT/frontend"

# Ensure .env for production build
echo "VITE_API_URL=/api" > .env.production
echo "VITE_API_URL=/api" > .env

if [ ! -d "node_modules" ]; then
    npm install
fi
npm run build

# 2. Prepare Bundle Directory
echo "[2/4] Preparing Bundle..."
rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR/frontend/dist"
mkdir -p "$DIST_DIR/backend"
mkdir -p "$DIST_DIR/scripts"

# Copy Frontend Build
cp -r "$REPO_ROOT/frontend/dist" "$DIST_DIR/frontend/"

# Copy Backend (excluding dev files)
cp -r "$REPO_ROOT/backend/"* "$DIST_DIR/backend/"
rm -rf "$DIST_DIR/backend/venv"
rm -rf "$DIST_DIR/backend/__pycache__"
rm -rf "$DIST_DIR/backend/instance"
rm -rf "$DIST_DIR/backend/wireguard.db" # Don't bundle dev DB

# Copy Scripts
cp "$REPO_ROOT/scripts/installer.sh" "$DIST_DIR/scripts/"
cp "$REPO_ROOT/scripts/bootstrap.sh" "$DIST_DIR/"

# 3. Zip everything
echo "[3/4] Creating ZIP bundle..."
cd "$DIST_DIR"
zip -rq "$REPO_ROOT/$BUNDLE_NAME" .

# 4. Cleanup
echo "[4/4] Cleaning up..."
cd "$REPO_ROOT"
rm -rf "$DIST_DIR"

echo "================================================"
echo "  Bundle Created: $BUNDLE_NAME"
echo "================================================"
