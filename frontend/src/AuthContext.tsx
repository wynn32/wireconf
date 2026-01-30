import React, { createContext, useContext, useState, useEffect } from 'react';
import api from './api';

interface Permission {
    scope_type: string;
    scope_id: number | null;
    permission_level: string;
}

interface User {
    id: number;
    username: string;
    permissions: Permission[];
}

interface AuthContextType {
    user: User | null;
    isLoading: boolean;
    logout: () => Promise<void>;
    hasPermission: (scope: string, id: number | null, level: string) => boolean;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    isLoading: true,
    logout: async () => { },
    hasPermission: () => false
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        api.get('/auth/me')
            .then(res => setUser(res.data))
            .catch(() => setUser(null))
            .finally(() => setIsLoading(false));
    }, []);

    const logout = async () => {
        try {
            await api.post('/auth/logout');
            setUser(null);
            window.location.href = '/login'; // Hard redirect to ensure clean state
        } catch (e) {
            console.error("Logout failed", e);
        }
    };

    const hasPermission = (scope: string, id: number | null, level: string): boolean => {
        if (!user) return false;

        for (const p of user.permissions) {
            // Global check
            if (p.scope_type === 'GLOBAL' && p.permission_level === level) return true;
            if (p.scope_type === 'GLOBAL' && p.permission_level === 'MANAGE_USERS' && level !== 'MANAGE_USERS') {
                // Assume admin implies everything? Or at least VIEW?
                // For now stick to strict match unless we decided implies logic.
                // Let's assume strict match as per backend logic. 
                // Backend logic: GLOBAL matches if scope==GLOBAL.
            }

            if (p.scope_type === scope) {
                if (p.scope_id === id && p.permission_level === level) return true;
            }
        }

        // Complex hierarchy checks (Network View -> Client View) requires access to network list relative to client
        // Frontend might not have enough info to do fully recursive check easily without fetching more data.
        // So for UI hiding, simple checks are often enough. Backend enforces truth.
        return false;
    };

    return (
        <AuthContext.Provider value={{ user, isLoading, logout, hasPermission }}>
            {children}
        </AuthContext.Provider>
    );
};
