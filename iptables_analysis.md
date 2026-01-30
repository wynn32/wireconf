## IPTables Rules Analysis for Routed Networks

### Current Implementation

When a user creates a "Routed Network" rule in the UI (e.g., ClientA → RouterB's 192.168.1.0/24), the system generates:

```bash
iptables -A WG_ACCESS_CONTROL -i wg0 -s 10.0.1.3/32 -d 192.168.1.0/24 -p tcp --dport 80 -j ACCEPT
```

### Traffic Flow Analysis

**Outbound (ClientA → Routed Network)**:
1. ✅ Packet from ClientA (10.0.1.3) to 192.168.1.50:80
2. ✅ Matches rule: `-s 10.0.1.3/32 -d 192.168.1.0/24 -p tcp --dport 80`
3. ✅ Action: ACCEPT
4. ✅ WireGuard routes to RouterB (via AllowedIPs)
5. ✅ RouterB forwards to 192.168.1.50

**Return (Routed Network → ClientA)**:
1. ❓ Packet from 192.168.1.50:80 to 10.0.1.3
2. ❓ Does it match any rule?
   - Source: 192.168.1.50 (not 10.0.1.3)
   - Dest: 10.0.1.3 (not 192.168.1.0/24)
   - **NO MATCH** in explicit rules
3. ✅ **SAVED by ESTABLISHED/RELATED rule**:
   ```bash
   iptables -A FORWARD -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT
   ```
4. ✅ Return traffic is allowed

### Conclusion

**The current implementation IS CORRECT!**

The iptables rules are set up properly:
1. Explicit rules control **outbound** access from VPN clients to routed networks
2. The `ESTABLISHED,RELATED` rule handles **return** traffic automatically
3. WireGuard's `AllowedIPs` handles the routing to the correct peer

### What the User Needs to Do

To allow ClientA to access a routed network behind RouterB:

1. **Create a "Routed Network" rule** in the UI:
   - Select ClientA
   - Click "Rules"
   - Choose "Routed Network" type
   - Select RouterB from dropdown
   - Select target network (e.g., 192.168.1.0/24)
   - Configure port/protocol as needed
   - Click "Add Rule"

2. **Commit changes** to apply the configuration

This will generate the appropriate iptables rule and the traffic will flow correctly.

### No Changes Needed

The iptables configuration is already correct. The system properly handles:
- ✅ Routing via WireGuard AllowedIPs
- ✅ Outbound access control via explicit rules
- ✅ Return traffic via ESTABLISHED/RELATED
- ✅ Default deny for unauthorized traffic
