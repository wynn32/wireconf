# Environment Variables Configuration Guide

## Overview

The backend now uses environment variables for all server configuration, making it easier to deploy across different environments (development, staging, production) without code changes.

## Configuration Files

### `/root/take2/backend/.env`
The active configuration file used by the application. **Do not commit this file to version control** as it contains sensitive keys.

### `/root/take2/backend/.env.example`
Template file showing all available configuration options. Safe to commit to version control.

## Required Environment Variables

### Server WireGuard Keys

**`WG_SERVER_PRIVATE_KEY`**
- The server's WireGuard private key
- Used in the server's `wg0.conf` [Interface] section
- **Keep this secret!**
- Generate: `wg genkey` or use `KeyManager.generate_private_key()`

**`WG_SERVER_PUBLIC_KEY`**
- The server's WireGuard public key
- Included in client configuration files
- Generate: `echo "PRIVATE_KEY" | wg pubkey` or `KeyManager.generate_public_key(private_key)`

**`WG_SERVER_ENDPOINT`**
- The public endpoint where clients connect
- Format: `hostname:port` or `ip:port`
- Examples: 
  - `vpn.example.com:51820`
  - `203.0.113.1:51820`
- **Important**: This must be reachable from client devices

### Server Configuration

**`WG_SERVER_PORT`** (optional)
- WireGuard listen port
- Default: `51820`
- Must match the port in `WG_SERVER_ENDPOINT`

**`WG_CONFIG_PATH`** (optional)
- Path where generated WireGuard config is written
- Default: `wg0_generated.conf` (in backend directory)
- Can be absolute: `/etc/wireguard/wg0.conf`

### Client Defaults

**`WG_CLIENT_DNS`** (optional)
- DNS server(s) for client configurations
- Default: `1.1.1.1`
- Multiple: `1.1.1.1,8.8.8.8`

## Setup Instructions

### 1. Initial Setup

The `.env` file has been created with generated server keys. Update the endpoint:

```bash
cd /root/take2/backend
nano .env
```

Change this line to your actual server IP or hostname:
```bash
WG_SERVER_ENDPOINT=YOUR_SERVER_IP:51820
```

### 2. Verify Configuration

Check that all required variables are set:

```bash
cd /root/take2/backend
source venv/bin/activate
python -c "import os; print('Server Public Key:', os.environ.get('WG_SERVER_PUBLIC_KEY', 'NOT SET'))"
```

### 3. Restart Backend

After changing `.env`, restart the backend:

```bash
cd /root/take2
./run-backend.sh
```

## Loading Environment Variables

The backend automatically loads `.env` using one of these methods:

1. **python-dotenv** (recommended):
   ```python
   from dotenv import load_dotenv
   load_dotenv()
   ```

2. **Manual export** (for production):
   ```bash
   export $(cat .env | xargs)
   python run.py
   ```

## Production Deployment

For production environments:

1. **Use system environment variables** instead of `.env` file
2. **Secure key storage**: Consider using secrets management (AWS Secrets Manager, HashiCorp Vault, etc.)
3. **Set proper file permissions**:
   ```bash
   chmod 600 /etc/wireguard/.env
   chown root:root /etc/wireguard/.env
   ```

4. **Use absolute paths**:
   ```bash
   WG_CONFIG_PATH=/etc/wireguard/wg0.conf
   ```

## Migration from Hardcoded Values

### Before (Hardcoded)
```python
server_priv = "SERVER_PRIVATE_KEY_MOCK"
config = f"PublicKey = <SERVER_PUBKEY_PLACEHOLDER>"
```

### After (Environment Variables)
```python
server_priv = os.environ.get('WG_SERVER_PRIVATE_KEY', 'fallback')
server_pub = os.environ.get('WG_SERVER_PUBLIC_KEY', 'fallback')
config = f"PublicKey = {server_pub}"
```

## Troubleshooting

### Client configs show placeholders

**Problem**: Downloaded client configs contain `<SERVER_PUBKEY_PLACEHOLDER>`

**Solution**: Set `WG_SERVER_PUBLIC_KEY` in `.env` and restart backend

### Server config has wrong private key

**Problem**: Generated `wg0_generated.conf` has placeholder key

**Solution**: Set `WG_SERVER_PRIVATE_KEY` in `.env` and run commit

### Environment variables not loaded

**Problem**: Backend doesn't see environment variables

**Solutions**:
1. Install python-dotenv: `pip install python-dotenv`
2. Add to `run.py`:
   ```python
   from dotenv import load_dotenv
   load_dotenv()
   ```
3. Or export manually before running

## Security Best Practices

1. ✅ **Never commit `.env`** - Add to `.gitignore`
2. ✅ **Rotate keys regularly** - Generate new keys periodically
3. ✅ **Use different keys per environment** - Dev/staging/prod should have separate keys
4. ✅ **Restrict file permissions** - `chmod 600 .env`
5. ✅ **Use secrets management in production** - Don't rely on `.env` files in production

## Current Configuration

The generated server keys are:
- **Private Key**: `OEKRLIeMBWS8FhJsVJF+ZzK7l/MLrHVSQeaGFn25Zn4=`
- **Public Key**: `/hwiPFnZLfeeYFVaxozLHnrNGW2y06W6udKPThFwrBY=`

**⚠️ Important**: Update `WG_SERVER_ENDPOINT` in `.env` before deploying!
