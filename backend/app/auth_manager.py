from functools import wraps
from flask import session, request, jsonify, g
from werkzeug.security import generate_password_hash, check_password_hash
from .models import db, User, Permission, Network, Client
import time

class AuthManager:
    @staticmethod
    def create_user(username, password, is_root=False):
        """Create a new user with hashed password."""
        from .models import User # delayed import
        
        # Check if exists
        if User.query.filter_by(username=username).first():
            raise ValueError("Username already exists")
            
        pass_hash = generate_password_hash(password)
        created_at = int(time.time())
        
        user = User(
            username=username, 
            password_hash=pass_hash,
            is_active=True,
            is_root=is_root,
            created_at=created_at
        )
        db.session.add(user)
        db.session.commit()
        return user

    @staticmethod
    def verify_user(username, password):
        """Verify credentials and return user if valid."""
        user = User.query.filter_by(username=username).first()
        if user and check_password_hash(user.password_hash, password):
            return user
        return None

    @staticmethod
    def login_user(user):
        """Set session for user."""
        session['user_id'] = user.id
        session.permanent = True

    @staticmethod
    def logout_user():
        """Clear session."""
        session.clear()

    @staticmethod
    def get_current_user():
        """Get user from session, caching in g."""
        if 'user_id' not in session:
            return None
        
        if not hasattr(g, 'current_user'):
            from sqlalchemy.orm import joinedload
            from .models import User, PermissionPreset
            g.current_user = User.query.options(
                joinedload(User.preset).joinedload(PermissionPreset.rules)
            ).filter_by(id=session['user_id']).first()
        return g.current_user

    @staticmethod
    def has_permission(user, scope_type, scope_id, permission_level):
        """
        Check if user has specific permission.
        
        Logic:
        1. Check if user is root
        2. Check user's override permissions (is_override=True)
        3. Check user's preset permissions
        4. Check user's direct permissions
        5. Check hierarchy (network admins can see clients)
        """
        if not user or not user.is_active:
            return False

        # 0. Root Check
        if getattr(user, 'is_root', False):
            return True

        # 1. Check Override Permissions first (these take precedence)
        for p in user.permissions:
            if not p.is_override:
                continue
                
            # Check Global override
            if p.scope_type == 'GLOBAL' and p.permission_level == permission_level:
                return True
            
            # Check specific scope override
            if p.scope_type == scope_type and p.scope_id == scope_id and p.permission_level == permission_level:
                return True

        # 2. Check Preset Permissions
        if user.preset:
            for rule in user.preset.rules:
                # Check Global preset
                if rule.scope_type == 'GLOBAL' and rule.permission_level == permission_level:
                    return True
                
                # Check specific scope preset
                if rule.scope_type == scope_type and rule.scope_id == scope_id and rule.permission_level == permission_level:
                    return True

        # 3. Check Direct User Permissions (non-override)
        for p in user.permissions:
            if p.is_override:
                continue
                
            # Check Global
            if p.scope_type == 'GLOBAL' and p.permission_level == permission_level:
                return True
            
            # Check specific scope
            if p.scope_type == scope_type and p.scope_id == scope_id and p.permission_level == permission_level:
                return True
        
        # 4. Hierarchy Check (Network admin can view clients in that network)
        if scope_type == 'CLIENT' and scope_id is not None:
            client = db.session.get(Client, scope_id)
            if client:
                for net in client.networks:
                    if AuthManager.has_permission(user, 'NETWORK', net.id, permission_level):
                        return True

        return False

    @staticmethod
    def get_accessible_networks(user, permission_level='VIEW'):
        """Return list of Network objects user can access."""
        if not user:
            return []
            
        if getattr(user, 'is_root', False):
            return Network.query.all()
            
        # If Global Permission, return all
        for p in user.permissions:
            if p.scope_type == 'GLOBAL' and p.permission_level == permission_level:
                return Network.query.all()
        
        # Otherwise, find networks with explicit permission
        # This is a bit inefficient doing it in python, but fine for small scale.
        # Better to do in SQL if scaling.
        allowed_ids = set()
        for p in user.permissions:
            if p.scope_type == 'NETWORK' and p.permission_level == permission_level:
                allowed_ids.add(p.scope_id)
                
        if not allowed_ids:
             return []
             
        return Network.query.filter(Network.id.in_(allowed_ids)).all()

def require_permission(scope_type, permission_level, resolve_id_from_arg=None):
    """
    Decorator to enforce permission.
    
    resolve_id_from_arg: 
        If string, look up that key in view_args (URL params).
        If None, assume GLOBAL scope or no specific ID needed.
    """
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            user = AuthManager.get_current_user()
            if not user:
                return jsonify({'error': 'Unauthorized', 'code': 'unauthorized'}), 401
            
            # Determine Scope ID
            scope_id = None
            if resolve_id_from_arg:
                scope_id = kwargs.get(resolve_id_from_arg)
                # If ID is missing from kwargs but we expect it, that's an updating handling issue or route issue
            
            # CAST scope_id to int if it's an ID
            if scope_id is not None:
                try:
                    scope_id = int(scope_id)
                except:
                    pass # Keep as is if string (e.g. public key?) - Though our models use Int IDs usually.
            
            if not AuthManager.has_permission(user, scope_type, scope_id, permission_level):
                 return jsonify({'error': 'Forbidden', 'code': 'forbidden'}), 403
            
            return f(*args, **kwargs)
        return decorated_function
    return decorator

def require_login(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not AuthManager.get_current_user():
             return jsonify({'error': 'Unauthorized', 'code': 'unauthorized'}), 401
        return f(*args, **kwargs)
    return decorated_function
