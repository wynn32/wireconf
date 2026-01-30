for client configs for which a client is configured to be a router for a network, do not include the routed network CIDR in the AllowedIPs block. if you do, then it will attempt to route all traffic for that network back through the tunnel from which it came and get lost.

for client configs for which a client is configured to have access to a routed network, do not include the iptables rules for setting up a NAT.

fix the UI so that the contents of client configs when rendered is not centered in the text box. also add a copy button to copy the config content conveniently.

also you can remove the public key snippet shown on the client card on the dashboard.

also please restore the table headers on the rules table in the rules modal (CIDR, port, proto, etc).

also look into hot-reload functionality but smartly such as when a network is added or removed you do a full server tunnel restart but client adding/deletion/deactivation are all eligible for hot reloads.

also give the option to remove networks in the UI

also look into why the "custom DNS servers" radio button text is still centered. it's likely because of the hidden textbox underneath it in the client edit settings modal. please fix this

also give a summary of incoming changes with options to undo them piecemeal and require confirmation before allowing the committment of changes to the server config file. 

If possible please generate a page which shows in graphical form all the clients and what networks they're on and what they're all allowed to access (ports, hosts, networks)