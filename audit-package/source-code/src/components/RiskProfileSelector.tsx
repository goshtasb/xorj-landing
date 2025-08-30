/**
 * RiskProfileSelector Component
 * UI for selecting user's desired risk profile with save functionality
 */

'use client';

import React, { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { Shield, TrendingUp, Zap, CheckCircle, Loader2, AlertCircle, Save } from 'lucide-react';

export type RiskProfile = 'Conservative' | 'Balanced' | 'Aggressive';

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
  
  // State management
  const [currentSettings, setCurrentSettings] = useState<UserSettings | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<RiskProfile>('Balanced');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Only use real wallet address when connected
  const effectivePublicKey = publicKey?.toString();

  // Risk profile options
  const riskProfiles: RiskProfileOption[] = [
    {
      id: 'Conservative',
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
      id: 'Balanced',
      name: 'Balanced',
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
      id: 'Aggressive',
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

  // Fetch current settings on mount
  useEffect(() => {
    const fetchSettings = async () => {
      if (!effectivePublicKey) return;

      setLoading(true);
      setError(null);

      try {
        console.log('📊 Fetching user settings...');
        
        const response = await fetch(`/api/user/settings?walletAddress=${effectivePublicKey}`);
        
        if (!response.ok) {
          throw new Error(`Failed to fetch settings: ${response.statusText}`);
        }

        const result = await response.json();
        
        if (!result.success) {
          throw new Error(result.error || 'Failed to fetch settings');
        }

        setCurrentSettings(result.data);
        setSelectedProfile(result.data.riskProfile);
        console.log('✅ Settings loaded:', result.data.riskProfile);

      } catch (err) {
        console.error('❌ Settings fetch failed:', err);
        setError(err instanceof Error ? err.message : 'Failed to load settings');
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
  }, [effectivePublicKey]);

  // Handle profile selection
  const handleProfileSelect = (profile: RiskProfile) => {
    setSelectedProfile(profile);
    setSaveSuccess(false); // Reset success state when making changes
  };

  // Handle save settings
  const handleSave = async () => {
    if (!currentSettings || selectedProfile === currentSettings.riskProfile) return;

    setSaving(true);
    setError(null);
    setSaveSuccess(false);

    try {
      console.log('💾 Saving risk profile:', selectedProfile);
      
      const response = await fetch('/api/user/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          walletAddress: effectivePublicKey,
          settings: {
            riskProfile: selectedProfile
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to save settings: ${response.statusText}`);
      }

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to save settings');
      }

      setCurrentSettings(result.data);
      setSaveSuccess(true);
      console.log('✅ Settings saved successfully');

      // Clear success message after 3 seconds
      setTimeout(() => setSaveSuccess(false), 3000);

    } catch (err) {
      console.error('❌ Settings save failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  // Check if settings have changed
  const hasChanges = currentSettings && selectedProfile !== currentSettings.riskProfile;

  if (loading) {
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
        <p className="text-gray-300 text-sm">
          Choose your preferred risk level to customize how our trading bot manages your investments
        </p>
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
          const isCurrent = currentSettings?.riskProfile === profile.id;
          
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