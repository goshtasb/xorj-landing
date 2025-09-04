/**
 * useRiskProfileSync Hook - PERMANENT SOLUTION
 * 
 * This hook provides synchronized risk profile management across all systems
 * and ensures consistent risk profile display in the UI components.
 */

'use client';

import { useState, useEffect, useCallback } from 'react';

interface SyncResults {
  frontendDatabase: { success: boolean; error?: string };
  botDatabase: { success: boolean; error?: string };
  botService: { success: boolean; error?: string };
}

interface SyncResponse {
  success: boolean;
  walletAddress: string;
  riskProfile: string;
  investmentAmount?: number;
  syncResults: SyncResults;
  timestamp: string;
  requestId: string;
}

interface RiskProfileData {
  riskProfile: 'conservative' | 'moderate' | 'aggressive';
  investmentAmount?: number;
  lastUpdated: Date;
  isInSync: boolean;
  syncStatus?: SyncResults;
}

interface UseRiskProfileSyncReturn {
  riskProfileData: RiskProfileData | null;
  isLoading: boolean;
  error: string | null;
  syncRiskProfile: (riskProfile: 'conservative' | 'moderate' | 'aggressive', investmentAmount?: number) => Promise<boolean>;
  refreshRiskProfile: () => Promise<void>;
  isInSync: boolean;
}

export function useRiskProfileSync(walletAddress?: string): UseRiskProfileSyncReturn {
  const [riskProfileData, setRiskProfileData] = useState<RiskProfileData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get current risk profile from user settings
  const fetchRiskProfile = useCallback(async () => {
    if (!walletAddress) {
      setRiskProfileData(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/user/settings?walletAddress=${walletAddress}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // Include httpOnly cookies for authentication
        cache: 'no-store'
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch risk profile: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.success && data.data) {
        setRiskProfileData({
          riskProfile: data.data.riskProfile || 'moderate',
          investmentAmount: data.data.investmentAmount,
          lastUpdated: new Date(data.data.lastUpdated || Date.now()),
          isInSync: true, // Assume in sync if we can read it successfully
          syncStatus: undefined
        });
      } else {
        // No settings found - set defaults
        setRiskProfileData({
          riskProfile: 'moderate',
          investmentAmount: undefined,
          lastUpdated: new Date(),
          isInSync: false,
          syncStatus: undefined
        });
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch risk profile';
      console.error('❌ Risk profile fetch error:', errorMessage);
      setError(errorMessage);
      
      // Set fallback data
      setRiskProfileData({
        riskProfile: 'moderate',
        investmentAmount: undefined,
        lastUpdated: new Date(),
        isInSync: false,
        syncStatus: undefined
      });
    } finally {
      setIsLoading(false);
    }
  }, [walletAddress]);

  // Sync risk profile across all systems
  const syncRiskProfile = useCallback(async (
    riskProfile: 'conservative' | 'moderate' | 'aggressive',
    investmentAmount?: number
  ): Promise<boolean> => {
    if (!walletAddress) {
      setError('Wallet address is required');
      return false;
    }

    setIsLoading(true);
    setError(null);

    try {
      console.log(`🔄 Syncing risk profile ${riskProfile} for ${walletAddress}`);

      const response = await fetch('/api/user/settings/sync-risk-profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // Include httpOnly cookies for authentication
        body: JSON.stringify({
          walletAddress,
          riskProfile,
          investmentAmount
        })
      });

      if (!response.ok) {
        throw new Error(`Sync failed: ${response.status} ${response.statusText}`);
      }

      const syncResponse: SyncResponse = await response.json();

      if (syncResponse.success) {
        // Update local state with synced data
        setRiskProfileData({
          riskProfile,
          investmentAmount,
          lastUpdated: new Date(syncResponse.timestamp),
          isInSync: true,
          syncStatus: syncResponse.syncResults
        });

        console.log(`✅ Risk profile sync completed for ${walletAddress}:`, {
          riskProfile,
          frontendDb: syncResponse.syncResults.frontendDatabase.success,
          botDb: syncResponse.syncResults.botDatabase.success,
          botService: syncResponse.syncResults.botService.success
        });

        return true;
      } else {
        throw new Error('Sync operation failed');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Sync failed';
      console.error('❌ Risk profile sync error:', errorMessage);
      setError(errorMessage);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [walletAddress]);

  // Refresh risk profile from server
  const refreshRiskProfile = useCallback(async () => {
    await fetchRiskProfile();
  }, [fetchRiskProfile]);

  // Auto-fetch risk profile when wallet address changes
  useEffect(() => {
    if (walletAddress) {
      fetchRiskProfile();
    }
  }, [walletAddress, fetchRiskProfile]);

  // Listen for storage events to refresh when other components update risk profile
  useEffect(() => {
    if (!walletAddress) return;

    const handleStorageEvent = (event: StorageEvent) => {
      if (event.key === 'xorj_risk_profile_updated') {
        console.log('🔄 Risk profile updated by another component, refreshing...');
        fetchRiskProfile();
      }
    };

    window.addEventListener('storage', handleStorageEvent);
    return () => window.removeEventListener('storage', handleStorageEvent);
  }, [walletAddress, fetchRiskProfile]);

  return {
    riskProfileData,
    isLoading,
    error,
    syncRiskProfile,
    refreshRiskProfile,
    isInSync: riskProfileData?.isInSync ?? false
  };
}