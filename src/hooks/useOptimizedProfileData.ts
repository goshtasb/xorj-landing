/**
 * Optimized Profile Data Hook
 * Centralizes all profile-related API calls to prevent redundant requests
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';

interface Transaction {
  id: string;
  amount: number;
  timestamp: number;
  status: string;
}

interface UserSettings {
  riskProfile: string;
  investmentAmount?: number;
  maxDrawdownLimit?: number;
}

interface BotStatus {
  status: 'active' | 'paused' | 'stopped' | 'error';
  uptime?: number;
  lastTradeTime?: number;
}

interface Performance {
  totalTrades: number;
  successRate: number;
  totalPnL: number;
}

interface ProfileData {
  transactions: Transaction[];
  settings: UserSettings | null;
  botStatus: BotStatus | null;
  performance: Performance | null;
  isLoading: boolean;
  error: string | null;
}

// Simple in-memory cache for API responses
const cache = new Map<string, { data: unknown; timestamp: number; ttl: number }>();

const CACHE_TTL = 30000; // 30 seconds

function getCachedData(key: string): unknown | null {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < cached.ttl) {
    return cached.data;
  }
  cache.delete(key);
  return null;
}

function setCachedData(key: string, data: unknown, ttl = CACHE_TTL): void {
  cache.set(key, { data, timestamp: Date.now(), ttl });
}

export function useOptimizedProfileData(): ProfileData {
  const { publicKey } = useWallet();
  const [data, setData] = useState<ProfileData>({
    transactions: [],
    settings: null,
    botStatus: null,
    performance: null,
    isLoading: true,
    error: null,
  });

  const walletAddress = publicKey?.toString();

  const fetchAllData = useCallback(async () => {
    if (!walletAddress) {
      setData(prev => ({ ...prev, isLoading: false }));
      return;
    }

    setData(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      // Use cached authentication if available
      const authKey = `auth_${walletAddress}`;
      let authToken = getCachedData(authKey);

      if (!authToken) {
        console.log('🔐 Authenticating user...');
        const authResponse = await fetch('/api/auth/authenticate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            walletAddress,
            signature: 'optimized_auth_signature',
            message: 'XORJ Authentication'
          })
        });
        
        if (authResponse.ok) {
          const authData = await authResponse.json();
          authToken = authData.token;
          setCachedData(authKey, authToken, 300000); // 5 minutes
        }
      }

      // Fetch all data in parallel with caching
      const promises = [];
      
      // Transactions
      const txKey = `transactions_${walletAddress}`;
      let transactions = getCachedData(txKey);
      if (!transactions) {
        promises.push(
          fetch(`/api/user/transactions?walletAddress=${walletAddress}&limit=10`)
            .then(res => res.json())
            .then(data => {
              transactions = data.success ? data.data.transactions : [];
              setCachedData(txKey, transactions);
              return { type: 'transactions', data: transactions };
            })
        );
      }

      // Settings
      const settingsKey = `settings_${walletAddress}`;
      let settings = getCachedData(settingsKey);
      if (!settings) {
        promises.push(
          fetch(`/api/user/settings?walletAddress=${walletAddress}`)
            .then(res => res.json())
            .then(data => {
              settings = data.success ? data.data : null;
              setCachedData(settingsKey, settings);
              return { type: 'settings', data: settings };
            })
        );
      }

      // Bot Status
      const botKey = `bot_${walletAddress}`;
      let botStatus = getCachedData(botKey);
      if (!botStatus) {
        promises.push(
          fetch('/api/bot/status')
            .then(res => res.json())
            .then(data => {
              botStatus = data;
              setCachedData(botKey, botStatus, 10000); // 10 seconds for bot status
              return { type: 'botStatus', data: botStatus };
            })
            .catch(() => ({ type: 'botStatus', data: null }))
        );
      }

      // Performance
      const perfKey = `performance_${walletAddress}`;
      let performance = getCachedData(perfKey);
      if (!performance) {
        promises.push(
          fetch(`/api/user/performance?walletAddress=${walletAddress}&timeRange=30D`)
            .then(res => res.json())
            .then(data => {
              performance = data;
              setCachedData(perfKey, performance);
              return { type: 'performance', data: performance };
            })
            .catch(() => ({ type: 'performance', data: null }))
        );
      }

      // Wait for all non-cached requests
      if (promises.length > 0) {
        const results = await Promise.all(promises);
        
        results.forEach(result => {
          if (result.type === 'transactions') transactions = result.data;
          else if (result.type === 'settings') settings = result.data;
          else if (result.type === 'botStatus') botStatus = result.data;
          else if (result.type === 'performance') performance = result.data;
        });
      }

      setData({
        transactions: transactions || [],
        settings: settings,
        botStatus: botStatus,
        performance: performance,
        isLoading: false,
        error: null,
      });

    } catch {
      console.error('❌ Failed to fetch profile data:');
      setData(prev => ({
        ...prev,
        isLoading: false,
        error: 'Failed to load profile data. Please try again.',
      }));
    }
  }, [walletAddress]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  return data;
}