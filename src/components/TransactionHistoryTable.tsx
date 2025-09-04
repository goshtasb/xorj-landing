/**
 * TransactionHistoryTable Component
 * Displays paginated transaction history with loading states and controls
 */

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { usePerformantAPI } from '@/lib/performanceControls';
import { 
  ArrowUpRight, 
  ArrowDownLeft, 
  DollarSign, 
  Clock, 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  ChevronLeft, 
  ChevronRight,
  Copy,
  RefreshCw,
  Pause,
  Play
} from 'lucide-react';

export type TransactionType = 'BUY' | 'SELL' | 'DEPOSIT' | 'WITHDRAWAL';
export type TransactionStatus = 'COMPLETED' | 'PENDING' | 'FAILED';

interface Transaction {
  id: string;
  walletAddress: string;
  timestamp: number;
  type: TransactionType;
  status: TransactionStatus;
  symbol: string;
  amount: number;
  price: number;
  totalValue: number;
  fees: number;
  txHash?: string;
  copyTradeFrom?: string;
  notes?: string;
}

interface PaginatedTransactions {
  transactions: Transaction[];
  totalCount: number;
  pageCount: number;
  currentPage: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

interface TransactionHistoryTableProps {
  className?: string;
}

export function TransactionHistoryTable({ className = '' }: TransactionHistoryTableProps) {
  const { publicKey } = useWallet();
  const { smartFetch } = usePerformantAPI();
  
  // State management
  const [data, setData] = useState<PaginatedTransactions | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedTxHash, setCopiedTxHash] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [lastUpdateTime, setLastUpdateTime] = useState<Date | null>(null);
  const [pollingEnabled, setPollingEnabled] = useState(true);

  // Ensure component is mounted before accessing wallet
  useEffect(() => {
    setMounted(true);
  }, []);

  // Use demo wallet address if no real wallet connected (for development)
  const effectivePublicKey = mounted ? publicKey?.toString() : undefined;

  // Fetch transactions data
  const fetchTransactions = useCallback(async (page: number, silent = false) => {
    if (!mounted || !effectivePublicKey) return;

    if (!silent) {
      setLoading(true);
      setError(null);
    }

    try {
      if (!silent) {
        console.log(`📄 Fetching transactions for page ${page}...`);
      }
      
      const url = `/api/user/transactions?walletAddress=${effectivePublicKey}&page=${page}&limit=10`;
      const result = await smartFetch(url, {}, `transactions-${effectivePublicKey}-${page}`, 30000);
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch transactions');
      }

      setData(result.data);
      setLastUpdateTime(new Date());
      
      if (!silent) {
        console.log(`✅ Loaded ${result.data.transactions.length} transactions`);
      } else {
        console.log(`🔄 Auto-refreshed: ${result.data.transactions.length} transactions`);
      }

    } catch (err) {
      if (!silent) {
        console.error('❌ Transaction fetch failed:', err);
        setError(err instanceof Error ? err.message : 'Failed to load transactions');
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [mounted, effectivePublicKey]);

  // Initial data fetch
  useEffect(() => {
    if (mounted) {
      fetchTransactions(currentPage);
    }
  }, [currentPage, mounted, effectivePublicKey, fetchTransactions]);

  // Live polling for transaction updates (reduced frequency and fixed infinite loop)
  useEffect(() => {
    if (!mounted || !effectivePublicKey || !pollingEnabled) return;

    console.log('🔄 Starting live transaction polling (every 30s)...');
    
    const interval = setInterval(() => {
      // Create a local fetch function to avoid dependency issues
      const fetchCurrentPage = async () => {
        if (!mounted || !effectivePublicKey) return;
        
        try {
          const response = await fetch(
            `/api/user/transactions?walletAddress=${effectivePublicKey}&page=${currentPage}&limit=10`
          );
          
          if (response.ok) {
            const result = await response.json();
            if (result.success) {
              setData(result.data);
              setLastUpdateTime(new Date());
              console.log(`🔄 Auto-refreshed: ${result.data.transactions.length} transactions`);
            }
          }
        } catch (err) {
          // Silently fail during polling to avoid spam
          console.warn('⚠️ Polling failed silently:', err);
        }
      };
      
      fetchCurrentPage();
    }, 30000); // Poll every 30 seconds instead of 3 seconds

    return () => {
      console.log('⏹️ Stopping live transaction polling');
      clearInterval(interval);
    };
  }, [mounted && effectivePublicKey && pollingEnabled]); // PERFORMANCE CONTROLLED: Stable deps with smart polling

  // Handle page navigation
  const handlePageChange = (newPage: number) => {
    if (newPage !== currentPage && data) {
      if (newPage >= 1 && newPage <= data.pageCount) {
        setCurrentPage(newPage);
      }
    }
  };

  // Copy transaction hash to clipboard
  const copyTxHash = async (txHash: string) => {
    try {
      await navigator.clipboard.writeText(txHash);
      setCopiedTxHash(txHash);
      setTimeout(() => setCopiedTxHash(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  // Format currency values
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  };

  // Format date and time
  const formatDateTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return {
      date: date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric' 
      }),
      time: date.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: false
      })
    };
  };

  // Get transaction type icon and styling
  const getTransactionTypeInfo = (type: TransactionType, status: TransactionStatus) => {
    const baseClasses = "p-2 rounded-full";
    
    if (status === 'FAILED') {
      return {
        icon: <XCircle className="h-4 w-4" />,
        className: `${baseClasses} bg-red-500/20 text-red-400`
      };
    }

    switch (type) {
      case 'BUY':
        return {
          icon: <ArrowDownLeft className="h-4 w-4" />,
          className: `${baseClasses} bg-green-500/20 text-green-400`
        };
      case 'SELL':
        return {
          icon: <ArrowUpRight className="h-4 w-4" />,
          className: `${baseClasses} bg-red-500/20 text-red-400`
        };
      case 'DEPOSIT':
        return {
          icon: <DollarSign className="h-4 w-4" />,
          className: `${baseClasses} bg-blue-500/20 text-blue-400`
        };
      case 'WITHDRAWAL':
        return {
          icon: <DollarSign className="h-4 w-4" />,
          className: `${baseClasses} bg-purple-500/20 text-purple-400`
        };
      default:
        return {
          icon: <Clock className="h-4 w-4" />,
          className: `${baseClasses} bg-gray-500/20 text-gray-400`
        };
    }
  };

  // Get status badge
  const getStatusBadge = (status: TransactionStatus) => {
    switch (status) {
      case 'COMPLETED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-500/20 text-green-400">
            <CheckCircle className="h-3 w-3" />
            Completed
          </span>
        );
      case 'PENDING':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-yellow-500/20 text-yellow-400">
            <Clock className="h-3 w-3" />
            Pending
          </span>
        );
      case 'FAILED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-red-500/20 text-red-400">
            <XCircle className="h-3 w-3" />
            Failed
          </span>
        );
      default:
        return null;
    }
  };

  // Loading skeleton
  if (loading) {
    return (
      <div className={`bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl p-6 ${className}`}>
        <div className="animate-pulse">
          <div className="h-6 w-48 bg-gray-600 rounded mb-6" />
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 bg-gray-700 rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={`bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl p-6 ${className}`}>
        <h2 className="text-xl font-semibold text-white mb-4">Transaction History</h2>
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0" />
            <div>
              <h3 className="text-red-400 font-medium">Error Loading Transactions</h3>
              <p className="text-red-300 text-sm mt-1">{error}</p>
              <button
                onClick={() => fetchTransactions(currentPage)}
                className="text-red-400 hover:text-red-300 text-sm underline mt-2"
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Empty state
  if (!data || data.transactions.length === 0) {
    return (
      <div className={`bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl p-6 ${className}`}>
        <h2 className="text-xl font-semibold text-white mb-6">Transaction History</h2>
        <div className="text-center py-12">
          <div className="text-gray-400 text-lg">No History</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl p-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-white">Transaction History</h2>
          <div className="flex items-center gap-4 mt-1">
            <p className="text-gray-400 text-sm">
              {data.totalCount} total transactions
            </p>
            {lastUpdateTime && (
              <p className="text-gray-500 text-xs">
                Updated {lastUpdateTime.toLocaleTimeString()}
              </p>
            )}
          </div>
        </div>
        
        {/* Live Polling Controls */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2">
            {pollingEnabled && (
              <div className="flex items-center gap-1 text-green-400 text-xs">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                Live
              </div>
            )}
            <button
              onClick={() => setPollingEnabled(!pollingEnabled)}
              className={`p-2 rounded-lg transition-colors ${
                pollingEnabled 
                  ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30' 
                  : 'bg-gray-500/20 text-gray-400 hover:bg-gray-500/30'
              }`}
              title={pollingEnabled ? 'Pause live updates' : 'Enable live updates'}
            >
              {pollingEnabled ? (
                <Pause className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4" />
              )}
            </button>
          </div>
          
          <button
            onClick={() => fetchTransactions(currentPage)}
            disabled={loading}
            className="p-2 bg-white/10 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
            title="Refresh now"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/10">
              <th className="text-left py-3 px-2 text-gray-400 font-medium text-xs uppercase tracking-wider">
                Type
              </th>
              <th className="text-left py-3 px-2 text-gray-400 font-medium text-xs uppercase tracking-wider">
                Asset
              </th>
              <th className="text-left py-3 px-2 text-gray-400 font-medium text-xs uppercase tracking-wider">
                Amount
              </th>
              <th className="text-left py-3 px-2 text-gray-400 font-medium text-xs uppercase tracking-wider">
                Price
              </th>
              <th className="text-left py-3 px-2 text-gray-400 font-medium text-xs uppercase tracking-wider">
                Total
              </th>
              <th className="text-left py-3 px-2 text-gray-400 font-medium text-xs uppercase tracking-wider">
                Status
              </th>
              <th className="text-left py-3 px-2 text-gray-400 font-medium text-xs uppercase tracking-wider">
                Date/Time
              </th>
              <th className="text-left py-3 px-2 text-gray-400 font-medium text-xs uppercase tracking-wider">
                TxHash
              </th>
            </tr>
          </thead>
          <tbody>
            {data.transactions.map((tx) => {
              const typeInfo = getTransactionTypeInfo(tx.type, tx.status);
              const dateTime = formatDateTime(tx.timestamp);
              
              return (
                <tr key={tx.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                  {/* Type */}
                  <td className="py-4 px-2">
                    <div className="flex items-center gap-3">
                      <div className={typeInfo.className}>
                        {typeInfo.icon}
                      </div>
                      <div>
                        <div className="text-white font-medium text-sm">{tx.type}</div>
                        {tx.copyTradeFrom && (
                          <div className="text-gray-500 text-xs">Copy: {tx.copyTradeFrom}</div>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Asset */}
                  <td className="py-4 px-2">
                    <span className="text-white font-medium">{tx.symbol}</span>
                  </td>

                  {/* Amount */}
                  <td className="py-4 px-2">
                    <span className="text-white">{(tx.amount || 0).toLocaleString()}</span>
                  </td>

                  {/* Price */}
                  <td className="py-4 px-2">
                    <span className="text-gray-300">{formatCurrency(tx.price || 0)}</span>
                  </td>

                  {/* Total Value */}
                  <td className="py-4 px-2">
                    <div>
                      <span className="text-white font-medium">{formatCurrency(tx.totalValue || 0)}</span>
                      <div className="text-gray-500 text-xs">Fee: {formatCurrency(tx.fees || 0)}</div>
                    </div>
                  </td>

                  {/* Status */}
                  <td className="py-4 px-2">
                    {getStatusBadge(tx.status)}
                    {tx.notes && (
                      <div className="text-red-400 text-xs mt-1" title={tx.notes}>
                        {tx.notes.substring(0, 30)}...
                      </div>
                    )}
                  </td>

                  {/* Date/Time */}
                  <td className="py-4 px-2">
                    <div className="text-white text-sm">{dateTime.date}</div>
                    <div className="text-gray-400 text-xs">{dateTime.time}</div>
                  </td>

                  {/* TxHash */}
                  <td className="py-4 px-2">
                    {tx.txHash ? (
                      <div className="flex items-center gap-2">
                        <span className="text-gray-400 text-xs font-mono">
                          {tx.txHash}
                        </span>
                        <button
                          onClick={() => copyTxHash(tx.txHash!)}
                          className="text-gray-400 hover:text-white transition-colors"
                          title="Copy transaction hash"
                        >
                          {copiedTxHash === tx.txHash ? (
                            <CheckCircle className="h-3 w-3 text-green-400" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </button>
                      </div>
                    ) : (
                      <span className="text-gray-500 text-xs">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      {data.pageCount > 1 && (
        <div className="flex items-center justify-between mt-6 pt-4 border-t border-white/10">
          <div className="text-sm text-gray-400">
            Page {data.currentPage} of {data.pageCount} 
            <span className="ml-2">
              ({data.transactions.length} of {data.totalCount} transactions)
            </span>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => handlePageChange(data.currentPage - 1)}
              disabled={!data.hasPreviousPage || loading}
              className="
                inline-flex items-center gap-2 px-3 py-2 text-sm
                text-gray-400 hover:text-white hover:bg-white/10
                border border-white/20 rounded-lg transition-colors
                disabled:opacity-50 disabled:cursor-not-allowed
              "
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </button>
            
            <button
              onClick={() => handlePageChange(data.currentPage + 1)}
              disabled={!data.hasNextPage || loading}
              className="
                inline-flex items-center gap-2 px-3 py-2 text-sm
                text-gray-400 hover:text-white hover:bg-white/10
                border border-white/20 rounded-lg transition-colors
                disabled:opacity-50 disabled:cursor-not-allowed
              "
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}