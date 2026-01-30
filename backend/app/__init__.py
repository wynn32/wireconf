from flask import Flask
from .models import db
from flask_cors import CORS

def create_app():
    app = Flask(__name__)
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///wireguard.db'
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

    CORS(app)

    # Initialize Database
    db.init_app(app)
    
    with app.app_context():
        db.create_all()

    from .routes import bp, _perform_commit
    app.register_blueprint(bp)

    from .safety_manager import SafetyManager
    SafetyManager.init(app, _perform_commit)

    return app
