import ipaddress
import re
import tarfile
import io
import os
import shutil
from .models import db, Client, Network, Route, ServerConfig, AccessRule, client_network_association
from .key_manager import KeyManager
from .setup_manager import SetupManager

class ConfigImporter:
    @staticmethod
    def process_backup(file_stream, force_purge=False):
        """
        Processes a PiVPN backup .tgz file.
        Returns a dict with 'status' and 'stats' or 'mismatch_detected'.
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

                # Extract authorized client public keys and their assigned tunnel IPs (AllowedIPs)
                # This is the most reliable source for the client's tunnel address in PiVPN
                authorized_clients = {} # pub_key -> allowed_ips_str
                for p in server_peers:
                    pk = p.get('publickey')
                    if pk:
                        authorized_clients[pk] = p.get('allowedips')

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

                # 3. Find Client Configs
                # PiVPN backup structure: home/<user>/configs/*.conf
                client_peers = []
                for member in tar.getmembers():
                    if member.name.endswith('.conf') and 'configs/' in member.name:
                        # Skip wg0.conf if it was caught here
                        if member.name == server_conf_path:
                            continue
                        
                        client_content = tar.extractfile(member).read().decode('utf-8')
                        client_data, peers = ConfigImporter._parse_ini_content(client_content)
                        
                        if not client_data.get('privatekey'):
                            continue # Not a valid client config
                        
                        client_pub = KeyManager.generate_public_key(client_data.get('privatekey'))
                        
                        # SMART FILTER: Skip if not in server's peer list
                        if client_pub not in authorized_clients:
                            continue

                        # Robust Octet Derivation: 
                        # Use Preferred IP from server configuration if available
                        server_side_address = authorized_clients[client_pub]
                        
                        # We only expect ONE [Peer] in a client config (the server)
                        first_peer = peers[0] if peers else {}
                        
                        client_name = os.path.basename(member.name).replace('.conf', '')
                        
                        client_peers.append({
                            'name': client_name,
                            'privatekey': client_data.get('privatekey'),
                            'address': server_side_address or client_data.get('address'),
                            'publickey': client_pub,
                            'presharedkey': first_peer.get('presharedkey'),
                            'allowedips': first_peer.get('allowedips'),
                            'persistentkeepalive': first_peer.get('persistentkeepalive')
                        })

                return {
                    'status': 'success',
                    'stats': ConfigImporter._import_to_db(server_data, client_peers, force_purge=force_purge)
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
        
        name_comment_re = re.compile(r'#\s*(?:Name:)?\s*([a-zA-Z0-9_\-]+)')
        last_comment_name = None
        
        for line in lines:
            line = line.strip()
            if not line:
                last_comment_name = None
                continue
            if line.startswith('#'):
                match = name_comment_re.search(line)
                if match:
                    last_comment_name = match.group(1)
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
        return interface_data, peers

    @staticmethod
    def _import_to_db(server_data, peers_data, force_purge=False):
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
            
            pk = server_data.get('privatekey')
            if pk:
                server_config.server_private_key = pk
                try:
                    server_config.server_public_key = KeyManager.generate_public_key(pk)
                except:
                    pass 
            else:
                if not server_config.server_private_key:
                    server_config.server_private_key = "IMPORT_MISSING_PRIVATE_KEY"

            port = server_data.get('listenport')
            if port:
                server_config.server_port = int(port)
            
            server_config.installed = True
            server_config.setup_completed = True
            stats['server_updated'] = True
            db.session.commit()
            
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
                
                name = p.get('name') or p.get('_comment_name')
                if not name:
                    name = f"client_{pub_key[:5]}"
                
                client_addresses = p.get('address', '').split(',')
                allowed_ips = p.get('allowedips', '').split(',')
                
                client_networks_to_join = []
                client_access_rules = [] # List of CIDRs
                client_octet = 0 
                
                # Derive matching networks and octet
                for addr_str in client_addresses:
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

                # Access rules from AllowedIPs
                for ip_str in allowed_ips:
                    ip_str = ip_str.strip()
                    if not ip_str: continue
                    try:
                        if_obj = ipaddress.ip_interface(ip_str)
                        if isinstance(if_obj, ipaddress.IPv6Interface): continue
                        ip_addr = if_obj.ip
                        matched_net = None
                        for net_obj in server_networks:
                            if ip_addr in net_obj:
                                matched_net = net_obj
                                break
                        if matched_net:
                            db_net = next((n for n in all_db_networks if n.cidr == str(matched_net)), None)
                            if db_net and db_net not in client_networks_to_join:
                                client_networks_to_join.append(db_net)
                        else:
                            client_access_rules.append(ip_str)
                    except:
                        if ip_str == '0.0.0.0/0':
                            client_access_rules.append('0.0.0.0/0')
                
                processed_peers.append({
                    'name': name,
                    'public_key': pub_key,
                    'private_key': p.get('privatekey', 'IMPORT_MISSING_PRIVATE_KEY'),
                    'preshared_key': p.get('presharedkey'),
                    'octet': client_octet,
                    'keepalive': int(p.get('persistentkeepalive')) if p.get('persistentkeepalive') else None,
                    'networks': client_networks_to_join,
                    'access_rules': client_access_rules
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
                    dns_mode='default'
                )
                db.session.add(new_client)
                db.session.flush() # Get ID for access rules
                
                # Join Networks
                for n in cp['networks']:
                    new_client.networks.append(n)
                
                # Add Access Rules
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
                
                stats['clients_created'] += 1
            
            db.session.commit()
            return stats
        
        except Exception as e:
            db.session.rollback()
            raise e
