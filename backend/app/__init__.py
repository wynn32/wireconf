from flask import Flask
from .models import db
from flask_cors import CORS

def create_app():
    app = Flask(__name__)
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///wireguard.db'
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    app.secret_key = 'dev-secret-key-change-this-in-prod' # TODO: Move to env var

    CORS(app, supports_credentials=True) # Enable credentials for session cookies

    # Initialize Database
    db.init_app(app)
    
    with app.app_context():
        db.create_all()

    from .routes import bp, _perform_commit
    from .routes_auth import bp as auth_bp
    
    app.register_blueprint(bp)
    app.register_blueprint(auth_bp)

    from .safety_manager import SafetyManager
    SafetyManager.init(app, _perform_commit)

    return app
