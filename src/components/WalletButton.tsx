'use client'

import React, { useState, useEffect } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { useWalletStore, WalletConnectionStatus } from '@/store/walletStore'
import { Wallet, LogOut, Loader2, AlertCircle } from 'lucide-react'
import WalletConnectionModal from './WalletConnectionModal'

/**
 * Props for WalletButton component
 */
interface WalletButtonProps {
  /** Custom className for styling */
  className?: string
  /** Show full address or truncated version */
  showFullAddress?: boolean
}

/**
 * Wallet Connection Button Component
 * 
 * This component provides a comprehensive wallet connection interface:
 * - Connect wallet button when disconnected
 * - Loading state during connection
 * - Connected state showing wallet address
 * - Disconnect functionality
 * - Error handling and display
 * 
 * Features:
 * - Integrates with Solana wallet adapter
 * - Uses Zustand store for global state
 * - Responsive design with Tailwind CSS
 * - Consistent with existing app styling
 * - Accessible and user-friendly
 * 
 * Usage:
 * ```tsx
 * <WalletButton />
 * <WalletButton className="custom-styles" showFullAddress={true} />
 * ```
 */
export function WalletButton({ className = '', showFullAddress = false }: WalletButtonProps) {
  const { disconnect, publicKey, wallet, connect, connecting } = useWallet()
  const { status, error, clearError } = useWalletStore()
  const [showModal, setShowModal] = useState(false)

  // Auto-connect when wallet is selected
  useEffect(() => {
    const autoConnect = async () => {
      if (wallet && !publicKey && !connecting) {
        try {
          console.log('Auto-connecting to selected wallet:', wallet.adapter.name)
          await connect()
        } catch (error) {
          console.error('Auto-connect failed:', error)
        }
      }
    }

    autoConnect()
  }, [wallet, publicKey, connecting, connect])

  /**
   * Handle connect wallet click
   * Opens wallet selection modal
   */
  const handleConnect = () => {
    clearError()
    setShowModal(true)
  }

  /**
   * Handle disconnect wallet click
   * Disconnects the currently connected wallet
   */
  const handleDisconnect = () => {
    disconnect()
  }

  /**
   * Format wallet address for display
   * @param address - The wallet's public key
   * @param showFull - Whether to show full address or truncate
   * @returns Formatted address string
   */
  const formatAddress = (address: string, showFull: boolean = false): string => {
    if (showFull) return address
    return `${address.slice(0, 4)}...${address.slice(-4)}`
  }

  // Base button classes for consistency
  const baseButtonClasses = `
    inline-flex items-center justify-center px-4 py-2 rounded-lg font-medium
    transition-all duration-200 transform hover:scale-105
    focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2
    disabled:cursor-not-allowed disabled:opacity-50 disabled:transform-none
    ${className}
  `

  // Render different states
  switch (status) {
    case WalletConnectionStatus.Connecting:
      return (
        <button
          disabled
          className={`${baseButtonClasses} bg-purple-600 text-white`}
        >
          <Loader2 className="animate-spin h-4 w-4 mr-2" />
          Connecting...
        </button>
      )

    case WalletConnectionStatus.Connected:
      return (
        <div className="flex items-center space-x-2">
          <div className={`${baseButtonClasses} bg-green-600 text-white cursor-default`}>
            <Wallet className="h-4 w-4 mr-2" />
            {publicKey && formatAddress(publicKey.toBase58(), showFullAddress)}
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

    case WalletConnectionStatus.Error:
      return (
        <div className="flex flex-col items-center space-y-2">
          <button
            onClick={handleConnect}
            className={`${baseButtonClasses} bg-red-600 hover:bg-red-700 text-white`}
          >
            <AlertCircle className="h-4 w-4 mr-2" />
            Connection Error - Retry
          </button>
          {error && (
            <p className="text-xs text-red-400 text-center max-w-xs">
              {error}
            </p>
          )}
        </div>
      )

    case WalletConnectionStatus.Disconnected:
    default:
      return (
        <>
          <button
            onClick={handleConnect}
            className={`${baseButtonClasses} bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white shadow-lg`}
          >
            <Wallet className="h-4 w-4 mr-2" />
            Connect Wallet
          </button>
          <WalletConnectionModal 
            isOpen={showModal} 
            onClose={() => setShowModal(false)} 
          />
        </>
      )
  }
}

/**
 * Compact Wallet Button Component
 * 
 * A smaller version of the wallet button for use in navigation bars
 * or areas where space is limited.
 */
export function CompactWalletButton({ className = '' }: { className?: string }) {
  return (
    <WalletButton 
      className={`px-3 py-1.5 text-sm ${className}`}
      showFullAddress={false}
    />
  )
}

/**
 * Export default component
 */
export default WalletButton