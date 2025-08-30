'use client'

import { FC, useCallback } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { WalletName } from '@solana/wallet-adapter-base'

export const PhantomConnectButton: FC = () => {
  const { select, connect, connecting, connected, wallet } = useWallet()

  const handleConnect = useCallback(async () => {
    try {
      // Check if Phantom is available before attempting connection
      if (typeof window !== 'undefined' && (!window.solana || !window.solana.isPhantom)) {
        console.error('Phantom wallet not detected. Please install from https://phantom.app')
        return
      }

      // Define the Phantom wallet name
      const phantomWalletName = 'Phantom' as WalletName
      
      // Programmatically select the Phantom wallet
      select(phantomWalletName)
      
      // Wait a moment for wallet selection to take effect
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Trigger the connection
      await connect()
    } catch (error) {
      // Better error logging with fallbacks
      const errorMessage = error instanceof Error 
        ? (error.message || error.name || 'Unknown error')
        : 'Connection failed'
      console.error('PhantomConnectButton error:', errorMessage)
    }
  }, [select, connect])

  // Hide button after successful connection
  if (connected) {
    return null
  }

  return (
    <button 
      onClick={handleConnect}
      disabled={connecting}
      style={{
        padding: '12px 24px',
        backgroundColor: connecting ? '#ccc' : '#6f42c1',
        color: 'white',
        border: 'none',
        borderRadius: '8px',
        cursor: connecting ? 'default' : 'pointer',
        fontSize: '16px',
        fontWeight: 'bold'
      }}
    >
      {connecting ? 'Connecting...' : 'Connect Phantom'}
    </button>
  )
}

export default PhantomConnectButton