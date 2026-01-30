import React, { useEffect, useState } from 'react';
import api from '../api';

interface CommitPreview {
    summary: {
        added_clients: { name: string, id: number | null }[];
        removed_clients: string[];
        modified_interface: boolean;
    };
    new_config: string;
    full_restart_needed: boolean;
}

interface Props {
    onClose: () => void;
    onConfirm: () => void;
}

const CommitModal: React.FC<Props> = ({ onClose, onConfirm }) => {
    const [preview, setPreview] = useState<CommitPreview | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchPreview = () => {
        setLoading(true);
        api.get('/commit/preview')
            .then(res => setPreview(res.data))
            .catch(err => console.error(err))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        fetchPreview();
    }, []);

    const handleUndoClient = async (id: number) => {
        if (!confirm('Undo creation of this client? It will be removed from the database.')) return;
        try {
            await api.delete(`/clients/${id}`);
            fetchPreview();
        } catch (err) {
            alert('Failed to undo client creation');
        }
    };

    if (loading) return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100] backdrop-blur-sm">
            <div className="text-white">Loading preview...</div>
        </div>
    );

    if (!preview) return null;

    const hasChanges = preview.summary.added_clients.length > 0 ||
        preview.summary.removed_clients.length > 0 ||
        preview.summary.modified_interface;

    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100] backdrop-blur-sm p-4">
            <div className="bg-slate-800 rounded-lg shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col border border-slate-700">
                <div className="p-6 border-b border-slate-700">
                    <h3 className="text-xl font-bold text-white">Review Changes</h3>
                    <p className="text-slate-400 text-sm mt-1">Review the changes before applying them to the WireGuard server.</p>
                </div>

                <div className="p-6 overflow-y-auto flex-1 space-y-6">
                    {!hasChanges ? (
                        <div className="text-slate-500 italic text-center py-8">
                            No changes detected between database and current config.
                        </div>
                    ) : (
                        <>
                            {/* Summary Cards */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {preview.summary.added_clients.length > 0 && (
                                    <div className="bg-emerald-900/20 border border-emerald-900/50 p-4 rounded-lg">
                                        <h4 className="text-emerald-400 text-xs font-bold uppercase mb-2">Adding Clients</h4>
                                        <ul className="text-emerald-200 text-sm space-y-2">
                                            {preview.summary.added_clients.map(c => (
                                                <li key={c.id || c.name} className="flex justify-between items-center group">
                                                    <span>{c.name}</span>
                                                    {c.id && (
                                                        <button
                                                            onClick={() => handleUndoClient(c.id!)}
                                                            className="text-[10px] text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                                                        >
                                                            Undo
                                                        </button>
                                                    )}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                                {preview.summary.removed_clients.length > 0 && (
                                    <div className="bg-red-900/20 border border-red-900/50 p-4 rounded-lg">
                                        <h4 className="text-red-400 text-xs font-bold uppercase mb-2">Removing Clients</h4>
                                        <ul className="text-red-200 text-sm list-disc list-inside">
                                            {preview.summary.removed_clients.map(c => <li key={c}>{c}</li>)}
                                        </ul>
                                    </div>
                                )}
                            </div>

                            {preview.summary.modified_interface && (
                                <div className="bg-amber-900/20 border border-amber-900/50 p-4 rounded-lg">
                                    <h4 className="text-amber-400 text-xs font-bold uppercase mb-2">Interface/Rules Modified</h4>
                                    <p className="text-amber-200 text-sm">A full server restart will be performed to apply network or firewall changes.</p>
                                </div>
                            )}

                            <div>
                                <h4 className="text-slate-400 text-xs font-bold uppercase mb-2">Final Config Preview</h4>
                                <pre className="bg-slate-950 p-4 rounded border border-slate-700 text-emerald-500 font-mono text-[10px] h-48 overflow-auto">
                                    {preview.new_config}
                                </pre>
                            </div>
                        </>
                    )}
                </div>

                <div className="p-6 border-t border-slate-700 flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 text-slate-400 hover:text-white transition-colors">
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={!hasChanges}
                        className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-700 text-white px-6 py-2 rounded-lg font-bold shadow-lg transition-all active:scale-95"
                    >
                        Apply Changes
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CommitModal;
