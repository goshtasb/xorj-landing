/**
 * Shared Database Utilities
 * 
 * Provides common database configuration and utilities to avoid code duplication
 * and potential circular dependencies between service modules.
 * 
 * This module acts as a single source of truth for database connections
 * and common database operations across the application.
 */

import type { Pool } from 'pg';

// Shared database configuration
export const getDatabaseConfig = () => ({
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5432'),
  user: process.env.DATABASE_USER || 'aflatoongoshtasb',
  password: process.env.DATABASE_PASSWORD || '',
  database: process.env.DATABASE_NAME || 'xorj_development',
  max: 3, // Smaller pool to prevent connection exhaustion
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 5000
});

// Risk profile types and validation
export const RISK_PROFILES = ['conservative', 'moderate', 'aggressive'] as const;
export type RiskProfile = typeof RISK_PROFILES[number];

export const isValidRiskProfile = (profile: string): profile is RiskProfile => {
  return RISK_PROFILES.includes(profile as RiskProfile);
};

export const normalizeRiskProfile = (profile?: string): RiskProfile => {
  if (!profile) return 'moderate';
  const normalized = profile.toLowerCase();
  switch (normalized) {
    case 'conservative': return 'conservative';
    case 'moderate':
    case 'balanced': return 'moderate';
    case 'aggressive': return 'aggressive';
    default: return 'moderate';
  }
};

// Shared database connection cache
let sharedDbPool: Pool | null = null;
let sharedDrizzleDb: unknown = null;

/**
 * Get or create a shared database connection
 * This prevents multiple services from creating duplicate connection pools
 */
export async function getSharedDatabase() {
  if (sharedDrizzleDb && sharedDbPool) {
    return { db: sharedDrizzleDb, pool: sharedDbPool };
  }

  // Import database dependencies lazily to avoid circular imports
  const { drizzle } = await import('drizzle-orm/node-postgres');
  const { Pool } = await import('pg');
  const { eq } = await import('drizzle-orm');
  const { pgTable, uuid, text, timestamp, jsonb } = await import('drizzle-orm/pg-core');
  const { sql } = await import('drizzle-orm');

  // Create connection pool
  sharedDbPool = new Pool(getDatabaseConfig());
  sharedDrizzleDb = drizzle(sharedDbPool);

  return { 
    db: sharedDrizzleDb, 
    pool: sharedDbPool, 
    eq,
    pgTable,
    uuid,
    text,
    timestamp,
    jsonb,
    sql
  };
}

/**
 * User Settings Table Schema
 * Defined here to be shared across services
 */
export async function getUserSettingsTable() {
  // Import schema functions directly
  const { pgTable, text, timestamp, jsonb } = await import('drizzle-orm/pg-core');
  const { sql } = await import('drizzle-orm');
  
  return pgTable('user_settings', {
    id: text('id').primaryKey().default(sql`gen_random_uuid()`).notNull(),
    walletAddress: text('wallet_address').notNull().unique(),
    riskProfile: text('risk_profile', { enum: RISK_PROFILES }).notNull().default('moderate'),
    settings: jsonb('settings').notNull().default('{}'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).default(sql`now()`),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).default(sql`now()`)
  });
}

/**
 * Clean up database connections
 * Should be called during application shutdown
 */
export async function closeSharedDatabase() {
  if (sharedDbPool) {
    await sharedDbPool.end();
    sharedDrizzleDb = null;
    sharedDbPool = null;
  }
}

// Common database error handling
export class DatabaseError extends Error {
  constructor(message: string, public cause?: Error) {
    super(message);
    this.name = 'DatabaseError';
  }
}

export function handleDatabaseError(error: unknown, operation: string): never {
  console.error(`❌ Database error during ${operation}:`, error);
  
  if (error instanceof Error) {
    throw new DatabaseError(`Failed to ${operation}: ${error.message}`, error);
  }
  
  throw new DatabaseError(`Failed to ${operation}: Unknown error`);
}