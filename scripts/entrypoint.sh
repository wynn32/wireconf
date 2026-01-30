#!/bin/bash
set -e

echo "Starting WireConf Entrypoint..."

# 1. Enable IP Forwarding if possible (requires --privileged or NET_ADMIN)
if [ "$ENABLE_IP_FORWARD" = "true" ]; then
    echo "Enabling IP forwarding..."
    sysctl -w net.ipv4.ip_forward=1 || echo "Warning: Could not set sysctl. Ensure container is run with sufficient privileges."
fi

# 2. Check for shared volume in sidecar mode
if [ -d "/etc/wireguard" ]; then
    echo "Found /etc/wireguard directory."
else
    echo "Creating /etc/wireguard directory..."
    mkdir -p /etc/wireguard
fi

# 3. Start Backend in background
echo "Starting Backend with Gunicorn..."
cd /app/backend
# Ensure logs go to stdout/stderr
gunicorn --bind 0.0.0.0:5000 --access-logfile - --error-logfile - run:app &

# 4. Start Nginx
echo "Starting Nginx in foreground..."
# Ensure the symlink exists (Ubuntu default)
ln -sf /etc/nginx/sites-available/default /etc/nginx/sites-enabled/default
# Start Nginx in foreground to keep container alive and show logs
nginx -g "daemon off;"
