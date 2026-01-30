import sys
import os
sys.path.append('/root/take2/backend')

from app import create_app
from app.models import db, ServerConfig
from app.setup_manager import SetupManager

app = create_app()

with app.app_context():
    print(f"Initial is_installed: {SetupManager.is_installed()}")
    
    # Force set to False
    config = SetupManager.get_server_config()
    config.installed = False
    db.session.commit()
    print(f"After setting False: {SetupManager.is_installed()}")
    
    # Set to True
    config.installed = True
    db.session.commit()
    print(f"After setting True: {SetupManager.is_installed()}")
    
    # Check if file exists (it shouldn't matter now, but good to know)
    marker_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), '.installed')
    print(f"Marker file exists: {os.path.exists(marker_path)}")
