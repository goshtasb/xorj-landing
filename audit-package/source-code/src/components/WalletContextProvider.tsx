'use client'

import React, { FC, ReactNode, useMemo } from 'react'

// Extend window for Phantom detection
declare global {
  interface Window {
    solana?: {
      isPhantom?: boolean;
      connect?: () => Promise<any>;
      disconnect?: () => Promise<void>;
      on?: (event: string, callback: Function) => void;
      request?: (method: string, params?: any) => Promise<any>;
    };
  }
}
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react'
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui'
import { 
  PhantomWalletAdapter
} from '@solana/wallet-adapter-wallets'
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base'
import { clusterApiUrl } from '@solana/web3.js'
import '@solana/wallet-adapter-react-ui/styles.css'

interface WalletContextProviderProps {
  children: ReactNode
}

export const WalletContextProvider: FC<WalletContextProviderProps> = ({ children }) => {
  // Define the network
  const network = WalletAdapterNetwork.Devnet

  // Define the RPC endpoint
  const endpoint = useMemo(() => clusterApiUrl(network), [network])

  // Define Phantom wallet with enhanced configuration
  const wallets = useMemo(() => {
    // Only run wallet detection on client side
    if (typeof window === 'undefined') {
      // Server-side: return wallets without detection logs
      return [new PhantomWalletAdapter()]
    }
    
    // Client-side: Check if Phantom is available in browser
    const isPhantomInstalled = window.solana && window.solana.isPhantom
    
    if (isPhantomInstalled) {
      console.log('✅ Phantom wallet detected in browser')
    } else {
      console.warn('❌ Phantom wallet not detected. Please install Phantom extension.')
      console.warn('Please visit https://phantom.app to install the Phantom browser extension.')
    }
    
    return [new PhantomWalletAdapter()]
  }, [])

  // Simple error handler for wallet connection issues
  const onError = (error: Error) => {
    // Handle empty or missing error messages
    const errorMessage = error.message || error.name || 'Unknown connection error'
    console.error('Wallet connection error:', errorMessage)
    
    // Show helpful tips for common errors
    if (error.message === 'Unexpected error' || !error.message) {
      console.warn('Tip: Make sure Phantom wallet is installed and unlocked')
    }
  }

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider 
        wallets={wallets} 
        onError={onError}
        autoConnect={false}
        localStorageKey="wallet-adapter"
      >
        <WalletModalProvider>
          {children}
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  )
}

export default WalletContextProvider