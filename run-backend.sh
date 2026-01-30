#!/bin/bash
set -e

# Navbar
echo "Starting Backend..."
cd "$(dirname "$0")/backend"

# Ensure venv exists
if [ ! -d "venv" ]; then
    echo "Virtual environment not found. Please setup first."
    exit 1
fi

source venv/bin/activate
python run.py
