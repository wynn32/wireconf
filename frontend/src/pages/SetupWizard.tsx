import React, { useState, useEffect } from 'react';
import api from '../api';

interface Network {
    id: number;
    name: string;
    cidr: string;
}

interface Client {
    id: number;
    name: string;
    octet: number;
}

const SetupWizard: React.FC<{ onComplete: () => void }> = ({ onComplete }) => {
    const [step, setStep] = useState(1);
    const [installing, setInstalling] = useState(false);
    const [installed, setInstalled] = useState(false);

    // Step 2: Server Configuration
    const [serverEndpoint, setServerEndpoint] = useState('');
    const [serverPort, setServerPort] = useState('51820');
    const [serverPublicKey, setServerPublicKey] = useState('');

    // Step 3: Networks
    const [networks, setNetworks] = useState<Network[]>([]);
    const [newNetworkName, setNewNetworkName] = useState('');
    const [newNetworkCidr, setNewNetworkCidr] = useState('');
    const [newNetworkInterface, setNewNetworkInterface] = useState('');

    // Step 4: Clients
    const [clients, setClients] = useState<Client[]>([]);
    const [newClientName, setNewClientName] = useState('');
    const [selectedNetworks, setSelectedNetworks] = useState<number[]>([]);

    const [completing, setCompleting] = useState(false);

    useEffect(() => {
        checkInstallStatus();
    }, []);

    const checkInstallStatus = async () => {
        try {
            const res = await api.get('/setup/status');
            setInstalled(res.data.installed);
            if (res.data.installed) {
                setStep(2);
            }
        } catch (err) {
            console.error('Failed to check install status', err);
        }
    };

    const handleInstall = async () => {
        setInstalling(true);
        try {
            await api.post('/setup/install');
            setInstalled(true);
            setTimeout(() => setInstalling(false), 1000);
        } catch (err) {
            alert('Installation marking failed. Please run install.sh manually.');
            setInstalling(false);
        }
    };

    const handleServerConfig = async () => {
        if (!serverEndpoint.trim()) {
            alert('Please enter a server endpoint');
            return;
        }

        try {
            const res = await api.post('/setup/server', {
                endpoint: serverEndpoint,
                port: parseInt(serverPort)
            });
            setServerPublicKey(res.data.public_key);
            setStep(3);
        } catch (err: any) {
            alert(err.response?.data?.error || 'Failed to configure server');
        }
    };

    const handleCreateNetwork = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await api.post('/networks', {
                name: newNetworkName,
                cidr: newNetworkCidr,
                interface_address: newNetworkInterface
            });

            // Refresh networks
            const res = await api.get('/networks');
            setNetworks(res.data);

            setNewNetworkName('');
            setNewNetworkCidr('');
            setNewNetworkInterface('');
        } catch (err) {
            alert('Failed to create network');
        }
    };

    const handleCreateClient = async (e: React.FormEvent) => {
        e.preventDefault();
        if (selectedNetworks.length === 0) {
            alert('Please select at least one network');
            return;
        }

        try {
            await api.post('/clients', {
                name: newClientName,
                networks: selectedNetworks
            });

            // Refresh clients
            const res = await api.get('/clients');
            setClients(res.data);

            setNewClientName('');
            setSelectedNetworks([]);
        } catch (err) {
            alert('Failed to create client');
        }
    };

    const handleComplete = async () => {
        setCompleting(true);
        try {
            await api.post('/setup/complete');
            onComplete();
        } catch (err: any) {
            alert(err.response?.data?.error || 'Failed to complete setup');
            setCompleting(false);
        }
    };

    const toggleNetwork = (id: number) => {
        setSelectedNetworks(prev =>
            prev.includes(id) ? prev.filter(n => n !== id) : [...prev, id]
        );
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-6">
            <div className="bg-slate-800 rounded-2xl shadow-2xl w-full max-w-3xl border border-slate-700">
                {/* Header */}
                <div className="bg-gradient-to-r from-emerald-600 to-blue-600 p-6 rounded-t-2xl">
                    <h1 className="text-3xl font-bold text-white">WireGuard Setup Wizard</h1>
                    <p className="text-emerald-100 mt-2">Step {step} of 5</p>
                </div>

                {/* Progress Bar */}
                <div className="bg-slate-900 h-2">
                    <div
                        className="bg-emerald-500 h-full transition-all duration-300"
                        style={{ width: `${(step / 5) * 100}%` }}
                    />
                </div>

                {/* Content */}
                <div className="p-8">
                    {/* Step 1: Installation */}
                    {step === 1 && (
                        <div className="space-y-6">
                            <h2 className="text-2xl font-bold text-white">Welcome!</h2>
                            <p className="text-slate-300">
                                This wizard will help you set up your WireGuard VPN server. We'll install dependencies,
                                configure your server, and create your first network and client.
                            </p>

                            <div className="bg-slate-900 rounded-lg p-6 border border-slate-700">
                                <h3 className="text-lg font-semibold text-white mb-3">System Dependencies</h3>
                                <ul className="text-slate-300 space-y-2">
                                    <li>✓ WireGuard</li>
                                    <li>✓ iptables</li>
                                    <li>✓ IP forwarding</li>
                                </ul>
                            </div>

                            {!installed ? (
                                <div className="bg-amber-900/30 border border-amber-700 rounded-lg p-4">
                                    <p className="text-amber-200 mb-4">
                                        <strong>Action Required:</strong> Please run the installer script:
                                    </p>
                                    <code className="bg-slate-900 text-emerald-400 px-3 py-2 rounded block">
                                        sudo ./install.sh
                                    </code>
                                    <p className="text-amber-200 mt-4 text-sm">
                                        After running the script, click the button below to continue.
                                    </p>
                                </div>
                            ) : (
                                <div className="bg-emerald-900/30 border border-emerald-700 rounded-lg p-4">
                                    <p className="text-emerald-200">
                                        ✓ System dependencies are installed!
                                    </p>
                                </div>
                            )}

                            <div className="flex justify-between">
                                <div></div>
                                {installed ? (
                                    <button
                                        onClick={() => setStep(2)}
                                        className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2 rounded-lg font-medium"
                                    >
                                        Next →
                                    </button>
                                ) : (
                                    <button
                                        onClick={handleInstall}
                                        disabled={installing}
                                        className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium disabled:opacity-50"
                                    >
                                        {installing ? 'Checking...' : 'I ran the installer'}
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Step 2: Server Configuration */}
                    {step === 2 && (
                        <div className="space-y-6">
                            <h2 className="text-2xl font-bold text-white">Server Configuration</h2>
                            <p className="text-slate-300">
                                Configure your WireGuard server's public endpoint and port.
                            </p>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm text-slate-400 mb-2">
                                        Server Public IP or Domain
                                    </label>
                                    <input
                                        type="text"
                                        value={serverEndpoint}
                                        onChange={e => setServerEndpoint(e.target.value)}
                                        placeholder="e.g. vpn.example.com or 203.0.113.1"
                                        className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white focus:border-emerald-500 outline-none"
                                    />
                                    <p className="text-xs text-slate-500 mt-1">
                                        This is the address clients will use to connect
                                    </p>
                                </div>

                                <div>
                                    <label className="block text-sm text-slate-400 mb-2">
                                        WireGuard Port
                                    </label>
                                    <input
                                        type="number"
                                        value={serverPort}
                                        onChange={e => setServerPort(e.target.value)}
                                        className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white focus:border-emerald-500 outline-none"
                                    />
                                </div>

                                {serverPublicKey && (
                                    <div className="bg-slate-900 rounded-lg p-4 border border-slate-700">
                                        <label className="block text-sm text-slate-400 mb-2">
                                            Server Public Key (Generated)
                                        </label>
                                        <code className="text-emerald-400 text-sm break-all">
                                            {serverPublicKey}
                                        </code>
                                    </div>
                                )}
                            </div>

                            <div className="flex justify-between">
                                <button
                                    onClick={() => setStep(1)}
                                    className="text-slate-400 hover:text-white px-6 py-2"
                                >
                                    ← Back
                                </button>
                                <button
                                    onClick={handleServerConfig}
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2 rounded-lg font-medium"
                                >
                                    Next →
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Step 3: Create Network */}
                    {step === 3 && (
                        <div className="space-y-6">
                            <h2 className="text-2xl font-bold text-white">Create Your First Network</h2>
                            <p className="text-slate-300">
                                Create at least one network (subnet) for your VPN.
                            </p>

                            <form onSubmit={handleCreateNetwork} className="space-y-4">
                                <div>
                                    <label className="block text-sm text-slate-400 mb-2">Network Name</label>
                                    <input
                                        type="text"
                                        value={newNetworkName}
                                        onChange={e => setNewNetworkName(e.target.value)}
                                        placeholder="e.g. main-network"
                                        className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white focus:border-emerald-500 outline-none"
                                        required
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm text-slate-400 mb-2">CIDR</label>
                                    <input
                                        type="text"
                                        value={newNetworkCidr}
                                        onChange={e => setNewNetworkCidr(e.target.value)}
                                        placeholder="e.g. 10.0.1.0/24"
                                        className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white focus:border-emerald-500 outline-none"
                                        required
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm text-slate-400 mb-2">Server Interface Address</label>
                                    <input
                                        type="text"
                                        value={newNetworkInterface}
                                        onChange={e => setNewNetworkInterface(e.target.value)}
                                        placeholder="e.g. 10.0.1.1/24"
                                        className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white focus:border-emerald-500 outline-none"
                                        required
                                    />
                                </div>

                                <button
                                    type="submit"
                                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg"
                                >
                                    + Add Network
                                </button>
                            </form>

                            {networks.length > 0 && (
                                <div className="bg-slate-900 rounded-lg p-4 border border-slate-700">
                                    <h3 className="text-white font-semibold mb-3">Created Networks</h3>
                                    <div className="space-y-2">
                                        {networks.map(net => (
                                            <div key={net.id} className="text-slate-300 text-sm">
                                                ✓ {net.name} ({net.cidr})
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="flex justify-between">
                                <button
                                    onClick={() => setStep(2)}
                                    className="text-slate-400 hover:text-white px-6 py-2"
                                >
                                    ← Back
                                </button>
                                <button
                                    onClick={() => setStep(4)}
                                    disabled={networks.length === 0}
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    Next →
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Step 4: Create Client */}
                    {step === 4 && (
                        <div className="space-y-6">
                            <h2 className="text-2xl font-bold text-white">Create Your First Client</h2>
                            <p className="text-slate-300">
                                Create at least one client to connect to your VPN.
                            </p>

                            <form onSubmit={handleCreateClient} className="space-y-4">
                                <div>
                                    <label className="block text-sm text-slate-400 mb-2">Client Name</label>
                                    <input
                                        type="text"
                                        value={newClientName}
                                        onChange={e => setNewClientName(e.target.value)}
                                        placeholder="e.g. my-laptop"
                                        className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white focus:border-emerald-500 outline-none"
                                        required
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm text-slate-400 mb-2">Assign to Networks</label>
                                    <div className="flex flex-wrap gap-2">
                                        {networks.map(net => (
                                            <button
                                                key={net.id}
                                                type="button"
                                                onClick={() => toggleNetwork(net.id)}
                                                className={`px-3 py-1 rounded text-sm transition-all ${selectedNetworks.includes(net.id)
                                                    ? 'bg-blue-600 text-white'
                                                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                                                    }`}
                                            >
                                                {net.name}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <button
                                    type="submit"
                                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg"
                                >
                                    + Add Client
                                </button>
                            </form>

                            {clients.length > 0 && (
                                <div className="bg-slate-900 rounded-lg p-4 border border-slate-700">
                                    <h3 className="text-white font-semibold mb-3">Created Clients</h3>
                                    <div className="space-y-2">
                                        {clients.map(client => (
                                            <div key={client.id} className="text-slate-300 text-sm">
                                                ✓ {client.name} (Octet: {client.octet})
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="flex justify-between">
                                <button
                                    onClick={() => setStep(3)}
                                    className="text-slate-400 hover:text-white px-6 py-2"
                                >
                                    ← Back
                                </button>
                                <button
                                    onClick={() => setStep(5)}
                                    disabled={clients.length === 0}
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    Next →
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Step 5: Review & Complete */}
                    {step === 5 && (
                        <div className="space-y-6">
                            <h2 className="text-2xl font-bold text-white">Review & Complete</h2>
                            <p className="text-slate-300">
                                Review your configuration and complete the setup.
                            </p>

                            <div className="space-y-4">
                                <div className="bg-slate-900 rounded-lg p-4 border border-slate-700">
                                    <h3 className="text-white font-semibold mb-2">Server Configuration</h3>
                                    <div className="text-slate-300 text-sm space-y-1">
                                        <p>Endpoint: {serverEndpoint}:{serverPort}</p>
                                        <p className="font-mono text-xs break-all">Public Key: {serverPublicKey}</p>
                                    </div>
                                </div>

                                <div className="bg-slate-900 rounded-lg p-4 border border-slate-700">
                                    <h3 className="text-white font-semibold mb-2">Networks ({networks.length})</h3>
                                    <div className="text-slate-300 text-sm space-y-1">
                                        {networks.map(net => (
                                            <p key={net.id}>• {net.name} - {net.cidr}</p>
                                        ))}
                                    </div>
                                </div>

                                <div className="bg-slate-900 rounded-lg p-4 border border-slate-700">
                                    <h3 className="text-white font-semibold mb-2">Clients ({clients.length})</h3>
                                    <div className="text-slate-300 text-sm space-y-1">
                                        {clients.map(client => (
                                            <p key={client.id}>• {client.name}</p>
                                        ))}
                                    </div>
                                </div>

                                <div className="bg-blue-900/30 border border-blue-700 rounded-lg p-4">
                                    <p className="text-blue-200 text-sm">
                                        <strong>What happens next?</strong><br />
                                        • Firewall rule will be added for port {serverPort}<br />
                                        • Setup will be marked as complete<br />
                                        • You'll be redirected to the main dashboard
                                    </p>
                                </div>
                            </div>

                            <div className="flex justify-between">
                                <button
                                    onClick={() => setStep(4)}
                                    className="text-slate-400 hover:text-white px-6 py-2"
                                    disabled={completing}
                                >
                                    ← Back
                                </button>
                                <button
                                    onClick={handleComplete}
                                    disabled={completing}
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-3 rounded-lg font-bold text-lg disabled:opacity-50"
                                >
                                    {completing ? 'Completing...' : 'Complete Setup ✓'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SetupWizard;
