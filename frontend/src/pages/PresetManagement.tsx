import { useState, useEffect } from 'react';
import api from '../api';

interface PresetRule {
    id?: number;
    scope_type: string;
    scope_id: number | null;
    permission_level: string;
}

interface Preset {
    id: number;
    name: string;
    description: string;
    rules: PresetRule[];
    user_count: number;
}

export default function PresetManagement() {
    const [presets, setPresets] = useState<Preset[]>([]);
    const [showModal, setShowModal] = useState(false);
    const [editingPreset, setEditingPreset] = useState<Preset | null>(null);
    const [formData, setFormData] = useState<{ name: string; description: string; rules: PresetRule[] }>({
        name: '',
        description: '',
        rules: []
    });

    useEffect(() => {
        loadPresets();
    }, []);

    const loadPresets = async () => {
        try {
            const response = await api.get('/presets');
            setPresets(response.data);
        } catch (error) {
            console.error('Failed to load presets', error);
        }
    };

    const handleCreate = () => {
        setEditingPreset(null);
        setFormData({ name: '', description: '', rules: [] });
        setShowModal(true);
    };

    const handleEdit = (preset: Preset) => {
        setEditingPreset(preset);
        setFormData({
            name: preset.name,
            description: preset.description,
            rules: preset.rules
        });
        setShowModal(true);
    };

    const handleDelete = async (presetId: number) => {
        if (!confirm('Are you sure you want to delete this preset?')) return;

        try {
            await api.delete(`/presets/${presetId}`);
            loadPresets();
        } catch (error: any) {
            alert(error.response?.data?.error || 'Failed to delete preset');
        }
    };

    const handleSubmit = async () => {
        try {
            if (editingPreset) {
                await api.put(`/presets/${editingPreset.id}`, formData);
            } else {
                await api.post('/presets', formData);
            }
            setShowModal(false);
            loadPresets();
        } catch (error: any) {
            alert(error.response?.data?.error || 'Failed to save preset');
        }
    };

    const addRule = () => {
        setFormData({
            ...formData,
            rules: [...formData.rules, { scope_type: 'GLOBAL', scope_id: null, permission_level: 'VIEW' }]
        });
    };

    const removeRule = (index: number) => {
        setFormData({
            ...formData,
            rules: formData.rules.filter((_, i) => i !== index)
        });
    };

    const updateRule = (index: number, field: keyof PresetRule, value: any) => {
        const newRules = [...formData.rules];
        newRules[index] = { ...newRules[index], [field]: value };
        setFormData({ ...formData, rules: newRules });
    };

    return (
        <div className="p-6">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold text-slate-200">Permission Presets</h1>
                <button
                    onClick={handleCreate}
                    className="px-4 py-2 bg-sky-600 hover:bg-sky-700 rounded-lg transition-colors"
                >
                    Create Preset
                </button>
            </div>

            <div className="grid gap-4">
                {presets.map(preset => (
                    <div key={preset.id} className="bg-slate-800 rounded-lg p-4 border border-slate-700">
                        <div className="flex justify-between items-start mb-2">
                            <div>
                                <h3 className="text-lg font-semibold text-slate-200">{preset.name}</h3>
                                <p className="text-sm text-slate-400">{preset.description}</p>
                                <p className="text-xs text-slate-500 mt-1">{preset.user_count} user(s) assigned</p>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => handleEdit(preset)}
                                    className="px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded transition-colors text-sm"
                                >
                                    Edit
                                </button>
                                <button
                                    onClick={() => handleDelete(preset.id)}
                                    className="px-3 py-1 bg-red-900/50 hover:bg-red-900/70 rounded transition-colors text-sm"
                                    disabled={preset.user_count > 0}
                                >
                                    Delete
                                </button>
                            </div>
                        </div>
                        <div className="mt-3 text-sm">
                            <div className="flex flex-wrap gap-2">
                                {preset.rules.map((rule, idx) => (
                                    <span key={idx} className="px-2 py-1 bg-sky-900/30 text-sky-300 rounded text-xs">
                                        {rule.scope_type === 'GLOBAL' ? 'GLOBAL' : `${rule.scope_type} #${rule.scope_id}`}: {rule.permission_level}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-slate-800 rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-slate-700">
                        <h2 className="text-xl font-bold mb-4 text-slate-200">
                            {editingPreset ? 'Edit Preset' : 'Create Preset'}
                        </h2>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">Name</label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full px-3 py-2 bg-slate-700 rounded-lg border border-slate-600 text-slate-200"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">Description</label>
                                <input
                                    type="text"
                                    value={formData.description}
                                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                                    className="w-full px-3 py-2 bg-slate-700 rounded-lg border border-slate-600 text-slate-200"
                                />
                            </div>

                            <div>
                                <div className="flex justify-between items-center mb-2">
                                    <label className="block text-sm font-medium text-slate-300">Rules</label>
                                    <button
                                        onClick={addRule}
                                        className="px-3 py-1 bg-sky-600 hover:bg-sky-700 rounded text-sm transition-colors"
                                    >
                                        Add Rule
                                    </button>
                                </div>

                                <div className="space-y-2">
                                    {formData.rules.map((rule, index) => (
                                        <div key={index} className="flex gap-2 items-center bg-slate-700 p-3 rounded-lg">
                                            <select
                                                value={rule.scope_type}
                                                onChange={e => updateRule(index, 'scope_type', e.target.value)}
                                                className="px-2 py-1 bg-slate-600 rounded border border-slate-500 text-sm"
                                            >
                                                <option value="GLOBAL">GLOBAL</option>
                                                <option value="NETWORK">NETWORK</option>
                                                <option value="CLIENT">CLIENT</option>
                                            </select>

                                            {rule.scope_type !== 'GLOBAL' && (
                                                <input
                                                    type="number"
                                                    placeholder="ID"
                                                    value={rule.scope_id || ''}
                                                    onChange={e => updateRule(index, 'scope_id', e.target.value ? parseInt(e.target.value) : null)}
                                                    className="w-20 px-2 py-1 bg-slate-600 rounded border border-slate-500 text-sm"
                                                />
                                            )}

                                            <select
                                                value={rule.permission_level}
                                                onChange={e => updateRule(index, 'permission_level', e.target.value)}
                                                className="px-2 py-1 bg-slate-600 rounded border border-slate-500 text-sm"
                                            >
                                                <option value="VIEW">VIEW</option>
                                                <option value="MODIFY">MODIFY</option>
                                                <option value="CREATE">CREATE</option>
                                                <option value="DELETE">DELETE</option>
                                                <option value="OVERRIDE_DMS">OVERRIDE_DMS</option>
                                                <option value="MANAGE_USERS">MANAGE_USERS</option>
                                            </select>

                                            <button
                                                onClick={() => removeRule(index)}
                                                className="ml-auto px-2 py-1 bg-red-900/50 hover:bg-red-900/70 rounded text-sm transition-colors"
                                            >
                                                Remove
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 mt-6">
                            <button
                                onClick={() => setShowModal(false)}
                                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSubmit}
                                className="px-4 py-2 bg-sky-600 hover:bg-sky-700 rounded-lg transition-colors"
                            >
                                Save
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
