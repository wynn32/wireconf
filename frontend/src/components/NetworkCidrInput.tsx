import React, { useState, useEffect } from 'react';

interface NetworkCidrInputProps {
    cidrValue: string;
    interfaceValue: string;
    onChange: (cidr: string, interfaceIp: string) => void;
}

const NetworkCidrInput: React.FC<NetworkCidrInputProps> = ({ cidrValue, interfaceValue, onChange }) => {
    // State for the 4 octets of the Network Address
    const [octets, setOctets] = useState<string[]>(['10', '0', '0', '0']);
    const [mask, setMask] = useState<number>(24);

    // State for the Interface IP host portion (relative to mask)
    // We basically need to store the full interface IP octets, but some are locked.
    const [interfaceOctets, setInterfaceOctets] = useState<string[]>(['10', '0', '0', '1']);

    // Initialize state from props on mount (or if empty keys?)
    // For now, let's just respect the defaults if empty, or parse if valid.
    // Since this is a "New Network" form, usually empty.
    // But if we wanted to support editing, we'd need parsing logic.
    // Let's assume for creation simplicity we stick to defaults.

    useEffect(() => {
        let initialNetworkOctets = ['10', '0', '0', '0'];
        let initialMask = 24;
        let initialInterfaceOctets = ['10', '0', '0', '1'];

        // Parse cidrValue
        if (cidrValue) {
            const parts = cidrValue.split('/');
            if (parts.length === 2) {
                const networkParts = parts[0].split('.');
                const parsedMask = parseInt(parts[1], 10);

                if (networkParts.length === 4 && !networkParts.some(p => isNaN(parseInt(p))) && parsedMask >= 0 && parsedMask <= 32) {
                    initialNetworkOctets = networkParts;
                    initialMask = parsedMask;
                }
            }
        }

        // Parse interfaceValue
        if (interfaceValue) {
            const parts = interfaceValue.split('/');
            if (parts.length >= 1) { // We only care about the IP part for interfaceOctets
                const interfaceParts = parts[0].split('.');
                if (interfaceParts.length === 4 && !interfaceParts.some(p => isNaN(parseInt(p)))) {
                    initialInterfaceOctets = interfaceParts;
                }
            }
        }

        setOctets(initialNetworkOctets);
        setMask(initialMask);
        setInterfaceOctets(initialInterfaceOctets);

        // Also update parent with the initialized values
        onChange(
            `${initialNetworkOctets.join('.')}/${initialMask}`,
            `${initialInterfaceOctets.join('.')}/${initialMask}`
        );

    }, [cidrValue, interfaceValue]); // Re-run if props change


    // Helper to update parent
    const updateParent = (newNetworkOctets: string[], newMask: number, newInterfaceOctets: string[]) => {
        const cidr = `${newNetworkOctets.join('.')}/${newMask}`;
        const interfaceIp = `${newInterfaceOctets.join('.')}/${newMask}`;
        onChange(cidr, interfaceIp);
    };

    const handleOctetChange = (index: number, val: string, isNetwork: boolean) => {
        // Validate numeric
        const num = parseInt(val);
        if (val !== '' && (isNaN(num) || num < 0 || num > 255)) return;

        const newOctets = isNetwork ? [...octets] : [...interfaceOctets];
        newOctets[index] = val;

        if (isNetwork) {
            setOctets(newOctets);

            // If we change network, we MUST update interface frozen parts too
            const newInterface = [...interfaceOctets];
            // Update the locked parts of interface to match network
            // (Which parts are locked depends on mask)
            const frozenCount = getFrozenCount(mask);
            for (let i = 0; i < frozenCount; i++) {
                newInterface[i] = newOctets[i];
            }
            setInterfaceOctets(newInterface);
            updateParent(newOctets, mask, newInterface);
        } else {
            setInterfaceOctets(newOctets);
            updateParent(octets, mask, newOctets);
        }
    };

    const handleMaskChange = (val: string) => {
        const newMask = parseInt(val);
        if (val === '') {
            // allow temporary empty state while typing?
            // checking validity on blur might be better, or just ignore invalid updates
            // But we need to update state to let user type
            // But mask state is number... let's check
            return;
        }
        if (isNaN(newMask) || newMask < 0 || newMask > 32) return;

        setMask(newMask);

        // Re-locking interface parts
        const frozenCount = getFrozenCount(newMask);
        const newInterface = [...interfaceOctets];
        for (let i = 0; i < frozenCount; i++) {
            newInterface[i] = octets[i];
        }
        setInterfaceOctets(newInterface);
        updateParent(octets, newMask, newInterface);
    };

    const getFrozenCount = (m: number) => {
        if (m >= 24) return 3;
        if (m >= 16) return 2;
        if (m >= 8) return 1;
        return 0;
    };

    const calculateHosts = (m: number) => {
        if (m === 32) return 1;
        if (m === 31) return 0; // Point-to-point usually /31? But technically 0 usable in standard calc
        return Math.pow(2, 32 - m) - 2;
    };

    const formatHosts = (count: number) => {
        if (count < 0) return 0;
        if (count > 1000000) return (count / 1000000).toFixed(1) + 'M';
        if (count > 1000) return (count / 1000).toFixed(1) + 'k';
        return count;
    };

    const frozenCount = getFrozenCount(mask);

    return (
        <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-700/50 flex flex-col md:flex-row gap-4 items-start md:items-center">
            {/* Step 1: Network CIDR */}
            <div className="flex-1">
                <label className="block text-[10px] uppercase text-slate-500 font-bold mb-1">Network Subnet</label>
                <div className="flex items-center gap-2">
                    <div className="flex bg-slate-800 rounded border border-slate-600 p-0.5">
                        {[0, 1, 2, 3].map((i) => (
                            <React.Fragment key={i}>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    value={octets[i]}
                                    onChange={e => handleOctetChange(i, e.target.value, true)}
                                    className="w-8 md:w-10 bg-transparent text-center text-white font-mono text-sm outline-none focus:text-blue-400 placeholder-slate-600"
                                    placeholder="0"
                                    maxLength={3}
                                />
                                {i < 3 && <span className="text-slate-500 font-bold self-center">.</span>}
                            </React.Fragment>
                        ))}
                    </div>
                    <span className="text-slate-400 font-mono">/</span>
                    <input
                        type="number"
                        min="0"
                        max="32"
                        value={mask}
                        onChange={e => handleMaskChange(e.target.value)}
                        className="w-12 bg-slate-800 border border-slate-600 rounded px-1 py-0.5 text-white text-sm outline-none focus:border-blue-500 text-center"
                    />
                    <span className="text-[10px] text-slate-500 font-mono whitespace-nowrap">
                        ({formatHosts(calculateHosts(mask))} hosts)
                    </span>
                </div>
            </div>

            <div className="hidden md:block w-px h-8 bg-slate-700/50"></div>

            {/* Step 2: Interface Assignment */}
            <div className="flex-1">
                <label className="block text-[10px] uppercase text-emerald-600 font-bold mb-1">Interface IP</label>
                <div className="flex items-center gap-2">
                    <div className="flex bg-slate-800 rounded border border-slate-600 p-0.5">
                        {[0, 1, 2, 3].map((i) => {
                            const isFrozen = i < frozenCount;
                            return (
                                <React.Fragment key={i}>
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        pattern="[0-9]*"
                                        value={interfaceOctets[i]}
                                        onChange={e => handleOctetChange(i, e.target.value, false)}
                                        readOnly={isFrozen}
                                        className={`
                                            w-8 md:w-10 text-center font-mono text-sm outline-none bg-transparent
                                            ${isFrozen
                                                ? 'text-slate-500 cursor-not-allowed select-none'
                                                : 'text-emerald-400 font-bold focus:text-emerald-300 placeholder-slate-700'}
                                        `}
                                        placeholder="0"
                                        maxLength={3}
                                    />
                                    {i < 3 && <span className="text-slate-500 font-bold self-center">.</span>}
                                </React.Fragment>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default NetworkCidrInput;
