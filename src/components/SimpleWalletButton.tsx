'use client'

import React, { useState, useEffect } from 'react'
import { PublicKey } from '@solana/web3.js'
import { Wallet, LogOut, Loader2, AlertCircle, X, RefreshCw } from 'lucide-react'

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

interface SimpleWalletButtonProps {
  className?: string
  showFullAddress?: boolean
}

/**
 * Simple Wallet Button - Direct Phantom Connection
 * 
 * Bypasses the complex wallet adapter system and connects directly
 * to Phantom wallet. This should eliminate connection errors.
 */
export function SimpleWalletButton({ className = '', showFullAddress = false }: SimpleWalletButtonProps) {
  const [publicKey, setPublicKey] = useState<PublicKey | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)

  // Check for existing connection on mount
  useEffect(() => {
    // Check for manual connection first
    const manualKey = window.localStorage.getItem('manual_wallet_key')
    if (manualKey) {
      try {
        const publicKey = new PublicKey(manualKey)
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
    }

    if (window.phantom?.solana) {
      window.phantom.solana.on('accountChanged', handleAccountChanged)
      return () => {
        window.phantom.solana?.off('accountChanged', handleAccountChanged)
      }
    }
  }, [])

  const handleConnect = async () => {
    setError(null)
    setConnecting(true)
    setShowModal(false) // Close modal immediately to prevent flashing

    try {
      console.log('=== Phantom Connection Debug ===')
      console.log('Window available:', typeof window !== 'undefined')
      console.log('Phantom object:', !!window.phantom)
      console.log('Phantom.solana:', !!window.phantom?.solana)
      console.log('isPhantom:', window.phantom?.solana?.isPhantom)
      console.log('isConnected:', window.phantom?.solana?.isConnected)
      
      if (typeof window === 'undefined') {
        throw new Error('Window not available')
      }

      if (!window.phantom?.solana) {
        console.log('Phantom not found, opening download page')
        window.open('https://phantom.app/', '_blank')
        throw new Error('Phantom wallet not installed. Please install Phantom wallet first.')
      }

      if (!window.phantom.solana.isPhantom) {
        throw new Error('Invalid Phantom wallet detected')
      }

      // Check if already connected
      if (window.phantom.solana.isConnected && window.phantom.solana.publicKey) {
        console.log('Already connected, using existing connection')
        setPublicKey(window.phantom.solana.publicKey)
        setError(null)
        return
      }

      console.log('Attempting connection with various methods...')
      
      // Try different connection approaches with delays
      let response
      let lastError
      
      const connectionMethods = [
        { name: 'Method 1: Direct window.solana approach', fn: async () => {
          // Try using window.solana directly (sometimes works better)
          if ((window as any).solana && (window as any).solana.isPhantom) {
            return await (window as any).solana.connect()
          }
          throw new Error('Direct solana not available')
        }},
        { name: 'Method 2: Standard phantom.solana.connect()', fn: () => window.phantom.solana.connect() },
        { name: 'Method 3: connect() with onlyIfTrusted: false', fn: () => window.phantom.solana.connect({ onlyIfTrusted: false }) },
        { name: 'Method 4: Legacy approach with timeout', fn: async () => {
          return await Promise.race([
            window.phantom.solana.connect(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
          ])
        }},
        { name: 'Method 5: Force refresh connection', fn: async () => {
          // Try to disconnect first, then reconnect
          try {
            await window.phantom.solana.disconnect()
          } catch (e) {
            console.log('Disconnect failed (expected):', e)
          }
          await new Promise(resolve => setTimeout(resolve, 300))
          return window.phantom.solana.connect()
        }}
      ]
      
      for (const method of connectionMethods) {
        try {
          console.log(method.name)
          response = await method.fn()
          console.log(`${method.name} succeeded!`)
          break
        } catch (err) {
          console.log(`${method.name} failed:`, err)
          lastError = err
          // Add delay between methods
          await new Promise(resolve => setTimeout(resolve, 300))
        }
      }
      
      if (!response) {
        console.log('All connection methods failed')
        throw lastError
      }
      
      if (!response || !response.publicKey) {
        throw new Error('No response or public key received from Phantom')
      }
      
      console.log('Connection successful:', response.publicKey.toString())
      setPublicKey(response.publicKey)
      setError(null)
      
    } catch (err: any) {
      console.error('=== Connection Error Details ===')
      console.error('Error object:', err)
      console.error('Error message:', err.message)
      console.error('Error code:', err.code)
      console.error('Error stack:', err.stack)
      
      // Handle specific error types
      let errorMessage = 'Failed to connect wallet'
      
      if (err.message?.includes('User rejected') || err.message?.includes('rejected')) {
        errorMessage = 'Connection cancelled. Please approve the connection when prompted.'
      } else if (err.message?.includes('not installed')) {
        errorMessage = 'Phantom wallet not installed. Please install it first.'
      } else if (err.code === 4001 || err.code === -32602) {
        errorMessage = 'Connection rejected. Please approve the connection to continue.'
      } else if (err.code === -32603) {
        errorMessage = 'Phantom wallet internal error. Please refresh the page and try again, or restart your browser.'
      } else if (err.message?.includes('Unexpected')) {
        errorMessage = 'Phantom wallet error. Please refresh the page and try again.'
      } else if (err.message) {
        errorMessage = `Connection error: ${err.message}`
      }
      
      setError(errorMessage)
    } finally {
      setConnecting(false)
    }
  }

  const handleDisconnect = async () => {
    try {
      console.log('SimpleWalletButton: Disconnecting...')
      
      // Get the old value before removing
      const oldValue = window.localStorage.getItem('manual_wallet_key')
      
      // Clear manual connection
      window.localStorage.removeItem('manual_wallet_key')
      
      // Trigger storage event to sync with context
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'manual_wallet_key',
        newValue: null,
        oldValue: oldValue,
        url: window.location.href
      }))
      
      // Disconnect phantom if connected
      if (window.phantom?.solana) {
        await window.phantom.solana.disconnect()
      }
      
      // Clear local state
      setPublicKey(null)
      setError(null)
      
      // Force a page refresh to ensure complete cleanup
      setTimeout(() => {
        console.log('Refreshing page to complete disconnect')
        window.location.reload()
      }, 100)
      
      console.log('SimpleWalletButton: Disconnected successfully')
    } catch (err: any) {
      console.error('Disconnect error:', err)
    }
  }

  const formatAddress = (address: string, showFull: boolean = false): string => {
    if (showFull) return address
    return `${address.slice(0, 4)}...${address.slice(-4)}`
  }

  const baseButtonClasses = `
    inline-flex items-center justify-center px-4 py-2 rounded-lg font-medium
    transition-all duration-200 transform hover:scale-105
    focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2
    disabled:cursor-not-allowed disabled:opacity-50 disabled:transform-none
    ${className}
  `

  if (connecting) {
    return (
      <button
        disabled
        className={`${baseButtonClasses} bg-purple-600 text-white`}
      >
        <Loader2 className="animate-spin h-4 w-4 mr-2" />
        Connecting...
      </button>
    )
  }

  if (publicKey) {
    return (
      <div className="flex items-center space-x-2">
        <div className={`${baseButtonClasses} bg-green-600 text-white cursor-default`}>
          <Wallet className="h-4 w-4 mr-2" />
          {formatAddress(publicKey.toString(), showFullAddress)}
        </div>
        <button
          onClick={handleDisconnect}
          className={`${baseButtonClasses} bg-red-600 hover:bg-red-700 text-white`}
          title="Disconnect Wallet"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    )
  }

  if (error) {
    const isRefreshError = error.includes('refresh') || error.includes('internal error')
    
    return (
      <div className="flex flex-col items-center space-y-3">
        <div className="flex space-x-2">
          <button
            onClick={() => {
              setError(null)
              setShowModal(true)
            }}
            className={`${baseButtonClasses} bg-red-600 hover:bg-red-700 text-white`}
          >
            <AlertCircle className="h-4 w-4 mr-2" />
            Try Again
          </button>
          {isRefreshError && (
            <button
              onClick={() => window.location.reload()}
              className={`${baseButtonClasses} bg-blue-600 hover:bg-blue-700 text-white`}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh Page
            </button>
          )}
        </div>
        {error && (
          <p className="text-xs text-red-400 text-center max-w-xs">
            {error}
          </p>
        )}
        {isRefreshError && (
          <div className="bg-yellow-900/20 border border-yellow-600/20 rounded-lg p-3 max-w-sm">
            <h4 className="text-yellow-300 font-medium text-sm mb-2">Troubleshooting Steps:</h4>
            <ul className="text-xs text-yellow-200 space-y-1">
              <li>1. Click "Refresh Page" above</li>
              <li>2. If that fails, restart your browser</li>
              <li>3. Make sure Phantom extension is updated</li>
              <li>4. Try disabling/re-enabling Phantom extension</li>
            </ul>
          </div>
        )}
        {showModal && <ConnectionModal onConnect={handleConnect} onClose={() => setShowModal(false)} />}
      </div>
    )
  }

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className={`${baseButtonClasses} bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white shadow-lg`}
      >
        <Wallet className="h-4 w-4 mr-2" />
        Connect Wallet
      </button>
      {showModal && <ConnectionModal onConnect={handleConnect} onClose={() => setShowModal(false)} />}
    </>
  )
}

// Simple connection modal
function ConnectionModal({ onConnect, onClose }: { onConnect: () => void, onClose: () => void }) {
  const isPhantomAvailable = typeof window !== 'undefined' && window.phantom?.solana?.isPhantom
  const [showManualInput, setShowManualInput] = useState(false)
  const [manualKey, setManualKey] = useState('')

  const handleManualConnect = () => {
    if (manualKey.trim()) {
      try {
        const publicKey = new PublicKey(manualKey.trim())
        // Store the manual connection
        window.localStorage.setItem('manual_wallet_key', publicKey.toString())
        
        // Trigger a storage event manually to sync with SimpleWalletContext
        window.dispatchEvent(new StorageEvent('storage', {
          key: 'manual_wallet_key',
          newValue: publicKey.toString(),
          url: window.location.href
        }))
        
        // Also refresh page to ensure all components sync
        setTimeout(() => {
          window.location.reload()
        }, 100)
      } catch (err) {
        alert('Invalid public key format')
      }
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 rounded-xl max-w-md w-full border border-slate-700">
        <div className="p-6 border-b border-slate-700">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white">Connect Wallet</h3>
            <button onClick={onClose} className="text-slate-400 hover:text-white">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        
        <div className="p-6 space-y-4">
          {isPhantomAvailable ? (
            <>
              <button
                onClick={onConnect}
                className="w-full flex items-center space-x-3 p-4 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
              >
                <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center">
                  <Wallet className="h-5 w-5 text-white" />
                </div>
                <div className="text-left">
                  <div className="text-white font-medium">Phantom</div>
                  <div className="text-sm text-slate-400">Ready to connect</div>
                </div>
              </button>
              
              <div className="border-t border-slate-700 pt-4">
                <button
                  onClick={() => setShowManualInput(!showManualInput)}
                  className="w-full text-sm text-slate-400 hover:text-slate-300"
                >
                  {showManualInput ? 'Hide' : 'Show'} manual connection (for testing)
                </button>
                
                {showManualInput && (
                  <div className="mt-3 space-y-2">
                    <input
                      type="text"
                      placeholder="Enter your Solana public key for testing..."
                      value={manualKey}
                      onChange={(e) => setManualKey(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-white text-sm"
                    />
                    <button
                      onClick={handleManualConnect}
                      className="w-full py-2 bg-green-600 hover:bg-green-700 text-white text-sm rounded"
                    >
                      Connect Manually (Testing)
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="text-center py-8">
              <p className="text-slate-400 mb-4">Phantom wallet not detected.</p>
              <a
                href="https://phantom.app/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center space-x-2 text-purple-400 hover:text-purple-300"
              >
                <span>Install Phantom Wallet</span>
                <Wallet className="h-4 w-4" />
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default SimpleWalletButton