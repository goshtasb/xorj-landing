/**
 * User Profile Page - Authenticated User Application
 * Route: /profile
 * 
 * This page serves as the main authenticated user experience after wallet connection.
 * Users are redirected here after clicking the signed-in wallet button.
 */

'use client';

import React, { useState, useEffect } from 'react';
import { useSimpleWallet } from '@/contexts/SimpleWalletContext';
import { useRouter } from 'next/navigation';
import { UserProfileCard } from '@/components/UserProfileCard';
import { BotControlsCard } from '@/components/BotControlsCard';
import { DangerZone } from '@/components/DangerZone';
import { DashboardContainer } from '@/components/DashboardContainer';
import { RiskProfileSelector } from '@/components/RiskProfileSelector';
import { TransactionHistoryTable } from '@/components/TransactionHistoryTable';

export default function ProfilePage() {
  const { publicKey, connected } = useSimpleWallet();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  console.log('🏠 ProfilePage debug:', { 
    mounted, 
    connected, 
    publicKey: publicKey?.toString(), 
    isDev: process.env.NODE_ENV === 'development',
    contextType: 'SimpleWallet'
  });
  
  // Ensure component is mounted before checking wallet connection
  useEffect(() => {
    setMounted(true);
  }, []);

  console.log('🔧 Wallet connection debug:', { 
    mounted, 
    connected,
    hasPublicKey: !!publicKey,
    publicKeyString: publicKey?.toString(),
    nodeEnv: process.env.NODE_ENV 
  });

  // Always require wallet connection - no demo mode allowed
  useEffect(() => {
    if (mounted && (!connected || !publicKey)) {
      console.log('🚨 Profile page: No wallet connected, would redirect to home (disabled for debugging)');
      // Temporarily disabled: router.push('/');
    }
  }, [connected, publicKey, router, mounted]);

  // Always show loading state initially to prevent hydration mismatch
  if (!mounted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  // After mounting, require wallet connection
  if (!connected || !publicKey) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="text-white text-xl">Wallet Connection Required</div>
          <div className="text-gray-300 text-center">
            Please connect your wallet to access your profile
          </div>
          <button
            onClick={() => router.push('/')}
            className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-semibold"
          >
            Go Back to Home
          </button>
        </div>
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