'use client'

import React, { useEffect } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'

export const WalletInfo: React.FC = () => {
  const { connected, publicKey, connecting, wallet, connect, disconnect, select, wallets } = useWallet()
  
  // Debug wallet state on component mount and when wallets change
  useEffect(() => {
    console.log('🔍 WalletInfo mounted/updated')
    console.log('Wallets available:', wallets.length)
    console.log('Wallet details:', wallets.map(w => ({
      name: w.adapter.name,
      readyState: w.readyState,
      connected: w.adapter.connected,
      connecting: w.adapter.connecting
    })))
    
    // Check if Phantom is available in window object
    if (typeof window !== 'undefined') {
      console.log('Window.solana exists:', !!window.solana)
      console.log('Window.solana.isPhantom:', !!(window.solana && window.solana.isPhantom))
    }
  }, [wallets])
  
  // Direct wallet selection handler  
  const handleSelectPhantom = () => {
    console.log('🔍 Looking for Phantom wallet...')
    console.log('Total available wallets:', wallets.length)
    console.log('Available wallets:', wallets.map(w => ({ 
      name: w.adapter.name, 
      readyState: w.readyState,
      ready: w.readyState === 'Installed'
    })))
    
    const phantomWallet = wallets.find(w => w.adapter.name === 'Phantom')
    
    if (phantomWallet) {
      console.log('✅ Found Phantom wallet:', {
        name: phantomWallet.adapter.name,
        readyState: phantomWallet.readyState,
        url: phantomWallet.adapter.url,
        isInstalled: phantomWallet.readyState === 'Installed'
      })
      
      if (phantomWallet.readyState !== 'Installed') {
        console.warn('⚠️ Phantom wallet found but not in ready state')
        console.warn('Ready state:', phantomWallet.readyState)
        console.warn('Please ensure Phantom extension is installed and enabled')
        return
      }
      
      console.log('Selecting Phantom wallet...')
      select(phantomWallet.adapter.name)
      console.log('Selection complete')
    } else {
      console.error('❌ Phantom wallet not found in available wallets')
      console.log('This might mean:')
      console.log('1. Phantom extension is not installed - visit https://phantom.app')
      console.log('2. Phantom extension is disabled in browser')
      console.log('3. Browser needs to be refreshed')
      console.log('4. Component is still hydrating - try again in a moment')
    }
  }

  // Enhanced connect handler with detailed debugging
  const handleConnect = async () => {
    console.log('=== STARTING CONNECTION PROCESS ===')
    
    try {
      // Step 0: Check if Phantom is available at browser level
      if (typeof window !== 'undefined') {
        console.log('Browser Check:')
        console.log('- window.solana exists:', !!window.solana)
        console.log('- window.solana.isPhantom:', !!(window.solana && window.solana.isPhantom))
        
        if (!window.solana || !window.solana.isPhantom) {
          console.error('❌ PHANTOM NOT DETECTED IN BROWSER')
          console.error('Please install Phantom wallet extension from https://phantom.app')
          console.error('After installation, refresh the page and try again')
          return
        }
      }
      
      // Step 1: Check current wallet state
      console.log('Step 1: Checking current wallet state...')
      console.log('Current wallet:', wallet?.adapter?.name || 'None')
      console.log('Connected:', connected)
      console.log('Connecting:', connecting)
      
      // Step 2: If no wallet, try to select Phantom
      if (!wallet) {
        console.log('Step 2: No wallet selected, attempting to select Phantom...')
        handleSelectPhantom()
        
        // Wait for selection to take effect
        console.log('Waiting 2 seconds for wallet selection...')
        await new Promise(resolve => setTimeout(resolve, 2000))
        
        console.log('After selection attempt - Current wallet:', wallet?.adapter?.name || 'Still None')
        
        if (!wallet) {
          console.error('❌ FAILED: Still no wallet selected after selection attempt')
          console.error('Trying alternative selection method...')
          
          // Alternative: try to select by name directly
          try {
            select('Phantom')
            await new Promise(resolve => setTimeout(resolve, 1000))
            console.log('Alternative selection - Current wallet:', wallet?.adapter?.name || 'Still None')
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
      console.log('Step 3: Verifying wallet readiness...')
      console.log('Wallet adapter name:', wallet.adapter.name)
      console.log('Wallet ready state:', wallet.adapter.readyState) 
      console.log('Wallet URL:', wallet.adapter.url)
      
      if (wallet.adapter.readyState !== 'Installed') {
        console.error('❌ WALLET NOT READY')
        console.error('Ready state:', wallet.adapter.readyState)
        console.error('Expected: "Installed"')
        return
      }
      
      // Step 4: Attempt connection
      console.log('Step 4: Attempting connection...')
      console.log('Calling connect() function...')
      await connect()
      
      console.log('✅ CONNECTION SUCCESSFUL!')
      console.log('Final state - Connected:', connected)
      console.log('Final state - PublicKey:', publicKey?.toBase58()?.slice(0, 20) + '...')
      
    } catch (error) {
      console.error('❌ CONNECTION FAILED')
      console.error('Error details:', error)
      
      if (error instanceof Error) {
        console.error('Error name:', error.name)
        console.error('Error message:', error.message)
        
        if (error.message === 'Unexpected error') {
          console.warn('💡 Common causes of "Unexpected error":')
          console.warn('1. Phantom popup was blocked by browser')
          console.warn('2. User closed/dismissed the Phantom popup') 
          console.warn('3. Phantom wallet is locked/not unlocked')
          console.warn('4. Network connectivity issues')
          console.warn('5. Phantom extension needs to be updated')
        }
      }
    }
    
    console.log('=== CONNECTION PROCESS COMPLETE ===')
  }

  // Direct Phantom connection (fallback method)
  const handleDirectPhantomConnect = async () => {
    console.log('=== ATTEMPTING DIRECT PHANTOM CONNECTION ===')
    
    try {
      if (typeof window === 'undefined' || !window.solana || !window.solana.isPhantom) {
        console.error('❌ Phantom not available in browser')
        return
      }
      
      console.log('🦄 Connecting directly to window.solana...')
      const response = await window.solana.connect()
      console.log('✅ Direct Phantom connection response:', response)
      console.log('Public Key:', response.publicKey?.toString())
      
      // Now try to sync this with wallet adapter
      console.log('Attempting to sync with wallet adapter...')
      handleSelectPhantom()
      
    } catch (error) {
      console.error('❌ Direct Phantom connection failed:', error)
    }
    
    console.log('=== DIRECT CONNECTION ATTEMPT COMPLETE ===')
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
            Or use "Select Wallet" button above ↑
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
              💡 If connection fails with "Unexpected error":
            </p>
            <ul style={{ fontSize: '10px', margin: 0, paddingLeft: '15px', color: '#856404' }}>
              <li>Make sure Phantom wallet is unlocked</li>
              <li>Allow popups for this website</li>
              <li>Click "Connect" when Phantom popup appears</li>
              <li>Try refreshing the page if needed</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}

export default WalletInfo