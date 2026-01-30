import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import api from '../api';
import CommitModal from './CommitModal';
import { useAuth } from '../AuthContext';

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const location = useLocation();
    const { user, logout, hasPermission } = useAuth();

    const [statusMsg, setStatusMsg] = useState('');
    const [showCommitModal, setShowCommitModal] = useState(false);

    // Safety Mechanism State
    const [safetyState, setSafetyState] = useState<'idle' | 'committing' | 'verifying' | 'reverting'>('idle');
    const [countdown, setCountdown] = useState(60);

    // If on login page or not logged in, don't show Nav (unless we want to show a simple header)
    // Actually, if we are in Layout but user is null, we should probably just render children (Login page).
    if (!user) {
        return <div className="min-h-screen bg-slate-900 text-slate-100 font-sans">{children}</div>;
    }

    const handleConfirmCommit = async (useSafety: boolean) => {
        setShowCommitModal(false);
        setSafetyState('committing');
        setStatusMsg(useSafety ? 'Applying changes...' : 'Applying changes (Safety Bypass)...');

        try {
            // 1. Commit and get Transaction ID from server
            const res = await api.post('/commit', { use_safety: useSafety });
            const transactionId = res.data.transaction_id;

            if (!transactionId) {
                setSafetyState('idle');
                setStatusMsg('Success: ' + res.data.status);
                setTimeout(() => setStatusMsg(''), 3000);
                return;
            }

            // 2. Start Verification Loop
            setSafetyState('verifying');
            setStatusMsg('Verifying connectivity...');
            setCountdown(60);

            const start = Date.now();
            const verifyLoop = setInterval(async () => {
                const now = Date.now();
                const elapsed = (now - start) / 1000;
                setCountdown(Math.floor(60 - elapsed));

                if (elapsed > 60) {
                    clearInterval(verifyLoop);
                    setSafetyState('reverting');
                    setStatusMsg('Connection lost. Changes reverted.');
                    setTimeout(() => setSafetyState('idle'), 5000);
                    return;
                }

                try {
                    // Ping check
                    await api.get('/setup/status', { timeout: 2000 });

                    // If success, confirm!
                    await api.post('/commit/confirm', { transaction_id: transactionId });
                    clearInterval(verifyLoop);

                    setSafetyState('idle');
                    setStatusMsg('Changes applied successfully!');
                    setTimeout(() => setStatusMsg(''), 3000);
                } catch (e) {
                    // Ignore transient failures, keep retrying until timeout
                    console.log("Ping failed, retrying...");
                }
            }, 2000);

        } catch (err: any) {
            setSafetyState('idle');
            if (err.response?.status === 409) {
                setStatusMsg('Global lock held. Please try again after the current verification finishes.');
            } else {
                setStatusMsg(`Error: ${err.message}`);
            }
            setTimeout(() => setStatusMsg(''), 5000);
        }
    };

    const handleCancelRevert = async () => {
        // User explicitly cancels verification -> Revert immediately
        try {
            await api.post('/commit/cancel');
            setSafetyState('reverting');
            setStatusMsg('Reverting changes...');
            setTimeout(() => {
                setSafetyState('idle');
                setStatusMsg('Reverted.');
            }, 3000);
        } catch (e) {
            console.error(e);
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
                        <div className="space-x-2 flex items-center">
                            <Link to="/clients" className={navClass('/clients')}>Clients</Link>
                            <Link to="/status" className={navClass('/status')}>Live Status</Link>
                            <Link to="/networks" className={navClass('/networks')}>Networks</Link>
                            <Link to="/topology" className={navClass('/topology')}>Topology</Link>
                            <Link to="/settings" className={navClass('/settings')}>Settings</Link>

                            {hasPermission('GLOBAL', null, 'MANAGE_USERS') && (
                                <>
                                    <Link to="/users" className={navClass('/users')}>Users</Link>
                                    <Link to="/presets" className={navClass('/presets')}>Presets</Link>
                                </>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center space-x-4">
                        <div className="text-right mr-2 hidden md:block">
                            <div className="text-xs text-slate-400">Logged in as</div>
                            <div className="font-bold text-sm text-indigo-400">{user.username}</div>
                        </div>

                        <button
                            onClick={() => logout()}
                            className="text-slate-400 hover:text-white text-sm bg-slate-700 hover:bg-slate-600 px-3 py-1.5 rounded transition-colors"
                        >
                            Logout
                        </button>

                        {statusMsg && (
                            <span className={`text-sm ${statusMsg.startsWith('Error') ? 'text-red-400' : 'text-emerald-400'}`}>
                                {statusMsg}
                            </span>
                        )}
                        <button
                            onClick={() => setShowCommitModal(true)}
                            disabled={safetyState !== 'idle'}
                            className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-600 text-white px-4 py-2 rounded-lg font-medium transition-all shadow-md active:scale-95"
                        >
                            {safetyState !== 'idle' ? 'Applying...' : 'Commit Changes'}
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
            {safetyState === 'verifying' && (
                <div className="fixed inset-0 bg-black/80 flex flex-col items-center justify-center z-[200] backdrop-blur text-center p-4">
                    <div className="bg-slate-800 p-8 rounded-2xl shadow-2xl border border-slate-600 max-w-md w-full">
                        <div className="text-4xl mb-4">📡</div>
                        <h2 className="text-2xl font-bold text-white mb-2">Verifying Connectivity</h2>
                        <p className="text-slate-300 mb-6">
                            Checking if you can still access the server...
                        </p>

                        <div className="text-6xl font-mono text-emerald-400 mb-8 font-bold">
                            {countdown}s
                        </div>

                        <p className="text-sm text-slate-400 mb-6">
                            If connection is lost, previous changes will be automatically restored when timer expires.
                        </p>

                        <button
                            onClick={handleCancelRevert}
                            className="bg-red-900/50 hover:bg-red-900/80 text-red-200 border border-red-800 px-6 py-3 rounded-lg w-full transition-colors"
                        >
                            Cancel & Revert Now
                        </button>
                    </div>
                </div>
            )}

            {safetyState === 'reverting' && (
                <div className="fixed inset-0 bg-black/90 flex flex-col items-center justify-center z-[200] text-center p-4">
                    <div className="text-red-500 text-5xl mb-4">⚠️</div>
                    <h2 className="text-3xl font-bold text-white mb-2">Reverting Changes</h2>
                    <p className="text-slate-400">Restoring last known good configuration...</p>
                </div>
            )}

            <main className="container mx-auto p-6">
                {children}
            </main>
        </div>
    );
};

export default Layout;
