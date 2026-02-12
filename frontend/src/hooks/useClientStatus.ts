
import { useState, useEffect, useCallback } from 'react';
import api from '../api';

export interface ClientStatus {
    id: number;
    name: string;
    public_key: string;
    endpoint: string;
    latest_handshake: number;
    transfer_rx: number;
    transfer_tx: number;
    is_active: boolean;
    enabled: boolean;
}

export const useClientStatus = (refreshInterval: number = 5000) => {
    const [statusMap, setStatusMap] = useState<Record<string, ClientStatus>>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

    const fetchStatus = useCallback(async () => {
        try {
            const res = await api.get('/wireguard/status');
            const data: ClientStatus[] = res.data;
            const map: Record<string, ClientStatus> = {};
            data.forEach(s => {
                map[s.public_key] = s;
            });
            setStatusMap(map);
            setError('');
            setLastUpdate(new Date());
        } catch (err) {
            console.error('Failed to fetch WireGuard status', err);
            setError('Failed to fetch status');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchStatus();

        let intervalId: any;
        if (refreshInterval > 0) {
            intervalId = setInterval(fetchStatus, refreshInterval);
        }

        return () => {
            if (intervalId) clearInterval(intervalId);
        };
    }, [refreshInterval, fetchStatus]);

    return { statusMap, loading, error, lastUpdate, refresh: fetchStatus };
};
