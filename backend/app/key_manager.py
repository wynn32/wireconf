import subprocess
from .command_utils import get_command_path


class KeyManager:
    @staticmethod
    def generate_private_key():
        """Generates a WireGuard private key using the wg command."""
        try:
            wg_path = get_command_path("wg")
            return subprocess.check_output([wg_path, "genkey"]).decode("utf-8").strip()
        except Exception as e:
            raise Exception(f"Failed to generate private key: {e}")

    @staticmethod
    def generate_public_key(private_key):
        """Generates a WireGuard public key from a private key."""
        try:
            wg_path = get_command_path("wg")
            proc = subprocess.Popen([wg_path, "pubkey"], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            out, err = proc.communicate(input=private_key.encode("utf-8"))
            if proc.returncode != 0:
                err_msg = err.decode("utf-8", errors="replace") if err else "unknown error"
                raise Exception(f"wg pubkey failed with return code {proc.returncode}: {err_msg}")
            return out.decode("utf-8").strip()
        except Exception as e:
            raise Exception(f"generate_public_key failed: {e}")
            
    @staticmethod
    def generate_preshared_key():
        try:
            wg_path = get_command_path("wg")
            return subprocess.check_output([wg_path, "genpsk"]).decode("utf-8").strip()
        except FileNotFoundError:
            return "MOCK_PRESHARED_KEY_ZZZZZZZZZZZZZZZZZZ="
