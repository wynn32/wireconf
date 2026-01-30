import React, { useState } from 'react';
import api from '../api';

interface Network {
    id: number;
    name: string;
}

interface ClientCreateModalProps {
    networks: Network[];
    onClose: () => void;
    onSuccess: () => void;
}

const ClientCreateModal: React.FC<ClientCreateModalProps> = ({ networks, onClose, onSuccess }) => {
    const [name, setName] = useState('');
    const [selectedNets, setSelectedNets] = useState<number[]>([]);

    // DNS Configuration
    const [dnsMode, setDnsMode] = useState<'default' | 'custom' | 'none'>('default');
    const [customDns, setCustomDns] = useState('');

    // Advanced Options
    const [useKeepalive, setUseKeepalive] = useState(false);
    const [keepalive, setKeepalive] = useState(25);

    const [isRouter, setIsRouter] = useState(false);
    const [routedCidrs, setRoutedCidrs] = useState('');

    const toggleNet = (id: number) => {
        setSelectedNets(prev =>
            prev.includes(id) ? prev.filter(n => n !== id) : [...prev, id]
        );
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const routes = isRouter && routedCidrs.trim() ? routedCidrs.split(',').map(s => s.trim()) : [];
            const payload: any = {
                name,
                networks: selectedNets,
                keepalive: useKeepalive ? keepalive : undefined,
                routes: routes,
                dns_mode: dnsMode,
                dns_servers: dnsMode === 'custom' ? customDns : null
            };

            await api.post('/clients', payload);
            onSuccess();
            onClose();
        } catch (err) {
            alert('Failed to create client');
        }
    };

    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 backdrop-blur-sm">
            <div className="bg-slate-800 rounded-lg shadow-2xl w-full max-w-2xl p-6 border border-slate-700 max-h-[90vh] overflow-y-auto">
                <h3 className="text-2xl font-bold text-emerald-400 mb-6">Create New Client</h3>
                <form onSubmit={handleSubmit} className="space-y-5">
                    {/* Name */}
                    <div>
                        <label className="block text-sm text-slate-400 mb-1">Client Name</label>
                        <input
                            className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white focus:border-emerald-500 outline-none"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="e.g. users-iphone"
                            required
                        />
                    </div>

                    {/* Networks */}
                    <div>
                        <label className="block text-sm text-slate-400 mb-2">Assign to Networks</label>
                        <div className="flex flex-wrap gap-2">
                            {networks.map(net => (
                                <button
                                    type="button"
                                    key={net.id}
                                    onClick={() => toggleNet(net.id)}
                                    className={`px-3 py-1 rounded text-sm font-medium transition-all ${selectedNets.includes(net.id)
                                        ? 'bg-blue-600 text-white shadow-lg scale-105'
                                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                                        }`}
                                >
                                    {net.name}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* DNS Configuration */}
                    <div className="border-t border-slate-700 pt-4">
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
                                Use WireGuard server IPs as DNS (default)
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
                                            placeholder="e.g. 8.8.8.8, 8.8.4.4, 1.1.1.1"
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
                                No DNS configuration (omit DNS block)
                            </label>
                        </div>
                    </div>

                    {/* Advanced Options */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-700">
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
                                        placeholder="e.g. 192.168.1.0/24, 172.16.0.0/16"
                                    />
                                    <span className="text-[10px] text-slate-500 mt-1">Comma separated CIDRs behind this client</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex justify-end gap-3 pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2 rounded transition-colors font-medium"
                        >
                            Create Client
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ClientCreateModal;
