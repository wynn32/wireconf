import React, { useState, useRef } from 'react';
import api from '../api';

interface ImportModalProps {
    onClose: () => void;
    onSuccess: () => void;
}

const ImportModal: React.FC<ImportModalProps> = ({ onClose, onSuccess }) => {
    const [file, setFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [stats, setStats] = useState<any>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [showConfirmPurge, setShowConfirmPurge] = useState(false);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            setFile(e.target.files[0]);
            setStats(null);
            setShowConfirmPurge(false);
        }
    };

    const handleImport = async (forcePurge: boolean = false) => {
        if (!file) return;

        setUploading(true);
        const formData = new FormData();
        formData.append('file', file);

        try {
            const url = forcePurge ? '/import?force_purge=true' : '/import';
            const res = await api.post(url, formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            });

            if (res.data.status === 'mismatch') {
                setShowConfirmPurge(true);
                setUploading(false);
                return;
            }

            setStats(res.data.stats);
            setShowConfirmPurge(false);
        } catch (err: any) {
            alert('Import failed: ' + (err.response?.data?.error || err.message));
        } finally {
            setUploading(false);
        }
    };

    const handleFinish = () => {
        onSuccess();
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 backdrop-blur-sm">
            <div className="bg-slate-800 rounded-lg shadow-2xl w-full max-w-md p-6 border border-slate-700">
                <h3 className="text-xl font-bold text-white mb-4">Import Config</h3>

                {!stats ? (
                    <div className="space-y-4">
                        {!showConfirmPurge ? (
                            <>
                                <p className="text-slate-300 text-sm">
                                    Upload your existing <code className="bg-slate-900 px-1 rounded">wg0.conf</code> or PiVPN backup <code className="bg-slate-900 px-1 rounded">.tgz</code>.
                                    We will import networks, clients, and access rules.
                                </p>

                                <div
                                    className="border-2 border-dashed border-slate-600 rounded-lg p-8 text-center cursor-pointer hover:border-emerald-500 hover:bg-slate-700/50 transition-colors"
                                    onClick={() => fileInputRef.current?.click()}
                                >
                                    <input
                                        type="file"
                                        ref={fileInputRef}
                                        onChange={handleFileChange}
                                        className="hidden"
                                        accept=".conf,.tgz,.tar.gz"
                                    />
                                    {file ? (
                                        <div>
                                            <div className="text-emerald-400 font-medium mb-1">Selected File:</div>
                                            <div className="text-white">{file.name}</div>
                                        </div>
                                    ) : (
                                        <div className="text-slate-400">
                                            Click to select config or backup file
                                        </div>
                                    )}
                                </div>

                                <div className="flex justify-end gap-3 mt-6">
                                    <button
                                        onClick={onClose}
                                        className="px-4 py-2 text-slate-400 hover:text-white"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={() => handleImport(false)}
                                        disabled={!file || uploading}
                                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded disabled:opacity-50"
                                    >
                                        {uploading ? 'Importing...' : 'Import'}
                                    </button>
                                </div>
                            </>
                        ) : (
                            <div className="bg-amber-900/30 border border-amber-700 rounded p-4 space-y-4">
                                <h4 className="text-amber-400 font-bold">⚠️ Server Key Mismatch</h4>
                                <p className="text-sm text-slate-300">
                                    The server private key in the backup does not match the current system key.
                                </p>
                                <p className="text-sm text-red-400 font-medium">
                                    Continuing will PURGE all existing networks, clients, and rules before importing.
                                </p>
                                <div className="flex justify-end gap-3 pt-2">
                                    <button
                                        onClick={() => setShowConfirmPurge(false)}
                                        className="px-4 py-2 text-slate-400 hover:text-white text-sm"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={() => handleImport(true)}
                                        className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded text-sm font-bold shadow-lg shadow-red-900/20"
                                    >
                                        Purge and Continue
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="bg-emerald-900/30 border border-emerald-700 rounded p-4">
                            <h4 className="text-emerald-400 font-bold mb-2">Import Successful!</h4>
                            <ul className="text-sm text-slate-300 space-y-1">
                                <li>• Server Settings Updated: {stats.server_updated ? 'Yes' : 'No'}</li>
                                <li>• Networks Created: {stats.networks_created}</li>
                                <li>• Clients Created: {stats.clients_created}</li>
                                <li>• Access Rules Created: {stats.access_rules_created}</li>
                            </ul>
                        </div>

                        <p className="text-xs text-amber-400">
                            Note: If your config was missing private keys, please check Server Settings.
                        </p>

                        <button
                            onClick={handleFinish}
                            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded"
                        >
                            Done
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ImportModal;
