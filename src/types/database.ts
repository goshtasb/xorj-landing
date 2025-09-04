/**
 * Database Models and Types
 * TypeScript interfaces for XORJ Bot State Persistence tables
 */

// Base interface for all database entities
interface BaseEntity {
  id: string;
  created_at: Date;
  updated_at: Date;
}

// Status enums for type safety
export type ScoringRunStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
export type ExecutionJobStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
export type TradeStatus = 'PENDING' | 'SUBMITTED' | 'CONFIRMED' | 'FAILED';
export type RiskProfile = 'Conservative' | 'Balanced' | 'Aggressive';

// scoring_runs table
export interface ScoringRun extends BaseEntity {
  status: ScoringRunStatus;
  started_at?: Date;
  completed_at?: Date;
  error_message?: string;
}

export interface CreateScoringRunData {
  status: ScoringRunStatus;
  started_at?: Date;
}

export interface UpdateScoringRunData {
  status?: ScoringRunStatus;
  started_at?: Date;
  completed_at?: Date;
  error_message?: string;
}

// trader_scores table
export interface TraderScore extends BaseEntity {
  run_id: string;
  wallet_address: string;
  xorj_trust_score: number;
  metrics?: Record<string, unknown>; // JSONB data
}

export interface CreateTraderScoreData {
  run_id: string;
  wallet_address: string;
  xorj_trust_score: number;
  metrics?: Record<string, unknown>;
}

// execution_jobs table
export interface ExecutionJob extends BaseEntity {
  status: ExecutionJobStatus;
  trigger_reason?: string;
  started_at?: Date;
  completed_at?: Date;
  error_message?: string;
}

export interface CreateExecutionJobData {
  status: ExecutionJobStatus;
  trigger_reason?: string;
  started_at?: Date;
}

export interface UpdateExecutionJobData {
  status?: ExecutionJobStatus;
  trigger_reason?: string;
  started_at?: Date;
  completed_at?: Date;
  error_message?: string;
}

// trades table (most critical for duplicate prevention)
export interface Trade extends BaseEntity {
  job_id: string;
  user_vault_address: string;
  client_order_id: string; // Idempotency key for preventing duplicate trades
  status: TradeStatus;
  from_token_address: string;
  to_token_address: string;
  amount_in: bigint;
  expected_amount_out: bigint;
  actual_amount_out?: bigint;
  transaction_signature?: string;
  slippage_realized?: number;
  gas_fee?: bigint;
  error_message?: string;
}

export interface CreateTradeData {
  job_id: string | null;
  user_vault_address: string;
  client_order_id: string; // Required idempotency key for duplicate prevention
  status: TradeStatus;
  from_token_address: string;
  to_token_address: string;
  amount_in: bigint;
  expected_amount_out: bigint;
}

export interface UpdateTradeData {
  status?: TradeStatus;
  actual_amount_out?: bigint;
  transaction_signature?: string;
  slippage_realized?: number;
  gas_fee?: bigint;
  error_message?: string;
}

// user_settings table (replacing in-memory storage)
export interface UserSettings extends BaseEntity {
  wallet_address: string;
  risk_profile: RiskProfile;
  settings: {
    maxDrawdownLimit?: number;
    positionSizePercent?: number;
    stopLossEnabled?: boolean;
    takeProfitEnabled?: boolean;
    [key: string]: unknown;
  };
}

export interface CreateUserSettingsData {
  wallet_address: string;
  risk_profile?: RiskProfile;
  settings?: Record<string, unknown>;
}

export interface UpdateUserSettingsData {
  risk_profile?: RiskProfile;
  settings?: Record<string, unknown>;
}

// bot_states table (replacing in-memory bot states)
export interface BotState extends BaseEntity {
  user_id: string;
  enabled: boolean;
  last_updated: Date;
  configuration: {
    risk_profile?: string;
    max_trade_amount?: number;
    enabled?: boolean;
    [key: string]: unknown;
  };
}

export interface CreateBotStateData {
  user_id: string;
  enabled?: boolean;
  configuration?: Record<string, unknown>;
}

export interface UpdateBotStateData {
  enabled?: boolean;
  configuration?: Record<string, unknown>;
}

// Query result types for complex queries
export interface LatestTraderScore {
  wallet_address: string;
  xorj_trust_score: number;
  metrics?: Record<string, unknown>;
  created_at: Date;
}

export interface TradeSummary {
  user_vault_address: string;
  total_trades: number;
  successful_trades: number;
  failed_trades: number;
  pending_trades: number;
  total_volume_in: bigint;
  total_volume_out: bigint;
  average_slippage: number;
  success_rate: number;
}

export interface JobSummary {
  job_id: string;
  status: ExecutionJobStatus;
  total_trades: number;
  successful_trades: number;
  failed_trades: number;
  started_at?: Date;
  completed_at?: Date;
}

// API response types that match existing endpoints
export interface BotStatusResponse {
  user_id: string;
  status: 'active' | 'stopped' | 'error';
  last_execution?: string;
  configuration: {
    risk_profile?: string;
    enabled: boolean;
    max_trade_amount?: number;
  };
  performance?: {
    total_trades: number;
    successful_trades: number;
    success_rate: number;
  };
}

// Database service response types
export interface ServiceResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  code?: string; // Error codes like 'DUPLICATE_TRADE' for specific error handling
}

// Query options and filters
export interface QueryOptions {
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDirection?: 'ASC' | 'DESC';
}

export interface TradeFilters extends QueryOptions {
  user_vault_address?: string;
  status?: TradeStatus;
  from_date?: Date;
  to_date?: Date;
  job_id?: string;
}

export interface ScoringRunFilters extends QueryOptions {
  status?: ScoringRunStatus;
  from_date?: Date;
  to_date?: Date;
}

// Database utility types
export type DatabaseEntity = ScoringRun | TraderScore | ExecutionJob | Trade | UserSettings | BotState;

// Error types
export interface DatabaseError extends Error {
  code?: string;
  constraint?: string;
  table?: string;
}

// CRITICAL: System-level errors for fail-fast behavior
export class CriticalDatabaseError extends Error {
  public readonly isCritical = true;
  public readonly timestamp: Date;
  public readonly errorCode: string;
  
  constructor(message: string, errorCode: 'DB_UNAVAILABLE' | 'CONNECTION_FAILED' | 'TRANSACTION_FAILED' = 'DB_UNAVAILABLE') {
    super(`CRITICAL DATABASE ERROR: ${message}`);
    this.name = 'CriticalDatabaseError';
    this.errorCode = errorCode;
    this.timestamp = new Date();
  }
}

export class SystemFailureError extends Error {
  public readonly isSystemFailure = true;
  public readonly timestamp: Date;
  public readonly failureReason: string;
  
  constructor(reason: string, message: string) {
    super(`SYSTEM FAILURE - ${reason}: ${message}`);
    this.name = 'SystemFailureError';
    this.failureReason = reason;
    this.timestamp = new Date();
  }
}

// Transaction callback type
export type TransactionCallback<T> = (client: unknown) => Promise<T>;

// Export everything for easy imports
export {
  BaseEntity,
  DatabaseEntity,
  DatabaseError,
  TransactionCallback
};