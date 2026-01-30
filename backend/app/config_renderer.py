import os
from .models import Network, Client, AccessRule, Route
from .ip_manager import IPManager
from typing import List

class ConfigRenderer:
    @staticmethod
    def render_wg_conf(server_private_key, port, networks: List[Network], clients: List[Client], rules: List[AccessRule]):
        """
        Renders the complete wg0.conf string.
        """
        addresses = [n.interface_address for n in networks]
        address_str = ", ".join(addresses)
        
        # The rules script location
        config_dir = os.path.dirname(os.environ.get("WG_CONFIG_PATH", "/etc/wireguard/wg0.conf"))
        interface_name = os.path.basename(os.environ.get("WG_CONFIG_PATH", "wg0.conf")).replace('.conf', '')
        rules_script_path = os.path.join(config_dir, f"{interface_name}-rules.sh")

        conf = []
        conf.append("[Interface]")
        conf.append(f"PrivateKey = {server_private_key}")
        conf.append(f"Address = {address_str}")
        conf.append(f"ListenPort = {port}")
        conf.append("MTU = 1420")
        conf.append("")
        conf.append("# Forwarding and Firewall")
        conf.append("PreUp = sysctl -w net.ipv4.ip_forward=1")
        
        # We call our external script
        conf.append(f"PostUp = {rules_script_path} apply")
        conf.append(f"PostDown = {rules_script_path} remove")
        
        conf.append("")
        
        # Peers
        for client in clients:
            if not client.enabled:
                continue
            conf.append(f"### begin {client.name} ###")
            conf.append("[Peer]")
            conf.append(f"PublicKey = {client.public_key}")
            if client.preshared_key:
                conf.append(f"PresharedKey = {client.preshared_key}")
            
            allowed_ips = []
            for net in client.networks:
                client_ip = IPManager.get_client_ip(net, client)
                allowed_ips.append(client_ip)
            for route in client.routes:
                allowed_ips.append(route.target_cidr)
                
            conf.append(f"AllowedIPs = {', '.join(allowed_ips)}")
            conf.append(f"### end {client.name} ###")
            conf.append("")
            
        return "\n".join(conf)

    @staticmethod
    def render_firewall_script(networks: List[Network], clients: List[Client], rules: List[AccessRule]) -> str:
        """
        Generates a shell script to manage iptables rules independently.
        """
        iptables_up, iptables_down = ConfigRenderer.render_iptables_commands(networks, clients, rules)
        
        script = [
            "#!/bin/bash",
            "# Automatically generated WireGuard firewall script",
            "",
            "COMMAND=$1",
            "",
            "apply_rules() {",
        ]
        
        for cmd in iptables_up:
            script.append(f"  {cmd}")
            
        script.extend([
            "}",
            "",
            "remove_rules() {",
        ])
        
        for cmd in iptables_down:
            script.append(f"  {cmd}")
            
        script.extend([
            "}",
            "",
            "case \"$COMMAND\" in",
            "  apply)",
            "    apply_rules",
            "    ;;",
            "  remove)",
            "    remove_rules",
            "    ;;",
            "  *)",
            "    echo \"Usage: $0 {apply|remove}\"",
            "    exit 1",
            "    ;;",
            "esac"
        ])
        
        return "\n".join(script)

    @staticmethod
    def render_client_config(client: Client, server_public_key: str, server_endpoint: str, other_routes: list[str] = None) -> str:
        """
        Renders a WireGuard client configuration file.
        
        Args:
            client: Client object with networks, keys, and DNS settings
            server_public_key: Server's public key
            server_endpoint: Server endpoint (e.g. "vpn.example.com:51820")
            other_routes: List of CIDRs that this client should have access to (behind OTHER clients)
        
        Returns:
            Complete client configuration as string
        """
        # Calculate client addresses (one per network)
        addresses = []
        for net in client.networks:
            client_ip = IPManager.get_client_ip(net, client)
            addresses.append(client_ip)
        
        address_str = ", ".join(addresses) if addresses else "10.0.0.0/32"
        
        # Generate DNS configuration based on dns_mode
        dns_line = ""
        if client.dns_mode == 'default':
            # Use server IPs from each network
            dns_servers = []
            for net in client.networks:
                # Extract server IP from interface_address (e.g. "10.0.1.1/24" -> "10.0.1.1")
                server_ip = net.interface_address.split('/')[0]
                dns_servers.append(server_ip)
            if dns_servers:
                dns_line = f"DNS = {', '.join(dns_servers)}\n"
        elif client.dns_mode == 'custom' and client.dns_servers:
            # Use custom DNS servers
            dns_line = f"DNS = {client.dns_servers}\n"
        # else: dns_mode == 'none', so dns_line stays empty
        
        # AllowedIPs: 
        # 1. Networks the client is part of (VPN subnets)
        # 2. Other routed networks (subnets behind OTHER clients)
        
        allowed_ips_list = [n.cidr for n in client.networks]
        
        # Add access to networks behind other clients
        if other_routes:
            for cidr in other_routes:
                if cidr not in allowed_ips_list:
                    allowed_ips_list.append(cidr)
        
        allowed_ips_str = ", ".join(allowed_ips_list) if allowed_ips_list else "0.0.0.0/0"
        
        # PersistentKeepalive
        pka_line = f"PersistentKeepalive = {client.keepalive}\n" if client.keepalive else ""
        
        
        # Router Mode Configuration (Only for this client's OWN routes)
        post_up_cmds = []
        post_down_cmds = []
        
        own_routes = [r.target_cidr for r in client.routes]
        
        if own_routes:
            # Enable IP Forwarding
            post_up_cmds.append("sysctl -w net.ipv4.ip_forward=1")
            
            for cidr in own_routes:
                # Script to find interface for CIDR and apply NAT
                # We use a shell one-liner. %i is the WG interface name.
                
                up_cmd = (
                    f"iface=$(ip -o addr show to {cidr} | awk '{{print $2}}' | head -1); "
                    f"if [ -n \"$iface\" ]; then "
                    f"iptables -t nat -A POSTROUTING -o $iface -j MASQUERADE; "
                    f"iptables -A FORWARD -i %i -o $iface -j ACCEPT; "
                    f"iptables -A FORWARD -i $iface -o %i -m state --state RELATED,ESTABLISHED -j ACCEPT; "
                    f"fi"
                )
                post_up_cmds.append(up_cmd)
                
                # Down Command (Reverse of Up)
                down_cmd = (
                    f"iface=$(ip -o addr show to {cidr} | awk '{{print $2}}' | head -1); "
                    f"if [ -n \"$iface\" ]; then "
                    f"iptables -t nat -D POSTROUTING -o $iface -j MASQUERADE; "
                    f"iptables -D FORWARD -i %i -o $iface -j ACCEPT; "
                    f"iptables -D FORWARD -i $iface -o %i -m state --state RELATED,ESTABLISHED -j ACCEPT; "
                    f"fi"
                )
                post_down_cmds.append(down_cmd)

        post_up_block = "\n".join([f"PostUp = {cmd}" for cmd in post_up_cmds])
        post_down_block = "\n".join([f"PostDown = {cmd}" for cmd in post_down_cmds])
        
        sections = ["[Interface]", f"PrivateKey = {client.private_key}", f"Address = {address_str}"]
        if dns_line: sections.append(dns_line.strip())
        if post_up_block: sections.append(post_up_block)
        if post_down_block: sections.append(post_down_block)
        
        interface_section = "\n".join(sections)

        config = f"""{interface_section}

[Peer]
PublicKey = {server_public_key}
Endpoint = {server_endpoint}
AllowedIPs = {allowed_ips_str}
PresharedKey = {client.preshared_key}
{pka_line}"""
        
        return config


    @staticmethod
    def render_iptables_commands(networks, clients, rules):
        """
        Generates lists of strings for PostUp and PostDown commands.
        Uses a custom chain WG_ACCESS_CONTROL to ensure clean rule management.
        """
        up = []
        down = []
        
        CHAIN_NAME = "WG_ACCESS_CONTROL"
        TEMP_CHAIN = "WG_ACCESS_TEMP"
        
        # --- PostUp ---
        
        # 0. Global Setup (Persistent across updates)
        up.append("iptables -P FORWARD DROP")
        up.append("iptables -C FORWARD -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT 2>/dev/null || iptables -I FORWARD -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT")
        
        # 1. Create/Flush Temp Chain
        up.append(f"iptables -N {TEMP_CHAIN} 2>/dev/null || iptables -F {TEMP_CHAIN}")
        
        # 2. Process Rules (Targeting TEMP_CHAIN)
        # Sort rules: DROP first to prevent shadowing by broad ACCEPT rules
        # We use a stable sort so that DB order is preserved within same-action groups
        sorted_rules = sorted(rules, key=lambda r: 0 if r.action == 'DROP' else 1)

        for rule in sorted_rules:
            # Resolve Source IPs
            source_ips = []
            if rule.source_client_id:
                src_client = next((c for c in clients if c.id == rule.source_client_id), None)
                if src_client:
                    for net in src_client.networks:
                        source_ips.append(IPManager.get_client_ip(net, src_client))
            else:
                source_ips = [None] 

            # Resolve Destination IPs
            dest_ips = []
            if rule.dest_client_id:
                dest_client = next((c for c in clients if c.id == rule.dest_client_id), None)
                if dest_client:
                    for net in dest_client.networks:
                        dest_ips.append(IPManager.get_client_ip(net, dest_client))
            elif rule.dest_cidr:
                dest_ips = [rule.dest_cidr]
            else:
                dest_ips = [None]

            for src_ip in source_ips:
                for d_ip in dest_ips:
                    cmd_parts = []
                    cmd_parts.append(f"-A {TEMP_CHAIN}")
                    cmd_parts.append("-i wg0")
                    
                    if src_ip:
                        cmd_parts.append(f"-s {src_ip}")
                    
                    if d_ip:
                        cmd_parts.append(f"-d {d_ip}")
                        
                    if rule.proto and rule.proto != 'all':
                        cmd_parts.append(f"-p {rule.proto}")
                    
                    if rule.port and rule.proto in ['tcp', 'udp']:
                        cmd_parts.append(f"--dport {rule.port}")
                        
                    cmd_parts.append(f"-j {rule.action}")
                    
                    up.append(f"iptables {' '.join(cmd_parts)}")

        # 3. Atomic Swap
        # We insert TEMP_CHAIN, then remove OLD, then rename TEMP to OLD.
        # This replaces the entire rule set with practically zero gap.
        up.append(f"iptables -I FORWARD -j {TEMP_CHAIN}")
        up.append(f"iptables -D FORWARD -j {CHAIN_NAME} 2>/dev/null || true")
        up.append(f"iptables -F {CHAIN_NAME} 2>/dev/null || true")
        up.append(f"iptables -X {CHAIN_NAME} 2>/dev/null || true")
        up.append(f"iptables -E {TEMP_CHAIN} {CHAIN_NAME}")

        # --- PostDown ---
        # 1. Remove Jump
        down.append(f"iptables -D FORWARD -j {CHAIN_NAME} 2>/dev/null || true")
        
        # 2. Flush Chain
        down.append(f"iptables -F {CHAIN_NAME} 2>/dev/null || true")
        
        # 3. Delete Chain
        down.append(f"iptables -X {CHAIN_NAME} 2>/dev/null || true")
        
        # 4. Restore Default Policy (Avoid lockout)
        down.append("iptables -P FORWARD ACCEPT")
        
        # Also cleanup global rules if we added them?
        # Providing strict symmetry for global rules is tricky if they are generic.
        # We can leave P FORWARD DROP? Or try to restore?
        # Usually PostDown is for cleaning up what THIS config did.
        
        return up, down
