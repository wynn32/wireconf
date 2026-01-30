import ipaddress
import re
from .models import db, Client, Network, Route, ServerConfig, AccessRule
from .key_manager import KeyManager
from .setup_manager import SetupManager

class ConfigImporter:
    @staticmethod
    def process_config_content(content: str):
        """
        Parses wireguard config content and imports into database.
        Returns stats dict of what was imported.
        """
        lines = content.splitlines()
        
        current_section = None
        server_data = {}
        peers = []
        current_peer = {}
        
        # Regex for capturing "Name: Value" comments for client names
        name_comment_re = re.compile(r'#\s*(?:Name:)?\s*([a-zA-Z0-9_\-]+)')

        # Pass 1: Parse INI-like structure manually (standard ConfigParser ignores dupes)
        last_comment_name = None
        
        for line in lines:
            line = line.strip()
            if not line:
                last_comment_name = None
                continue
                
            if line.startswith('#'):
                # Try to capture name from comment
                match = name_comment_re.search(line)
                if match:
                    last_comment_name = match.group(1)
                continue
            
            if line.startswith('[') and line.endswith(']'):
                # New Section
                section_name = line[1:-1].lower()
                
                if section_name == 'interface':
                    current_section = 'interface'
                elif section_name == 'peer':
                    # Save previous peer if exists
                    if current_peer:
                        peers.append(current_peer)
                    current_section = 'peer'
                    current_peer = {'_comment_name': last_comment_name}
                    last_comment_name = None
                continue
            
            if '=' in line:
                key, val = line.split('=', 1)
                key = key.strip().lower()
                val = val.strip()
                
                if current_section == 'interface':
                    server_data[key] = val
                elif current_section == 'peer':
                    current_peer[key] = val
        
        # Capture last peer
        if current_peer:
            peers.append(current_peer)
            
        return ConfigImporter._import_to_db(server_data, peers)

    @staticmethod
    def _import_to_db(server_data, peers_data):
        stats = {
            'server_updated': False,
            'networks_created': 0,
            'clients_created': 0,
            'routes_created': 0
        }
        
        try:
            # 1. Update Server Config
            server_config = SetupManager.get_server_config()
            
            # Keys
            pk = server_data.get('privatekey')
            if pk:
                server_config.server_private_key = pk
                # Use key manager to derive public if possible, or wait
                try:
                    server_config.server_public_key = KeyManager.generate_public_key(pk)
                except:
                    pass 
            else:
                # Placeholder if missing
                if not server_config.server_private_key:
                    server_config.server_private_key = "IMPORT_MISSING_PRIVATE_KEY"

            # Port
            port = server_data.get('listenport')
            if port:
                server_config.server_port = int(port)
            
            # Endpoint (try to find from comments or just existing?)
            # Config files usually don't have their own endpoint in [Interface]
            # We keep existing or placeholder
            
            server_config.installed = True
            server_config.setup_completed = True
            stats['server_updated'] = True
            db.session.commit()
            
            # 2. Extract Networks from [Interface] Address
            # Format: 10.0.0.1/24, fd00::1/64
            addresses = server_data.get('address', '').split(',')
            server_networks = [] # List of ipaddress.IPv4Network
            
            for addr_str in addresses:
                addr_str = addr_str.strip()
                if not addr_str: continue
                try:
                    # addr_str is like 10.0.0.1/24. 
                    # We want the network: 10.0.0.0/24
                    # and the interface ip: 10.0.0.1/24
                    
                    if_interface = ipaddress.ip_interface(addr_str)
                    if isinstance(if_interface, ipaddress.IPv6Interface):
                        continue # Skipping IPv6 for now as per previous constraints? Or add support.
                        
                    network_obj = if_interface.network
                    
                    # Check if network exists
                    existing_net = Network.query.filter_by(cidr=str(network_obj)).first()
                    
                    if not existing_net:
                        # Infer name
                        net_name = f"imported_net_{network_obj.network_address}"
                        
                        new_net = Network(
                            name=net_name,
                            cidr=str(network_obj),
                            interface_address=str(if_interface)
                        )
                        db.session.add(new_net)
                        db.session.commit() # Commit to get ID
                        stats['networks_created'] += 1
                        server_networks.append(network_obj)
                    else:
                        server_networks.append(network_obj)
                        
                except Exception as e:
                    print(f"Skipping invalid address: {addr_str} error: {e}")
                    
            # Refetch networks to have IDs
            all_db_networks = Network.query.all()
            
            # 3. Import Peers
            for p in peers_data:
                pub_key = p.get('publickey')
                if not pub_key: continue
                
                # Check for existing Client
                existing_client = Client.query.filter_by(public_key=pub_key).first()
                if existing_client:
                    continue # Skip duplicates
                
                # Name strategy
                name = p.get('_comment_name')
                if not name:
                    name = f"client_{pub_key[:5]}"
                
                # AllowedIPs = Client IP(s) + Routes
                allowed_ips = p.get('allowedips', '').split(',')
                
                client_networks_to_join = []
                client_routes = []
                client_octet = 0 # Try to preserve last octet of first IP
                
                for ip_str in allowed_ips:
                    ip_str = ip_str.strip()
                    if not ip_str: continue
                    
                    try:
                        # Check if this IP belongs to one of our server networks
                        # e.g ip_str = 10.0.0.5/32
                        ip_addr = ipaddress.ip_interface(ip_str).ip
                        
                        matched_net = None
                        for net_obj in server_networks:
                            if ip_addr in net_obj:
                                matched_net = net_obj
                                break
                        
                        if matched_net:
                            # It's a client address in a VPN network
                            # Find DB network
                            db_net = next((n for n in all_db_networks if n.cidr == str(matched_net)), None)
                            if db_net:
                                client_networks_to_join.append(db_net)
                                # Try to grab octet if it's the first one
                                if client_octet == 0:
                                    parts = str(ip_addr).split('.')
                                    if len(parts) == 4:
                                        client_octet = int(parts[3])
                        else:
                            # It's a Route (subnet behind client)
                            # e.g. 192.168.1.0/24
                            client_routes.append(ip_str)
                            
                    except:
                        pass
                
                # Create Client
                new_client = Client(
                    name=name,
                    public_key=pub_key,
                    preshared_key=p.get('presharedkey'),
                    octet=client_octet if client_octet > 0 else 0, # Should find a better way if duplicate
                    enabled=True,
                    dns_mode='default' # Default assumption
                )
                db.session.add(new_client)
                db.session.commit()
                
                # Join Networks
                for n in client_networks_to_join:
                    if n not in new_client.networks:
                        new_client.networks.append(n)
                
                # Add Routes
                for r_cidr in client_routes:
                    new_route = Route(
                        source_client_id=new_client.id,
                        target_cidr=r_cidr
                    )
                    db.session.add(new_route)
                
                db.session.commit()
                stats['clients_created'] += 1
                stats['routes_created'] += len(client_routes)
                
            return stats
            
        except Exception as e:
            db.session.rollback()
            raise e
