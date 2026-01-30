from app import create_app, db
import sqlalchemy
from sqlalchemy import text

app = create_app()

with app.app_context():
    print(f"DB URI: {app.config['SQLALCHEMY_DATABASE_URI']}")
    try:
        with db.engine.connect() as conn:
            conn.execute(text("ALTER TABLE client ADD COLUMN enabled BOOLEAN DEFAULT 1"))
            conn.commit()
            print("Migration successful")
    except Exception as e:
        print(f"Migration failed (maybe already exists): {e}")
