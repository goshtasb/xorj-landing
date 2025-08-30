'use client'

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo } from 'react'
import { PublicKey, Connection, clusterApiUrl } from '@solana/web3.js'
import type { PhantomProvider } from '@/types/phantom'

export interface SimpleWalletContextType {
  publicKey: PublicKey | null
  connected: boolean
  connecting: boolean
  authenticated: boolean
  connect: () => Promise<void>
  disconnect: () => Promise<void>
  error: string | null
  clearError: () => void
  networkStatus: 'checking' | 'online' | 'offline' | 'error'
  retryConnection: () => Promise<void>
}

const SimpleWalletContext = createContext<SimpleWalletContextType>({
  publicKey: null,
  connected: false,
  connecting: false,
  authenticated: false,
  connect: async () => {},
  disconnect: async () => {},
  error: null,
  clearError: () => {},
  networkStatus: 'checking',
  retryConnection: async () => {}
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
  const [networkStatus, setNetworkStatus] = useState<'checking' | 'online' | 'offline' | 'error'>('checking')
  const [authenticated, setAuthenticated] = useState(false)

  const connected = !!publicKey

  // Solana network connection for health checking (client-side only)
  const connection = useMemo(() => 
    typeof window !== 'undefined' ? new Connection(clusterApiUrl('devnet')) : null, 
    []
  )

  // Enhanced error categorization
  const categorizeError = useCallback((err: unknown): string => {
    const error = err as Error & { code?: number }
    console.log('Categorizing error:', error)
    
    // Phantom-specific error codes
    if (error.code === -32603) {
      return 'Phantom wallet internal error. Please refresh the page and try again, or restart your browser.'
    } else if (error.code === 4001 || error.code === -32602) {
      return 'Connection rejected. Please approve the connection when prompted by Phantom.'
    } else if (error.message?.includes('User rejected') || error.message?.includes('rejected')) {
      return 'Connection cancelled. Please approve the connection when prompted.'
    } else if (error.message?.includes('not installed')) {
      return 'Phantom wallet not installed. Please install Phantom wallet first.'
    } else if (error.message?.includes('timeout') || error.message?.includes('Connection timeout')) {
      return 'Connection timeout. Please check your internet connection and try again.'
    } else if (error.message?.includes('network')) {
      return 'Network error. Please check your internet connection.'
    } else if (error.message?.includes('Unexpected error') || error.message === 'Unexpected error') {
      return 'Phantom wallet internal error. Please try: 1) Refresh the page, 2) Allow popups for this site, 3) Restart your browser, or 4) Try the manual connection option.'
    } else if (error.message?.includes('Unexpected')) {
      return 'Phantom wallet error. Please refresh the page and try again.'
    } else if (error.message?.includes('All connection attempts failed')) {
      return 'Connection failed after multiple attempts. Please check your Phantom wallet and try again.'
    } else {
      return error.message || 'Failed to connect wallet. Please try again.'
    }
  }, [])

  // Network health check
  const checkNetworkHealth = useCallback(async (): Promise<boolean> => {
    if (!connection) {
      setNetworkStatus('offline')
      return false
    }
    
    try {
      setNetworkStatus('checking')
      const version = await connection.getVersion()
      setNetworkStatus('online')
      return true
    } catch (error) {
      console.error('Network health check failed:', error)
      setNetworkStatus('offline')
      return false
    }
  }, [connection])

  // Clear error function
  const clearError = useCallback(() => {
    setError(null)
  }, [])

  // Authenticate with gateway after wallet connection (with debounce to prevent duplicate calls)
  const authenticateWithGateway = useCallback(async (walletAddress: string) => {
    // Prevent multiple concurrent authentication attempts
    if (connecting) {
      console.log('🔐 Authentication already in progress, skipping duplicate call')
      return
    }

    try {
      console.log('🔐 Authenticating with gateway:', walletAddress)
      setConnecting(true)
      
      // Call Next.js API which proxies to FastAPI gateway
      const response = await fetch('/api/auth/authenticate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          wallet_address: walletAddress
        })
      })
      
      if (response.ok) {
        const result = await response.json()
        if (result.success && result.session_token) {
          // Store the session token in botService
          const { botService } = await import('@/lib/botService')
          
          // Manually store the session token since we got it from the server
          if (typeof window !== 'undefined') {
            localStorage.setItem('xorj_session_token', result.session_token)
          }
          
          setAuthenticated(true)
          console.log('✅ Gateway authentication successful - session token stored')
        } else {
          console.warn('⚠️ Gateway authentication failed:', result.error)
          setAuthenticated(false)
        }
      } else {
        console.warn('⚠️ Gateway authentication request failed:', response.status)
        setAuthenticated(false)
      }
    } catch (error) {
      console.error('❌ Gateway authentication error:', error)
      setAuthenticated(false)
    } finally {
      setConnecting(false)
    }
  }, [connecting])

  // Check for existing connection on mount (client-side only)
  useEffect(() => {
    // Ensure we're on client-side
    if (typeof window === 'undefined') return

    // Check for manual connection first
    const manualKey = window.localStorage.getItem('manual_wallet_key')
    if (manualKey) {
      try {
        const publicKey = new PublicKey(manualKey)
        console.log('SimpleWalletContext: Found manual connection:', publicKey.toString())
        setPublicKey(publicKey)
        // Automatically authenticate with the gateway when manual wallet is detected
        authenticateWithGateway(publicKey.toString())
        return
      } catch (err) {
        console.log('Invalid manual key, removing from storage')
        window.localStorage.removeItem('manual_wallet_key')
      }
    }

    // Check for phantom connection
    const phantomProvider = (window as any).phantom?.solana as PhantomProvider | undefined
    const directSolana = (window as any).solana as PhantomProvider | undefined
    const provider = phantomProvider || directSolana
    
    if (provider?.isConnected && provider.publicKey) {
      setPublicKey(provider.publicKey)
      // Automatically authenticate with the gateway when wallet is already connected
      authenticateWithGateway(provider.publicKey.toString())
    }

    // Listen for account changes
    const handleAccountChanged = (publicKey: PublicKey | null) => {
      setPublicKey(publicKey)
      if (!publicKey) {
        setError(null)
      }
    }

    if (provider) {
      provider.on('accountChanged', handleAccountChanged)
      return () => {
        provider.off('accountChanged', handleAccountChanged)
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

  // Enhanced connection with retry and network checking
  const connect = useCallback(async () => {
    setError(null)
    setConnecting(true)

    try {
      // First check network health
      const networkHealthy = await checkNetworkHealth()
      if (!networkHealthy) {
        throw new Error('network')
      }

      if (typeof window === 'undefined') {
        throw new Error('Window not available')
      }

      // Get provider reference first
      const phantomProvider = (window as any).phantom?.solana as PhantomProvider | undefined
      const directSolana = (window as any).solana as PhantomProvider | undefined
      const provider = phantomProvider || directSolana

      if (!provider) {
        window.open('https://phantom.app/', '_blank')
        throw new Error('Phantom wallet not installed. Please install Phantom wallet first.')
      }

      if (!provider.isPhantom) {
        throw new Error('Invalid Phantom wallet detected')
      }
      
      console.log('=== Phantom Wallet Debug Info ===')
      console.log('Phantom available:', !!provider)
      console.log('Is Phantom:', provider?.isPhantom)
      console.log('Already connected:', provider?.isConnected)
      console.log('Current publicKey:', provider?.publicKey?.toString())
      console.log('================================')
      
      // Check if already connected first
      if (provider.isConnected && provider.publicKey) {
        console.log('Wallet already connected, using existing connection')
        setPublicKey(provider.publicKey)
        setError(null)
        return
      }
      
      console.log('Requesting new Phantom wallet connection...')
      console.log('This will prompt user for permission')
      
      try {
        // First try to connect with user permission (this should show popup)
        console.log('Calling provider.connect() - user will see permission dialog')
        
        // Use different connection strategies
        let connectPromise: Promise<{ publicKey: PublicKey }>
        
        // Strategy 1: Standard connect call that should trigger user prompt
        try {
          console.log('Attempting standard connect with onlyIfTrusted: false')
          connectPromise = provider.connect({ onlyIfTrusted: false })
        } catch (err) {
          console.log('Standard connect failed, trying alternative approach')
          // Strategy 2: Try requesting permissions explicitly first
          if ((provider as any).request) {
            console.log('Trying explicit permission request')
            await (provider as any).request({ method: 'connect', params: {} })
          }
          connectPromise = provider.connect()
        }
        
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Connection timeout - User may have dismissed the permission dialog')), 30000)
        )
        
        console.log('Waiting for user to approve connection in Phantom wallet...')
        const response = await Promise.race([connectPromise, timeoutPromise]) as { publicKey: PublicKey }
        
        console.log('Connect response:', response)
        
        if (response && response.publicKey) {
          console.log('✅ User approved connection! Wallet connected:', response.publicKey.toString())
          setPublicKey(response.publicKey)
          setError(null)
          
          // Automatically authenticate with the gateway after wallet connection
          await authenticateWithGateway(response.publicKey.toString())
        } else {
          console.error('❌ Invalid response from Phantom:', response)
          throw new Error('No public key received from wallet - connection may have been rejected')
        }
        
      } catch (err: unknown) {
        const error = err as Error & { code?: number }
        console.error('=== Connection Error Details ===')
        console.error('Error object:', error)
        console.error('Error code:', error.code)
        console.error('Error message:', error.message)
        console.error('Error stack:', error.stack)
        console.error('===============================')
        
        // Handle specific error cases with better user guidance
        if (error.code === 4001 || error.message?.includes('User rejected') || error.message?.includes('User denied')) {
          throw new Error('You cancelled the connection request. Please click "Connect Wallet" and approve the connection in the Phantom popup.')
        } else if (error.message?.includes('timeout') || error.message?.includes('dismissed')) {
          throw new Error('Connection timed out. This usually means the Phantom permission dialog was not approved. Please try again and click "Connect" in the Phantom popup.')
        } else if (error.message === 'Unexpected error' || error.code === -32603) {
          throw new Error('Phantom wallet internal error. Please: 1) Refresh this page, 2) Make sure Phantom is unlocked, 3) Try disconnecting from all sites in Phantom settings, 4) Update Phantom extension.')
        } else if (error.message?.includes('Invalid') || error.message?.includes('not found')) {
          throw new Error('Phantom wallet not properly installed or detected. Please install/reinstall Phantom extension and refresh the page.')
        } else {
          throw new Error(`Connection failed: ${error.message || 'Unknown error'}. Make sure Phantom wallet is installed, unlocked, and you approve the connection request.`)
        }
      }
      
    } catch (err: unknown) {
      console.error('Connection failed:', err)
      setError(categorizeError(err))
    } finally {
      setConnecting(false)
    }
  }, [checkNetworkHealth, categorizeError])

  // Retry connection function
  const retryConnection = useCallback(async () => {
    clearError()
    await connect()
  }, [connect, clearError])

  const disconnect = async () => {
    try {
      // Clear manual connection
      window.localStorage.removeItem('manual_wallet_key')
      
      // Clear authentication
      setAuthenticated(false)
      
      // Disconnect phantom if connected
      const phantomProvider = (window as any).phantom?.solana as PhantomProvider | undefined
      const directSolana = (window as any).solana as PhantomProvider | undefined
      const provider = phantomProvider || directSolana
      
      if (provider) {
        await provider.disconnect()
      }
      setPublicKey(null)
      setError(null)
      console.log('SimpleWalletContext: Disconnected and deauthenticated')
    } catch (err: unknown) {
      const error = err as Error
      console.error('Disconnect error:', error)
    }
  }

  // Initialize network health check on mount (client-side only)
  useEffect(() => {
    // Only run on client-side
    if (typeof window === 'undefined') return
    
    checkNetworkHealth()
    
    // Periodic network health checks every 30 seconds
    const healthCheckInterval = setInterval(() => {
      if (!connecting && !connected) {
        checkNetworkHealth()
      }
    }, 30000)

    return () => clearInterval(healthCheckInterval)
  }, [checkNetworkHealth, connecting, connected])

  const value: SimpleWalletContextType = {
    publicKey,
    connected,
    connecting,
    authenticated,
    connect,
    disconnect,
    error,
    clearError,
    networkStatus,
    retryConnection
  }

  return (
    <SimpleWalletContext.Provider value={value}>
      {children}
    </SimpleWalletContext.Provider>
  )
}

export default SimpleWalletProvider