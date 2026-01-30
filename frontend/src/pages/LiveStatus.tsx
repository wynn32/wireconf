import React, { useEffect, useState } from 'react';
import api from '../api';

interface ClientStatus {
    id: number;
    name: string;
    public_key: string;
    endpoint: string;
    latest_handshake: number;
    transfer_rx: number;
    transfer_tx: number;
    is_active: boolean;
    enabled: boolean;
}

const LiveStatus: React.FC = () => {
    const [clients, setClients] = useState<ClientStatus[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [refreshInterval, setRefreshInterval] = useState<number>(5000); // 5 seconds default
    const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

    const fetchStatus = async () => {
        try {
            const res = await api.get('/wireguard/status');
            // Sort by latest handshake (descending) so active clients are top
            const sorted = res.data.sort((a: ClientStatus, b: ClientStatus) => {
                // If one is active and other isn't, active goes first
                if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
                // Otherwise sort by handshake time
                return b.latest_handshake - a.latest_handshake;
            });
            setClients(sorted);
            setError('');
            setLastUpdate(new Date());
        } catch (err: any) {
            console.error(err);
            setError('Failed to fetch WireGuard status');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStatus();

        let intervalId: any;
        if (refreshInterval > 0) {
            intervalId = setInterval(fetchStatus, refreshInterval);
        }

        return () => {
            if (intervalId) clearInterval(intervalId);
        };
    }, [refreshInterval]);

    const formatBytes = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const formatTimeAgo = (timestamp: number) => {
        if (timestamp === 0) return 'Never';
        const seconds = Math.floor((Date.now() / 1000) - timestamp);

        if (seconds < 60) return `${seconds}s ago`;
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
        return `${Math.floor(seconds / 86400)}d ago`;
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold text-white">Live Status</h2>
                    <p className="text-slate-400 text-sm mt-1">Real-time traffic and connection statistics</p>
                </div>

                <div className="flex items-center gap-4">
                    <span className="text-xs text-slate-500 font-mono">
                        Last updated: {lastUpdate.toLocaleTimeString()}
                    </span>

                    <div className="flex items-center gap-2 bg-slate-800 p-1 rounded-lg border border-slate-700">
                        <span className="text-xs text-slate-400 px-2">Refresh:</span>
                        {[5000, 10000, 30000, 0].map(val => (
                            <button
                                key={val}
                                onClick={() => setRefreshInterval(val)}
                                className={`px-2 py-1 text-xs rounded transition-colors ${refreshInterval === val
                                        ? 'bg-blue-600 text-white shadow-sm'
                                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700'
                                    }`}
                            >
                                {val === 0 ? 'Off' : `${val / 1000}s`}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {error && (
                <div className="bg-red-900/50 border border-red-900 text-red-200 p-4 rounded-lg">
                    {error}
                </div>
            )}

            <div className="bg-slate-800 rounded-xl shadow-lg border border-slate-700 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-900/50 border-b border-slate-700 text-xs uppercase text-slate-400 font-bold tracking-wider">
                                <th className="p-4">Client</th>
                                <th className="p-4">Status</th>
                                <th className="p-4">Endpoint</th>
                                <th className="p-4">Latest Handshake</th>
                                <th className="p-4 text-right">Received (Rx)</th>
                                <th className="p-4 text-right">Sent (Tx)</th>
                                <th className="p-4 text-right">Total</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700/50">
                            {loading ? (
                                <tr>
                                    <td colSpan={7} className="p-8 text-center text-slate-500">
                                        Loading stats...
                                    </td>
                                </tr>
                            ) : clients.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="p-8 text-center text-slate-500">
                                        No clients found.
                                    </td>
                                </tr>
                            ) : (
                                clients.map(client => (
                                    <tr key={client.id} className="hover:bg-slate-700/30 transition-colors">
                                        <td className="p-4">
                                            <div className="font-medium text-white">{client.name}</div>
                                            {!client.enabled && <span className="text-[10px] text-red-400">DISABLED</span>}
                                        </td>
                                        <td className="p-4">
                                            {client.is_active ? (
                                                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium bg-emerald-900/50 text-emerald-300 border border-emerald-800">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                                                    Online
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium bg-slate-700/50 text-slate-400 border border-slate-600">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-slate-500"></span>
                                                    Offline
                                                </span>
                                            )}
                                        </td>
                                        <td className="p-4 text-sm text-slate-300 font-mono">
                                            {client.endpoint === '(none)' ? <span className="text-slate-600">-</span> : client.endpoint}
                                        </td>
                                        <td className="p-4 text-sm text-slate-300">
                                            {formatTimeAgo(client.latest_handshake)}
                                        </td>
                                        <td className="p-4 text-right text-sm text-emerald-300 font-mono">
                                            {client.transfer_rx > 0 ? '↓' : ''} {formatBytes(client.transfer_rx)}
                                        </td>
                                        <td className="p-4 text-right text-sm text-blue-300 font-mono">
                                            {client.transfer_tx > 0 ? '↑' : ''} {formatBytes(client.transfer_tx)}
                                        </td>
                                        <td className="p-4 text-right text-sm text-slate-200 font-bold font-mono">
                                            {formatBytes(client.transfer_rx + client.transfer_tx)}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default LiveStatus;
