import React, { useEffect, useState } from 'react';
import api from '../api';

const ServerSettings: React.FC = () => {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ text: string, type: 'error' | 'success' } | null>(null);

    const [form, setForm] = useState({
        endpoint: '',
        port: 51820,
        private_key: '',
        public_key: ''
    });

    useEffect(() => {
        const fetchStatus = async () => {
            try {
                const res = await api.get('/setup/status');
                const data = res.data;
                setForm({
                    endpoint: data.server_endpoint || '',
                    port: data.server_port || 51820,
                    private_key: '', // Cannot retrieve private key easily via general status, might need dedicated endpoint or leave blank to indicate "no change"
                    public_key: data.server_public_key || ''
                });

                // Actually, status endpoint DOES NOT return private key for security usually?
                // But we need it if we are editing it. 
                // Let's check `setup_manager` or `routes`. `get_setup_status` DOES NOT return private key.
                // We shouldn't show the existing private key if it's sensitive, or we explicitly need to fetch it.
                // For now, let's leave private key blank (placeholder) and only update if user types something.

            } catch (err) {
                console.error(err);
                setMessage({ text: 'Failed to load settings', type: 'error' });
            } finally {
                setLoading(false);
            }
        };
        fetchStatus();
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!confirm("WARNING: Changing these settings (especially Private Key) ensures existing clients will stop working until they are updated. Are you sure?")) {
            return;
        }

        setSaving(true);
        setMessage(null);

        try {
            const payload: any = {
                endpoint: form.endpoint,
                port: form.port,
                public_key: form.public_key
            };
            if (form.private_key) {
                payload.private_key = form.private_key;
            }

            await api.post('/setup/server', payload);
            setMessage({ text: 'Settings updated successfully. You must Commit Changes to apply them.', type: 'success' });
        } catch (err: any) {
            setMessage({ text: err.response?.data?.error || 'Update failed', type: 'error' });
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className="text-white p-6">Loading...</div>;

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold text-white">Server Settings</h1>
            </div>

            <div className="bg-slate-800 rounded-lg p-6 border border-slate-700 shadow-xl">
                <div className="bg-red-900/20 border border-red-800 rounded p-4 mb-6">
                    <h3 className="text-red-400 font-bold flex items-center gap-2">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                        Danger Zone
                    </h3>
                    <p className="text-slate-300 text-sm mt-1">
                        Editing these values can break connectivity for all existing clients.
                        If you change the Private Key, you must update the Public Key on all client devices.
                    </p>
                </div>

                {message && (
                    <div className={`p-4 rounded mb-4 ${message.type === 'error' ? 'bg-red-900/50 text-red-200' : 'bg-emerald-900/50 text-emerald-200'}`}>
                        {message.text}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-400">Server Endpoint (Public IP/Domain)</label>
                            <input
                                className="w-full bg-slate-900 border border-slate-700 rounded p-3 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                value={form.endpoint}
                                onChange={e => setForm({ ...form, endpoint: e.target.value })}
                                placeholder="vpn.example.com"
                                required
                            />
                            <p className="text-xs text-slate-500">The address clients use to connect to this server.</p>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-400">Listen Port (UDP)</label>
                            <input
                                type="number"
                                className="w-full bg-slate-900 border border-slate-700 rounded p-3 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                value={form.port}
                                onChange={e => setForm({ ...form, port: parseInt(e.target.value) || 0 })}
                                required
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-400">Server Private Key</label>
                        <input
                            type="password"
                            className="w-full bg-slate-900 border border-slate-700 rounded p-3 text-white font-mono focus:ring-2 focus:ring-red-500 outline-none border-l-4 border-l-red-500"
                            value={form.private_key}
                            onChange={e => setForm({ ...form, private_key: e.target.value })}
                            placeholder="(Unchanged)"
                            autoComplete="off"
                        />
                        <p className="text-xs text-slate-500">Leave blank to keep existing key.</p>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-400">Server Public Key</label>
                        <input
                            className="w-full bg-slate-900 border border-slate-700 rounded p-3 text-white font-mono focus:ring-2 focus:ring-blue-500 outline-none"
                            value={form.public_key}
                            onChange={e => setForm({ ...form, public_key: e.target.value })}
                            placeholder="Public Key"
                        />
                        <p className="text-xs text-slate-500">Must match the private key above.</p>
                    </div>

                    <div className="pt-4 border-t border-slate-700 flex justify-end">
                        <button
                            type="submit"
                            disabled={saving}
                            className="bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-lg font-bold shadow-lg shadow-red-900/20 disabled:opacity-50 transition-all"
                        >
                            {saving ? 'Saving...' : 'Update Settings'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ServerSettings;
