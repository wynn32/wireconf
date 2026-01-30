import shutil
import threading
import uuid
from .system_service import SystemService

class SafetyManager:
    _timer = None
    _transaction_id = None
    _lock = threading.Lock()
    _app = None # To be set by create_app
    _perform_commit_fn = None # Internal function to trigger regeneration
    
    # DB path
    DB_PATH = os.path.join(os.getcwd(), "backend/instance/wireguard.db")
    LAST_GOOD_DB_PATH = DB_PATH + ".last_good"

    @classmethod
    def init(cls, app, perform_commit_fn):
        """Initialize with app context and commit function."""
        cls._app = app
        cls._perform_commit_fn = perform_commit_fn
        # Create initial baseline if not exists
        if os.path.exists(cls.DB_PATH) and not os.path.exists(cls.LAST_GOOD_DB_PATH):
            shutil.copy2(cls.DB_PATH, cls.LAST_GOOD_DB_PATH)
            print("[SafetyManager] Initialized baseline last_good DB.")

    @classmethod
    def start_transaction(cls):
        """Starts the revert timer and returns a unique transaction ID."""
        with cls._lock:
            if cls._timer:
                cls._timer.cancel()
            
            transaction_id = str(uuid.uuid4())
            cls._transaction_id = transaction_id
            
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
                shutil.copy2(cls.DB_PATH, cls.LAST_GOOD_DB_PATH)
            
            cls._transaction_id = None
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
