from flask import Flask
from .models import db


def create_app():
    app = Flask(__name__)
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///wireguard.db'
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

    # Initialize Database
    db.init_app(app)
    
    with app.app_context():
        db.create_all()

    from .routes import bp
    app.register_blueprint(bp)

    return app
