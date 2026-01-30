import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import api from '../api';

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const location = useLocation();
    const [committing, setCommitting] = useState(false);
    const [statusMsg, setStatusMsg] = useState('');

    const handleCommit = async () => {
        setCommitting(true);
        setStatusMsg('Committing...');
        try {
            const res = await api.post('/commit');
            setStatusMsg(`Success: ${res.data.status}`);
            setTimeout(() => setStatusMsg(''), 3000);
        } catch (err: any) {
            setStatusMsg(`Error: ${err.message}`);
        } finally {
            setCommitting(false);
        }
    };

    const navClass = (path: string) =>
        `px-4 py-2 rounded-md transition-colors ${location.pathname === path
            ? 'bg-blue-600 text-white'
            : 'text-gray-300 hover:bg-slate-700'
        }`;

    return (
        <div className="min-h-screen bg-slate-900 text-slate-100 font-sans">
            <nav className="bg-slate-800 border-b border-slate-700 p-4 sticky top-0 z-50 shadow-lg">
                <div className="container mx-auto flex justify-between items-center">
                    <div className="flex items-center space-x-6">
                        <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-emerald-400">
                            WireGuard Manager
                        </h1>
                        <div className="space-x-2">
                            <Link to="/clients" className={navClass('/clients')}>Clients</Link>
                            <Link to="/networks" className={navClass('/networks')}>Networks</Link>
                        </div>
                    </div>
                    <div className="flex items-center space-x-4">
                        {statusMsg && (
                            <span className={`text-sm ${statusMsg.startsWith('Error') ? 'text-red-400' : 'text-emerald-400'}`}>
                                {statusMsg}
                            </span>
                        )}
                        <button
                            onClick={handleCommit}
                            disabled={committing}
                            className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-600 text-white px-4 py-2 rounded-lg font-medium transition-all shadow-md active:scale-95"
                        >
                            {committing ? 'Applying...' : 'Commit Changes'}
                        </button>
                    </div>
                </div>
            </nav>
            <main className="container mx-auto p-6">
                {children}
            </main>
        </div>
    );
};

export default Layout;
