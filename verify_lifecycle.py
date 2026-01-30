import requests
import time
import sys

API_URL = "http://localhost:5000/api"

def log(msg):
    print(f"[TEST] {msg}")

def check(condition, msg):
    if not condition:
        print(f"[FAIL] {msg}")
        sys.exit(1)
    print(f"[PASS] {msg}")

def run_test():
    # 1. Setup: Create Network
    log("Creating Network...")
    net_res = requests.post(f"{API_URL}/networks", json={
        "name": "LifeCycleNet",
        "cidr": "10.99.0.0/24",
        "interface_address": "10.99.0.1/24"
    })
    check(net_res.status_code == 201, "Network created")
    net_id = net_res.json()['id']

    # 2. Create Normal Client
    log("Creating Client A...")
    c1_res = requests.post(f"{API_URL}/clients", json={
        "name": "ClientA",
        "networks": [net_id],
        "keepalive": 25
    })
    check(c1_res.status_code == 201, "Client A created")
    c1_data = c1_res.json()
    c1_id = c1_data['id']
    c1_pub = c1_data['public_key']

    # 3. Create Router Client
    log("Creating Router B...")
    c2_res = requests.post(f"{API_URL}/clients", json={
        "name": "RouterB",
        "networks": [net_id],
        "routes": ["192.168.99.0/24"]
    })
    check(c2_res.status_code == 201, "Router B created")
    c2_data = c2_res.json()
    c2_id = c2_data['id']
    c2_pub = c2_data['public_key']

    # 4. Create Rule: Client A access Router B's subnet
    log("Creating Rule for Client A -> Router B Subnet...")
    rule_res = requests.post(f"{API_URL}/rules/client/{requests.utils.quote(c1_pub)}", json={
        "destination": "192.168.99.0/24",
        "destination_type": "network",
        "proto": "tcp",
        "port": 80,
        "action": "ACCEPT"
    })
    check(rule_res.status_code == 201, "Rule created")
    rule_id = rule_res.json()['id']

    # 5. Commit and Check Config (Enabled)
    log("Committing (Enabled)...")
    requests.post(f"{API_URL}/commit")
    
    # Read generated config (mocked path or actual if dev)
    # The backend is running with default path? ./wg0_generated.conf usually
    try:
        with open("/root/take2/backend/wg0_generated.conf", "r") as f:
            conf = f.read()
            check(f"### begin ClientA ###" in conf, "ClientA present in config")
            check(f"### begin RouterB ###" in conf, "RouterB present in config")
            # Check RouterB has AllowedIPs with subnet?
            # RouterB AllowedIPs on server should include 192.168.99.0/24?
            # Wait, render_wg_conf:
            # allowed_ips list includes routes.
            # Find RouterB section
            b_start = conf.find("### begin RouterB ###")
            b_end = conf.find("### end RouterB ###")
            b_sec = conf[b_start:b_end]
            check("192.168.99.0/24" in b_sec, "RouterB has routed CIDR in AllowedIPs")
    except FileNotFoundError:
        log("Config file not found, skipping file check (maybe running elsewhere)")

    # 6. Disable Client A
    log("Disabling Client A...")
    up_res = requests.put(f"{API_URL}/clients/{c1_id}", json={"enabled": False})
    check(up_res.status_code == 200, "Client A disabled")
    check(up_res.json()['enabled'] == False, "Client A status is False")

    log("Committing (Disabled)...")
    requests.post(f"{API_URL}/commit")
    
    with open("/root/take2/backend/wg0_generated.conf", "r") as f:
        conf = f.read()
        check(f"### begin ClientA ###" not in conf, "ClientA REMOVED from config")
        check(f"### begin RouterB ###" in conf, "RouterB still present")

    # 7. Delete Router B (check cascade)
    log("Deleting Router B...")
    del_res = requests.delete(f"{API_URL}/clients/{c2_id}")
    check(del_res.status_code == 200, "Router B deleted")

    # Check Routes deleted
    # We can't query DB directly easily here without SQL, but we can check GET /clients
    clients_res = requests.get(f"{API_URL}/clients")
    ids = [c['id'] for c in clients_res.json()]
    check(c2_id not in ids, "Router B ID not in client list")

    log("Lifecycle Test Complete!")

if __name__ == "__main__":
    try:
        run_test()
    except Exception as e:
        print(f"Exception: {e}")
        sys.exit(1)
