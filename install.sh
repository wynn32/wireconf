#!/bin/bash
set -e

# WireGuard System Installer
# Installs WireGuard, iptables, and required dependencies

echo "================================================"
echo "  WireGuard Management System - Installer"
echo "================================================"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo "ERROR: This script must be run as root or with sudo"
    echo "Usage: sudo ./install.sh"
    exit 1
fi

echo "[1/6] Updating package lists..."
apt-get update -qq

echo "[2/6] Installing WireGuard..."
apt-get install -y wireguard wireguard-tools

echo "[3/6] Installing iptables and persistence tools..."
apt-get install -y iptables iptables-persistent

echo "[4/6] Enabling IP forwarding..."
# Enable IP forwarding temporarily
sysctl -w net.ipv4.ip_forward=1 > /dev/null

# Enable IP forwarding permanently
if ! grep -q "^net.ipv4.ip_forward=1" /etc/sysctl.conf; then
    echo "net.ipv4.ip_forward=1" >> /etc/sysctl.conf
    echo "  ✓ IP forwarding enabled permanently"
else
    echo "  ✓ IP forwarding already enabled"
fi

echo "[5/6] Verifying installations..."
if command -v wg &> /dev/null; then
    echo "  ✓ WireGuard installed: $(wg --version)"
else
    echo "  ✗ WireGuard installation failed"
    exit 1
fi

if command -v iptables &> /dev/null; then
    echo "  ✓ iptables installed"
else
    echo "  ✗ iptables installation failed"
    exit 1
fi

echo "[6/6] Creating installation marker..."
INSTALL_DIR="$(dirname "$0")"
touch "$INSTALL_DIR/.installed"
echo "  ✓ Installation marker created"

echo ""
echo "================================================"
echo "  Installation Complete!"
echo "================================================"
echo ""
echo "Next steps:"
echo "1. Start the backend server: cd backend && python3 run.py"
echo "2. Start the frontend: cd frontend && npm run dev"
echo "3. Open the web interface and complete the setup wizard"
echo ""
