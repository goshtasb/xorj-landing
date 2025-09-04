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
  const { publicKey, connected, authenticated } = walletContext;
  const [botStatus, setBotStatus] = useState<BotStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [hasValidAuth, setHasValidAuth] = useState(false);

  const effectivePublicKey = mounted ? publicKey?.toString() : undefined;
  const isWalletReady = mounted && effectivePublicKey && connected && authenticated;

  useEffect(() => {
    setMounted(true);
  }, []);

  const fetchBotStatus = useCallback(async () => {
    if (!isWalletReady) {
      console.log('🔄 BotStatusContext: Skipping fetch - wallet not ready', {
        mounted,
        publicKey: publicKey?.toString(),
        connected,
        authenticated
      });
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      console.log('🔄 BotStatusContext: Fetching bot status for authenticated wallet', {
        publicKey: publicKey?.toString(),
        connected,
        authenticated
      });
      
      const response = await fetch('/api/bot/status', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include' // Include httpOnly cookies for authentication
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        
        // If token expired or missing, provide clear user guidance
        if (response.status === 401) {
          console.log('🔑 Authentication required for bot status - user needs to authenticate');
          
          // Clear expired tokens from localStorage (legacy cleanup)
          localStorage.removeItem('xorj_session_token');
          localStorage.removeItem('xorj_jwt_token');
          
          // CRITICAL: Return without setting error to prevent continuous polling
          // Authentication errors should not trigger retries
          setBotStatus(null);
          setIsLoading(false);
          setHasValidAuth(false); // Mark auth as invalid to stop polling
          return;
        }
        
        throw new Error(errorData.error || `Bot status fetch failed: ${response.status}`);
      }
      
      const data = await response.json();
      
      console.log('✅ BotStatusContext: Bot status fetched:', data.status);
      
      setBotStatus(data);
      setError(null); // Clear any previous errors on successful fetch
      setHasValidAuth(true); // Mark auth as valid when successful
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch bot status';
      
      // Only show error for unexpected failures, not auth issues
      if (!errorMessage.includes('authenticate') && !errorMessage.includes('session') && !errorMessage.includes('token')) {
        console.error('❌ BotStatusContext: Bot status fetch error:', errorMessage);
        setError(errorMessage);
      } else {
        console.log('🔑 BotStatusContext: Authentication required -', errorMessage);
        // Don't set error for auth issues to prevent UI error displays
      }
      
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
      // Initially assume auth might be valid when wallet connects
      setHasValidAuth(true);
      fetchBotStatus();
    }
  }, [isWalletReady, fetchBotStatus]);

  // Set up periodic refresh - ONLY if authentication is valid
  useEffect(() => {
    // Don't poll if wallet isn't ready OR if auth has failed
    if (!isWalletReady || !hasValidAuth) {
      if (!hasValidAuth && isWalletReady) {
        console.log('🔑 BotStatusContext: Stopping periodic refresh - authentication invalid');
      }
      return;
    }
    
    const interval = setInterval(() => {
      console.log('🔄 BotStatusContext: Periodic refresh (every 30 seconds)');
      fetchBotStatus();
    }, 30000); // 30 seconds
    
    return () => clearInterval(interval);
  }, [isWalletReady, hasValidAuth, fetchBotStatus]);

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