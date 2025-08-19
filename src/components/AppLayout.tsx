'use client'

import React from 'react'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import WalletInfo from './WalletInfo'

export const AppLayout: React.FC = () => {
  return (
    <div style={{ minHeight: '100vh', padding: '20px' }}>
      <header style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        padding: '20px 0',
        borderBottom: '1px solid #e0e0e0',
        marginBottom: '40px'
      }}>
        <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 'bold' }}>
          Solana Wallet Integration
        </h1>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
          <WalletMultiButton />
          <small style={{ fontSize: '10px', color: '#666' }}>
            Click to select and connect wallet
          </small>
        </div>
      </header>
      
      <main style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center',
        textAlign: 'center'
      }}>
        <WalletInfo />
      </main>
    </div>
  )
}

export default AppLayout