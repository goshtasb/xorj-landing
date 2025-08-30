/**
 * User Settings API Endpoints
 * GET /api/user/settings - Fetch user's current settings
 * POST /api/user/settings - Update user settings
 * 
 * Manages user configuration including risk profile and other bot settings
 */

import { NextRequest, NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';
import { UserSettingsService } from '@/lib/userSettingsService';
// import { UserSettingsService } from '@/lib/botStateService'; // Commented out to fix profile page loading

export type RiskProfile = 'Conservative' | 'Balanced' | 'Aggressive';

interface UserSettings {
  walletAddress: string;
  riskProfile: RiskProfile;
  maxDrawdownLimit: number;
  positionSizePercent: number;
  stopLossEnabled: boolean;
  takeProfitEnabled: boolean;
  investmentAmount?: number;
  lastUpdated: number;
  createdAt: number;
}

interface UserSettingsUpdate {
  riskProfile?: RiskProfile;
  maxDrawdownLimit?: number;
  positionSizePercent?: number;
  stopLossEnabled?: boolean;
  takeProfitEnabled?: boolean;
  investmentAmount?: number;
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: number;
  requestId: string;
}

interface BotConfigUpdate {
  risk_profile?: string;
  max_trade_amount?: number;
}

interface BotResponseResult {
  message: string;
}

interface RequestBody {
  walletAddress?: string;
  settings?: UserSettingsUpdate;
  investmentAmount?: number;
  riskProfile?: RiskProfile;
}

// Database storage has replaced in-memory storage
// UserSettingsService handles all persistence operations

/**
 * GET /api/user/settings
 * Fetch user's current settings
 */
export async function GET(request: NextRequest): Promise<NextResponse<ApiResponse<UserSettings | null>>> {
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
    } catch {
      console.warn(`⚠️ Invalid wallet address format: ${walletAddress} - ${requestId}`);
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: 'Invalid wallet address format',
        timestamp: Date.now(),
        requestId
      }, { status: 400 });
    }

    // PHASE 1: Use read-through caching for user settings
    const { cacheLayer } = await import('@/lib/cacheLayer');
    
    const cachedResult = await cacheLayer.getUserSettings(walletAddress);
    
    if (cachedResult.success && cachedResult.data) {
      console.log(`🎯 Cache returned settings for ${walletAddress} (fromCache: ${cachedResult.fromCache})`);
      
      // Transform cached data to API format
      const cachedSettings = cachedResult.data as Record<string, unknown>;
      
      // PRODUCTION FIX: Use database-backed user settings service
      try {
        const dbSettings = await UserSettingsService.getUserSettings(walletAddress);
        
        if (dbSettings) {
          // User has saved settings in database
          console.log(`📦 Using database settings for ${walletAddress}: riskProfile = ${dbSettings.riskProfile}`);
          
          const apiUserSettings: UserSettings = {
            walletAddress: walletAddress,
            riskProfile: dbSettings.riskProfile as RiskProfile,
            maxDrawdownLimit: 15,
            positionSizePercent: 5,
            stopLossEnabled: true,
            takeProfitEnabled: true,
            investmentAmount: dbSettings.investmentAmount || 1000,
            lastUpdated: dbSettings.lastUpdated.getTime(),
            createdAt: Date.now()
          };
          
          const processingTime = Date.now() - startTime;
          
          return NextResponse.json<ApiResponse<UserSettings>>({
            success: true,
            data: apiUserSettings,
            timestamp: Date.now(),
            requestId
          }, {
            headers: {
              'Cache-Control': 'private, max-age=60',
              'X-Processing-Time': `${processingTime}ms`,
              'X-Cache-Status': 'DATABASE_HIT'
            }
          });
        } else {
          // No saved settings in database - return null to indicate no saved settings
          console.log(`🆕 No saved settings found in database for ${walletAddress} - returning null`);
          
          const processingTime = Date.now() - startTime;
          
          return NextResponse.json<ApiResponse<null>>({
            success: true,
            data: null, // This indicates no settings have been saved yet
            timestamp: Date.now(),
            requestId
          }, {
            headers: {
              'Cache-Control': 'private, max-age=60',
              'X-Processing-Time': `${processingTime}ms`,
              'X-Cache-Status': 'NO_USER_DATA'
            }
          });
        }
      } catch (dbError) {
        console.error(`❌ Database error fetching settings for ${walletAddress}:`, dbError);
        // Fall back to cache/default behavior
      }
      
      // This code should never be reached since we handle persistent storage above
      console.error(`🚨 Unexpected code path reached in settings GET API for ${walletAddress}`);
      
      // Transform risk profile from lowercase (cache/database) to title case (frontend)
      const transformRiskProfile = (profile?: string): RiskProfile => {
        if (!profile) return 'Balanced';
        switch (profile.toLowerCase()) {
          case 'conservative': return 'Conservative';
          case 'balanced': return 'Balanced';
          case 'aggressive': return 'Aggressive';
          default: return 'Balanced';
        }
      };

      const apiUserSettings: UserSettings = {
        walletAddress: walletAddress,
        riskProfile: transformRiskProfile(cachedSettings.risk_level),
        maxDrawdownLimit: cachedSettings.max_drawdown_limit || 15,
        positionSizePercent: cachedSettings.position_size_percent || 5,
        stopLossEnabled: cachedSettings.stop_loss_enabled ?? true,
        takeProfitEnabled: cachedSettings.take_profit_enabled ?? true,
        investmentAmount: cachedSettings.investment_amount || 1000,
        lastUpdated: cachedSettings.updated_at ? new Date(cachedSettings.updated_at).getTime() : Date.now(),
        createdAt: Date.now()
      };

      const processingTime = Date.now() - startTime;
      
      return NextResponse.json<ApiResponse<UserSettings>>({
        success: true,
        data: apiUserSettings,
        timestamp: Date.now(),
        requestId
      }, {
        headers: {
          'Cache-Control': 'private, max-age=60',
          'X-Processing-Time': `${processingTime}ms`,
          'X-Cache-Status': cachedResult.fromCache ? 'HIT' : 'MISS'
        }
      });
    } else {
      // Cache failed - use persistent storage fallback
      console.error(`❌ Cache layer failed for ${walletAddress} settings:`, cachedResult.error);
      
      console.log(`🔄 Using database fallback: ${walletAddress}`);
      
      try {
        // Try database as final fallback
        const dbSettings = await UserSettingsService.getUserSettings(walletAddress);
        
        if (dbSettings) {
          const processingTime = Date.now() - startTime;
          
          const apiUserSettings: UserSettings = {
            walletAddress: walletAddress,
            riskProfile: dbSettings.riskProfile as RiskProfile,
            maxDrawdownLimit: 15,
            positionSizePercent: 5,
            stopLossEnabled: true,
            takeProfitEnabled: true,
            investmentAmount: dbSettings.investmentAmount || 1000,
            lastUpdated: dbSettings.lastUpdated.getTime(),
            createdAt: Date.now()
          };
          
          console.log(`📦 Using database fallback settings: riskProfile = ${dbSettings.riskProfile}`);

          return NextResponse.json<ApiResponse<UserSettings>>({
            success: true,
            data: apiUserSettings,
            timestamp: Date.now(),
            requestId
          }, {
            headers: {
              'Cache-Control': 'private, max-age=60',
              'X-Processing-Time': `${processingTime}ms`,
              'X-Cache-Status': 'DATABASE_FALLBACK'
            }
          });
        } else {
          // Absolutely no settings found anywhere - return null
          const processingTime = Date.now() - startTime;
          
          return NextResponse.json<ApiResponse<null>>({
            success: true,
            data: null,
            timestamp: Date.now(),
            requestId
          }, {
            headers: {
              'Cache-Control': 'private, max-age=60',
              'X-Processing-Time': `${processingTime}ms`,
              'X-Cache-Status': 'NO_DATA_FOUND'
            }
          });
        }
      } catch (fallbackError) {
        console.error(`❌ Database fallback also failed for ${walletAddress}:`, fallbackError);
        
        // Return null as ultimate fallback
        const processingTime = Date.now() - startTime;
        
        return NextResponse.json<ApiResponse<null>>({
          success: true,
          data: null,
          timestamp: Date.now(),
          requestId
        }, {
          headers: {
            'Cache-Control': 'private, max-age=60',
            'X-Processing-Time': `${processingTime}ms`,
            'X-Cache-Status': 'FALLBACK_FAILED'
          }
        });
      }
    }

  } catch (error) {
    console.error(`❌ Settings GET error ${requestId}:`, error);
    
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: 'Failed to retrieve settings: Unknown error',
      timestamp: Date.now(),
      requestId
    }, { status: 500 });
  }
}

/**
 * POST /api/user/settings
 * Update user settings
 */
export async function POST(request: NextRequest): Promise<NextResponse<ApiResponse<UserSettings | null>>> {
  const startTime = Date.now();
  const requestId = `settings_post_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  try {
    console.log(`⚙️ Settings POST Request: ${requestId}`);
    
    const body = await request.json() as RequestBody;
    const { walletAddress, settings, investmentAmount, riskProfile } = body;

    if (!walletAddress) {
      console.warn(`⚠️ Missing wallet address: ${requestId}`);
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: 'Wallet address is required',
        timestamp: Date.now(),
        requestId
      }, { status: 400 });
    }

    // Support both old format (with settings object) and new format (direct fields)
    const settingsData = settings || {
      riskProfile,
      investmentAmount
    };

    if (!settingsData && !investmentAmount && !riskProfile) {
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
    } catch {
      console.warn(`⚠️ Invalid wallet address format: ${walletAddress} - ${requestId}`);
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: 'Invalid wallet address format',
        timestamp: Date.now(),
        requestId
      }, { status: 400 });
    }

    // Validate settings
    const validationError = validateSettings(settingsData);
    if (validationError) {
      console.warn(`⚠️ Invalid settings: ${validationError} - ${requestId}`);
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: validationError,
        timestamp: Date.now(),
        requestId
      }, { status: 400 });
    }

    console.log(`💾 Updating settings for wallet: ${walletAddress} (persistent storage)`);
    console.log(`🎯 New settings:`, settingsData);

    // PRODUCTION: Persist settings to database using UserSettingsService
    if (settingsData.riskProfile || settingsData.investmentAmount) {
      try {
        const savedSettings = await UserSettingsService.saveUserSettings(
          walletAddress, 
          settingsData.riskProfile || 'Balanced',
          settingsData.investmentAmount
        );
        console.log(`✅ Settings persisted to database: ${walletAddress} - riskProfile: ${savedSettings.riskProfile}, investmentAmount: ${savedSettings.investmentAmount}`);
      } catch (dbError) {
        console.error(`❌ Failed to persist settings to database for ${walletAddress}:`, dbError);
        // For production readiness, we should fail the request if database persistence fails
        return NextResponse.json<ApiResponse<null>>({
          success: false,
          error: 'Failed to save settings to database',
          timestamp: Date.now(),
          requestId
        }, { status: 500 });
      }
    } else {
      console.log(`⚠️ No settings to persist for ${walletAddress}`);
    }

    // Sync settings changes to bot service
    if (settingsData.riskProfile || settingsData.investmentAmount) {
      try {
        const botConfigUpdate: BotConfigUpdate = {};
        
        if (settingsData.riskProfile) {
          console.log(`🤖 Syncing risk profile to bot service: ${settingsData.riskProfile.toLowerCase()}`);
          botConfigUpdate.risk_profile = settingsData.riskProfile.toLowerCase();
        }
        
        if (settingsData.investmentAmount) {
          console.log(`💰 Syncing investment amount to bot service: $${settingsData.investmentAmount}`);
          botConfigUpdate.max_trade_amount = settingsData.investmentAmount;
        }
        
        const botResponse = await fetch(`${process.env.NEXT_PUBLIC_FASTAPI_GATEWAY_URL || 'http://localhost:8000'}/api/v1/bot/configuration/${walletAddress}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(botConfigUpdate)
        });

        if (botResponse.ok) {
          const botResult = await botResponse.json() as BotResponseResult;
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
    
    // PHASE 1: Invalidate cache after settings update
    const { cacheLayer } = await import('@/lib/cacheLayer');
    await cacheLayer.invalidateUserCache(walletAddress, 'settings');
    console.log(`🗑️ Invalidated settings cache for ${walletAddress}`);

    // Get the actual saved settings from database to return accurate data
    let apiUpdatedSettings: UserSettings;
    try {
      const dbSettings = await UserSettingsService.getUserSettings(walletAddress);
      if (dbSettings) {
        apiUpdatedSettings = {
          walletAddress: walletAddress,
          riskProfile: dbSettings.riskProfile,
          maxDrawdownLimit: settingsData.maxDrawdownLimit || 15,
          positionSizePercent: settingsData.positionSizePercent || 5,
          stopLossEnabled: settingsData.stopLossEnabled ?? true,
          takeProfitEnabled: settingsData.takeProfitEnabled ?? true,
          investmentAmount: dbSettings.investmentAmount,
          lastUpdated: dbSettings.lastUpdated.getTime(),
          createdAt: Date.now()
        };
      } else {
        // Fallback if database read fails after save
        apiUpdatedSettings = {
          walletAddress: walletAddress,
          riskProfile: settingsData.riskProfile || 'Balanced',
          maxDrawdownLimit: settingsData.maxDrawdownLimit || 15,
          positionSizePercent: settingsData.positionSizePercent || 5,
          stopLossEnabled: settingsData.stopLossEnabled ?? true,
          takeProfitEnabled: settingsData.takeProfitEnabled ?? true,
          investmentAmount: settingsData.investmentAmount,
          lastUpdated: Date.now(),
          createdAt: Date.now()
        };
      }
    } catch (dbError) {
      console.error(`⚠️ Failed to read back saved settings for ${walletAddress}:`, dbError);
      // Use the submitted data as fallback
      apiUpdatedSettings = {
        walletAddress: walletAddress,
        riskProfile: settingsData.riskProfile || 'Balanced',
        maxDrawdownLimit: settingsData.maxDrawdownLimit || 15,
        positionSizePercent: settingsData.positionSizePercent || 5,
        stopLossEnabled: settingsData.stopLossEnabled ?? true,
        takeProfitEnabled: settingsData.takeProfitEnabled ?? true,
        investmentAmount: settingsData.investmentAmount,
        lastUpdated: Date.now(),
        createdAt: Date.now()
      };
    }
    
    console.log(`✅ Settings updated: ${requestId} - ${processingTime}ms`);
    console.log(`🎯 Risk Profile: ${apiUpdatedSettings.riskProfile}`);

    return NextResponse.json<ApiResponse<UserSettings>>({
      success: true,
      data: apiUpdatedSettings,
      timestamp: Date.now(),
      requestId
    }, {
      headers: {
        'X-Processing-Time': `${processingTime}ms`,
        'X-Cache-Status': 'INVALIDATED'
      }
    });

  } catch (error) {
    console.error(`❌ Settings POST error ${requestId}:`, error);
    
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: 'Failed to update settings: Unknown error',
      timestamp: Date.now(),
      requestId
    }, { status: 500 });
  }
}

// Default settings are now handled by UserSettingsService.getOrCreate()

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

  if (settings.investmentAmount !== undefined) {
    if (typeof settings.investmentAmount !== 'number' || settings.investmentAmount <= 0 || settings.investmentAmount > 1000000) {
      return 'Invalid investment amount. Must be between $1 and $1,000,000';
    }
    // Note: Wallet balance validation is handled client-side for real-time feedback
    // Server-side validation could be added here with wallet balance service integration
  }

  return null;
}