'use client';

import React, { useState, useEffect, useCallback } from 'react';

export default function TestWalletPage() {
  const [phantomStatus, setPhantomStatus] = useState<string>('checking');
  const [connectionStatus, setConnectionStatus] = useState<string>('disconnected');
  const [publicKey, setPublicKey] = useState<string>('');
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    const logMessage = `[${timestamp}] ${message}`;
    console.log(logMessage);
    setLogs(prev => [...prev, logMessage]);
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      checkPhantomStatus();
    }
  }, [checkPhantomStatus]);

  const checkPhantomStatus = useCallback(() => {
    addLog('🔍 Checking Phantom wallet availability...');
    
    if (typeof window !== 'undefined' && window.solana) {
      addLog('✅ window.solana detected');
      addLog(`  - isPhantom: ${window.solana.isPhantom}`);
      addLog(`  - isConnected: ${window.solana.isConnected}`);
      
      if (window.solana.isPhantom) {
        setPhantomStatus('found');
        addLog('✅ Phantom wallet is installed and detected');
        
        if (window.solana.isConnected) {
          setConnectionStatus('connected');
          addLog('ℹ️ Phantom is already connected');
        }
      } else {
        setPhantomStatus('not-phantom');
        addLog('❌ Solana provider found but not Phantom');
      }
    } else {
      setPhantomStatus('not-found');
      addLog('❌ No Solana wallet provider found');
    }
  }, []);

  const testDirectConnection = async () => {
    addLog('🚀 === STARTING DIRECT CONNECTION TEST ===');
    
    try {
      setConnectionStatus('connecting');
      
      // Step 1: Validate
      addLog('🔍 Step 1: Validating Phantom...');
      if (!window.solana) {
        throw new Error('window.solana not available');
      }
      if (!window.solana.isPhantom) {
        throw new Error('isPhantom is false');
      }
      addLog('✅ Phantom validation passed');

      // Step 2: Quick cleanup
      addLog('🧹 Step 2: Quick cleanup...');
      if (window.solana.isConnected) {
        addLog('Disconnecting existing connection...');
        await window.solana.disconnect();
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      // Step 3: Call connect
      addLog('🔐 Step 3: Calling window.solana.connect({ onlyIfTrusted: false })...');
      addLog('💡 THIS SHOULD OPEN THE PHANTOM OAUTH MODAL NOW!');
      addLog('Expected in modal: email, Google, Apple, seed phrase, new wallet options');
      
      let response;
      try {
        response = await window.solana.connect({
          onlyIfTrusted: false
        });
      } catch (connectError: unknown) {
        addLog(`🚨 Connection error: ${connectError instanceof Error ? connectError.message : 'Unknown error'}`);
        addLog(`🚨 Error code: ${(connectError as { code?: string })?.code || 'Unknown'}`);
        throw connectError;
      }

      addLog('📱 Connection response received!');
      addLog(`Public key: ${response?.publicKey?.toString()}`);

      if (response && response.publicKey) {
        setConnectionStatus('connected');
        setPublicKey(response.publicKey.toString());
        addLog('✅ SUCCESS: Phantom OAuth connection established!');
      } else {
        throw new Error('No response or public key received');
      }

    } catch (error: unknown) {
      setConnectionStatus('error');
      addLog(`❌ Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      if ((error as { code?: string })?.code) {
        addLog(`❌ Error code: ${(error as { code?: string }).code}`);
      }
    }
  };

  const testDisconnection = async () => {
    try {
      addLog('🔌 Testing disconnection...');
      setConnectionStatus('disconnecting');

      if (window.solana && window.solana.disconnect) {
        await window.solana.disconnect();
        setConnectionStatus('disconnected');
        setPublicKey('');
        addLog('✅ Disconnection successful');
      } else {
        addLog('❌ No disconnect method available');
      }
    } catch (error: unknown) {
      addLog(`❌ Disconnect failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const clearLogs = () => {
    setLogs([]);
  };

  return (
    <div className="min-h-screen bg-slate-900 p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-8">🧪 Phantom Wallet Connection Test</h1>
        
        <div className="grid lg:grid-cols-2 gap-8">
          {/* Status Panel */}
          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
            <h2 className="text-xl font-semibold text-white mb-4">Status</h2>
            
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-slate-300">Phantom Detection:</span>
                <span className={`font-medium ${
                  phantomStatus === 'found' ? 'text-green-400' : 
                  phantomStatus === 'not-found' ? 'text-red-400' : 'text-yellow-400'
                }`}>
                  {phantomStatus}
                </span>
              </div>
              
              <div className="flex justify-between">
                <span className="text-slate-300">Connection Status:</span>
                <span className={`font-medium ${
                  connectionStatus === 'connected' ? 'text-green-400' : 
                  connectionStatus === 'error' ? 'text-red-400' : 
                  connectionStatus === 'connecting' ? 'text-yellow-400' : 'text-slate-400'
                }`}>
                  {connectionStatus}
                </span>
              </div>
              
              {publicKey && (
                <div className="flex justify-between">
                  <span className="text-slate-300">Public Key:</span>
                  <span className="text-blue-400 font-mono text-sm">
                    {publicKey.slice(0, 8)}...{publicKey.slice(-8)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Actions Panel */}
          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
            <h2 className="text-xl font-semibold text-white mb-4">Test Actions</h2>
            
            <div className="space-y-4">
              <button
                onClick={checkPhantomStatus}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
              >
                🔍 Re-check Phantom Status
              </button>
              
              <button
                onClick={testDirectConnection}
                disabled={phantomStatus !== 'found' || connectionStatus === 'connecting'}
                className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg transition-colors"
              >
                🚀 Test Direct Connection (SHOULD SHOW OAUTH MODAL)
              </button>
              
              <button
                onClick={testDisconnection}
                disabled={connectionStatus !== 'connected'}
                className="w-full bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg transition-colors"
              >
                🔌 Test Disconnection
              </button>
              
              <button
                onClick={clearLogs}
                className="w-full bg-slate-600 hover:bg-slate-700 text-white px-4 py-2 rounded-lg transition-colors"
              >
                🧹 Clear Logs
              </button>
            </div>
          </div>
        </div>

        {/* Logs Panel */}
        <div className="mt-8 bg-black rounded-lg p-6 border border-slate-700">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-white">Debug Logs</h2>
            <span className="text-sm text-slate-400">{logs.length} entries</span>
          </div>
          
          <div className="bg-slate-900 rounded p-4 h-64 overflow-y-auto font-mono text-sm">
            {logs.length === 0 ? (
              <div className="text-slate-500">No logs yet. Click &quot;Re-check Phantom Status&quot; to start.</div>
            ) : (
              logs.map((log, index) => (
                <div key={index} className="text-green-400 mb-1">
                  {log}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Instructions */}
        <div className="mt-8 bg-blue-900/20 border border-blue-600/20 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-blue-300 mb-3">🧪 Test Instructions</h3>
          <ol className="text-blue-200 space-y-2 text-sm">
            <li><strong>1.</strong> Make sure Phantom wallet extension is installed</li>
            <li><strong>2.</strong> Click &quot;Re-check Phantom Status&quot; to verify detection</li>
            <li><strong>3.</strong> Click &quot;Test Direct Connection&quot; - this MUST open the Phantom OAuth modal</li>
            <li><strong>4.</strong> In the modal, you should see options for:</li>
            <li className="ml-6">• Email/Google/Apple sign-in</li>
            <li className="ml-6">• Import seed phrase</li>
            <li className="ml-6">• Create new wallet</li>
            <li className="ml-6">• Browser extension login</li>
            <li><strong>5.</strong> Complete authentication and verify connection status changes to &quot;connected&quot;</li>
            <li><strong>6.</strong> Test disconnection to ensure it works properly</li>
          </ol>
          
          <div className="mt-4 p-3 bg-yellow-900/20 border border-yellow-600/20 rounded">
            <p className="text-yellow-200 text-sm">
              <strong>Expected Behavior:</strong> Clicking &quot;Test Direct Connection&quot; should ALWAYS show the Phantom OAuth modal, 
              even if you were previously connected. The modal gives users all authentication options.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}