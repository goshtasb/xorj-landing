/**
 * TradingPanel Component
 * Manual trade execution interface connected to POST /api/trades/execute
 */

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useSimpleWallet } from '@/contexts/SimpleWalletContext';
import { ArrowUpDown, DollarSign, AlertCircle, CheckCircle, Loader2, RefreshCw } from 'lucide-react';


interface TradeResult {
  tradeId: string;
  status: 'PENDING' | 'CONFIRMED' | 'FAILED';
  transactionSignature?: string;
  expectedOutput: string;
  actualOutput?: string;
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: number;
  requestId: string;
}

const TOKEN_OPTIONS = [
  { 
    address: 'So11111111111111111111111111111111111111112',
    symbol: 'SOL',
    name: 'Solana',
    decimals: 9
  },
  {
    address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    symbol: 'USDC', 
    name: 'USD Coin',
    decimals: 6
  }
];

export function TradingPanel() {
  const { publicKey, connected } = useSimpleWallet();
  
  // Form state
  const [fromToken, setFromToken] = useState(TOKEN_OPTIONS[0].address);
  const [toToken, setToToken] = useState(TOKEN_OPTIONS[1].address);
  const [amount, setAmount] = useState('0.1');
  const [slippage, setSlippage] = useState('3');
  
  // UI state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [tradeResult, setTradeResult] = useState<TradeResult | null>(null);
  
  // Balance state
  const [walletBalance, setWalletBalance] = useState(0);
  const [loadingBalance, setLoadingBalance] = useState(false);
  
  const fetchWalletBalance = useCallback(async () => {
    if (!publicKey) return;

    setLoadingBalance(true);
    try {
      const response = await fetch(`/api/wallet/balance?walletAddress=${publicKey.toString()}`);
      const data = await response.json();

      if (data.success) {
        setWalletBalance(data.data.totalUsdValue);
      }
    } catch (error) {
      console.error('Error fetching wallet balance:', error);
    } finally {
      setLoadingBalance(false);
    }
  }, [publicKey]);

  // Load wallet balance (remove reactive fetching to prevent infinite loops)
  useEffect(() => {
    if (connected && publicKey) {
      fetchWalletBalance();
    }
  }, [connected, publicKey]); // Removed fetchWalletBalance from dependencies to prevent infinite loop

  const swapTokens = () => {
    const temp = fromToken;
    setFromToken(toToken);
    setToToken(temp);
  };

  const executeTrade = async () => {
    if (!connected || !publicKey) {
      setError('Please connect your wallet first');
      return;
    }

    if (!amount || parseFloat(amount) <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccess(null);
    setTradeResult(null);

    try {
      // Get stored JWT token - try both keys for compatibility
      const token = localStorage.getItem('xorj_session_token') || localStorage.getItem('xorj_jwt_token');
      if (!token) {
        throw new Error('Please reconnect your wallet - session expired');
      }

      // Convert amount to token units (lamports for SOL)
      const fromTokenData = TOKEN_OPTIONS.find(t => t.address === fromToken);
      const tokenAmount = Math.floor(parseFloat(amount) * Math.pow(10, fromTokenData?.decimals || 9));

      const tradeParams = {
        from_token: fromToken,
        to_token: toToken,
        amount: tokenAmount,
        slippage_bps: Math.floor(parseFloat(slippage) * 100), // Convert % to basis points
        priority_fee: 5000
      };

      console.log('🚀 Executing trade:', tradeParams);

      const response = await fetch('/api/trades/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        },
        body: JSON.stringify(tradeParams)
      });

      const responseData: ApiResponse<TradeResult> = await response.json();

      if (responseData.success && responseData.data) {
        setTradeResult(responseData.data);
        setSuccess(`Trade executed successfully! Trade ID: ${responseData.data.tradeId.substring(0, 8)}...`);
        
        // Refresh balance after successful trade
        setTimeout(fetchWalletBalance, 2000);
      } else {
        setError(responseData.error || 'Trade execution failed');
      }

    } catch (error) {
      console.error('Trade execution error:', error);
      setError(error instanceof Error ? error.message : 'Failed to execute trade');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getFromTokenSymbol = () => TOKEN_OPTIONS.find(t => t.address === fromToken)?.symbol || 'Unknown';
  const getToTokenSymbol = () => TOKEN_OPTIONS.find(t => t.address === toToken)?.symbol || 'Unknown';

  if (!connected || !publicKey) {
    return (
      <div className="bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 p-6">
        <div className="text-center">
          <h3 className="text-xl font-bold text-white mb-2">Manual Trading</h3>
          <p className="text-gray-400">Please connect your wallet to start trading</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 p-6">
      <div className="mb-6">
        <h3 className="text-xl font-bold text-white mb-2">Manual Trading</h3>
        <p className="text-gray-400 text-sm">Execute trades directly using Jupiter aggregator</p>
        
        {/* Balance Display */}
        <div className="mt-3 flex items-center gap-2 text-sm">
          <DollarSign className="h-4 w-4 text-green-400" />
          <span className="text-white">Wallet Balance:</span>
          {loadingBalance ? (
            <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
          ) : (
            <>
              <span className="text-green-400 font-semibold">${walletBalance.toFixed(2)}</span>
              <button
                onClick={fetchWalletBalance}
                className="p-1 hover:bg-white/10 rounded-full transition-colors"
                title="Refresh balance"
              >
                <RefreshCw className="h-3 w-3 text-gray-400" />
              </button>
            </>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {/* From Token */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">From</label>
          <div className="flex gap-3">
            <select
              value={fromToken}
              onChange={(e) => setFromToken(e.target.value)}
              className="flex-1 bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              {TOKEN_OPTIONS.map((token) => (
                <option key={token.address} value={token.address} className="bg-gray-800">
                  {token.symbol} - {token.name}
                </option>
              ))}
            </select>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.0"
              min="0"
              step="0.001"
              className="w-32 bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
        </div>

        {/* Swap Button */}
        <div className="flex justify-center">
          <button
            onClick={swapTokens}
            className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
          >
            <ArrowUpDown className="h-5 w-5 text-white" />
          </button>
        </div>

        {/* To Token */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">To</label>
          <select
            value={toToken}
            onChange={(e) => setToToken(e.target.value)}
            className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            {TOKEN_OPTIONS.map((token) => (
              <option key={token.address} value={token.address} className="bg-gray-800">
                {token.symbol} - {token.name}
              </option>
            ))}
          </select>
        </div>

        {/* Slippage */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Slippage Tolerance (%)
          </label>
          <input
            type="number"
            value={slippage}
            onChange={(e) => setSlippage(e.target.value)}
            min="0.1"
            max="50"
            step="0.1"
            className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>

        {/* Error/Success Messages */}
        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-500/20 border border-red-500/30 rounded-lg">
            <AlertCircle className="h-4 w-4 text-red-400 flex-shrink-0" />
            <span className="text-red-400 text-sm">{error}</span>
          </div>
        )}

        {success && (
          <div className="flex items-center gap-2 p-3 bg-green-500/20 border border-green-500/30 rounded-lg">
            <CheckCircle className="h-4 w-4 text-green-400 flex-shrink-0" />
            <span className="text-green-400 text-sm">{success}</span>
          </div>
        )}

        {/* Trade Result */}
        {tradeResult && (
          <div className="p-4 bg-white/10 border border-white/20 rounded-lg">
            <h4 className="font-semibold text-white mb-2">Trade Details</h4>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-300">Status:</span>
                <span className={`font-semibold ${
                  tradeResult.status === 'CONFIRMED' ? 'text-green-400' : 
                  tradeResult.status === 'FAILED' ? 'text-red-400' : 'text-yellow-400'
                }`}>
                  {tradeResult.status}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-300">Trade ID:</span>
                <span className="text-white font-mono">{tradeResult.tradeId.substring(0, 16)}...</span>
              </div>
              {tradeResult.transactionSignature && (
                <div className="flex justify-between">
                  <span className="text-gray-300">Transaction:</span>
                  <span className="text-white font-mono">{tradeResult.transactionSignature.substring(0, 16)}...</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-300">Expected Output:</span>
                <span className="text-white">{parseInt(tradeResult.expectedOutput).toLocaleString()} {getToTokenSymbol()}</span>
              </div>
            </div>
          </div>
        )}

        {/* Execute Button */}
        <button
          onClick={executeTrade}
          disabled={isSubmitting || fromToken === toToken}
          className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed text-white font-semibold py-3 px-4 rounded-lg transition-all duration-200"
        >
          {isSubmitting ? (
            <div className="flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Executing Trade...
            </div>
          ) : (
            `Swap ${amount} ${getFromTokenSymbol()} → ${getToTokenSymbol()}`
          )}
        </button>

        <p className="text-xs text-gray-400 text-center mt-2">
          Trades are executed on Solana Testnet via Jupiter aggregator
        </p>
      </div>
    </div>
  );
}