/**
 * BotActivityIndicator Component
 * Shows real-time bot activity and health indicators
 */

'use client';

import React, { useState, useEffect } from 'react';
import { Activity, Wifi, WifiOff, Clock, TrendingUp, AlertCircle, CheckCircle, Zap, RefreshCw, Eye, Users, BarChart3, Shield } from 'lucide-react';

interface BotActivity {
  isActive: boolean;
  lastHeartbeat: string | null;
  lastTradeAttempt: string | null;
  lastSuccessfulTrade: string | null;
  tradesLast24h: number;
  lastMarketAnalysis: string | null;
  analysisFrequency: string;
  nextAnalysisIn: string | null;
  quantitativeEngineStatus: 'connected' | 'disconnected' | 'unknown';
  solanaRpcStatus: 'connected' | 'disconnected' | 'unknown';
  jupiterApiStatus: 'connected' | 'disconnected' | 'unknown';
  processingLatency: number | null;
  memoryUsage: number | null;
  recentActivity: Array<{
    timestamp: string;
    type: 'trade' | 'analysis' | 'error' | 'system';
    description: string;
    success: boolean;
  }>;
}

interface BotActivityResponse {
  success: boolean;
  activity: BotActivity;
  timestamp: string;
}

interface LiveActivityEntry {
  id: string;
  timestamp: string;
  category: 'system' | 'analysis' | 'trading' | 'monitoring' | 'execution';
  activity: string;
  detail: string;
  status: 'success' | 'info' | 'warning' | 'error';
  duration?: string;
  data?: Record<string, unknown>;
}

interface LiveActivity {
  isActive: boolean;
  executionCycle: 'standby' | 'analyzing' | 'executing' | 'monitoring';
  lastCycleTime: string | null;
  nextCycleIn: string;
  activityStream: LiveActivityEntry[];
  currentOperations: {
    traderAnalysis: {
      active: boolean;
      tradersAnalyzed: number;
      lastAnalysis: string | null;
      nextAnalysis: string | null;
    };
    marketMonitoring: {
      active: boolean;
      marketsWatched: number;
      lastUpdate: string | null;
      dataPoints: number;
    };
    riskAssessment: {
      active: boolean;
      lastRiskCheck: string | null;
      riskLevel: 'conservative' | 'moderate' | 'aggressive';
    };
    signalProcessing: {
      active: boolean;
      signalsProcessed: number;
      lastSignal: string | null;
      signalStrength: number | null;
    };
  };
  performance: {
    cyclesCompleted: number;
    avgCycleTime: string;
    successRate: string;
    lastErrorTime: string | null;
    systemHealth: 'excellent' | 'good' | 'fair' | 'poor';
  };
}

interface LiveActivityResponse {
  success: boolean;
  liveActivity: LiveActivity;
  timestamp: string;
}

interface BotActivityIndicatorProps {
  walletAddress?: string;
  refreshInterval?: number; // in seconds, default 30
  showDetailed?: boolean;
  showLiveActivity?: boolean; // Show comprehensive live activity stream
}

export function BotActivityIndicator({ 
  walletAddress, 
  refreshInterval = 30,
  showDetailed = true,
  showLiveActivity = false
}: BotActivityIndicatorProps) {
  const [activity, setActivity] = useState<BotActivity | null>(null);
  const [liveActivity, setLiveActivity] = useState<LiveActivity | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [showLiveView, setShowLiveView] = useState(showLiveActivity);

  const fetchActivity = async () => {
    if (!walletAddress) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/bot/activity', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include' // Include httpOnly cookies for authentication
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch bot activity: ${response.status}`);
      }

      const data: BotActivityResponse = await response.json();
      setActivity(data.activity);
      setLastUpdate(new Date());
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch bot activity';
      setError(errorMessage);
      console.error('❌ Bot activity fetch failed:', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const fetchLiveActivity = async () => {
    if (!walletAddress) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/bot/live-activity', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch live activity: ${response.status}`);
      }

      const data: LiveActivityResponse = await response.json();
      setLiveActivity(data.liveActivity);
      setLastUpdate(new Date());
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch live activity';
      setError(errorMessage);
      console.error('❌ Live activity fetch failed:', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Initial fetch and setup refresh interval
  useEffect(() => {
    if (walletAddress) {
      if (showLiveView) {
        fetchLiveActivity();
        const interval = setInterval(fetchLiveActivity, Math.min(refreshInterval, 15) * 1000); // More frequent for live activity
        return () => clearInterval(interval);
      } else {
        fetchActivity();
        const interval = setInterval(fetchActivity, refreshInterval * 1000);
        return () => clearInterval(interval);
      }
    }
  }, [walletAddress, refreshInterval, showLiveView]);

  const formatTimeAgo = (timestamp: string | null) => {
    if (!timestamp) return 'Never';
    
    const diff = Date.now() - new Date(timestamp).getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (seconds < 10) return 'Just now';
    if (seconds < 60) return `${seconds}s ago`;
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  const getServiceStatusIcon = (status: 'connected' | 'disconnected' | 'unknown') => {
    switch (status) {
      case 'connected':
        return <CheckCircle className="h-4 w-4 text-green-400" />;
      case 'disconnected':
        return <AlertCircle className="h-4 w-4 text-red-400" />;
      default:
        return <Clock className="h-4 w-4 text-gray-400" />;
    }
  };

  const getActivityTypeIcon = (type: string) => {
    switch (type) {
      case 'trade':
      case 'trading':
        return <TrendingUp className="h-3 w-3" />;
      case 'analysis':
        return <BarChart3 className="h-3 w-3" />;
      case 'system':
        return <Zap className="h-3 w-3" />;
      case 'monitoring':
        return <Eye className="h-3 w-3" />;
      case 'execution':
        return <Activity className="h-3 w-3" />;
      case 'error':
        return <AlertCircle className="h-3 w-3" />;
      default:
        return <Clock className="h-3 w-3" />;
    }
  };

  const getLiveActivityStatusColor = (status: 'success' | 'info' | 'warning' | 'error') => {
    switch (status) {
      case 'success':
        return 'text-green-400';
      case 'warning':
        return 'text-yellow-400';
      case 'error':
        return 'text-red-400';
      default:
        return 'text-blue-400';
    }
  };

  const getExecutionCycleColor = (cycle: string) => {
    switch (cycle) {
      case 'analyzing':
        return 'text-blue-400 bg-blue-500/20';
      case 'executing':
        return 'text-green-400 bg-green-500/20';
      case 'monitoring':
        return 'text-yellow-400 bg-yellow-500/20';
      default:
        return 'text-gray-400 bg-gray-500/20';
    }
  };

  if (!walletAddress) {
    return (
      <div className="text-center text-gray-400 text-sm py-4">
        Connect wallet to view bot activity
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
        <div className="flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-red-400" />
          <span className="text-red-400 text-sm">Activity fetch failed: {error}</span>
        </div>
        <button
          onClick={showLiveView ? fetchLiveActivity : fetchActivity}
          className="text-red-300 hover:text-red-200 text-xs mt-1 underline"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!activity && !liveActivity) {
    return (
      <div className="text-center py-4">
        <div className="animate-pulse">
          <div className="w-6 h-6 bg-gray-600 rounded-full mx-auto mb-2"></div>
          <div className="text-gray-400 text-sm">Loading activity...</div>
        </div>
      </div>
    );
  }

  // Show live activity view if enabled and data is available
  if (showLiveView && liveActivity) {
    return (
      <div className="space-y-4">
        {/* Live Activity Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`relative ${liveActivity.isActive ? 'text-green-400' : 'text-gray-400'}`}>
              <Eye className="h-5 w-5" />
              {liveActivity.isActive && (
                <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
              )}
            </div>
            <div>
              <div className="font-medium text-white">Live Bot Activity</div>
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getExecutionCycleColor(liveActivity.executionCycle)}`}>
                  {liveActivity.executionCycle}
                </span>
                <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin text-blue-400' : ''}`} />
                Last update: {lastUpdate ? formatTimeAgo(lastUpdate.toISOString()) : 'Never'}
              </div>
            </div>
          </div>
          
          <button
            onClick={() => {
              setShowLiveView(false);
              fetchActivity(); // Immediately fetch regular activity data
            }}
            className="text-gray-400 hover:text-white text-xs px-2 py-1 rounded border border-gray-600 hover:border-gray-500"
          >
            Normal View
          </button>
        </div>

        {/* Current Operations Status */}
        {liveActivity.isActive && (
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="flex items-center gap-2">
              <Users className="h-3 w-3 text-blue-400" />
              <span className="text-gray-300">Traders:</span>
              <span className={liveActivity.currentOperations.traderAnalysis.active ? 'text-green-400' : 'text-gray-400'}>
                {liveActivity.currentOperations.traderAnalysis.tradersAnalyzed}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Eye className="h-3 w-3 text-yellow-400" />
              <span className="text-gray-300">Markets:</span>
              <span className={liveActivity.currentOperations.marketMonitoring.active ? 'text-green-400' : 'text-gray-400'}>
                {liveActivity.currentOperations.marketMonitoring.marketsWatched}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Shield className="h-3 w-3 text-purple-400" />
              <span className="text-gray-300">Risk:</span>
              <span className="text-purple-400 capitalize">
                {liveActivity.currentOperations.riskAssessment.riskLevel}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-3 w-3 text-green-400" />
              <span className="text-gray-300">Signals:</span>
              <span className={liveActivity.currentOperations.signalProcessing.signalsProcessed > 0 ? 'text-green-400' : 'text-gray-400'}>
                {liveActivity.currentOperations.signalProcessing.signalsProcessed}
              </span>
            </div>
          </div>
        )}

        {/* Performance Summary */}
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-4">
            <span className="text-gray-400">
              Cycles: <span className="text-white">{liveActivity.performance.cyclesCompleted}</span>
            </span>
            <span className="text-gray-400">
              Avg: <span className="text-white">{liveActivity.performance.avgCycleTime}</span>
            </span>
            <span className="text-gray-400">
              Success: <span className="text-green-400">{liveActivity.performance.successRate}</span>
            </span>
          </div>
          <span className={`px-2 py-1 rounded text-xs font-medium ${
            liveActivity.performance.systemHealth === 'excellent' ? 'text-green-400 bg-green-500/20' :
            liveActivity.performance.systemHealth === 'good' ? 'text-blue-400 bg-blue-500/20' :
            liveActivity.performance.systemHealth === 'fair' ? 'text-yellow-400 bg-yellow-500/20' :
            'text-red-400 bg-red-500/20'
          }`}>
            {liveActivity.performance.systemHealth}
          </span>
        </div>

        {/* Live Activity Stream */}
        <div>
          <div className="text-sm font-medium text-gray-300 mb-2">Live Activity Stream</div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {liveActivity.activityStream.slice(0, 15).map((item, index) => {
              const isVeryRecent = Date.now() - new Date(item.timestamp).getTime() < 30000; // Less than 30 seconds
              return (
                <div key={item.id} className="flex items-start gap-2 text-xs">
                  <div className={`mt-0.5 ${getLiveActivityStatusColor(item.status)}`}>
                    {getActivityTypeIcon(item.category)}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-300 font-medium">{item.activity}</span>
                      {item.duration && (
                        <span className="text-gray-500 text-[10px]">({item.duration})</span>
                      )}
                      {isVeryRecent && (
                        <span className="bg-green-500/20 text-green-400 px-1 py-0.5 rounded text-[10px] font-medium">
                          LIVE
                        </span>
                      )}
                    </div>
                    <div className="text-gray-400 text-[11px] mt-0.5">{item.detail}</div>
                    <div className="text-gray-500 text-[10px]">{formatTimeAgo(item.timestamp)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Status Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`relative ${activity.isActive ? 'text-green-400' : 'text-gray-400'}`}>
            <Activity className="h-5 w-5" />
            {activity.isActive && activity.lastHeartbeat && (
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
            )}
          </div>
          <div>
            <div className="font-medium text-white">
              Bot is {activity.isActive ? 'Active' : 'Inactive'}
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin text-blue-400' : ''}`} />
              Last update: {lastUpdate ? formatTimeAgo(lastUpdate.toISOString()) : 'Never'}
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {activity.isActive && (
            <div className="text-right">
              <div className="text-sm font-medium text-green-400">
                {activity.tradesLast24h} trades (24h)
              </div>
              <div className="text-xs text-gray-400">
                Last: {formatTimeAgo(activity.lastTradeAttempt)}
              </div>
            </div>
          )}
          
          <button
            onClick={() => {
              setShowLiveView(true);
              fetchLiveActivity(); // Immediately fetch live activity data
            }}
            className="text-gray-400 hover:text-white text-xs px-2 py-1 rounded border border-gray-600 hover:border-gray-500 flex items-center gap-1"
          >
            <Eye className="h-3 w-3" />
            Live View
          </button>
        </div>
      </div>

      {/* Service Status */}
      {showDetailed && (
        <div className="grid grid-cols-3 gap-3 text-xs">
          <div className="flex items-center gap-2">
            {getServiceStatusIcon(activity.quantitativeEngineStatus)}
            <span className="text-gray-300">Quant Engine</span>
          </div>
          <div className="flex items-center gap-2">
            {getServiceStatusIcon(activity.solanaRpcStatus)}
            <span className="text-gray-300">Solana RPC</span>
          </div>
          <div className="flex items-center gap-2">
            {getServiceStatusIcon(activity.jupiterApiStatus)}
            <span className="text-gray-300">Jupiter API</span>
          </div>
        </div>
      )}

      {/* Market Analysis Status */}
      {activity.isActive && activity.lastMarketAnalysis && (
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="h-4 w-4 text-blue-400" />
            <span className="text-blue-400 font-medium text-sm">Market Analysis</span>
          </div>
          <div className="text-xs text-gray-300">
            Last: {formatTimeAgo(activity.lastMarketAnalysis)} • 
            Frequency: {activity.analysisFrequency}
          </div>
        </div>
      )}

      {/* Recent Activity */}
      {showDetailed && activity.recentActivity.length > 0 && (
        <div>
          <div className="text-sm font-medium text-gray-300 mb-2">Recent Activity</div>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {activity.recentActivity.slice(0, 5).map((item, index) => {
              const isVeryRecent = Date.now() - new Date(item.timestamp).getTime() < 60000; // Less than 1 minute
              return (
                <div key={index} className="flex items-start gap-2 text-xs">
                  <div className={`mt-0.5 ${item.success ? 'text-green-400' : 'text-red-400'}`}>
                    {getActivityTypeIcon(item.type)}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-300">{item.description}</span>
                      {isVeryRecent && (
                        <span className="bg-green-500/20 text-green-400 px-1 py-0.5 rounded text-[10px] font-medium">
                          NEW
                        </span>
                      )}
                    </div>
                    <div className="text-gray-500">{formatTimeAgo(item.timestamp)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Performance Indicators */}
      {activity.processingLatency && activity.memoryUsage && (
        <div className="flex justify-between text-xs text-gray-400">
          <span>Latency: {activity.processingLatency}ms</span>
          <span>Memory: {activity.memoryUsage.toFixed(1)}%</span>
        </div>
      )}
    </div>
  );
}