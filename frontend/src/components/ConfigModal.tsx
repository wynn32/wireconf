import React from 'react';

interface ConfigModalProps {
    configContent: string;
    filename: string;
    onClose: () => void;
}

const ConfigModal: React.FC<ConfigModalProps> = ({ configContent, filename, onClose }) => {

    const handleDownload = () => {
        const blob = new Blob([configContent], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 backdrop-blur-sm">
            <div className="bg-slate-800 rounded-lg shadow-2xl w-full max-w-2xl p-6 border border-slate-700 flex flex-col max-h-[90vh]">
                <div className="flex justify-between items-center mb-4 border-b border-slate-700 pb-2">
                    <h3 className="text-xl font-bold text-white">Client Configuration: {filename}</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-white text-2xl">&times;</button>
                </div>

                <div className="flex-1 overflow-auto bg-slate-900 p-4 rounded border border-slate-700 font-mono text-sm text-emerald-400 mb-4 whitespace-pre-wrap">
                    {configContent}
                </div>

                <div className="flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-slate-300 hover:text-white transition-colors"
                    >
                        Close
                    </button>
                    <button
                        onClick={handleDownload}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded font-medium transition-colors shadow-lg flex items-center gap-2"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        Download Config
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ConfigModal;
