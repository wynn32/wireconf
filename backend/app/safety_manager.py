import os
import shutil
import threading
import uuid
import json
import time
from .system_service import SystemService

class SafetyManager:
    _timer = None
    _transaction_id = None
    _lock = threading.Lock()
    _app = None # To be set by create_app
    _perform_commit_fn = None # Internal function to trigger regeneration
    
    # DB path
    DB_PATH = os.path.join(os.getcwd(), "instance/wireguard.db")
    LAST_GOOD_DB_PATH = DB_PATH + ".last_good"
    SIDECAR_PATH = os.path.join(os.getcwd(), "instance/safety_transaction.json")

    @classmethod
    def _save_state(cls, transaction_id, status, expires_at):
        """Persists transaction state to disk."""
        try:
            state = {
                'transaction_id': transaction_id,
                'status': status,
                'expires_at': expires_at
            }
            with open(cls.SIDECAR_PATH, 'w') as f:
                json.dump(state, f)
        except Exception as e:
            print(f"[SafetyManager] Failed to save state: {e}")

    @classmethod
    def _clear_state(cls):
        """Removes persistent state."""
        if os.path.exists(cls.SIDECAR_PATH):
            try:
                os.remove(cls.SIDECAR_PATH)
            except Exception as e:
                print(f"[SafetyManager] Failed to clear state: {e}")

    @classmethod
    def init(cls, app, perform_commit_fn):
        """Initialize with app context and commit function. Handles recovery."""
        cls._app = app
        cls._perform_commit_fn = perform_commit_fn
        # Create initial baseline if not exists
        if os.path.exists(cls.DB_PATH) and not os.path.exists(cls.LAST_GOOD_DB_PATH):
            shutil.copy2(cls.DB_PATH, cls.LAST_GOOD_DB_PATH)
            print("[SafetyManager] Initialized baseline last_good DB.")

        # RECOVERY LOGIC
        if os.path.exists(cls.SIDECAR_PATH):
            try:
                with open(cls.SIDECAR_PATH, 'r') as f:
                    state = json.load(f)
                
                tid = state.get('transaction_id')
                expires_at = state.get('expires_at', 0)
                status = state.get('status')

                if status == 'pending':
                    remaining = expires_at - time.time()
                    if remaining <= 0:
                        print(f"[SafetyManager] RECOVERY: Transaction {tid} timed out during downtime. Reverting...")
                        cls._trigger_revert_logic()
                        cls._clear_state()
                    else:
                        print(f"[SafetyManager] RECOVERY: Rescheduling transaction {tid} for {int(remaining)}s.")
                        cls._transaction_id = tid
                        cls._timer = threading.Timer(remaining, cls._auto_revert, args=[tid])
                        cls._timer.start()
            except Exception as e:
                print(f"[SafetyManager] Recovery failed: {e}")
                cls._clear_state()

    @classmethod
    def start_transaction(cls):
        """Starts the revert timer and returns a unique transaction ID. Blocks if another is active."""
        with cls._lock:
            if cls._transaction_id is not None:
                raise RuntimeError("Global lock held: A configuration change is already being verified.")
            
            if cls._timer:
                cls._timer.cancel()
            
            transaction_id = str(uuid.uuid4())
            cls._transaction_id = transaction_id
            
            expires_at = time.time() + 60.0
            cls._save_state(transaction_id, 'pending', expires_at)
            
            # Start Timer (60s)
            cls._timer = threading.Timer(60.0, cls._auto_revert, args=[transaction_id])
            cls._timer.start()
            print(f"[SafetyManager] Transaction {transaction_id} started. Timer running.")
            return transaction_id

    @classmethod
    def confirm_transaction(cls, transaction_id):
        """Promotes current DB to last_good and cancels timer."""
        with cls._lock:
            if cls._transaction_id != transaction_id:
                return False
                
            if cls._timer:
                cls._timer.cancel()
                cls._timer = None
            
            # PROMOTE: Current DB is now the Last Known Good State
            if os.path.exists(cls.DB_PATH):
                try:
                    shutil.copy2(cls.DB_PATH, cls.LAST_GOOD_DB_PATH)
                except Exception as e:
                    print(f"[SafetyManager] Promotion failed (FS Error): {e}")
                    # We continue because the config IS applied, just the backup is old
            
            cls._transaction_id = None
            cls._clear_state()
            print(f"[SafetyManager] Transaction {transaction_id} CONFIRMED. Baseline updated.")
            return True

    @classmethod
    def abort_transaction(cls):
        """Manually triggers a revert."""
        with cls._lock:
            if cls._timer:
                cls._timer.cancel()
                cls._timer = None
            
            if cls._transaction_id:
                cls._trigger_revert_logic()
                cls._transaction_id = None
                cls._clear_state()
                return True
        return False

    @classmethod
    def _auto_revert(cls, transaction_id):
        with cls._lock:
            if cls._transaction_id != transaction_id:
                return
            
            print(f"[SafetyManager] TIMEOUT for {transaction_id}. Reverting to last_good DB...")
            cls._trigger_revert_logic()
            cls._transaction_id = None
            cls._clear_state()

    @classmethod
    def _trigger_revert_logic(cls):
        """Restores DB from .last_good and REGENERATES everything."""
        try:
            if os.path.exists(cls.LAST_GOOD_DB_PATH):
                # 1. Restore DB File
                shutil.copy2(cls.LAST_GOOD_DB_PATH, cls.DB_PATH)
                print("[SafetyManager] DB restored from last_good.")
                
                # 2. Trigger Regeneration within app context
                if cls._app and cls._perform_commit_fn:
                    with cls._app.app_context():
                        from .models import db
                        # Clear session to avoid stale objects from the dirty DB
                        db.session.remove() 
                        
                        print("[SafetyManager] Triggering config regeneration...")
                        result = cls._perform_commit_fn()
                        print(f"[SafetyManager] Revert complete: {result.get('status')}")
            else:
                print("[SafetyManager] No last_good DB found. Cannot revert.")
        except Exception as e:
            print(f"[SafetyManager] CRITICAL ERROR during revert: {e}")
