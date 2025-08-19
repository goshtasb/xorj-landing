/**
 * BotControlsCard Component
 * Provides bot controls and live status integration for the profile dashboard
 */

'use client';

import React, { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { Activity, Power, AlertTriangle, Settings, RefreshCw, Play, Pause } from 'lucide-react';

interface BotStatus {
  status: 'active' | 'paused' | 'stopped' | 'error';
  uptime?: number;
  lastTradeTime?: number;
  last_execution?: string;
  configuration?: {
    risk_profile?: 'low' | 'medium' | 'high' | 'balanced' | 'conservative' | 'aggressive';
    riskTolerance?: 'low' | 'medium' | 'high';
    maxPositionSize?: number;
    max_trade_amount?: number;
    autoRebalance?: boolean;
    enabled?: boolean;
  };
  performance?: {
    total_trades?: number;
    successful_trades?: number;
    success_rate?: number;
  };
}

export function BotControlsCard() {
  const { publicKey } = useWallet();
  const [botStatus, setBotStatus] = useState<BotStatus | null>(null);
  const [userSettings, setUserSettings] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  // Ensure component is mounted before accessing wallet
  useEffect(() => {
    setMounted(true);
  }, []);

  const effectivePublicKey = mounted ? publicKey?.toString() : undefined;

  // Fetch bot status from our bot service
  const fetchBotStatus = async () => {
    // Only fetch if component is mounted, wallet connected, and we're on the client side
    if (!mounted || !effectivePublicKey || typeof window === 'undefined') {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      console.log(`🔄 Fetching bot status for: ${effectivePublicKey}`);
      
      const response = await fetch(`/api/bot/status?user_id=${effectivePublicKey}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        cache: 'no-store' // Prevent caching for real-time data
      });
      
      if (!response.ok) {
        throw new Error(`Bot status API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      // Validate the response structure
      if (!data || typeof data !== 'object') {
        throw new Error('Invalid bot status response format');
      }
      
      console.log(`✅ Bot status fetched successfully: ${data.status}`);
      setBotStatus(data);
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred while fetching bot status';
      console.error('❌ Bot status fetch error:', errorMessage);
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Toggle bot function (activate/deactivate)
  const toggleBot = async () => {
    if (!effectivePublicKey || !botStatus) return;

    const action = botStatus.status === 'active' ? 'pause' : 'resume';
    
    try {
      console.log(`🤖 ${action === 'pause' ? 'Deactivating' : 'Activating'} bot...`);
      
      const response = await fetch(`http://localhost:8000/api/v1/bot/emergency`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: effectivePublicKey,
          action: action
        }),
      });

      if (response.ok) {
        const result = await response.json();
        console.log(`✅ Bot ${action} successful: ${result.message}`);
        fetchBotStatus(); // Refresh status
      } else {
        console.error(`❌ Bot ${action} failed: ${response.status} ${response.statusText}`);
      }
    } catch (err) {
      console.error(`❌ Bot ${action} error:`, err);
    }
  };

  // Emergency stop function
  const emergencyStop = async () => {
    if (!effectivePublicKey) return;

    try {
      const response = await fetch(`http://localhost:8000/api/v1/bot/emergency`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: effectivePublicKey,
          action: 'kill_switch',
          authorization_key: 'emergency-override'
        }),
      });

      if (response.ok) {
        fetchBotStatus(); // Refresh status
      }
    } catch (err) {
      console.error('Emergency stop failed:', err);
    }
  };

  // Fetch user settings to get current risk profile
  const fetchUserSettings = async () => {
    // Only fetch if component is mounted, wallet connected, and we're on the client side
    if (!mounted || !effectivePublicKey || typeof window === 'undefined') {
      return;
    }

    try {
      const response = await fetch(`/api/user/settings?walletAddress=${effectivePublicKey}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        cache: 'no-store'
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data) {
          setUserSettings(data.data);
        }
      } else {
        console.warn(`⚠️ User settings fetch failed: ${response.status} ${response.statusText}`);
      }
    } catch (err) {
      console.error('❌ Error fetching user settings:', err);
    }
  };

  // Auto-refresh bot status and settings every 5 seconds when wallet connected
  useEffect(() => {
    if (!mounted || !effectivePublicKey) return;

    fetchBotStatus();
    fetchUserSettings();
    const interval = setInterval(() => {
      fetchBotStatus();
      fetchUserSettings();
    }, 5000); // Refresh every 5 seconds for better sync
    return () => clearInterval(interval);
  }, [mounted, effectivePublicKey]);

  // Listen for settings updates (when risk profile is saved)
  useEffect(() => {
    if (!mounted) return;

    const handleStorageChange = () => {
      if (effectivePublicKey) {
        fetchUserSettings();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [mounted, effectivePublicKey]);

  if (!mounted || !effectivePublicKey) {
    return (
      <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-white">Bot Controls</h2>
          <Activity className="h-5 w-5 text-gray-400" />
        </div>
        <div className="text-center py-8">
          <Power className="w-12 h-12 text-gray-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">Bot Unavailable</h3>
          <p className="text-gray-300">Connect your Solana wallet to access bot controls and live trading data.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-white">XORJ Trading Bot</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchBotStatus}
            disabled={loading}
            className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50"
            title="Refresh Status"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          {botStatus && (
            <div className={`w-3 h-3 rounded-full ${
              botStatus.status === 'active' ? 'bg-green-400' :
              botStatus.status === 'error' ? 'bg-red-400' : 'bg-gray-400'
            }`} />
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-red-400 flex-shrink-0" />
            <div>
              <h3 className="text-red-400 font-medium">Connection Error</h3>
              <p className="text-red-300 text-sm mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}

      {botStatus ? (
        <div className="space-y-6">
          {/* Status Overview */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-black/20 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Activity className="h-4 w-4 text-blue-400" />
                <span className="text-sm text-gray-300">Status</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="text-lg font-semibold text-white">
                  {botStatus.status === 'active' ? 'Active' : 
                   botStatus.status === 'paused' ? 'Paused' :
                   botStatus.status === 'stopped' ? 'Stopped' : 
                   botStatus.status === 'error' ? 'Error' : 'Unknown'}
                </div>
                <button
                  onClick={toggleBot}
                  disabled={loading || botStatus.status === 'error' || botStatus.status === 'stopped'}
                  className={`
                    inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md
                    transition-colors disabled:opacity-50 disabled:cursor-not-allowed
                    ${botStatus.status === 'active' 
                      ? 'bg-red-600 hover:bg-red-700 text-white' 
                      : 'bg-green-600 hover:bg-green-700 text-white'
                    }
                  `}
                  title={
                    botStatus.status === 'active' ? 'Pause trading bot' : 
                    botStatus.status === 'stopped' ? 'Bot is stopped (use emergency controls to restart)' :
                    'Resume trading bot'
                  }
                >
                  {botStatus.status === 'active' ? (
                    <>
                      <Pause className="h-3 w-3" />
                      Deactivate
                    </>
                  ) : (
                    <>
                      <Play className="h-3 w-3" />
                      Activate
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="bg-black/20 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Settings className="h-4 w-4 text-purple-400" />
                <span className="text-sm text-gray-300">Risk Level</span>
              </div>
              <div className="text-lg font-semibold text-white capitalize">
                {userSettings?.riskProfile || botStatus.configuration?.risk_profile || botStatus.configuration?.riskTolerance || 'Medium'}
              </div>
            </div>

            <div className="bg-black/20 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <RefreshCw className="h-4 w-4 text-green-400" />
                <span className="text-sm text-gray-300">Bot Enabled</span>
              </div>
              <div className="text-lg font-semibold text-white">
                {botStatus.configuration?.enabled !== false ? 'Yes' : 'No'}
              </div>
            </div>
          </div>

          {/* Emergency Controls */}
          {botStatus.status === 'active' && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-red-400 font-medium mb-1">Emergency Controls</h3>
                  <p className="text-red-300 text-sm">
                    Immediately stop all trading activity and secure positions
                  </p>
                </div>
                <button
                  onClick={emergencyStop}
                  className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                >
                  Emergency Stop
                </button>
              </div>
            </div>
          )}
        </div>
      ) : loading ? (
        <div className="text-center py-8">
          <RefreshCw className="w-8 h-8 text-gray-400 mx-auto mb-4 animate-spin" />
          <p className="text-gray-300">Connecting to bot service...</p>
        </div>
      ) : (
        <div className="text-center py-8">
          <Power className="w-12 h-12 text-gray-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">Bot Service Unavailable</h3>
          <p className="text-gray-300">Unable to connect to the trading bot service.</p>
        </div>
      )}
    </div>
  );
}