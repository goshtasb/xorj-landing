/**
 * Risk Profile Synchronization Status Component
 * 
 * PERMANENT SOLUTION: Displays real-time sync status across all systems
 * and provides manual reconciliation controls to fix sync issues.
 * 
 * This component helps users understand and resolve the persistent
 * risk profile sync failures that have been occurring.
 */

'use client';

import React, { useState, useEffect } from 'react';
import { RefreshCw, AlertCircle, CheckCircle, Settings, Loader2, Activity } from 'lucide-react';
import { usePerformantAPI } from '@/lib/performanceControls';

interface SyncSource {
  riskProfile: string | null;
  investmentAmount: number | null;
  lastUpdated: string | null;
  available: boolean;
}

interface SyncStatus {
  success: boolean;
  walletAddress: string;
  isInSync: boolean;
  lastSyncAttempt: string;
  lastSuccessfulSync: string;
  failureCount: number;
  sources: {
    frontend: SyncSource;
    botService: SyncSource;
    database: SyncSource;
  };
  conflicts: string[];
  recommendations: string[];
  timestamp: string;
  requestId: string;
}

interface ReconciliationResult {
  success: boolean;
  walletAddress: string;
  reconciliationPerformed: boolean;
  preReconciliationStatus: {
    isInSync: boolean;
    conflicts: string[];
  };
  postReconciliationStatus: {
    isInSync: boolean;
    conflicts: string[];
  };
  actions: string[];
  errors: string[];
  timestamp: string;
  requestId: string;
}

interface RiskProfileSyncStatusProps {
  walletAddress?: string;
  autoRefresh?: boolean;
  refreshInterval?: number; // in seconds
  showDetailedStatus?: boolean;
}

export function RiskProfileSyncStatus({
  walletAddress,
  autoRefresh = true,
  refreshInterval = 30,
  showDetailedStatus = true
}: RiskProfileSyncStatusProps) {
  const { smartFetch } = usePerformantAPI();
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [lastReconciliation, setLastReconciliation] = useState<ReconciliationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const fetchSyncStatus = async () => {
    if (!walletAddress) return;

    setLoading(true);
    setError(null);

    try {
      const url = `/api/user/settings/sync?walletAddress=${walletAddress}`;
      const data = await smartFetch(url, { method: 'GET' }, `sync-status-${walletAddress}`, 20000);
      setSyncStatus(data);

      console.log(`✅ Risk profile sync status fetched for ${walletAddress}:`, {
        isInSync: data.isInSync,
        conflicts: data.conflicts.length
      });

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch sync status';
      
      // Handle service unavailable gracefully (trading bot not running)
      if (errorMessage.includes('signal timed out') || errorMessage.includes('Failed to fetch')) {
        setError('Trading bot service offline');
        console.log('ℹ️ Trading bot service not available - this is expected in development');
      } else {
        setError(errorMessage);
        console.error('❌ Risk profile sync status fetch failed:', errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  const performReconciliation = async () => {
    if (!walletAddress) return;

    setReconciling(true);
    setError(null);

    try {
      console.log(`🔧 Starting manual reconciliation for ${walletAddress}`);

      const url = '/api/user/settings/sync';
      const result = await smartFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress })
      }, `sync-reconcile-${walletAddress}`, 15000);
      setLastReconciliation(result);

      console.log(`✅ Manual reconciliation completed for ${walletAddress}:`, {
        success: result.success,
        wasFixed: result.preReconciliationStatus.isInSync !== result.postReconciliationStatus.isInSync
      });

      // Refresh sync status after reconciliation
      setTimeout(() => {
        fetchSyncStatus();
      }, 1000);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Reconciliation failed';
      setError(errorMessage);
      console.error('❌ Manual reconciliation failed:', errorMessage);
    } finally {
      setReconciling(false);
    }
  };

  // Auto-refresh sync status
  useEffect(() => {
    if (!mounted || !walletAddress) return;

    fetchSyncStatus();

    if (autoRefresh) {
      const interval = setInterval(fetchSyncStatus, refreshInterval * 1000);
      return () => clearInterval(interval);
    }
  }, [mounted, walletAddress, autoRefresh, refreshInterval]);

  const formatTimestamp = (timestamp: string) => {
    try {
      return new Date(timestamp).toLocaleTimeString();
    } catch {
      return 'Unknown';
    }
  };

  const getSyncStatusColor = (isInSync: boolean) => {
    return isInSync ? 'text-green-400' : 'text-red-400';
  };

  const getSyncStatusIcon = (isInSync: boolean) => {
    return isInSync ? (
      <CheckCircle className="h-4 w-4 text-green-400" />
    ) : (
      <AlertCircle className="h-4 w-4 text-red-400" />
    );
  };

  if (!mounted || !walletAddress) {
    return (
      <div className="bg-gray-500/10 border border-gray-500/20 rounded-lg p-4">
        <div className="flex items-center gap-2 text-gray-400">
          <Settings className="h-4 w-4" />
          <span className="text-sm">Risk profile sync monitoring unavailable - wallet not connected</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-red-400" />
            <span className="text-red-400 text-sm font-medium">Sync Status Check Failed</span>
          </div>
          <button
            onClick={fetchSyncStatus}
            disabled={loading}
            className="px-3 py-1 bg-red-600 hover:bg-red-700 disabled:bg-red-800 text-white text-sm rounded transition-colors"
          >
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Retry'}
          </button>
        </div>
        <p className="text-red-300 text-xs mt-1">{error}</p>
      </div>
    );
  }

  if (loading && !syncStatus) {
    return (
      <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
        <div className="flex items-center gap-2 text-blue-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Checking risk profile synchronization status...</span>
        </div>
      </div>
    );
  }

  if (!syncStatus) {
    return null;
  }

  return (
    <div className="space-y-4">
      {/* Main Status Card */}
      <div className={`${
        syncStatus.isInSync 
          ? 'bg-green-500/10 border border-green-500/20' 
          : 'bg-red-500/10 border border-red-500/20'
      } rounded-lg p-4`}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            {getSyncStatusIcon(syncStatus.isInSync)}
            <div>
              <h3 className={`font-medium ${getSyncStatusColor(syncStatus.isInSync)}`}>
                Risk Profile Synchronization {syncStatus.isInSync ? 'Healthy' : 'Issues Detected'}
              </h3>
              <p className="text-xs text-gray-400 mt-1">
                Last checked: {formatTimestamp(syncStatus.timestamp)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchSyncStatus}
              disabled={loading}
              className="p-1.5 hover:bg-white/10 rounded transition-colors"
              title="Refresh sync status"
            >
              <RefreshCw className={`h-4 w-4 text-gray-400 ${loading ? 'animate-spin' : ''}`} />
            </button>
            
            {!syncStatus.isInSync && (
              <button
                onClick={performReconciliation}
                disabled={reconciling}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white text-sm rounded font-medium transition-colors"
              >
                {reconciling ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
                    Fixing...
                  </>
                ) : (
                  'Fix Sync Issues'
                )}
              </button>
            )}
          </div>
        </div>

        {/* Conflicts */}
        {syncStatus.conflicts.length > 0 && (
          <div className="mb-3">
            <h4 className="text-red-400 text-sm font-medium mb-1">Detected Issues:</h4>
            <ul className="space-y-1">
              {syncStatus.conflicts.map((conflict, index) => (
                <li key={index} className="text-red-300 text-xs flex items-start gap-2">
                  <span className="text-red-500 mt-0.5">•</span>
                  <span>{conflict}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Recommendations */}
        {syncStatus.recommendations.length > 0 && (
          <div>
            <h4 className="text-blue-400 text-sm font-medium mb-1">Recommendations:</h4>
            <ul className="space-y-1">
              {syncStatus.recommendations.map((recommendation, index) => (
                <li key={index} className="text-blue-300 text-xs flex items-start gap-2">
                  <span className="text-blue-500 mt-0.5">•</span>
                  <span>{recommendation}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Detailed Status */}
      {showDetailedStatus && (
        <div className="bg-gray-500/10 border border-gray-500/20 rounded-lg p-4">
          <h4 className="text-gray-300 text-sm font-medium mb-3 flex items-center gap-2">
            <Activity className="h-4 w-4" />
            System Status Details
          </h4>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {Object.entries(syncStatus.sources).map(([sourceName, source]) => (
              <div key={sourceName} className="bg-black/20 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <h5 className="text-white text-sm font-medium capitalize">
                    {sourceName === 'botService' ? 'Bot Service' : sourceName}
                  </h5>
                  <div className={`w-2 h-2 rounded-full ${
                    source.available ? 'bg-green-400' : 'bg-red-400'
                  }`} />
                </div>
                
                {source.available ? (
                  <div className="space-y-1 text-xs">
                    <div className="text-gray-300">
                      Risk: <span className="text-white">{source.riskProfile || 'N/A'}</span>
                    </div>
                    <div className="text-gray-300">
                      Amount: <span className="text-white">
                        {source.investmentAmount !== null ? `$${source.investmentAmount}` : 'N/A'}
                      </span>
                    </div>
                    <div className="text-gray-400">
                      Updated: {source.lastUpdated ? formatTimestamp(source.lastUpdated) : 'Unknown'}
                    </div>
                  </div>
                ) : (
                  <div className="text-red-400 text-xs">Service unavailable</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Last Reconciliation Result */}
      {lastReconciliation && (
        <div className={`${
          lastReconciliation.success 
            ? 'bg-green-500/10 border border-green-500/20' 
            : 'bg-red-500/10 border border-red-500/20'
        } rounded-lg p-4`}>
          <h4 className="text-gray-300 text-sm font-medium mb-2">Last Reconciliation</h4>
          <div className="text-xs space-y-1">
            <div className={`${lastReconciliation.success ? 'text-green-400' : 'text-red-400'}`}>
              Status: {lastReconciliation.success ? 'Successful' : 'Failed'}
            </div>
            <div className="text-gray-400">
              Time: {formatTimestamp(lastReconciliation.timestamp)}
            </div>
            {lastReconciliation.actions.length > 0 && (
              <div className="text-gray-300">
                Actions: {lastReconciliation.actions.join(', ')}
              </div>
            )}
            {lastReconciliation.errors.length > 0 && (
              <div className="text-red-400">
                Errors: {lastReconciliation.errors.join(', ')}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}