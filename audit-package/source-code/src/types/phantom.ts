// Global type definitions for Phantom wallet
// This centralizes wallet type definitions to avoid conflicts

import { PublicKey } from '@solana/web3.js';

export interface PhantomProvider {
  isPhantom: boolean;
  connect: (options?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey: PublicKey }>;
  disconnect: () => Promise<void>;
  isConnected: boolean;
  publicKey: PublicKey | null;
  on: (event: string, callback: (publicKey: PublicKey | null) => void) => void;
  off: (event: string, callback: (publicKey: PublicKey | null) => void) => void;
  request: (method: string, params?: any) => Promise<any>;
}

export interface PhantomWindow extends Window {
  phantom?: {
    solana?: PhantomProvider;
  };
  solana?: PhantomProvider;
}

declare global {
  interface Window {
    phantom?: {
      solana?: PhantomProvider;
    };
    solana?: PhantomProvider;
  }
}

export {};
