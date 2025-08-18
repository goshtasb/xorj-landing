import { create } from 'zustand'
import { PublicKey } from '@solana/web3.js'

/**
 * Wallet connection states for the application
 */
export enum WalletConnectionStatus {
  Disconnected = 'disconnected',
  Connecting = 'connecting', 
  Connected = 'connected',
  Error = 'error'
}

/**
 * Wallet state interface for Zustand store
 */
interface WalletState {
  // Connection state
  status: WalletConnectionStatus
  publicKey: PublicKey | null
  
  // Error handling
  error: string | null
  
  // Actions
  setConnecting: () => void
  setConnected: (publicKey: PublicKey) => void
  setDisconnected: () => void
  setError: (error: string) => void
  clearError: () => void
}

/**
 * Global Zustand store for wallet connection state
 * 
 * This store manages:
 * - Connection status (disconnected, connecting, connected, error)
 * - User's public key when connected
 * - Error states and messages
 * - Actions for updating wallet state
 * 
 * Usage:
 * ```typescript
 * import { useWalletStore } from '@/store/walletStore'
 * 
 * const { status, publicKey, setConnected } = useWalletStore()
 * ```
 */
export const useWalletStore = create<WalletState>((set) => ({
  // Initial state
  status: WalletConnectionStatus.Disconnected,
  publicKey: null,
  error: null,

  // Actions
  setConnecting: () => set({ 
    status: WalletConnectionStatus.Connecting,
    error: null 
  }),

  setConnected: (publicKey: PublicKey) => set({ 
    status: WalletConnectionStatus.Connected,
    publicKey,
    error: null 
  }),

  setDisconnected: () => set({ 
    status: WalletConnectionStatus.Disconnected,
    publicKey: null,
    error: null 
  }),

  setError: (error: string) => set({ 
    status: WalletConnectionStatus.Error,
    error 
  }),

  clearError: () => set({ error: null })
}))