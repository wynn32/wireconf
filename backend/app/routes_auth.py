from flask import Blueprint, request, jsonify, session
from .models import db, User, Permission, PermissionPreset, PermissionPresetRule
from .auth_manager import AuthManager, require_permission, require_login

bp = Blueprint('auth', __name__, url_prefix='/api')

@bp.route('/auth/login', methods=['POST'])
def login():
    data = request.json
    username = data.get('username')
    password = data.get('password')
    
    if not username or not password:
        return jsonify({'error': 'Missing credentials'}), 400
        
    user = AuthManager.verify_user(username, password)
    if user:
        AuthManager.login_user(user)
        return jsonify({
            'status': 'success',
            'user': {
                'id': user.id,
                'username': user.username
            }
        })
    
    return jsonify({'error': 'Invalid credentials'}), 401

@bp.route('/auth/logout', methods=['POST'])
def logout():
    AuthManager.logout_user()
    return jsonify({'status': 'logged_out'})

@bp.route('/auth/me', methods=['GET'])
@require_login
def me():
    user = AuthManager.get_current_user()
    
    # Serialize Permissions
    perms = []
    for p in user.permissions:
        perms.append({
            'scope_type': p.scope_type,
            'scope_id': p.scope_id,
            'permission_level': p.permission_level
        })
        
    return jsonify({
        'id': user.id,
        'username': user.username,
        'permissions': perms
    })

# ============================================================================
# PERMISSION PRESET MANAGEMENT (Requires MANAGE_USERS)
# ============================================================================

@bp.route('/presets', methods=['GET'])
@require_permission('GLOBAL', 'MANAGE_USERS')
def get_presets():
    presets = PermissionPreset.query.all()
    result = []
    for preset in presets:
        rules = [{
            'id': r.id,
            'scope_type': r.scope_type,
            'scope_id': r.scope_id,
            'permission_level': r.permission_level
        } for r in preset.rules]
        
        result.append({
            'id': preset.id,
            'name': preset.name,
            'description': preset.description,
            'rules': rules,
            'user_count': len(preset.users)
        })
    return jsonify(result)

@bp.route('/presets', methods=['POST'])
@require_permission('GLOBAL', 'MANAGE_USERS')
def create_preset():
    data = request.json
    name = data.get('name')
    description = data.get('description', '')
    rules = data.get('rules', [])
    
    if not name:
        return jsonify({'error': 'Name is required'}), 400
        
    if PermissionPreset.query.filter_by(name=name).first():
        return jsonify({'error': 'Preset name already exists'}), 400
        
    preset = PermissionPreset(name=name, description=description)
    db.session.add(preset)
    db.session.flush()
    
    for rule in rules:
        r = PermissionPresetRule(
            preset_id=preset.id,
            scope_type=rule.get('scope_type'),
            scope_id=rule.get('scope_id'),
            permission_level=rule.get('permission_level')
        )
        db.session.add(r)
    
    db.session.commit()
    return jsonify({'id': preset.id, 'name': preset.name}), 201

@bp.route('/presets/<int:preset_id>', methods=['PUT'])
@require_permission('GLOBAL', 'MANAGE_USERS')
def update_preset(preset_id):
    preset = db.session.get(PermissionPreset, preset_id)
    if not preset:
        return jsonify({'error': 'Preset not found'}), 404
        
    data = request.json
    
    if 'name' in data:
        # Check for duplicate
        existing = PermissionPreset.query.filter_by(name=data['name']).first()
        if existing and existing.id != preset_id:
            return jsonify({'error': 'Preset name already exists'}), 400
        preset.name = data['name']
        
    if 'description' in data:
        preset.description = data['description']
        
    if 'rules' in data:
        # Replace all rules
        PermissionPresetRule.query.filter_by(preset_id=preset.id).delete()
        for rule in data['rules']:
            r = PermissionPresetRule(
                preset_id=preset.id,
                scope_type=rule.get('scope_type'),
                scope_id=rule.get('scope_id'),
                permission_level=rule.get('permission_level')
            )
            db.session.add(r)
    
    db.session.commit()
    return jsonify({'status': 'updated'})

@bp.route('/presets/<int:preset_id>', methods=['DELETE'])
@require_permission('GLOBAL', 'MANAGE_USERS')
def delete_preset(preset_id):
    preset = db.session.get(PermissionPreset, preset_id)
    if not preset:
        return jsonify({'error': 'Preset not found'}), 404
        
    # Check if any users have this preset
    if preset.users:
        return jsonify({'error': f'Cannot delete preset - {len(preset.users)} user(s) are assigned to it'}), 400
        
    db.session.delete(preset)
    db.session.commit()
    return jsonify({'status': 'deleted'})

# ============================================================================
# USER MANAGEMENT (Requires MANAGE_USERS)
# ============================================================================

@bp.route('/users', methods=['GET'])
@require_permission('GLOBAL', 'MANAGE_USERS')
def get_users():
    users = User.query.all()
    result = []
    for u in users:
        perms = [{
            'scope_type': p.scope_type, 
            'scope_id': p.scope_id, 
            'permission_level': p.permission_level,
            'is_override': p.is_override
        } for p in u.permissions]
        
        result.append({
            'id': u.id,
            'username': u.username,
            'is_active': u.is_active,
            'created_at': u.created_at,
            'preset_id': u.preset_id,
            'permissions': perms
        })
    return jsonify(result)

@bp.route('/users', methods=['POST'])
@require_permission('GLOBAL', 'MANAGE_USERS')
def create_user():
    data = request.json
    username = data.get('username')
    password = data.get('password')
    
    if not username or not password:
        return jsonify({'error': 'Username and password required'}), 400
        
    if User.query.filter_by(username=username).first():
        return jsonify({'error': 'Username already exists'}), 400
        
    user = AuthManager.create_user(username, password)
    
    # Assign preset if provided
    if 'preset_id' in data and data['preset_id']:
        user.preset_id = data['preset_id']
    
    # Apply Permissions if provided
    permissions = data.get('permissions', [])
    for p in permissions:
        perm = Permission(
            user_id=user.id,
            scope_type=p.get('scope_type'),
            scope_id=p.get('scope_id'),
            permission_level=p.get('permission_level'),
            is_override=p.get('is_override', False)
        )
        db.session.add(perm)
    
    db.session.commit()
    
    return jsonify({'id': user.id, 'username': user.username}), 201

@bp.route('/users/<int:user_id>', methods=['PUT'])
@require_permission('GLOBAL', 'MANAGE_USERS')
def update_user(user_id):
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({'error': 'User not found'}), 404
        
    data = request.json
    if 'password' in data and data['password']:
        from werkzeug.security import generate_password_hash
        user.password_hash = generate_password_hash(data['password'])
        
    if 'preset_id' in data:
        user.preset_id = data['preset_id']
        
    if 'permissions' in data:
        # Replace all permissions
        Permission.query.filter_by(user_id=user.id).delete()
        for p in data['permissions']:
             perm = Permission(
                user_id=user.id,
                scope_type=p.get('scope_type'),
                scope_id=p.get('scope_id'),
                permission_level=p.get('permission_level'),
                is_override=p.get('is_override', False)
            )
             db.session.add(perm)
              
    db.session.commit()
    return jsonify({'status': 'updated'})

@bp.route('/users/<int:user_id>', methods=['DELETE'])
@require_permission('GLOBAL', 'MANAGE_USERS')
def delete_user(user_id):
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({'error': 'User not found'}), 404
        
    # Prevent deleting yourself
    current_user = AuthManager.get_current_user()
    if current_user.id == user.id:
        return jsonify({'error': 'Cannot delete your own account'}), 400
        
    db.session.delete(user)
    db.session.commit()
    return jsonify({'status': 'deleted'})
