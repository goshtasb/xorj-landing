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

export type RiskProfile = 'conservative' | 'moderate' | 'aggressive';

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
    
    // Extract wallet address from query parameters
    const { searchParams } = new URL(request.url);
    const walletAddress = searchParams.get('walletAddress');

    if (!walletAddress) {
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
      
      // Transform cached data to API format
      const cachedSettings = cachedResult.data as Record<string, unknown>;
      
      // PRODUCTION FIX: Use database-backed user settings service
      try {
        const dbSettings = await UserSettingsService.getUserSettings(walletAddress);
        
        if (dbSettings) {
          // User has saved settings in database
          
          const apiUserSettings: UserSettings = {
            walletAddress: walletAddress,
            riskProfile: dbSettings.riskProfile as RiskProfile,
            maxDrawdownLimit: 15,
            positionSizePercent: 5,
            stopLossEnabled: true,
            takeProfitEnabled: true,
            // Include investmentAmount - default to 0 for first-time users
            investmentAmount: dbSettings.investmentAmount ?? 0,
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
        // In development mode, suppress connection pool errors to reduce noise
        if (process.env.NODE_ENV === 'development' && (dbError as Error)?.message?.includes('too many clients')) {
          console.warn(`⚠️ Database connection pool exhausted for ${walletAddress} (API route)`);
        } else {
          console.error(`❌ Database error fetching settings for ${walletAddress}:`, dbError);
        }
        // Fall back to cache/default behavior
      }
      
      // This code should never be reached since we handle persistent storage above
      console.error(`🚨 Unexpected code path reached in settings GET API for ${walletAddress}`);
      
      // Transform risk profile - normalize to lowercase
      const transformRiskProfile = (profile?: string): RiskProfile => {
        if (!profile) return 'moderate';
        switch (profile.toLowerCase()) {
          case 'conservative': return 'conservative';
          case 'moderate':
          case 'balanced': return 'moderate';
          case 'aggressive': return 'aggressive';
          default: return 'moderate';
        }
      };

      const apiUserSettings: UserSettings = {
        walletAddress: walletAddress,
        riskProfile: transformRiskProfile(cachedSettings.risk_level),
        maxDrawdownLimit: cachedSettings.max_drawdown_limit || 15,
        positionSizePercent: cachedSettings.position_size_percent || 5,
        stopLossEnabled: cachedSettings.stop_loss_enabled ?? true,
        takeProfitEnabled: cachedSettings.take_profit_enabled ?? true,
        investmentAmount: cachedSettings.investment_amount || 0,
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
            // Include investmentAmount - default to 0 for first-time users
            investmentAmount: dbSettings.investmentAmount ?? 0,
            lastUpdated: dbSettings.lastUpdated.getTime(),
            createdAt: Date.now()
          };
          

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
    
    const body = await request.json() as RequestBody;
    const { walletAddress, settings, investmentAmount, riskProfile } = body;

    if (!walletAddress) {
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
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: validationError,
        timestamp: Date.now(),
        requestId
      }, { status: 400 });
    }


    // PERMANENT SOLUTION: Use unified risk profile synchronization service
    if (settingsData.riskProfile || settingsData.investmentAmount !== undefined) {
      try {
        console.log(`🔄 Starting unified risk profile sync for ${walletAddress}`);
        
        // Import the permanent synchronization service
        const { riskProfileSyncService } = await import('@/lib/riskProfileSyncService');
        
        // Perform guaranteed synchronization across all systems
        const syncResult = await riskProfileSyncService.updateRiskProfile(
          walletAddress,
          settingsData.riskProfile || 'moderate',
          settingsData.investmentAmount
        );
        
        if (syncResult.success) {
          console.log(`✅ PERMANENT SOLUTION: Risk profile synchronized successfully across all systems for ${walletAddress}`);
        } else {
          console.warn(`⚠️ PERMANENT SOLUTION: Sync completed with issues for ${walletAddress}:`, {
            errors: syncResult.errors,
            conflicts: syncResult.conflicts
          });
          
          // Still proceed - the service handles fallbacks and auto-reconciliation
          // This prevents user-facing failures while ensuring eventual consistency
        }
      } catch (syncError) {
        console.error(`❌ PERMANENT SOLUTION: Risk profile sync service failed for ${walletAddress}:`, syncError);
        
        // Fallback to legacy UserSettingsService for critical failure scenarios
        try {
          console.log(`🔄 Falling back to legacy UserSettingsService for ${walletAddress}`);
          await UserSettingsService.saveUserSettings(
            walletAddress, 
            settingsData.riskProfile || 'moderate',
            settingsData.investmentAmount
          );
          console.log(`✅ Legacy fallback completed for ${walletAddress}`);
        } catch (fallbackError) {
          console.error(`❌ Even legacy fallback failed for ${walletAddress}:`, fallbackError);
          
          // Only fail the request if both the permanent solution AND legacy fallback fail
          return NextResponse.json<ApiResponse<null>>({
            success: false,
            error: 'Critical failure: Unable to save settings using any available method',
            timestamp: Date.now(),
            requestId
          }, { status: 500 });
        }
      }
    }

    const processingTime = Date.now() - startTime;
    
    // PHASE 1: Invalidate cache after settings update
    const { cacheLayer } = await import('@/lib/cacheLayer');
    await cacheLayer.invalidateUserCache(walletAddress, 'settings');

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
          riskProfile: settingsData.riskProfile || 'moderate',
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
        riskProfile: settingsData.riskProfile || 'moderate',
        maxDrawdownLimit: settingsData.maxDrawdownLimit || 15,
        positionSizePercent: settingsData.positionSizePercent || 5,
        stopLossEnabled: settingsData.stopLossEnabled ?? true,
        takeProfitEnabled: settingsData.takeProfitEnabled ?? true,
        investmentAmount: settingsData.investmentAmount,
        lastUpdated: Date.now(),
        createdAt: Date.now()
      };
    }
    

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
  if (settings.riskProfile && !['conservative', 'moderate', 'aggressive'].includes(settings.riskProfile)) {
    return 'Invalid risk profile. Must be conservative, moderate, or aggressive';
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
    if (typeof settings.investmentAmount !== 'number' || settings.investmentAmount < 0 || settings.investmentAmount > 1000000) {
      return 'Invalid investment amount. Must be between $0 and $1,000,000';
    }
    // Note: Wallet balance validation is handled client-side for real-time feedback
    // Server-side validation could be added here with wallet balance service integration
  }

  return null;
}