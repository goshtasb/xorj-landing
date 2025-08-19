'use client';

import { useState, useEffect, useCallback } from 'react';
import { 
  BotStatus, 
  BotTradesResponse, 
  BotConfiguration, 
  EmergencyAction, 
  EmergencyResponse,
  EmergencyStatus 
} from '@/types/bot';

export const useBotStatus = (userId: string | null, refreshInterval: number = 30000) => {
  const [status, setStatus] = useState<BotStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!userId) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/bot/status?user_id=${userId}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setStatus(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch bot status');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const updateConfiguration = useCallback(async (config: Partial<BotConfiguration>) => {
    if (!userId) return;

    try {
      const response = await fetch('/api/bot/status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: userId,
          configuration: config
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      // Refresh status after configuration update
      await fetchStatus();
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update configuration');
      throw err;
    }
  }, [userId, fetchStatus]);

  useEffect(() => {
    fetchStatus();

    // Set up polling for real-time updates
    const interval = setInterval(fetchStatus, refreshInterval);
    return () => clearInterval(interval);
  }, [fetchStatus, refreshInterval]);

  return {
    status,
    loading,
    error,
    refetch: fetchStatus,
    updateConfiguration
  };
};

export const useBotTrades = (userId: string | null, limit: number = 50, offset: number = 0) => {
  const [trades, setTrades] = useState<BotTradesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTrades = useCallback(async () => {
    if (!userId) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/bot/trades?user_id=${userId}&limit=${limit}&offset=${offset}`
      );
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setTrades(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch bot trades');
    } finally {
      setLoading(false);
    }
  }, [userId, limit, offset]);

  useEffect(() => {
    fetchTrades();
  }, [fetchTrades]);

  return {
    trades,
    loading,
    error,
    refetch: fetchTrades
  };
};

export const useBotEmergency = (userId: string | null) => {
  const [emergencyStatus, setEmergencyStatus] = useState<EmergencyStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchEmergencyStatus = useCallback(async () => {
    if (!userId) return;

    try {
      const response = await fetch(`/api/bot/emergency?user_id=${userId}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setEmergencyStatus(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch emergency status');
    }
  }, [userId]);

  const executeEmergencyAction = useCallback(async (action: EmergencyAction): Promise<EmergencyResponse> => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/bot/emergency', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(action)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      // Refresh emergency status after action
      await fetchEmergencyStatus();
      
      return data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to execute emergency action';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [fetchEmergencyStatus]);

  useEffect(() => {
    fetchEmergencyStatus();
  }, [fetchEmergencyStatus]);

  return {
    emergencyStatus,
    loading,
    error,
    executeEmergencyAction,
    refetch: fetchEmergencyStatus
  };
};