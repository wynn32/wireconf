import React, { useEffect, useState } from 'react';
import api from '../api';

interface Rule {
    id: number;
    dest_cidr: string;
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

interface Props {
    client: any; // Full client object
    onClose: () => void;
}

interface Client {
    id: number;
    name: string;
    networks: number[];
    routes: string[];
}

const RulesModal: React.FC<Props> = ({ client, onClose }) => {
    const [rules, setRules] = useState<Rule[]>([]);
    const [loading, setLoading] = useState(true);

    // Router Rule State
    const [clients, setClients] = useState<Client[]>([]);
    const [networks, setNetworks] = useState<Network[]>([]);
    const [ruleType, setRuleType] = useState<'custom' | 'routed' | 'network'>('custom');
    const [selectedRouterId, setSelectedRouterId] = useState<string>('');
    const [selectedRoute, setSelectedRoute] = useState<string>('');
    const [selectedNetworkId, setSelectedNetworkId] = useState<string>('');

    const [form, setForm] = useState({ destination: '', port: '', proto: 'udp', action: 'ACCEPT' });

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

    // Filter Routers: Must have routes AND share a network with current client
    const availableRouters = clients.filter(c =>
        c.id !== client.id &&
        c.routes && c.routes.length > 0 &&
        c.networks.some(nid => client.networks.includes(nid))
    );

    const handleRouterChange = (routerId: string) => {
        setSelectedRouterId(routerId);
        const router = clients.find(c => c.id === parseInt(routerId));
        if (router && router.routes.length > 0) {
            setSelectedRoute(router.routes[0]);
            setForm(prev => ({ ...prev, destination: router.routes[0] }));
        }
    };

    const handleRouteChange = (cidr: string) => {
        setSelectedRoute(cidr);
        setForm(prev => ({ ...prev, destination: cidr }));
        const handleRouteChange = (cidr: string) => {
            setSelectedRoute(cidr);
            setForm(prev => ({ ...prev, destination: cidr }));
        };

        const handleNetworkChange = (networkId: string) => {
            setSelectedNetworkId(networkId);
            const net = networks.find(n => n.id === parseInt(networkId));
            if (net) {
                setForm(prev => ({ ...prev, destination: net.cidr }));
            }
        };

        const handleDelete = async (id: number) => {
            if (!confirm('Are you sure?')) return;
            try {
                await api.delete(`/rules/${id}`);
                fetchRules();
            } catch (err) {
                alert('Delete failed');
            }
        };

        const handleSubmit = async (e: React.FormEvent) => {
            e.preventDefault();
            try {
                const encodedKey = encodeURIComponent(client.public_key);
                await api.post(`/rules/client/${encodedKey}`, {
                    destination: form.destination,
                    destination_type: 'host', // Assuming host/CIDR for now
                    port: form.port ? parseInt(form.port) : null,
                    proto: form.proto,
                    action: form.action
                });
                setForm({ destination: '', port: '', proto: 'udp', action: 'ACCEPT' });
                fetchRules();
            } catch (err) {
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
                        {/* Add Rule Form */}
                        <form onSubmit={handleSubmit} className="bg-slate-900/50 p-4 rounded mb-6 grid grid-cols-1 md:grid-cols-5 gap-3 items-end border border-slate-700">
                            <div className="md:col-span-2 space-y-2">
                                {/* Rule Type Selector */}
                                <div className="flex gap-4 mb-2">
                                    <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="ruleType"
                                            checked={ruleType === 'custom'}
                                            onChange={() => setRuleType('custom')}
                                            className="text-blue-500"
                                        />
                                        Custom CIDR/IP
                                    </label>
                                    <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="ruleType"
                                            checked={ruleType === 'routed'}
                                            onChange={() => setRuleType('routed')}
                                            className="text-emerald-500"
                                        />
                                        Routed Network
                                    </label>
                                </label>
                                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                                    <input
                                        type="radio"
                                        name="ruleType"
                                        checked={ruleType === 'network'}
                                        onChange={() => setRuleType('network')}
                                        className="text-purple-500"
                                    />
                                    Predefined Network
                                </label>
                            </div>

                            {ruleType === 'custom' ? (
                                <div>
                                    <label className="block text-xs text-slate-400 mb-1">Destination (CIDR/IP)</label>
                                    <input
                                        className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-sm text-white focus:border-blue-500 outline-none"
                                        placeholder="0.0.0.0/0"
                                        value={form.destination}
                                        onChange={e => setForm({ ...form, destination: e.target.value })}
                                        required
                                    />
                                </div>
                            ) : ruleType === 'network' ? (
                                <div>
                                    <label className="block text-xs text-slate-400 mb-1">Select Network</label>
                                    <select
                                        className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-sm text-white"
                                        value={selectedNetworkId}
                                        onChange={e => handleNetworkChange(e.target.value)}
                                        required
                                    >
                                        <option value="">Select Network...</option>
                                        {networks.map(n => (
                                            <option key={n.id} value={n.id}>{n.name} ({n.cidr})</option>
                                        ))}
                                    </select>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="block text-xs text-slate-400 mb-1">Via Router</label>
                                        <select
                                            className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-sm text-white"
                                            value={selectedRouterId}
                                            onChange={e => handleRouterChange(e.target.value)}
                                            required
                                        >
                                            <option value="">Select Router...</option>
                                            {availableRouters.map(r => (
                                                <option key={r.id} value={r.id}>{r.name}</option>
                                            ))}
                                            {availableRouters.length === 0 && <option disabled>No accessible routers</option>}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs text-slate-400 mb-1">Target Network</label>
                                        <select
                                            className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-sm text-white"
                                            value={selectedRoute}
                                            onChange={e => handleRouteChange(e.target.value)}
                                            required
                                            disabled={!selectedRouterId}
                                        >
                                            {selectedRouterId ? (
                                                clients.find(c => c.id.toString() === selectedRouterId)?.routes.map(r => (
                                                    <option key={r} value={r}>{r}</option>
                                                ))
                                            ) : <option value="">-</option>}
                                        </select>
                                    </div>
                                </div>
                            )}
                    </div>
                    <div>
                        <label className="block text-xs text-slate-400 mb-1">Port</label>
                        <input
                            className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-sm text-white focus:border-blue-500 outline-none"
                            placeholder="All"
                            type="number"
                            value={form.port}
                            onChange={e => setForm({ ...form, port: e.target.value })}
                            disabled={form.proto === 'icmp' || form.proto === 'all'}
                        />
                    </div>
                    <div>
                        <label className="block text-xs text-slate-400 mb-1">Proto</label>
                        <select
                            className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-sm text-white focus:border-blue-500 outline-none"
                            value={form.proto}
                            onChange={e => setForm({ ...form, proto: e.target.value })}
                        >
                            <option value="udp">UDP</option>
                            <option value="tcp">TCP</option>
                            <option value="icmp">ICMP</option>
                            <option value="all">All</option>
                        </select>
                    </div>
                    <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white p-2 rounded text-sm font-medium transition-colors">
                        Add Rule
                    </button>
                </form>

                {/* Rules List */}
                <table className="w-full text-left bg-slate-900/30 rounded overflow-hidden">
                    <thead className="bg-slate-900 text-slate-400 uppercase text-xs">
                        <tr>
                            <th className="p-3">Dest</th>
                            <th className="p-3">Port</th>
                            <th className="p-3">Proto</th>
                            <th className="p-3">Action</th>
                            <th className="p-3"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700">
                        {loading ? (
                            <tr><td colSpan={5} className="p-4 text-center text-slate-500">Loading...</td></tr>
                        ) : rules.map(rule => (
                            <tr key={rule.id} className="hover:bg-slate-700/30">
                                <td className="p-3 font-mono text-emerald-300">{rule.dest_cidr || 'Any'}</td>
                                <td className="p-3 text-slate-300">{rule.port || 'All'}</td>
                                <td className="p-3 uppercase text-slate-300 text-xs font-bold">{rule.proto}</td>
                                <td className="p-3">
                                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${rule.action === 'ACCEPT' ? 'bg-emerald-900 text-emerald-300' : 'bg-red-900 text-red-300'}`}>
                                        {rule.action}
                                    </span>
                                </td>
                                <td className="p-3 text-right">
                                    <button onClick={() => handleDelete(rule.id)} className="text-slate-500 hover:text-red-400 transition-colors">
                                        Delete
                                    </button>
                                </td>
                            </tr>
                        ))}
                        {!loading && rules.length === 0 && (
                            <tr><td colSpan={5} className="p-4 text-center text-slate-500 text-sm">No specific rules (Default Policy Applies).</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
            </div >
        </div >
    );
};

export default RulesModal;
