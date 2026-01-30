"""Utility functions for finding and executing system commands with proper path resolution."""
import shutil
import subprocess


class CommandPathResolver:
    """Resolves absolute paths for system commands, with caching and fallback locations."""
    
    _path_cache = {}
    
    # Common installation paths for various commands
    COMMON_PATHS = {
        "wg": ["/usr/bin/wg", "/bin/wg", "/usr/local/bin/wg"],
        "wg-quick": ["/usr/bin/wg-quick", "/bin/wg-quick", "/usr/local/bin/wg-quick"],
        "ip": ["/usr/sbin/ip", "/sbin/ip", "/usr/bin/ip", "/bin/ip"],
        "iptables": ["/usr/sbin/iptables", "/sbin/iptables"],
        "iptables-save": ["/usr/sbin/iptables-save", "/sbin/iptables-save"],
        "netfilter-persistent": ["/usr/sbin/netfilter-persistent"],
        "systemctl": ["/usr/bin/systemctl", "/bin/systemctl"],
        "bash": ["/bin/bash", "/usr/bin/bash"],
    }
    
    @classmethod
    def get_path(cls, command: str) -> str:
        """
        Get the absolute path to a command.
        
        Uses shutil.which() first, then falls back to common installation locations.
        Caches results to avoid repeated lookups.
        
        Args:
            command: The command name (e.g., 'wg', 'ip', 'iptables')
            
        Returns:
            The absolute path to the command
            
        Raises:
            Exception: If the command cannot be found
        """
        if command in cls._path_cache:
            return cls._path_cache[command]
        
        # Try shutil.which() first (respects PATH)
        path = shutil.which(command)
        if path:
            cls._path_cache[command] = path
            return path
        
        # Try common installation paths
        if command in cls.COMMON_PATHS:
            for common_path in cls.COMMON_PATHS[command]:
                try:
                    # Verify the executable exists and is executable
                    result = subprocess.run([common_path, "--version"], capture_output=True, timeout=2)
                    if result.returncode == 0 or result.returncode == 1:  # Some commands return 1 for --version
                        cls._path_cache[command] = common_path
                        return common_path
                except (FileNotFoundError, OSError, subprocess.TimeoutExpired):
                    continue
        
        raise Exception(f"Command '{command}' not found in PATH or common installation locations")
    
    @classmethod
    def clear_cache(cls):
        """Clear the path cache. Useful for testing."""
        cls._path_cache = {}


def get_command_path(command: str) -> str:
    """
    Convenience function to get the absolute path of a command.
    
    Args:
        command: The command name (e.g., 'wg', 'ip', 'iptables')
        
    Returns:
        The absolute path to the command
    """
    return CommandPathResolver.get_path(command)
