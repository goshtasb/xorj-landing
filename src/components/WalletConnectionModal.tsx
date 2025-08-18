'use client'

import React from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { X, ExternalLink } from 'lucide-react'

interface WalletConnectionModalProps {
  isOpen: boolean
  onClose: () => void
}

export function WalletConnectionModal({ isOpen, onClose }: WalletConnectionModalProps) {
  const { wallets, select, connect, wallet, connected } = useWallet()

  const handleWalletSelect = (walletName: string) => {
    try {
      console.log(`Selecting wallet: ${walletName}`)
      
      // Close modal first
      onClose()
      
      // Check for Phantom specifically since it's most common
      if (walletName === 'Phantom') {
        // Check if Phantom is available
        if (typeof window !== 'undefined' && (window as any).phantom?.solana) {
          // Select Phantom and let the wallet adapter handle connection
          select(walletName)
          console.log('Phantom selected successfully')
        } else {
          console.warn('Phantom wallet not found, opening download page')
          window.open('https://phantom.app/', '_blank')
        }
      } else {
        // For other wallets, try to select them
        select(walletName)
        console.log(`${walletName} selected successfully`)
      }
      
    } catch (error) {
      console.error(`Failed to select wallet ${walletName}:`, error)
    }
  }

  if (!isOpen) return null

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
          {wallets.map((wallet) => (
            <button
              key={wallet.adapter.name}
              onClick={() => handleWalletSelect(wallet.adapter.name)}
              className="w-full flex items-center space-x-3 p-4 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
            >
              {wallet.adapter.icon && (
                <img
                  src={wallet.adapter.icon}
                  alt={wallet.adapter.name}
                  className="w-8 h-8"
                />
              )}
              <div className="text-left">
                <div className="text-white font-medium">{wallet.adapter.name}</div>
                <div className="text-sm text-slate-400">
                  {wallet.readyState === 'Installed' ? 'Ready to use' : 'Not installed'}
                </div>
              </div>
            </button>
          ))}
          
          {wallets.length === 0 && (
            <div className="text-center py-8">
              <p className="text-slate-400 mb-4">No wallet adapters found.</p>
              <a
                href="https://phantom.app/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center space-x-2 text-purple-400 hover:text-purple-300"
              >
                <span>Install Phantom Wallet</span>
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default WalletConnectionModal