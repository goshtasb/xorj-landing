'use client'

import React, { useEffect } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'

export const WalletInfo: React.FC = () => {
  const { connected, publicKey, connecting, wallet, connect, disconnect, select, wallets } = useWallet()
  
  // Debug wallet state on component mount and when wallets change
  useEffect(() => {
    console.log('Wallets available:', wallets.length);
    console.log('Wallet details:', wallets.map(w => ({
      name: w.adapter.name,
      readyState: w.readyState,
      connected: w.adapter.connected,
      connecting: w.adapter.connecting
    })));
    
    // Check if Phantom is available in window object
    if (typeof window !== 'undefined') {
    }
  }, [wallets])
  
  // Direct wallet selection handler
  const handleSelectPhantom = () => {
    console.log('Available wallets:', wallets.map(w => ({
      name: w.adapter.name,
      readyState: w.readyState,
      ready: w.readyState === 'Installed'
    })))

    const phantomWallet = wallets.find(w => w.adapter.name === 'Phantom')

    if (phantomWallet) {
      console.log('Found Phantom wallet:', {
        name: phantomWallet.adapter.name,
        readyState: phantomWallet.readyState,
        url: phantomWallet.adapter.url,
        isInstalled: phantomWallet.readyState === 'Installed'
      })

      if (phantomWallet.readyState !== 'Installed') {
        console.error('❌ Phantom wallet is not installed or not ready')
        return
      }

      select(phantomWallet.adapter.name)
    } else {
      console.error('❌ Phantom wallet not found in available wallets')
    }
  }

  // Enhanced connect handler with detailed debugging
  const handleConnect = async () => {
    
    try {
      // Step 0: Check if Phantom is available at browser level
      if (typeof window !== 'undefined') {
        
        if (!window.solana || !window.solana.isPhantom) {
          console.error('❌ PHANTOM NOT DETECTED IN BROWSER')
          console.error('Please install Phantom wallet extension from https://phantom.app')
          console.error('After installation, refresh the page and try again')
          return
        }
      }
      
      // Step 1: Check current wallet state
      
      // Step 2: If no wallet, try to select Phantom
      if (!wallet) {
        handleSelectPhantom()
        
        // Wait for selection to take effect
        await new Promise(resolve => setTimeout(resolve, 2000))
        
        
        if (!wallet) {
          console.error('❌ FAILED: Still no wallet selected after selection attempt')
          console.error('Trying alternative selection method...')
          
          // Alternative: try to select by name directly
          try {
            select('Phantom')
            await new Promise(resolve => setTimeout(resolve, 1000))
          } catch (altError) {
            console.error('❌ Alternative selection also failed:', altError)
          }
          
          if (!wallet) {
            console.error('❌ FINAL FAILURE: Unable to select Phantom wallet')
            console.error('This indicates a fundamental wallet adapter issue')
            return
          }
        }
      }
      
      // Step 3: Verify wallet is ready
      
      if (wallet.adapter.readyState !== 'Installed') {
        console.error('❌ WALLET NOT READY')
        console.error('Ready state:', wallet.adapter.readyState)
        console.error('Expected: "Installed"')
        return
      }
      
      // Step 4: Attempt connection
      await connect()
      
      
    } catch (error) {
      console.error('❌ CONNECTION FAILED')
      console.error('Error details:', error)
      
      if (error instanceof Error) {
        console.error('Error name:', error.name)
        console.error('Error message:', error.message)
        
        if (error.message === 'Unexpected error') {
        }
      }
    }
    
  }

  // Direct Phantom connection (fallback method)
  const handleDirectPhantomConnect = async () => {
    
    try {
      if (typeof window === 'undefined' || !window.solana || !window.solana.isPhantom) {
        console.error('❌ Phantom not available in browser')
        return
      }
      
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _response = await window.solana.connect()
      
      // Now try to sync this with wallet adapter
      handleSelectPhantom()
      
    } catch (error) {
      console.error('❌ Direct Phantom connection failed:', error)
    }
    
  }

  return (
    <div style={{ 
      padding: '40px',
      backgroundColor: '#f8f9fa',
      borderRadius: '8px',
      border: '1px solid #e9ecef',
      maxWidth: '600px',
      width: '100%'
    }}>
      <h2 style={{ marginBottom: '20px', color: '#333' }}>
        Wallet Connection Status
      </h2>
      
      {/* Debug Information */}
      <div style={{ marginBottom: '20px', backgroundColor: '#f8f9fa', padding: '15px', borderRadius: '8px', fontSize: '12px' }}>
        <h4 style={{ margin: '0 0 10px 0', color: '#666' }}>Debug Info:</h4>
        <p>Connected: {connected ? 'true' : 'false'}</p>
        <p>Connecting: {connecting ? 'true' : 'false'}</p>
        <p>Wallet: {wallet?.adapter?.name || 'None'}</p>
        <p>PublicKey: {publicKey ? publicKey.toBase58().slice(0, 20) + '...' : 'null'}</p>
        <p>Available Wallets: {wallets.length}</p>
        <p>Phantom Ready: {wallets.find(w => w.adapter.name === 'Phantom')?.readyState || 'Not Found'}</p>
        {typeof window !== 'undefined' && (
          <p>Browser Phantom: {window.solana?.isPhantom ? 'Detected' : 'Not Detected'}</p>
        )}
      </div>
      
      {connecting ? (
        <div style={{ color: '#ffc107' }}>
          <p style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '10px' }}>
            🔄 Connecting to Wallet...
          </p>
          <p style={{ fontSize: '14px', color: '#666' }}>
            Please check your wallet for connection approval.
          </p>
        </div>
      ) : connected && publicKey ? (
        <div style={{ color: '#28a745' }}>
          <p style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '10px' }}>
            ✅ Wallet Connected Successfully!
          </p>
          <p style={{ fontSize: '14px', marginBottom: '5px', color: '#666' }}>
            Connected Address:
          </p>
          <code style={{ 
            backgroundColor: '#e9ecef',
            padding: '8px 12px',
            borderRadius: '4px',
            fontSize: '12px',
            wordBreak: 'break-all',
            display: 'block',
            margin: '10px 0'
          }}>
            {publicKey.toBase58()}
          </code>
          <button 
            onClick={disconnect}
            style={{
              marginTop: '10px',
              padding: '8px 16px',
              backgroundColor: '#dc3545',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Disconnect Wallet
          </button>
        </div>
      ) : (
        <div style={{ color: '#dc3545' }}>
          <p style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '10px' }}>
            ❌ Wallet Not Connected
          </p>
          <p style={{ fontSize: '14px', color: '#666', marginBottom: '15px' }}>
            Connect your Phantom wallet to get started.
          </p>
          
          {/* Direct Connect Button */}
          <button 
            onClick={handleConnect}
            style={{
              padding: '12px 24px',
              backgroundColor: '#6f42c1',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              marginBottom: '15px',
              fontSize: '16px',
              fontWeight: 'bold'
            }}
          >
            🦄 Connect Phantom Wallet
          </button>
          
          {/* Alternative: Use modal button */}
          <p style={{ fontSize: '12px', color: '#666', marginBottom: '10px' }}>
            Or use &quot;Select Wallet&quot; button above ↑
          </p>
          
          {/* Fallback: Direct connection */}
          <button 
            onClick={handleDirectPhantomConnect}
            style={{
              padding: '8px 16px',
              backgroundColor: '#7b2cbf',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              marginBottom: '15px',
              fontSize: '13px',
              fontWeight: 'normal'
            }}
          >
            🔧 Direct Phantom Connect (Fallback)
          </button>
          
          {wallet && !connected && (
            <div style={{ backgroundColor: '#e7f3ff', border: '1px solid #b3d9ff', borderRadius: '4px', padding: '10px', marginBottom: '15px' }}>
              <p style={{ fontSize: '12px', color: '#0066cc', marginBottom: '10px' }}>
                ✅ Wallet selected: {wallet.adapter.name}
              </p>
              <button 
                onClick={handleConnect}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#0066cc',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  marginBottom: '10px'
                }}
              >
                Connect {wallet.adapter.name}
              </button>
            </div>
          )}
          
          <div style={{ backgroundColor: '#fff3cd', border: '1px solid #ffeaa7', borderRadius: '4px', padding: '10px' }}>
            <p style={{ fontSize: '11px', margin: '0 0 5px 0', fontWeight: 'bold', color: '#856404' }}>
              💡 If connection fails with &quot;Unexpected error&quot;:
            </p>
            <ul style={{ fontSize: '10px', margin: 0, paddingLeft: '15px', color: '#856404' }}>
              <li>Make sure Phantom wallet is unlocked</li>
              <li>Allow popups for this website</li>
              <li>Click &quot;Connect&quot; when Phantom popup appears</li>
              <li>Try refreshing the page if needed</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}

export default WalletInfo