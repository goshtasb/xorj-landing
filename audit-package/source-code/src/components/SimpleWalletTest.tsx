'use client'

import { FC, useState, useEffect } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { AppBar } from './AppBar'

export const SimpleWalletTest: FC = () => {
  const { connected, publicKey, connecting, wallet } = useWallet()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <div style={{ minHeight: '100vh' }}>
      <AppBar />
      
      <main style={{ 
        padding: '40px',
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center',
        textAlign: 'center'
      }}>
        <div style={{
          backgroundColor: '#f8f9fa',
          border: '1px solid #e9ecef',
          borderRadius: '8px',
          padding: '30px',
          maxWidth: '500px',
          width: '100%'
        }}>
          <h2 style={{ marginBottom: '20px', color: '#333' }}>
            Wallet Status
          </h2>
          
          <div style={{ 
            textAlign: 'left', 
            fontSize: '14px',
            backgroundColor: '#fff',
            padding: '15px',
            borderRadius: '4px',
            marginBottom: '20px'
          }}>
            <p><strong>Connected:</strong> {connected ? '✅ Yes' : '❌ No'}</p>
            <p><strong>Connecting:</strong> {connecting ? '🔄 Yes' : '⭕ No'}</p>
            <p><strong>Wallet:</strong> {mounted ? (wallet?.adapter?.name || 'None selected') : 'Loading...'}</p>
            <p><strong>Public Key:</strong> {mounted && publicKey ? publicKey.toBase58().slice(0, 20) + '...' : 'Not available'}</p>
          </div>

          {connected && publicKey && (
            <div style={{
              backgroundColor: '#d4edda',
              border: '1px solid #c3e6cb',
              borderRadius: '4px',
              padding: '15px',
              color: '#155724'
            }}>
              <h3 style={{ margin: '0 0 10px 0', fontSize: '16px' }}>✅ Connection Successful!</h3>
              <p style={{ margin: 0, fontSize: '12px', wordBreak: 'break-all' }}>
                <strong>Full Address:</strong><br />
                {publicKey.toBase58()}
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

export default SimpleWalletTest