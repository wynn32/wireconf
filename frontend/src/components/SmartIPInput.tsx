import React, { useEffect, useState, useRef } from 'react';

interface SmartIPInputProps {
    cidr: string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string; // Additional classes for the container
}

const SmartIPInput: React.FC<SmartIPInputProps> = ({ cidr, value, onChange, placeholder, className }) => {
    const [prefixParts, setPrefixParts] = useState<string[]>([]); // Frozen parts
    const [suffixPart, setSuffixPart] = useState<string>(''); // Editable part
    const inputRef = useRef<HTMLInputElement>(null);

    // Parse CIDR to determine frozen prefix
    useEffect(() => {
        if (!cidr || !cidr.includes('/')) {
            setPrefixParts([]);
            setSuffixPart(value);
            return;
        }

        try {
            const [ip, mask] = cidr.split('/');
            const maskInt = parseInt(mask, 10);

            if (isNaN(maskInt) || maskInt < 0 || maskInt > 32) {
                setPrefixParts([]);
                setSuffixPart(value);
                return;
            }

            const parts = ip.split('.');
            if (parts.length !== 4) {
                setPrefixParts([]);
                setSuffixPart(value);
                return;
            }

            // Determine how many octets are frozen
            // Simple logic for /8, /16, /24
            // For non-byte boundaries, it's harder to visualize as simple text freezing
            // but we can try our best.
            // Let's support strict byte boundaries for the visual "gray out" feature for now
            // as requested: "if someone enters X.Y.Z.A/24, bytes X, Y, and Z are frozen"

            let frozenCount = 0;
            if (maskInt >= 24) frozenCount = 3;
            else if (maskInt >= 16) frozenCount = 2;
            else if (maskInt >= 8) frozenCount = 1;

            const frozen = parts.slice(0, frozenCount);
            setPrefixParts(frozen);

            // Now we need to extract the "editable" part from the current value
            // If the value starts with the prefix, show the rest.
            // If not (e.g. empty or mismatch), show clear (or partial if mismatch?)
            // Actually, we should force the prefix?

            const prefixStr = frozen.join('.') + (frozenCount > 0 ? '.' : '');

            if (value.startsWith(prefixStr)) {
                setSuffixPart(value.slice(prefixStr.length));
            } else if (value === '') {
                setSuffixPart('');
            } else {
                // Value doesn't match prefix? Maybe user changed CIDR.
                // We should probably reset or try to preserve the suffix?
                // Let's just show the raw value relative to new prefix if possible
                // or just clear it if it's completely off.
                // For now, let's treat it as the suffix if we can.
                // Actually, if we are in "smart mode", `value` is the FULL IP.
                // key is to let user type the suffix.

                // If the value is totally different, we might overwrite it with prefix?
                // Let's behave like this: 
                // The parent controls `value`.
                // We display `prefix + suffix`.
                // User edits `suffix`.
                // We call `onChange(prefix + suffix)`.

                // If `value` passed in doesn't start with prefix, we might need to handle that.
                // Ideally `onChange` fixes up the parent state.
                // But initially, if form is empty, value is empty.
                setSuffixPart('');
            }

        } catch (e) {
            console.error("Error parsing CIDR", e);
            setPrefixParts([]);
            setSuffixPart(value);
        }
    }, [cidr, value]);

    const handleSuffixChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newSuffix = e.target.value;
        setSuffixPart(newSuffix);

        const prefixStr = prefixParts.length > 0 ? prefixParts.join('.') + '.' : '';
        onChange(prefixStr + newSuffix);
    };

    // If we have a prefix, render specifically
    if (prefixParts.length > 0) {
        return (
            <div className={`flex items-center bg-slate-900 border border-slate-700 rounded text-white focus-within:border-emerald-500 overflow-hidden ${className}`}>
                <div className="flex bg-slate-800/50 text-slate-500 px-3 py-2 border-r border-slate-700 select-none">
                    {prefixParts.join('.')}
                    <span className="text-slate-600">.</span>
                </div>
                <input
                    ref={inputRef}
                    className="flex-1 bg-transparent border-none p-2 focus:ring-0 outline-none placeholder-slate-600"
                    value={suffixPart}
                    onChange={handleSuffixChange}
                    placeholder="x"
                />
            </div>
        );
    }

    // Fallback standard input
    return (
        <input
            className={`w-full bg-slate-900 border border-slate-700 rounded p-2 text-white focus:border-emerald-500 outline-none ${className}`}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
        />
    );
};

export default SmartIPInput;
