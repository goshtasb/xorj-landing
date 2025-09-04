/**
 * RiskProfileSelector Component
 * UI for selecting user's desired risk profile with comprehensive sync functionality
 */

'use client';

import React, { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { Shield, TrendingUp, Zap, CheckCircle, Loader2, AlertCircle, Save } from 'lucide-react';
import { useRiskProfileSync } from '@/hooks/useRiskProfileSync';

export type RiskProfile = 'conservative' | 'moderate' | 'aggressive';

interface UserSettings {
  walletAddress: string;
  riskProfile: RiskProfile;
  maxDrawdownLimit: number;
  positionSizePercent: number;
  stopLossEnabled: boolean;
  takeProfitEnabled: boolean;
  lastUpdated: number;
  createdAt: number;
}

interface RiskProfileOption {
  id: RiskProfile;
  name: string;
  description: string;
  icon: React.ReactNode;
  details: string[];
  color: string;
  maxDrawdown: string;
  expectedReturn: string;
}

export function RiskProfileSelector() {
  const { publicKey } = useWallet();
  
  // Only use real wallet address when connected
  const effectivePublicKey = publicKey?.toString();
  
  // Use comprehensive sync hook instead of local state
  const { 
    riskProfileData, 
    isLoading, 
    error, 
    syncRiskProfile,
    refreshRiskProfile,
    isInSync
  } = useRiskProfileSync(effectivePublicKey);

  // State management
  const [selectedProfile, setSelectedProfile] = useState<RiskProfile>('moderate');
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Risk profile options
  const riskProfiles: RiskProfileOption[] = [
    {
      id: 'conservative',
      name: 'Conservative',
      description: 'Lower risk, steady growth approach',
      icon: <Shield className="h-5 w-5" />,
      details: [
        'Maximum 10% drawdown protection',
        'Focus on stable, proven traders',
        'Lower position sizes for safety',
        'Prioritizes capital preservation'
      ],
      color: 'text-blue-400 border-blue-500/30 bg-blue-500/10',
      maxDrawdown: '10%',
      expectedReturn: '15-30% annually'
    },
    {
      id: 'moderate',
      name: 'Moderate',
      description: 'Moderate risk with balanced growth potential',
      icon: <TrendingUp className="h-5 w-5" />,
      details: [
        'Maximum 15% drawdown tolerance',
        'Mix of stable and growth traders',
        'Moderate position sizing',
        'Balance between growth and safety'
      ],
      color: 'text-green-400 border-green-500/30 bg-green-500/10',
      maxDrawdown: '15%',
      expectedReturn: '25-50% annually'
    },
    {
      id: 'aggressive',
      name: 'Aggressive',
      description: 'Higher risk for maximum growth potential',
      icon: <Zap className="h-5 w-5" />,
      details: [
        'Maximum 25% drawdown acceptance',
        'Focus on high-performing traders',
        'Larger position sizes for growth',
        'Maximizes profit potential'
      ],
      color: 'text-purple-400 border-purple-500/30 bg-purple-500/10',
      maxDrawdown: '25%',
      expectedReturn: '40-80% annually'
    }
  ];

  // Update selected profile when risk profile data changes
  useEffect(() => {
    if (riskProfileData?.riskProfile) {
      setSelectedProfile(riskProfileData.riskProfile);
    }
  }, [riskProfileData]);

  // Handle profile selection
  const handleProfileSelect = (profile: RiskProfile) => {
    setSelectedProfile(profile);
    setSaveSuccess(false); // Reset success state when making changes
  };

  // Handle save settings with comprehensive sync
  const handleSave = async () => {
    // Allow saving if settings have changed
    if (riskProfileData?.riskProfile === selectedProfile) return;

    setSaving(true);
    setSaveSuccess(false);

    try {
      console.log('💾 Saving risk profile with comprehensive sync:', selectedProfile);
      
      // Use comprehensive sync instead of just frontend API
      const success = await syncRiskProfile(selectedProfile, riskProfileData?.investmentAmount);
      
      if (success) {
        setSaveSuccess(true);
        console.log('✅ Risk profile sync completed successfully');

        // Trigger storage event to notify other components
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new StorageEvent('storage', {
            key: 'xorj_risk_profile_updated',
            newValue: Date.now().toString(),
            storageArea: localStorage
          }));
        }

        // Clear success message after 3 seconds
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        throw new Error('Risk profile sync failed');
      }

    } catch (err) {
      console.error('❌ Risk profile save failed:', err);
      // Error is handled by the sync hook
    } finally {
      setSaving(false);
    }
  };

  // Check if settings have changed
  const hasChanges = !riskProfileData || selectedProfile !== riskProfileData.riskProfile;

  if (isLoading) {
    return (
      <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl p-6">
        <div className="animate-pulse">
          <div className="h-6 w-48 bg-gray-600 rounded mb-4" />
          <div className="space-y-4">
            <div className="h-20 bg-gray-700 rounded" />
            <div className="h-20 bg-gray-700 rounded" />
            <div className="h-20 bg-gray-700 rounded" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl p-6">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-white mb-2">Risk Profile Configuration</h2>
        <p className="text-gray-300 text-sm mb-3">
          Choose your preferred risk level to customize how our trading bot manages your investments
        </p>
        
        {/* Sync Status Indicator */}
        {riskProfileData && (
          <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs ${
            isInSync 
              ? 'bg-green-500/10 border border-green-500/20 text-green-400' 
              : 'bg-yellow-500/10 border border-yellow-500/20 text-yellow-400'
          }`}>
            <div className={`w-2 h-2 rounded-full ${isInSync ? 'bg-green-400' : 'bg-yellow-400'}`} />
            {isInSync ? 'Synced with trading bot' : 'Sync with trading bot needed'}
          </div>
        )}
      </div>

      {/* Error State */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0" />
            <div>
              <h3 className="text-red-400 font-medium">Error</h3>
              <p className="text-red-300 text-sm mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Success State */}
      {saveSuccess && (
        <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-3">
            <CheckCircle className="h-5 w-5 text-green-400 flex-shrink-0" />
            <div>
              <h3 className="text-green-400 font-medium">Settings Saved</h3>
              <p className="text-green-300 text-sm mt-1">Your risk profile has been updated successfully</p>
            </div>
          </div>
        </div>
      )}

      {/* Risk Profile Options */}
      <div className="space-y-4 mb-6">
        {riskProfiles.map((profile) => {
          const isSelected = selectedProfile === profile.id;
          const isCurrent = riskProfileData?.riskProfile === profile.id;
          
          return (
            <div
              key={profile.id}
              className={`
                relative border-2 rounded-xl p-4 transition-all duration-200 cursor-pointer
                ${isSelected 
                  ? profile.color
                  : 'border-white/20 bg-white/5 hover:bg-white/10 hover:border-white/30'
                }
              `}
              onClick={() => handleProfileSelect(profile.id)}
            >
              <div className="flex items-start gap-4">
                {/* Radio Button */}
                <div className="flex items-center pt-1">
                  <div className={`
                    w-4 h-4 rounded-full border-2 flex items-center justify-center
                    ${isSelected 
                      ? 'border-current' 
                      : 'border-gray-400'
                    }
                  `}>
                    {isSelected && (
                      <div className="w-2 h-2 rounded-full bg-current" />
                    )}
                  </div>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <div className={isSelected ? 'text-current' : 'text-gray-400'}>
                      {profile.icon}
                    </div>
                    <h3 className={`font-semibold ${isSelected ? 'text-current' : 'text-white'}`}>
                      {profile.name}
                      {isCurrent && (
                        <span className="text-xs text-gray-400 ml-2">(Current)</span>
                      )}
                    </h3>
                  </div>
                  
                  <p className={`text-sm mb-3 ${isSelected ? 'text-current opacity-90' : 'text-gray-300'}`}>
                    {profile.description}
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                    <div>
                      <div className={`font-medium mb-1 ${isSelected ? 'text-current' : 'text-gray-400'}`}>
                        Key Features:
                      </div>
                      <ul className={`space-y-1 ${isSelected ? 'text-current opacity-80' : 'text-gray-400'}`}>
                        {profile.details.map((detail, index) => (
                          <li key={index} className="flex items-center gap-1">
                            <span>•</span>
                            <span>{detail}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    
                    <div className="space-y-2">
                      <div>
                        <span className={`font-medium ${isSelected ? 'text-current' : 'text-gray-400'}`}>
                          Max Drawdown: 
                        </span>
                        <span className={`ml-1 ${isSelected ? 'text-current opacity-80' : 'text-gray-300'}`}>
                          {profile.maxDrawdown}
                        </span>
                      </div>
                      <div>
                        <span className={`font-medium ${isSelected ? 'text-current' : 'text-gray-400'}`}>
                          Expected Return: 
                        </span>
                        <span className={`ml-1 ${isSelected ? 'text-current opacity-80' : 'text-gray-300'}`}>
                          {profile.expectedReturn}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Save Button */}
      {hasChanges && (
        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="
              inline-flex items-center gap-2 px-6 py-3
              bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg
              transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed
              focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2
              focus:ring-offset-gray-900
            "
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving Changes...
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Save Changes
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}