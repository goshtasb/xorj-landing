/**
 * User Settings Database Service - Production Ready
 * 
 * Replaces in-memory ServerUserSettingsStorage with persistent database storage
 * using Drizzle ORM for type-safe operations.
 * 
 * REFACTORED: Uses shared database utilities to eliminate potential circular dependencies
 * and follow industry-standard modular architecture patterns.
 * 
 * Features:
 * - Persistent database storage
 * - Type-safe operations with Drizzle ORM
 * - Automatic user creation on first settings save
 * - Transaction support for data consistency
 * - Error handling and logging
 * - Shared database connection pool
 */

import { 
  getSharedDatabase, 
  getUserSettingsTable, 
  normalizeRiskProfile,
  handleDatabaseError,
  type RiskProfile 
} from './shared/database-utils';
import { eq } from 'drizzle-orm';

export interface UserSettingsApiFormat {
  walletAddress: string;
  riskProfile: RiskProfile;
  investmentAmount?: number;
  lastUpdated: Date;
}

export class UserSettingsService {
  
  /**
   * Get user settings by wallet address
   * Returns null if user has no saved settings
   */
  static async getUserSettings(walletAddress: string): Promise<UserSettingsApiFormat | null> {
    try {
      console.log(`🔍 UserSettingsService: Fetching settings for ${walletAddress}`);
      
      const { db } = await getSharedDatabase();
      const userSettings = await getUserSettingsTable();
      
      // Get user settings directly from user_settings table
      const settings = await db
        .select()
        .from(userSettings)
        .where(eq(userSettings.walletAddress, walletAddress))
        .limit(1);
      
      if (settings.length === 0) {
        console.log(`⚙️ No settings found for user: ${walletAddress}`);
        return null;
      }
      
      const setting = settings[0];
      const result: UserSettingsApiFormat = {
        walletAddress,
        riskProfile: normalizeRiskProfile(setting.riskProfile),
        investmentAmount: (setting.settings as Record<string, unknown>)?.investmentAmount as number | undefined,
        lastUpdated: setting.updatedAt || new Date()
      };
      
      console.log(`✅ Settings found for ${walletAddress}: riskProfile=${result.riskProfile}`);
      return result;
      
    } catch (error) {
      // In development mode, suppress connection pool errors to reduce noise
      if (process.env.NODE_ENV === 'development' && (error as Error)?.message?.includes('too many clients')) {
        console.warn(`⚠️ Database connection pool exhausted for ${walletAddress} (development mode)`);
      } else {
        console.error(`❌ Error fetching settings for ${walletAddress}:`, error);
      }
      throw error;
    }
  }
  
  /**
   * Save user settings (creates user if needed)
   */
  static async saveUserSettings(
    walletAddress: string, 
    riskProfile: RiskProfile,
    investmentAmount?: number
  ): Promise<UserSettingsApiFormat> {
    try {
      console.log(`💾 UserSettingsService: Saving settings for ${walletAddress}: ${riskProfile}`);
      
      const { db } = await getSharedDatabase();
      const userSettings = await getUserSettingsTable();
      
      return await db.transaction(async (tx) => {
        const now = new Date();
        
        // Prepare settings data - store investment amount if provided (including 0)
        const settingsJson = investmentAmount !== undefined && investmentAmount !== null
          ? { investmentAmount: investmentAmount }
          : {};
        
        const settingsData = {
          walletAddress,
          riskProfile: normalizeRiskProfile(riskProfile),
          settings: settingsJson,
          updatedAt: now
        };
        
        // Upsert user settings (insert or update if exists)
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const savedSettings = await tx
          .insert(userSettings)
          .values({
            ...settingsData,
            createdAt: now
          })
          .onConflictDoUpdate({
            target: userSettings.walletAddress,
            set: {
              riskProfile: settingsData.riskProfile,
              settings: settingsData.settings,
              updatedAt: now
            }
          })
          .returning();
        
        const result: UserSettingsApiFormat = {
          walletAddress,
          riskProfile: normalizeRiskProfile(riskProfile),
          investmentAmount: investmentAmount,
          lastUpdated: now
        };
        
        console.log(`✅ Settings saved for ${walletAddress}: riskProfile=${result.riskProfile}`);
        return result;
      });
      
    } catch (error) {
      return handleDatabaseError(error, `save settings for ${walletAddress}`);
    }
  }
  
  /**
   * Check if user has saved settings
   */
  static async hasUserSettings(walletAddress: string): Promise<boolean> {
    try {
      const settings = await this.getUserSettings(walletAddress);
      return settings !== null;
    } catch (error) {
      console.error(`❌ Error checking settings for ${walletAddress}:`, error);
      return false;
    }
  }
  
  /**
   * Get all users with settings (for admin purposes)
   */
  static async getAllUsersWithSettings(): Promise<string[]> {
    try {
      const { db } = await getSharedDatabase();
      const userSettings = await getUserSettingsTable();
      
      const usersWithSettings = await db
        .select({ walletAddress: userSettings.walletAddress })
        .from(userSettings);
      
      return usersWithSettings.map(user => user.walletAddress);
    } catch (error) {
      return handleDatabaseError(error, 'fetch all users with settings');
    }
  }
  
}

/**
 * Legacy compatibility wrapper
 * Provides the same interface as the old ServerUserSettingsStorage for backward compatibility
 */
export class ServerUserSettingsStorage {
  static async getUserSettings(walletAddress: string): Promise<{ riskProfile: string; lastUpdated: string }> {
    const settings = await UserSettingsService.getUserSettings(walletAddress);
    if (!settings) {
      return { riskProfile: 'moderate', lastUpdated: new Date().toISOString() };
    }
    return {
      riskProfile: settings.riskProfile,
      lastUpdated: settings.lastUpdated.toISOString()
    };
  }
  
  static async setUserSettings(walletAddress: string, riskProfile: string): Promise<void> {
    const normalizedProfile = normalizeRiskProfile(riskProfile);
    await UserSettingsService.saveUserSettings(walletAddress, normalizedProfile);
  }
  
  static async getAllSettings(): Promise<Record<string, { riskProfile: string; lastUpdated: string }>> {
    try {
      const walletAddresses = await UserSettingsService.getAllUsersWithSettings();
      const result: Record<string, { riskProfile: string; lastUpdated: string }> = {};
      
      for (const walletAddress of walletAddresses) {
        const settings = await UserSettingsService.getUserSettings(walletAddress);
        if (settings) {
          result[walletAddress] = {
            riskProfile: settings.riskProfile,
            lastUpdated: settings.lastUpdated.toISOString()
          };
        }
      }
      
      return result;
    } catch (error) {
      console.error('❌ Error in getAllSettings:', error);
      return {};
    }
  }
}