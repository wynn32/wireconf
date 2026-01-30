import os
import shutil
import subprocess
from app.system_service import SystemService

# Mocking subprocess run to avoid actual system changes during test
original_run = subprocess.run
original_exists = os.path.exists
original_which = shutil.which

def mock_run(cmd, check=True, stdout=None, stderr=None):
    print(f"MOCK RUN: {' '.join(cmd)}")
    # Simulate ip link show failure for non-existent interface
    if cmd[0] == 'ip' and cmd[1] == 'link':
        if 'missing_iface' in cmd:
            raise subprocess.CalledProcessError(1, cmd)
    return subprocess.CompletedProcess(cmd, 0)

def mock_exists(path):
    print(f"MOCK EXISTS: {path}")
    return True

def mock_which(cmd):
    if cmd == 'systemctl':
        return None # Force wg-quick path
    return "/usr/bin/wg-quick"

subprocess.run = mock_run
os.path.exists = mock_exists
shutil.which = mock_which

# Test Cases
print("--- Test 1: Restart with standard config ---")
try:
    SystemService.restart_service("content", "/etc/wireguard/wg0.conf")
except Exception as e:
    print(e)

print("\n--- Test 2: Restart with missing interface (simulated) ---")
# This is harder to mock perfectly without changing the import in system_service
# But we can see if it attempts the 'ip link show' command
try:
    # We will use a path that implies a name we catch in mock_run
    SystemService.restart_service("content", "/etc/wireguard/missing_iface.conf")
except Exception as e:
    print(e)
