/**
 * User Settings Database Service - Production Ready
 * 
 * Replaces in-memory ServerUserSettingsStorage with persistent database storage
 * using Drizzle ORM for type-safe operations.
 * 
 * Features:
 * - Persistent database storage
 * - Type-safe operations with Drizzle ORM
 * - Automatic user creation on first settings save
 * - Transaction support for data consistency
 * - Error handling and logging
 */

import { eq } from 'drizzle-orm';

// Temporary minimal table definitions to avoid schema compilation issues
import { pgTable, uuid, text, timestamp, decimal, jsonb } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

// Table definitions matching existing database schema
const userSettings = pgTable('user_settings', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`).notNull(),
  walletAddress: text('wallet_address').notNull().unique(),
  riskProfile: text('risk_profile', { enum: ['Conservative', 'Balanced', 'Aggressive'] }).notNull().default('Balanced'),
  settings: jsonb('settings').notNull().default('{}'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).default(sql`now()`),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).default(sql`now()`)
});

// Database connection - simplified
const connectionConfig = {
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5432', 10),
  user: process.env.DATABASE_USER || 'postgres',
  password: process.env.DATABASE_PASSWORD || '',
  database: process.env.DATABASE_NAME || 'xorj_bot_state',
  max: 10,
  idleTimeoutMillis: 30000
};

const pool = new Pool(connectionConfig);
const db = drizzle(pool);

export interface UserSettingsApiFormat {
  walletAddress: string;
  riskProfile: 'Conservative' | 'Balanced' | 'Aggressive';
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
        riskProfile: setting.riskProfile as 'Conservative' | 'Balanced' | 'Aggressive',
        investmentAmount: setting.settings?.investmentAmount || undefined,
        lastUpdated: setting.updatedAt || new Date()
      };
      
      console.log(`✅ Settings found for ${walletAddress}: riskProfile=${result.riskProfile}`);
      return result;
      
    } catch (error) {
      console.error(`❌ Error fetching settings for ${walletAddress}:`, error);
      throw error;
    }
  }
  
  /**
   * Save user settings (creates user if needed)
   */
  static async saveUserSettings(
    walletAddress: string, 
    riskProfile: 'Conservative' | 'Balanced' | 'Aggressive',
    investmentAmount?: number
  ): Promise<UserSettingsApiFormat> {
    try {
      console.log(`💾 UserSettingsService: Saving settings for ${walletAddress}: ${riskProfile}`);
      
      return await db.transaction(async (tx) => {
        const now = new Date();
        
        // Prepare settings data
        const settingsJson = {
          investmentAmount: investmentAmount || 1000
        };
        
        const settingsData = {
          walletAddress,
          riskProfile,
          settings: settingsJson,
          updatedAt: now
        };
        
        // Upsert user settings (insert or update if exists)
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
          riskProfile,
          investmentAmount: investmentAmount,
          lastUpdated: now
        };
        
        console.log(`✅ Settings saved for ${walletAddress}: riskProfile=${riskProfile}`);
        return result;
      });
      
    } catch (error) {
      console.error(`❌ Error saving settings for ${walletAddress}:`, error);
      throw error;
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
      const usersWithSettings = await db
        .select({ walletAddress: userSettings.walletAddress })
        .from(userSettings);
      
      return usersWithSettings.map(user => user.walletAddress);
    } catch (error) {
      console.error('❌ Error fetching all users with settings:', error);
      throw error;
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
      return { riskProfile: 'Balanced', lastUpdated: new Date().toISOString() };
    }
    return {
      riskProfile: settings.riskProfile,
      lastUpdated: settings.lastUpdated.toISOString()
    };
  }
  
  static async setUserSettings(walletAddress: string, riskProfile: string): Promise<void> {
    const apiRiskProfile = riskProfile as 'Conservative' | 'Balanced' | 'Aggressive';
    await UserSettingsService.saveUserSettings(walletAddress, apiRiskProfile);
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