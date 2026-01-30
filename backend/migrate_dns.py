#!/usr/bin/env python3
"""
Migration script to add DNS configuration fields to existing clients.
This script adds dns_mode and dns_servers columns to the client table.
"""

import sqlite3
import os

# Get database path from environment or use default
db_path = os.environ.get('DATABASE_PATH', 'instance/wireguard.db')

def migrate():
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # Check if columns already exist
        cursor.execute("PRAGMA table_info(client)")
        columns = [col[1] for col in cursor.fetchall()]
        
        if 'dns_mode' not in columns:
            print("Adding dns_mode column...")
            cursor.execute("""
                ALTER TABLE client 
                ADD COLUMN dns_mode VARCHAR(20) DEFAULT 'default' NOT NULL
            """)
            print("✓ dns_mode column added")
        else:
            print("✓ dns_mode column already exists")
        
        if 'dns_servers' not in columns:
            print("Adding dns_servers column...")
            cursor.execute("""
                ALTER TABLE client 
                ADD COLUMN dns_servers VARCHAR(200)
            """)
            print("✓ dns_servers column added")
        else:
            print("✓ dns_servers column already exists")
        
        conn.commit()
        print("\n✅ Migration completed successfully!")
        
    except Exception as e:
        conn.rollback()
        print(f"\n❌ Migration failed: {e}")
        raise
    finally:
        conn.close()

if __name__ == '__main__':
    migrate()
