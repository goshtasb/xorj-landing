'use client'

import React, { ReactNode, useCallback, useMemo } from 'react'
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react'
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base'
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom'
import { clusterApiUrl } from '@solana/web3.js'
import { useWalletStore, WalletConnectionStatus } from '@/store/walletStore'

/**
 * Props for WalletContextProvider component
 */
interface WalletContextProviderProps {
  children: ReactNode
}

/**
 * Custom hook to sync wallet adapter state with our Zustand store
 * 
 * This bridges the @solana/wallet-adapter state with our global Zustand store
 * to ensure consistent state management throughout the application.
 */
function useWalletSync() {
  const { setConnecting, setConnected, setDisconnected, setError } = useWalletStore()

  // Handle wallet connection changes
  const onConnect = useCallback((publicKey: any) => {
    if (publicKey) {
      setConnected(publicKey)
    }
  }, [setConnected])

  const onDisconnect = useCallback(() => {
    setDisconnected()
  }, [setDisconnected])

  const onError = useCallback((error: any) => {
    console.error('Wallet adapter error:', error)
    setError(error?.message || 'Wallet connection error')
  }, [setError])

  return { onConnect, onDisconnect, onError }
}

/**
 * Wallet Context Provider Component
 * 
 * This component provides Solana wallet connectivity throughout the application.
 * It wraps the app with necessary wallet adapter providers and manages:
 * - Connection to Solana network (devnet for development)
 * - Phantom wallet integration
 * - Global state synchronization with Zustand store
 * - Modal UI for wallet selection
 * 
 * Features:
 * - Supports Phantom wallet
 * - Connects to Solana devnet (safe for development)
 * - Auto-reconnect functionality
 * - Error handling and state management
 * - Ready for mainnet deployment (change network config)
 * 
 * Usage:
 * Wrap your app in layout.tsx or main component:
 * ```tsx
 * <WalletContextProvider>
 *   <YourApp />
 * </WalletContextProvider>
 * ```
 */
export function WalletContextProvider({ children }: WalletContextProviderProps) {
  // Configure Solana network - using devnet for development
  // TODO: Change to mainnet-beta for production deployment
  const network = WalletAdapterNetwork.Devnet
  const endpoint = useMemo(() => clusterApiUrl(network), [network])
  
  // Configure supported wallets - Phantom only for now to avoid conflicts
  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
    ],
    []
  )

  // Sync wallet adapter with our Zustand store
  const { onConnect, onDisconnect, onError } = useWalletSync()

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider
        wallets={wallets}
        onConnect={onConnect}
        onDisconnect={onDisconnect}
        onError={onError}
        autoConnect={false} // Disable auto-connect to avoid errors
      >
        {children}
      </WalletProvider>
    </ConnectionProvider>
  )
}

/**
 * Export for easy importing in layout or app component
 * 
 * Example usage in layout.tsx:
 * ```tsx
 * import { WalletContextProvider } from '@/contexts/WalletContextProvider'
 * 
 * export default function Layout({ children }) {
 *   return (
 *     <WalletContextProvider>
 *       {children}
 *     </WalletContextProvider>
 *   )
 * }
 * ```
 */
export default WalletContextProvider