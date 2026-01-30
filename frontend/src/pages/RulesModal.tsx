import React, { useEffect, useState } from 'react';
import api from '../api';

interface Rule {
    id: number;
    dest_cidr: string | null;
    dest_client_id: number | null;
    destination_type: string;
    port: number | null;
    proto: string;
    action: string;
}

interface Network {
    id: number;
    name: string;
    cidr: string;
}

interface Client {
    id: number;
    name: string;
    networks: number[];
    routes: string[];
    public_key: string;
}

interface Props {
    client: Client;
    onClose: () => void;
}

const RulesModal: React.FC<Props> = ({ client, onClose }) => {
    const [rules, setRules] = useState<Rule[]>([]);
    const [loading, setLoading] = useState(true);

    // Router / network data
    const [clients, setClients] = useState<Client[]>([]);
    const [networks, setNetworks] = useState<Network[]>([]);

    // Rule creation state
    const [ruleType, setRuleType] = useState<'custom' | 'routed' | 'network' | 'client'>('network');
    const [selectedRouterId, setSelectedRouterId] = useState('');
    const [selectedRoute, setSelectedRoute] = useState('');
    const [selectedNetworkId, setSelectedNetworkId] = useState('');
    const [selectedTargetClientId, setSelectedTargetClientId] = useState('');

    const [form, setForm] = useState({
        destination: '',
        port: '',
        proto: 'all',
        action: 'ACCEPT'
    });

    const fetchRules = async () => {
        try {
            const encodedKey = encodeURIComponent(client.public_key);
            const [rulesRes, clientsRes, networksRes] = await Promise.all([
                api.get(`/rules/client/${encodedKey}`),
                api.get('/clients'),
                api.get('/networks')
            ]);
            setRules(rulesRes.data);
            setClients(clientsRes.data);
            setNetworks(networksRes.data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRules();
    }, [client.public_key]);

    // Routers must have routes and share a network
    const availableRouters = clients.filter(c =>
        c.id !== client.id &&
        c.routes.length > 0 &&
        c.networks.some(nid => client.networks.includes(nid))
    );

    const handleRouterChange = (routerId: string) => {
        setSelectedRouterId(routerId);
        const router = clients.find(c => c.id === parseInt(routerId, 10));
        if (router && router.routes.length > 0) {
            setSelectedRoute(router.routes[0]);
            setForm(prev => ({ ...prev, destination: router.routes[0] }));
        }
    };

    const handleRouteChange = (cidr: string) => {
        setSelectedRoute(cidr);
        setForm(prev => ({ ...prev, destination: cidr }));
    };

    const handleNetworkChange = (networkId: string) => {
        setSelectedNetworkId(networkId);
        const net = networks.find(n => n.id === parseInt(networkId, 10));
        if (net) {
            setForm(prev => ({ ...prev, destination: net.cidr }));
        }
    };

    const handleTargetClientChange = (targetId: string) => {
        setSelectedTargetClientId(targetId);
        // We don't set destination CIDR here, we'll send dest_client_id
        setForm(prev => ({ ...prev, destination: '' }));
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Are you sure?')) return;
        try {
            await api.delete(`/rules/${id}`);
            fetchRules();
        } catch {
            alert('Delete failed');
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const encodedKey = encodeURIComponent(client.public_key);
            const payload: any = {
                destination: form.destination,
                destination_type: ruleType,
                port: form.port ? parseInt(form.port, 10) : null,
                proto: form.proto,
                action: form.action
            };

            if (ruleType === 'client') {
                payload.dest_client_id = parseInt(selectedTargetClientId, 10);
                payload.destination = null;
            }

            await api.post(`/rules/client/${encodedKey}`, payload);
            setForm({ destination: '', port: '', proto: 'all', action: 'ACCEPT' });
            setSelectedRouterId('');
            setSelectedRoute('');
            setSelectedNetworkId('');
            setSelectedTargetClientId('');
            fetchRules();
        } catch {
            alert('Create failed');
        }
    };

    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 backdrop-blur-sm">
            <div className="bg-slate-800 rounded-lg shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col border border-slate-700">
                <div className="p-6 border-b border-slate-700 flex justify-between items-center">
                    <h2 className="text-xl font-bold text-white">
                        Rules for <span className="text-emerald-400">{client.name}</span>
                    </h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-white text-2xl">&times;</button>
                </div>

                <div className="p-6 overflow-y-auto flex-1">
                    {/* Add Rule */}
                    <form
                        onSubmit={handleSubmit}
                        className="bg-slate-900/50 p-4 rounded mb-6 grid grid-cols-1 md:grid-cols-5 gap-3 items-end border border-slate-700"
                    >
                        <div className="md:col-span-2 space-y-2">
                            <div className="flex flex-wrap gap-4">
                                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                                    <input type="radio" checked={ruleType === 'network'} onChange={() => setRuleType('network')} />
                                    Predefined Network
                                </label>
                                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                                    <input type="radio" checked={ruleType === 'routed'} onChange={() => setRuleType('routed')} />
                                    Routed Network
                                </label>
                                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                                    <input type="radio" checked={ruleType === 'client'} onChange={() => setRuleType('client')} />
                                    Specific Client
                                </label>
                                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                                    <input type="radio" checked={ruleType === 'custom'} onChange={() => setRuleType('custom')} />
                                    Custom CIDR/IP
                                </label>
                            </div>

                            {ruleType === 'custom' && (
                                <input
                                    className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-sm text-white"
                                    placeholder="0.0.0.0/0"
                                    value={form.destination}
                                    onChange={e => setForm({ ...form, destination: e.target.value })}
                                    required
                                />
                            )}

                            {ruleType === 'network' && (
                                <select
                                    className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-sm text-white"
                                    value={selectedNetworkId}
                                    onChange={e => handleNetworkChange(e.target.value)}
                                    required
                                >
                                    <option value="">Select Network…</option>
                                    {networks.map(n => (
                                        <option key={n.id} value={n.id}>{n.name} ({n.cidr})</option>
                                    ))}
                                </select>
                            )}

                            {ruleType === 'routed' && (
                                <div className="grid grid-cols-2 gap-2">
                                    <select
                                        className="bg-slate-800 border border-slate-600 rounded p-2 text-sm text-white"
                                        value={selectedRouterId}
                                        onChange={e => handleRouterChange(e.target.value)}
                                        required
                                    >
                                        <option value="">Router…</option>
                                        {availableRouters.map(r => (
                                            <option key={r.id} value={r.id}>{r.name}</option>
                                        ))}
                                    </select>

                                    <select
                                        className="bg-slate-800 border border-slate-600 rounded p-2 text-sm text-white"
                                        value={selectedRoute}
                                        onChange={e => handleRouteChange(e.target.value)}
                                        disabled={!selectedRouterId}
                                        required
                                    >
                                        {selectedRouterId
                                            ? clients.find(c => c.id.toString() === selectedRouterId)?.routes.map(r => (
                                                <option key={r} value={r}>{r}</option>
                                            ))
                                            : <option>-</option>}
                                    </select>
                                </div>
                            )}

                            {ruleType === 'client' && (
                                <select
                                    className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-sm text-white"
                                    value={selectedTargetClientId}
                                    onChange={e => handleTargetClientChange(e.target.value)}
                                    required
                                >
                                    <option value="">Select Client…</option>
                                    {clients.filter(c =>
                                        c.id !== client.id &&
                                        c.networks.some(nid => client.networks.includes(nid))
                                    ).map(c => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                </select>
                            )}
                        </div>

                        <input
                            className="bg-slate-800 border border-slate-600 rounded p-2 text-sm text-white"
                            placeholder="All"
                            type="number"
                            value={form.port}
                            onChange={e => setForm({ ...form, port: e.target.value })}
                            disabled={form.proto === 'icmp' || form.proto === 'all'}
                        />

                        <select
                            className="bg-slate-800 border border-slate-600 rounded p-2 text-sm text-white"
                            value={form.proto}
                            onChange={e => setForm({ ...form, proto: e.target.value })}
                        >
                            <option value="udp">UDP</option>
                            <option value="tcp">TCP</option>
                            <option value="icmp">ICMP</option>
                            <option value="all">All</option>
                        </select>

                        <select
                            className="bg-slate-800 border border-slate-600 rounded p-2 text-sm text-white"
                            value={form.action}
                            onChange={e => setForm({ ...form, action: e.target.value })}
                        >
                            <option value="ACCEPT">Allow</option>
                            <option value="DROP">Deny</option>
                        </select>

                        <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white p-2 rounded text-sm">
                            Add Rule
                        </button>
                    </form>

                    {/* Rules table */}
                    <table className="w-full text-left bg-slate-900/30 rounded border-collapse">
                        <thead className="bg-slate-900 text-slate-400 uppercase text-[10px] font-bold">
                            <tr>
                                <th className="p-3">Destination</th>
                                <th className="p-3">Port</th>
                                <th className="p-3">Protocol</th>
                                <th className="p-3">Action</th>
                                <th className="p-3 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td className="p-4 text-center text-slate-500">Loading…</td></tr>
                            ) : rules.map(rule => (
                                <tr key={rule.id} className="border-t border-slate-700">
                                    <td className="p-3 font-mono text-emerald-300">
                                        {rule.dest_client_id
                                            ? clients.find(c => c.id === rule.dest_client_id)?.name || 'Unknown Client'
                                            : (rule.dest_cidr || 'Any')}
                                    </td>
                                    <td className="p-3">{rule.port ?? 'All'}</td>
                                    <td className="p-3 uppercase text-xs">{rule.proto}</td>
                                    <td className="p-3">{rule.action}</td>
                                    <td className="p-3 text-right">
                                        <button onClick={() => handleDelete(rule.id)} className="text-red-400">Delete</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default RulesModal;
