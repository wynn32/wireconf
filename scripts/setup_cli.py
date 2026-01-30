#!/usr/bin/env python3
import sys
import os
import socket
import ipaddress
import subprocess

# Add backend to sys.path to allow importing app modules
# We determine the path relative to this script
# Layout: /opt/wireconf/scripts/setup_cli.py -> /opt/wireconf/backend
current_dir = os.path.dirname(os.path.abspath(__file__))
backend_path = os.path.join(os.path.dirname(current_dir), 'backend')

if os.path.exists(backend_path):
    sys.path.append(backend_path)

try:
    from app import create_app, db
    from app.setup_manager import SetupManager
    from app.models import Network, Client, AccessRule
    from app.ip_manager import IPManager
    from app.key_manager import KeyManager
    from app.config_renderer import ConfigRenderer
    from app.importer import ConfigImporter
except ImportError as e:
    print(f"Error importing backend modules: {e}")
    print(f"Ensure that {backend_path} is in PYTHONPATH and dependencies are installed.")
    sys.exit(1)

app = create_app()

def get_input(prompt, default=None, required=False, validator=None):
    """Helper to get user input with default value and validation."""
    prompt_text = f"{prompt}"
    if default:
        prompt_text += f" [{default}]"
    prompt_text += ": "
    
    while True:
        try:
            value = input(prompt_text).strip()
        except EOFError:
            value = ""
            
        if not value and default:
            value = default
        
        if not value:
            if required:
                print("Value is required.")
                continue
        
        # Validation
        if validator and value:
            valid = validator(value)
            if valid is not True:
                # valid can be a string error message
                msg = valid if isinstance(valid, str) else "Invalid input"
                print(f"Error: {msg}")
                continue

        return value

def validate_port(val):
    try:
        p = int(val)
        if 1 <= p <= 65535:
            return True
        return "Port must be between 1 and 65535"
    except ValueError:
        return "Port must be an integer"

def validate_cidr(val):
    try:
        ipaddress.ip_network(val)
        return True
    except ValueError:
        return "Invalid CIDR format (e.g., 10.0.0.0/24)"

def validate_interface(val):
    try:
        ipaddress.ip_interface(val)
        return True
    except ValueError:
        return "Invalid Interface format (e.g., 10.0.0.1/24)"

def validate_file(val):
    if os.path.isfile(val):
        return True
    return "File not found."

def guess_public_ip():
    """Attempt to guess the server's public IP by connecting to a public DNS."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except:
        return None

def run_import():
    print("\n--- Import PiVPN Backup ---")
    print("This will import settings, clients, and keys from a PiVPN .tgz backup.")
    print("WARNING: This will overwrite any existing configuration in the database.")
    
    confirm = get_input("Continue?", "y")
    if confirm.lower() != 'y':
        return False

    path = get_input("Path to .tgz backup file", required=True, validator=validate_file)
    
    try:
        with open(path, 'rb') as f:
            print("Processing backup file...")
            # We force purge to ensure a clean slate for the import
            result = ConfigImporter.process_backup(f, force_purge=True, create_access_rules='all')
            
            if result.get('status') == 'success':
                stats = result.get('stats', {})
                print("✓ Import Successful")
                print(f"  - Networks created: {stats.get('networks_created')}")
                print(f"  - Clients created: {stats.get('clients_created')}")
                if stats.get('skipped_clients'):
                    print("\n  ⚠ Skipped Clients:")
                    for s in stats['skipped_clients']:
                        print(f"    - {s['name']}: {s['reason']}")
                return True
            else:
                print(f"✗ Import failed: {result.get('message')}")
                return False
    except Exception as e:
        print(f"✗ Error during import: {e}")
        return False

def run_interactive_setup():
    # 1. Server Configuration
    print("\n--- Server Configuration ---")
    current_conf = SetupManager.get_server_config()
    
    default_ep = current_conf.server_endpoint or guess_public_ip()
    default_port = str(current_conf.server_port or 51820)
    
    endpoint = get_input("Server Public IP/Domain", default_ep, required=True)
    port_input = get_input("Server Port", default_port, validator=validate_port)
    port = int(port_input)
    
    SetupManager.configure_server(endpoint, port)
    print(f"✓ Server configured: {endpoint}:{port}")
    
    # 2. Network Configuration
    print("\n--- Network Configuration ---")
    networks = Network.query.all()
    created_net = None
    
    should_create = False
    if not networks:
        print("No networks found. Creating a default network is recommended.")
        should_create = True
    else:
        print(f"Existing networks: {', '.join([n.name for n in networks])}")
        should_create = get_input("Create a new network?", "n").lower() == 'y'
        created_net = networks[0] # Default to first existing if not creating
        
    if should_create:
        name = get_input("Network Name", "LAN", required=True)
        cidr = get_input("Subnet CIDR", "10.0.0.0/24", required=True, validator=validate_cidr)
        
        # Suggest interface address based on CIDR
        default_iface = ""
        try:
            net = ipaddress.ip_network(cidr)
            # First host
            default_iface = f"{list(net.hosts())[0]}/{net.prefixlen}"
        except:
            pass
            
        iface = get_input("Interface Address (Gateway)", default_iface, required=True, validator=validate_interface)
        
        try:
            created_net = Network(name=name, cidr=cidr, interface_address=iface)
            db.session.add(created_net)
            db.session.commit()
            print(f"✓ Network '{name}' created ({cidr})")
        except Exception as e:
            print(f"Error creating network: {e}")
            db.session.rollback()

    # 3. Client Configuration
    print("\n--- Client Configuration ---")
    clients = Client.query.all()
    
    should_create_c = False
    if not clients:
        print("No clients found. Creating a default client is recommended.")
        should_create_c = True
    else:
        should_create_c = get_input("Create a new client?", "y").lower() == 'y'
        
    if should_create_c:
        name = get_input("Client Name", "my-client", required=True)
        
        priv = KeyManager.generate_private_key()
        pub = KeyManager.generate_public_key(priv)
        psk = KeyManager.generate_preshared_key()
        
        # Ensure we have a network to assign to
        if not created_net and networks:
            created_net = networks[0]
        elif not created_net:
            # Re-fetch just in case
            created_net = Network.query.first()
                
        if not created_net:
            print("Error: No network available to assign client to. Skipping client creation.")
        else:
            try:
                octet = IPManager.find_next_available_octet()
                
                client = Client(
                    name=name,
                    private_key=priv,
                    public_key=pub,
                    preshared_key=psk,
                    octet=octet,
                    networks=[created_net],
                    keepalive=25
                )
                db.session.add(client)
                db.session.commit()
                print(f"✓ Client '{name}' created")
            except Exception as e:
                print(f"Error creating client: {e}")
                db.session.rollback()
    return True

def run_setup():
    print("\n" + "="*50)
    print("WireGuard Setup CLI")
    print("="*50 + "\n")
    
    with app.app_context():
        # Check current status
        if SetupManager.is_setup_complete():
            print("Setup is already marked as complete in the database.")
            choice = get_input("Do you want to re-run the setup? (This will overwrite server settings)", "n")
            if choice.lower() != 'y':
                return

        # Mark installed (since we are running this, we assume it is installed)
        SetupManager.mark_installed()
        
        print("\nPlease select a setup mode:")
        print("1. Interactive Setup (Configure server, networks, clients manually)")
        print("2. Import PiVPN Backup (Restore from .tgz file)")
        
        mode = get_input("Select mode", "1")
        
        success = False
        if mode == "2":
            success = run_import()
        else:
            success = run_interactive_setup()
            
        if not success:
            print("\nSetup cancelled or failed.")
            return

        # 4. Finalize
        print("\n--- Finalizing Setup ---")

        try:
            SetupManager.complete_setup()
            print("✓ Database updated")
            
            # Render and Apply Configuration
            print("Generating WireGuard configuration...")
            
            server_config = SetupManager.get_server_config()
            networks = Network.query.all()
            clients = Client.query.all()
            rules = AccessRule.query.all()
            
            wg_conf = ConfigRenderer.render_wg_conf(
                server_config.server_private_key, 
                server_config.server_port, 
                networks, clients, rules
            )
            
            fw_script = ConfigRenderer.render_firewall_script(networks, clients, rules)
            
            # Determine path (check env var or default)
            wg_path = os.environ.get("WG_CONFIG_PATH", "/etc/wireguard/wg0.conf")
            
            # Write config file
            config_dir = os.path.dirname(wg_path)
            if not os.path.exists(config_dir):
                try:
                    os.makedirs(config_dir, exist_ok=True)
                except OSError:
                    pass

            with open(wg_path, 'w') as f:
                f.write(wg_conf)
            os.chmod(wg_path, 0o600)
            print(f"✓ Configuration written to {wg_path}")
            
            # Write rules script
            rules_path = wg_path.replace('.conf', '-rules.sh')
            with open(rules_path, 'w') as f:
                f.write(fw_script)
            os.chmod(rules_path, 0o755)
            print(f"✓ Firewall script written to {rules_path}")
            
            # Restart Interface
            print("Restarting WireGuard interface...")
            # Ignore errors on down (interface might not be up)
            subprocess.run(["wg-quick", "down", wg_path], capture_output=True)
            try:
                subprocess.run(["wg-quick", "up", wg_path], check=True, capture_output=True)
                print("✓ Interface restarted successfully")
            except subprocess.CalledProcessError as e:
                print(f"⚠ Warning: Failed to bring up interface: {e.stderr.decode() if e.stderr else str(e)}")
                print("You may need to check your configuration or logs.")
                
        except Exception as e:
            print(f"Error finalizing setup: {e}")
            import traceback
            traceback.print_exc()

    print("\nSetup Wizard Complete!")

if __name__ == "__main__":
    run_setup()
