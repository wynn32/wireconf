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

                <div className="flex-1 overflow-auto bg-slate-950 p-6 rounded-lg border border-slate-700 font-mono text-sm text-emerald-500 mb-6 whitespace-pre text-left">
                    {configContent}
                </div>

                <div className="flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
                    >
                        Close
                    </button>
                    <button
                        onClick={() => {
                            navigator.clipboard.writeText(configContent);
                            alert('Copied to clipboard!');
                        }}
                        className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded font-medium transition-colors flex items-center gap-2"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                        </svg>
                        Copy
                    </button>
                    <button
                        onClick={handleDownload}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded font-medium transition-colors shadow-lg flex items-center gap-2"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        Download
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ConfigModal;
