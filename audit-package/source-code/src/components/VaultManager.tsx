'use client'

import React, { useState, useEffect } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { useWalletModal } from '@solana/wallet-adapter-react-ui'
import { useRouter } from 'next/navigation'
import { 
  Shield, ArrowRight, Check
} from 'lucide-react'

/**
 * Vault Manager Component
 * 
 * Simplified component that handles wallet connection states:
 * - Shows wallet connection interface when not connected
 * - Redirects to profile page when wallet is connected
 * 
 * The profile page contains all trading functionality, performance metrics,
 * and bot controls - eliminating the confusing "vault creation" step.
 */

interface VaultManagerProps {
  className?: string
}

export function VaultManager({ className = '' }: VaultManagerProps) {
  const { publicKey, connected } = useWallet()
  const { setVisible } = useWalletModal()
  const router = useRouter()
  const [mounted, setMounted] = useState(false)

  // Ensure component is mounted before checking wallet connection
  useEffect(() => {
    setMounted(true)
  }, [])

  // Check if wallet is connected
  const isConnected = mounted && connected && publicKey

  // Handle wallet connection
  const handleConnectWallet = async () => {
    console.log('🔌 VaultManager: User clicked Connect Wallet button')
    try {
      setVisible(true)
    } catch (err) {
      console.error('❌ VaultManager: Failed to open wallet modal:', err)
    }
  }

  if (!isConnected) {
    return (
      <div className={`bg-slate-900 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden border border-slate-700 ${className}`}>
        {/* Header */}
        <div className="p-6 border-b border-slate-700">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-purple-600 rounded-lg">
              <Shield className="h-6 w-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-white">Connect Wallet to Access Vault</h2>
              <p className="text-sm text-slate-400">Connect your Phantom wallet to get started</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          <div className="text-center">
            <div className="w-16 h-16 bg-slate-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <Shield className="h-8 w-8 text-white" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">
              Your Personal Trading Vault
            </h3>
            <p className="text-slate-300">
              Connect your wallet to create and manage your AI-powered Solana vault. 
              Start automated trading with full control of your funds.
            </p>
          </div>

          <div className="space-y-4">
            <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
              <h4 className="text-white font-medium mb-2">Vault Features</h4>
              <ul className="space-y-2 text-sm text-slate-300">
                <li className="flex items-center space-x-2">
                  <Check className="h-4 w-4 text-green-400" />
                  <span>Non-custodial - you maintain full control</span>
                </li>
                <li className="flex items-center space-x-2">
                  <Check className="h-4 w-4 text-green-400" />
                  <span>Automated trading with customizable limits</span>
                </li>
                <li className="flex items-center space-x-2">
                  <Check className="h-4 w-4 text-green-400" />
                  <span>Withdraw anytime without restrictions</span>
                </li>
                <li className="flex items-center space-x-2">
                  <Check className="h-4 w-4 text-green-400" />
                  <span>Transparent on-chain transactions</span>
                </li>
              </ul>
            </div>

            <div className="bg-blue-900/20 border border-blue-600/20 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-xs text-white font-bold">i</span>
                </div>
                <div>
                  <h4 className="text-blue-300 font-medium mb-1">Ready to Start?</h4>
                  <p className="text-sm text-blue-200">
                    Connect your Phantom wallet to create your vault and begin AI-powered Solana trading.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-700 flex items-center justify-center">
          <button
            onClick={handleConnectWallet}
            className="flex items-center space-x-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white rounded-lg font-medium transition-all transform hover:scale-105"
          >
            <Shield className="h-5 w-5" />
            <span>Connect Wallet</span>
          </button>
        </div>
      </div>
    )
  }

  // Redirect to profile when wallet is connected
  const handleGoToProfile = () => {
    console.log('🔗 VaultManager: Redirecting to profile page')
    router.push('/profile')
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Connected State - Show Profile Access */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
        <div className="text-center space-y-6">
          <div className="w-16 h-16 bg-green-600 rounded-full flex items-center justify-center mx-auto">
            <Check className="h-8 w-8 text-white" />
          </div>
          
          <div>
            <h3 className="text-xl font-semibold text-white mb-2">
              Wallet Connected Successfully!
            </h3>
            <p className="text-slate-300">
              Your wallet is connected and ready. Access your profile to view performance, 
              manage bot settings, and control your AI-powered trading.
            </p>
          </div>

          <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
            <h4 className="text-white font-medium mb-2">Your Profile Includes:</h4>
            <ul className="space-y-2 text-sm text-slate-300">
              <li className="flex items-center space-x-2">
                <Check className="h-4 w-4 text-green-400" />
                <span>Performance dashboard with real-time metrics</span>
              </li>
              <li className="flex items-center space-x-2">
                <Check className="h-4 w-4 text-green-400" />
                <span>AI trading bot controls and settings</span>
              </li>
              <li className="flex items-center space-x-2">
                <Check className="h-4 w-4 text-green-400" />
                <span>Transaction history and analytics</span>
              </li>
              <li className="flex items-center space-x-2">
                <Check className="h-4 w-4 text-green-400" />
                <span>Risk profile configuration</span>
              </li>
            </ul>
          </div>

          <button
            onClick={handleGoToProfile}
            className="flex items-center space-x-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white rounded-lg font-medium transition-all transform hover:scale-105 mx-auto"
          >
            <Shield className="h-5 w-5" />
            <span>Go to Profile Dashboard</span>
            <ArrowRight className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  )
}


export default VaultManager