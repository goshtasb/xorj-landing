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
import { pgTable, uuid, text, timestamp, decimal } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

// Simplified table definitions for user settings
const users = pgTable('users', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`).notNull(),
  walletAddress: text('wallet_address').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).default(sql`now()`).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).default(sql`now()`).notNull()
});

const userSettings = pgTable('user_settings', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  riskProfile: text('risk_profile', { enum: ['CONSERVATIVE', 'BALANCED', 'AGGRESSIVE'] }).notNull().default('BALANCED'),
  investmentAmount: decimal('investment_amount', { precision: 20, scale: 8 }).notNull().default('1000.00'),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
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

type RiskProfile = 'CONSERVATIVE' | 'BALANCED' | 'AGGRESSIVE';

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
      
      // First, find the user by wallet address
      const user = await db
        .select()
        .from(users)
        .where(eq(users.walletAddress, walletAddress))
        .limit(1);
      
      if (user.length === 0) {
        console.log(`👤 User not found for wallet: ${walletAddress}`);
        return null;
      }
      
      // Get user settings
      const settings = await db
        .select()
        .from(userSettings)
        .where(eq(userSettings.userId, user[0].id))
        .limit(1);
      
      if (settings.length === 0) {
        console.log(`⚙️ No settings found for user: ${walletAddress}`);
        return null;
      }
      
      const setting = settings[0];
      const result: UserSettingsApiFormat = {
        walletAddress,
        riskProfile: this.convertRiskProfileToApiFormat(setting.riskProfile),
        investmentAmount: setting.investmentAmount ? parseFloat(setting.investmentAmount) : undefined,
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
        // Find or create user
        let user = await tx
          .select()
          .from(users)
          .where(eq(users.walletAddress, walletAddress))
          .limit(1);
        
        if (user.length === 0) {
          console.log(`👤 Creating new user for wallet: ${walletAddress}`);
          const newUser = await tx
            .insert(users)
            .values({
              walletAddress,
              createdAt: new Date(),
              updatedAt: new Date()
            })
            .returning();
          user = newUser;
        }
        
        const userId = user[0].id;
        const now = new Date();
        
        // Convert risk profile to database format
        const dbRiskProfile = this.convertRiskProfileToDbFormat(riskProfile);
        
        // Upsert user settings
        const settingsData = {
          userId,
          riskProfile: dbRiskProfile,
          investmentAmount: investmentAmount?.toString() || '1000.00',
          updatedAt: now
        };
        
        const savedSettings = await tx
          .insert(userSettings)
          .values(settingsData)
          .onConflictDoUpdate({
            target: userSettings.userId,
            set: {
              riskProfile: settingsData.riskProfile,
              investmentAmount: settingsData.investmentAmount,
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
        .select({ walletAddress: users.walletAddress })
        .from(users)
        .innerJoin(userSettings, eq(users.id, userSettings.userId));
      
      return usersWithSettings.map(user => user.walletAddress);
    } catch (error) {
      console.error('❌ Error fetching all users with settings:', error);
      throw error;
    }
  }
  
  /**
   * Convert database risk profile format to API format
   */
  private static convertRiskProfileToApiFormat(dbRiskProfile: RiskProfile): 'Conservative' | 'Balanced' | 'Aggressive' {
    switch (dbRiskProfile) {
      case 'CONSERVATIVE': return 'Conservative';
      case 'BALANCED': return 'Balanced';
      case 'AGGRESSIVE': return 'Aggressive';
      default: return 'Balanced';
    }
  }
  
  /**
   * Convert API risk profile format to database format
   */
  private static convertRiskProfileToDbFormat(apiRiskProfile: 'Conservative' | 'Balanced' | 'Aggressive'): RiskProfile {
    switch (apiRiskProfile) {
      case 'Conservative': return 'CONSERVATIVE';
      case 'Balanced': return 'BALANCED';
      case 'Aggressive': return 'AGGRESSIVE';
      default: return 'BALANCED';
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