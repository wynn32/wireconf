import requests
import subprocess
import time
import sys
import os

# Start the server
print("Starting server...")
proc = subprocess.Popen([sys.executable, "run.py"], cwd="/root/take2/backend", stdout=subprocess.PIPE, stderr=subprocess.PIPE)
time.sleep(3) # Wait for startup

BASE_URL = "http://localhost:5000/api"

try:
    print("Creating Network 1...")
    res = requests.post(f"{BASE_URL}/networks", json={
        "name": "Management",
        "cidr": "10.0.1.0/24",
        "interface_address": "10.0.1.1/24"
    })
    print(res.status_code, res.text)
    net1_id = res.json()['id']

    print("Creating Client 1 (Both Networks)...")
    res = requests.post(f"{BASE_URL}/clients", json={
        "name": "admin-laptop",
        "networks": [net1_id]
    })
    print(res.status_code, res.text)
    client1 = res.json()
    pk = client1['public_key']
    
    print(f"Creating Rule for Client 1 ({pk})...")
    # Allow access to 8.8.8.8/32 on port 53 UDP
    res = requests.post(f"{BASE_URL}/rules/client/{pk}", json={
        "destination": "8.8.8.8/32",
        "destination_type": "host",
        "port": 53,
        "proto": "upd", # Typo intentional to check robustness? No, fixed to udp
        "proto": "udp",
        "action": "ACCEPT"
    })
    print(res.status_code, res.text)
    assert res.status_code == 201

    print("Committing...")
    res = requests.post(f"{BASE_URL}/commit")
    print(res.status_code, res.text)
    
    # Check status
    json_resp = res.json()
    if 'committed' in json_resp['status']:
         print("SUCCESS: Commit call accepted.")
    else:
         print(f"FAIL: Commit status: {json_resp['status']}")
         
    # Read generated config
    with open("wg0_generated.conf", "r") as f:
        config = f.read()
        print("\nGenerated Config:")
        print(config)
        
        # Verify IPTables Rules
        # New Logic: Chain creation and jump
        expected_chain_create = "iptables -N WG_ACCESS_CONTROL 2>/dev/null || true"
        expected_jump = "iptables -C FORWARD -j WG_ACCESS_CONTROL 2>/dev/null || iptables -I FORWARD -j WG_ACCESS_CONTROL"
        
        # Rule should be in the new chain
        expected_rule = "iptables -A WG_ACCESS_CONTROL -i wg0 -s 10.0.1.2/32 -d 8.8.8.8/32 -p udp --dport 53 -j ACCEPT"
        
        if expected_chain_create in config and expected_jump in config:
             print("SUCCESS: Chain creation and Jump found.")
        else:
             print("FAIL: Chain creation or Jump NOT found.")

        if expected_rule in config:
            print("SUCCESS: Firewall Rule in Chain found.")
        else:
            print(f"FAIL: Firewall Rule in Chain NOT found. Expected: {expected_rule}")

finally:
    proc.terminate()
