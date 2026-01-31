#!/bin/bash
set -e

# Production Installer for WireGuard Management System
# Supports: Debian, Fedora, Alpine

INSTALL_DIR="/opt/wireconf"
BACKEND_DIR="$INSTALL_DIR/backend"
FRONTEND_DIR="$INSTALL_DIR/frontend"
VENV_DIR="$BACKEND_DIR/venv"
FORCE_OVERWRITE=false

# Parse arguments
while [[ "$#" -gt 0 ]]; do
    case $1 in
        -f|--force) FORCE_OVERWRITE=true ;;
        *) echo "Unknown parameter passed: $1"; exit 1 ;;
    esac
    shift
done

echo "================================================"
echo "  WireGuard Management System - Production Installer"
echo "================================================"

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo "ERROR: This script must be run as root"
    exit 1
fi

# Detect OS
if [ -f /etc/os-release ]; then
    . /etc/os-release
    DISTRO=$ID
else
    echo "ERROR: Could not detect OS distribution."
    exit 1
fi

echo "Detected OS: $DISTRO"

# Install Dependencies
case $DISTRO in
    debian|ubuntu)
        apt-get update -qq
        apt-get install -y nginx python3 python3-venv wireguard wireguard-tools iptables iptables-persistent curl unzip
        ;;
    fedora)
        dnf install -y nginx python3 wireguard-tools iptables iptables-services curl unzip
        ;;
    alpine)
        apk add nginx python3 py3-pip wireguard-tools iptables curl unzip openrc
        ;;
    *)
        echo "ERROR: Unsupported distribution: $DISTRO"
        exit 1
        ;;
esac

# Create directory structure if it doesn't exist
mkdir -p "$INSTALL_DIR"

# Configuration Prompts
echo "--- Configuration ---"
if [ -f "$BACKEND_DIR/.env" ]; then
    CURRENT_WG_PATH=$(grep WG_CONFIG_PATH "$BACKEND_DIR/.env" | cut -d'=' -f2)
fi
: "${CURRENT_WG_PATH:=/etc/wireguard/wg0.conf}"

if [ ! -f "$BACKEND_DIR/.env" ] || [ "$FORCE_OVERWRITE" = true ]; then
    read -p "Enter WireGuard config path [$CURRENT_WG_PATH]: " WG_PATH
    WG_PATH=${WG_PATH:-$CURRENT_WG_PATH}

    echo "WG_CONFIG_PATH=$WG_PATH" > "$BACKEND_DIR/.env"
    echo "WireGuard config path set to $WG_PATH"
else
    echo "  ! Backend .env exists, skipping configuration prompt (use --force to overwrite)"
fi

# Setup Python Virtual Environment and Backend
echo "Setting up backend..."
python3 -m venv "$VENV_DIR"
"$VENV_DIR/bin/pip" install --upgrade pip
"$VENV_DIR/bin/pip" install -r "$BACKEND_DIR/requirements.txt"
"$VENV_DIR/bin/pip" install gunicorn

# Setup Nginx Configuration
echo "Configuring Nginx..."
NGINX_CONF=""
case $DISTRO in
    debian|ubuntu|fedora)
        NGINX_CONF="/etc/nginx/sites-available/wireconf"
        NGINX_LINK="/etc/nginx/sites-enabled/wireconf"
        ;;
    alpine)
        NGINX_CONF="/etc/nginx/http.d/wireconf.conf"
        ;;
esac

if [ ! -f "$NGINX_CONF" ] || [ "$FORCE_OVERWRITE" = true ]; then
cat > "$NGINX_CONF" <<EOF
server {
    listen 127.0.0.1:80;
    server_name localhost;

    location / {
        root $FRONTEND_DIR/dist;
        index index.html;
        try_files \$uri \$uri/ /index.html;
    }

    location /api {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF
else
    echo "  ! Nginx configuration exists at $NGINX_CONF, skipping (use --force to overwrite)"
fi

if [ "$DISTRO" != "alpine" ]; then
    ln -sf "$NGINX_CONF" "$NGINX_LINK"
    rm -f /etc/nginx/sites-enabled/default
fi

# Setup System Service
echo "Configuring system services..."
if [ "$DISTRO" = "alpine" ]; then
    # OpenRC for Alpine
    if [ ! -f /etc/init.d/wireconf ] || [ "$FORCE_OVERWRITE" = true ]; then
    cat > /etc/init.d/wireconf <<EOF
#!/sbin/openrc-run

description="WireGuard Management Backend"
command="$VENV_DIR/bin/gunicorn"
command_args="--workers 1 --bind 127.0.0.1:5000 run:app"
command_background="yes"
directory="$BACKEND_DIR"
pidfile="/run/wireconf.pid"
start_stop_daemon_args="--make-pidfile"
output_log="/var/log/wireconf.log"
error_log="/var/log/wireconf.err"

# Allow time for workers to stop gracefully before killing
retry="TERM/30/KILL/5"

depend() {
    need net
    after firewall
}

start_pre() {
    # If pidfile exists but process is gone, remove it
    if [ -f "\$pidfile" ] && ! pgrep -F "\$pidfile" >/dev/null; then
        rm -f "\$pidfile"
    fi
}
EOF
chmod +x /etc/init.d/wireconf
    fi
    rc-update add wireconf default
    rc-update add nginx default
else
    # Systemd for Debian/Fedora
    if [ ! -f /etc/systemd/system/wireconf.service ] || [ "$FORCE_OVERWRITE" = true ]; then
    cat > /etc/systemd/system/wireconf.service <<EOF
[Unit]
Description=Gunicorn instance to serve WireGuard Management Backend
After=network.target

[Service]
User=root
Group=root
WorkingDirectory=$BACKEND_DIR
Environment="PATH=$VENV_DIR/bin"
ExecStart=$VENV_DIR/bin/gunicorn --workers 1 --bind 127.0.0.1:5000 run:app
Restart=always

[Install]
WantedBy=multi-user.target
EOF
    fi
    systemctl daemon-reload
    systemctl enable wireconf
    systemctl enable nginx
fi

# Restart services
echo "Starting services..."
if [ "$DISTRO" = "alpine" ]; then
    rc-service wireconf restart
    rc-service nginx restart
else
    systemctl restart wireconf
    systemctl restart nginx
fi

# Run Setup Wizard
if [ -t 0 ]; then
    echo "================================================"
    echo "  Setup Wizard"
    echo "================================================"
    # Ensure we are in the backend directory so that database location (if relative) is consistent
    # And set PYTHONPATH so that the script can import 'app'
    cd "$BACKEND_DIR"
    export PYTHONPATH="$BACKEND_DIR"
    "$VENV_DIR/bin/python3" "../scripts/setup_cli.py"
fi

echo "================================================"
echo "  Installation/Update Complete!"
echo "  Accessible at http://127.0.0.1"
echo "================================================"
