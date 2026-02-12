
import React, { useState } from 'react';
import api from '../api';
import type { Client } from './ClientCard';

interface ClientDetailsModalProps {
    client: Client;
    onClose: () => void;
    onSave: () => void;
}

const ClientDetailsModal: React.FC<ClientDetailsModalProps> = ({ client, onClose, onSave }) => {
    const [useKeepalive, setUseKeepalive] = useState(!!client.keepalive);
    const [keepalive, setKeepalive] = useState(client.keepalive || 25);
    const [isRouter, setIsRouter] = useState((client.routes && client.routes.length > 0));
    const [routedCidrs, setRoutedCidrs] = useState(client.routes ? client.routes.join(', ') : '');

    const [dnsMode, setDnsMode] = useState<'default' | 'custom' | 'none'>(client.dns_mode || 'default');
    const [customDns, setCustomDns] = useState(client.dns_servers || '');

    // Advanced Keys
    const [showKeyEdit, setShowKeyEdit] = useState(false);
    const [privateKey, setPrivateKey] = useState(client.private_key || '');
    const [publicKey, setPublicKey] = useState(client.public_key || '');
    const [presharedKey, setPresharedKey] = useState(client.preshared_key || '');

    const handleGeneratePublicKey = async () => {
        if (!privateKey) {
            alert('Please enter a private key first');
            return;
        }
        try {
            const res = await api.post('/tools/derive_public_key', { private_key: privateKey });
            setPublicKey(res.data.public_key);
        } catch (err: any) {
            alert('Failed to generate public key: ' + (err.response?.data?.error || err.message));
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const routes = isRouter && routedCidrs.trim() ? routedCidrs.split(',').map(s => s.trim()) : [];
            const payload: any = {
                keepalive: useKeepalive ? keepalive : null,
                routes: routes,
                dns_mode: dnsMode,
                dns_servers: dnsMode === 'custom' ? customDns : null
            };

            // Only send keys if they changed/are being edited
            if (showKeyEdit) {
                if (privateKey) payload.private_key = privateKey;
                if (publicKey) payload.public_key = publicKey;
                if (presharedKey) payload.preshared_key = presharedKey;
            }

            await api.put(`/clients/${client.id}`, payload);
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
                            <label className="flex items-start gap-2 text-sm text-slate-300 cursor-pointer">
                                <input
                                    type="radio"
                                    name="dnsMode"
                                    value="default"
                                    checked={dnsMode === 'default'}
                                    onChange={() => setDnsMode('default')}
                                    className="mt-1 text-emerald-500 focus:ring-emerald-500"
                                />
                                Use WireGuard server IPs as DNS
                            </label>

                            <label className="flex items-start gap-2 text-sm text-slate-300 cursor-pointer">
                                <input
                                    type="radio"
                                    name="dnsMode"
                                    value="custom"
                                    checked={dnsMode === 'custom'}
                                    onChange={() => setDnsMode('custom')}
                                    className="mt-1 text-blue-500 focus:ring-blue-500"
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

                            <label className="flex items-start gap-2 text-sm text-slate-300 cursor-pointer">
                                <input
                                    type="radio"
                                    name="dnsMode"
                                    value="none"
                                    checked={dnsMode === 'none'}
                                    onChange={() => setDnsMode('none')}
                                    className="mt-1 text-slate-500 focus:ring-slate-500"
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



                    {/* Key Editing Section */}
                    <div className="border-t border-slate-700 pt-4">
                        <label className="flex items-center gap-2 text-sm text-slate-300 mb-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={showKeyEdit}
                                onChange={e => setShowKeyEdit(e.target.checked)}
                                className="rounded bg-slate-700 border-slate-600 text-amber-500 focus:ring-amber-500"
                            />
                            <span className="font-semibold text-amber-400">Edit Keys (Advanced)</span>
                        </label>
                        {showKeyEdit && (
                            <div className="space-y-3 bg-red-900/20 p-4 rounded border border-red-900/50">
                                <div className="text-xs text-red-200 mb-2">
                                    <strong>DANGER:</strong> Changing keys will break the client's current connection immediately. They must download and apply the new config.
                                </div>

                                <div>
                                    <label className="block text-xs text-slate-400 mb-1">Private Key</label>
                                    <div className="flex gap-2">
                                        <input
                                            value={privateKey}
                                            onChange={e => setPrivateKey(e.target.value)}
                                            className="flex-1 bg-slate-800 border border-slate-600 rounded p-1.5 text-xs text-white outline-none font-mono"
                                            placeholder="Private Key (hidden)"
                                        />
                                        <button
                                            type="button"
                                            onClick={handleGeneratePublicKey}
                                            className="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-xs text-slate-200 rounded border border-slate-600 transition-colors"
                                            title="Generate Public Key"
                                        >
                                            Gen PubKey
                                        </button>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs text-slate-400 mb-1">Public Key</label>
                                    <input
                                        value={publicKey}
                                        onChange={e => setPublicKey(e.target.value)}
                                        className="w-full bg-slate-800 border border-slate-600 rounded p-1.5 text-xs text-white outline-none font-mono"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs text-slate-400 mb-1">Preshared Key</label>
                                    <input
                                        value={presharedKey}
                                        onChange={e => setPresharedKey(e.target.value)}
                                        className="w-full bg-slate-800 border border-slate-600 rounded p-1.5 text-xs text-white outline-none font-mono"
                                    />
                                </div>
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

export default ClientDetailsModal;
