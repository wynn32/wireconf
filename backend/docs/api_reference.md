# WireGuard Management Backend - API Reference

Base URL: `/api`

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

---

## Clients

### List Clients
**GET** `/clients`

Returns all clients.

**Response**
```json
[
  {
    "id": 1,
    "name": "laptop",
    "octet": 5,
    "public_key": "xxyyzz...",
    "networks": [1, 2]
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
  "networks": [1, 3] 
  // List of Network IDs
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

### Download Config
**GET** `/clients/{id}/config`

Downloads the `wg0.conf` fragment (or full client config) for the specified client.

**Response**
- `Content-Type`: `text/plain`
- Body: `[Interface] ...`

---

## Firewall Rules

### Get Client Rules
**GET** `/rules/client/{public_key}`

Fetches all access rules where the specified client is the **source**.
*Note: `public_key` in URL is path-safe (can contain slashes).*

**Response**
```json
[
  {
    "id": 101,
    "source_client_id": 1,
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

Creates a new symmetric firewall rule.
(Generates `iptables -A ...` for `PostUp` and `iptables -D ...` for `PostDown`).

**Request Body (DTO)**
```json
{
  "destination": "192.168.1.50/32",  // IP or CIDR
  "destination_type": "host",        // "host" or "network"
  "port": 80,                        // Optional, null = all ports
  "proto": "tcp",                    // "tcp" or "udp" (default: udp)
  "action": "ACCEPT"                 // "ACCEPT" or "DROP" (default: ACCEPT)
}
```

**Response**
- `201 Created`: `{"id": 102}`

### Delete Rule
**DELETE** `/rules/{id}`

Deletes a specific rule by ID.

**Response**
- `200 OK`: `{"status": "deleted"}`

---

## System

### Commit Changes
**POST** `/commit`

Trigger a regeneration of the server configuration `wg0.conf` based on the current database state.
**Note**: This effectively "hot reloads" the configuration.

**Response**
- `200 OK`: `{"status": "committed", "file": "wg0_generated.conf"}`
