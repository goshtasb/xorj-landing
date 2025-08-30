/**
 * Bot States Schema Definition - Drizzle ORM
 * 
 * Defines the bot_states table for persisting Trade Execution Bot state machine states.
 * Critical for reliable bot operations and recovery after failures.
 * 
 * Features:
 * - Formal state machine state persistence
 * - Foreign key relationship to users table
 * - JSONB configuration storage for flexible state data
 * - Automatic timestamp management
 * - State history tracking for debugging
 * 
 * Requirements Addressed:
 * - 1.1: Formal State Machine - persistent state tracking
 * - 1.3: Graceful Recovery Logic - state restoration on startup
 * 
 * @see src/lib/botStateMachine.ts
 * @see PRD Section: Bot Reliability Module
 */

import { pgTable, uuid, text, boolean, jsonb, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { relations } from 'drizzle-orm';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import { users } from './users';

/**
 * Bot State Enumeration
 * 
 * Standardized state values for the formal state machine.
 * These must match the BotState enum in botStateMachine.ts
 */
export const BOT_STATES = [
  'IDLE', 
  'ANALYZING_SIGNALS', 
  'VALIDATING_RISK',
  'EXECUTING_TRADE', 
  'AWAITING_CONFIRMATION', 
  'FAILED_RETRY_PENDING',
  'PAUSED',
  'ERROR'
] as const;
export type BotState = typeof BOT_STATES[number];

/**
 * Bot Configuration Schema
 * 
 * Defines the structure of the JSONB configuration field.
 * This provides type safety for bot state data storage.
 */
export const botConfigurationSchema = z.object({
  // State machine data
  currentState: z.enum(BOT_STATES).optional(),
  lastUpdated: z.string().optional(),
  currentTradeId: z.string().optional(),
  currentJobId: z.string().optional(),
  retryCount: z.number().min(0).optional(),
  errorMessage: z.string().optional(),
  
  // State history for debugging (last 10 states)
  stateHistory: z.array(z.object({
    state: z.enum(BOT_STATES),
    event: z.string().optional(),
    timestamp: z.string(),
    metadata: z.record(z.unknown()).optional()
  })).optional(),
  
  // Bot configuration settings
  risk_profile: z.enum(['Conservative', 'Balanced', 'Aggressive']).optional(),
  max_trade_amount: z.number().positive().optional(),
  enabled: z.boolean().optional(),
  
  // Recovery settings
  max_retries: z.number().min(0).max(10).default(3).optional(),
  confirmation_timeout_ms: z.number().positive().default(30000).optional(),
  
  // Additional metadata
  customData: z.record(z.unknown()).optional()
}).strict();

export type BotConfiguration = z.infer<typeof botConfigurationSchema>;

/**
 * Bot States Table
 * 
 * Stores persistent bot state machine data for reliable operation and recovery.
 * Each user has one bot state record that tracks their bot's current lifecycle state.
 * 
 * SQL Equivalent:
 * CREATE TABLE bot_states (
 *   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 *   user_id UUID REFERENCES users(id) ON DELETE CASCADE,
 *   vault_address TEXT NOT NULL,
 *   current_state TEXT NOT NULL DEFAULT 'IDLE',
 *   enabled BOOLEAN NOT NULL DEFAULT true,
 *   configuration JSONB,
 *   last_updated TIMESTAMPTZ DEFAULT now(),
 *   created_at TIMESTAMPTZ DEFAULT now(),
 *   updated_at TIMESTAMPTZ DEFAULT now(),
 *   UNIQUE(user_id, vault_address)
 * );
 */
export const botStates = pgTable('bot_states', {
  // Primary key - auto-generated UUID
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`)
    .notNull(),
  
  // Foreign key to users table
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  
  // Vault address this bot state manages
  vaultAddress: text('vault_address')
    .notNull(),
  
  // Current state machine state
  currentState: text('current_state', { enum: BOT_STATES })
    .notNull()
    .default('IDLE'),
  
  // Whether the bot is enabled/running
  enabled: boolean('enabled')
    .notNull()
    .default(true),
  
  // Comprehensive bot configuration and state data in JSONB format
  configuration: jsonb('configuration').$type<BotConfiguration>(),
  
  // Last state update timestamp - for monitoring and recovery
  lastUpdated: timestamp('last_updated', { 
    withTimezone: true, 
    mode: 'date' 
  })
    .default(sql`now()`)
    .notNull(),
  
  // Record creation timestamp
  createdAt: timestamp('created_at', { 
    withTimezone: true, 
    mode: 'date' 
  })
    .default(sql`now()`)
    .notNull(),
  
  // Record update timestamp
  updatedAt: timestamp('updated_at', { 
    withTimezone: true, 
    mode: 'date' 
  })
    .default(sql`now()`)
    .notNull()
});

/**
 * Unique constraint to ensure one bot state per user-vault combination
 */
// Note: This would be added via migration - unique constraint on (user_id, vault_address)

/**
 * Drizzle Relations
 * 
 * Define relationships between bot_states and related tables.
 * This enables type-safe joins and cascading operations.
 */
export const botStatesRelations = relations(botStates, ({ one }) => ({
  user: one(users, {
    fields: [botStates.userId],
    references: [users.id]
  })
}));

/**
 * Zod Validation Schemas
 * 
 * Type-safe validation schemas for bot_states table operations.
 * These ensure data integrity and provide runtime validation.
 */

// Current state validation schema
const currentStateSchema = z.enum(BOT_STATES, {
  errorMap: (_issue, _ctx) => {
    return { message: `Current state must be one of: ${BOT_STATES.join(', ')}` };
  }
});

// Vault address validation schema
const vaultAddressSchema = z.string().min(32).max(64).regex(/^[A-Za-z0-9]+$/, 'Vault address must be alphanumeric');

// Insert schema - for creating new bot states
export const insertBotStateSchema = createInsertSchema(botStates, {
  vaultAddress: vaultAddressSchema,
  currentState: currentStateSchema,
  enabled: z.boolean().default(true),
  configuration: botConfigurationSchema.optional(),
  lastUpdated: z.date().optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional()
}).omit({
  id: true
});

// Select schema - for reading bot states
export const selectBotStateSchema = createSelectSchema(botStates, {
  vaultAddress: vaultAddressSchema,
  currentState: currentStateSchema,
  configuration: botConfigurationSchema.optional()
});

// Update schema - for modifying bot states
export const updateBotStateSchema = insertBotStateSchema.partial();

/**
 * TypeScript Types
 * 
 * Inferred types for TypeScript integration throughout the application.
 * These provide compile-time type safety for bot state operations.
 */
export type BotStateRecord = typeof botStates.$inferSelect;
export type NewBotState = typeof botStates.$inferInsert;
export type BotStateUpdate = Partial<NewBotState>;

/**
 * Bot State Validation Types
 * 
 * Zod-validated types for runtime type checking and API validation.
 */
export type ValidatedBotState = z.infer<typeof selectBotStateSchema>;
export type ValidatedNewBotState = z.infer<typeof insertBotStateSchema>;
export type ValidatedBotStateUpdate = z.infer<typeof updateBotStateSchema>;

/**
 * Compatibility Types
 * 
 * Types that maintain compatibility with existing bot state interfaces.
 * These bridge the gap between the state machine and database systems.
 */
export interface CompatibleBotState {
  id: string;
  userId: string;
  vaultAddress: string;
  currentState: BotState;
  enabled: boolean;
  configuration?: BotConfiguration;
  lastUpdated: Date;
  createdAt: Date;
  updatedAt: Date;
  
  // Computed fields for API responses
  isActive?: boolean;
  stateAge?: number; // milliseconds since last update
  hasError?: boolean;
}

export interface BotStateRequest {
  userId: string;
  vaultAddress: string;
  currentState?: BotState;
  enabled?: boolean;
  configuration?: Partial<BotConfiguration>;
}

/**
 * State Machine Context Types
 * 
 * Types for state machine operation integration.
 */
export interface BotStateContext {
  userId: string;
  vaultAddress: string;
  currentState: BotState;
  lastUpdated: Date;
  currentTradeId?: string;
  currentJobId?: string;
  retryCount: number;
  errorMessage?: string;
  stateHistory: Array<{
    state: BotState;
    event?: string;
    timestamp: Date;
    metadata?: Record<string, any>;
  }>;
}

/**
 * Utility Functions
 * 
 * Helper functions for bot state management, analysis, and monitoring.
 */

// Check if bot state indicates an active operation
export const isBotActive = (botState: BotStateRecord): boolean => {
  return botState.enabled && !['PAUSED', 'ERROR'].includes(botState.currentState);
};

// Check if bot state indicates an error condition
export const isBotInError = (botState: BotStateRecord): boolean => {
  return botState.currentState === 'ERROR' || 
         (botState.configuration as BotConfiguration)?.errorMessage !== undefined;
};

// Calculate time since last state update
export const getStateAge = (botState: BotStateRecord): number => {
  return Date.now() - botState.lastUpdated.getTime();
};

// Check if bot state requires attention (stuck or errored)
export const requiresAttention = (botState: BotStateRecord): boolean => {
  const stateAge = getStateAge(botState);
  const fiveMinutes = 5 * 60 * 1000;
  
  // Error state always requires attention
  if (isBotInError(botState)) return true;
  
  // States that should not persist for more than 5 minutes
  const timeoutStates: BotState[] = ['ANALYZING_SIGNALS', 'VALIDATING_RISK', 'EXECUTING_TRADE'];
  
  return timeoutStates.includes(botState.currentState as BotState) && stateAge > fiveMinutes;
};

// Convert to API format with computed fields
export const convertToApiFormat = (dbBotState: BotStateRecord): CompatibleBotState => {
  const stateAge = getStateAge(dbBotState);
  
  return {
    id: dbBotState.id,
    userId: dbBotState.userId,
    vaultAddress: dbBotState.vaultAddress,
    currentState: dbBotState.currentState as BotState,
    enabled: dbBotState.enabled,
    configuration: dbBotState.configuration || undefined,
    lastUpdated: dbBotState.lastUpdated,
    createdAt: dbBotState.createdAt,
    updatedAt: dbBotState.updatedAt,
    isActive: isBotActive(dbBotState),
    stateAge,
    hasError: isBotInError(dbBotState)
  };
};

// Convert from state machine context
export const convertFromStateContext = (context: BotStateContext): NewBotState => ({
  userId: context.userId,
  vaultAddress: context.vaultAddress,
  currentState: context.currentState,
  enabled: !['PAUSED', 'ERROR'].includes(context.currentState),
  configuration: {
    currentState: context.currentState,
    lastUpdated: context.lastUpdated.toISOString(),
    currentTradeId: context.currentTradeId,
    currentJobId: context.currentJobId,
    retryCount: context.retryCount,
    errorMessage: context.errorMessage,
    stateHistory: context.stateHistory.map(h => ({
      state: h.state,
      event: h.event,
      timestamp: h.timestamp.toISOString(),
      metadata: h.metadata
    }))
  } as BotConfiguration,
  lastUpdated: context.lastUpdated,
  createdAt: new Date(),
  updatedAt: new Date()
});

// Generate state summary for monitoring
export const getStateSummary = (botState: BotStateRecord): string => {
  const config = botState.configuration as BotConfiguration;
  const stateAge = Math.floor(getStateAge(botState) / 1000); // seconds
  
  let summary = `${botState.currentState} (${stateAge}s ago)`;
  
  if (config?.errorMessage) {
    summary += ` - ERROR: ${config.errorMessage}`;
  }
  
  if (config?.currentTradeId) {
    summary += ` - Trade: ${config.currentTradeId.substring(0, 8)}...`;
  }
  
  if (config?.retryCount && config.retryCount > 0) {
    summary += ` - Retries: ${config.retryCount}`;
  }
  
  return summary;
};