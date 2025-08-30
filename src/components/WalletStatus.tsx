'use client'

import React, { useState, useEffect } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { CheckCircle, XCircle, Clock, Copy, X } from 'lucide-react'

/**
 * Props for WalletStatus component
 */
interface WalletStatusProps {
  /** Custom className for styling */
  className?: string
  /** Show detailed information */
  detailed?: boolean
  /** Show as modal */
  modal?: boolean
  /** Close handler for modal */
  onClose?: () => void
}

/**
 * Wallet Status Display Component
 * 
 * This component provides a comprehensive status display for wallet connection:
 * - Connection status indicator
 * - Public key display with copy functionality
 * - Network information
 * - Error messages
 * - Wallet type/name
 * 
 * Features:
 * - Real-time status updates
 * - Copy-to-clipboard for addresses
 * - Responsive design
 * - Accessible indicators
 * - Clean, informative UI
 * 
 * Usage:
 * ```tsx
 * <WalletStatus />
 * <WalletStatus detailed={true} />
 * ```
 */
export function WalletStatus({ className = '', detailed = false, modal = false, onClose }: WalletStatusProps) {
  const { publicKey, connected, wallet } = useWallet()
  const [copied, setCopied] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  /**
   * Copy wallet address to clipboard
   */
  const copyToClipboard = async () => {
    if (!publicKey) return
    
    try {
      await navigator.clipboard.writeText(publicKey.toBase58())
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy address:', err)
    }
  }

  /**
   * Get status indicator based on connection state
   */
  const getStatusIndicator = () => {
    if (connected) {
      return (
        <div className="flex items-center text-green-400">
          <CheckCircle className="h-4 w-4 mr-1" />
          <span className="text-sm font-medium">Connected</span>
        </div>
      )
    }
    if (connecting) {
      return (
        <div className="flex items-center text-blue-400">
          <Clock className="h-4 w-4 mr-1" />
          <span className="text-sm font-medium">Connecting...</span>
        </div>
      )
    }
    return (
      <div className="flex items-center text-gray-400">
        <XCircle className="h-4 w-4 mr-1" />
        <span className="text-sm font-medium">Disconnected</span>
      </div>
    )
  }

  // Don't render if not in detailed mode and not connected and not modal
  if (!detailed && !connected && !modal) {
    return null
  }

  const content = (
    <div className="space-y-3">
      {/* Status Indicator */}
      <div className="flex items-center justify-between">
        <h3 className="text-white font-medium">Wallet Status</h3>
        <div className="flex items-center space-x-2">
          {getStatusIndicator()}
          {modal && onClose && (
            <button
              onClick={onClose}
              className="p-1 text-slate-400 hover:text-white transition-colors rounded"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Connected State Details */}
      {connected && publicKey && (
        <div className="space-y-2">
          {/* Wallet Type */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-400">Wallet:</span>
            <span className="text-white">{mounted ? (wallet?.adapter?.name || 'Unknown') : 'Loading...'}</span>
          </div>

          {/* Public Key */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-400">Address:</span>
              <button
                onClick={copyToClipboard}
                className="flex items-center space-x-1 text-purple-400 hover:text-purple-300 transition-colors"
                title="Copy address"
              >
                <Copy className="h-3 w-3" />
                <span className="text-xs">{copied ? 'Copied!' : 'Copy'}</span>
              </button>
            </div>
            <div className="bg-slate-900/50 rounded p-2 font-mono text-xs text-slate-300 break-all">
              {publicKey.toBase58()}
            </div>
          </div>

          {/* Network Info */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-400">Network:</span>
            <span className="text-orange-400 text-xs bg-orange-400/10 px-2 py-1 rounded">
              Devnet
            </span>
          </div>
        </div>
      )}


      {/* Disconnected State Message */}
      {!connected && (detailed || modal) && (
        <div className="text-slate-400 text-sm text-center">
          Connect your wallet to get started with XORJ
        </div>
      )}
    </div>
  )

  // Return as modal or regular component
  if (modal) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className={`bg-slate-900 rounded-xl max-w-md w-full border border-slate-700 ${className}`}>
          <div className="p-6">
            {content}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`bg-slate-800/50 border border-slate-700 rounded-lg p-4 ${className}`}>
      {content}
    </div>
  )
}

/**
 * Compact Wallet Status Component
 * 
 * A minimal status indicator for use in headers or compact spaces
 */
export function CompactWalletStatus({ className = '' }: { className?: string }) {
  const { connected, connecting } = useWallet()
  
  const getStatusColor = () => {
    if (connected) return 'bg-green-400'
    if (connecting) return 'bg-blue-400 animate-pulse'
    return 'bg-gray-400'
  }

  const getStatusText = () => {
    if (connected) return 'connected'
    if (connecting) return 'connecting'
    return 'disconnected'
  }

  return (
    <div className={`flex items-center space-x-2 ${className}`}>
      <div className={`h-2 w-2 rounded-full ${getStatusColor()}`} />
      <span className="text-xs text-slate-400 capitalize">
        {getStatusText()}
      </span>
    </div>
  )
}

/**
 * Export default component
 */
export default WalletStatus