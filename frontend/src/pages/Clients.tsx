import React, { useEffect, useState } from 'react';
import api from '../api';
import RulesModal from './RulesModal';
import ClientCreateModal from '../components/ClientCreateModal';
import ImportModal from '../components/ImportModal';
import ConfigModal from '../components/ConfigModal';

interface Network {
    id: number;
    name: string;
}

interface Client {
    id: number;
    name: string;
    octet: number;
    ips: string[];  // Full IP addresses
    public_key: string;
    networks: number[];
    keepalive?: number;
    routes?: string[];
    enabled: boolean;
    dns_mode: 'default' | 'custom' | 'none';
    dns_servers?: string;
}

// Modal for editing client Advanced Details
const ClientDetailsModal: React.FC<{
    client: Client;
    onClose: () => void;
    onSave: () => void;
}> = ({ client, onClose, onSave }) => {
    const [useKeepalive, setUseKeepalive] = useState(!!client.keepalive);
    const [keepalive, setKeepalive] = useState(client.keepalive || 25);
    const [isRouter, setIsRouter] = useState((client.routes && client.routes.length > 0));
    const [routedCidrs, setRoutedCidrs] = useState(client.routes ? client.routes.join(', ') : '');

    // DNS Configuration
    const [dnsMode, setDnsMode] = useState<'default' | 'custom' | 'none'>(client.dns_mode || 'default');
    const [customDns, setCustomDns] = useState(client.dns_servers || '');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const routes = isRouter && routedCidrs.trim() ? routedCidrs.split(',').map(s => s.trim()) : [];
            await api.put(`/clients/${client.id}`, {
                keepalive: useKeepalive ? keepalive : null,
                routes: routes,
                dns_mode: dnsMode,
                dns_servers: dnsMode === 'custom' ? customDns : null
            });
            onSave();
        } catch (err: any) {
            alert('Failed to update settings');
        }
    };

    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 backdrop-blur-sm">
            <div className="bg-slate-800 rounded-lg shadow-2xl w-full max-w-md p-6 border border-slate-700">
                <h3 className="text-xl font-bold text-white mb-4">Edit Settings: {client.name}</h3>
                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* DNS Configuration */}
                    <div className="border-b border-slate-700 pb-4">
                        <label className="block text-sm text-slate-400 mb-3">DNS Configuration</label>
                        <div className="space-y-2">
                            <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                                <input
                                    type="radio"
                                    name="dnsMode"
                                    value="default"
                                    checked={dnsMode === 'default'}
                                    onChange={() => setDnsMode('default')}
                                    className="text-emerald-500 focus:ring-emerald-500"
                                />
                                Use WireGuard server IPs as DNS
                            </label>

                            <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                                <input
                                    type="radio"
                                    name="dnsMode"
                                    value="custom"
                                    checked={dnsMode === 'custom'}
                                    onChange={() => setDnsMode('custom')}
                                    className="text-blue-500 focus:ring-blue-500"
                                />
                                <div className="flex-1">
                                    <span>Custom DNS servers</span>
                                    {dnsMode === 'custom' && (
                                        <input
                                            type="text"
                                            value={customDns}
                                            onChange={e => setCustomDns(e.target.value)}
                                            className="w-full mt-2 bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm"
                                            placeholder="e.g. 8.8.8.8, 8.8.4.4"
                                        />
                                    )}
                                </div>
                            </label>

                            <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                                <input
                                    type="radio"
                                    name="dnsMode"
                                    value="none"
                                    checked={dnsMode === 'none'}
                                    onChange={() => setDnsMode('none')}
                                    className="text-slate-500 focus:ring-slate-500"
                                />
                                No DNS configuration
                            </label>
                        </div>
                    </div>
                    <div>
                        <label className="flex items-center gap-2 text-sm text-slate-300 mb-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={useKeepalive}
                                onChange={e => setUseKeepalive(e.target.checked)}
                                className="rounded bg-slate-700 border-slate-600 text-emerald-500 focus:ring-emerald-500"
                            />
                            Enable Persistent Keepalive
                        </label>
                        {useKeepalive && (
                            <div>
                                <input
                                    type="number"
                                    value={keepalive}
                                    onChange={e => setKeepalive(parseInt(e.target.value))}
                                    className="w-24 bg-slate-900 border border-slate-700 rounded p-1 text-white text-sm"
                                    min={0}
                                />
                                <span className="text-xs text-slate-500 ml-2">seconds</span>
                            </div>
                        )}
                    </div>
                    <div>
                        <label className="flex items-center gap-2 text-sm text-slate-300 mb-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={isRouter}
                                onChange={e => setIsRouter(e.target.checked)}
                                className="rounded bg-slate-700 border-slate-600 text-blue-500 focus:ring-blue-500"
                            />
                            Is Router (Gateway)
                        </label>
                        {isRouter && (
                            <div className="flex flex-col">
                                <input
                                    value={routedCidrs}
                                    onChange={e => setRoutedCidrs(e.target.value)}
                                    className="w-full bg-slate-900 border border-slate-700 rounded p-1 text-white text-sm placeholder-slate-600"
                                    placeholder="cidr1, cidr2"
                                />
                            </div>
                        )}
                    </div>
                    <div className="flex justify-end gap-2 mt-4">
                        <button type="button" onClick={onClose} className="text-slate-400 hover:text-white px-3 py-1">Cancel</button>
                        <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded">Save</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// Sub-component for individual client management
const ClientCard: React.FC<{
    client: Client,
    networks: Network[],
    onManageRules: (c: Client) => void,
    onEditSettings: (c: Client) => void,
    onViewConfig: (c: Client) => void,
    onRefresh: () => void
}> = ({ client, networks, onManageRules, onEditSettings, onViewConfig, onRefresh }) => {
    const [editing, setEditing] = useState(false);
    const [localNetIds, setLocalNetIds] = useState<number[]>(client.networks);

    const toggleNet = (nid: number) => {
        setLocalNetIds(prev =>
            prev.includes(nid) ? prev.filter(n => n !== nid) : [...prev, nid]
        );
    };

    const handleSave = async () => {
        try {
            await api.put(`/clients/${client.id}`, { networks: localNetIds });
            setEditing(false);
            onRefresh();
        } catch (err: any) {
            alert(`Update failed: ${err.response?.data?.error || err.message}`);
        }
    };

    const handleCancel = () => {
        setLocalNetIds(client.networks);
        setEditing(false);
    };

    const downloadUrl = (import.meta.env.VITE_API_URL || 'http://localhost:5000') + `/clients/${client.id}/config`;

    const handleToggleEnabled = async () => {
        try {
            await api.put(`/clients/${client.id}`, { enabled: !client.enabled });
            onRefresh();
        } catch (err) {
            alert('Failed to update status');
        }
    };

    const handleDelete = async () => {
        if (!confirm(`Permanently delete client ${client.name}? This cannot be undone.`)) return;
        try {
            await api.delete(`/clients/${client.id}`);
            onRefresh();
        } catch (err) {
            alert('Failed to delete client');
        }
    };

    return (
        <div className={`bg-slate-800 rounded-lg shadow-lg border p-5 flex flex-col transition-all ${client.enabled ? 'border-slate-700 hover:border-slate-600' : 'border-red-900/50 opacity-75'}`}>
            <div className="flex justify-between items-start mb-4">
                <div>
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        {client.name}
                        {!client.enabled && <span className="text-[10px] bg-red-900 text-red-200 px-1 rounded ml-2">DISABLED</span>}
                        <button
                            onClick={() => setEditing(!editing)}
                            className="text-xs text-slate-500 hover:text-blue-400 transition-colors"
                            title="Edit Networks"
                        >
                            <span className="sr-only">Edit Networks</span>
                            Networks
                        </button>
                        <button
                            onClick={() => onEditSettings(client)}
                            className="text-xs text-slate-500 hover:text-blue-400 transition-colors"
                            title="Edit Settings"
                        >
                            Settings
                        </button>
                    </h3>
                    <div className="text-xs text-slate-500 font-mono mt-1 break-all">{client.public_key.substring(0, 15)}...</div>
                </div>
                <div className="text-right">
                    <div className="bg-slate-900 text-emerald-400 px-2 py-1 rounded font-mono text-sm font-bold border border-slate-700">
                        {client.ips.length > 0 ? client.ips.join(', ') : `.${client.octet}`}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">IP Address{client.ips.length > 1 ? 'es' : ''}</div>
                </div>
            </div>

            <div className="flex-1">
                <h4 className="text-xs uppercase text-slate-500 font-bold mb-2 flex justify-between">
                    Member of Zones
                    {editing && <span className="text-blue-400 text-[10px] animate-pulse">EDITING</span>}
                </h4>

                <div className="flex flex-wrap gap-2 mb-4">
                    {editing ? (
                        // Editing Mode: Show ALL networks to toggle
                        networks.map(net => (
                            <button
                                key={net.id}
                                onClick={() => toggleNet(net.id)}
                                className={`px-2 py-0.5 rounded text-xs border transition-colors ${localNetIds.includes(net.id)
                                    ? 'bg-blue-900 border-blue-500 text-blue-200'
                                    : 'bg-slate-800 border-slate-600 text-slate-500 hover:border-slate-400'
                                    }`}
                            >
                                {net.name}
                            </button>
                        ))
                    ) : (
                        // View Mode: Show only joined networks
                        client.networks.length > 0 ? client.networks.map(nid => {
                            const net = networks.find(n => n.id === nid);
                            return net ? (
                                <span key={nid} className="bg-blue-900/50 text-blue-300 border border-blue-800 px-2 py-0.5 rounded text-xs">
                                    {net.name}
                                </span>
                            ) : null;
                        }) : <span className="text-slate-600 text-xs italic">No networks</span>
                    )}
                </div>

                {editing && (
                    <div className="flex gap-2 mb-2">
                        <button onClick={handleSave} className="bg-blue-600 hover:bg-blue-500 text-white text-xs px-2 py-1 rounded">Save</button>
                        <button onClick={handleCancel} className="bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs px-2 py-1 rounded">Cancel</button>
                    </div>
                )}
            </div>

            <div className="mt-4 pt-4 border-t border-slate-700 flex flex-wrap gap-2 text-sm">
                <button
                    onClick={() => onViewConfig(client)}
                    className="flex-1 bg-slate-700 hover:bg-slate-600 text-center py-2 rounded text-slate-200 transition-colors"
                    title="View & Download WireGuard Config"
                >
                    Config
                </button>
                <button
                    onClick={() => onManageRules(client)}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 py-2 rounded text-white transition-colors"
                >
                    Rules
                </button>
                <button
                    onClick={handleToggleEnabled}
                    className={`flex-none px-3 py-2 rounded transition-colors ${client.enabled ? 'bg-amber-700/50 hover:bg-amber-700 text-amber-100' : 'bg-emerald-700/50 hover:bg-emerald-700 text-emerald-100'}`}
                    title={client.enabled ? "Disable Client" : "Enable Client"}
                >
                    {client.enabled ? 'Disable' : 'Enable'}
                </button>
                <button
                    onClick={handleDelete}
                    className="flex-none bg-red-900/50 hover:bg-red-900 text-red-200 px-3 py-2 rounded transition-colors"
                    title="Delete Client"
                >
                    &times;
                </button>
            </div>
        </div >
    );
};

const Clients: React.FC = () => {
    const [clients, setClients] = useState<Client[]>([]);
    const [networks, setNetworks] = useState<Network[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedClient, setSelectedClient] = useState<Client | null>(null);
    const [editingClient, setEditingClient] = useState<Client | null>(null);
    const [showCreateModal, setShowCreateModal] = useState(false);

    const [showImportModal, setShowImportModal] = useState(false);

    // Config View State
    const [viewConfig, setViewConfig] = useState<{ content: string, filename: string } | null>(null);

    // Filtering state
    const [nameFilter, setNameFilter] = useState('');
    const [networkFilter, setNetworkFilter] = useState<number | null>(null);

    const fetchData = async () => {
        try {
            const [cRes, nRes] = await Promise.all([
                api.get('/clients'),
                api.get('/networks')
            ]);
            setClients(cRes.data);
            setNetworks(nRes.data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleViewConfig = async (client: Client) => {
        try {
            const res = await api.get(`/clients/${client.id}/config`, { responseType: 'text' });
            setViewConfig({
                content: res.data,
                filename: `${client.name}.conf`
            });
        } catch (err) {
            console.error(err);
            alert('Failed to fetch configuration');
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    // Filter clients based on name and network
    const filteredClients = clients.filter(client => {
        // Filter by name
        if (nameFilter && !client.name.toLowerCase().includes(nameFilter.toLowerCase())) {
            return false;
        }

        // Filter by network
        if (networkFilter !== null && !client.networks.includes(networkFilter)) {
            return false;
        }

        return true;
    });

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-white">Clients</h2>
                <div className="flex gap-3">
                    <button
                        onClick={() => setShowImportModal(true)}
                        className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg transition-colors font-medium border border-slate-600"
                    >
                        Import Config
                    </button>
                    <button
                        onClick={() => setShowCreateModal(true)}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2 rounded-lg transition-colors font-medium shadow-lg"
                    >
                        + Add Client
                    </button>
                </div>
            </div>

            {/* Filters */}
            <div className="bg-slate-800 p-4 rounded-lg border border-slate-700">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Name Filter */}
                    <div>
                        <label className="block text-sm text-slate-400 mb-2">Filter by Name</label>
                        <input
                            type="text"
                            value={nameFilter}
                            onChange={e => setNameFilter(e.target.value)}
                            placeholder="Search client name..."
                            className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white focus:border-emerald-500 outline-none"
                        />
                    </div>

                    {/* Network Filter */}
                    <div>
                        <label className="block text-sm text-slate-400 mb-2">Filter by Network</label>
                        <select
                            value={networkFilter ?? ''}
                            onChange={e => setNetworkFilter(e.target.value ? parseInt(e.target.value) : null)}
                            className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white focus:border-emerald-500 outline-none"
                        >
                            <option value="">All Networks</option>
                            {networks.map(net => (
                                <option key={net.id} value={net.id}>{net.name}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {(nameFilter || networkFilter !== null) && (
                    <div className="mt-3 flex items-center gap-2">
                        <span className="text-sm text-slate-400">
                            Showing {filteredClients.length} of {clients.length} clients
                        </span>
                        <button
                            onClick={() => { setNameFilter(''); setNetworkFilter(null); }}
                            className="text-xs text-blue-400 hover:text-blue-300"
                        >
                            Clear filters
                        </button>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {loading ? (
                    <div className="text-slate-500">Loading clients...</div>
                ) : filteredClients.length === 0 ? (
                    <div className="col-span-full text-center text-slate-500 py-8">
                        {clients.length === 0 ? 'No clients yet. Create your first client!' : 'No clients match the current filters.'}
                    </div>
                ) : filteredClients.map(client => (
                    <ClientCard
                        key={client.id}
                        client={client}
                        networks={networks}
                        onManageRules={setSelectedClient}
                        onEditSettings={setEditingClient}
                        onViewConfig={handleViewConfig}
                        onRefresh={fetchData}
                    />
                ))}
            </div>

            {selectedClient && (
                <RulesModal
                    client={selectedClient}
                    onClose={() => setSelectedClient(null)}
                />
            )}

            {editingClient && (
                <ClientDetailsModal
                    client={editingClient}
                    onClose={() => setEditingClient(null)}
                    onSave={() => { setEditingClient(null); fetchData(); }}
                />
            )}

            {showCreateModal && (
                <ClientCreateModal
                    networks={networks}
                    onClose={() => setShowCreateModal(false)}
                    onSuccess={fetchData}
                />
            )}
            {showImportModal && (
                <ImportModal
                    onClose={() => setShowImportModal(false)}
                    onSuccess={() => {
                        fetchData();
                        // Optionally reload page to reflect server changes if critical
                    }}
            )}

            {viewConfig && (
                <ConfigModal
                    configContent={viewConfig.content}
                    filename={viewConfig.filename}
                    onClose={() => setViewConfig(null)}
                />
            )}
        </div>
        </div >
    );
};

export default Clients;
