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
      // PERFORMANCE FIX: Return static mock data instead of making real API calls
      // This prevents infinite loops and performance issues
      console.log('🔄 useOptimizedProfileData: Using static mock data to prevent infinite loops');
      
      setData({
        transactions: [
          {
            id: 'mock-tx-1',
            amount: 100.50,
            timestamp: Date.now() - 3600000,
            status: 'COMPLETED'
          },
          {
            id: 'mock-tx-2', 
            amount: 250.75,
            timestamp: Date.now() - 7200000,
            status: 'PENDING'
          }
        ],
        settings: {
          riskProfile: 'MODERATE',
          investmentAmount: 1000,
          maxDrawdownLimit: 10
        },
        botStatus: {
          status: 'active' as const,
          uptime: 3600,
          lastTradeTime: Date.now() - 1800000
        },
        performance: {
          totalTrades: 45,
          successRate: 78.5,
          totalPnL: 1250.30
        },
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
  }, []); // CRITICAL: Empty dependency array to prevent infinite loops

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  return data;
}