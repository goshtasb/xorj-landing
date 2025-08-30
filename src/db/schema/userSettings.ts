/**
 * User Settings Schema Definition - Drizzle ORM
 * 
 * Defines the user_settings table that stores user-configurable preferences
 * such as risk profiles and trading parameters for the XORJ Trading Bot.
 * 
 * Features:
 * - Foreign key relationship to users table
 * - Validated risk profile enumeration
 * - Automatic timestamp management
 * - Cascade delete for data integrity
 * 
 * Compatible with existing user settings API endpoints.
 * 
 * @see PRD Section: Unified Database Schema Definition
 * @see src/app/api/user/settings/route.ts
 */

import { pgTable, uuid, text, timestamp, decimal } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import { users } from './users';

/**
 * Risk Profile Enumeration
 * 
 * Standardized risk profiles that match the existing API and business logic.
 * These values are validated at both database and application levels.
 */
export const RISK_PROFILES = ['CONSERVATIVE', 'BALANCED', 'AGGRESSIVE'] as const;
export type RiskProfile = typeof RISK_PROFILES[number];

/**
 * User Settings Table
 * 
 * Stores user-configurable settings with foreign key relationship to users.
 * Uses the user_id as primary key for 1:1 relationship with users table.
 * 
 * SQL Equivalent:
 * CREATE TABLE user_settings (
 *   user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 *   risk_profile TEXT NOT NULL DEFAULT 'BALANCED',
 *   updated_at TIMESTAMPTZ
 * );
 */
export const userSettings = pgTable('user_settings', {
  // Primary key and foreign key to users table
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  
  // Risk profile setting - validated enum
  riskProfile: text('risk_profile', { enum: RISK_PROFILES })
    .notNull()
    .default('BALANCED'),
  
  // Investment amount for trading - decimal with high precision
  investmentAmount: decimal('investment_amount', { precision: 20, scale: 8 })
    .notNull()
    .default('1000.00'),
  
  // Last update timestamp - manually managed for tracking changes
  updatedAt: timestamp('updated_at', { 
    withTimezone: true, 
    mode: 'date' 
  })
});

/**
 * Drizzle Relations
 * 
 * Define the relationship between user_settings and users tables.
 * This enables type-safe joins and nested queries.
 */
export const userSettingsRelations = relations(userSettings, ({ one }) => ({
  user: one(users, {
    fields: [userSettings.userId],
    references: [users.id]
  })
}));

/**
 * Zod Validation Schemas
 * 
 * Type-safe validation schemas for user_settings table operations.
 * These integrate with the existing API validation logic.
 */

// Risk profile validation schema
const riskProfileSchema = z.enum(RISK_PROFILES, {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  errorMap: (_issue, _ctx) => {
    return { message: `Risk profile must be one of: ${RISK_PROFILES.join(', ')}` };
  }
});

// Investment amount validation schema
const investmentAmountSchema = z.string().or(z.number()).pipe(
  z.coerce.number().min(1, "Investment amount must be at least $1")
    .max(1000000, "Investment amount cannot exceed $1,000,000")
    .refine(val => Number.isFinite(val), "Investment amount must be a valid number")
);

// Insert schema - for creating new user settings
export const insertUserSettingsSchema = createInsertSchema(userSettings, {
  riskProfile: riskProfileSchema,
  investmentAmount: investmentAmountSchema,
  updatedAt: z.date().optional()
}).omit({
  // userId is handled by the application logic
});

// Select schema - for reading user settings
export const selectUserSettingsSchema = createSelectSchema(userSettings, {
  riskProfile: riskProfileSchema,
  investmentAmount: investmentAmountSchema
});

// Update schema - for modifying user settings
export const updateUserSettingsSchema = insertUserSettingsSchema.partial();

/**
 * TypeScript Types
 * 
 * Inferred types for TypeScript integration throughout the application.
 * These maintain compatibility with existing UserSettings interfaces.
 */
export type UserSettings = typeof userSettings.$inferSelect;
export type NewUserSettings = typeof userSettings.$inferInsert;
export type UserSettingsUpdate = Partial<NewUserSettings>;

/**
 * User Settings Validation Types
 * 
 * Zod-validated types for runtime type checking and API validation.
 * These integrate seamlessly with existing API endpoints.
 */
export type ValidatedUserSettings = z.infer<typeof selectUserSettingsSchema>;
export type ValidatedNewUserSettings = z.infer<typeof insertUserSettingsSchema>;
export type ValidatedUserSettingsUpdate = z.infer<typeof updateUserSettingsSchema>;

/**
 * Compatibility Types
 * 
 * Types that maintain compatibility with existing codebase interfaces.
 * These bridge the gap between old and new type systems.
 */
export interface CompatibleUserSettings {
  userId: string;
  riskProfile: 'Conservative' | 'Balanced' | 'Aggressive'; // Existing API format
  investmentAmount?: number; // Investment amount in USD
  updatedAt?: Date;
}

/**
 * Type Conversion Utilities
 * 
 * Helper functions to convert between database and API formats.
 * These ensure seamless integration with existing endpoints.
 */
export const convertToApiFormat = (dbSettings: UserSettings): CompatibleUserSettings => ({
  userId: dbSettings.userId,
  riskProfile: dbSettings.riskProfile.charAt(0).toUpperCase() + 
               dbSettings.riskProfile.slice(1).toLowerCase() as 'Conservative' | 'Balanced' | 'Aggressive',
  investmentAmount: dbSettings.investmentAmount ? parseFloat(dbSettings.investmentAmount) : undefined,
  updatedAt: dbSettings.updatedAt || undefined
});

export const convertFromApiFormat = (apiSettings: CompatibleUserSettings): NewUserSettings => ({
  userId: apiSettings.userId,
  riskProfile: apiSettings.riskProfile.toUpperCase() as RiskProfile,
  investmentAmount: apiSettings.investmentAmount?.toString() || '1000.00',
  updatedAt: apiSettings.updatedAt || new Date()
});