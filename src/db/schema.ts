/**
 * Unified Database Schema - Source of Truth
 * 
 * This file serves as the single source of truth for all database schema definitions
 * and type exports in the XORJ Trading Bot application. It consolidates all individual
 * schema files and provides a centralized interface for database operations.
 * 
 * Requirements Addressed:
 * - 4.1: Drizzle Schema Mirroring - Complete TypeScript schema definitions
 * - 4.3: Type-Safe Queries - 100% type-safe database operations
 * 
 * Architecture:
 * - Exports all table definitions for Drizzle query builder
 * - Provides unified type definitions for the entire application
 * - Maintains compatibility with existing API endpoints
 * - Enables type-safe database operations throughout the codebase
 * 
 * @see PRD Section: Data Access Layer (DAL) Requirements
 * @see drizzle.config.ts
 */

// =============================================================================
// TABLE DEFINITIONS - Source of Truth for Application Types
// =============================================================================

// User Management Tables
export { users, insertUserSchema, selectUserSchema, updateUserSchema } from './schema/users';
export { userSettings, insertUserSettingsSchema, selectUserSettingsSchema, updateUserSettingsSchema } from './schema/userSettings';

// Import for ValidationSchemas
import { insertUserSchema, selectUserSchema, updateUserSchema } from './schema/users';
import { insertUserSettingsSchema, selectUserSettingsSchema, updateUserSettingsSchema, RISK_PROFILES } from './schema/userSettings';
import { insertScoringRunSchema, selectScoringRunSchema, updateScoringRunSchema, SCORING_RUN_STATUSES } from './schema/scoringRuns';
import { insertTraderScoreSchema, selectTraderScoreSchema, updateTraderScoreSchema } from './schema/traderScores';
import { insertBotStateSchema, selectBotStateSchema, updateBotStateSchema } from './schema/botStates';
import { insertExecutionJobSchema, selectExecutionJobSchema, updateExecutionJobSchema, EXECUTION_JOB_STATUSES } from './schema/executionJobs';
import { insertTradeSchema, selectTradeSchema, updateTradeSchema, TRADE_STATUSES, TRADE_SIDES } from './schema/trades';
import { insertSwapHistorySchema, selectSwapHistorySchema, updateSwapHistorySchema } from './schema/swapHistory';
import { insertWaitlistSignupSchema, selectWaitlistSignupSchema, updateWaitlistSignupSchema, WAITLIST_STATUSES, SIGNUP_SOURCES } from './schema/waitlistSignups';

// Trading Intelligence Tables
export { scoringRuns, insertScoringRunSchema, selectScoringRunSchema, updateScoringRunSchema } from './schema/scoringRuns';
export { traderScores, insertTraderScoreSchema, selectTraderScoreSchema, updateTraderScoreSchema } from './schema/traderScores';

// Trade Execution Tables
export { executionJobs, insertExecutionJobSchema, selectExecutionJobSchema, updateExecutionJobSchema } from './schema/executionJobs';
export { trades, insertTradeSchema, selectTradeSchema, updateTradeSchema } from './schema/trades';
export { botStates, insertBotStateSchema, selectBotStateSchema, updateBotStateSchema } from './schema/botStates';

// Data Pipeline Tables
export { swapHistory } from './schema/swapHistory';

// Marketing and Growth Tables
export { waitlistSignups, insertWaitlistSignupSchema, selectWaitlistSignupSchema, updateWaitlistSignupSchema } from './schema/waitlistSignups';

// =============================================================================
// DRIZZLE RELATIONS - Enable Type-Safe Joins
// =============================================================================

export {
  usersRelations,
  userSettingsRelationsUnified,
  scoringRunsRelationsUnified,
  traderScoresRelationsUnified,
  executionJobsRelationsUnified,
  tradesRelationsUnified,
  botStatesRelations
} from './relations';

// =============================================================================
// TYPESCRIPT TYPES - Inferred from Drizzle Schemas
// =============================================================================

// User Management Types
export type {
  User,
  NewUser,
  UserUpdate,
  ValidatedUser,
  ValidatedNewUser,
  ValidatedUserUpdate
} from './schema/users';

export type {
  UserSettings,
  NewUserSettings,
  UserSettingsUpdate,
  ValidatedUserSettings,
  ValidatedNewUserSettings,
  ValidatedUserSettingsUpdate,
  RiskProfile,
  CompatibleUserSettings
} from './schema/userSettings';

// Trading Intelligence Types
export type {
  ScoringRun,
  NewScoringRun,
  ScoringRunUpdate,
  ValidatedScoringRun,
  ValidatedNewScoringRun,
  ValidatedScoringRunUpdate,
  ScoringRunStatus,
  CompatibleScoringRun
} from './schema/scoringRuns';

export type {
  TraderScore,
  NewTraderScore,
  TraderScoreUpdate,
  ValidatedTraderScore,
  ValidatedNewTraderScore,
  ValidatedTraderScoreUpdate,
  TraderMetrics,
  CompatibleTraderScore,
  RankedTrader,
  LatestTraderScore,
  TraderScoreHistory
} from './schema/traderScores';

// Trade Execution Types
export type {
  ExecutionJob,
  NewExecutionJob,
  ExecutionJobUpdate,
  ValidatedExecutionJob,
  ValidatedNewExecutionJob,
  ValidatedExecutionJobUpdate,
  ExecutionJobStatus,
  JobParameters,
  CompatibleExecutionJob,
  BotJobRequest,
  JobQueueStats,
  JobBatchRequest
} from './schema/executionJobs';

export type {
  Trade,
  NewTrade,
  TradeUpdate,
  ValidatedTrade,
  ValidatedNewTrade,
  ValidatedTradeUpdate,
  TradeStatus,
  TradeSide,
  TradeData,
  CompatibleTrade,
  TradeRequest,
  PortfolioPosition,
  TradingPerformance
} from './schema/trades';

// Data Pipeline Types
export type {
  SwapHistory,
  NewSwapHistory
} from './schema/swapHistory';

// Marketing and Growth Types
export type {
  WaitlistSignup,
  NewWaitlistSignup,
  WaitlistSignupUpdate,
  ValidatedWaitlistSignup,
  ValidatedNewWaitlistSignup,
  ValidatedWaitlistSignupUpdate,
  WaitlistStatus,
  SignupSource,
  CompatibleWaitlistSignup,
  WaitlistSignupRequest,
  WaitlistAnalytics,
  ReferralAnalytics
} from './schema/waitlistSignups';

// =============================================================================
// ENUMERATION CONSTANTS - For Application Logic
// =============================================================================

export { RISK_PROFILES } from './schema/userSettings';
export { SCORING_RUN_STATUSES } from './schema/scoringRuns';
export { EXECUTION_JOB_STATUSES } from './schema/executionJobs';
export { TRADE_STATUSES, TRADE_SIDES } from './schema/trades';
export { WAITLIST_STATUSES, SIGNUP_SOURCES } from './schema/waitlistSignups';

// =============================================================================
// UTILITY FUNCTIONS - Type-Safe Data Operations
// =============================================================================

// User Management Utilities
export { convertToApiFormat as convertUserSettingsToApi, convertFromApiFormat as convertUserSettingsFromApi } from './schema/userSettings';

// Trading Intelligence Utilities
export { 
  calculateRunDuration, 
  isTerminalStatus as isScoringRunTerminal, 
  isActiveRun as isActiveScoringRun,
  convertToApiFormat as convertScoringRunToApi
} from './schema/scoringRuns';

export {
  calculatePercentile,
  determineScoreTrend,
  convertToApiFormat as convertTraderScoreToApi,
  convertToRankedFormat as convertToRankedTrader
} from './schema/traderScores';

// Trade Execution Utilities
export {
  calculateJobDuration,
  isTerminalStatus as isExecutionJobTerminal,
  isActiveJob as isActiveExecutionJob,
  validateJobParameters,
  convertToApiFormat as convertExecutionJobToApi,
  convertFromBotFormat as convertExecutionJobFromBot
} from './schema/executionJobs';

export {
  calculateTradeValue,
  calculateTradeFees,
  isDuplicateTrade,
  validateTradeForDuplication,
  convertToApiFormat as convertTradeToApi,
  convertFromTradingSystem as convertTradeFromSystem,
  groupTradesBySymbol,
  calculatePosition
} from './schema/trades';

// Marketing and Growth Utilities
export {
  calculateWaitingTime,
  isAllowedEmailDomain,
  validateReferralCode,
  generateReferralCode,
  convertToApiFormat as convertWaitlistSignupToApi,
  convertFromSignupForm as convertWaitlistSignupFromForm,
  groupSignupsBySource,
  calculateConversionMetrics,
  findDuplicateSignups
} from './schema/waitlistSignups';

// =============================================================================
// SCHEMA VALIDATION - Runtime Type Checking
// =============================================================================

/**
 * Comprehensive validation schemas for all database operations.
 * These ensure data integrity and type safety at runtime.
 */
export const ValidationSchemas = {
  // User Management
  insertUser: insertUserSchema,
  selectUser: selectUserSchema,
  updateUser: updateUserSchema,
  insertUserSettings: insertUserSettingsSchema,
  selectUserSettings: selectUserSettingsSchema,
  updateUserSettings: updateUserSettingsSchema,
  
  // Trading Intelligence
  insertScoringRun: insertScoringRunSchema,
  selectScoringRun: selectScoringRunSchema,
  updateScoringRun: updateScoringRunSchema,
  insertTraderScore: insertTraderScoreSchema,
  selectTraderScore: selectTraderScoreSchema,
  updateTraderScore: updateTraderScoreSchema,
  
  // Trade Execution
  insertExecutionJob: insertExecutionJobSchema,
  selectExecutionJob: selectExecutionJobSchema,
  updateExecutionJob: updateExecutionJobSchema,
  insertTrade: insertTradeSchema,
  selectTrade: selectTradeSchema,
  updateTrade: updateTradeSchema,
  
  // Marketing and Growth
  insertWaitlistSignup: insertWaitlistSignupSchema,
  selectWaitlistSignup: selectWaitlistSignupSchema,
  updateWaitlistSignup: updateWaitlistSignupSchema
} as const;

// =============================================================================
// TYPE-SAFE TABLE REFERENCES - For Query Builder
// =============================================================================

/**
 * Consolidated table references for use with Drizzle query builder.
 * This ensures 100% type safety for all database operations.
 * 
 * Usage Example:
 * ```typescript
 * import { db, Tables } from '@/db/schema';
 * 
 * // Type-safe insert operation
 * const newTrade = await db.insert(Tables.trades).values({
 *   userId: 'uuid-here',
 *   symbol: 'SOL/USDC',
 *   side: 'BUY',
 *   quantity: 10.5,
 *   status: 'PENDING'
 * }).returning();
 * ```
 */
// Import table definitions for Tables object
import { users } from './schema/users';
import { userSettings } from './schema/userSettings';
import { scoringRuns } from './schema/scoringRuns';
import { traderScores } from './schema/traderScores';
import { executionJobs } from './schema/executionJobs';
import { trades } from './schema/trades';
import { botStates } from './schema/botStates';
import { swapHistory } from './schema/swapHistory';
import { waitlistSignups } from './schema/waitlistSignups';

export const Tables = {
  users,
  userSettings,
  scoringRuns,
  traderScores,
  executionJobs,
  trades,
  botStates,
  swapHistory,
  waitlistSignups
} as const;

// =============================================================================
// DATABASE SCHEMA METADATA - For Development and Debugging
// =============================================================================

/**
 * Schema metadata for development tools and debugging.
 * Provides information about table structure and relationships.
 */
export const SchemaMetadata = {
  version: '1.0.0',
  createdAt: new Date('2024-01-01'),
  lastModified: new Date(),
  
  tables: {
    users: {
      primaryKey: 'id',
      uniqueConstraints: ['wallet_address'],
      relationships: ['userSettings', 'executionJobs', 'trades']
    },
    userSettings: {
      primaryKey: 'user_id',
      foreignKeys: ['user_id -> users.id'],
      relationships: ['user']
    },
    scoringRuns: {
      primaryKey: 'id',
      relationships: ['traderScores']
    },
    traderScores: {
      primaryKey: 'id',
      foreignKeys: ['run_id -> scoring_runs.id'],
      indexes: ['wallet_address'],
      relationships: ['scoringRun']
    },
    executionJobs: {
      primaryKey: 'id',
      foreignKeys: ['user_id -> users.id'],
      relationships: ['user', 'trades']
    },
    trades: {
      primaryKey: 'id',
      foreignKeys: ['job_id -> execution_jobs.id', 'user_id -> users.id'],
      uniqueConstraints: ['transaction_hash'],
      indexes: ['symbol', 'user_id', 'status'],
      relationships: ['user', 'executionJob']
    },
    waitlistSignups: {
      primaryKey: 'id',
      uniqueConstraints: ['email'],
      indexes: ['status', 'signup_source']
    }
  },
  
  enumerations: {
    RiskProfile: RISK_PROFILES,
    ScoringRunStatus: SCORING_RUN_STATUSES,
    ExecutionJobStatus: EXECUTION_JOB_STATUSES,
    TradeStatus: TRADE_STATUSES,
    TradeSide: TRADE_SIDES,
    WaitlistStatus: WAITLIST_STATUSES,
    SignupSource: SIGNUP_SOURCES
  }
} as const;

// =============================================================================
// COMPATIBILITY LAYER - Bridge to Existing APIs
// =============================================================================

/**
 * Compatibility layer that bridges new Drizzle types with existing API interfaces.
 * This ensures seamless integration with current codebase without breaking changes.
 */
export const CompatibilityLayer = {
  // Type converters for API responses
  convertToApi: {
    user: (user: User) => user,
    userSettings: (userSettings: UserSettings) => userSettings,
    scoringRun: (scoringRun: ScoringRun) => scoringRun,
    traderScore: (traderScore: TraderScore) => traderScore,
    executionJob: (executionJob: ExecutionJob) => executionJob,
    trade: (trade: Trade) => trade,
    waitlistSignup: (waitlistSignup: WaitlistSignup) => waitlistSignup
  },
  
  // Type converters for API requests
  convertFromApi: {
    userSettings: (userSettings: UserSettings) => userSettings,
    executionJob: (executionJob: ExecutionJob) => executionJob,
    trade: (trade: Trade) => trade,
    waitlistSignup: (waitlistSignup: WaitlistSignup) => waitlistSignup
  }
} as const;