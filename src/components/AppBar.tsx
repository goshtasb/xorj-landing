'use client'

import { FC, useState, useEffect } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import { PhantomConnectButton } from './PhantomConnectButton'

export const AppBar: FC = () => {
  const { connected } = useWallet()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <div style={{ 
      display: 'flex', 
      justifyContent: 'space-between', 
      alignItems: 'center',
      padding: '20px',
      borderBottom: '1px solid #e0e0e0'
    }}>
      <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 'bold' }}>
        Solana Wallet Integration
      </h1>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {!mounted ? (
          <div style={{ 
            padding: '12px 24px', 
            backgroundColor: '#ccc', 
            color: 'white', 
            border: 'none', 
            borderRadius: '8px',
            fontSize: '16px',
            fontWeight: 'bold'
          }}>
            Loading...
          </div>
        ) : connected ? (
          <WalletMultiButton />
        ) : (
          <PhantomConnectButton />
        )}
      </div>
    </div>
  )
}

export default AppBar