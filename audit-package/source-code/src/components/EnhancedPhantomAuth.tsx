"use client";

import React, { useState, useEffect } from 'react';
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useWallet } from "@solana/wallet-adapter-react";

export default function EnhancedPhantomAuth() {
  const [isClient, setIsClient] = useState(false);
  const [phantomStatus, setPhantomStatus] = useState<'checking' | 'not-found' | 'found' | 'connecting' | 'connected' | 'error'>('checking');
  const [errorMessage, setErrorMessage] = useState<string>('');
  
  // Solana Wallet Adapter hooks
  const { connected, publicKey, wallet, connect, disconnect, connecting } = useWallet();

  useEffect(() => {
    setIsClient(true);
    
    const checkPhantomStatus = () => {
      if (typeof window !== 'undefined') {
        const phantomProvider = window.solana;
        
        if (phantomProvider && phantomProvider.isPhantom) {
          setPhantomStatus('found');
          console.log('✅ Phantom wallet detected');
        } else {
          setPhantomStatus('not-found');
          console.log('❌ Phantom wallet not found');
        }
      }
    };
    
    checkPhantomStatus();
    
    // Update status based on connection state
    if (connected) {
      setPhantomStatus('connected');
    } else if (connecting) {
      setPhantomStatus('connecting');
    }
    
  }, [connected, connecting]);

  const handlePhantomConnect = async () => {
    try {
      setPhantomStatus('connecting');
      setErrorMessage('');
      
      console.log('🚀 Triggering Phantom authentication...');
      
      // Check if Phantom is available
      if (typeof window === 'undefined' || !window.solana || !window.solana.isPhantom) {
        // If Phantom extension is not found, redirect to download/install
        window.open('https://phantom.app/download', '_blank');
        throw new Error('Please install Phantom wallet extension and refresh the page');
      }

      // Method 1: Direct connection attempt using wallet adapter
      if (wallet && !connected) {
        await connect();
        console.log('✅ Connected via wallet adapter');
        return;
      }

      // Method 2: Direct Phantom API call (this should trigger the authentication modal)
      const response = await window.solana.connect({
        onlyIfTrusted: false // This ensures it shows the modal even for new users
      });
      
      console.log('✅ Phantom authentication successful:', response);
      setPhantomStatus('connected');
      
    } catch (error: any) {
      console.error('❌ Phantom authentication failed:', error);
      setPhantomStatus('error');
      
      // Parse different types of errors
      if (error.code === 4001) {
        setErrorMessage('User rejected the connection request');
      } else if (error.code === -32002) {
        setErrorMessage('Connection request already pending. Check Phantom wallet');
      } else if (error.message?.includes('install')) {
        setErrorMessage('Please install Phantom wallet extension');
      } else {
        setErrorMessage(error.message || 'Failed to connect to Phantom wallet');
      }
    }
  };

  const handlePhantomDisconnect = async () => {
    try {
      if (connected && wallet) {
        await disconnect();
      }
      
      if (window.solana && window.solana.disconnect) {
        await window.solana.disconnect();
      }
      
      setPhantomStatus('found');
      console.log('👋 Disconnected from Phantom wallet');
      
    } catch (error: any) {
      console.error('Error disconnecting:', error);
    }
  };

  const triggerPhantomDownload = () => {
    window.open('https://phantom.app/', '_blank');
  };

  if (!isClient) {
    return (
      <main className="flex flex-col items-center justify-center min-h-screen gap-4 p-8">
        <div className="animate-pulse text-lg">Loading Phantom authentication...</div>
      </main>
    );
  }

  const currentAddress = connected && publicKey ? publicKey.toBase58() : null;

  return (
    <main className="flex flex-col items-center justify-center min-h-screen gap-6 p-8 bg-gradient-to-br from-purple-50 via-pink-50 to-indigo-50">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-lg w-full border border-gray-100">
        
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full mb-4 animate-pulse">
            <span className="text-3xl">👻</span>
          </div>
          <h1 className="text-3xl font-bold text-gray-800 mb-2">
            Phantom Wallet Authentication
          </h1>
          <p className="text-gray-600">
            Complete authentication with all sign-in options
          </p>
        </div>

        {/* Status Display */}
        <div className={`p-6 rounded-xl text-center mb-6 ${
          phantomStatus === 'connected' 
            ? 'bg-green-100 border-2 border-green-300 text-green-800' 
            : phantomStatus === 'error'
            ? 'bg-red-100 border-2 border-red-300 text-red-800'
            : phantomStatus === 'connecting'
            ? 'bg-blue-100 border-2 border-blue-300 text-blue-800'
            : phantomStatus === 'not-found'
            ? 'bg-yellow-100 border-2 border-yellow-300 text-yellow-800'
            : 'bg-gray-100 border-2 border-gray-300 text-gray-600'
        }`}>
          <div className="font-bold text-lg mb-2">
            {phantomStatus === 'checking' && '🔍 Detecting Phantom...'}
            {phantomStatus === 'not-found' && '❌ Phantom Not Installed'}
            {phantomStatus === 'found' && '✅ Phantom Ready'}
            {phantomStatus === 'connecting' && '🔄 Authenticating...'}
            {phantomStatus === 'connected' && '✅ Authenticated Successfully!'}
            {phantomStatus === 'error' && '❌ Authentication Failed'}
          </div>
          
          {phantomStatus === 'error' && errorMessage && (
            <p className="text-sm font-medium">{errorMessage}</p>
          )}
          
          {phantomStatus === 'connected' && currentAddress && (
            <div className="mt-4 space-y-2">
              <p className="font-semibold">🔑 Wallet Address:</p>
              <p className="font-mono text-xs break-all bg-white p-3 rounded-lg border shadow-inner">
                {currentAddress}
              </p>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="space-y-4 mb-6">
          {phantomStatus === 'not-found' && (
            <button
              onClick={triggerPhantomDownload}
              className="w-full bg-gradient-to-r from-purple-500 to-pink-500 text-white py-4 px-6 rounded-xl font-bold text-lg hover:from-purple-600 hover:to-pink-600 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105"
            >
              📱 Install Phantom Wallet
            </button>
          )}

          {(phantomStatus === 'found' || phantomStatus === 'error') && (
            <div className="space-y-3">
              <button
                onClick={handlePhantomConnect}
                className="w-full bg-gradient-to-r from-purple-500 to-pink-500 text-white py-4 px-6 rounded-xl font-bold text-lg hover:from-purple-600 hover:to-pink-600 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105"
              >
                🔐 Authenticate with Phantom
              </button>
              
              {/* Standard Wallet Adapter Button as fallback */}
              <div className="relative">
                <WalletMultiButton className="w-full justify-center !bg-indigo-500 hover:!bg-indigo-600" />
                <p className="text-xs text-gray-500 text-center mt-1">Alternative connection method</p>
              </div>
            </div>
          )}

          {phantomStatus === 'connecting' && (
            <button
              disabled
              className="w-full bg-gray-400 text-white py-4 px-6 rounded-xl font-bold text-lg cursor-not-allowed flex items-center justify-center"
            >
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white mr-3"></div>
              Connecting to Phantom...
            </button>
          )}

          {phantomStatus === 'connected' && (
            <button
              onClick={handlePhantomDisconnect}
              className="w-full bg-red-500 text-white py-4 px-6 rounded-xl font-bold text-lg hover:bg-red-600 transition-all duration-200"
            >
              🔓 Disconnect Wallet
            </button>
          )}
        </div>

        {/* Authentication Methods Info */}
        <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl p-6 mb-6">
          <h3 className="font-bold text-gray-800 mb-4 text-center">🔐 Available Authentication Methods</h3>
          <div className="space-y-3 text-sm text-gray-700">
            <div className="flex items-center bg-white p-3 rounded-lg shadow-sm">
              <span className="text-xl mr-3">📧</span>
              <div>
                <span className="font-semibold">Email Sign-in:</span>
                <p className="text-xs text-gray-600">Use your email with Google/Apple authentication</p>
              </div>
            </div>
            <div className="flex items-center bg-white p-3 rounded-lg shadow-sm">
              <span className="text-xl mr-3">🔑</span>
              <div>
                <span className="font-semibold">Seed Phrase:</span>
                <p className="text-xs text-gray-600">Import existing wallet with recovery phrase</p>
              </div>
            </div>
            <div className="flex items-center bg-white p-3 rounded-lg shadow-sm">
              <span className="text-xl mr-3">✨</span>
              <div>
                <span className="font-semibold">New Wallet:</span>
                <p className="text-xs text-gray-600">Create a brand new wallet instantly</p>
              </div>
            </div>
          </div>
        </div>

        {/* Test Actions */}
        {phantomStatus === 'connected' && (
          <div className="bg-blue-50 rounded-xl p-4 mb-6">
            <h3 className="font-semibold text-blue-800 mb-3">🧪 Test Wallet Functions</h3>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => {
                  console.log('Wallet Details:', {
                    connected,
                    address: currentAddress,
                    wallet: wallet?.adapter?.name,
                    phantomProvider: window.solana
                  });
                  alert('✅ Check browser console for details');
                }}
                className="bg-blue-500 text-white py-2 px-3 rounded-lg text-sm font-medium hover:bg-blue-600 transition-colors"
              >
                📊 Get Info
              </button>
              <button
                onClick={async () => {
                  try {
                    if (window.solana && connected) {
                      console.log('🔐 Wallet ready for transactions');
                      alert('✅ Wallet authenticated and ready!');
                    }
                  } catch (error) {
                    console.error('Test failed:', error);
                    alert('❌ Test failed - check console');
                  }
                }}
                className="bg-green-500 text-white py-2 px-3 rounded-lg text-sm font-medium hover:bg-green-600 transition-colors"
              >
                ✅ Test Ready
              </button>
            </div>
          </div>
        )}

        {/* Instructions */}
        <details className="bg-gray-50 rounded-xl">
          <summary className="cursor-pointer p-4 font-semibold text-gray-700 hover:text-gray-900 rounded-xl hover:bg-gray-100">
            💡 How does this work?
          </summary>
          <div className="p-4 pt-0 text-sm text-gray-600 space-y-3">
            <div className="bg-white p-3 rounded-lg">
              <p className="font-medium text-gray-800 mb-1">🔗 Connection Process:</p>
              <p>This triggers Phantom's full authentication modal with all available options including email, Google, Apple sign-in, seed phrase import, and new wallet creation.</p>
            </div>
            <div className="bg-white p-3 rounded-lg">
              <p className="font-medium text-gray-800 mb-1">🛡️ Security:</p>
              <p>All authentication happens through Phantom's secure infrastructure. Your credentials are never exposed to this application.</p>
            </div>
            <div className="bg-white p-3 rounded-lg">
              <p className="font-medium text-gray-800 mb-1">🔧 Troubleshooting:</p>
              <p>If you encounter issues, try refreshing the page, checking that Phantom is unlocked, or clearing browser cache.</p>
            </div>
          </div>
        </details>
      </div>
    </main>
  );
}