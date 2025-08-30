/**
 * UserProfileCard Component
 * Displays wallet information and bot security status
 */

'use client';

console.log('📁 UserProfileCard.tsx file loaded at', new Date().toISOString());
console.log('🔥 UserProfileCard MODULE LOADED - THIS SHOULD ALWAYS SHOW');

import React, { useState, useEffect, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useSimpleWallet } from '@/contexts/SimpleWalletContext';
import { useBotStatus } from '@/contexts/BotStatusContext';
import { Copy, CheckCircle, AlertCircle, Loader2, RefreshCw } from 'lucide-react';
// Removed direct walletBalanceService import to prevent CORS issues
// Using server-side API endpoint instead

interface BotStatus {
  isBotActive: boolean;
  lastUpdated?: number;
  vaultAddress?: string;
}

export function UserProfileCard() {
  console.log('🎯🎯🎯 UserProfileCard: FUNCTION CALLED!!! ', new Date().toISOString());
  console.log('🚨 URGENT: UserProfileCard is executing');
  if (typeof window !== 'undefined') {
    console.log('🌐🌐🌐 UserProfileCard: BROWSER MODE', Date.now());
  } else {
    console.log('🖥️🖥️🖥️ UserProfileCard: SERVER MODE', Date.now());
  }
  const { publicKey } = useWallet();
  const { connected, authenticated, connect, connecting } = useSimpleWallet();
  const { botStatus: sharedBotStatus, isLoading: botStatusLoading, error: botStatusError } = useBotStatus();
  const [copied, setCopied] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  
  // Only show real wallet data when actually connected
  const effectivePublicKey = mounted ? publicKey?.toString() : undefined;
  const isWalletReady = mounted && effectivePublicKey && (connected || !!publicKey);

  // Debug wallet readiness
  useEffect(() => {
    if (mounted) {
      console.log('🔍 UserProfileCard Debug:', {
        mounted,
        effectivePublicKey,
        connected,
        publicKeyExists: !!publicKey,
        isWalletReady,
        authenticated
      });
    }
  }, [mounted, effectivePublicKey, connected, publicKey, isWalletReady, authenticated]);

  // Ensure component is mounted before accessing wallet
  useEffect(() => {
    console.log('🚀 UserProfileCard: Component mounted');
    setMounted(true);
  }, []);


  // Fetch wallet balance function
  const fetchWalletBalance = useCallback(async () => {
    if (!isWalletReady) return;

    // Only fetch balance if authenticated
    if (!authenticated) {
      console.log('⚠️ UserProfileCard: Not authenticated yet, skipping balance fetch');
      setLoadingBalance(true);
      setBalanceError(null);
      setWalletBalance(0);
      return;
    }

    setLoadingBalance(true);
    setBalanceError(null);

    try {
      console.log(`💰 UserProfileCard: Fetching wallet balance for: ${effectivePublicKey}`);
      
      // Use server-side API endpoint instead of direct service call to avoid CORS
      // Try both token keys for backwards compatibility
      const sessionToken = localStorage.getItem('xorj_session_token') || localStorage.getItem('xorj_jwt_token');
      if (!sessionToken) {
        throw new Error('No authentication token available');
      }
      
      const response = await fetch(`/api/wallet/balance?walletAddress=${effectivePublicKey}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${sessionToken}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        
        // Handle token expiration similar to BotStatusContext
        if (response.status === 401 && (errorData.error?.includes('expired') || errorData.error?.includes('Invalid'))) {
          console.log('🔑 JWT token expired in UserProfileCard - clearing tokens');
          
          // Clear expired tokens from localStorage
          localStorage.removeItem('xorj_session_token');
          localStorage.removeItem('xorj_jwt_token');
          
          throw new Error('Your session has expired. Please refresh the page to sign in again.');
        }
        
        throw new Error(errorData.error || `Balance fetch failed: ${response.status}`);
      }
      
      const data = await response.json();
      const balance = data.balance?.usd || 0;
      
      setWalletBalance(balance);
      console.log(`✅ UserProfileCard: Wallet balance fetched: $${balance.toLocaleString()}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch wallet balance';
      console.error('❌ UserProfileCard: Wallet balance fetch error:', errorMessage);
      setBalanceError(errorMessage);
      setWalletBalance(0);
    } finally {
      setLoadingBalance(false);
    }
  }, [isWalletReady, effectivePublicKey, authenticated]);

  // Bot status is now managed by BotStatusContext
  // Convert shared bot status to UserProfileCard format
  const botStatus = sharedBotStatus ? {
    isBotActive: sharedBotStatus.status === 'active',
    lastUpdated: sharedBotStatus.last_execution ? new Date(sharedBotStatus.last_execution).getTime() : Date.now(),
    vaultAddress: effectivePublicKey ? `${effectivePublicKey.slice(0, -8)}VAULT${effectivePublicKey.slice(-3)}` : undefined
  } : null;

  // Auto-refresh wallet balance when wallet is connected and authenticated
  useEffect(() => {
    if (!isWalletReady) return;

    fetchWalletBalance();
    
    // Set up periodic refresh for wallet balance only (bot status handled by context)
    const interval = setInterval(() => {
      if (authenticated && connected && effectivePublicKey && mounted) {
        console.log('🔄 UserProfileCard: Periodic balance refresh (every 25 seconds)');
        fetchWalletBalance();
      }
    }, 25000); // 25 seconds to avoid overlapping with BotControlsCard
    
    return () => clearInterval(interval);
  }, [isWalletReady, authenticated, fetchWalletBalance]);

  // Note: Authentication is now handled automatically by SimpleWalletContext
  // No need for manual authentication calls here

  // Bot status refresh is now handled by BotStatusContext

  // Copy address to clipboard
  const copyAddress = async () => {
    if (!effectivePublicKey) return;

    try {
      await navigator.clipboard.writeText(effectivePublicKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy address:', err);
    }
  };

  // Format address for display (truncated)
  const formatAddress = (address: string) => {
    if (address.length <= 10) return address;
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };

  // Debug wallet state more thoroughly
  console.log('🚨🚨🚨 UserProfileCard DEBUG:', { 
    mounted, 
    isWalletReady, 
    effectivePublicKey, 
    publicKey: publicKey?.toString(), 
    connected, 
    authenticated,
    windowType: typeof window 
  });

  // If on profile page, wallet should already be connected - show error if not
  if (!mounted || !connected || !publicKey) {
    console.log('🚨 UserProfileCard: No wallet connected on profile page!', { 
      mounted, 
      connected, 
      publicKey: !!publicKey, 
      effectivePublicKey 
    });
    return (
      <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-white">Wallet Information</h2>
        </div>
        <div className="text-center py-8">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">Wallet Connection Error</h3>
          <p className="text-gray-300 mb-4">
            Your wallet connection was lost. Please return to the home page and reconnect your wallet.
          </p>
          <button
            onClick={() => window.location.href = '/'}
            className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-semibold"
          >
            Return to Home
          </button>
        </div>
      </div>
    );
  }

  console.log('✅ UserProfileCard: PAST EARLY RETURN, RENDERING MAIN CONTENT');

  return (
    <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-white">Wallet Information</h2>
      </div>
      
      <div className="space-y-6">
        {/* Wallet Address Section */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-gray-300 mb-1">Wallet Address</h3>
            <div className="flex items-center gap-3">
              <code className="text-lg font-mono text-white bg-black/20 px-3 py-1 rounded">
                {formatAddress(effectivePublicKey)}
              </code>
              <button
                onClick={copyAddress}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                title={copied ? 'Copied!' : 'Copy full address'}
              >
                {copied ? (
                  <CheckCircle className="h-4 w-4 text-green-400" />
                ) : (
                  <Copy className="h-4 w-4 text-gray-400" />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Wallet Balance Section */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-gray-300 mb-1">Available Balance</h3>
            <div className="flex items-center gap-3">
              {loadingBalance ? (
                <div className="flex items-center gap-2 text-gray-400">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Loading balance...</span>
                </div>
              ) : balanceError ? (
                <div className="flex items-center gap-2 text-red-400">
                  <AlertCircle className="h-4 w-4" />
                  <span className="text-sm">
                    {!authenticated ? 'Balance will be available after authentication' : 'Error loading balance'}
                  </span>
                </div>
              ) : walletBalance === 0 && !authenticated ? (
                <div className="flex items-center gap-2 text-blue-400">
                  <AlertCircle className="h-4 w-4" />
                  <span className="text-sm">Balance will be available after wallet authentication</span>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className={`text-lg font-semibold px-3 py-1 rounded ${
                    walletBalance === 0 
                      ? 'text-red-400 bg-red-500/10' 
                      : 'text-green-400 bg-green-500/10'
                  }`}>
                    ${walletBalance.toLocaleString(undefined, { 
                      minimumFractionDigits: 2, 
                      maximumFractionDigits: 2 
                    })}
                  </div>
                  <div className="text-xs text-gray-400">
                    <div>SOL + USDC + other tokens</div>
                    <div>Last updated: {new Date().toLocaleTimeString()}</div>
                    {walletBalance === 0 && (
                      <div className="text-red-400 mt-1">⚠️ No funds available</div>
                    )}
                  </div>
                </div>
              )}
              <button
                onClick={fetchWalletBalance}
                disabled={loadingBalance}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50"
                title="Refresh balance"
              >
                <RefreshCw className={`h-4 w-4 text-gray-400 ${loadingBalance ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </div>

        {/* Bot Status Section */}
        <div className="border-t border-white/10 pt-6">
          <h3 className="text-sm font-medium text-gray-300 mb-3">Bot Status</h3>
          
          {botStatusLoading ? (
            <div className="flex items-center gap-2 text-gray-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>
                {!authenticated ? 'Authenticating wallet...' : 'Checking bot status...'}
              </span>
            </div>
          ) : botStatusError ? (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
              <div className="flex items-center gap-2 text-red-400 mb-2">
                <AlertCircle className="h-4 w-4" />
                <span className="font-medium">Connection Error</span>
              </div>
              <p className="text-sm text-red-300">
                {botStatusError}
              </p>
              <p className="text-xs text-red-300 mt-1">
                Bot status will be available once wallet authentication is complete.
              </p>
            </div>
          ) : botStatus ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${
                  botStatus.isBotActive ? 'bg-green-400' : 'bg-gray-400'
                }`} />
                <span className="text-white font-medium">
                  {botStatus.isBotActive ? 'Bot Active' : 'Bot Inactive'}
                </span>
              </div>
              
              {botStatus.isBotActive && (
                <div className="text-right">
                  <div className="text-xs text-gray-400">
                    Active Trading Enabled
                  </div>
                  {botStatus.vaultAddress && (
                    <div className="text-xs text-gray-500 font-mono">
                      Vault: {formatAddress(botStatus.vaultAddress)}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : !authenticated ? (
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4">
              <div className="flex items-center gap-2 text-yellow-400 mb-1">
                <AlertCircle className="h-4 w-4" />
                <span className="font-medium">Wallet Authentication Required</span>
              </div>
              <p className="text-sm text-yellow-300">
                Bot status data will be available after wallet authentication is complete.
              </p>
            </div>
          ) : (
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
              <div className="flex items-center gap-2 text-blue-400 mb-1">
                <AlertCircle className="h-4 w-4" />
                <span className="font-medium">Data Loading</span>
              </div>
              <p className="text-sm text-blue-300">
                Bot status data will be available soon. Please wait while we sync with your wallet.
              </p>
            </div>
          )}
        </div>

        {/* Additional Info */}
        {botStatus?.isBotActive && (
          <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-green-400 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="text-green-400 font-medium mb-1">Trading Bot Authorized</h4>
                <p className="text-green-300 text-sm">
                  Your XORJ trading bot is actively managing your vault and executing trades
                  based on our proprietary trader intelligence algorithms.
                </p>
              </div>
            </div>
          </div>
        )}

        {botStatus && !botStatus.isBotActive && (
          <div className="bg-gray-500/10 border border-gray-500/20 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-gray-400 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="text-gray-400 font-medium mb-1">Trading Bot Inactive</h4>
                <p className="text-gray-300 text-sm">
                  Your trading bot is currently inactive. Complete the vault setup and 
                  authorization process to enable automated trading.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}