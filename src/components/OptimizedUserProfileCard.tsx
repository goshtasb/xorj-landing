/**
 * Optimized UserProfileCard Component
 * Uses centralized data fetching to improve performance
 */

'use client';

import React, { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { Copy, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { useOptimizedProfileData } from '@/hooks/useOptimizedProfileData';

export function OptimizedUserProfileCard() {
  const { publicKey } = useWallet();
  const { botStatus, isLoading, error } = useOptimizedProfileData();
  const [copied, setCopied] = useState(false);

  const walletAddress = publicKey?.toString();
  
  // Require actual wallet connection for production
  if (!publicKey) {
    return (
      <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20">
        <div className="flex items-center text-yellow-400">
          <AlertCircle className="w-5 h-5 mr-2" />
          <span>Please connect your wallet to view profile information</span>
        </div>
      </div>
    );
  }

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  if (isLoading) {
    return (
      <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
          <span className="ml-3 text-white">Loading profile...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20">
        <div className="flex items-center text-red-400">
          <AlertCircle className="w-5 h-5 mr-2" />
          <span>{error}</span>
        </div>
      </div>
    );
  }

  const displayAddress = walletAddress!; // Already guaranteed to exist by early return
  const shortAddress = `${displayAddress.slice(0, 4)}...${displayAddress.slice(-4)}`;

  return (
    <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h3 className="text-xl font-semibold text-white mb-2">Wallet Profile</h3>
          {isDemoMode && (
            <div className="bg-yellow-500/20 text-yellow-300 px-3 py-1 rounded-full text-sm mb-3">
              Demo Mode
            </div>
          )}
        </div>
        <div className="flex items-center space-x-2">
          {botStatus?.isBotActive ? (
            <div className="flex items-center text-green-400">
              <CheckCircle className="w-4 h-4 mr-1" />
              <span className="text-sm">Bot Active</span>
            </div>
          ) : (
            <div className="flex items-center text-gray-400">
              <AlertCircle className="w-4 h-4 mr-1" />
              <span className="text-sm">Bot Inactive</span>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Wallet Address
          </label>
          <div className="flex items-center space-x-2">
            <div className="bg-white/5 rounded-lg px-3 py-2 flex-1 font-mono text-sm text-gray-200">
              {shortAddress}
            </div>
            <button
              onClick={() => copyToClipboard(displayAddress || '')}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors group"
              title="Copy full address"
            >
              {copied ? (
                <CheckCircle className="w-4 h-4 text-green-400" />
              ) : (
                <Copy className="w-4 h-4 text-gray-400 group-hover:text-white" />
              )}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Status
            </label>
            <div className="text-white font-semibold">
              {isDemoMode ? 'Demo User' : 'Connected'}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Last Updated
            </label>
            <div className="text-gray-300 text-sm">
              {new Date().toLocaleTimeString()}
            </div>
          </div>
        </div>

        {botStatus?.vaultAddress && (
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Vault Address
            </label>
            <div className="bg-white/5 rounded-lg px-3 py-2 font-mono text-sm text-gray-200">
              {`${botStatus.vaultAddress.slice(0, 8)}...${botStatus.vaultAddress.slice(-8)}`}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}