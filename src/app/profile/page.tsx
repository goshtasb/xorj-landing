/**
 * User Profile Page - Authenticated User Application
 * Route: /profile
 * 
 * This page serves as the main authenticated user experience after wallet connection.
 * Users are redirected here after clicking the signed-in wallet button.
 */

'use client';

import React, { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useRouter } from 'next/navigation';
import { UserProfileCard } from '@/components/UserProfileCard';
import { BotControlsCard } from '@/components/BotControlsCard';
import { DangerZone } from '@/components/DangerZone';
import { DashboardContainer } from '@/components/DashboardContainer';
import { RiskProfileSelector } from '@/components/RiskProfileSelector';
import { TransactionHistoryTable } from '@/components/TransactionHistoryTable';

export default function ProfilePage() {
  const { publicKey, connected } = useWallet();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  
  // Ensure component is mounted before checking wallet connection
  useEffect(() => {
    setMounted(true);
  }, []);

  // Development mode - only check after mounting to prevent hydration mismatch
  const isDevelopmentMode = mounted && typeof window !== 'undefined' && 
    (window.location.search.includes('demo=true') || process.env.NODE_ENV === 'development');

  // Redirect to home if not connected (unless in development mode)
  useEffect(() => {
    if (mounted && !isDevelopmentMode && (!connected || !publicKey)) {
      router.push('/');
    }
  }, [connected, publicKey, router, isDevelopmentMode, mounted]);

  // Always show loading state initially to prevent hydration mismatch
  if (!mounted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  // After mounting, check if user should be redirected
  if (!isDevelopmentMode && (!connected || !publicKey)) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900">
      {/* Header */}
      <div className="border-b border-white/10 backdrop-blur-sm bg-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white">
                User Profile
              </h1>
              <p className="text-gray-300 mt-1">
                Manage your XORJ trading bot and security settings
              </p>
            </div>
            <button
              onClick={() => router.push('/')}
              className="px-4 py-2 text-white/70 hover:text-white transition-colors"
            >
              ← Back to Home
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-8">
          {/* User Profile Card */}
          <UserProfileCard />

          {/* Bot Controls and Status */}
          <BotControlsCard />

          {/* Performance Dashboard */}
          <DashboardContainer />

          {/* Risk Profile Configuration */}
          <RiskProfileSelector />

          {/* Transaction History */}
          <TransactionHistoryTable />

          {/* Danger Zone */}
          <DangerZone />
        </div>
      </div>
    </div>
  );
}