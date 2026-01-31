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
    from app.auth_manager import AuthManager
    from app.models import Network, Client, AccessRule, User, Permission, PermissionPreset, PermissionPresetRule
    from app.ip_manager import IPManager
    from app.key_manager import KeyManager
    from app.config_renderer import ConfigRenderer
    from app.importer import ConfigImporter
except ImportError as e:
    print(f"Error importing backend modules: {e}")
    print(f"Ensure that {backend_path} is in PYTHONPATH and dependencies are installed.")
    sys.exit(1)

app = create_app()

def get_input(prompt, default=None, required=False, validator=None, hidden=False):
    """Helper to get user input with default value and validation."""
    prompt_text = f"{prompt}"
    if default:
        prompt_text += f" [{default}]"
    prompt_text += ": "
    
    while True:
        try:
            if hidden:
                import getpass
                value = getpass.getpass(prompt_text).strip()
            else:
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
                
                # Offer to show QR code for easy import
                show_qr = get_input("Show QR code for this client?", "y").lower() == 'y'
                if show_qr:
                    # Use ConfigRenderer to generate client config
                    server_config = SetupManager.get_server_config()
                    server_endpoint = f"{server_config.server_endpoint}:{server_config.server_port}"
                    client_config = ConfigRenderer.render_client_config(client, server_config.server_public_key, server_endpoint)
                    show_qr_code(client_config)
            except Exception as e:
                print(f"Error creating client: {e}")
                db.session.rollback()
    return True

def patch_database():
    """Check for schema consistency and patch if necessary."""
    from sqlalchemy import inspect
    from sqlalchemy import text
    
    inspector = inspect(db.engine)
    
    # 1. Check User table for 'is_active'
    if inspector.has_table('user'):
        columns = [c['name'] for c in inspector.get_columns('user')]
        if 'is_active' not in columns:
            print("Patching database: Adding 'is_active' to user table...")
            with db.engine.connect() as conn:
                conn.execute(text("ALTER TABLE user ADD COLUMN is_active BOOLEAN DEFAULT 1 NOT NULL"))
                conn.commit()
                
        if 'created_at' not in columns:
            print("Patching database: Adding 'created_at' to user table...")
            import time
            now = int(time.time())
            with db.engine.connect() as conn:
                conn.execute(text(f"ALTER TABLE user ADD COLUMN created_at INTEGER DEFAULT {now} NOT NULL"))
                conn.commit()
                
        if 'is_root' not in columns:
            print("Patching database: Adding 'is_root' to user table...")
            with db.engine.connect() as conn:
                conn.execute(text("ALTER TABLE user ADD COLUMN is_root BOOLEAN DEFAULT 0 NOT NULL"))
                conn.commit()
                
        if 'preset_id' not in columns:
            print("Patching database: Adding 'preset_id' to user table...")
            with db.engine.connect() as conn:
                conn.execute(text("ALTER TABLE user ADD COLUMN preset_id INTEGER"))
                conn.commit()
                
    # 2. Check Permission table for 'is_override'
    if inspector.has_table('permission'):
        columns = [c['name'] for c in inspector.get_columns('permission')]
        if 'is_override' not in columns:
            print("Patching database: Adding 'is_override' to permission table...")
            with db.engine.connect() as conn:
                conn.execute(text("ALTER TABLE permission ADD COLUMN is_override BOOLEAN DEFAULT 0 NOT NULL"))
                conn.commit()
    
    # 3. Ensure preset tables exist via db.create_all()
    db.create_all()
                
    print("✓ Database schema verified")

def ensure_admin_user(force_create=False):
    """Ensure at least one admin user exists and has full permissions via root preset.
    
    Args:
        force_create: If True, force creation of first admin user without prompting about re-run.
    """
    
    # 1. Ensure "root" preset exists
    root_preset = PermissionPreset.query.filter_by(name='root').first()
    if not root_preset:
        print("Creating 'root' permission preset...")
        root_preset = PermissionPreset(
            name='root',
            description='Full system access - all permissions'
        )
        db.session.add(root_preset)
        db.session.flush()  # Get the ID
        
        # Add all permissions to root preset
        permissions = ['VIEW', 'MODIFY', 'CREATE', 'DELETE', 'OVERRIDE_DMS', 'MANAGE_USERS']
        for perm in permissions:
            rule = PermissionPresetRule(
                preset_id=root_preset.id,
                scope_type='GLOBAL',
                scope_id=None,
                permission_level=perm
            )
            db.session.add(rule)
        
        db.session.commit()
        print("✓ Created 'root' preset with full permissions")
    
    # 2. Check if we need to create first user
    user_count = User.query.count()
    if user_count == 0:
        print("\n--- Initial User Setup ---")
        print("No users found. You must create an administrator account.")
        username = get_input("Username", "admin", required=True)
        password = get_input("Password", required=True, hidden=True)
        
        try:
            print("Creating admin user...")
            user = AuthManager.create_user(username, password, is_root=True)
            user.preset_id = root_preset.id
            db.session.commit()
            print(f"✓ User '{username}' created and assigned to 'root' preset")
        except Exception as e:
            print(f"✗ Failed to create user: {e}")
            sys.exit(1)
    else:
        # Ensure at least one user has the root preset
        root_users = User.query.filter_by(preset_id=root_preset.id).count()
        if root_users == 0:
            print("Note: No users are currently assigned to the 'root' preset.")
            
def reset_password():
    """Reset password for an existing user."""
    print("\n--- Reset User Password ---")
    users = User.query.all()
    if not users:
        print("No users found.")
        return

    print("Available Users:")
    for i, u in enumerate(users):
        print(f"{i+1}. {u.username}")
        
    choice = get_input("Select user #", validator=lambda x: x.isdigit() and 1 <= int(x) <= len(users) or "Invalid selection")
    user = users[int(choice)-1]
    
    new_pass = get_input(f"New password for {user.username}", required=True, hidden=True)
    confirm_pass = get_input("Confirm password", required=True, hidden=True)
    
    if new_pass != confirm_pass:
        print("Error: Passwords do not match.")
        return
        
    try:
        from werkzeug.security import generate_password_hash
        user.password_hash = generate_password_hash(new_pass)
        db.session.commit()
        print(f"✓ Password updated for '{user.username}'")
    except Exception as e:
        print(f"Error updating password: {e}")


def show_qr_code(client_config):
    """Display QR code for client configuration."""
    try:
        import qrcode
    except ImportError:
        print("⚠ qrcode library not installed. Skipping QR code generation.")
        return
    
    try:
        qr = qrcode.QRCode(version=None, box_size=1, border=1)
        qr.add_data(client_config)
        qr.make(fit=True)
        
        print("\n--- Client Configuration QR Code ---")
        qr.print_ascii(invert=True)
        print("\nYou can scan this QR code with a WireGuard mobile app to import the configuration.")
    except Exception as e:
        print(f"⚠ Error generating QR code: {e}")


def finalize_setup():
    """Generate and apply WireGuard configuration to the system."""
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


def show_recovery_menu():
    """Show maintenance/recovery options for already-configured systems."""
    print("\nSystem already configured. Select an option:")
    print("1. Reset User Password")
    
    mode = get_input("Select option", "1")
    
    if mode == "1":
        reset_password()
    
    print("\nExiting.")


def run_setup():
    with app.app_context():
        # 0. Patch Schema (if needed for upgrades)
        patch_database()
        
        # 1. Check if users exist and force creation if not
        user_existed_before = User.query.count() > 0
        ensure_admin_user(force_create=not user_existed_before)
        user_was_created = not user_existed_before
        
        # Mark installed (since we are running this, we assume it is installed)
        SetupManager.mark_installed()
        
        # 2. Check if configuration exists
        configs_exist = SetupManager.is_setup_complete()
        
        # 3. Onboarding flow: if no configs, prompt for setup method
        if not configs_exist:
            print("\n--- Setup Configuration ---")
            print("No configuration found. Please select a setup method:")
            print("1. Create Network and Client manually")
            print("2. Import PiVPN Backup")
            print("3. Skip and set up in Web UI")
            
            mode = get_input("Select option", "1")
            
            if mode == "3":
                print("\n⚠ WARNING: No clients will be able to connect to the server until it is configured in the Web UI.")
                print("\nExiting.")
                return
            
            success = False
            if mode == "2":
                success = run_import()
            else:
                success = run_interactive_setup()
            
            if not success:
                print("\nSetup cancelled or failed.")
                return
            
            # Finalize setup after completing onboarding
            finalize_setup()
            
            print("\nSetup Wizard Complete!")
            return
        
        # 4. Recovery menu: if configs exist and we didn't just create a user
        if configs_exist and not user_was_created:
            show_recovery_menu()
            return
        
        # 5. Configs exist but user was just created (new setup)
        if configs_exist and user_was_created:
            print("\nConfiguration already exists. Exiting.")
            return

if __name__ == "__main__":
    run_setup()
