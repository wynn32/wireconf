
import React, { useEffect, useState, useMemo } from 'react';
import api from '../api';
import RulesModal from './RulesModal';
import ClientCreateModal from '../components/ClientCreateModal';
import ImportModal from '../components/ImportModal';
import ConfigModal from '../components/ConfigModal';
import ClientCard from '../components/ClientCard';
import type { Client, Network } from '../components/ClientCard';
import ClientDetailsModal from '../components/ClientDetailsModal';
import { useClientStatus } from '../hooks/useClientStatus';

const Clients: React.FC = () => {
    // Data State
    const [clients, setClients] = useState<Client[]>([]);
    const [networks, setNetworks] = useState<Network[]>([]);
    const [loading, setLoading] = useState(true);

    // Live Status State
    const [liveUpdates, setLiveUpdates] = useState(() => {
        return localStorage.getItem('liveUpdates') !== 'false';
    });

    useEffect(() => {
        localStorage.setItem('liveUpdates', liveUpdates.toString());
    }, [liveUpdates]);

    const { statusMap, refresh: refreshStatus } = useClientStatus(liveUpdates ? 5000 : 0);

    // Dirty/Uncommitted State
    const [dirtyClients, setDirtyClients] = useState<Set<number>>(new Set());

    const fetchCommitStatus = async () => {
        try {
            const res = await api.get('/commit/preview');
            const summary = res.data.summary;
            const dirty = new Set<number>();

            // Add added/modified/removed to dirty set (if IDs exist)
            // Note: removed clients won't match existing IDs so that's fine.
            summary.added_clients.forEach((c: any) => c.id && dirty.add(c.id));
            summary.modified_clients.forEach((c: any) => c.id && dirty.add(c.id));

            setDirtyClients(dirty);
        } catch (err) {
            console.error('Failed to fetch commit status', err);
        }
    };

    // Modal State
    const [selectedClient, setSelectedClient] = useState<Client | null>(null); // For Rules
    const [editingClient, setEditingClient] = useState<Client | null>(null); // For Settings
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showImportModal, setShowImportModal] = useState(false);
    const [viewConfig, setViewConfig] = useState<{ content: string, filename: string } | null>(null);

    // Filter State
    const [searchQuery, setSearchQuery] = useState('');
    // const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
    const [networkFilter, setNetworkFilter] = useState<number | null>(null);
    const [routerOnly, setRouterOnly] = useState(false);

    const fetchData = async () => {
        try {
            const [cRes, nRes] = await Promise.all([
                api.get('/clients'),
                api.get('/networks')
            ]);
            setClients(cRes.data);
            setNetworks(nRes.data);
            fetchCommitStatus(); // Check for dirty state on load/refresh
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

    const handleToggleNetwork = async (client: Client, networkId: number) => {
        try {
            const isMember = client.networks.includes(networkId);
            const newNetworks = isMember
                ? client.networks.filter(id => id !== networkId)
                : [...client.networks, networkId];

            await api.put(`/clients/${client.id}`, { networks: newNetworks });
            fetchData();
        } catch (err) {
            console.error('Failed to toggle network', err);
            alert('Failed to update network membership');
        }
    };

    const handleDelete = async (client: Client) => {
        if (!confirm(`Are you sure you want to delete ${client.name}? This action cannot be undone.`)) {
            return;
        }
        try {
            await api.delete(`/clients/${client.id}`);
            fetchData();
            refreshStatus();
        } catch (err) {
            console.error('Failed to delete client', err);
            alert('Failed to delete client');
        }
    };

    const handleUpdateTags = async (client: Client, newTags: string[]) => {
        try {
            // Backend expects comma-separated string or list? 
            // Checking models.py: tags: Mapped[Optional[str]] ... Comma-separated tags
            // Checking routes.py: tags = data.get('tags') ... client.tags = ','.join(...)
            // So we should send a list of strings, backend handles join.
            await api.put(`/clients/${client.id}`, { tags: newTags });
            fetchData();
        } catch (err) {
            console.error('Failed to update tags', err);
            alert('Failed to update tags');
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    // Filter Logic
    const filteredClients = useMemo(() => {
        return clients.filter(client => {
            // 1. Smart Search (Name, IP, PublicKey, Tag)
            if (searchQuery) {
                const q = searchQuery.toLowerCase();
                const matchesName = client.name.toLowerCase().includes(q);
                const matchesIp = client.ips.some(ip => ip.includes(q)) || `.${client.octet}`.includes(q);
                const matchesKey = client.public_key.toLowerCase().includes(q);
                const matchesTag = client.tags.some(t => t.toLowerCase().includes(q));

                if (!matchesName && !matchesIp && !matchesKey && !matchesTag) return false;
            }

            // 2. Network Filter
            if (networkFilter !== null && !client.networks.includes(networkFilter)) {
                return false;
            }

            // 3. Router Filter
            if (routerOnly && (!client.routes || client.routes.length === 0)) {
                return false;
            }

            return true;
        });
    }, [clients, searchQuery, networkFilter, routerOnly]);

    // Derived Stats
    const totalClients = clients.length;
    const activeClients = Object.values(statusMap).filter(s => s.is_active).length;

    return (
        <div className="space-y-6 max-w-7xl mx-auto">
            {/* Header / Toolbar */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-3xl font-bold text-white tracking-tight">Clients</h2>
                    <p className="text-slate-400 text-sm mt-1 flex items-center gap-2">
                        <span>{totalClients} Total</span>
                        <span className="text-slate-600">•</span>
                        <span className="text-emerald-400">{activeClients} Active</span>
                    </p>
                </div>

                <div className="flex flex-wrap gap-3">
                    {/* Live Update Toggle */}
                    <button
                        onClick={() => setLiveUpdates(!liveUpdates)}
                        className={`
                            flex items-center gap-2 px-3 py-2 rounded-lg border transition-all text-sm font-medium
                            ${liveUpdates
                                ? 'bg-emerald-900/20 border-emerald-500/30 text-emerald-400'
                                : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'}
                        `}
                    >
                        <span className={`w-2 h-2 rounded-full ${liveUpdates ? 'bg-emerald-500 animate-pulse' : 'bg-slate-500'}`} />
                        {liveUpdates ? 'Live Updates On' : 'Live Updates Off'}
                    </button>

                    <button
                        onClick={() => setShowImportModal(true)}
                        className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg transition-colors font-medium border border-slate-700 shadow-sm"
                    >
                        Import
                    </button>
                    <button
                        onClick={() => setShowCreateModal(true)}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg transition-colors font-medium shadow-lg hover:shadow-blue-900/20"
                    >
                        + Add Client
                    </button>
                </div>
            </div>

            {/* Search & Filters */}
            <div className="bg-slate-800/50 backdrop-blur-sm p-4 rounded-xl border border-slate-700/50 shadow-sm">
                <div className="flex flex-col md:flex-row gap-4">
                    {/* Smart Search */}
                    <div className="flex-1 relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <svg className="h-5 w-5 text-slate-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                            </svg>
                        </div>
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search clients by name, IP, tag..."
                            className="bg-slate-900/80 border border-slate-700 text-white text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full pl-10 p-2.5 placeholder-slate-500"
                        />
                    </div>

                    {/* Filter Toggles */}
                    <div className="flex items-center gap-4">
                        <select
                            value={networkFilter ?? ''}
                            onChange={(e) => setNetworkFilter(e.target.value ? parseInt(e.target.value) : null)}
                            className="bg-slate-900/80 border border-slate-700 text-white text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 p-2.5 outline-none"
                        >
                            <option value="">All Networks</option>
                            {networks.map(n => (
                                <option key={n.id} value={n.id}>{n.name}</option>
                            ))}
                        </select>

                        <label className="flex items-center gap-2 text-sm font-medium text-slate-300 cursor-pointer select-none">
                            <div className="relative">
                                <input
                                    type="checkbox"
                                    checked={routerOnly}
                                    onChange={(e) => setRouterOnly(e.target.checked)}
                                    className="sr-only peer"
                                />
                                <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                            </div>
                            Routers Only
                        </label>
                    </div>
                </div>
            </div>

            {/* Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {loading ? (
                    <div className="col-span-full text-center py-12">
                        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-white mb-4"></div>
                        <p className="text-slate-500">Loading clients...</p>
                    </div>
                ) : filteredClients.length === 0 ? (
                    <div className="col-span-full flex flex-col items-center justify-center py-16 bg-slate-800/30 rounded-xl border border-dashed border-slate-700">
                        <div className="bg-slate-800 p-4 rounded-full mb-4">
                            <svg className="h-8 w-8 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                            </svg>
                        </div>
                        <h3 className="text-lg font-medium text-white mb-1">No clients found</h3>
                        <p className="text-slate-400 text-sm max-w-md text-center">
                            {clients.length === 0
                                ? "Get started by adding your first WireGuard client."
                                : "No clients match your current search filters."}
                        </p>
                        {clients.length === 0 && (
                            <button
                                onClick={() => setShowCreateModal(true)}
                                className="mt-4 text-blue-400 hover:text-blue-300 text-sm font-medium"
                            >
                                Create a client
                            </button>
                        )}
                    </div>
                ) : (
                    filteredClients.map(client => (
                        <ClientCard
                            key={client.id}
                            client={client}
                            status={statusMap[client.public_key]}
                            networks={networks}
                            onManageRules={setSelectedClient}
                            onEditSettings={setEditingClient}
                            onViewConfig={handleViewConfig}
                            onRefresh={() => { fetchData(); refreshStatus(); }}
                            onToggleNetwork={handleToggleNetwork}
                            onDelete={handleDelete}
                            onUpdateTags={handleUpdateTags}
                            hasUncommittedChanges={dirtyClients.has(client.id)}
                        />
                    ))
                )}
            </div>

            {/* Modals */}
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
                    }} />
            )}

            {viewConfig && (
                <ConfigModal
                    configContent={viewConfig.content}
                    filename={viewConfig.filename}
                    onClose={() => setViewConfig(null)}
                />
            )}
        </div>
    );
};

export default Clients;
