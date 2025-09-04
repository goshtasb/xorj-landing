/**
 * BotControlsCard Component
 * Provides bot controls and live status integration for the profile dashboard
 */

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useSimpleWallet } from '@/contexts/SimpleWalletContext';
import { useBotStatus } from '@/contexts/BotStatusContext';
import { Activity, Power, AlertTriangle, Settings, RefreshCw, Play, Pause, DollarSign } from 'lucide-react';
import { BotActivityIndicator } from './BotActivityIndicator';
import { updateInvestmentAmount } from '@/lib/botService';
import { TokenManager } from '@/lib/tokenManager';
import { useRiskProfileSync } from '@/hooks/useRiskProfileSync';

interface UserSettings {
  walletAddress: string;
  riskProfile: 'Conservative' | 'Balanced' | 'Aggressive';
  maxDrawdownLimit: number;
  positionSizePercent: number;
  stopLossEnabled: boolean;
  takeProfitEnabled: boolean;
  investmentAmount?: number;
  lastUpdated: number;
  createdAt: number;
}

// Bot status interface is provided by BotStatusContext

export function BotControlsCard() {
  const { publicKey } = useWallet();
  const { connected, authenticated } = useSimpleWallet();
  const { botStatus, isLoading: botStatusLoading, error: botStatusError, fetchBotStatus, setBotEnabled } = useBotStatus();
  const [userSettings, setUserSettings] = useState<UserSettings | null>(null);
  const [toggleLoading, setToggleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  // Note: authenticationLoading state removed as authentication is now handled by SimpleWalletContext
  const [investmentAmount, setInvestmentAmount] = useState<string>('0');
  const [savingInvestmentAmount, setSavingInvestmentAmount] = useState(false);
  const [isEditingInvestmentAmount, setIsEditingInvestmentAmount] = useState(false);
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [balanceError, setBalanceError] = useState<string | null>(null);

  // PERMANENT SOLUTION: Use synchronized risk profile hook
  const effectivePublicKey = mounted ? publicKey?.toString() : undefined;
  const { 
    riskProfileData, 
    isLoading: riskProfileLoading, 
    error: riskProfileError,
    syncRiskProfile,
    isInSync
  } = useRiskProfileSync(effectivePublicKey);

  // Ensure component is mounted before accessing wallet
  useEffect(() => {
    setMounted(true);
  }, []);

  // More flexible wallet detection - if we have a public key, consider it ready
  const isWalletReady = mounted && effectivePublicKey && (connected || !!publicKey);
  
  // Debug logging
  useEffect(() => {
    if (mounted) {
      console.log('BotControlsCard state:', {
        mounted,
        publicKey: effectivePublicKey,
        connected,
        authenticated,
        isWalletReady
      });
    }
  }, [mounted, effectivePublicKey, connected, authenticated, isWalletReady]);

  // Note: This function was previously used for authentication but is now deprecated
  // Authentication is handled by SimpleWalletContext automatically

  // Bot status is now managed by BotStatusContext, removed local fetch function

  // Toggle bot function using new specific endpoints
  const toggleBot = async () => {
    if (!isWalletReady || !botStatus || toggleLoading) return;

    const isCurrentlyActive = botStatus.status === 'active';
    const actionName = isCurrentlyActive ? 'disable' : 'enable';

    // Authentication is handled by httpOnly cookies - no need to check localStorage tokens
    
    // If enabling bot, validate wallet balance
    if (!isCurrentlyActive) {
      // Check if wallet has any funds at all
      if (walletBalance === 0) {
        setError('Cannot enable bot: Wallet has no funds. Please deposit SOL or USDC first.');
        return;
      }
      
      // Check minimum balance for trading
      if (walletBalance < 1) {
        setError(`Cannot enable bot: Insufficient funds ($${walletBalance.toFixed(2)}). Need at least $1.00 for trading.`);
        return;
      }
      
      // If user has set an investment amount, validate it against balance
      if (userSettings?.investmentAmount) {
        const maxInvestable = Math.max(0, walletBalance * 0.98 - 10);
        const isValid = userSettings.investmentAmount <= maxInvestable;
        
        if (!isValid) {
          const errorMsg = `Investment amount ($${userSettings.investmentAmount.toLocaleString()}) exceeds available balance of $${maxInvestable.toFixed(2)}`;
          setError(`Cannot enable bot: ${errorMsg}`);
          return;
        }
      }
    }
    
    setToggleLoading(true);
    setError(null);
    
    try {
      
      // Use direct API calls with httpOnly cookies
      const endpoint = isCurrentlyActive ? '/api/bot/disable' : '/api/bot/enable';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include' // Include httpOnly cookies for authentication
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Bot ${actionName} failed: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (result.success) {
        
        // Update bot status immediately via shared context
        setBotEnabled(!isCurrentlyActive);
        
        // Refresh bot status from server to ensure sync
        setTimeout(() => {
          fetchBotStatus();
        }, 1000);
        
      } else {
        const errorMsg = result.message || 'Failed to toggle bot';
        throw new Error(errorMsg);
      }
    } catch (err) {
      console.log('Bot toggle error occurred:', err);
      
      // Simplified error handling without string operations that might fail
      let errorMessage = 'Failed to toggle bot';
      
      try {
        if (err instanceof Error && err.message) {
          errorMessage = err.message;
        }
      } catch (nestedErr) {
        console.log('Error processing error message:', nestedErr);
      }
      
      // Simple authentication check without complex string operations
      const isAuthError = errorMessage === 'No session token available. Please authenticate first.' || 
                         errorMessage.indexOf('authentication') !== -1 ||
                         errorMessage.indexOf('session') !== -1;
      
      if (isAuthError) {
        console.log('Authentication issue detected, clearing tokens...');
        try {
          TokenManager.clearTokens();
        } catch (tokenErr) {
          console.log('Error clearing tokens:', tokenErr);
        }
        setError('Session expired. Please refresh the page to re-authenticate.');
        setTimeout(() => {
          window.location.reload();
        }, 3000);
      } else {
        setError(errorMessage);
      }
    } finally {
      setToggleLoading(false);
    }
  };

  // Fetch wallet balance function
  const fetchWalletBalance = useCallback(async () => {
    if (!isWalletReady) return;

    setLoadingBalance(true);
    setBalanceError(null);

    try {
      
      // Use server-side API endpoint instead of direct service call to avoid CORS issues
      const response = await fetch(`/api/wallet/balance?walletAddress=${effectivePublicKey}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Balance API error: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.success && data.data) {
        const balance = data.data.totalUsdValue || 0;
        setWalletBalance(balance);
        console.log('✅ Live wallet balance updated:', balance);
      } else {
        console.error('❌ Invalid balance API response structure:', data);
        setWalletBalance(0);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch wallet balance';
      console.error('❌ Wallet balance fetch error:', errorMessage);
      setBalanceError(errorMessage);
    } finally {
      setLoadingBalance(false);
    }
  }, [isWalletReady, effectivePublicKey]);

  // Save investment amount function with balance validation
  const saveInvestmentAmount = async () => {
    if (!isWalletReady || savingInvestmentAmount) return;
    
    const amount = parseFloat(investmentAmount);
    if (isNaN(amount) || amount <= 0) {
      setError('Please enter a valid investment amount (minimum $0.01)');
      return;
    }

    // Validate against wallet balance
    const maxInvestable = Math.max(0, walletBalance * 0.98 - 10);
    const isValid = amount <= maxInvestable && walletBalance > 0;
    if (!isValid) {
      const errorMsg = walletBalance === 0 
        ? 'Wallet has no funds. Please deposit SOL or USDC first.'
        : `Investment amount exceeds available balance of $${maxInvestable.toFixed(2)}`;
      setError(errorMsg);
      return;
    }

    setSavingInvestmentAmount(true);
    setError(null);

    try {
      
      const response = await fetch('/api/user/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // Include httpOnly cookies for authentication
        body: JSON.stringify({
          walletAddress: effectivePublicKey,
          investmentAmount: amount
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to save investment amount: ${response.statusText}`);
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || 'Failed to save investment amount');
      }

      
      // PERMANENT SOLUTION: Use comprehensive sync instead of just bot service
      try {
        if (riskProfileData?.riskProfile) {
          const syncSuccess = await syncRiskProfile(riskProfileData.riskProfile, amount);
          if (syncSuccess) {
            console.log('✅ Complete risk profile and investment amount sync successful');
          } else {
            console.warn('⚠️ Risk profile sync had issues, but user settings saved');
          }
        } else {
          // Fallback to old method if risk profile data not available
          const botSyncResult = await updateInvestmentAmount(amount);
          if (botSyncResult.success) {
            console.log('✅ Bot investment amount synced successfully (fallback method)');
          }
        }
      } catch (syncError) {
        // Sync failing shouldn't prevent saving user settings
        console.log('ℹ️ Comprehensive sync had issues, but user settings saved successfully');
      }
      
      // Update the userSettings state manually to reflect the saved value
      if (userSettings) {
        setUserSettings({
          ...userSettings,
          investmentAmount: amount,
          lastUpdated: Date.now()
        });
      }
      
      // Keep the input field as is since we just successfully saved it
      setIsEditingInvestmentAmount(false);
      // Don't call fetchUserSettings here - it will overwrite the input field we just saved
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to save investment amount';
      console.error('❌ Save investment amount error:', errorMessage);
      setError(errorMessage);
    } finally {
      setSavingInvestmentAmount(false);
    }
  };

  // Emergency stop function using new authenticated service
  const emergencyStop = async () => {
    if (!isWalletReady) return;

    try {
      
      const response = await fetch('/api/bot/emergency', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // Include httpOnly cookies for authentication
        body: JSON.stringify({
          action: 'kill_switch',
          reason: 'user_requested_emergency_stop'
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Emergency stop failed: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (result.success) {
        
        // Update bot status immediately via shared context
        setBotEnabled(false);
        
        // Refresh bot status from server to ensure sync
        setTimeout(() => {
          fetchBotStatus();
        }, 1000);
        
      } else {
        throw new Error('Emergency stop failed');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Emergency stop failed';
      console.error('❌ Emergency stop error:', errorMessage);
      setError(errorMessage);
    }
  };

  // Fetch user settings to get current risk profile
  const fetchUserSettings = useCallback(async () => {
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
        credentials: 'include', // Include httpOnly cookies for authentication
        cache: 'no-store'
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data) {
          setUserSettings(data.data);
          // Load investment amount from settings only if it's a valid positive number and user is not actively editing
          if (data.data.investmentAmount && data.data.investmentAmount > 0 && !isEditingInvestmentAmount) {
            setInvestmentAmount(data.data.investmentAmount.toString());
          } else if (!data.data.investmentAmount && !isEditingInvestmentAmount) {
            // If no saved amount, ensure we show 0 as default
            setInvestmentAmount('0');
          }
        }
      } else {
        console.warn(`⚠️ User settings fetch failed: ${response.status} ${response.statusText}`);
      }
    } catch (err) {
      console.error('❌ Error fetching user settings:', err);
      // Don't propagate this error as it's non-critical
    }
  }, [mounted, effectivePublicKey, isEditingInvestmentAmount]);

  // Auto-refresh user settings and wallet balance when wallet is connected and authenticated
  useEffect(() => {
    if (!isWalletReady) return;

    fetchUserSettings();
    fetchWalletBalance();
    
    // Set up periodic refresh for user-specific data only (bot status handled by context)
    const interval = setInterval(() => {
      if (authenticated && connected && effectivePublicKey && mounted && !isEditingInvestmentAmount) {
        
        Promise.allSettled([
          fetchUserSettings(),
          fetchWalletBalance()
        ]).then(results => {
          results.forEach((result, index) => {
            if (result.status === 'rejected') {
              const functionNames = ['fetchUserSettings', 'fetchWalletBalance'];
              console.warn(`⚠️ Periodic refresh failed for ${functionNames[index]}:`, result.reason);
            }
          });
        }).catch(error => {
          // This should not happen with Promise.allSettled, but adding for safety
          console.error('❌ Unexpected error in periodic refresh:', error);
        });
      }
    }, 60000); // Increased to 60 seconds to reduce API load
    
    return () => clearInterval(interval);
  }, [isWalletReady, authenticated, connected, effectivePublicKey, mounted, isEditingInvestmentAmount]); // Removed function dependencies to fix infinite loop

  // Note: Authentication is now handled automatically by SimpleWalletContext
  // No need for manual authentication calls here

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
  }, [mounted, effectivePublicKey, fetchUserSettings]);

  if (!mounted || !isWalletReady) {
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

  // Authentication loading is now handled by SimpleWalletContext
  // This state check is no longer needed

  return (
    <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-white">XORJ Trading Bot</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchBotStatus}
            disabled={botStatusLoading}
            className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50"
            title="Refresh Status"
          >
            <RefreshCw className={`h-4 w-4 ${botStatusLoading ? 'animate-spin' : ''}`} />
          </button>
          {botStatus && (
            <div className={`w-3 h-3 rounded-full ${
              botStatus.status === 'active' ? 'bg-green-400' :
              botStatus.status === 'error' ? 'bg-red-400' : 'bg-gray-400'
            }`} />
          )}
        </div>
      </div>

      {(error || botStatusError) && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-red-400 flex-shrink-0" />
            <div>
              <h3 className="text-red-400 font-medium">Connection Error</h3>
              <p className="text-red-300 text-sm mt-1">{error || botStatusError}</p>
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
                  disabled={botStatusLoading || toggleLoading || botStatus.status === 'error'}
                  className={`
                    inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md
                    transition-colors disabled:opacity-50 disabled:cursor-not-allowed
                    ${botStatus.status === 'active' 
                      ? 'bg-red-600 hover:bg-red-700 text-white' 
                      : 'bg-green-600 hover:bg-green-700 text-white'
                    }
                  `}
                  title={
                    toggleLoading ? 'Processing...' :
                    botStatus.status === 'active' ? 'Disable trading bot' : 
                    botStatus.status === 'error' ? 'Bot has errors - check status' :
                    'Enable trading bot'
                  }
                >
                  {toggleLoading ? (
                    <>
                      <RefreshCw className="h-3 w-3 animate-spin" />
                      {botStatus.status === 'active' ? 'Disabling...' : 'Enabling...'}
                    </>
                  ) : botStatus.status === 'active' ? (
                    <>
                      <Pause className="h-3 w-3" />
                      Disable
                    </>
                  ) : (
                    <>
                      <Play className="h-3 w-3" />
                      Enable
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
              <div className="flex items-center justify-between">
                <div className="text-lg font-semibold text-white capitalize">
                  {riskProfileData?.riskProfile || 'Balanced'}
                </div>
                {!isInSync && (
                  <div className="flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3 text-yellow-400" />
                    <span className="text-xs text-yellow-400">Sync Issue</span>
                  </div>
                )}
              </div>
              {riskProfileError && (
                <div className="text-xs text-red-400 mt-1">
                  Error: {riskProfileError}
                </div>
              )}
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

          {/* Real-time Bot Activity */}
          <div className={`${
            botStatus.status === 'active' 
              ? 'bg-green-500/10 border border-green-500/20' 
              : 'bg-gray-500/10 border border-gray-500/20'
          } rounded-lg p-4`}>
            <div className="flex items-center gap-2 mb-3">
              <Activity className={`h-4 w-4 ${
                botStatus.status === 'active' ? 'text-green-400' : 'text-gray-400'
              }`} />
              <span className={`text-sm font-medium ${
                botStatus.status === 'active' ? 'text-green-400' : 'text-gray-400'
              }`}>
                {botStatus.status === 'active' ? 'Live Bot Activity' : 'Bot Activity Monitor'}
              </span>
            </div>
            <BotActivityIndicator 
              walletAddress={effectivePublicKey}
              refreshInterval={10}
              showDetailed={true}
              showLiveActivity={true}
            />
          </div>

          {/* Investment Configuration */}
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-blue-400" />
                <h3 className="text-blue-400 font-medium">Investment Amount</h3>
              </div>
              <button
                onClick={fetchWalletBalance}
                disabled={loadingBalance}
                className="text-xs text-blue-400 hover:text-blue-300 underline flex items-center gap-1"
                title="Refresh Balance"
              >
                {loadingBalance ? (
                  <>
                    <RefreshCw className="h-3 w-3 animate-spin" />
                    Loading...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-3 w-3" />
                    Refresh
                  </>
                )}
              </button>
            </div>
            
            {/* Wallet Balance Display */}
            <div className={`mb-3 p-3 rounded-lg ${walletBalance === 0 ? 'bg-red-500/10 border border-red-500/20' : 'bg-black/20'}`}>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-300">Available Balance:</span>
                <div className="text-right">
                  {loadingBalance ? (
                    <div className="h-4 w-20 bg-gray-600 rounded animate-pulse"></div>
                  ) : balanceError ? (
                    <span className="text-red-400 text-sm">Error loading balance</span>
                  ) : (
                    <>
                      <span className={`font-semibold ${walletBalance === 0 ? 'text-red-400' : 'text-white'}`}>
                        ${walletBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                      <div className="text-xs text-gray-400">
                        Max investable: ${Math.max(0, walletBalance * 0.98 - 10).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      {walletBalance === 0 && (
                        <div className="text-xs text-red-400 mt-1">
                          ⚠️ No funds available for trading
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Zero Balance Warning */}
            {walletBalance === 0 && !loadingBalance && !balanceError && (
              <div className="mb-3 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="text-yellow-400 text-sm font-medium">Insufficient Funds</div>
                    <div className="text-yellow-300 text-xs mt-1">
                      Your wallet has no available balance. Please deposit SOL or USDC to start trading.
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <label htmlFor="investment-amount" className="block text-sm text-gray-300 mb-2">
                  How much would you like the bot to trade with?
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">$</span>
                  <input
                    id="investment-amount"
                    type="number"
                    min="0.01"
                    max={Math.max(0, walletBalance * 0.98 - 10)}
                    step="0.01"
                    value={investmentAmount}
                    onChange={(e) => {
                      setInvestmentAmount(e.target.value);
                      setIsEditingInvestmentAmount(true);
                    }}
                    onFocus={() => setIsEditingInvestmentAmount(true)}
                    onBlur={() => {
                      // Reset editing flag after a longer delay to allow save button clicks
                      setTimeout(() => setIsEditingInvestmentAmount(false), 500);
                    }}
                    className={`w-full bg-black/40 border rounded-lg px-4 pl-8 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:border-transparent ${
                      parseFloat(investmentAmount) > (walletBalance * 0.98 - 10)
                        ? 'border-red-500 focus:ring-red-500'
                        : 'border-white/20 focus:ring-blue-500'
                    }`}
                    placeholder="0.00"
                    disabled={savingInvestmentAmount}
                  />
                  {parseFloat(investmentAmount) > 0 && parseFloat(investmentAmount) > (walletBalance * 0.98 - 10) && (
                    <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                      <AlertTriangle className="h-4 w-4 text-red-400" />
                    </div>
                  )}
                </div>
                {parseFloat(investmentAmount) > 0 && parseFloat(investmentAmount) > (walletBalance * 0.98 - 10) && (
                  <div className="mt-1 p-2 bg-red-500/10 border border-red-500/20 rounded text-xs text-red-400 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3 flex-shrink-0" />
                    {walletBalance === 0 
                      ? "Cannot invest - wallet has no funds. Please deposit first."
                      : `Amount exceeds available balance of $${Math.max(0, walletBalance * 0.98 - 10).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    }
                  </div>
                )}
              </div>
              
              <button
                onClick={saveInvestmentAmount}
                disabled={savingInvestmentAmount || investmentAmount === '' || parseFloat(investmentAmount) <= 0 || parseFloat(investmentAmount) > (walletBalance * 0.98 - 10)}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:opacity-50 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2"
              >
                {savingInvestmentAmount ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Amount'
                )}
              </button>
            </div>
            
            <div className="mt-3 text-xs text-gray-400">
              Current setting: ${userSettings?.investmentAmount ? userSettings.investmentAmount.toLocaleString() : 'Not set'}
              {userSettings?.investmentAmount && (
                <span className="ml-2 text-green-400">✓ Configured</span>
              )}
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
      ) : botStatusLoading ? (
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