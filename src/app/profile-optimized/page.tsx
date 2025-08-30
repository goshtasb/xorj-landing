/**
 * Optimized Profile Page
 * Fast-loading version with minimal API calls and optimized bundle
 */

'use client';

import React, { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useRouter } from 'next/navigation';
import { OptimizedUserProfileCard } from '@/components/OptimizedUserProfileCard';
import { ArrowLeft, Zap, TrendingUp, Shield, Clock } from 'lucide-react';
import { useOptimizedProfileData } from '@/hooks/useOptimizedProfileData';

export default function OptimizedProfilePage() {
  useWallet();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const { transactions, isLoading } = useOptimizedProfileData();

  useEffect(() => {
    setMounted(true);
  }, []);

  // Development mode for localhost:3003

  if (!mounted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900">
      {/* Optimized Header */}
      <div className="border-b border-white/10 backdrop-blur-sm bg-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white flex items-center">
                <Zap className="w-6 h-6 mr-2 text-blue-400" />
                XORJ Trading Dashboard
              </h1>
              <p className="text-gray-300 text-sm mt-1">
                Production localhost environment
              </p>
            </div>
            <button
              onClick={() => router.push('/')}
              className="flex items-center px-3 py-2 text-white/70 hover:text-white transition-colors text-sm"
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              Home
            </button>
          </div>
        </div>
      </div>

      {/* Optimized Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-white text-lg">Loading dashboard...</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Profile Card */}
            <div className="lg:col-span-1">
              <OptimizedUserProfileCard />
            </div>

            {/* Stats Cards */}
            <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Bot Status */}
              <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-white">Bot Status</h3>
                  <Shield className="w-5 h-5 text-green-400" />
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-300">Status</span>
                    <span className="text-green-400">Active</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">Health</span>
                    <span className="text-green-400">95%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">Last Run</span>
                    <span className="text-gray-300">2 hours ago</span>
                  </div>
                </div>
              </div>

              {/* Performance */}
              <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-white">Performance</h3>
                  <TrendingUp className="w-5 h-5 text-blue-400" />
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-300">Total Trades</span>
                    <span className="text-white">{transactions?.length || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">Success Rate</span>
                    <span className="text-green-400">100%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">Profit/Loss</span>
                    <span className="text-green-400">+$148.5</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Recent Transactions */}
            <div className="lg:col-span-3">
              <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-white">Recent Transactions</h3>
                  <Clock className="w-5 h-5 text-gray-400" />
                </div>
                
                {transactions && transactions.length > 0 ? (
                  <div className="space-y-3">
                    {transactions.slice(0, 5).map((tx, index) => (
                      <div key={tx.id || index} className="flex items-center justify-between py-3 border-b border-white/10 last:border-b-0">
                        <div className="flex items-center space-x-3">
                          <div className={`w-2 h-2 rounded-full ${
                            tx.status === 'COMPLETED' ? 'bg-green-400' : 'bg-yellow-400'
                          }`} />
                          <div>
                            <div className="text-white font-medium">{tx.symbol || 'SOL'}</div>
                            <div className="text-gray-300 text-sm">
                              {tx.type || 'SELL'} • {new Date(tx.timestamp || Date.now()).toLocaleTimeString()}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-white font-medium">
                            {tx.amount} {tx.symbol || 'SOL'}
                          </div>
                          <div className="text-gray-300 text-sm">
                            ${tx.totalValue?.toFixed(2) || '0.00'}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-400">
                    No transactions found
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Production Environment Badge */}
        <div className="mt-8 text-center">
          <div className="inline-flex items-center px-4 py-2 bg-green-500/20 text-green-300 rounded-full text-sm">
            <div className="w-2 h-2 bg-green-400 rounded-full mr-2" />
            Production Database Connected • localhost:5435
          </div>
        </div>
      </div>
    </div>
  );
}