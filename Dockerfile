# Build Stage for Frontend
FROM node:18-slim AS frontend-build
WORKDIR /build/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Final Stage
FROM ubuntu:22.04

# Avoid prompts from apt
ENV DEBIAN_FRONTEND=noninteractive

# Install dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    wireguard-tools \
    iptables \
    iproute2 \
    curl \
    nginx \
    && rm -rf /var/lib/apt/lists/*

# Copy Nginx Configuration
COPY scripts/nginx.conf /etc/nginx/sites-available/default

WORKDIR /app

# Copy Backend
COPY backend/ /app/backend/
RUN pip3 install -r /app/backend/requirements.txt

# Copy Built Frontend
COPY --from=frontend-build /build/frontend/dist /app/frontend/dist

# Copy entrypoint and scripts
COPY scripts/ /app/scripts/
RUN chmod +x /app/scripts/entrypoint.sh

# Environment variables
ENV FLASK_APP=backend/run.py
ENV ENABLE_IP_FORWARD=true

# Expose ports
# Web Proxy (UI + API)
EXPOSE 80
# Backend (Internal or direct access)
EXPOSE 5000
# WireGuard (default)
EXPOSE 51820/udp

ENTRYPOINT ["/app/scripts/entrypoint.sh"]
