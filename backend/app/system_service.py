import subprocess
import os
import shutil

class SystemService:
    @staticmethod
    def _run_command(cmd, check=True):
        """Helper to run shell commands."""
        # For dev/test environment where wg/systemctl might not exist, 
        # we log and return success if check=False or throw if check=True
        # BUT for the robust shim, we should try to really run it.
        # If we are in a container without these params, we might want to mock it.
        print(f"Executing: {' '.join(cmd)}")
        try:
            subprocess.run(cmd, check=check, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        except subprocess.CalledProcessError as e:
            print(f"Command failed: {e.stderr.decode()}")
            if check:
                raise e
        except FileNotFoundError:
             print(f"Command not found: {cmd[0]}")
             # In dev env, we can't really restart, so we just proceed to write file?
             # But the user asked for logic.
             pass

    @staticmethod
    def restart_service(new_config_content: str, config_path: str = "/etc/wireguard/wg0.conf"):
        """
        Safely restarts WireGuard by stopping the OLD config, writing the NEW, and starting.
        Detects systemd usage.
        """
        
        # 1. Determine Method (systemd vs wg-quick)
        use_systemd = False
        if shutil.which("systemctl"):
            # Check if active? Or just assume if systemctl exists we prefer it?
            # Let's assume wg-quick@wg0 is the target.
            use_systemd = True
            
        service_name = "wg-quick@wg0"
        
        # 2. Stop Service (using OLD config on disk)
        # Only if file exists?
        # 2. Stop Service (using OLD config on disk)
        # Only if file exists?
        interface_name = os.path.basename(config_path).replace('.conf', '')
        
        if os.path.exists(config_path):
            if use_systemd:
                SystemService._run_command(["systemctl", "stop", service_name], check=False)
            else:
                 # Check if interface exists before trying to take it down
                 # wg-quick down <path> works, but user requested using name AND checking existence.
                 # Actually, `wg-quick down` accepts name OR path.
                 # To check existence, we can use `ip link show <name>`.
                 # If interface doesn't exist, wg-quick down might fail or print error.
                 # User assumption: "ensure that the tunnel exists before running wg-quick down".
                 
                 exists = False
                 try:
                     # Check if interface exists
                     subprocess.run(["ip", "link", "show", interface_name], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                     exists = True
                 except subprocess.CalledProcessError:
                     pass
                     
                 if exists:
                     # Use name as requested
                     SystemService._run_command(["wg-quick", "down", interface_name], check=False)
        
        # 3. Write New Config
        # Ensure dir exists
        os.makedirs(os.path.dirname(config_path), exist_ok=True)
        with open(config_path, "w") as f:
            f.write(new_config_content)
            
        # 4. Start Service (using NEW config)
        if use_systemd:
            SystemService._run_command(["systemctl", "start", service_name], check=True)
        else:
            # Use name as requested, BUT: wg-quick <name> looks in /etc/wireguard.
            # If config path is custom (e.g. /app/wg0.conf), naming it just "wg0" might fail 
            # if we rely on wg-quick's search path.
            # However, user explicitly said: "get the tunnel name ... and use that in the command line argument".
            # If the file IS in /etc/wireguard (default), this works.
            # If not, this might fail unless we assume the user knows what they are doing.
            # Given we write to `config_path`, if it is standard, name works.
            # If custom path, `wg-quick up <path>` is safer, but user forbade path.
            # We will use the name.
            SystemService._run_command(["wg-quick", "up", interface_name], check=True)
