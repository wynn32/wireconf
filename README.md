# WireConf

WireConf is a project from an idea I had when wistfully wishing for a more configurable way to set up Wireguard clients. My needs ended up requiring a lot of manually editing files and keeping mental track of them, what the changes were, and so on. WireConf features virtual network creation, dynamic (server-side) assignment of clients to virtual networks, strict access control rules, point-to-site configurations out of the box, and a web GUI for managing it all.

Beware, this project is for power users who want a lot of control over their networks. If you want a more beginner-friendly solution, I'd highly recommend [PiVPN](https://github.com/pivpn/pivpn) or [wg-easy](https://github.com/wg-easy/wg-easy).

If you're thinking of setting up a server with WireConf but already have an existing PiVPN setup, there's an import function that allows you to upload the PiVPN backup archive to the site where it will process and hydrate all the clients into WireConf automatically.


**Disclaimer**: This was largely vibe-coded but with human scrutiny over the code and its quality. I spent several long nights going over parts that needed fixed because the model didn't understand WireGuard configs too well. This is currently running on one of my servers handling over 40 clients, and it's been doing pretty well.

## Features

- **Network Management**: Create and configure multiple WireGuard interfaces.
- **Client Management**: Easily add and manage VPN clients with automatic IP assignment and key generation.
- **Access Control Rules**: Implement fine-grained firewall rules (iptables) to control traffic between clients and routed networks.
- **Configuration Generation**: Automatically generates `wg0.conf` and companion firewall scripts on the server.
- **Client Config Export**: Download ready-to-use configuration files for VPN clients.
- **Import Utilities**: Support for importing existing configurations and PiVPN backups.
- **Setup Wizard**: Guided initial configuration for server endpoints and networks.

## Tech Stack

- **Frontend**: TypeScript, Vite
- **Backend**: Python, SQLite
- **Infrastructure**: Docker or native install

## Getting Started

### Prerequisites

Docker install
- Any GNU/Linux operating system with Docker installed

Native install
- A host with Debian, Alpine, or Fedora distribution of GNU/Linux

### Installation (Docker)

1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/wireconf.git
   cd wireconf
   ```

2. Start the services using Docker Compose:
   ```bash
   docker-compose up -d
   ```

3. Access the web interface:
   Open your browser and navigate to `http://localhost:80` (or the configured `WEB_PORT`).

4. Follow the Setup Wizard to configure your first network and client.

### Installation (Native)

1. Download the release version of wireconf.zip

2. Unzip the file

2. Run the `bootstrap.sh` script and answer any prompts in the installer

## Development

### Backend
The backend is a Flask application located in the `backend/` directory.
```bash
cd backend
pip install -r requirements.txt
python run.py
```

### Frontend
The frontend is a Vite-powered React application located in the `frontend/` directory.
```bash
cd frontend
npm install
npm run dev
```

## Deployment Considerations

When running in Docker, WireConf requires `NET_ADMIN` and `SYS_MODULE` capabilities to manage the WireGuard interface and iptables rules on the host. It also requires access to `/etc/wireguard` and `/lib/modules`.
