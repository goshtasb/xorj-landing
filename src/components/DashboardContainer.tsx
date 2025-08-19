/**
 * DashboardContainer Component
 * Main stateful container for the performance dashboard
 * Handles data fetching, state management, and orchestrates child components
 */

'use client';

import React, { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { MetricCard } from './MetricCard';
import { PerformanceChart } from './PerformanceChart';
import { RefreshCw, AlertCircle, Clock } from 'lucide-react';

interface PerformanceData {
  currentVaultValueUSD: number;
  netROI: number;
  maxDrawdownPercent: number;
  chartData: ChartDataPoint[];
  benchmarkData: ChartDataPoint[];
  totalTrades: number;
  winRate: number;
  sharpeRatio: number;
  timeRange: '30D' | '90D' | 'ALL';
  lastUpdated: number;
}

interface ChartDataPoint {
  date: string;
  timestamp: number;
  value: number;
  cumulative_pnl?: number;
}

type TimeRange = '30D' | '90D' | 'ALL';

interface DashboardContainerProps {
  className?: string;
}

export function DashboardContainer({ className = '' }: DashboardContainerProps) {
  const { publicKey } = useWallet();
  
  // State management
  const [activeTimeRange, setActiveTimeRange] = useState<TimeRange>('30D');
  const [performanceData, setPerformanceData] = useState<PerformanceData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<number>(0);
  const [mounted, setMounted] = useState(false);

  // Ensure component is mounted before accessing wallet
  useEffect(() => {
    setMounted(true);
    setLastRefresh(Date.now());
  }, []);

  // Only use real wallet address when connected
  const effectivePublicKey = mounted ? publicKey?.toString() : undefined;

  // Fetch performance data
  const fetchPerformanceData = async (timeRange: TimeRange, forceRefresh = false) => {
    // Only fetch if wallet is actually connected and component is mounted
    if (!mounted || !effectivePublicKey) {
      setPerformanceData(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      console.log(`📊 Fetching performance data for ${timeRange}`);
      
      const response = await fetch(
        `/api/user/performance?walletAddress=${effectivePublicKey}&timeRange=${timeRange}`,
        {
          cache: forceRefresh ? 'no-cache' : 'default'
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch performance data: ${response.statusText}`);
      }

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch performance data');
      }

      setPerformanceData(result.data);
      setLastRefresh(Date.now());
      console.log('✅ Performance data loaded successfully');

    } catch (err) {
      console.error('❌ Performance data fetch failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to load performance data');
    } finally {
      setLoading(false);
    }
  };

  // Initial data fetch and when time range changes
  useEffect(() => {
    if (mounted) {
      fetchPerformanceData(activeTimeRange);
    }
  }, [activeTimeRange, mounted, effectivePublicKey]);

  // Handle time range change
  const handleTimeRangeChange = (newTimeRange: TimeRange) => {
    if (newTimeRange !== activeTimeRange) {
      setActiveTimeRange(newTimeRange);
    }
  };

  // Handle manual refresh
  const handleRefresh = () => {
    fetchPerformanceData(activeTimeRange, true);
  };

  // Format last updated time
  const formatLastUpdated = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    
    if (minutes < 1) return 'Just now';
    if (minutes === 1) return '1 minute ago';
    if (minutes < 60) return `${minutes} minutes ago`;
    
    const hours = Math.floor(minutes / 60);
    if (hours === 1) return '1 hour ago';
    if (hours < 24) return `${hours} hours ago`;
    
    return new Date(timestamp).toLocaleDateString();
  };

  // Time range button component
  const TimeRangeButton = ({ range, active, onClick }: { 
    range: TimeRange; 
    active: boolean; 
    onClick: () => void;
  }) => (
    <button
      onClick={onClick}
      disabled={loading}
      className={`
        px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200
        ${active 
          ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/25' 
          : 'text-gray-300 hover:text-white hover:bg-white/10'
        }
        disabled:opacity-50 disabled:cursor-not-allowed
      `}
    >
      {range}
    </button>
  );

  // Don't show dashboard if not mounted or no wallet connected
  if (!mounted || !effectivePublicKey) {
    return (
      <div className={`space-y-6 ${className}`}>
        <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl p-6">
          <div className="text-center py-8">
            <AlertCircle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-white mb-2">Wallet Required</h3>
            <p className="text-gray-300">Connect your Solana wallet to view performance data and trading metrics.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header with time range controls */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Performance Dashboard</h2>
          {performanceData && (
            <div className="flex items-center gap-2 mt-1 text-sm text-gray-400">
              <Clock className="h-3 w-3" />
              <span>Updated {formatLastUpdated(lastRefresh)}</span>
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-3">
          {/* Time Range Selector */}
          <div className="flex items-center bg-white/10 rounded-lg p-1">
            <TimeRangeButton
              range="30D"
              active={activeTimeRange === '30D'}
              onClick={() => handleTimeRangeChange('30D')}
            />
            <TimeRangeButton
              range="90D"
              active={activeTimeRange === '90D'}
              onClick={() => handleTimeRangeChange('90D')}
            />
            <TimeRangeButton
              range="ALL"
              active={activeTimeRange === 'ALL'}
              onClick={() => handleTimeRangeChange('ALL')}
            />
          </div>
          
          {/* Refresh Button */}
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg 
                     transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Refresh Data"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0" />
            <div>
              <h3 className="text-red-400 font-medium">Error Loading Performance Data</h3>
              <p className="text-red-300 text-sm mt-1">{error}</p>
              <button
                onClick={handleRefresh}
                className="text-red-400 hover:text-red-300 text-sm underline mt-2"
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Metrics Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Current Value"
          value={performanceData ? performanceData.currentVaultValueUSD : 0}
          icon="dollar"
          loading={loading}
          subtitle="Total vault value"
        />
        
        <MetricCard
          label="Net ROI"
          value={performanceData ? `${performanceData.netROI}%` : '0%'}
          icon="auto"
          loading={loading}
          subtitle={`Over ${activeTimeRange.toLowerCase()}`}
        />
        
        <MetricCard
          label="Max Drawdown"
          value={performanceData ? `${performanceData.maxDrawdownPercent}%` : '0%'}
          icon="trending-down"
          trend="negative"
          loading={loading}
          subtitle="Worst decline"
        />
        
        <MetricCard
          label="Sharpe Ratio"
          value={performanceData ? performanceData.sharpeRatio : 0}
          icon="chart"
          loading={loading}
          subtitle="Risk-adjusted return"
        />
      </div>

      {/* Secondary Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <MetricCard
          label="Total Trades"
          value={performanceData ? performanceData.totalTrades : 0}
          icon="chart"
          loading={loading}
          subtitle="Completed transactions"
        />
        
        <MetricCard
          label="Win Rate"
          value={performanceData ? `${performanceData.winRate}%` : '0%'}
          icon="auto"
          loading={loading}
          subtitle="Successful trades"
        />
      </div>

      {/* Performance Chart */}
      <PerformanceChart
        userDataSeries={performanceData?.chartData || []}
        benchmarkDataSeries={performanceData?.benchmarkData || []}
        loading={loading}
        timeRange={activeTimeRange}
        className="col-span-full"
      />
    </div>
  );
}