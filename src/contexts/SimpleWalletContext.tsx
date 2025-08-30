'use client'

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo } from 'react'
import { PublicKey, Connection, clusterApiUrl } from '@solana/web3.js'
import { useWallet } from '@solana/wallet-adapter-react'
import type { PhantomProvider } from '@/types/phantom'

// Extend window interface for wallet providers
declare global {
  interface Window {
    phantom?: {
      solana?: PhantomProvider;
    };
    solana?: PhantomProvider;
  }
}

export interface SimpleWalletContextType {
  publicKey: PublicKey | null
  connected: boolean
  connecting: boolean
  authenticated: boolean
  connect: () => Promise<void>
  disconnect: () => Promise<void>
  authenticateManually: () => Promise<void>
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
  authenticateManually: async () => {},
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
  // Use Solana wallet adapter as source of truth for wallet connection
  const { publicKey: adapterPublicKey, connected: adapterConnected, connecting: adapterConnecting } = useWallet()
  
  // SimpleWallet only manages authentication state
  const [error, setError] = useState<string | null>(null)
  const [networkStatus, setNetworkStatus] = useState<'checking' | 'online' | 'offline' | 'error'>('checking')
  const [authenticated, setAuthenticated] = useState(false)
  const [authLoading, setAuthLoading] = useState(false)

  // Use adapter state as source of truth
  const publicKey = adapterPublicKey
  const connected = adapterConnected
  const connecting = adapterConnecting || authLoading

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
      await connection.getVersion()
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

  // Token validation function
  const validateToken = useCallback(() => {
    if (typeof window === 'undefined') return false
    
    const token = localStorage.getItem('xorj_jwt_token')
    if (!token) return false
    
    try {
      // Decode JWT token to check expiration
      const payload = JSON.parse(atob(token.split('.')[1]))
      const currentTime = Math.floor(Date.now() / 1000)
      
      if (payload.exp && payload.exp < currentTime) {
        console.log('🔒 JWT token has expired')
        localStorage.removeItem('xorj_jwt_token')
        setError('Your session has expired. Please log in again.')
        setAuthenticated(false)
        return false
      }
      
      return true
    } catch (error) {
      console.error('❌ Invalid JWT token:', error)
      localStorage.removeItem('xorj_jwt_token')
      setError('Your session has expired. Please log in again.')
      setAuthenticated(false)
      return false
    }
  }, [])

  // Authenticate with gateway after wallet connection (with debounce to prevent duplicate calls)
  const authenticateWithGateway = useCallback(async (walletAddress: string) => {
    // Prevent multiple concurrent authentication attempts
    if (authLoading) {
      console.log('🔐 Authentication already in progress, skipping duplicate call')
      return
    }

    // Don't authenticate if wallet isn't connected
    if (!connected || !publicKey) {
      console.log('🔐 Wallet not connected, skipping authentication')
      return
    }

    try {
      console.log('🔐 Authenticating with gateway:', walletAddress)
      setAuthLoading(true)
      setError(null)
      
      // Call Next.js API which proxies to FastAPI gateway
      const response = await fetch('/api/auth/authenticate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          wallet_address: walletAddress,
          signature: 'YXV0aGVudGljYXRlZF92aWFfd2FsbGV0X2FkYXB0ZXI=', // base64 encoded 'authenticated_via_wallet_adapter'
          message: 'XORJ SimpleWallet Authentication'
        })
      })
      
      if (response.ok) {
        const result = await response.json()
        if (result.success && result.session_token) {
          // Store the session token in botService
          await import('@/lib/botService')
          
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
      setError('Authentication failed. Please try again.')
      setAuthenticated(false)
    } finally {
      setAuthLoading(false)
    }
  }, [authLoading, connected, publicKey])

  // Authentication with actual signature for proper signature verification
  const authenticateWithSignature = useCallback(async (walletAddress: string, signature: string, message: string) => {
    try {
      console.log('🔐 Authenticating with real signature for:', walletAddress)
      setAuthLoading(true)
      setError(null)
      
      // Call Next.js API with real signature
      const response = await fetch('/api/auth/authenticate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          wallet_address: walletAddress,
          signature: signature,
          message: message
        })
      })
      
      if (response.ok) {
        const result = await response.json()
        if (result.success && result.session_token) {
          // Store the JWT token
          if (typeof window !== 'undefined') {
            localStorage.setItem('xorj_jwt_token', result.session_token)
          }
          
          setAuthenticated(true)
          console.log('✅ Authentication successful with real signature - session token stored')
        } else {
          console.warn('⚠️ Authentication failed:', result.error)
          setError('Authentication failed. Please try again.')
          setAuthenticated(false)
        }
      } else {
        console.warn('⚠️ Authentication request failed:', response.status)
        setError('Authentication failed. Please try again.')
        setAuthenticated(false)
      }
    } catch (error) {
      console.error('❌ Authentication error:', error)
      setError('Authentication failed. Please try again.')
      setAuthenticated(false)
    } finally {
      setAuthLoading(false)
    }
  }, [])

  // Manual authentication - disabled auto-auth for proper test flow
  // NOTE: Authentication now requires explicit user action via sign-in button
  // useEffect(() => {
  //   if (typeof window === 'undefined') return

  //   // If wallet is connected via Solana adapter, authenticate automatically
  //   if (connected && publicKey && !authenticated && !authLoading) {
  //     console.log('SimpleWalletContext: Wallet connected via adapter, authenticating:', publicKey.toString())
  //     authenticateWithGateway(publicKey.toString())
  //   }
  // }, [connected, publicKey, authenticated, authLoading, authenticateWithGateway])

  // Clear authentication when wallet disconnects
  useEffect(() => {
    if (!connected || !publicKey) {
      setAuthenticated(false)
      setError(null)
    }
  }, [connected, publicKey])

  // Connection is handled by Solana adapter - this just clears errors
  const connect = useCallback(async () => {
    setError(null)
    console.log('SimpleWallet: Connection is handled by Solana adapter')

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
      const phantomProvider = window.phantom?.solana
      const directSolana = window.solana
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
      
      // Always disconnect first to ensure fresh connection prompt
      if (provider.isConnected) {
        console.log('Wallet already connected, disconnecting to show fresh prompt')
        try {
          await provider.disconnect()
        } catch (disconnectError) {
          console.log('Disconnect error (expected):', disconnectError)
        }
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
        } catch {
          console.log('Standard connect failed, trying alternative approach')
          // Strategy 2: Try requesting permissions explicitly first
          if (provider.request) {
            console.log('Trying explicit permission request')
            await provider.request('connect', {})
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
  }, [checkNetworkHealth, categorizeError, authenticateWithGateway])

  // Manual authentication function for two-step auth flow
  const authenticateManually = useCallback(async () => {
    if (!connected || !publicKey) {
      setError('Please connect your wallet first')
      return
    }
    
    console.log('🔐 Manual authentication triggered for:', publicKey.toString())
    
    try {
      // Request signature from user's wallet
      const message = 'XORJ SimpleWallet Authentication';
      const encodedMessage = new TextEncoder().encode(message);
      
      // Get provider reference
      const phantomProvider = window.phantom?.solana;
      const directSolana = window.solana;
      const provider = phantomProvider || directSolana;
      
      if (!provider) {
        setError('Phantom wallet not found. Please install Phantom wallet.');
        return;
      }
      
      console.log('🔐 Requesting signature from user for message:', message);
      
      // Request signature - user can reject this
      const signedMessage = await provider.signMessage(encodedMessage, 'utf8');
      
      if (!signedMessage || !signedMessage.signature) {
        setError('Signature is required to log in');
        return;
      }
      
      console.log('✅ User provided signature, proceeding with authentication');
      
      // Convert signature to base64 for API
      const signature = btoa(String.fromCharCode(...new Uint8Array(signedMessage.signature)));
      
      // Call authentication with actual signature
      await authenticateWithSignature(publicKey.toString(), signature, message);
      
    } catch (error: unknown) {
      const err = error as Error;
      console.error('❌ Signature request failed:', err);
      
      // Handle user rejection specifically
      if (err.message?.includes('User rejected') || err.message?.includes('rejected') || err.code === 4001) {
        setError('Signature is required to log in');
      } else {
        setError('Authentication failed. Please try again.');
      }
    }
  }, [connected, publicKey])

  // Retry connection function
  const retryConnection = useCallback(async () => {
    clearError()
    await connect()
  }, [connect, clearError])

  const disconnect = async () => {
    try {
      // Clear all XORJ-related cache
      window.localStorage.removeItem('manual_wallet_key')
      window.localStorage.removeItem('xorj_session_token')
      window.localStorage.removeItem('xorj_jwt_token')
      
      // Clear authentication
      setAuthenticated(false)
      
      // Disconnect phantom if connected
      const phantomProvider = window.phantom?.solana
      const directSolana = window.solana
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

  // Initialize network health check and token validation on mount (client-side only)
  useEffect(() => {
    // Only run on client-side
    if (typeof window === 'undefined') return
    
    // Check token validity on mount/refresh
    const isValidToken = validateToken()
    if (isValidToken && connected && publicKey) {
      setAuthenticated(true)
      console.log('✅ Valid token found, user is authenticated')
    }
    
    checkNetworkHealth()
    
    // Periodic network health checks every 30 seconds
    const healthCheckInterval = setInterval(() => {
      if (!connecting && !connected) {
        checkNetworkHealth()
      }
    }, 30000)

    return () => clearInterval(healthCheckInterval)
  }, [checkNetworkHealth, connecting, connected, validateToken, publicKey])

  const value: SimpleWalletContextType = {
    publicKey,
    connected,
    connecting,
    authenticated,
    connect,
    disconnect,
    authenticateManually,
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