"""
Setup Manager - Handles installation status, server configuration, and setup wizard.
"""

import os
import subprocess
import shutil
from .models import db, ServerConfig
from .command_utils import get_command_path
from .key_manager import KeyManager

class SetupManager:
    @staticmethod
    def get_server_config():
        """Get or create the server configuration singleton."""
        config = db.session.get(ServerConfig, 1)
        if not config:
            config = ServerConfig(id=1)
            db.session.add(config)
            db.session.commit()
        return config
    
    @staticmethod
    def is_installed():
        """Check if system dependencies are installed."""
        # Helper relies purely on DB flag now
        config = SetupManager.get_server_config()
        return config.installed
    
    @staticmethod
    def mark_installed():
        """Mark system as installed in database."""
        config = SetupManager.get_server_config()
        config.installed = True
        db.session.commit()
    
    @staticmethod
    def is_setup_complete():
        """Check if setup wizard has been completed."""
        config = SetupManager.get_server_config()
        return config.setup_completed
    
    @staticmethod
    def generate_server_keys():
        """Generate and store server WireGuard keys."""
        config = SetupManager.get_server_config()
        
        # Generate keys
        private_key = KeyManager.generate_private_key()
        public_key = KeyManager.generate_public_key(private_key)
        
        # Store in database
        config.server_private_key = private_key
        config.server_public_key = public_key
        db.session.commit()
        
        return {
            'private_key': private_key,
            'public_key': public_key
        }
    
    @staticmethod
    def configure_server(endpoint: str, port: int, private_key: str = None, public_key: str = None):
        """Configure server endpoint and port."""
        config = SetupManager.get_server_config()
        config.server_endpoint = endpoint
        config.server_port = port
        
        if private_key:
            config.server_private_key = private_key
        
        if public_key:
            config.server_public_key = public_key
        
        # Generate keys if not already generated
        if not config.server_private_key:
            SetupManager.generate_server_keys()
        
        db.session.commit()
        
        return {
            'endpoint': config.server_endpoint,
            'port': config.server_port,
            'public_key': config.server_public_key
        }
    
    @staticmethod
    def add_firewall_rule(port: int):
        """Add iptables rule to allow WireGuard traffic."""
        try:
            # Find iptables path
            iptables_path = get_command_path("iptables")
            # Check if rule already exists
            check_cmd = f"{iptables_path} -C INPUT -p udp --dport {port} -j ACCEPT 2>/dev/null"
            result = subprocess.run(check_cmd, shell=True, capture_output=True)
            
            if result.returncode == 0:
                print(f"Firewall rule for port {port} already exists")
                return True
            
            # Add the rule
            add_cmd = f"{iptables_path} -A INPUT -p udp --dport {port} -j ACCEPT"
            subprocess.run(add_cmd, shell=True, check=True)
            print(f"✓ Added firewall rule for UDP port {port}")
            
            # Try to save rules persistently
            try:
                # Try netfilter-persistent first (Debian/Ubuntu)
                np_path = get_command_path("netfilter-persistent")
                subprocess.run(f"{np_path} save", shell=True, check=True, stderr=subprocess.DEVNULL)
                print("✓ Firewall rules saved persistently (netfilter-persistent)")
            except:
                try:
                    # Fallback to iptables-save
                    iptables_save_path = get_command_path("iptables-save")
                    subprocess.run(f"{iptables_save_path} > /etc/iptables/rules.v4", shell=True, check=True)
                    print("✓ Firewall rules saved persistently (iptables-save)")
                except:
                    print("⚠ Warning: Could not save firewall rules persistently")
            
            return True
        except subprocess.CalledProcessError as e:
            print(f"✗ Failed to add firewall rule: {e}")
            return False
        except Exception as e:
            print(f"✗ Error adding firewall rule: {e}")
            return False
    
    @staticmethod
    def complete_setup():
        """Mark setup as complete and add firewall rule."""
        config = SetupManager.get_server_config()
        
        # Add firewall rule for configured port
        if config.server_port:
            SetupManager.add_firewall_rule(config.server_port)
        
        # Mark setup as complete
        config.setup_completed = True
        db.session.commit()
        
        # Promote current DB to safety baseline so reverts don't lose setup state
        try:
            from .safety_manager import SafetyManager
            if os.path.exists(SafetyManager.DB_PATH):
                shutil.copy2(SafetyManager.DB_PATH, SafetyManager.LAST_GOOD_DB_PATH)
                print("[SetupManager] Promoted current DB to last_good baseline.")
        except Exception as e:
            print(f"[SetupManager] Failed to promote DB to baseline: {e}")

        return True
    
    @staticmethod
    def check_host_config():
        """Check if there's existing content in the host WireGuard config."""
        config_path = os.environ.get("WG_CONFIG_PATH", "/etc/wireguard/wg0.conf")
        if os.path.exists(config_path):
            try:
                with open(config_path, "r") as f:
                    content = f.read().strip()
                    return len(content) > 0
            except:
                pass
        return False
    
    @staticmethod
    def get_server_details():
        """Return server configuration details for authenticated consumers."""
        config = SetupManager.get_server_config()

        # Determine whether server has been configured (endpoint + private key)
        server_configured = bool(config.server_endpoint and config.server_private_key)

        # Count networks/clients
        from .models import Network, Client
        has_networks = Network.query.count() > 0
        has_clients = Client.query.count() > 0

        return {
            'server_endpoint': config.server_endpoint,
            'server_port': config.server_port,
            'server_public_key': config.server_public_key,
            'server_configured': server_configured,
            'has_networks': has_networks,
            'has_clients': has_clients
        }

    @staticmethod
    def get_setup_status():
        """Get current setup status."""
        config = SetupManager.get_server_config()
        # Public minimal status - do not expose server endpoint/keys
        return {
            'installed': SetupManager.is_installed(),
            'setup_completed': config.setup_completed,
            'has_existing_host_config': SetupManager.check_host_config()
        }
