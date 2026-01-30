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
from app import create_app

def create_mock_backup():
    server_priv = "sB6X8l1C9f+9kXGv4Z+w0hGjQxFQ5FwL0b6X8l1C9fE="
    client1_priv = "gH6X8l1C9f+9kXGv4Z+w0hGjQxFQ5FwL0b6X8l1C9fE="
    client2_priv = "jK6X8l1C9f+9kXGv4Z+w0hGjQxFQ5FwL0b6X8l1C9fE="
    
    # Mock wg0.conf
    wg0_conf = f"""[Interface]
PrivateKey = {server_priv}
Address = 10.6.0.1/24, 10.7.0.1/24
ListenPort = 51820
"""
    # Mock client config 1
    client1_conf = f"""[Interface]
PrivateKey = {client1_priv}
Address = 10.6.0.2/32

[Peer]
PublicKey = SERVER_PUBLIC_KEY
AllowedIPs = 10.6.0.0/24, 192.168.1.0/24, 0.0.0.0/0
PersistentKeepalive = 25
"""
    # Mock client config 2
    client2_conf = f"""[Interface]
PrivateKey = {client2_priv}
Address = 10.7.0.3/32

[Peer]
PublicKey = SERVER_PUBLIC_KEY
AllowedIPs = 10.7.0.0/24
"""

    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        # Server config
        info = tarfile.TarInfo(name="etc/wireguard/wg0.conf")
        info.size = len(wg0_conf)
        tar.addfile(info, io.BytesIO(wg0_conf.encode('utf-8')))
        
        # Client 1
        info = tarfile.TarInfo(name="home/pi/configs/client1.conf")
        info.size = len(client1_conf)
        tar.addfile(info, io.BytesIO(client1_conf.encode('utf-8')))
        
        # Client 2
        info = tarfile.TarInfo(name="home/pi/configs/client2.conf")
        info.size = len(client2_conf)
        tar.addfile(info, io.BytesIO(client2_conf.encode('utf-8')))
    
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
        assert len(networks) == 2
        assert "10.6.0.0/24" in [n.cidr for n in networks]
        assert "10.7.0.0/24" in [n.cidr for n in networks]
        
        # Verify Clients
        clients = Client.query.all()
        print(f"Clients created: {[c.name for c in clients]}")
        assert len(clients) == 2
        
        client1 = Client.query.filter_by(name='client1').first()
        assert client1.private_key == "gH6X8l1C9f+9kXGv4Z+w0hGjQxFQ5FwL0b6X8l1C9fE="
        assert client1.keepalive == 25
        assert client1.octet == 2
        
        # Verify Access Rules for Client 1
        rules = AccessRule.query.filter_by(source_client_id=client1.id).all()
        dest_cidrs = [r.dest_cidr for r in rules]
        print(f"Client 1 rules: {dest_cidrs}")
        # 10.6.0.0/24 is a server network. So it should NOT be in rules.
        assert '10.6.0.0/24' not in dest_cidrs
        assert '192.168.1.0/24' in dest_cidrs
        assert '0.0.0.0/0' in dest_cidrs
        
        # Verify octet 
        assert client1.octet == 2
        
        print("Test passed!")

if __name__ == "__main__":
    test_import()
