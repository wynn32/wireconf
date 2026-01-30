import os
import tarfile
import io
import ipaddress
import sys

# Ensure backend folder is in path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.importer import ConfigImporter
from app.models import db, Network, Client, AccessRule, ServerConfig
from app.setup_manager import SetupManager
from app.key_manager import KeyManager
from app import create_app

def create_mock_backup():
    server_priv = "sB6X8l1C9f+9kXGv4Z+w0hGjQxFQ5FwL0b6X8l1C9fE="
    client1_priv = "gH6X8l1C9f+9kXGv4Z+w0hGjQxFQ5FwL0b6X8l1C9fE=" # dummy
    mac_priv = "jK6X8l1C9f+9kXGv4Z+w0hGjQxFQ5FwL0b6X8l1C9fE="
    
    # Real public keys
    client1_pub = KeyManager.generate_public_key(client1_priv)
    mac_pub = KeyManager.generate_public_key(mac_priv)
    thief_priv = "kH6X8l1C9f+9kXGv4Z+w0hGjQxFQ5FwL0b6X8l1C9fE="
    thief2_priv = "mH6X8l1C9f+9kXGv4Z+w0hGjQxFQ5FwL0b6X8l1C9fE="
    thief_pub = KeyManager.generate_public_key(thief_priv)
    thief2_pub = KeyManager.generate_public_key(thief2_priv)
    
    # Mock wg0.conf
    wg0_conf = f"""[Interface]
PrivateKey = {server_priv}
Address = 10.0.1.1/24, 10.0.2.1/24, 10.0.3.1/24, 10.0.4.1/24, 10.25.25.1/30, 10.0.5.1/24
ListenPort = 443

[Peer]
# Client: dummy
PublicKey = {client1_pub}
AllowedIPs = 10.0.5.2/32

[Peer]
# Client: thief
PublicKey = {thief_pub}
AllowedIPs = 192.168.100.10/32

[Peer]
# Client: thief2
PublicKey = {thief2_pub}
AllowedIPs = 192.168.200.20/32

[Peer]
# Client: mac
PublicKey = {mac_pub}
AllowedIPs = 10.0.1.10/32,10.0.2.10/32,10.0.3.10/32,10.0.4.10/32
"""
    # Mock client config 1 (dummy)
    client1_conf = f"""[Interface]
PrivateKey = {client1_priv}
Address = 10.0.5.2/32

[Peer]
PublicKey = SERVER_PUBLIC_KEY
AllowedIPs = 10.0.5.0/24
"""
    # Mock client config 2 (mac)
    mac_conf = f"""[Interface]
PrivateKey = {mac_priv}
Address = 10.0.1.10/24,10.0.2.10/24,10.0.3.10/24,10.0.4.10/24
DNS = 10.0.1.1,10.0.2.1,10.0.3.1,10.0.4.1

[Peer]
PublicKey = gr10d8/cLyN9F+yOvMWVLnMSLejOIxTGeVGqTeBFflo=
AllowedIPs = 10.0.1.0/24,10.0.2.0/24,10.0.3.0/24,10.0.4.0/24
"""

    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        # Server config
        info = tarfile.TarInfo(name="etc/wireguard/wg0.conf")
        info.size = len(wg0_conf)
        tar.addfile(info, io.BytesIO(wg0_conf.encode('utf-8')))
        
        # dummy
        info = tarfile.TarInfo(name="home/pi/configs/dummy.conf")
        info.size = len(client1_conf)
        tar.addfile(info, io.BytesIO(client1_conf.encode('utf-8')))
        
        # thief (non-matching IP)
        info = tarfile.TarInfo(name="home/pi/configs/thief.conf")
        thief_conf = f"""[Interface]
PrivateKey = {thief_priv}
Address = 192.168.100.10/24

[Peer]
PublicKey = SERVER_PUB
AllowedIPs = 0.0.0.0/0
"""
        info.size = len(thief_conf)
        tar.addfile(info, io.BytesIO(thief_conf.encode('utf-8')))
        
        # thief2 (non-matching IP)
        info = tarfile.TarInfo(name="home/pi/configs/thief2.conf")
        thief2_conf = f"""[Interface]
PrivateKey = {thief2_priv}
Address = 192.168.200.20/24

[Peer]
PublicKey = SERVER_PUB
AllowedIPs = 0.0.0.0/0
"""
        info.size = len(thief2_conf)
        tar.addfile(info, io.BytesIO(thief2_conf.encode('utf-8')))
        
        # mac
        info = tarfile.TarInfo(name="home/pi/configs/mac.conf")
        info.size = len(mac_conf)
        tar.addfile(info, io.BytesIO(mac_conf.encode('utf-8')))
    
    buf.seek(0)
    return buf

def test_import():
    # Use in-memory SQLite for testing
    os.environ['DATABASE_URL'] = 'sqlite:///:memory:'
    app = create_app()
    with app.app_context():
        # Setup initial state
        db.create_all()
        
        # 1. Test Key Mismatch
        server_cfg = SetupManager.get_server_config()
        server_cfg.server_private_key = "CURRENTPRIVATEKEYCURRENTPRIVATEKEYCURRENTPR="
        server_cfg.setup_completed = True
        server_cfg.installed = True
        db.session.commit()
        
        backup_stream = create_mock_backup()
        print("Testing process_backup with mismatch...")
        result = ConfigImporter.process_backup(backup_stream, force_purge=False)
        print(f"Mismatch check result: {result['status']}")
        assert result['status'] == 'mismatch'
        
        # 2. Test Force Purge & Import
        backup_stream.seek(0)
        result = ConfigImporter.process_backup(backup_stream, force_purge=True)
        print(f"Import result status: {result['status']}")
        
        # Verify Networks
        networks = Network.query.all()
        print(f"Networks created: {[n.cidr for n in networks]}")
        assert len(networks) == 6
        
        # Verify Clients
        clients = Client.query.all()
        print(f"Clients created: {[c.name for c in clients]}")
        assert len(clients) == 2
        
        mac_client = Client.query.filter_by(name='mac').first()
        dummy_client = Client.query.filter_by(name='dummy').first()

        assert mac_client.octet == 10
        assert dummy_client.octet == 2
        
        # Verify Skipped Clients (Loud Fails)
        skipped = result['stats'].get('skipped_clients', [])
        print(f"Skipped clients: {skipped}")
        assert len(skipped) == 2
        
        skipped_names = [s['name'] for s in skipped]
        assert 'thief' in skipped_names
        assert 'thief2' in skipped_names
        
        for s in skipped:
             assert 'Could not determine tunnel IP' in s['reason']
        
        # Verify Access Rules for MAC
        mac_rules = AccessRule.query.filter_by(source_client_id=mac_client.id).all()
        mac_dest_cidrs = [r.dest_cidr for r in mac_rules]
        print(f"MAC rules: {mac_dest_cidrs}")
        for cidr in ['10.0.1.0/24', '10.0.2.0/24', '10.0.3.0/24', '10.0.4.0/24']:
            assert cidr not in mac_dest_cidrs
        
        print("Test passed!")

if __name__ == "__main__":
    test_import()
