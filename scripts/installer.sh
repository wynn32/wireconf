#!/bin/bash
set -e

# Production Installer for WireGuard Management System
# Supports: Debian, Fedora, Alpine

INSTALL_DIR="/opt/wireguard-mgmt"
BACKEND_DIR="$INSTALL_DIR/backend"
FRONTEND_DIR="$INSTALL_DIR/frontend"
VENV_DIR="$BACKEND_DIR/venv"

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
        NGINX_CONF="/etc/nginx/sites-available/wireguard-mgmt"
        NGINX_LINK="/etc/nginx/sites-enabled/wireguard-mgmt"
        ;;
    alpine)
        NGINX_CONF="/etc/nginx/http.d/wireguard-mgmt.conf"
        ;;
esac

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

if [ "$DISTRO" != "alpine" ]; then
    ln -sf "$NGINX_CONF" "$NGINX_LINK"
    rm -f /etc/nginx/sites-enabled/default
fi

# Setup System Service
echo "Configuring system services..."
if [ "$DISTRO" = "alpine" ]; then
    # OpenRC for Alpine
    cat > /etc/init.d/wireguard-mgmt <<EOF
#!/sbin/openrc-run

description="WireGuard Management Backend"
command="$VENV_DIR/bin/gunicorn"
command_args="--workers 3 --bind 127.0.0.1:5000 run:app"
command_background="yes"
directory="$BACKEND_DIR"
pidfile="/run/wireguard-mgmt.pid"

depend() {
    need net
    after firewall
}
EOF
    chmod +x /etc/init.d/wireguard-mgmt
    rc-update add wireguard-mgmt default
    rc-update add nginx default
else
    # Systemd for Debian/Fedora
    cat > /etc/systemd/system/wireguard-mgmt.service <<EOF
[Unit]
Description=Gunicorn instance to serve WireGuard Management Backend
After=network.target

[Service]
User=root
Group=root
WorkingDirectory=$BACKEND_DIR
Environment="PATH=$VENV_DIR/bin"
ExecStart=$VENV_DIR/bin/gunicorn --workers 3 --bind 127.0.0.1:5000 run:app
Restart=always

[Install]
WantedBy=multi-user.target
EOF
    systemctl daemon-reload
    systemctl enable wireguard-mgmt
    systemctl enable nginx
fi

# Restart services
echo "Starting services..."
if [ "$DISTRO" = "alpine" ]; then
    rc-service wireguard-mgmt restart
    rc-service nginx restart
else
    systemctl restart wireguard-mgmt
    systemctl restart nginx
fi

echo "================================================"
echo "  Installation/Update Complete!"
echo "  Accessible at http://127.0.0.1"
echo "================================================"
