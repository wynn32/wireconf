#!/usr/bin/env python3
"""
Migration script to add ServerConfig table.
"""

import sqlite3
import os

# Get database path from environment or use default
db_path = os.environ.get('DATABASE_PATH', 'instance/wireguard.db')

def migrate():
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # Check if table already exists
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='server_config'")
        if cursor.fetchone():
            print("✓ server_config table already exists")
            return
        
        print("Creating server_config table...")
        cursor.execute("""
            CREATE TABLE server_config (
                id INTEGER PRIMARY KEY,
                server_private_key VARCHAR(100),
                server_public_key VARCHAR(100),
                server_endpoint VARCHAR(200),
                server_port INTEGER NOT NULL DEFAULT 51820,
                installed BOOLEAN NOT NULL DEFAULT 0,
                setup_completed BOOLEAN NOT NULL DEFAULT 0
            )
        """)
        
        # Insert default row
        cursor.execute("""
            INSERT INTO server_config (id, server_port, installed, setup_completed)
            VALUES (1, 51820, 0, 0)
        """)
        
        conn.commit()
        print("✅ Migration completed successfully!")
        print("✓ server_config table created")
        print("✓ Default configuration row inserted")
        
    except Exception as e:
        conn.rollback()
        print(f"\n❌ Migration failed: {e}")
        raise
    finally:
        conn.close()

if __name__ == '__main__':
    migrate()
