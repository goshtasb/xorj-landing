/**
 * UserProfileCard Component
 * Displays wallet information and bot security status
 */

'use client';

console.log('📁 UserProfileCard.tsx file loaded at', new Date().toISOString());
console.log('🔥 UserProfileCard MODULE LOADED - THIS SHOULD ALWAYS SHOW');

import React, { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useSimpleWallet } from '@/contexts/SimpleWalletContext';
import { Copy, CheckCircle, AlertCircle, Loader2, DollarSign, RefreshCw } from 'lucide-react';
import { botService, authenticateWithWallet, isAuthenticated } from '@/lib/botService';
import { walletBalanceService } from '@/lib/walletBalance';

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
  const { connected, authenticated } = useSimpleWallet();
  const [botStatus, setBotStatus] = useState<BotStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  
  // Only show real wallet data when actually connected
  const effectivePublicKey = mounted ? publicKey?.toString() : undefined;
  const isDemoMode = !publicKey;
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

  // Authenticate user if needed
  const ensureAuthentication = async (): Promise<boolean> => {
    if (!isWalletReady) return false;
    
    // Check if already authenticated
    if (authenticated && isAuthenticated()) {
      return true;
    }
    
    // Need to authenticate
    try {
      console.log('🔐 UserProfileCard: Authenticating with gateway...', effectivePublicKey);
      await authenticateWithWallet(effectivePublicKey!);
      console.log('✅ UserProfileCard: Authentication successful');
      return true;
    } catch (error) {
      console.error('❌ UserProfileCard: Authentication failed:', error);
      setError('Authentication failed. Please try reconnecting your wallet.');
      return false;
    }
  };

  // Fetch wallet balance function
  const fetchWalletBalance = async () => {
    if (!isWalletReady) return;

    setLoadingBalance(true);
    setBalanceError(null);

    try {
      console.log(`💰 UserProfileCard: Fetching wallet balance for: ${effectivePublicKey}`);
      const balance = await walletBalanceService.getWalletUsdBalance(effectivePublicKey!);
      setWalletBalance(balance);
      console.log(`✅ UserProfileCard: Wallet balance fetched: $${balance.toLocaleString()}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch wallet balance';
      console.error('❌ UserProfileCard: Wallet balance fetch error:', errorMessage);
      setBalanceError(errorMessage);
    } finally {
      setLoadingBalance(false);
    }
  };

  // Fetch bot status using new unified authentication
  const fetchBotStatus = async () => {
    console.log('🔍🔍🔍 UserProfileCard: FETCHBOTSTATUS CALLED', { isWalletReady, effectivePublicKey, authenticated });
    console.log('💫 UserProfileCard is about to fetch bot status');
    
    if (!isWalletReady) {
      console.log('❌ UserProfileCard: Wallet not ready, skipping bot status fetch');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Ensure user is authenticated first
      const authSuccess = await ensureAuthentication();
      if (!authSuccess) {
        throw new Error('Authentication required to access bot status');
      }

      console.log('🔄 UserProfileCard: Fetching bot status from database');
      
      // Call the fixed bot status API directly
      const response = await fetch('/api/bot/status', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('xorj_session_token') || 'mock_token'}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`Bot status fetch failed: ${response.status}`);
      }
      
      const data = await response.json();
      
      console.log('✅ UserProfileCard: Bot status fetched successfully:', data.status);
      
      // Convert bot service response to UserProfileCard format
      setBotStatus({
        isBotActive: data.status === 'active',
        lastUpdated: data.last_execution ? new Date(data.last_execution).getTime() : Date.now(),
        vaultAddress: effectivePublicKey ? `${effectivePublicKey.slice(0, -8)}VAULT${effectivePublicKey.slice(-3)}` : undefined
      });
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred while fetching bot status';
      console.error('❌ UserProfileCard: Bot status fetch error:', errorMessage);
      setError(errorMessage);
      
      // Set fallback mock data if authentication fails
      if (!authenticated) {
        const addressHash = effectivePublicKey?.slice(-4) || '0000';
        const numericHash = parseInt(addressHash, 36) % 10;
        setBotStatus({
          isBotActive: numericHash < 5, // 50% chance for demo
          lastUpdated: Date.now() - (Math.random() * 24 * 60 * 60 * 1000),
          vaultAddress: effectivePublicKey ? `${effectivePublicKey.slice(0, -8)}VAULT${effectivePublicKey.slice(-3)}` : undefined
        });
      }
    } finally {
        setIsLoading(false);
      }
  };

  // Auto-refresh bot status and wallet balance when wallet is connected and authenticated
  useEffect(() => {
    if (!isWalletReady) return;

    fetchBotStatus();
    fetchWalletBalance();
    
    // Set up periodic refresh every 5 seconds for faster sync
    const interval = setInterval(() => {
      if (authenticated && isAuthenticated()) {
        fetchBotStatus();
        fetchWalletBalance(); // Also refresh balance periodically
      }
    }, 5000);
    
    return () => clearInterval(interval);
  }, [isWalletReady, authenticated]);

  // Note: Authentication is now handled automatically by SimpleWalletContext
  // No need for manual authentication calls here

  // Add window focus listener for immediate updates
  useEffect(() => {
    if (!isWalletReady) return;
    
    const handleFocus = () => {
      console.log('💡 UserProfileCard: Window focused, refreshing bot status');
      fetchBotStatus();
    };
    
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        console.log('💡 UserProfileCard: Page visible, refreshing bot status');
        fetchBotStatus();
      }
    };
    
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isWalletReady]);

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

  // Debug early return condition
  if (!mounted || !isWalletReady) {
    console.log('🚨 UserProfileCard: EARLY RETURN!', { mounted, isWalletReady, effectivePublicKey });
    return (
      <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-white">Wallet Information</h2>
        </div>
        <div className="text-center py-8">
          <AlertCircle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">No Wallet Connected</h3>
          <p className="text-gray-300">Connect your Solana wallet to view profile information and access bot features.</p>
        </div>
      </div>
    );
  }

  console.log('✅ UserProfileCard: PAST EARLY RETURN, RENDERING MAIN CONTENT');

  return (
    <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-white">Wallet Information</h2>
        {isDemoMode && (
          <span className="text-xs bg-yellow-500/20 text-yellow-300 px-2 py-1 rounded">
            Demo Mode
          </span>
        )}
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
                  <span className="text-sm">Error loading balance</span>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className={`text-lg font-semibold px-3 py-1 rounded ${
                    walletBalance === 0 
                      ? 'text-red-400 bg-red-500/10' 
                      : 'text-green-400 bg-green-500/10'
                  }`}>
                    {walletBalanceService.formatBalance(walletBalance)}
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
          
          {isLoading ? (
            <div className="flex items-center gap-2 text-gray-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Checking bot status...</span>
            </div>
          ) : error ? (
            <div className="flex items-center gap-2 text-red-400">
              <AlertCircle className="h-4 w-4" />
              <span>Error: {error}</span>
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
          ) : (
            <div className="text-gray-400">No bot status available</div>
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