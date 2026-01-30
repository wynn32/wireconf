import { useEffect, useState } from 'react';
import api from '../api';

interface Permission {
    scope_type: string;
    scope_id: number | null;
    permission_level: string;
}

interface User {
    id: number;
    username: string;
    preset_id: number | null;
    permissions: Permission[];
}

interface Preset {
    id: number;
    name: string;
    description: string;
}

interface Network {
    id: number;
    name: string;
    cidr: string;
}

interface Client {
    id: number;
    name: string;
}

export default function UserManagement() {
    const [users, setUsers] = useState<User[]>([]);
    const [networks, setNetworks] = useState<Network[]>([]);
    const [clients, setClients] = useState<Client[]>([]);
    const [presets, setPresets] = useState<Preset[]>([]);

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<Partial<User> | null>(null);
    const [password, setPassword] = useState('');

    // Permission Builder State
    const [tempPerms, setTempPerms] = useState<Permission[]>([]);

    // Builder Inputs
    const [pScope, setPScope] = useState('GLOBAL');
    const [pId, setPId] = useState<string>('');
    const [pLevel, setPLevel] = useState('VIEW');

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const [uRes, nRes, cRes, pRes] = await Promise.all([
                api.get('/users'),
                api.get('/networks'),
                api.get('/clients'),
                api.get('/presets')
            ]);
            setUsers(uRes.data);
            setNetworks(nRes.data);
            setClients(cRes.data);
            setPresets(pRes.data);
        } catch (e) {
            console.error("Failed to fetch users", e);
        }
    };

    const handleEdit = (user: User) => {
        setEditingUser(user);
        setTempPerms([...user.permissions]); // Clone
        setPassword('');
        setIsModalOpen(true);
    };

    const handleCreate = () => {
        setEditingUser({ username: '' });
        setTempPerms([]);
        setPassword('');
        setIsModalOpen(true);
    };

    const handleSave = async () => {
        if (!editingUser) return;

        const payload: any = {
            username: editingUser.username,
            preset_id: editingUser.preset_id,
            permissions: tempPerms
        };

        if (password) payload.password = password;

        try {
            if (editingUser.id) {
                // Update
                await api.put(`/users/${editingUser.id}`, payload);
            } else {
                // Create
                if (!password) {
                    alert("Password required for new user");
                    return;
                }
                await api.post('/users', payload);
            }
            setIsModalOpen(false);
            fetchData();
        } catch (e) {
            alert("Failed to save user");
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm("Delete this user?")) return;
        try {
            await api.delete(`/users/${id}`);
            fetchData();
        } catch (e) {
            alert("Failed to delete");
        }
    }

    const addPermission = () => {
        const newPerm: Permission = {
            scope_type: pScope,
            scope_id: pScope === 'GLOBAL' ? null : parseInt(pId),
            permission_level: pLevel
        };

        // Validation
        if (pScope !== 'GLOBAL' && isNaN(parseInt(pId))) return;

        setTempPerms([...tempPerms, newPerm]);
    };

    const removePermission = (idx: number) => {
        const p = [...tempPerms];
        p.splice(idx, 1);
        setTempPerms(p);
    }

    return (
        <div className="p-8 text-slate-200">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold">User Management</h1>
                <button
                    onClick={handleCreate}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded"
                >
                    Create User
                </button>
            </div>

            <div className="bg-slate-800 rounded-lg overflow-hidden border border-slate-700">
                <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-900/50 text-slate-400 uppercase text-xs">
                        <tr>
                            <th className="p-4">Username</th>
                            <th className="p-4">Permissions (Count)</th>
                            <th className="p-4 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700">
                        {users.map(u => (
                            <tr key={u.id} className="hover:bg-slate-700/30">
                                <td className="p-4 font-medium">{u.username}</td>
                                <td className="p-4">
                                    <span className="bg-slate-700 px-2 py-1 rounded text-xs">{u.permissions.length} rules</span>
                                    {/* Show simplified summary? */}
                                    {u.permissions.some(p => p.permission_level === 'MANAGE_USERS') && (
                                        <span className="ml-2 bg-purple-500/20 text-purple-300 px-2 py-1 rounded text-xs">Admin</span>
                                    )}
                                </td>
                                <td className="p-4 text-right space-x-2">
                                    <button onClick={() => handleEdit(u)} className="text-indigo-400 hover:text-indigo-300">Edit</button>
                                    <button onClick={() => handleDelete(u.id)} className="text-red-400 hover:text-red-300">Delete</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* MODAL */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="bg-slate-800 rounded-lg shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-slate-600">
                        <div className="p-6 border-b border-slate-700">
                            <h2 className="text-xl font-bold">{editingUser?.id ? 'Edit User' : 'New User'}</h2>
                        </div>

                        <div className="p-6 space-y-6">
                            {/* Credentials */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm text-slate-400 mb-1">Username</label>
                                    <input
                                        className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2"
                                        value={editingUser?.username || ''}
                                        onChange={e => setEditingUser({ ...editingUser, username: e.target.value })}
                                        disabled={!!editingUser?.id}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm text-slate-400 mb-1">Password {editingUser?.id && '(Leave empty to keep)'}</label>
                                    <input
                                        type="password"
                                        className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2"
                                        value={password}
                                        onChange={e => setPassword(e.target.value)}
                                    />
                                </div>
                            </div>

                            {/* Preset Selector */}
                            <div>
                                <label className="block text-sm text-slate-400 mb-1">Permission Preset</label>
                                <select
                                    className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2"
                                    value={editingUser?.preset_id || ''}
                                    onChange={e => setEditingUser({ ...editingUser, preset_id: e.target.value ? parseInt(e.target.value) : null })}
                                >
                                    <option value="">No Preset</option>
                                    {presets.map(p => (
                                        <option key={p.id} value={p.id}>{p.name} - {p.description}</option>
                                    ))}
                                </select>
                                <p className="text-xs text-slate-500 mt-1">User overrides can be added below and will take precedence over preset permissions</p>
                            </div>

                            {/* Permission Builder */}
                            <div className="bg-slate-900/50 p-4 rounded border border-slate-700">
                                <h3 className="font-bold text-sm text-slate-400 mb-3">Add Permission</h3>
                                <div className="flex gap-2 items-end">
                                    <div className="flex-1">
                                        <label className="text-xs text-slate-500">Scope</label>
                                        <select
                                            value={pScope}
                                            onChange={e => { setPScope(e.target.value); setPId(''); }}
                                            className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-sm"
                                        >
                                            <option value="GLOBAL">Global</option>
                                            <option value="NETWORK">Network</option>
                                            <option value="CLIENT">Client</option>
                                        </select>
                                    </div>

                                    {pScope !== 'GLOBAL' && (
                                        <div className="flex-1">
                                            <label className="text-xs text-slate-500">Resource</label>
                                            <select
                                                value={pId}
                                                onChange={e => setPId(e.target.value)}
                                                className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-sm"
                                            >
                                                <option value="">Select...</option>
                                                {pScope === 'NETWORK' && networks.map(n => (
                                                    <option key={n.id} value={n.id}>{n.name} ({n.cidr})</option>
                                                ))}
                                                {pScope === 'CLIENT' && clients.map(c => (
                                                    <option key={c.id} value={c.id}>{c.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                    )}

                                    <div className="flex-1">
                                        <label className="text-xs text-slate-500">Access Level</label>
                                        <select
                                            value={pLevel}
                                            onChange={e => setPLevel(e.target.value)}
                                            className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-sm"
                                        >
                                            <option value="VIEW">View</option>
                                            <option value="MODIFY">Modify (Commit)</option>
                                            <option value="CREATE">Create</option>
                                            <option value="DELETE">Delete</option>
                                            <option value="OVERRIDE_DMS">Override Dead Man Switch</option>
                                            {pScope === 'GLOBAL' && <option value="MANAGE_USERS">Manage Users (Admin)</option>}
                                        </select>
                                    </div>

                                    <button onClick={addPermission} className="bg-green-600 hover:bg-green-500 text-white px-3 py-1.5 rounded text-sm">Add</button>
                                </div>
                            </div>

                            {/* Permission List */}
                            <div className="border border-slate-700 rounded overflow-hidden max-h-60 overflow-y-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-slate-900 text-slate-400">
                                        <tr>
                                            <th className="p-2 pl-4">Scope</th>
                                            <th className="p-2">Target</th>
                                            <th className="p-2">Level</th>
                                            <th className="p-2"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-700 bg-slate-800">
                                        {tempPerms.map((p, i) => (
                                            <tr key={i}>
                                                <td className="p-2 pl-4">{p.scope_type}</td>
                                                <td className="p-2">
                                                    {p.scope_id
                                                        ? (p.scope_type === 'NETWORK'
                                                            ? networks.find(n => n.id === p.scope_id)?.name
                                                            : clients.find(c => c.id === p.scope_id)?.name) || p.scope_id
                                                        : '-'}
                                                </td>
                                                <td className="p-2">
                                                    <span className={`px-2 py-0.5 rounded text-xs ${p.permission_level === 'MANAGE_USERS' ? 'bg-purple-500/20 text-purple-300' :
                                                        p.permission_level === 'MODIFY' ? 'bg-yellow-500/20 text-yellow-300' : 'bg-slate-600'
                                                        }`}>
                                                        {p.permission_level}
                                                    </span>
                                                </td>
                                                <td className="p-2 text-right pr-4">
                                                    <button onClick={() => removePermission(i)} className="text-red-400 hover:text-red-300">x</button>
                                                </td>
                                            </tr>
                                        ))}
                                        {tempPerms.length === 0 && (
                                            <tr>
                                                <td colSpan={4} className="p-4 text-center text-slate-500">No explicit permissions assigned.</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div className="p-6 border-t border-slate-700 flex justify-end gap-3 bg-slate-800">
                            <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 hover:bg-slate-700 rounded text-slate-300">Cancel</button>
                            <button onClick={handleSave} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded shadow-lg shadow-indigo-500/20">Save User</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
