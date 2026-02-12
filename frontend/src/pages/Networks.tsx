import React, { useEffect, useState } from 'react';
import api from '../api';
import NetworkCidrInput from '../components/NetworkCidrInput';

interface Network {
    id: number;
    name: string;
    cidr: string;
    interface_address: string;
}

const Networks: React.FC = () => {
    const [networks, setNetworks] = useState<Network[]>([]);
    const [loading, setLoading] = useState(true);
    const [formData, setFormData] = useState({ name: '', cidr: '', interface_address: '' });

    const [editingId, setEditingId] = useState<number | null>(null);
    const [editName, setEditName] = useState('');

    const fetchNetworks = async () => {
        try {
            const res = await api.get('/networks');
            setNetworks(res.data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleEdit = (net: Network) => {
        setEditingId(net.id);
        setEditName(net.name);
    };

    const handleSaveEdit = async () => {
        if (!editingId) return;
        try {
            await api.put(`/networks/${editingId}`, { name: editName });
            setEditingId(null);
            fetchNetworks();
        } catch (err: any) {
            alert(`Failed to update network: ${err.response?.data?.error || err.message}`);
        }
    };

    useEffect(() => {
        fetchNetworks();
    }, []);

    const handleDelete = async (id: number, name: string) => {
        if (!confirm(`Are you sure you want to delete network "${name}"? This will remove all associated firewall rules and client assignments.`)) return;
        try {
            await api.delete(`/networks/${id}`);
            fetchNetworks();
        } catch (err: any) {
            alert(`Failed to delete network: ${err.response?.data?.error || err.message}`);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await api.post('/networks', formData);
            setFormData({ name: '', cidr: '', interface_address: '' });
            fetchNetworks();
        } catch (err) {
            alert('Failed to create network');
        }
    };

    return (
        <div className="space-y-6">
            <div className="bg-slate-800 p-6 rounded-lg shadow-lg border border-slate-700">
                <h2 className="text-xl font-semibold mb-4 text-emerald-400">Add New Network</h2>
                <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                    <div>
                        <label className="block text-sm text-slate-400 mb-1">Name</label>
                        <input
                            className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white focus:border-emerald-500 outline-none"
                            value={formData.name}
                            onChange={e => setFormData({ ...formData, name: e.target.value })}
                            placeholder="e.g. IoT"
                            required
                        />
                    </div>
                    <div className="md:col-span-2">
                        <NetworkCidrInput
                            cidrValue={formData.cidr}
                            interfaceValue={formData.interface_address}
                            onChange={(cidr, ip) => setFormData({ ...formData, cidr: cidr, interface_address: ip })}
                        />
                    </div>
                    <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white p-2 rounded transition-colors font-medium">
                        Create Zone
                    </button>
                </form>
            </div >

            <div className="bg-slate-800 rounded-lg shadow-lg border border-slate-700 overflow-hidden">
                <h2 className="text-xl font-semibold p-6 border-b border-slate-700 text-slate-100">Active Networks</h2>
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-slate-900 text-slate-400 uppercase text-xs">
                            <tr>
                                <th className="p-4">ID</th>
                                <th className="p-4">Name</th>
                                <th className="p-4">CIDR</th>
                                <th className="p-4">Interface Address</th>
                                <th className="p-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700">
                            {loading ? (
                                <tr><td colSpan={5} className="p-4 text-center text-slate-500">Loading...</td></tr>
                            ) : networks.map(net => (
                                <tr key={net.id} className="hover:bg-slate-700/50 transition-colors">
                                    <td className="p-4 text-slate-500">#{net.id}</td>
                                    <td className="p-4 font-medium text-slate-200">
                                        {editingId === net.id ? (
                                            <input
                                                className="bg-slate-900 border border-slate-700 rounded p-1 text-white focus:border-emerald-500 outline-none w-full"
                                                value={editName}
                                                onChange={e => setEditName(e.target.value)}
                                                autoFocus
                                            />
                                        ) : (
                                            net.name
                                        )}
                                    </td>
                                    <td className="p-4 font-mono text-emerald-400">{net.cidr}</td>
                                    <td className="p-4 font-mono text-blue-400">{net.interface_address}</td>
                                    <td className="p-4 text-right space-x-3">
                                        {editingId === net.id ? (
                                            <>
                                                <button
                                                    onClick={handleSaveEdit}
                                                    className="text-emerald-400 hover:text-emerald-300 text-sm font-medium transition-colors"
                                                >
                                                    Save
                                                </button>
                                                <button
                                                    onClick={() => setEditingId(null)}
                                                    className="text-slate-400 hover:text-slate-300 text-sm font-medium transition-colors"
                                                >
                                                    Cancel
                                                </button>
                                            </>
                                        ) : (
                                            <>
                                                <button
                                                    onClick={() => handleEdit(net)}
                                                    className="text-blue-400 hover:text-blue-300 text-sm font-medium transition-colors"
                                                >
                                                    Edit
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(net.id, net.name)}
                                                    className="text-red-400 hover:text-red-300 text-sm font-medium transition-colors"
                                                >
                                                    Delete
                                                </button>
                                            </>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            {!loading && networks.length === 0 && (
                                <tr><td colSpan={5} className="p-4 text-center text-slate-500">No networks found.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div >
    );
};

export default Networks;
