"""
Setup Manager - Handles installation status, server configuration, and setup wizard.
"""

import os
import subprocess
from .models import db, ServerConfig
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
        # Check for installation marker file
        marker_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), '.installed')
        if os.path.exists(marker_path):
            return True
        
        # Also check database flag
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
    def configure_server(endpoint: str, port: int):
        """Configure server endpoint and port."""
        config = SetupManager.get_server_config()
        config.server_endpoint = endpoint
        config.server_port = port
        
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
            # Check if rule already exists
            check_cmd = f"iptables -C INPUT -p udp --dport {port} -j ACCEPT 2>/dev/null"
            result = subprocess.run(check_cmd, shell=True, capture_output=True)
            
            if result.returncode == 0:
                print(f"Firewall rule for port {port} already exists")
                return True
            
            # Add the rule
            add_cmd = f"iptables -A INPUT -p udp --dport {port} -j ACCEPT"
            subprocess.run(add_cmd, shell=True, check=True)
            print(f"✓ Added firewall rule for UDP port {port}")
            
            # Try to save rules persistently
            try:
                # Try netfilter-persistent first (Debian/Ubuntu)
                subprocess.run("netfilter-persistent save", shell=True, check=True, stderr=subprocess.DEVNULL)
                print("✓ Firewall rules saved persistently (netfilter-persistent)")
            except:
                try:
                    # Fallback to iptables-save
                    subprocess.run("iptables-save > /etc/iptables/rules.v4", shell=True, check=True)
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
    def get_setup_status():
        """Get current setup status."""
        config = SetupManager.get_server_config()
        return {
            'installed': SetupManager.is_installed(),
            'setup_completed': config.setup_completed,
            'server_configured': bool(config.server_endpoint and config.server_private_key),
            'server_endpoint': config.server_endpoint,
            'server_port': config.server_port,
            'server_public_key': config.server_public_key,
            'has_existing_host_config': SetupManager.check_host_config()
        }
