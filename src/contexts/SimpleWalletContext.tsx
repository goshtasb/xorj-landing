'use client'

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { PublicKey } from '@solana/web3.js'

// Extend window type for Phantom
declare global {
  interface Window {
    phantom?: {
      solana?: {
        isPhantom: boolean
        connect: () => Promise<{ publicKey: PublicKey }>
        disconnect: () => Promise<void>
        isConnected: boolean
        publicKey: PublicKey | null
        on: (event: string, callback: Function) => void
        off: (event: string, callback: Function) => void
      }
    }
  }
}

export interface SimpleWalletContextType {
  publicKey: PublicKey | null
  connected: boolean
  connecting: boolean
  connect: () => Promise<void>
  disconnect: () => Promise<void>
  error: string | null
}

const SimpleWalletContext = createContext<SimpleWalletContextType>({
  publicKey: null,
  connected: false,
  connecting: false,
  connect: async () => {},
  disconnect: async () => {},
  error: null
})

export const useSimpleWallet = () => {
  const context = useContext(SimpleWalletContext)
  if (!context) {
    throw new Error('useSimpleWallet must be used within SimpleWalletProvider')
  }
  return context
}

interface SimpleWalletProviderProps {
  children: ReactNode
}

export function SimpleWalletProvider({ children }: SimpleWalletProviderProps) {
  const [publicKey, setPublicKey] = useState<PublicKey | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const connected = !!publicKey

  // Check for existing connection on mount
  useEffect(() => {
    // Check for manual connection first
    const manualKey = window.localStorage.getItem('manual_wallet_key')
    if (manualKey) {
      try {
        const publicKey = new PublicKey(manualKey)
        console.log('SimpleWalletContext: Found manual connection:', publicKey.toString())
        setPublicKey(publicKey)
        return
      } catch (err) {
        console.log('Invalid manual key, removing from storage')
        window.localStorage.removeItem('manual_wallet_key')
      }
    }

    // Check for phantom connection
    if (typeof window !== 'undefined' && window.phantom?.solana?.isConnected) {
      setPublicKey(window.phantom.solana.publicKey)
    }

    // Listen for account changes
    const handleAccountChanged = (publicKey: PublicKey | null) => {
      setPublicKey(publicKey)
      if (!publicKey) {
        setError(null)
      }
    }

    if (window.phantom?.solana) {
      window.phantom.solana.on('accountChanged', handleAccountChanged)
      return () => {
        window.phantom.solana?.off('accountChanged', handleAccountChanged)
      }
    }

    // Listen for manual connection changes (storage events)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'manual_wallet_key') {
        if (e.newValue) {
          try {
            const publicKey = new PublicKey(e.newValue)
            console.log('SimpleWalletContext: Storage updated with manual key:', publicKey.toString())
            setPublicKey(publicKey)
            setError(null)
            setConnecting(false)
          } catch (err) {
            console.log('Invalid manual key from storage')
            setPublicKey(null)
            setError(null)
          }
        } else {
          console.log('SimpleWalletContext: Manual key removed from storage - disconnecting')
          setPublicKey(null)
          setError(null)
          setConnecting(false)
        }
      }
    }

    window.addEventListener('storage', handleStorageChange)
    return () => {
      window.removeEventListener('storage', handleStorageChange)
    }
  }, [])

  const connect = async () => {
    setError(null)
    setConnecting(true)

    try {
      if (typeof window === 'undefined') {
        throw new Error('Window not available')
      }

      if (!window.phantom?.solana) {
        window.open('https://phantom.app/', '_blank')
        throw new Error('Phantom wallet not installed. Please install Phantom wallet first.')
      }

      if (!window.phantom.solana.isPhantom) {
        throw new Error('Invalid Phantom wallet detected')
      }

      // Add a small delay to ensure phantom is ready
      await new Promise(resolve => setTimeout(resolve, 100))

      const response = await window.phantom.solana.connect({ onlyIfTrusted: false })
      setPublicKey(response.publicKey)
      setError(null)
    } catch (err: any) {
      console.error('Connection failed:', err)
      
      // Handle specific error types
      let errorMessage = 'Failed to connect wallet'
      
      if (err.message?.includes('User rejected')) {
        errorMessage = 'Connection cancelled. Please try again and approve the connection.'
      } else if (err.message?.includes('not installed')) {
        errorMessage = 'Phantom wallet not installed. Please install it first.'
      } else if (err.code === 4001) {
        errorMessage = 'Connection rejected. Please approve the connection to continue.'
      } else if (err.message) {
        errorMessage = err.message
      }
      
      setError(errorMessage)
    } finally {
      setConnecting(false)
    }
  }

  const disconnect = async () => {
    try {
      // Clear manual connection
      window.localStorage.removeItem('manual_wallet_key')
      
      // Disconnect phantom if connected
      if (window.phantom?.solana) {
        await window.phantom.solana.disconnect()
      }
      setPublicKey(null)
      setError(null)
      console.log('SimpleWalletContext: Disconnected')
    } catch (err: any) {
      console.error('Disconnect error:', err)
    }
  }

  const value: SimpleWalletContextType = {
    publicKey,
    connected,
    connecting,
    connect,
    disconnect,
    error
  }

  return (
    <SimpleWalletContext.Provider value={value}>
      {children}
    </SimpleWalletContext.Provider>
  )
}

export default SimpleWalletProvider