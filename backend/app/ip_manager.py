import ipaddress
from sqlalchemy import select
from .models import db, Client, Network

class IPManager:
    @staticmethod
    def get_used_octets():
        """Returns a set of all currently used octets by clients."""
        stmt = select(Client.octet)
        result = db.session.execute(stmt).scalars().all()
        return set(result)

    @staticmethod
    def find_next_available_octet(exclude=None):
        """Finds the lowest available octet between 2 and 254."""
        used = IPManager.get_used_octets()
        if exclude:
            used = used.union(exclude)
            
        # 1 is usually gateway, so start from 2 used for clients usually
        # But sample.conf has clients starting at various numbers. 
        # Interface is usually .1
        for i in range(2, 255):
            if i not in used:
                return i
        raise Exception("No available octets in the /24 range segment (2-254)!")

    @staticmethod
    def validate_octet_for_network(network_cidr: str, octet: int):
        """
        Checks if the given octet creates a valid IP within the network CIDR.
        Assumes the octet replaces the last part of the network address.
        This roughly assumes these are /24s or compatible subnets where the last octet is the host part.
        """
        try:
            net = ipaddress.ip_network(network_cidr)
            # Construct the IP. 
            # We take the network address, and replace the last octet.
            # This is a bit hacky for non /24, but per user request "last octets be the same".
            # If network is 10.0.1.0/24, ip is 10.0.1.{octet}
            
            # Convert network address to packed bytes, modify last byte?
            # Or just parse string.
            network_addr_str = str(net.network_address)
            parts = network_addr_str.split('.')
            parts[-1] = str(octet)
            candidate_ip_str = ".".join(parts)
            
            candidate_ip = ipaddress.ip_address(candidate_ip_str)
            
            if candidate_ip in net and candidate_ip != net.network_address and candidate_ip != net.broadcast_address:
                return True
            return False
        except ValueError:
            return False

    @staticmethod
    def get_client_ip(network: Network, client: Client):
        """
        Returns the calculated IP string (e.g. 10.0.1.5/32) for a client in a network.
        WireGuard AllowedIPs in config are usually /32 for the peer.
        """
        net = ipaddress.ip_network(network.cidr)
        parts = str(net.network_address).split('.')
        parts[-1] = str(client.octet)
        ip_str = ".".join(parts)
        return f"{ip_str}/32"
