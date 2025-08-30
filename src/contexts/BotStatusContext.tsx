/**
 * BotStatusContext - Shared bot status state management
 * Prevents desynchronization between BotControlsCard and UserProfileCard
 */

'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { useSimpleWallet } from './SimpleWalletContext';

interface BotStatus {
  status: 'active' | 'paused' | 'stopped' | 'error';
  uptime?: number;
  lastTradeTime?: number;
  last_execution?: string;
  configuration?: {
    risk_profile?: 'low' | 'medium' | 'high' | 'balanced' | 'conservative' | 'aggressive';
    riskTolerance?: 'low' | 'medium' | 'high';
    maxPositionSize?: number;
    max_trade_amount?: number;
    autoRebalance?: boolean;
    enabled?: boolean;
  };
  performance?: {
    total_trades?: number;
    successful_trades?: number;
    success_rate?: number;
  };
}

interface BotStatusContextType {
  botStatus: BotStatus | null;
  isLoading: boolean;
  error: string | null;
  fetchBotStatus: () => Promise<void>;
  updateBotStatus: (updates: Partial<BotStatus>) => void;
  setBotEnabled: (enabled: boolean) => void;
}

const BotStatusContext = createContext<BotStatusContextType>({
  botStatus: null,
  isLoading: false,
  error: null,
  fetchBotStatus: async () => {},
  updateBotStatus: () => {},
  setBotEnabled: () => {}
});

export const useBotStatus = () => {
  const context = useContext(BotStatusContext);
  if (!context) {
    throw new Error('useBotStatus must be used within BotStatusProvider');
  }
  return context;
};

interface BotStatusProviderProps {
  children: ReactNode;
}

export function BotStatusProvider({ children }: BotStatusProviderProps) {
  const walletContext = useSimpleWallet();
  const { publicKey, connected, authenticated, authenticateManually } = walletContext;
  const [botStatus, setBotStatus] = useState<BotStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  const effectivePublicKey = mounted ? publicKey?.toString() : undefined;
  const isWalletReady = mounted && effectivePublicKey && connected && authenticated;

  useEffect(() => {
    setMounted(true);
  }, []);

  const fetchBotStatus = useCallback(async () => {
    if (!isWalletReady) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      console.log('🔄 BotStatusContext: Fetching bot status');
      
      // Try both token keys for backwards compatibility
      let sessionToken = localStorage.getItem('xorj_session_token') || localStorage.getItem('xorj_jwt_token');
      if (!sessionToken) {
        throw new Error('No authentication token available');
      }
      
      const response = await fetch('/api/bot/status', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${sessionToken}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        
        // If token expired, provide clear user guidance
        if (response.status === 401 && (errorData.error?.includes('expired') || errorData.error?.includes('Invalid'))) {
          console.log('🔑 JWT token expired - user needs to re-authenticate');
          
          // Clear expired tokens from localStorage
          localStorage.removeItem('xorj_session_token');
          localStorage.removeItem('xorj_jwt_token');
          
          throw new Error('Your session has expired. Please refresh the page to sign in again.');
        }
        
        throw new Error(errorData.error || `Bot status fetch failed: ${response.status}`);
      }
      
      const data = await response.json();
      
      console.log('✅ BotStatusContext: Bot status fetched:', data.status);
      
      setBotStatus(data);
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch bot status';
      console.error('❌ BotStatusContext: Bot status fetch error:', errorMessage);
      setError(errorMessage);
      setBotStatus(null);
    } finally {
      setIsLoading(false);
    }
  }, [isWalletReady]);

  const updateBotStatus = useCallback((updates: Partial<BotStatus>) => {
    setBotStatus(prev => prev ? { ...prev, ...updates } : null);
  }, []);

  const setBotEnabled = useCallback((enabled: boolean) => {
    setBotStatus(prev => prev ? {
      ...prev,
      status: enabled ? 'active' : 'stopped',
      configuration: {
        ...prev.configuration,
        enabled
      }
    } : null);
    console.log(`🤖 BotStatusContext: Bot ${enabled ? 'enabled' : 'disabled'} in shared state`);
  }, []);

  // Auto-fetch when wallet is ready
  useEffect(() => {
    if (isWalletReady) {
      fetchBotStatus();
    }
  }, [isWalletReady, fetchBotStatus]);

  // Set up periodic refresh
  useEffect(() => {
    if (!isWalletReady) return;
    
    const interval = setInterval(() => {
      console.log('🔄 BotStatusContext: Periodic refresh (every 30 seconds)');
      fetchBotStatus();
    }, 30000); // 30 seconds
    
    return () => clearInterval(interval);
  }, [isWalletReady, fetchBotStatus]);

  const value: BotStatusContextType = {
    botStatus,
    isLoading,
    error,
    fetchBotStatus,
    updateBotStatus,
    setBotEnabled
  };

  return (
    <BotStatusContext.Provider value={value}>
      {children}
    </BotStatusContext.Provider>
  );
}

export default BotStatusProvider;