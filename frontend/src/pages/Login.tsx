import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';

export default function Login() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        try {
            // `api` is an axios instance with baseURL set to include `/api`.
            const res = await api.post('/auth/login', { username, password });

            // axios responses expose parsed body as `data` and status on `status`.
            if (res.status >= 200 && res.status < 300) {
                // Successful login: navigate and reload so App mounts and refreshes /me
                navigate('/');
                window.location.reload();
            } else {
                setError(res.data?.error || 'Invalid credentials');
            }
        } catch (err: any) {
            // Prefer error message from server when available
            setError(err?.response?.data?.error || 'Login request failed');
        }
    }

    return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center px-4">
            <div className="max-w-md w-full bg-slate-800 p-8 rounded-lg shadow-2xl border border-slate-700">
                <div className="text-center mb-8">
                    <h2 className="text-3xl font-bold text-white tracking-tight">WireGuard Manager</h2>
                    <p className="mt-2 text-slate-400">Sign in to manage your VPN</p>
                </div>

                {error && (
                    <div className="bg-red-500/10 border border-red-500/50 text-red-200 p-3 mb-6 rounded text-sm text-center">
                        {error}
                    </div>
                )}

                <form onSubmit={handleLogin} className="space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">Username</label>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                            placeholder="Enter username"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">Password</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                            placeholder="Enter password"
                            required
                        />
                    </div>

                    <button
                        type="submit"
                        className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2.5 rounded transition-colors shadow-lg shadow-indigo-500/20"
                    >
                        Sign In
                    </button>
                </form>
            </div>
        </div>
    )
}
