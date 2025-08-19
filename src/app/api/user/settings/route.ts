/**
 * User Settings API Endpoints
 * GET /api/user/settings - Fetch user's current settings
 * POST /api/user/settings - Update user settings
 * 
 * Manages user configuration including risk profile and other bot settings
 */

import { NextRequest, NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';

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

interface UserSettingsUpdate {
  riskProfile?: RiskProfile;
  maxDrawdownLimit?: number;
  positionSizePercent?: number;
  stopLossEnabled?: boolean;
  takeProfitEnabled?: boolean;
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: number;
  requestId: string;
}

// Persistent in-memory storage that survives page navigation
// Using a global storage that persists across requests
const globalThis = global as any;
if (!globalThis.userSettingsStore) {
  globalThis.userSettingsStore = new Map<string, UserSettings>();
}
const userSettingsStore: Map<string, UserSettings> = globalThis.userSettingsStore;

/**
 * GET /api/user/settings
 * Fetch user's current settings
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const requestId = `settings_get_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  try {
    console.log(`⚙️ Settings GET Request: ${requestId}`);
    
    // Extract wallet address from query parameters
    const { searchParams } = new URL(request.url);
    const walletAddress = searchParams.get('walletAddress');

    if (!walletAddress) {
      console.warn(`⚠️ Missing wallet address: ${requestId}`);
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: 'Wallet address is required',
        timestamp: Date.now(),
        requestId
      }, { status: 400 });
    }

    // Validate wallet address format
    try {
      new PublicKey(walletAddress);
    } catch (error) {
      console.warn(`⚠️ Invalid wallet address format: ${walletAddress} - ${requestId}`);
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: 'Invalid wallet address format',
        timestamp: Date.now(),
        requestId
      }, { status: 400 });
    }

    console.log(`📊 Fetching settings for wallet: ${walletAddress}`);
    console.log(`🔍 Current store size: ${userSettingsStore.size}`);
    console.log(`🔍 Store keys: ${Array.from(userSettingsStore.keys()).join(', ')}`);

    // Get or create default settings
    let userSettings = userSettingsStore.get(walletAddress);
    
    if (!userSettings) {
      // Create default settings
      userSettings = createDefaultSettings(walletAddress);
      userSettingsStore.set(walletAddress, userSettings);
      console.log(`✨ Created default settings for: ${walletAddress}`);
      console.log(`🔍 Store size after creation: ${userSettingsStore.size}`);
    } else {
      console.log(`♻️ Retrieved existing settings for: ${walletAddress}`);
    }

    const processingTime = Date.now() - startTime;
    
    console.log(`✅ Settings retrieved: ${requestId} - ${processingTime}ms`);
    console.log(`🎯 Risk Profile: ${userSettings.riskProfile}`);

    return NextResponse.json<ApiResponse<UserSettings>>({
      success: true,
      data: userSettings,
      timestamp: Date.now(),
      requestId
    }, {
      headers: {
        'Cache-Control': 'private, max-age=60', // Cache for 1 minute
        'X-Processing-Time': `${processingTime}ms`
      }
    });

  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error(`❌ Settings GET error ${requestId}:`, error);
    
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: `Failed to retrieve settings: ${error instanceof Error ? error.message : 'Unknown error'}`,
      timestamp: Date.now(),
      requestId
    }, { status: 500 });
  }
}

/**
 * POST /api/user/settings
 * Update user settings
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const requestId = `settings_post_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  try {
    console.log(`⚙️ Settings POST Request: ${requestId}`);
    
    const body = await request.json();
    const { walletAddress, settings } = body;

    if (!walletAddress) {
      console.warn(`⚠️ Missing wallet address: ${requestId}`);
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: 'Wallet address is required',
        timestamp: Date.now(),
        requestId
      }, { status: 400 });
    }

    if (!settings) {
      console.warn(`⚠️ Missing settings data: ${requestId}`);
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: 'Settings data is required',
        timestamp: Date.now(),
        requestId
      }, { status: 400 });
    }

    // Validate wallet address format
    try {
      new PublicKey(walletAddress);
    } catch (error) {
      console.warn(`⚠️ Invalid wallet address format: ${walletAddress} - ${requestId}`);
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: 'Invalid wallet address format',
        timestamp: Date.now(),
        requestId
      }, { status: 400 });
    }

    // Validate settings
    const validationError = validateSettings(settings);
    if (validationError) {
      console.warn(`⚠️ Invalid settings: ${validationError} - ${requestId}`);
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: validationError,
        timestamp: Date.now(),
        requestId
      }, { status: 400 });
    }

    console.log(`💾 Updating settings for wallet: ${walletAddress}`);
    console.log(`🎯 New settings:`, settings);
    console.log(`🔍 Store size before update: ${userSettingsStore.size}`);
    console.log(`🔍 Store keys before update: ${Array.from(userSettingsStore.keys()).join(', ')}`);

    // Get existing settings or create default
    const existingSettings = userSettingsStore.get(walletAddress) || createDefaultSettings(walletAddress);
    console.log(`🔍 Existing settings found: ${!!userSettingsStore.get(walletAddress)}`);
    console.log(`🔍 Current risk profile: ${existingSettings.riskProfile}`);

    // Update settings
    const updatedSettings: UserSettings = {
      ...existingSettings,
      ...settings,
      walletAddress, // Ensure wallet address doesn't get overwritten
      lastUpdated: Date.now()
    };

    // Save to store
    userSettingsStore.set(walletAddress, updatedSettings);
    console.log(`🔍 Store size after update: ${userSettingsStore.size}`);
    console.log(`🔍 Store keys after update: ${Array.from(userSettingsStore.keys()).join(', ')}`);
    console.log(`✅ Settings persisted for: ${walletAddress}`);

    // Sync risk profile changes to bot service
    if (settings.riskProfile) {
      try {
        console.log(`🤖 Syncing risk profile to bot service: ${settings.riskProfile.toLowerCase()}`);
        const botConfigUpdate = {
          risk_profile: settings.riskProfile.toLowerCase()
        };
        
        const botResponse = await fetch(`http://localhost:8000/api/v1/bot/configuration/${walletAddress}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(botConfigUpdate)
        });

        if (botResponse.ok) {
          const botResult = await botResponse.json();
          console.log(`✅ Bot configuration updated successfully: ${botResult.message}`);
        } else {
          console.warn(`⚠️ Failed to update bot configuration: ${botResponse.status} ${botResponse.statusText}`);
        }
      } catch (error) {
        console.error(`❌ Error syncing to bot service:`, error);
        // Don't fail the entire operation if bot sync fails
      }
    }

    const processingTime = Date.now() - startTime;
    
    console.log(`✅ Settings updated: ${requestId} - ${processingTime}ms`);
    console.log(`🎯 Risk Profile: ${updatedSettings.riskProfile}`);

    return NextResponse.json<ApiResponse<UserSettings>>({
      success: true,
      data: updatedSettings,
      timestamp: Date.now(),
      requestId
    }, {
      headers: {
        'X-Processing-Time': `${processingTime}ms`
      }
    });

  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error(`❌ Settings POST error ${requestId}:`, error);
    
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: `Failed to update settings: ${error instanceof Error ? error.message : 'Unknown error'}`,
      timestamp: Date.now(),
      requestId
    }, { status: 500 });
  }
}

/**
 * Create default settings for a new user
 */
function createDefaultSettings(walletAddress: string): UserSettings {
  return {
    walletAddress,
    riskProfile: 'Balanced',
    maxDrawdownLimit: 15, // 15% max drawdown
    positionSizePercent: 5, // 5% position size
    stopLossEnabled: true,
    takeProfitEnabled: true,
    lastUpdated: Date.now(),
    createdAt: Date.now()
  };
}

/**
 * Validate settings update data
 */
function validateSettings(settings: UserSettingsUpdate): string | null {
  if (settings.riskProfile && !['Conservative', 'Balanced', 'Aggressive'].includes(settings.riskProfile)) {
    return 'Invalid risk profile. Must be Conservative, Balanced, or Aggressive';
  }

  if (settings.maxDrawdownLimit !== undefined) {
    if (typeof settings.maxDrawdownLimit !== 'number' || settings.maxDrawdownLimit < 1 || settings.maxDrawdownLimit > 50) {
      return 'Invalid max drawdown limit. Must be between 1% and 50%';
    }
  }

  if (settings.positionSizePercent !== undefined) {
    if (typeof settings.positionSizePercent !== 'number' || settings.positionSizePercent < 1 || settings.positionSizePercent > 25) {
      return 'Invalid position size. Must be between 1% and 25%';
    }
  }

  if (settings.stopLossEnabled !== undefined && typeof settings.stopLossEnabled !== 'boolean') {
    return 'Invalid stop loss enabled value. Must be boolean';
  }

  if (settings.takeProfitEnabled !== undefined && typeof settings.takeProfitEnabled !== 'boolean') {
    return 'Invalid take profit enabled value. Must be boolean';
  }

  return null;
}