/**
 * ConfirmationModal Component
 * Modal for confirming bot deactivation and permission revocation
 */

'use client';

import React, { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { 
  X, 
  AlertTriangle, 
  Loader2, 
  CheckCircle, 
  XCircle,
  ExternalLink 
} from 'lucide-react';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type TransactionStatus = 'idle' | 'sending' | 'confirming' | 'confirmed' | 'failed';

export function ConfirmationModal({ isOpen, onClose }: ConfirmationModalProps) {
  const { publicKey, sendTransaction } = useWallet();
  const [txStatus, setTxStatus] = useState<TransactionStatus>('idle');
  const [txSignature, setTxSignature] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Handle deactivation confirmation
  const handleConfirmDeactivation = async () => {
    if (!publicKey || !sendTransaction) {
      setError('Wallet not properly connected');
      return;
    }

    try {
      setTxStatus('sending');
      setError(null);
      
      console.log('🚀 Starting bot deactivation for:', publicKey.toString());

      // TODO: Build actual revocation transaction
      // For now, we'll simulate the transaction process
      await simulateRevocationTransaction();

      setTxStatus('confirmed');
      
      // Auto-close modal after successful transaction
      setTimeout(() => {
        onClose();
        resetModalState();
      }, 3000);

    } catch (err) {
      console.error('❌ Deactivation failed:', err);
      setError(err instanceof Error ? err.message : 'Transaction failed');
      setTxStatus('failed');
    }
  };

  // Simulate the revocation transaction process
  const simulateRevocationTransaction = async (): Promise<string> => {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    setTxStatus('confirming');
    
    // Simulate transaction confirmation delay
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Generate mock transaction signature
    const mockSignature = generateMockSignature();
    setTxSignature(mockSignature);
    
    console.log('✅ Mock transaction confirmed:', mockSignature);
    return mockSignature;
  };

  // Generate mock transaction signature
  const generateMockSignature = (): string => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 88; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  // Reset modal state
  const resetModalState = () => {
    setTxStatus('idle');
    setTxSignature(null);
    setError(null);
  };

  // Handle modal close
  const handleClose = () => {
    if (txStatus === 'sending' || txStatus === 'confirming') {
      // Don't allow closing during transaction
      return;
    }
    onClose();
    resetModalState();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-white/20 rounded-xl max-w-md w-full p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-500/20 rounded-lg">
              <AlertTriangle className="h-5 w-5 text-red-400" />
            </div>
            <h2 className="text-xl font-semibold text-white">
              Confirm Deactivation
            </h2>
          </div>
          {txStatus !== 'sending' && txStatus !== 'confirming' && (
            <button
              onClick={handleClose}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            >
              <X className="h-4 w-4 text-gray-400" />
            </button>
          )}
        </div>

        {/* Content based on transaction status */}
        {txStatus === 'idle' && (
          <>
            <div className="mb-6">
              <p className="text-gray-300 mb-4">
                You are about to deactivate your XORJ trading bot and revoke all permissions. 
                This action will:
              </p>
              <ul className="text-gray-300 text-sm space-y-2 ml-4">
                <li>• Immediately stop all automated trading</li>
                <li>• Revoke bot access to your vault</li>
                <li>• Remove delegated authority from your account</li>
                <li>• Require re-authorization to reactivate</li>
              </ul>
            </div>

            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 mb-6">
              <p className="text-red-300 text-sm font-medium">
                ⚠️ Your funds will remain safe in your vault, but automated trading will stop immediately.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleClose}
                className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDeactivation}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors font-medium"
              >
                Confirm Deactivation
              </button>
            </div>
          </>
        )}

        {txStatus === 'sending' && (
          <div className="text-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-blue-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-white mb-2">
              Sending Transaction
            </h3>
            <p className="text-gray-300 text-sm">
              Please approve the transaction in your wallet...
            </p>
          </div>
        )}

        {txStatus === 'confirming' && (
          <div className="text-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-yellow-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-white mb-2">
              Transaction Confirming
            </h3>
            <p className="text-gray-300 text-sm">
              Waiting for blockchain confirmation...
            </p>
          </div>
        )}

        {txStatus === 'confirmed' && (
          <div className="text-center py-8">
            <CheckCircle className="h-8 w-8 text-green-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-white mb-2">
              Deactivation Complete
            </h3>
            <p className="text-gray-300 text-sm mb-4">
              Your trading bot has been successfully deactivated and all permissions revoked.
            </p>
            {txSignature && (
              <div className="bg-black/20 rounded-lg p-3">
                <p className="text-xs text-gray-400 mb-1">Transaction Signature:</p>
                <div className="flex items-center gap-2">
                  <code className="text-xs font-mono text-green-400 flex-1">
                    {txSignature.slice(0, 20)}...{txSignature.slice(-20)}
                  </code>
                  <ExternalLink className="h-3 w-3 text-gray-400" />
                </div>
              </div>
            )}
          </div>
        )}

        {txStatus === 'failed' && (
          <div className="text-center py-8">
            <XCircle className="h-8 w-8 text-red-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-white mb-2">
              Transaction Failed
            </h3>
            <p className="text-red-300 text-sm mb-4">
              {error || 'The deactivation transaction failed. Please try again.'}
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleClose}
                className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
              >
                Close
              </button>
              <button
                onClick={() => {
                  setTxStatus('idle');
                  setError(null);
                }}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
              >
                Try Again
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}