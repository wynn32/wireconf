import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import api from '../api';
import CommitModal from './CommitModal';

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const location = useLocation();
    const [committing, setCommitting] = useState(false);
    const [statusMsg, setStatusMsg] = useState('');
    const [showCommitModal, setShowCommitModal] = useState(false);

    const handleConfirmCommit = async () => {
        setShowCommitModal(false);
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
                        <Link to="/" className="group">
                            <img src="/logo.svg" alt="WireConf" className="h-10 transition-transform group-hover:scale-105" />
                        </Link>
                        <div className="space-x-2">
                            <Link to="/clients" className={navClass('/clients')}>Clients</Link>
                            <Link to="/networks" className={navClass('/networks')}>Networks</Link>
                            <Link to="/topology" className={navClass('/topology')}>Topology</Link>
                            <Link to="/settings" className={navClass('/settings')}>Settings</Link>
                        </div>
                    </div>
                    <div className="flex items-center space-x-4">
                        {statusMsg && (
                            <span className={`text-sm ${statusMsg.startsWith('Error') ? 'text-red-400' : 'text-emerald-400'}`}>
                                {statusMsg}
                            </span>
                        )}
                        <button
                            onClick={() => setShowCommitModal(true)}
                            disabled={committing}
                            className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-600 text-white px-4 py-2 rounded-lg font-medium transition-all shadow-md active:scale-95"
                        >
                            {committing ? 'Applying...' : 'Commit Changes'}
                        </button>
                    </div>
                </div>
            </nav>

            {showCommitModal && (
                <CommitModal
                    onClose={() => setShowCommitModal(false)}
                    onConfirm={handleConfirmCommit}
                />
            )}
            <main className="container mx-auto p-6">
                {children}
            </main>
        </div>
    );
};

export default Layout;
