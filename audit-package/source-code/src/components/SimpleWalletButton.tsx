'use client'

import React, { useState, useEffect } from 'react'
import { PublicKey } from '@solana/web3.js'
import { Wallet, LogOut, Loader2, AlertCircle, X, RefreshCw, Wifi, WifiOff } from 'lucide-react'
import { useSimpleWallet } from '@/contexts/SimpleWalletContext'
import type { PhantomProvider } from '@/types/phantom'

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
  const { publicKey, connected, connecting, connect, disconnect, error, clearError, networkStatus, retryConnection } = useSimpleWallet()
  const [showModal, setShowModal] = useState(false)
  const [isClient, setIsClient] = useState(false)

  // Ensure client-side rendering
  useEffect(() => {
    setIsClient(true)
  }, [])

  // Handle connect wallet click
  const handleConnect = () => {
    clearError()
    // For better UX, try direct connection first
    handleDirectConnect()
  }

  // Handle direct connect (bypasses modal for better popup handling)
  const handleDirectConnect = async () => {
    console.log('🔌 User clicked Connect Wallet - attempting direct connection')
    clearError()
    try {
      await connect()
      console.log('✅ Direct connection successful')
    } catch (err) {
      console.error('❌ Direct connection failed, showing modal for alternative options')
      // If direct connection fails, show modal with manual options
      setShowModal(true)
    }
  }

  // Handle connect wallet click (alternative - show modal)
  const handleConnectWithModal = () => {
    clearError()
    setShowModal(true)
  }

  // Handle connect from modal
  const handleModalConnect = async () => {
    setShowModal(false)
    await connect()
  }

  // Handle disconnect
  const handleDisconnect = () => {
    disconnect()
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

  // Network status indicator
  const getNetworkIcon = () => {
    switch (networkStatus) {
      case 'online': return <Wifi className="h-3 w-3 text-green-400" />
      case 'offline': return <WifiOff className="h-3 w-3 text-red-400" />
      case 'checking': return <Loader2 className="animate-spin h-3 w-3 text-yellow-400" />
      case 'error': return <WifiOff className="h-3 w-3 text-red-400" />
      default: return null
    }
  }

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
    )
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
    )
  }

  if (connected && publicKey) {
    return (
      <div className="flex items-center space-x-2">
        <div className={`${baseButtonClasses} bg-green-600 text-white cursor-default relative`}>
          <Wallet className="h-4 w-4 mr-2" />
          {formatAddress(publicKey.toString(), showFullAddress)}
          <div className="absolute -top-1 -right-1" title={`Network: ${networkStatus}`}>
            {getNetworkIcon()}
          </div>
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
    const isNetworkError = error.includes('network') || error.includes('timeout')
    
    return (
      <div className="flex flex-col items-center space-y-3">
        <div className="flex space-x-2">
          <button
            onClick={() => retryConnection()}
            className={`${baseButtonClasses} bg-red-600 hover:bg-red-700 text-white`}
          >
            <AlertCircle className="h-4 w-4 mr-2" />
            Retry Connection
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
          {isNetworkError && (
            <button
              onClick={() => setShowModal(true)}
              className={`${baseButtonClasses} bg-purple-600 hover:bg-purple-700 text-white`}
            >
              <Wallet className="h-4 w-4 mr-2" />
              Manual Connect
            </button>
          )}
        </div>
        
        {error && (
          <div className="bg-red-900/20 border border-red-600/20 rounded-lg p-3 max-w-sm">
            <p className="text-xs text-red-300 text-center">
              {error}
            </p>
            <div className="flex items-center justify-center mt-2 space-x-2">
              <span className="text-xs text-red-400">Network:</span>
              {getNetworkIcon()}
              <span className="text-xs text-red-400">{networkStatus}</span>
            </div>
          </div>
        )}

        {isRefreshError && (
          <div className="bg-yellow-900/20 border border-yellow-600/20 rounded-lg p-3 max-w-sm">
            <h4 className="text-yellow-300 font-medium text-sm mb-2">Troubleshooting Steps:</h4>
            <ul className="text-xs text-yellow-200 space-y-1">
              <li>1. Click &apos;Retry Connection&apos; above</li>
              <li>2. If that fails, click &apos;Refresh Page&apos;</li>
              <li>3. Make sure Phantom extension is updated</li>
              <li>4. Try disabling/re-enabling Phantom extension</li>
            </ul>
          </div>
        )}

        {isNetworkError && (
          <div className="bg-orange-900/20 border border-orange-600/20 rounded-lg p-3 max-w-sm">
            <h4 className="text-orange-300 font-medium text-sm mb-2">Network Issues:</h4>
            <ul className="text-xs text-orange-200 space-y-1">
              <li>1. Check your internet connection</li>
              <li>2. Try connecting to a VPN</li>
              <li>3. Use &apos;Manual Connect&apos; as a fallback</li>
              <li>4. Wait a moment and retry connection</li>
            </ul>
          </div>
        )}

        {showModal && <ConnectionModal onConnect={handleModalConnect} onClose={() => setShowModal(false)} />}
      </div>
    )
  }

  return (
    <>
      <div className="flex flex-col items-center space-y-2">
        <button
          onClick={handleConnect}
          className={`${baseButtonClasses} bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white shadow-lg relative`}
          disabled={networkStatus === 'offline'}
        >
          <Wallet className="h-4 w-4 mr-2" />
          Connect Phantom Wallet
          <div className="absolute -top-1 -right-1" title={`Network: ${networkStatus}`}>
            {getNetworkIcon()}
          </div>
        </button>
        <button
          onClick={handleConnectWithModal}
          className="text-xs text-slate-400 hover:text-slate-300 underline"
        >
          More options
        </button>
      </div>
      {showModal && <ConnectionModal onConnect={handleModalConnect} onClose={() => setShowModal(false)} />}
    </>
  )
}

// Simple connection modal
function ConnectionModal({ onConnect, onClose }: { onConnect: () => void, onClose: () => void }) {
  const isPhantomAvailable = typeof window !== 'undefined' && 
    ((window as any).phantom?.solana?.isPhantom || (window as any).solana?.isPhantom)
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
        return
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
              <div className="text-center mb-4">
                <p className="text-slate-300 text-sm mb-3">
                  🔒 <strong>You will be asked to approve this connection</strong>
                </p>
                <p className="text-slate-300 text-xs">
                  When you click "Connect with Phantom" below, your Phantom wallet will open a popup asking for permission to connect to this site. You must click "Connect" in that popup to proceed.
                </p>
              </div>
              
              <div className="bg-blue-900/20 border border-blue-600/20 rounded-lg p-3 mb-4">
                <p className="text-blue-300 text-xs mb-2">
                  ⚡ <strong>Connection Requirements:</strong>
                </p>
                <ol className="text-blue-200 text-xs space-y-1">
                  <li>1. Make sure popups are allowed for this site</li>
                  <li>2. Phantom wallet must be unlocked</li>
                  <li>3. Click "Connect" when Phantom popup appears</li>
                  <li>4. If no popup appears, check popup blocker settings</li>
                </ol>
              </div>
              <button
                onClick={onConnect}
                className="w-full flex items-center space-x-3 p-4 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
              >
                <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center">
                  <Wallet className="h-5 w-5 text-white" />
                </div>
                <div className="text-left">
                  <div className="text-white font-medium">Connect with Phantom</div>
                  <div className="text-sm text-slate-400">Will prompt for your approval</div>
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