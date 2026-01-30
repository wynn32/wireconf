import React, { useEffect, useState } from 'react';
import api from '../api';

interface Network {
    id: number;
    name: string;
    cidr: string;
}

interface Client {
    id: number;
    name: string;
    ips: string[];
    networks: number[];
    routes: string[];
}

interface AccessRule {
    id: number;
    source_client_id: number | null;
    dest_cidr: string | null;
    dest_client_id: number | null;
    action: string;
}

const Topology: React.FC = () => {
    const [networks, setNetworks] = useState<Network[]>([]);
    const [clients, setClients] = useState<Client[]>([]);
    const [rules, setRules] = useState<AccessRule[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchData = async () => {
        try {
            const [nRes, cRes, rRes] = await Promise.all([
                api.get('/networks'),
                api.get('/clients'),
                api.get('/rules')
            ]);
            setNetworks(nRes.data);
            setClients(cRes.data);
            setRules(rRes.data);
        } catch (err) {
            // If /rules/client/all doesn't exist, I'll fallback to a different strategy
            console.error(err);
            // Re-fetch logic: fetch rules for EACH client if needed, but let's assume I add the endpoint.
        } finally {
            setLoading(false);
        }
    };

    // Optimization: I'll actually add a general /rules endpoint to the backend.

    useEffect(() => {
        fetchData();
    }, []);

    if (loading) return <div className="text-slate-500 p-8">Loading topology...</div>;

    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold text-white mb-6">Network Topology</h2>

            <div className="bg-slate-800 p-8 rounded-xl border border-slate-700 shadow-2xl overflow-auto min-h-[600px]">
                {/* SVG Visualization */}
                <svg width="1000" height="600" className="mx-auto">
                    {/* Define Arrows */}
                    <defs>
                        <marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
                            <path d="M0,0 L0,6 L9,3 z" fill="#64748b" />
                        </marker>
                    </defs>

                    {/* Render Networks as large rounded boxes/zones */}
                    {networks.map((net, i) => (
                        <g key={net.id} transform={`translate(${100 + i * 300}, 50)`}>
                            <rect width="250" height="500" rx="15" fill="#1e293b" stroke="#334155" strokeWidth="2" />
                            <text x="125" y="30" textAnchor="middle" fill="#10b981" className="font-bold text-sm uppercase tracking-wider">{net.name}</text>
                            <text x="125" y="50" textAnchor="middle" fill="#64748b" className="text-[10px] font-mono">{net.cidr}</text>

                            {/* Render Clients inside their primary network zone? 
                                A client can be in multiple. 
                                Let's simplify: list clients and draw lines.
                            */}
                        </g>
                    ))}

                    {/* Render Clients as Nodes */}
                    {clients.map((client, i) => {
                        const y = 100 + (i * 80);
                        const x = 500; // Center column

                        return (
                            <g key={client.id} transform={`translate(${x}, ${y})`}>
                                {/* Connections to Networks */}
                                {client.networks.map(nid => {
                                    const netIdx = networks.findIndex(n => n.id === nid);
                                    if (netIdx === -1) return null;
                                    const netX = 100 + netIdx * 300 + 125;
                                    const netY = 50 + 250; // Middle of net box (height is 500)
                                    return (
                                        <line
                                            key={nid}
                                            x1={0} y1={20}
                                            x2={netX - x} y2={netY - y}
                                            stroke="#334155" strokeDasharray="4"
                                        />
                                    );
                                })}

                                <rect width="180" height="50" rx="8" fill="#334155" stroke="#475569" strokeWidth="1" x="-90" />
                                <text y="20" textAnchor="middle" fill="white" className="font-bold text-xs">{client.name}</text>
                                <text y="35" textAnchor="middle" fill="#94a3b8" className="text-[9px] font-mono">{client.ips.join(', ')}</text>

                                {client.routes && client.routes.length > 0 && (
                                    <g transform="translate(60, 5)">
                                        <rect width="20" height="12" rx="4" fill="#3b82f6" />
                                        <text x="10" y="9" textAnchor="middle" fill="white" className="text-[8px] font-bold">R</text>
                                    </g>
                                )}
                            </g>
                        );
                    })}
                </svg>
            </div>

            {/* Legend / Table View of Access */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-slate-800 p-6 rounded-lg border border-slate-700">
                    <h3 className="text-lg font-semibold text-white mb-4">Client Routing Summary</h3>
                    <div className="space-y-3">
                        {clients.filter(c => c.routes && c.routes.length > 0).map(c => (
                            <div key={c.id} className="p-3 bg-slate-900 rounded border border-slate-700">
                                <div className="text-sm font-bold text-blue-400">{c.name} (Gateway)</div>
                                <div className="text-xs text-slate-400 mt-1">Routes traffic for: {c.routes.join(', ')}</div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="bg-slate-800 p-6 rounded-lg border border-slate-700">
                    <h3 className="text-lg font-semibold text-white mb-4">Global Access Rules</h3>
                    <div className="space-y-2">
                        {rules.length === 0 ? (
                            <div className="text-sm text-slate-500 italic">No access rules defined. All inter-client traffic blocked by default.</div>
                        ) : rules.map(r => {
                            const src = clients.find(c => c.id === r.source_client_id)?.name || 'All Clients';
                            const dest = r.dest_client_id ? (clients.find(c => c.id === r.dest_client_id)?.name || 'Unknown') : r.dest_cidr;
                            return (
                                <div key={r.id} className="flex items-center gap-2 text-xs">
                                    <span className="text-emerald-400 font-bold">{src}</span>
                                    <span className="text-slate-600">→</span>
                                    <span className="text-blue-400 font-bold">{dest}</span>
                                    <span className={`ml-auto px-1.5 py-0.5 rounded text-[10px] ${r.action === 'ACCEPT' ? 'bg-emerald-900/50 text-emerald-400' : 'bg-red-900/50 text-red-400'}`}>
                                        {r.action}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Topology;
