'use client'

import React from 'react'
import { useSimpleWallet } from '@/contexts/SimpleWalletContext'

/**
 * Simple Wallet Debug Component
 * Shows current wallet connection state for debugging
 */
export function WalletDebug() {
  const { 
    publicKey, 
    connected, 
    connecting, 
    error,
    disconnect
  } = useSimpleWallet()

  if (process.env.NODE_ENV !== 'development') {
    return null
  }

  return (
    <div className="fixed bottom-4 right-4 bg-black/90 text-white p-4 rounded-lg text-xs max-w-xs z-50">
      <h4 className="font-bold mb-2">Simple Wallet Debug</h4>
      <div className="space-y-1">
        <div>Status: {connected ? 'connected' : 'disconnected'}</div>
        <div>Connected: {connected ? 'Yes' : 'No'}</div>
        <div>Connecting: {connecting ? 'Yes' : 'No'}</div>
        <div>PublicKey: {publicKey ? publicKey.toString().slice(0, 8) + '...' : 'None'}</div>
        <div>Wallet: Phantom</div>
        <div>Available: 1 wallet</div>
        {error && <div className="text-red-400">Error: {error}</div>}
        <div className="mt-2 space-x-2">
          <button 
            onClick={() => disconnect()}
            className="px-2 py-1 bg-red-600 text-white text-xs rounded"
          >
            Disconnect
          </button>
        </div>
      </div>
    </div>
  )
}

export default WalletDebug