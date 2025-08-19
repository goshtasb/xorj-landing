"use client";

import React, { useState, useEffect } from 'react';
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useRouter } from 'next/navigation';
import { Wallet, LogOut, Loader2, User } from 'lucide-react';


interface EnhancedWalletButtonProps {
  className?: string;
  showFullAddress?: boolean;
}

/**
 * Enhanced Wallet Button with Full Phantom Authentication
 * 
 * Integrates the enhanced Phantom authentication flow with the existing
 * app structure, replacing SimpleWalletButton with full auth support
 */
export function EnhancedWalletButton({ className = '', showFullAddress = false }: EnhancedWalletButtonProps) {
  const [isClient, setIsClient] = useState(false);
  
  // Hooks
  const router = useRouter();
  const { connected, publicKey, disconnect, connecting } = useWallet();
  const { setVisible } = useWalletModal();

  useEffect(() => {
    setIsClient(true);
  }, []);

  const handleConnect = () => {
    setVisible(true);
  };

  const handleDisconnect = async () => {
    try {
      await disconnect();
    } catch (error: any) {
      console.error('❌ Error during disconnect:', error);
    }
  };

  const formatAddress = (address: string, showFull: boolean = false): string => {
    if (showFull) return address;
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };

  const baseButtonClasses = `
    inline-flex items-center justify-center px-4 py-2 rounded-lg font-medium
    transition-all duration-200 transform hover:scale-105
    focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2
    disabled:cursor-not-allowed disabled:opacity-50 disabled:transform-none
    ${className}
  `;

  // Show loading state during hydration
  if (!isClient) {
    return (
      <button
        disabled
        className={`${baseButtonClasses} bg-gray-600 text-white cursor-not-allowed`}
      >
        <Loader2 className="animate-spin h-4 w-4 mr-2" />
        Loading...
      </button>
    );
  }

  if (connecting) {
    return (
      <button
        disabled
        className={`${baseButtonClasses} bg-purple-600 text-white`}
      >
        <Loader2 className="animate-spin h-4 w-4 mr-2" />
        Connecting...
      </button>
    );
  }

  if (connected && publicKey) {
    return (
      <div className="flex items-center space-x-2">
        <button
          onClick={() => router.push('/profile')}
          className={`${baseButtonClasses} bg-green-600 hover:bg-green-700 text-white cursor-pointer`}
          title="Go to Profile"
        >
          <User className="h-4 w-4 mr-2" />
          {formatAddress(publicKey.toString(), showFullAddress)}
        </button>
        <button
          onClick={handleDisconnect}
          className={`${baseButtonClasses} bg-red-600 hover:bg-red-700 text-white`}
          title="Disconnect Wallet"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={handleConnect}
      className={`${baseButtonClasses} bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white shadow-lg`}
    >
      <Wallet className="h-4 w-4 mr-2" />
      Connect Wallet
    </button>
  );
}

export default EnhancedWalletButton;