def resolve_client_name(peer_data: dict) -> str:
    """
    Resolves a client name from peer data using consistent fallback logic.
    
    Priority:
    1. Explicit 'name' field
    2. Comment-based '_comment_name' field
    3. First IP address from 'allowedips'
    4. Generated name from public key
    
    Args:
        peer_data: Dictionary containing peer information with keys like:
                  'name', '_comment_name', 'allowedips', 'publickey'
    
    Returns:
        str: Resolved client name
    """
    # Try explicit name field
    name = peer_data.get('name')
    if name:
        return name
    
    # Try comment name
    name = peer_data.get('_comment_name')
    if name:
        return name
    
    # Try first IP from allowedips
    allowed_ips = peer_data.get('allowedips', '').split(',')
    if allowed_ips and allowed_ips[0].strip():
        # Use the first IP address as the name (remove CIDR)
        ip_name = allowed_ips[0].strip().split('/')[0]
        if ip_name:
            return ip_name
    
    # Final fallback: generate from public key
    pub_key = peer_data.get('publickey', '')
    if pub_key:
        return f"client_{pub_key[:5]}"
    
    # Ultimate fallback (should rarely happen)
    return "unnamed_client"
