/**
 * UserProfileCard Component
 * Displays wallet information and bot security status
 */

'use client';

import React, { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { Copy, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

interface BotStatus {
  isBotActive: boolean;
  lastUpdated?: number;
  vaultAddress?: string;
}

export function UserProfileCard() {
  const { publicKey } = useWallet();
  const [botStatus, setBotStatus] = useState<BotStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  
  // Only show real wallet data when actually connected
  const effectivePublicKey = publicKey?.toString();
  const isDemoMode = !publicKey;

  // Fetch bot status from API
  useEffect(() => {
    const fetchBotStatus = async () => {
      // Use effective public key (real or demo)
      if (!effectivePublicKey) return;

      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/user/status?walletAddress=${effectivePublicKey}`);
        
        if (!response.ok) {
          throw new Error(`Failed to fetch bot status: ${response.statusText}`);
        }

        const data = await response.json();
        setBotStatus(data.data); // API returns data in data field
      } catch (err) {
        console.error('Error fetching bot status:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch bot status');
      } finally {
        setIsLoading(false);
      }
    };

    fetchBotStatus();
  }, [effectivePublicKey]);

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

  // Don't render if no wallet connected
  if (!effectivePublicKey) {
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