#!/bin/bash
set -e

# Bootstrap script for one-click installation or update
# This script should be located in the same directory as wireconf.zip

INSTALL_DIR="/opt/wireconf"
BUNDLE_ZIP="wireconf.zip"
TMP_DIR="/tmp/wireconf-bootstrap"

echo "================================================"
echo "  WireGuard Management System - Bootstrap"
echo "================================================"

# 1. Check Root
if [ "$EUID" -ne 0 ]; then 
    echo "ERROR: This script must be run as root"
    exit 1
fi

# 2. Check for Bundle
if [ ! -f "$BUNDLE_ZIP" ]; then
    echo "ERROR: $BUNDLE_ZIP not found. Please ensure it is in the same directory as this script."
    exit 1
fi

# 3. Detect dependencies for bootstrap
echo "Checking for unzip..."
if ! command -v unzip &> /dev/null; then
    echo "unzip not found. Attempting to install..."
    if command -v apt-get &> /dev/null; then
        apt-get update -qq && apt-get install -y unzip
    elif command -v dnf &> /dev/null; then
        dnf install -y unzip
    elif command -v apk &> /dev/null; then
        apk add unzip
    else
        echo "ERROR: unzip not found and could not install automatically."
        exit 1
    fi
fi

# 4. Extract Bundle
echo "Extracting $BUNDLE_ZIP..."
mkdir -p "$TMP_DIR"
unzip -qo "$BUNDLE_ZIP" -d "$TMP_DIR"

# 5. Handle In-Place Update or Fresh Install
if [ -d "$INSTALL_DIR" ]; then
    echo "Existing installation found at $INSTALL_DIR. Performing update..."
else
    echo "Performing fresh installation to $INSTALL_DIR..."
    mkdir -p "$INSTALL_DIR"
fi

# Copy files (excluding instance/db to preserve state)
echo "Copying files to $INSTALL_DIR..."
# We use a subshell to avoid messing with current IFS or variables if we used more complex logic
cp -r "$TMP_DIR/"* "$INSTALL_DIR/"

# 6. Run the Installer
echo "Executing installer..."
chmod +x "$INSTALL_DIR/scripts/installer.sh"
bash "$INSTALL_DIR/scripts/installer.sh"

# 7. Cleanup
echo "Cleaning up..."
rm -rf "$TMP_DIR"

echo "================================================"
echo "  Bootstrap Success!"
echo "================================================"
