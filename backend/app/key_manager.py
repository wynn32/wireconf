import subprocess

class KeyManager:
    @staticmethod
    def generate_private_key():
        """Generates a WireGuard private key using the wg command."""
        try:
            return subprocess.check_output(["wg", "genkey"]).decode("utf-8").strip()
        except FileNotFoundError:
            # Fallback for dev environment without wg installed
            return "MOCK_PRIVATE_KEY_XXXXXXXXXXXXXXXXXXXXX="

    @staticmethod
    def generate_public_key(private_key):
        """Generates a WireGuard public key from a private key."""
        try:
            proc = subprocess.Popen(["wg", "pubkey"], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            out, err = proc.communicate(input=private_key.encode("utf-8"))
            if proc.returncode != 0:
                raise Exception(f"wg pubkey failed: {err}")
            return out.decode("utf-8").strip()
        except FileNotFoundError:
             # Fallback for dev environment
            return "MOCK_PUBLIC_KEY_YYYYYYYYYYYYYYYYYYYYY="
            
    @staticmethod
    def generate_preshared_key():
        try:
            return subprocess.check_output(["wg", "genpsk"]).decode("utf-8").strip()
        except FileNotFoundError:
            return "MOCK_PRESHARED_KEY_ZZZZZZZZZZZZZZZZZZ="
