"use client";

import React, { createContext, useContext, ReactNode } from 'react';
import { useWallet as useSolanaWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from '@solana/web3.js';

interface EnhancedWalletContextType {
  connected: boolean;
  publicKey: PublicKey | null;
  connecting: boolean;
  disconnect: () => Promise<void>;
  wallet: { adapter?: { publicKey?: { toString(): string } } } | null;
}

const EnhancedWalletContext = createContext<EnhancedWalletContextType | null>(null);

interface EnhancedWalletProviderProps {
  children: ReactNode;
}

/**
 * Enhanced Wallet Context Provider
 * 
 * Wraps the Solana wallet adapter and provides a simplified interface
 * that's compatible with the existing SimpleWalletContext API
 */
export function EnhancedWalletProvider({ children }: EnhancedWalletProviderProps) {
  const {
    connected,
    publicKey,
    connecting,
    disconnect,
    wallet
  } = useSolanaWallet();

  const contextValue: EnhancedWalletContextType = {
    connected,
    publicKey,
    connecting,
    disconnect,
    wallet
  };

  return (
    <EnhancedWalletContext.Provider value={contextValue}>
      {children}
    </EnhancedWalletContext.Provider>
  );
}

export function useEnhancedWallet(): EnhancedWalletContextType {
  const context = useContext(EnhancedWalletContext);
  if (!context) {
    throw new Error('useEnhancedWallet must be used within an EnhancedWalletProvider');
  }
  return context;
}