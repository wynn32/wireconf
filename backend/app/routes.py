from flask import Blueprint, request, jsonify, send_file
from .models import db, Network, Client, AccessRule, Route, ServerConfig
from .ip_manager import IPManager
from .key_manager import KeyManager
from .config_renderer import ConfigRenderer
from .setup_manager import SetupManager
from .importer import ConfigImporter
import io

bp = Blueprint('api', __name__, url_prefix='/api')

# ============================================================================
# SETUP ENDPOINTS
# ============================================================================

@bp.route('/setup/status', methods=['GET'])
def get_setup_status():
    """Get current setup and installation status."""
    status = SetupManager.get_setup_status()
    
    # Also check if there are any networks and clients
    network_count = Network.query.count()
    client_count = Client.query.count()
    
    status['has_networks'] = network_count > 0
    status['has_clients'] = client_count > 0
    
    return jsonify(status)

@bp.route('/setup/install', methods=['POST'])
def mark_installed():
    """Mark system as installed (called after install.sh completes)."""
    SetupManager.mark_installed()
    return jsonify({'status': 'installed'})

@bp.route('/setup/server', methods=['POST'])
def configure_server():
    """Configure server endpoint and port, generate keys if needed."""
    data = request.json
    endpoint = data.get('endpoint')
    port = data.get('port', 51820)
    
    if not endpoint:
        return jsonify({'error': 'Server endpoint is required'}), 400
    
    try:
        port = int(port)
        if port < 1 or port > 65535:
            return jsonify({'error': 'Port must be between 1 and 65535'}), 400
    except ValueError:
        return jsonify({'error': 'Invalid port number'}), 400
    
    result = SetupManager.configure_server(endpoint, port)
    return jsonify(result)

@bp.route('/setup/complete', methods=['POST'])
def complete_setup():
    """Complete setup wizard - add firewall rule and mark as complete."""
    # Verify we have at least one network and one client
    if Network.query.count() == 0:
        return jsonify({'error': 'At least one network is required'}), 400
    
    if Client.query.count() == 0:
        return jsonify({'error': 'At least one client is required'}), 400
    
    SetupManager.complete_setup()
    
    # NEW: Initially create the config and firewall script
    _perform_commit()
    
    return jsonify({'status': 'setup_complete'})

@bp.route('/import', methods=['POST'])
def import_config():
    """Import existing wg0.conf file."""
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400

    if file:
        try:
            content = file.read().decode('utf-8')
            stats = ConfigImporter.process_config_content(content)
            return jsonify({
                'status': 'success', 
                'stats': stats
            })
        except Exception as e:
            return jsonify({'error': str(e)}), 500

# ============================================================================
# NETWORK ENDPOINTS
# ============================================================================


@bp.route('/networks', methods=['GET'])
def get_networks():
    networks = Network.query.all()
    return jsonify([{
        'id': n.id,
        'name': n.name,
        'cidr': n.cidr,
        'interface_address': n.interface_address
    } for n in networks])

@bp.route('/networks', methods=['POST'])
def create_network():
    data = request.json
    # TODO: Add validation
    net = Network(name=data['name'], cidr=data['cidr'], interface_address=data['interface_address'])
    db.session.add(net)
    db.session.commit()
    return jsonify({'id': net.id}), 201

@bp.route('/networks/<int:network_id>', methods=['DELETE'])
def delete_network(network_id):
    net = db.session.get(Network, network_id)
    if not net:
        return jsonify({'error': 'Network not found'}), 404
        
    # The association table will be handled by SQLAlchemy relationship 
    # but we can be explicit or rely on the backref.
    # Note: clients will still exist, just lose this network.
    
    db.session.delete(net)
    db.session.commit()
    return jsonify({'status': 'deleted'}), 200

@bp.route('/clients', methods=['GET'])
def get_clients():
    clients = Client.query.all()
    result = []
    for c in clients:
        # Calculate full IP addresses for this client
        ips = []
        for net in c.networks:
            client_ip = IPManager.get_client_ip(net, c)
            # Remove /32 suffix if present
            ip_only = client_ip.split('/')[0] if '/' in client_ip else client_ip
            ips.append(ip_only)
        
        result.append({
            'id': c.id,
            'name': c.name,
            'octet': c.octet,
            'ips': ips,  # Full IP addresses
            'public_key': c.public_key,
            'keepalive': c.keepalive,
            'enabled': c.enabled,
            'networks': [n.id for n in c.networks],
            'routes': [r.target_cidr for r in c.routes],
            'dns_mode': c.dns_mode,
            'dns_servers': c.dns_servers
        })
    
    return jsonify(result)

@bp.route('/clients', methods=['POST'])
def create_client():
    data = request.json
    name = data['name']
    network_ids = data.get('networks', [])
    keepalive = data.get('keepalive') # Optional int
    routed_cidrs = data.get('routes', []) # List of strings e.g. ["192.168.1.0/24"]
    dns_mode = data.get('dns_mode', 'default')  # 'default', 'custom', or 'none'
    dns_servers = data.get('dns_servers')  # Comma-separated IPs for custom mode
    
    # Generate Keys
    priv = KeyManager.generate_private_key()
    pub = KeyManager.generate_public_key(priv)
    psk = KeyManager.generate_preshared_key()
    
    # Assign Octet
    # Check if octet requested? Assuming auto-assign for now as per plan
    octet = IPManager.find_next_available_octet()
    
    # Validate against networks
    networks = []
    for nid in network_ids:
        net = db.session.get(Network, nid)
        if net:
            if not IPManager.validate_octet_for_network(net.cidr, octet):
                return jsonify({'error': f'Octet {octet} not valid for network {net.cidr}'}), 400
            networks.append(net)
    
    client = Client(
        name=name,
        private_key=priv,
        public_key=pub,
        preshared_key=psk,
        octet=octet,
        networks=networks,
        keepalive=keepalive,
        dns_mode=dns_mode,
        dns_servers=dns_servers
    )
    db.session.add(client)
    db.session.flush() # Get ID

    # Add Routes
    for cidr in routed_cidrs:
        # TODO: Validate CIDR format
        route = Route(target_cidr=cidr, via_client_id=client.id)
        db.session.add(route)
    db.session.commit()
    
    return jsonify({
        'id': client.id, 
        'octet': octet,
        'name': client.name,
        'public_key': client.public_key
    }), 201

@bp.route('/clients/<int:client_id>', methods=['PUT'])
def update_client(client_id):
    client = db.session.get(Client, client_id)
    if not client:
         return jsonify({'error': 'Client not found'}), 404
         
    data = request.json
    network_ids = data.get('networks', [])
    keepalive = data.get('keepalive')
    routed_cidrs = data.get('routes') # if provided, replace all
    enabled = data.get('enabled')
    dns_mode = data.get('dns_mode')
    dns_servers = data.get('dns_servers')

    if enabled is not None:
        client.enabled = enabled
    
    if keepalive is not None:
        client.keepalive = keepalive
    
    if dns_mode is not None:
        client.dns_mode = dns_mode
    
    if dns_servers is not None:
        client.dns_servers = dns_servers
        
    if routed_cidrs is not None:
        # Replace existing routes
        Route.query.filter_by(via_client_id=client.id).delete()
        for cidr in routed_cidrs:
             db.session.add(Route(target_cidr=cidr, via_client_id=client.id))
    
    # 1. Validate octet against ALL new networks
    if 'networks' in data:
        new_networks = []
        for nid in network_ids:
            net = db.session.get(Network, nid)
            if net:
                # Re-validate: existing octet must be valid in new new subnet
                if not IPManager.validate_octet_for_network(net.cidr, client.octet):
                    return jsonify({'error': f'Client octet {client.octet} not valid for network {net.cidr}'}), 400
                new_networks.append(net)
                
        # 2. Update association
        client.networks = new_networks
    
    db.session.commit()
    
    current_routes = [r.target_cidr for r in client.routes]
    return jsonify({
        'status': 'updated', 
        'networks': [n.id for n in client.networks],
        'keepalive': client.keepalive,
        'enabled': client.enabled,
        'routes': current_routes,
        'dns_mode': client.dns_mode,
        'dns_servers': client.dns_servers
    })

@bp.route('/clients/<int:client_id>', methods=['DELETE'])
def delete_client(client_id):
    client = db.session.get(Client, client_id)
    if not client:
        return jsonify({'error': 'Client not found'}), 404
        
    # Manual Cascade Delete
    # 1. Rules where this client is Source or Dest
    AccessRule.query.filter((AccessRule.source_client_id == client.id) | (AccessRule.dest_client_id == client.id)).delete()
    
    # 2. Routes via this client
    Route.query.filter_by(via_client_id=client.id).delete()
    
    # 3. Client itself
    db.session.delete(client)
    db.session.commit()
    
    return jsonify({'status': 'deleted'}), 200

@bp.route('/rules/client/<path:public_key>', methods=['GET'])
def get_client_rules(public_key):
    # Depending on how the public key is passed (URL encoded or not), might need decoding.
    # Assuming simple string match for now.
    client = Client.query.filter_by(public_key=public_key).first()
    if not client:
        return jsonify({'error': 'Client not found'}), 404
        
    rules = AccessRule.query.filter_by(source_client_id=client.id).all()
    # Also fetch rules where this client is destination? 
    # Usually "rules for a client" means "what access does this client have" (source).
    
    return jsonify([{
        'id': r.id,
        'source_client_id': r.source_client_id,
        'dest_client_id': r.dest_client_id,
        'dest_cidr': r.dest_cidr,
        'destination_type': r.destination_type,
        'port': r.port,
        'proto': r.proto,
        'action': r.action
    } for r in rules])

@bp.route('/rules/client/<path:public_key>', methods=['POST'])
def create_client_rule(public_key):
    client = Client.query.filter_by(public_key=public_key).first()
    if not client:
        return jsonify({'error': 'Client not found'}), 404
        
    data = request.json
    # DTO: destination (IP or CIDR), destination_type, port, proto, action
    
    destination = data.get('destination') # e.g. "10.0.1.5" or "192.168.1.0/24"
    dest_type = data.get('destination_type', 'host')
    dest_client_id = data.get('dest_client_id')
    
    rule = AccessRule(
        source_client_id=client.id,
        dest_cidr=destination,
        dest_client_id=dest_client_id,
        destination_type=dest_type,
        port=data.get('port'),
        proto=data.get('proto', 'udp').lower(),
        action=data.get('action', 'ACCEPT').upper()
    )
    db.session.add(rule)
    db.session.commit()
    return jsonify({'id': rule.id}), 201

@bp.route('/rules/<int:rule_id>', methods=['DELETE'])
def delete_rule(rule_id):
    rule = db.session.get(AccessRule, rule_id)
    if not rule:
        return jsonify({'error': 'Rule not found'}), 404
    db.session.delete(rule)
    db.session.commit()
    return jsonify({'status': 'deleted'}), 200

@bp.route('/rules', methods=['GET'])
def get_all_rules():
    rules = AccessRule.query.all()
    return jsonify([{
        'id': r.id,
        'source_client_id': r.source_client_id,
        'dest_client_id': r.dest_client_id,
        'dest_cidr': r.dest_cidr,
        'destination_type': r.destination_type,
        'port': r.port,
        'proto': r.proto,
        'action': r.action
    } for r in rules])

@bp.route('/clients/<int:client_id>/config', methods=['GET'])
def download_client_config(client_id):
    client = db.session.get(Client, client_id)
    if not client:
        return jsonify({'error': 'Client not found'}), 404
    
    # Get server configuration from database
    server_config = SetupManager.get_server_config()
    if not server_config.server_public_key or not server_config.server_endpoint:
        return jsonify({'error': 'Server not configured. Please complete setup wizard.'}), 400
    
    server_public_key = server_config.server_public_key
    server_endpoint = f"{server_config.server_endpoint}:{server_config.server_port}"
    
    # Fetch all routed CIDRs from OTHER clients
    # This allows this client to access networks behind OTHER clients
    all_routes = Route.query.filter(Route.via_client_id != client.id).all()
    other_routes = [r.target_cidr for r in all_routes]
    
    # Use the new render_client_config method
    config = ConfigRenderer.render_client_config(client, server_public_key, server_endpoint, other_routes)
    
    return send_file(
        io.BytesIO(config.encode('utf-8')),
        mimetype='text/plain',
        as_attachment=True,
        download_name=f"{client.name}.conf"
    )

@bp.route('/commit/preview', methods=['GET'])
def commit_preview():
    # 1. Fetch current DB state
    networks = Network.query.all()
    clients = Client.query.all()
    rules = AccessRule.query.all()
    server_config = SetupManager.get_server_config()
    
    new_conf = ConfigRenderer.render_wg_conf(
        server_config.server_private_key, 
        server_config.server_port, 
        networks, clients, rules
    )
    
    # 2. Comparison Logic
    config_path = os.environ.get("WG_CONFIG_PATH", "wg0_generated.conf")
    rules_path = config_path.replace('.conf', '-rules.sh')
    new_rules = ConfigRenderer.render_firewall_script(networks, clients, rules)
    
    # Simplified Diff Summary
    summary = {
        'added_clients': [],
        'removed_clients': [],
        'modified_interface': False,
        'modified_peers': False,
        'modified_rules': False
    }
    
    def get_iface(c):
        lines = []
        for l in c.splitlines():
            if l.startswith("### begin"): break
            lines.append(l)
        return "\n".join(lines).strip()
        
    if os.path.exists(config_path):
        with open(config_path, "r") as f:
            old_conf = f.read()
            
        if get_iface(old_conf) != get_iface(new_conf):
            summary['modified_interface'] = True
        
        if old_conf != new_conf:
            summary['modified_peers'] = True
            
    if os.path.exists(rules_path):
        with open(rules_path, "r") as f:
            old_rules = f.read()
        if old_rules != new_rules:
            summary['modified_rules'] = True
    else:
        summary['modified_rules'] = True
        
    # Peers diff
    def get_peers(c):
        # returns dict {public_key: full_text_of_block}
        peers = {}
        parts = c.split("### begin ")
        for p in parts[1:]:
            name_part = p.split(" ###")[0]
            # Peer block ends with "### end Name ###"
            # Actually we can just key by the name or extracted pubkey
            lines = p.splitlines()
            pubkey = None
            for l in lines:
                if l.startswith("PublicKey ="):
                    pubkey = l.split("=")[1].strip()
                    break
            if pubkey:
                peers[pubkey] = p.split(f"### end {name_part} ###")[0].strip()
        return peers

    old_peers = get_peers(old_conf)
    new_peers = get_peers(new_conf)
    
    for pk in new_peers:
        if pk not in old_peers:
            client = next((c for c in clients if c.public_key == pk), None)
            if client:
                summary['added_clients'].append({'name': client.name, 'id': client.id})
            else:
                summary['added_clients'].append({'name': pk, 'id': None})
            
    for pk in old_peers:
        if pk not in new_peers:
            summary['removed_clients'].append(pk[:8] + "...")
            
    return jsonify({
        'summary': summary,
        'new_config': new_conf,
        'full_restart_needed': summary['modified_interface']
    })

from .system_service import SystemService
import os

def _perform_commit():
    """Helper to render and apply server configuration."""
    # Get server configuration from database
    server_config = SetupManager.get_server_config()
    if not server_config.server_private_key:
        return {'error': 'Server not configured. Please complete setup wizard.'}
    
    # 1. Fetch all data
    networks = Network.query.all()
    clients = Client.query.all()
    rules = AccessRule.query.all()
    
    # 2. Render
    server_priv = server_config.server_private_key
    server_port = server_config.server_port
    conf_content = ConfigRenderer.render_wg_conf(server_priv, server_port, networks, clients, rules)
    
    # 3. Restart Service (Safe Reload)
    config_path = os.environ.get("WG_CONFIG_PATH", "wg0_generated.conf")
    rules_path = config_path.replace('.conf', '-rules.sh')
    rules_content = ConfigRenderer.render_firewall_script(networks, clients, rules)
    
    try:
        # Smart Restart/Reload Logic
        interface_changed = True
        peers_changed = True
        rules_changed = True
        
        if os.path.exists(config_path):
            with open(config_path, "r") as f:
                old_conf = f.read()
            
            def get_interface_part(content):
                lines = []
                for line in content.splitlines():
                    if line.startswith("### begin"): break
                    lines.append(line)
                return "\n".join(lines).strip()
            
            if get_interface_part(old_conf) == get_interface_part(conf_content):
                interface_changed = False
                if old_conf == conf_content:
                    peers_changed = False
                    
        if os.path.exists(rules_path):
            with open(rules_path, "r") as f:
                old_rules = f.read()
            if old_rules == rules_content:
                rules_changed = False
        
        # Write the rules script first (PostUp depends on it)
        SystemService._write_config(rules_content, rules_path)
        os.chmod(rules_path, 0o755)

        if interface_changed:
            print("Performing FULL RESTART (Interface/Networks changed)")
            SystemService.restart_service(conf_content, config_path=config_path)
            status = 'committed (full restart)'
        elif peers_changed:
            print("Performing HOT RELOAD (Peers changed)")
            SystemService.reload_service(conf_content, config_path=config_path)
            SystemService.apply_firewall_rules(rules_content, rules_path)
            status = 'committed (hot reload)'
        elif rules_changed:
            print("Performing HOT FIREWALL UPDATE (Only rules changed)")
            SystemService.apply_firewall_rules(rules_content, rules_path)
            status = 'committed (firewall update)'
        else:
            status = 'committed (no changes)'
            
        return {'status': status, 'file': config_path}
            
    except Exception as e:
        print(f"Commit failed: {str(e)}")
        return {'status': f'committed_with_warning: {str(e)}', 'file': config_path}

@bp.route('/commit', methods=['POST'])
def commit_changes():
    result = _perform_commit()
    return jsonify(result)

