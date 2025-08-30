/**
 * WalletConflictModal Component
 * Helps users resolve wallet conflicts between MetaMask and Phantom
 */

'use client';

import React, { useState, useEffect } from 'react';
import { X, AlertCircle, Download, RefreshCw } from 'lucide-react';
import { detectWallets, getWalletInstructions, type WalletDetectionResult } from '@/utils/walletDetection';

interface WalletConflictModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRetry?: () => void;
}

export function WalletConflictModal({ isOpen, onClose, onRetry }: WalletConflictModalProps) {
  const [detection, setDetection] = useState<WalletDetectionResult | null>(null);
  const [instructions, setInstructions] = useState<string[]>([]);

  useEffect(() => {
    if (isOpen) {
      const result = detectWallets();
      const instructionsList = getWalletInstructions();
      setDetection(result);
      setInstructions(instructionsList);
    }
  }, [isOpen]);

  if (!isOpen || !detection) return null;

  const handleInstallPhantom = () => {
    window.open('https://phantom.app/', '_blank');
  };

  const handleRefresh = () => {
    window.location.reload();
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-800 rounded-xl p-6 max-w-md w-full border border-slate-700">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <AlertCircle className="h-6 w-6 text-yellow-400" />
            <h2 className="text-xl font-semibold text-white">Wallet Setup Required</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Detection Status */}
          <div className="bg-slate-900 rounded-lg p-4">
            <div className="text-sm space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-400">Phantom Wallet:</span>
                <span className={detection.hasPhantom ? 'text-green-400' : 'text-red-400'}>
                  {detection.hasPhantom ? '✓ Detected' : '✗ Not Found'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">MetaMask:</span>
                <span className={detection.hasMetaMask ? 'text-yellow-400' : 'text-gray-500'}>
                  {detection.hasMetaMask ? '⚠ Detected' : '✓ Not Found'}
                </span>
              </div>
              {detection.metaMaskConflict && (
                <div className="flex justify-between">
                  <span className="text-gray-400">Conflict:</span>
                  <span className="text-red-400">✗ Detected</span>
                </div>
              )}
            </div>
          </div>

          {/* Instructions */}
          <div className="space-y-3">
            <p className="text-slate-300 font-medium">{detection.recommendation}</p>
            
            {instructions.length > 0 && (
              <div className="space-y-2">
                {instructions.map((instruction, index) => (
                  <p key={index} className="text-sm text-slate-400">
                    {instruction}
                  </p>
                ))}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col space-y-3">
            {!detection.hasPhantom && (
              <button
                onClick={handleInstallPhantom}
                className="w-full flex items-center justify-center space-x-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-3 rounded-lg font-medium transition-colors"
              >
                <Download className="h-4 w-4" />
                <span>Install Phantom Wallet</span>
              </button>
            )}
            
            <button
              onClick={handleRefresh}
              className="w-full flex items-center justify-center space-x-2 bg-slate-700 hover:bg-slate-600 text-white px-4 py-3 rounded-lg font-medium transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
              <span>Refresh & Retry</span>
            </button>

            {onRetry && detection.phantomAvailable && (
              <button
                onClick={() => {
                  onRetry();
                  onClose();
                }}
                className="w-full bg-green-600 hover:bg-green-700 text-white px-4 py-3 rounded-lg font-medium transition-colors"
              >
                Try Connecting Again
              </button>
            )}
          </div>

          {/* Additional Help */}
          {detection.metaMaskConflict && (
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
              <p className="text-yellow-300 text-sm">
                <strong>Pro Tip:</strong> Create a separate browser profile for DeFi activities 
                to avoid wallet conflicts between Ethereum (MetaMask) and Solana (Phantom) applications.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default WalletConflictModal;