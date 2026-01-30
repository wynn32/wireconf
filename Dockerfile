# Stage 1: Build Frontend
FROM node:18-slim AS frontend-build
WORKDIR /build/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Stage 2: Build Backend Dependencies
FROM python:3.11-slim-bookworm AS backend-builder
WORKDIR /build/backend
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# Stage 3: Final Image
FROM python:3.11-slim-bookworm

# Avoid prompts from apt
ENV DEBIAN_FRONTEND=noninteractive

# Install runtime dependencies ONLY
RUN apt-get update && apt-get install -y \
    wireguard-tools \
    iptables \
    iproute2 \
    procps \
    curl \
    nginx \
    && rm -rf /var/lib/apt/lists/* \
    && rm -rf /usr/share/doc /usr/share/man /usr/share/locale

WORKDIR /app

# Copy Python dependencies from builder
COPY --from=backend-builder /install /usr/local

# Copy Backend
COPY backend/ /app/backend/

# Copy Built Frontend
COPY --from=frontend-build /build/frontend/dist /app/frontend/dist

# Copy Nginx Configuration
COPY scripts/nginx.conf /etc/nginx/sites-available/default

# Copy entrypoint and scripts
COPY scripts/ /app/scripts/
RUN chmod +x /app/scripts/entrypoint.sh

# Environment variables
ENV FLASK_APP=backend/run.py
ENV ENABLE_IP_FORWARD=true
ENV PYTHONUNBUFFERED=1
ENV WG_CONFIG_PATH=/etc/wireguard/wg0.conf
ENV WG_SKIP_IP_FORWARD=true
ENV PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

# Expose ports
# Web Proxy (UI + API)
EXPOSE 80
# WireGuard (default)
EXPOSE 51820/udp

ENTRYPOINT ["/app/scripts/entrypoint.sh"]
