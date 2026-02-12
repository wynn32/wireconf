
import React from 'react';
import type { ClientStatus } from '../hooks/useClientStatus';
import api from '../api';

export interface Client {
    id: number;
    name: string;
    octet: number;
    ips: string[];
    public_key: string;
    private_key?: string;
    preshared_key?: string;
    networks: number[];
    keepalive?: number;
    routes: string[];
    enabled: boolean;
    dns_mode: 'default' | 'custom' | 'none';
    dns_servers?: string;
    tags: string[];
    is_full_tunnel?: boolean;
}

export interface Network {
    id: number;
    name: string;
}

interface ClientCardProps {
    client: Client;
    status: ClientStatus | undefined;
    networks: Network[];
    onManageRules: (c: Client) => void;
    onEditSettings: (c: Client) => void;
    onViewConfig: (c: Client) => void;
    onRefresh: () => void;
    onToggleNetwork: (client: Client, networkId: number) => void;
    onDelete: (client: Client) => void;
    onUpdateTags: (client: Client, newTags: string[]) => void;
    hasUncommittedChanges?: boolean;
}

const ClientCard: React.FC<ClientCardProps> = ({
    client,
    status,
    networks,
    onManageRules,
    onEditSettings,
    onViewConfig,
    onRefresh,
    onToggleNetwork,
    onDelete,
    onUpdateTags,
    hasUncommittedChanges
}) => {

    // Tag Editing State
    const [isAddingTag, setIsAddingTag] = React.useState(false);
    const [newTagValue, setNewTagValue] = React.useState('');

    const formatBytes = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    };

    const formatTimeAgo = (timestamp: number) => {
        if (!timestamp) return 'Never';
        const seconds = Math.floor((Date.now() / 1000) - timestamp);
        if (seconds < 60) return `${seconds}s ago`;
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
        return `${Math.floor(seconds / 86400)}d ago`;
    };

    const handleToggleEnabled = async (e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            await api.put(`/clients/${client.id}`, { enabled: !client.enabled });
            onRefresh();
        } catch (err) {
            alert('Failed to update status');
        }
    };

    // Derived Status
    const isOnline = status?.is_active || false;
    const lastSeen = status ? formatTimeAgo(status.latest_handshake) : 'Never';
    const totalRx = status?.transfer_rx || 0;
    const totalTx = status?.transfer_tx || 0;

    return (
        <div className={`
            relative group flex flex-col justify-between
            bg-slate-800 rounded-xl border transition-all duration-200
            ${!client.enabled ? 'opacity-70 border-slate-700' : 'hover:border-slate-500 border-slate-700 shadow-lg hover:shadow-xl hover:-translate-y-1'}
        `}>
            {/* Header / Status Bar */}
            <div className="p-5 pb-2">
                <div className="flex justify-between items-start mb-2">
                    <div>
                        <div className="flex items-center gap-2">
                            <h3 className="text-lg font-bold text-white group-hover:text-blue-400 transition-colors">
                                {client.name}
                            </h3>
                            {/* Status Dot */}
                            {client.enabled && (
                                <div className={`w-2.5 h-2.5 rounded-full ${isOnline ? 'bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.5)]' : 'bg-slate-600'}`}
                                    title={isOnline ? 'Online (Hanshake < 3m ago)' : 'Offline'}
                                />
                            )}

                            {/* Uncommitted Changes Indicator */}
                            {hasUncommittedChanges && (
                                <div className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" title="Uncommitted Changes - Helper: Click Apply Changes in navbar" />
                            )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-400 font-mono mt-0.5">
                            {/* IP Address */}
                            <div className="relative group/ip">
                                <span className="bg-slate-900 px-1.5 py-0.5 rounded text-emerald-500/80 border border-slate-700/50 cursor-help">
                                    {client.networks.length > 1
                                        ? `*.${client.octet}`
                                        : (client.ips[0] || 'No IP')
                                    }
                                </span>

                                {/* IP Popover */}
                                {client.networks.length > 1 && (
                                    <div className="absolute top-full left-0 mt-2 w-48 bg-slate-800 border border-slate-700 rounded-lg shadow-xl p-3 z-20 hidden group-hover/ip:block">
                                        <h4 className="text-[10px] text-slate-500 font-bold uppercase mb-2">Assigned IPs</h4>
                                        <div className="space-y-1">
                                            {client.ips.map(ip => (
                                                <div key={ip} className="text-xs text-slate-300 font-mono bg-slate-900/50 px-2 py-1 rounded">
                                                    {ip}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Last Handshake */}
                            <span>• {lastSeen}</span>
                        </div>
                    </div>

                    {/* Quick Toggle Switch */}
                    <button
                        onClick={handleToggleEnabled}
                        className={`
                            relative w-10 h-5 rounded-full transition-colors duration-200 focus:outline-none ring-offset-2 ring-offset-slate-800 focus:ring-2
                            ${client.enabled ? 'bg-emerald-600 focus:ring-emerald-500' : 'bg-slate-600 focus:ring-slate-500'}
                        `}
                        title={client.enabled ? "Enabled" : "Disabled"}
                    >
                        <span className={`
                            absolute left-1 top-1 w-3 h-3 bg-white rounded-full transition-transform duration-200 shadow-sm
                            ${client.enabled ? 'translate-x-5' : 'translate-x-0'}
                        `} />
                    </button>
                </div>
            </div>

            {/* Body */}
            <div className="px-5 py-2 flex-1">
                {/* Stats Row */}
                {client.enabled && (
                    <div className="grid grid-cols-2 gap-2 mb-4">
                        <div className="bg-slate-900/50 rounded p-2 border border-slate-700/50 flex flex-col">
                            <span className="text-[10px] uppercase text-slate-500 font-bold tracking-wider">Download</span>
                            <span className="text-sm font-mono text-emerald-400">↓ {formatBytes(totalRx)}</span>
                        </div>
                        <div className="bg-slate-900/50 rounded p-2 border border-slate-700/50 flex flex-col">
                            <span className="text-sm font-mono text-blue-400">↑ {formatBytes(totalTx)}</span>
                        </div>
                    </div>
                )}

                {/* Network Toggles */}
                <div className="flex flex-wrap gap-1.5 mb-3">
                    {/* Router Badge */}
                    {(client.routes && client.routes.length > 0) && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-900/30 text-amber-500 border border-amber-900/50">
                            GATEWAY
                        </span>
                    )}

                    {/* Networks */}
                    {networks.map(net => {
                        const isMember = client.networks.includes(net.id);
                        return (
                            <button
                                key={net.id}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onToggleNetwork(client, net.id);
                                }}
                                className={`
                                    inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium transition-colors border
                                    ${isMember
                                        ? 'bg-blue-900/20 text-blue-300 border-blue-900/30 hover:border-blue-500/50'
                                        : 'bg-slate-800 text-slate-500 border-slate-700 hover:border-slate-600'}
                                `}
                                title={isMember ? "Click to leave network" : "Click to join network"}
                            >
                                {net.name}
                            </button>
                        );
                    })}
                </div>

                {/* Tags Row */}
                <div className="flex flex-wrap gap-1.5 min-h-[20px]">
                    {client.tags.length === 0 && !isAddingTag && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setIsAddingTag(true);
                            }}
                            className="text-[10px] text-slate-600 hover:text-slate-400 transition-colors italic"
                        >
                            + Add tag...
                        </button>
                    )}

                    {client.tags.map(tag => (
                        <span key={tag} className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-slate-700/50 text-slate-400 border border-slate-600/50 group/tag hover:border-slate-500 hover:text-slate-300 transition-colors cursor-default">
                            #{tag}
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    const newTags = client.tags.filter(t => t !== tag);
                                    onUpdateTags(client, newTags);
                                }}
                                className="ml-1 text-slate-500 hover:text-red-400 opacity-0 group-hover/tag:opacity-100 transition-opacity"
                                title="Remove tag"
                            >
                                ×
                            </button>
                        </span>
                    ))}

                    {/* Add Tag Button (Inline) */}
                    {isAddingTag ? (
                        <form
                            onSubmit={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                if (newTagValue.trim()) {
                                    const newTag = newTagValue.trim();
                                    if (!client.tags.includes(newTag)) {
                                        onUpdateTags(client, [...client.tags, newTag]);
                                    }
                                }
                                setIsAddingTag(false);
                                setNewTagValue('');
                            }}
                            className="inline-flex items-center"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <input
                                autoFocus
                                type="text"
                                value={newTagValue}
                                onChange={(e) => setNewTagValue(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Escape') {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        // Clear value so blur doesn't save
                                        setNewTagValue('');
                                        setIsAddingTag(false);
                                    }
                                }}
                                onBlur={() => {
                                    if (newTagValue.trim()) {
                                        const newTag = newTagValue.trim();
                                        if (!client.tags.includes(newTag)) {
                                            onUpdateTags(client, [...client.tags, newTag]);
                                        }
                                    }
                                    setIsAddingTag(false);
                                    setNewTagValue('');
                                }}
                                className="w-20 bg-slate-900 border border-slate-600 rounded px-1.5 py-0.5 text-[10px] text-white focus:border-blue-500 outline-none"
                                placeholder="New tag..."
                            />
                        </form>
                    ) : (
                        (client.tags.length > 0) && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setIsAddingTag(true);
                                }}
                                className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-800 text-slate-500 border border-slate-700 border-dashed hover:border-slate-500 hover:text-slate-300 transition-colors"
                                title="Add Tag"
                            >
                                +
                            </button>
                        )
                    )}
                </div>
            </div>

            {/* Footer / Actions */}
            <div className="p-4 border-t border-slate-700/50 bg-slate-900/20 rounded-b-xl flex gap-2">
                <button
                    onClick={() => onViewConfig(client)}
                    className="flex-1 py-1.5 rounded text-xs font-medium bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors border border-slate-600 hover:border-slate-500"
                >
                    Config
                </button>
                <button
                    onClick={() => onManageRules(client)}
                    className="flex-1 py-1.5 rounded text-xs font-medium bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 hover:text-indigo-200 transition-colors border border-indigo-500/30 hover:border-indigo-500/50"
                >
                    Rules
                </button>
                <div className="w-px bg-slate-700/50 mx-1"></div>
                <button
                    onClick={() => onEditSettings(client)}
                    className="p-1.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-400 hover:text-white transition-colors border border-slate-600"
                    title="Settings"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                </button>
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onDelete(client);
                    }}
                    className="p-1.5 rounded bg-slate-700 hover:bg-red-900/80 text-slate-400 hover:text-red-200 transition-colors border border-slate-600 hover:border-red-900"
                    title="Delete Client"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                </button>
            </div>
        </div>
    );
};

export default ClientCard;
