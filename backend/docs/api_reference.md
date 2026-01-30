# WireGuard Management Backend - API Reference

Base URL: `/api`

## Setup & Installation

### Get Setup Status
**GET** `/setup/status`

Returns the current setup status, including whether the system is installed and configured.

**Response**
```json
{
  "installed": true,
  "setup_completed": true,
  "has_networks": true,
  "has_clients": true,
  "server_configured": true
}
```

### Configure Server
**POST** `/setup/server`

Configures server endpoint, port, and generates keys if not provided.

**Request Body**
```json
{
  "endpoint": "vpn.example.com",
  "port": 51820,
  "private_key": "optional_existing_key",
  "public_key": "optional_existing_key"
}
```

**Response**
```json
{
  "status": "configured",
  "server_public_key": "xxxx...",
  "server_endpoint": "vpn.example.com",
  "server_port": 51820
}
```

### Complete Setup
**POST** `/setup/complete`

Finalizes setup wizard. Creates initial config and applies firewall rules.

**Response**
```json
{
  "status": "setup_complete"
}
```

### Extract Host Config
**GET** `/setup/extract-host-config`

Reads and parses the host's current WireGuard config for manual import.

**Response**
```json
{
  "server_data": {
    "privatekey": "...",
    "address": "10.0.0.1/24",
    "listenport": "51820"
  },
  "peers": [
    {
      "publickey": "...",
      "allowedips": "10.0.0.2/32",
      "_comment_name": "client1"
    }
  ]
}
```

### Import Manual Config
**POST** `/setup/import-manual`

Performs import with user-provided private keys.

**Request Body**
```json
{
  "server_data": { "privatekey": "..." },
  "peers": [ { "privatekey": "...", "publickey": "...", "allowedips": "10.0.0.2/32" } ],
  "force_purge": false
}
```

**Response**
```json
{
  "status": "success",
  "stats": {
    "server_updated": true,
    "networks_created": 2,
    "clients_created": 3,
    "routes_created": 0,
    "access_rules_created": 5
  }
}
```

### Import PiVPN Backup
**POST** `/import`

Imports an existing `wg0.conf` file or PiVPN backup `.tgz` file.

**Parameters**
- `force_purge=true|false` - Whether to purge existing data before import
- `create_access_rules=all|none` - Whether to create access rules during import

**Request Body**
- Multipart form data with file upload

**Response**
```json
{
  "status": "success",
  "stats": {
    "server_updated": true,
    "networks_created": 2,
    "clients_created": 3,
    "routes_created": 1,
    "access_rules_created": 5
  }
}
```

Or if there's a key mismatch:
```json
{
  "status": "mismatch",
  "message": "Imported server key does not match current key. Purge database and continue?"
}
```

---

## Networks (Security Zones)

### List Networks
**GET** `/networks`

Returns a list of all configured networks/zones.

**Response**
```json
[
  {
    "id": 1,
    "name": "Management",
    "cidr": "10.0.1.0/24",
    "interface_address": "10.0.1.1/24"
  }
]
```

### Create Network
**POST** `/networks`

Creates a new network security zone.

**Request Body**
```json
{
  "name": "IoT",
  "cidr": "10.0.2.0/24",
  "interface_address": "10.0.2.1/24"
}
```

**Response**
- `201 Created`: `{"id": 2}`

### Update Network
**PUT** `/networks/{id}`

Updates a network's name, CIDR, or interface address.

**Request Body**
```json
{
  "name": "IoT Devices",
  "cidr": "10.0.2.0/24",
  "interface_address": "10.0.2.1/24"
}
```

**Response**
```json
{
  "status": "updated",
  "id": 1,
  "name": "IoT Devices",
  "cidr": "10.0.2.0/24",
  "interface_address": "10.0.2.1/24"
}
```

### Delete Network
**DELETE** `/networks/{id}`

Deletes a network.

**Response**
- `200 OK`: `{"status": "deleted"}`

---

## Clients

### List Clients
**GET** `/clients`

Returns all clients with their configuration details.

**Response**
```json
[
  {
    "id": 1,
    "name": "laptop",
    "octet": 5,
    "ips": ["10.0.1.5", "10.0.2.5"],
    "public_key": "xxyyzz...",
    "keepalive": 25,
    "enabled": true,
    "networks": [1, 2],
    "routes": ["192.168.1.0/24"],
    "dns_mode": "default",
    "dns_servers": null,
    "tags": ["work", "laptop"],
    "is_full_tunnel": false
  }
]
```

### Create Client
**POST** `/clients`

Creates a new client. Automatically assigns a unique `octet` compliant with all requested networks.

**Request Body**
```json
{
  "name": "new-peer",
  "networks": [1, 3],
  "keepalive": 25,
  "routes": ["192.168.1.0/24"],
  "dns_mode": "default",
  "dns_servers": null,
  "tags": ["work"]
}
```

**Response**
- `201 Created`:
```json
{
  "id": 3,
  "name": "new-peer",
  "octet": 10,
  "public_key": "aabbcc..."
}
```

### Update Client
**PUT** `/clients/{id}`

Updates client configuration (networks, DNS, keepalive, tags, routes, enabled status).

**Request Body**
```json
{
  "networks": [1, 2],
  "keepalive": 30,
  "enabled": true,
  "dns_mode": "custom",
  "dns_servers": "8.8.8.8, 8.8.4.4",
  "tags": ["vpn", "active"],
  "routes": ["192.168.1.0/24", "10.20.0.0/16"]
}
```

**Response**
```json
{
  "status": "updated",
  "networks": [1, 2],
  "keepalive": 30,
  "enabled": true,
  "routes": ["192.168.1.0/24", "10.20.0.0/16"],
  "dns_mode": "custom",
  "dns_servers": "8.8.8.8, 8.8.4.4"
}
```

### Delete Client
**DELETE** `/clients/{id}`

Deletes a client and all associated rules and routes.

**Response**
- `200 OK`: `{"status": "deleted"}`

### Download Client Config
**GET** `/clients/{id}/config`

Downloads the complete WireGuard client configuration file. Only includes routed networks that the client has explicit ACCEPT access rules for.

**Response**
- `Content-Type`: `text/plain`
- `Content-Disposition`: `attachment; filename="clientname.conf"`
- Body: Complete `[Interface]` and `[Peer]` configuration

---

## Firewall Rules & Access Control

### List All Rules
**GET** `/rules`

Returns all access rules in the system.

**Response**
```json
[
  {
    "id": 101,
    "source_client_id": 1,
    "dest_client_id": null,
    "dest_cidr": "8.8.8.8/32",
    "destination_type": "host",
    "port": 53,
    "proto": "udp",
    "action": "ACCEPT"
  },
  {
    "id": 102,
    "source_client_id": 2,
    "dest_client_id": 1,
    "dest_cidr": "10.0.1.0/24",
    "destination_type": "network",
    "port": null,
    "proto": "all",
    "action": "ACCEPT"
  }
]
```

### Get Client Rules
**GET** `/rules/client/{public_key}`

Fetches all access rules where the specified client is the **source**. `{public_key}` must be URL-encoded.

**Response**
```json
[
  {
    "id": 101,
    "source_client_id": 1,
    "dest_client_id": null,
    "dest_cidr": "8.8.8.8/32",
    "destination_type": "host",
    "port": 53,
    "proto": "udp",
    "action": "ACCEPT"
  }
]
```

### Create Rule
**POST** `/rules/client/{public_key}`

Creates a new access rule for the specified client. Rules are translated to `iptables` commands in the firewall script.

**Request Body**
```json
{
  "destination": "192.168.1.50/32",
  "destination_type": "host",
  "dest_client_id": null,
  "port": 80,
  "proto": "tcp",
  "action": "ACCEPT"
}
```

**Response**
- `201 Created`: `{"id": 103}`

**Notes**
- If `destination` is `0.0.0.0/0` with action `ACCEPT`, the client is marked as full-tunnel
- For accessing routed networks behind other clients, create an ACCEPT rule to that client's routed CIDR
- Rules with action `DROP` are processed first in iptables to prevent shadowing by broad ACCEPT rules

### Delete Rule
**DELETE** `/rules/{id}`

Deletes a specific rule by ID. If the rule was for `0.0.0.0/0`, the client's `is_full_tunnel` flag is updated accordingly.

**Response**
- `200 OK`: `{"status": "deleted"}`

---

## Configuration & Deployment

### Preview Commit
**GET** `/commit/preview`

Shows what changes would be made to the server configuration based on current database state.

**Response**
```json
{
  "summary": {
    "added_clients": [
      {"name": "new-client", "id": 5}
    ],
    "removed_clients": ["old_key_..."],
    "modified_interface": false,
    "modified_peers": true,
    "modified_rules": false
  },
  "new_config": "[Interface]\nPrivateKey = ...\n...",
  "full_restart_needed": false
}
```

### Commit Changes
**POST** `/commit`

Applies all database changes to the server:
1. Renders updated `wg0.conf` and firewall rules script
2. Performs smart restart logic:
   - Full restart if interface/networks changed
   - Hot reload if peers changed
   - Firewall-only update if only rules changed
   - No-op if nothing changed

**Response**
```json
{
  "status": "committed (hot reload)",
  "file": "/etc/wireguard/wg0.conf"
}
```

**Notes**
- Full restart causes brief downtime
- Hot reload (syncconf) allows adding/modifying peers without downtime
- Firewall-only updates have no downtime
- The system automatically chooses the least disruptive approach
