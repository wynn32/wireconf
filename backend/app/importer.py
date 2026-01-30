import ipaddress
import re
import tarfile
import io
import os
import shutil
from .models import db, Client, Network, Route, ServerConfig, AccessRule, client_network_association
from .key_manager import KeyManager
from .setup_manager import SetupManager
from .name_utils import resolve_client_name

class ConfigImporter:
    @staticmethod
    def process_backup(file_stream, force_purge=False, create_access_rules='all'):
        """
        Processes a PiVPN backup .tgz file.
        Returns a dict with 'status' and 'stats' or 'mismatch_detected'.
        
        Args:
            file_stream: File stream of the .tgz backup
            force_purge: If True, purge existing data before import
            create_access_rules: 'all' to create rules, 'none' to skip
        """
        try:
            with tarfile.open(fileobj=file_stream, mode="r:gz") as tar:
                # 1. Find Server Config
                # PiVPN backup structure: etc/wireguard/wg0.conf
                server_conf_path = None
                for member in tar.getmembers():
                    if member.name.endswith('wg0.conf'):
                        server_conf_path = member.name
                        break
                
                if not server_conf_path:
                    # Try etc/wireguard/pivpn.conf if wg0.conf is missing
                    for member in tar.getmembers():
                        if member.name.endswith('pivpn.conf'):
                            server_conf_path = member.name
                            break

                if not server_conf_path:
                    raise Exception("Server configuration (wg0.conf) not found in backup.")

                server_content = tar.extractfile(server_conf_path).read().decode('utf-8')
                server_data, server_peers = ConfigImporter._parse_ini_content(server_content)

                # 2. Key Mismatch Check
                current_config = SetupManager.get_server_config()
                imported_pk = server_data.get('privatekey')
                
                if current_config.server_private_key and current_config.setup_completed:
                    if imported_pk and current_config.server_private_key != imported_pk:
                        if not force_purge:
                            return {
                                'status': 'mismatch',
                                'message': 'Imported server key does not match current key. Purge database and continue?'
                            }

                # Prepare base peers from server config
                # We'll key them by public key for easier enrichment
                peers_map = {}
                server_endpoint = None  # Will try to extract from client configs
                
                for p in server_peers:
                    pk = p.get('publickey')
                    if pk:
                        # Normalize keys for fallback logic
                        p['presharedkey'] = p.get('presharedkey')
                        p['allowedips'] = p.get('allowedips')
                        # Resolve name using centralized logic (comment -> IP -> generated)
                        p['name'] = resolve_client_name(p)
                        peers_map[pk] = p

                # 3. Find and Parse Client Configs to enrich with Private Keys
                for member in tar.getmembers():
                    # More flexible check: any .conf file that isn't the server config
                    if member.name.endswith('.conf') and not member.isdir():
                        if member.name == server_conf_path:
                            continue
                        
                        try:
                            client_content = tar.extractfile(member).read().decode('utf-8')
                            client_data, client_peers = ConfigImporter._parse_ini_content(client_content)
                            
                            priv_key = client_data.get('privatekey')
                            if not priv_key:
                                print(f"DEBUG: No privatekey found in {member.name}")
                                continue
                            
                            try:
                                client_pub = KeyManager.generate_public_key(priv_key)
                            except Exception as key_gen_error:
                                print(f"ERROR: Failed to generate public key from {member.name}: {key_gen_error}")
                                continue
                            
                            print(f"DEBUG: Derived public key from {member.name}: {client_pub}")
                            
                            # Extract server endpoint from the first client config we find
                            if not server_endpoint and client_peers:
                                # Client configs have [Peer] section with Endpoint = hostname:port
                                endpoint_value = client_peers[0].get('endpoint')
                                if endpoint_value:
                                    # Strip port if present (we have it from server config)
                                    server_endpoint = endpoint_value.split(':')[0] if ':' in endpoint_value else endpoint_value
                                    print(f"DEBUG: Extracted server endpoint from client config: {server_endpoint}")
                            
                            if client_pub in peers_map:
                                # Enrich existing peer with private key and address
                                peers_map[client_pub]['privatekey'] = priv_key
                                # Address in client config is the IP it uses on the interface
                                if client_data.get('address'):
                                    peers_map[client_pub]['address'] = client_data.get('address')
                                print(f"DEBUG: Matched {member.name} to peer {client_pub}")
                            else:
                                print(f"DEBUG: No peer found for derived public key {client_pub} from {member.name}")
                                print(f"DEBUG: Available peers_map keys: {list(peers_map.keys())}")
                        except Exception as e:
                            print(f"Error processing client config {member.name}: {e}")
                            import traceback
                            traceback.print_exc()
                            continue

                final_peers = list(peers_map.values())

                return {
                    'status': 'success',
                    'stats': ConfigImporter._import_to_db(server_data, final_peers, force_purge=force_purge, server_endpoint=server_endpoint, create_access_rules=create_access_rules)
                }
        except Exception as e:
            raise e

    @staticmethod
    def process_config_content(content: str):
        """
        Parses wireguard config content and imports into database.
        Returns stats dict of what was imported.
        """
        server_data, peers = ConfigImporter._parse_ini_content(content)
        return ConfigImporter._import_to_db(server_data, peers)

    @staticmethod
    def _parse_ini_content(content: str):
        """
        Generic parser for WireGuard INI files.
        """
        lines = content.splitlines()
        current_section = None
        interface_data = {}
        peers = []
        current_peer = {}
        
        name_comment_re = re.compile(r'^#+\s*(.*?)\s*#*$')
        last_comment_name = None
        
        for line in lines:
            line = line.strip()
            if not line:
                last_comment_name = None
                continue
            if line.startswith('#'):
                match = name_comment_re.search(line)
                if match:
                    val = match.group(1).strip()
                    # Strip "Name:" prefix if it exists
                    if val.lower().startswith('name:'):
                        val = val[5:].strip()
                    if val:
                        last_comment_name = val
                continue
            if line.startswith('[') and line.endswith(']'):
                section_name = line[1:-1].lower()
                if section_name == 'interface':
                    current_section = 'interface'
                elif section_name == 'peer':
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
                    interface_data[key] = val
                elif current_section == 'peer':
                    current_peer[key] = val
        if current_peer:
            peers.append(current_peer)
            
        # Clean up peer names if they have common prefixes/suffixes
        ConfigImporter._cleanup_peer_names(peers)
        
        return interface_data, peers

    @staticmethod
    def _cleanup_peer_names(peers):
        """
        Strips common whole-word prefixes/suffixes across all peer names.
        Only strips if separated by spaces.
        """
        if not peers:
            return

        name_lists = []
        for p in peers:
            name = p.get('_comment_name')
            if not name:
                return
            # Split by spaces, keep empty strings if multiple spaces for reconstruction
            name_lists.append(name.split(' '))

        if len(name_lists) < 2:
            return

        # Find common prefix words
        common_prefix = []
        first_list = name_lists[0]
        for i in range(len(first_list)):
            word = first_list[i]
            match = True
            for other in name_lists[1:]:
                if i >= len(other) or other[i] != word:
                    match = False
                    break
            if match:
                common_prefix.append(word)
            else:
                break
        
        # We don't want to strip EVERYTHING if names are identical or one is a subset
        # But usually there's a unique part. If prefix is the whole first name, 
        # check if it's the whole of any name.
        safe_prefix_len = len(common_prefix)
        for nl in name_lists:
            if len(nl) <= safe_prefix_len:
                # If prefix is the entire name, don't strip the last word to avoid empty name
                safe_prefix_len = len(nl) - 1
                break
        
        common_prefix = common_prefix[:max(0, safe_prefix_len)]

        # Apply prefix stripping
        if common_prefix:
            p_len = len(common_prefix)
            for i, nl in enumerate(name_lists):
                name_lists[i] = nl[p_len:]

        # Find common suffix words
        common_suffix = []
        first_list = name_lists[0]
        for i in range(1, len(first_list) + 1):
            word = first_list[-i]
            match = True
            for other in name_lists[1:]:
                if i > len(other) or other[-i] != word:
                    match = False
                    break
            if match:
                common_suffix.insert(0, word)
            else:
                break
        
        safe_suffix_len = len(common_suffix)
        for nl in name_lists:
            if len(nl) <= safe_suffix_len:
                safe_suffix_len = len(nl) - 1
                break
        
        common_suffix = common_suffix[len(common_suffix)-max(0, safe_suffix_len):] if common_suffix else []

        # Apply suffix stripping and join back
        s_len = len(common_suffix)
        for i, nl in enumerate(name_lists):
            if s_len > 0:
                final_words = nl[:-s_len]
            else:
                final_words = nl
            
            # Join and update
            new_name = ' '.join(final_words).strip()
            if new_name:
                peers[i]['_comment_name'] = new_name

    @staticmethod
    def _import_to_db(server_data, peers_data, force_purge=False, server_endpoint=None, create_access_rules='all'):
        """
        Import server and peer data to database.
        
        Args:
            server_data: Server configuration dict
            peers_data: List of peer configuration dicts
            force_purge: If True, purge existing data before import
            server_endpoint: Server endpoint (hostname) if available
            create_access_rules: 'all' to create rules, 'none' to skip
        """
        stats = {
            'server_updated': False,
            'networks_created': 0,
            'clients_created': 0,
            'routes_created': 0,
            'access_rules_created': 0
        }
        
        try:
            if force_purge:
                # Purge everything
                AccessRule.query.delete()
                Route.query.delete()
                # Clear associations first
                db.session.execute(db.delete(client_network_association))
                Client.query.delete()
                Network.query.delete()
                db.session.commit()

            # 1. Update Server Config
            server_config = SetupManager.get_server_config()
            
            print(f"DEBUG: server_data keys: {server_data.keys()}")
            print(f"DEBUG: server_data privatekey: {server_data.get('privatekey')}")
            print(f"DEBUG: server_data listenport: {server_data.get('listenport')}")
            
            pk = server_data.get('privatekey')
            if pk:
                print(f"DEBUG: Setting server private key: {pk[:10]}...")
                server_config.server_private_key = pk
                try:
                    pub_key = KeyManager.generate_public_key(pk)
                    server_config.server_public_key = pub_key
                    print(f"DEBUG: Generated server public key: {pub_key[:10]}...")
                except Exception as e:
                    print(f"DEBUG: Failed to generate public key: {e}")
            else:
                print("DEBUG: No private key found in server_data")
                if not server_config.server_private_key:
                    server_config.server_private_key = "IMPORT_MISSING_PRIVATE_KEY"

            port = server_data.get('listenport')
            if port:
                server_config.server_port = int(port)
                print(f"DEBUG: Set server port to {port}")
            
            # Set server endpoint if extracted from client configs
            if server_endpoint:
                server_config.server_endpoint = server_endpoint
                print(f"DEBUG: Set server endpoint to {server_endpoint}")
            
            server_config.installed = True
            server_config.setup_completed = True
            stats['server_updated'] = True
            
            print(f"DEBUG: About to commit - server_private_key: {server_config.server_private_key[:10] if server_config.server_private_key else 'None'}...")
            print(f"DEBUG: About to commit - server_public_key: {server_config.server_public_key[:10] if server_config.server_public_key else 'None'}...")
            
            db.session.commit()
            
            print("DEBUG: Server config committed successfully")
            
            # 2. Extract Networks from [Interface] Address
            addresses = server_data.get('address', '').split(',')
            server_networks = [] # List of ipaddress.IPv4Network
            
            for addr_str in addresses:
                addr_str = addr_str.strip()
                if not addr_str: continue
                try:
                    if_interface = ipaddress.ip_interface(addr_str)
                    if isinstance(if_interface, ipaddress.IPv6Interface):
                        continue # Skipping IPv6
                        
                    network_obj = if_interface.network
                    
                    # Check if network exists
                    existing_net = Network.query.filter_by(cidr=str(network_obj)).first()
                    
                    if not existing_net:
                        net_name = f"net_{network_obj.network_address}"
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
                    
            all_db_networks = Network.query.all()
            used_octets = {c.octet for c in Client.query.all() if not force_purge}
            
            # 3. Prepare Peer Data
            processed_peers = []
            for p in peers_data:
                pub_key = p.get('publickey')
                if not pub_key: continue
                
                # Check for existing Client
                if not force_purge:
                    existing_client = Client.query.filter_by(public_key=pub_key).first()
                    if existing_client: continue
                
                # Use centralized name resolution logic
                name = resolve_client_name(p)
                
                client_addresses = p.get('address', '').split(',')
                allowed_ips = p.get('allowedips', '').split(',')
                
                client_networks_to_join = []
                client_access_rules = [] # List of CIDRs
                client_octet = 0 
                
                # Derive matching networks and octet
                for addr_str in client_addresses + allowed_ips:
                    addr_str = addr_str.strip()
                    if not addr_str: continue
                    try:
                        if_obj = ipaddress.ip_interface(addr_str)
                        if isinstance(if_obj, ipaddress.IPv6Interface): continue
                        
                        ip_addr = if_obj.ip
                        matched_net = None
                        for net_obj in server_networks:
                            if ip_addr in net_obj:
                                matched_net = net_obj
                                break
                        
                        if matched_net:
                            db_net = next((n for n in all_db_networks if n.cidr == str(matched_net)), None)
                            if db_net:
                                if db_net not in client_networks_to_join:
                                    client_networks_to_join.append(db_net)
                                if client_octet == 0:
                                    parts = str(ip_addr).split('.')
                                    if len(parts) == 4:
                                        client_octet = int(parts[3])
                    except:
                        pass

                # Separate routed networks from access destinations
                # Routed networks = CIDRs in AllowedIPs that are NOT VPN subnets
                client_routed_networks = []  # Networks this client routes TO
                is_full_tunnel = False  # Track if client uses 0.0.0.0/0
                
                for ip_str in allowed_ips:
                    ip_str = ip_str.strip()
                    if not ip_str: continue
                    
                    # Check for full tunnel mode (will be handled differently later)
                    if ip_str == '0.0.0.0/0':
                        is_full_tunnel = True
                        continue
                    
                    try:
                        if_obj = ipaddress.ip_interface(ip_str)
                        if isinstance(if_obj, ipaddress.IPv6Interface): continue
                        
                        # Check if this is a network CIDR (not just a single IP)
                        network_obj = if_obj.network
                        ip_addr = if_obj.ip
                        
                        # Check if this IP/network matches a VPN subnet
                        matched_vpn = None
                        for net_obj in server_networks:
                            if ip_addr in net_obj:
                                matched_vpn = net_obj
                                break
                        
                        if matched_vpn:
                            # This is a VPN subnet - add to networks AND access rules
                            db_net = next((n for n in all_db_networks if n.cidr == str(matched_vpn)), None)
                            if db_net and db_net not in client_networks_to_join:
                                client_networks_to_join.append(db_net)
                            # Also add to access rules so client can communicate in this network
                            if str(matched_vpn) not in client_access_rules:
                                client_access_rules.append(str(matched_vpn))
                        else:
                            # This is a non-VPN network
                            # If it's a proper CIDR (not /32), treat as routed network
                            if network_obj.prefixlen < 32:
                                client_routed_networks.append(str(network_obj))
                                # Also add to access rules so other clients can reach it
                                client_access_rules.append(str(network_obj))
                            else:
                                # Single IP - just an access rule
                                client_access_rules.append(ip_str)
                    except:
                        pass
                
                print(f"DEBUG: Client {name} - is_full_tunnel: {is_full_tunnel}")
                print(f"DEBUG: Client {name} - routed_networks: {client_routed_networks}")
                print(f"DEBUG: Client {name} - access_rules: {client_access_rules}")
                
                processed_peers.append({
                    'name': name,
                    'public_key': pub_key,
                    'private_key': p.get('privatekey', 'IMPORT_MISSING_PRIVATE_KEY'),
                    'preshared_key': p.get('presharedkey'),
                    'octet': client_octet,
                    'keepalive': int(p.get('persistentkeepalive')) if p.get('persistentkeepalive') else None,
                    'networks': client_networks_to_join,
                    'routed_networks': client_routed_networks,  # Networks this client routes
                    'access_rules': client_access_rules,
                    'is_full_tunnel': is_full_tunnel  # Flag for 0.0.0.0/0 clients
                })

            # Sort peers: those with derived octets first to claim their specific IPs
            processed_peers.sort(key=lambda x: x['octet'], reverse=True)
            
            # 4. Create Clients
            stats['skipped_clients'] = []
            
            for cp in processed_peers:
                target_octet = cp['octet']
                
                # STRICT VALIDATION: Loud Fails
                if target_octet == 0:
                    stats['skipped_clients'].append({
                        'name': cp['name'],
                        'reason': 'Could not determine tunnel IP from server or client config'
                    })
                    continue
                
                if target_octet in used_octets:
                    # Search for which client already has this octet for a better error message
                    colliding_client = Client.query.filter_by(octet=target_octet).first()
                    colliding_name = colliding_client.name if colliding_client else "unknown"
                    
                    stats['skipped_clients'].append({
                        'name': cp['name'],
                        'reason': f'IP collision on octet {target_octet} with client "{colliding_name}"'
                    })
                    continue
                
                used_octets.add(target_octet)
                
                new_client = Client(
                    name=cp['name'],
                    public_key=cp['public_key'],
                    private_key=cp['private_key'],
                    preshared_key=cp['preshared_key'],
                    octet=target_octet,
                    keepalive=cp['keepalive'],
                    enabled=True,
                    is_full_tunnel=cp.get('is_full_tunnel', False),
                    dns_mode='default'
                )
                db.session.add(new_client)
                db.session.flush() # Get ID for access rules
                
                # Join Networks
                for n in cp['networks']:
                    new_client.networks.append(n)
                
                # Add Routes (for networks this client routes to)
                for target_cidr in cp['routed_networks']:
                    route = Route(target_cidr=target_cidr, via_client_id=new_client.id)
                    db.session.add(route)
                    stats['routes_created'] += 1
                    print(f"DEBUG: Created route to {target_cidr} via {cp['name']}")
                
                # Add Access Rules (only if requested)
                if create_access_rules == 'all':
                    # Skip full-tunnel clients (0.0.0.0/0) - they tunnel everything anyway
                    if cp.get('is_full_tunnel'):
                        print(f"DEBUG: Skipping access rules for full-tunnel client {cp['name']} (has 0.0.0.0/0)")
                    else:
                        print(f"DEBUG: Creating {len(cp['access_rules'])} access rules for {cp['name']}")
                        for target_cidr in cp['access_rules']:
                            rule = AccessRule(
                                source_client_id=new_client.id,
                                dest_cidr=target_cidr,
                                destination_type='network' if '/' in target_cidr and not target_cidr.endswith('/32') else 'host',
                                proto='all',
                                action='ACCEPT'
                            )
                            db.session.add(rule)
                            stats['access_rules_created'] += 1
                            print(f"DEBUG: Created ALLOW rule for {cp['name']} to {target_cidr}")
                else:
                    print(f"DEBUG: Skipping access rule creation (create_access_rules={create_access_rules})")
                
                stats['clients_created'] += 1
            
            db.session.commit()
            return stats
        
        except Exception as e:
            db.session.rollback()
            raise e
