/**
 * Bot State Persistence Service
 * Database service layer for XORJ bot state management
 * Implements the PRD requirements for stateless bot operations
 */

import { query, transaction } from './database';
// import { mockDatabaseService } from './mockDatabase'; // Unused
import { CriticalDatabaseError } from '../types/database';
import {
  ScoringRun,
  CreateScoringRunData,
  UpdateScoringRunData,
  TraderScore,
  CreateTraderScoreData,
  ExecutionJob,
  CreateExecutionJobData,
  UpdateExecutionJobData,
  Trade,
  CreateTradeData,
  // UpdateTradeData, // Unused
  BotState,
  CreateBotStateData,
  UpdateBotStateData,
  UserSettings,
  CreateUserSettingsData,
  UpdateUserSettingsData,
  ServiceResponse,
  BotStatusResponse,
  TradeFilters,
  ScoringRunFilters,
  LatestTraderScore,
  // TradeSummary, // Unused
  // JobSummary // Unused
} from '../types/database';

/**
 * SCORING RUNS SERVICE
 * Manages Quantitative Engine analysis jobs
 */
export class ScoringRunService {
  /**
   * FR-1.1: Create a new scoring run with PENDING status
   */
  static async create(data: CreateScoringRunData): Promise<ServiceResponse<ScoringRun>> {
    try {
      const result = await query<ScoringRun>(`
        INSERT INTO scoring_runs (status, started_at)
        VALUES ($1, $2)
        RETURNING *
      `, [data.status, data.started_at || null]);

      return {
        success: true,
        data: result.rows[0],
        message: 'Scoring run created successfully'
      };
    } catch {
      // CRITICAL: Database errors should bubble up as system failures
      if (error instanceof CriticalDatabaseError) {
        console.error('🚨 CRITICAL DATABASE ERROR - System entering fail-safe mode:');
        throw error; // Re-throw to halt all operations
      }
      
      console.error('❌ Error creating scoring run:');
      return {
        success: false,
        error: 'Unknown error'
      };
    }
  }

  /**
   * FR-1.3: Update scoring run status and completion data
   */
  static async update(id: string, data: UpdateScoringRunData): Promise<ServiceResponse<ScoringRun>> {
    try {
      const result = await query<ScoringRun>(`
        UPDATE scoring_runs 
        SET status = COALESCE($2, status),
            started_at = COALESCE($3, started_at),
            completed_at = COALESCE($4, completed_at),
            error_message = COALESCE($5, error_message),
            updated_at = now()
        WHERE id = $1
        RETURNING *
      `, [id, data.status, data.started_at, data.completed_at, data.error_message]);

      if (result.rows.length === 0) {
        return {
          success: false,
          error: 'Scoring run not found'
        };
      }

      return {
        success: true,
        data: result.rows[0],
        message: 'Scoring run updated successfully'
      };
    } catch {
      console.error('❌ Error updating scoring run:');
      return {
        success: false,
        error: 'Unknown error'
      };
    }
  }

  /**
   * Get the most recent completed scoring run
   */
  static async getLatestCompleted(): Promise<ServiceResponse<ScoringRun>> {
    try {
      const result = await query<ScoringRun>(`
        SELECT * FROM scoring_runs 
        WHERE status = 'COMPLETED'
        ORDER BY completed_at DESC 
        LIMIT 1
      `);

      return {
        success: true,
        data: result.rows[0] || null
      };
    } catch {
      console.error('❌ Error getting latest completed scoring run:');
      return {
        success: false,
        error: 'Unknown error'
      };
    }
  }

  /**
   * Get scoring runs with filters
   */
  static async getAll(filters?: ScoringRunFilters): Promise<ServiceResponse<ScoringRun[]>> {
    try {
      let whereClause = '';
      const params: unknown[] = [];
      let paramCount = 0;

      if (filters?.status) {
        whereClause += ` WHERE status = $${++paramCount}`;
        params.push(filters.status);
      }

      if (filters?.from_date) {
        whereClause += whereClause ? ' AND' : ' WHERE';
        whereClause += ` created_at >= $${++paramCount}`;
        params.push(filters.from_date);
      }

      if (filters?.to_date) {
        whereClause += whereClause ? ' AND' : ' WHERE';
        whereClause += ` created_at <= $${++paramCount}`;
        params.push(filters.to_date);
      }

      const orderBy = filters?.orderBy || 'created_at';
      const orderDirection = filters?.orderDirection || 'DESC';
      const limit = filters?.limit || 50;
      const offset = filters?.offset || 0;

      const result = await query<ScoringRun>(`
        SELECT * FROM scoring_runs 
        ${whereClause}
        ORDER BY ${orderBy} ${orderDirection}
        LIMIT $${++paramCount} OFFSET $${++paramCount}
      `, [...params, limit, offset]);

      return {
        success: true,
        data: result.rows
      };
    } catch {
      console.error('❌ Error getting scoring runs:');
      return {
        success: false,
        error: 'Unknown error'
      };
    }
  }
}

/**
 * TRADER SCORES SERVICE
 * Manages historical trader analysis results
 */
export class TraderScoreService {
  /**
   * FR-1.3: Create trader scores after completing analysis
   */
  static async createBatch(scores: CreateTraderScoreData[]): Promise<ServiceResponse<TraderScore[]>> {
    try {
      return await transaction(async (client) => {
        const results: TraderScore[] = [];
        
        for (const score of scores) {
          const result = await client.query<TraderScore>(`
            INSERT INTO trader_scores (run_id, wallet_address, xorj_trust_score, metrics)
            VALUES ($1, $2, $3, $4)
            RETURNING *
          `, [score.run_id, score.wallet_address, score.xorj_trust_score, JSON.stringify(score.metrics || {})]);
          
          results.push(result.rows[0]);
        }

        return {
          success: true,
          data: results,
          message: `Created ${results.length} trader scores`
        };
      });
    } catch {
      console.error('❌ Error creating trader scores:');
      return {
        success: false,
        error: 'Unknown error'
      };
    }
  }

  /**
   * FR-1.2: Get latest trader scores for API endpoint
   */
  static async getLatestScores(): Promise<ServiceResponse<LatestTraderScore[]>> {
    try {
      const result = await query<LatestTraderScore>(`
        SELECT DISTINCT ON (wallet_address) 
          wallet_address, 
          xorj_trust_score, 
          metrics, 
          created_at
        FROM trader_scores 
        WHERE run_id IN (
          SELECT id FROM scoring_runs WHERE status = 'COMPLETED'
        )
        ORDER BY wallet_address, created_at DESC
      `);

      return {
        success: true,
        data: result.rows
      };
    } catch {
      console.error('❌ Error getting latest trader scores:');
      return {
        success: false,
        error: 'Unknown error'
      };
    }
  }

  /**
   * Get ranked traders (top performers)
   */
  static async getRankedTraders(limit: number = 100): Promise<ServiceResponse<LatestTraderScore[]>> {
    try {
      const result = await query<LatestTraderScore>(`
        SELECT DISTINCT ON (wallet_address) 
          wallet_address, 
          xorj_trust_score, 
          metrics, 
          created_at
        FROM trader_scores 
        WHERE run_id IN (
          SELECT id FROM scoring_runs WHERE status = 'COMPLETED'
        )
        ORDER BY wallet_address, created_at DESC
      `);

      // Sort by trust score and limit results
      const rankedTraders = result.rows
        .sort((a, b) => b.xorj_trust_score - a.xorj_trust_score)
        .slice(0, limit);

      return {
        success: true,
        data: rankedTraders
      };
    } catch {
      console.error('❌ Error getting ranked traders:');
      return {
        success: false,
        error: 'Unknown error'
      };
    }
  }
}

/**
 * EXECUTION JOBS SERVICE
 * Manages Trade Execution Bot runs
 */
export class ExecutionJobService {
  /**
   * FR-2.1: Create execution job at start of execution cycle
   */
  static async create(data: CreateExecutionJobData): Promise<ServiceResponse<ExecutionJob>> {
    try {
      const result = await query<ExecutionJob>(`
        INSERT INTO execution_jobs (status, trigger_reason, started_at)
        VALUES ($1, $2, $3)
        RETURNING *
      `, [data.status, data.trigger_reason, data.started_at || null]);

      return {
        success: true,
        data: result.rows[0],
        message: 'Execution job created successfully'
      };
    } catch {
      console.error('❌ Error creating execution job:');
      return {
        success: false,
        error: 'Unknown error'
      };
    }
  }

  /**
   * Update execution job status
   */
  static async update(id: string, data: UpdateExecutionJobData): Promise<ServiceResponse<ExecutionJob>> {
    try {
      const result = await query<ExecutionJob>(`
        UPDATE execution_jobs 
        SET status = COALESCE($2, status),
            trigger_reason = COALESCE($3, trigger_reason),
            started_at = COALESCE($4, started_at),
            completed_at = COALESCE($5, completed_at),
            error_message = COALESCE($6, error_message),
            updated_at = now()
        WHERE id = $1
        RETURNING *
      `, [id, data.status, data.trigger_reason, data.started_at, data.completed_at, data.error_message]);

      if (result.rows.length === 0) {
        return {
          success: false,
          error: 'Execution job not found'
        };
      }

      return {
        success: true,
        data: result.rows[0],
        message: 'Execution job updated successfully'
      };
    } catch {
      console.error('❌ Error updating execution job:');
      return {
        success: false,
        error: 'Unknown error'
      };
    }
  }

  /**
   * Get active execution jobs
   */
  static async getActive(): Promise<ServiceResponse<ExecutionJob[]>> {
    try {
      const result = await query<ExecutionJob>(`
        SELECT * FROM execution_jobs 
        WHERE status IN ('PENDING', 'RUNNING')
        ORDER BY created_at DESC
      `);

      return {
        success: true,
        data: result.rows
      };
    } catch {
      console.error('❌ Error getting active execution jobs:');
      return {
        success: false,
        error: 'Unknown error'
      };
    }
  }
}

/**
 * TRADES SERVICE
 * Critical service for preventing duplicate trades
 */
export class TradeService {
  /**
   * FR-2.2: Create trade record with PENDING status before submission
   */
  static async create(data: CreateTradeData): Promise<ServiceResponse<Trade>> {
    try {
      const result = await query<Trade>(`
        INSERT INTO trades (
          job_id, user_vault_address, client_order_id, status, 
          from_token_address, to_token_address, 
          amount_in, expected_amount_out
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `, [
        data.job_id, 
        data.user_vault_address,
        data.client_order_id,
        data.status,
        data.from_token_address,
        data.to_token_address,
        data.amount_in.toString(),
        data.expected_amount_out.toString()
      ]);

      return {
        success: true,
        data: result.rows[0],
        message: 'Trade created successfully'
      };
    } catch (error: unknown) {
      console.error('❌ Error creating trade:');
      
      // CRITICAL: Check for specific PostgreSQL SQLSTATE error code for unique constraint violation
      // SQLSTATE 23505 = unique_violation (PostgreSQL standard, will not change)
      if (error.code === '23505' && error.constraint === 'trade_idempotency_key') {
        return {
          success: false,
          error: `Duplicate trade prevented: client_order_id ${data.client_order_id} already exists for user ${data.user_vault_address}`,
          code: 'DUPLICATE_TRADE'
        };
      }
      
      // Handle other constraint violations with proper SQLSTATE codes
      if (error.code === '23505') {
        return {
          success: false,
          error: `Database constraint violation: ${error.constraint || 'unknown constraint'}`,
          code: 'CONSTRAINT_VIOLATION'
        };
      }
      
      // Handle foreign key violations (SQLSTATE 23503)
      if (error.code === '23503') {
        return {
          success: false,
          error: `Foreign key constraint violation: ${error.detail || 'Invalid reference'}`,
          code: 'FOREIGN_KEY_VIOLATION'
        };
      }
      
      return {
        success: false,
        error: 'Unknown error'
      };
    }
  }

  /**
   * FR-2.3: Update trade after submission to Solana
   */
  static async updateToSubmitted(
    id: string, 
    transaction_signature: string
  ): Promise<ServiceResponse<Trade>> {
    try {
      const result = await query<Trade>(`
        UPDATE trades 
        SET status = 'SUBMITTED',
            transaction_signature = $2,
            updated_at = now()
        WHERE id = $1 AND status = 'PENDING'
        RETURNING *
      `, [id, transaction_signature]);

      if (result.rows.length === 0) {
        return {
          success: false,
          error: 'Trade not found or not in PENDING status'
        };
      }

      return {
        success: true,
        data: result.rows[0],
        message: 'Trade updated to SUBMITTED'
      };
    } catch {
      console.error('❌ Error updating trade to submitted:');
      return {
        success: false,
        error: 'Unknown error'
      };
    }
  }

  /**
   * FR-2.4: Update trade after on-chain confirmation
   */
  static async updateToConfirmed(
    id: string, 
    data: {
      actual_amount_out?: bigint;
      slippage_realized?: number;
      gas_fee?: bigint;
    }
  ): Promise<ServiceResponse<Trade>> {
    try {
      const result = await query<Trade>(`
        UPDATE trades 
        SET status = 'CONFIRMED',
            actual_amount_out = COALESCE($2, actual_amount_out),
            slippage_realized = COALESCE($3, slippage_realized),
            gas_fee = COALESCE($4, gas_fee),
            updated_at = now()
        WHERE id = $1 AND status = 'SUBMITTED'
        RETURNING *
      `, [
        id, 
        data.actual_amount_out?.toString(),
        data.slippage_realized,
        data.gas_fee?.toString()
      ]);

      if (result.rows.length === 0) {
        return {
          success: false,
          error: 'Trade not found or not in SUBMITTED status'
        };
      }

      return {
        success: true,
        data: result.rows[0],
        message: 'Trade confirmed successfully'
      };
    } catch {
      console.error('❌ Error confirming trade:');
      return {
        success: false,
        error: 'Unknown error'
      };
    }
  }

  /**
   * Update trade to failed status
   */
  static async updateToFailed(id: string, error_message: string): Promise<ServiceResponse<Trade>> {
    try {
      const result = await query<Trade>(`
        UPDATE trades 
        SET status = 'FAILED',
            error_message = $2,
            updated_at = now()
        WHERE id = $1
        RETURNING *
      `, [id, error_message]);

      if (result.rows.length === 0) {
        return {
          success: false,
          error: 'Trade not found'
        };
      }

      return {
        success: true,
        data: result.rows[0],
        message: 'Trade marked as failed'
      };
    } catch {
      console.error('❌ Error updating trade to failed:');
      return {
        success: false,
        error: 'Unknown error'
      };
    }
  }

  /**
   * FR-2.5: Get submitted trades for recovery on startup
   */
  static async getSubmittedTrades(): Promise<ServiceResponse<Trade[]>> {
    try {
      const result = await query<Trade>(`
        SELECT * FROM trades 
        WHERE status = 'SUBMITTED'
        ORDER BY created_at ASC
      `);

      return {
        success: true,
        data: result.rows
      };
    } catch {
      console.error('❌ Error getting submitted trades:');
      return {
        success: false,
        error: 'Unknown error'
      };
    }
  }

  /**
   * Check for potential duplicate trades
   */
  static async checkForDuplicates(data: CreateTradeData): Promise<ServiceResponse<Trade[]>> {
    try {
      const result = await query<Trade>(`
        SELECT * FROM trades 
        WHERE user_vault_address = $1 
          AND from_token_address = $2 
          AND to_token_address = $3 
          AND amount_in = $4
          AND status IN ('PENDING', 'SUBMITTED')
          AND created_at > now() - interval '1 hour'
      `, [
        data.user_vault_address,
        data.from_token_address,
        data.to_token_address,
        data.amount_in.toString()
      ]);

      return {
        success: true,
        data: result.rows
      };
    } catch {
      console.error('❌ Error checking for duplicate trades:');
      return {
        success: false,
        error: 'Unknown error'
      };
    }
  }

  /**
   * Get trades with filters
   */
  static async getAll(filters?: TradeFilters): Promise<ServiceResponse<Trade[]>> {
    // CRITICAL: No fallbacks allowed - system must have database to operate
    if (process.env.NODE_ENV === 'development' && !process.env.DATABASE_URL && !process.env.DATABASE_HOST) {
      throw new CriticalDatabaseError('Database unavailable - cannot retrieve trades without persistence layer', 'DB_UNAVAILABLE');
    }

    try {
      let whereClause = '';
      const params: unknown[] = [];
      let paramCount = 0;

      if (filters?.user_vault_address) {
        whereClause += ` WHERE user_vault_address = $${++paramCount}`;
        params.push(filters.user_vault_address);
      }

      if (filters?.status) {
        whereClause += whereClause ? ' AND' : ' WHERE';
        whereClause += ` status = $${++paramCount}`;
        params.push(filters.status);
      }

      if (filters?.job_id) {
        whereClause += whereClause ? ' AND' : ' WHERE';
        whereClause += ` job_id = $${++paramCount}`;
        params.push(filters.job_id);
      }

      if (filters?.from_date) {
        whereClause += whereClause ? ' AND' : ' WHERE';
        whereClause += ` created_at >= $${++paramCount}`;
        params.push(filters.from_date);
      }

      if (filters?.to_date) {
        whereClause += whereClause ? ' AND' : ' WHERE';
        whereClause += ` created_at <= $${++paramCount}`;
        params.push(filters.to_date);
      }

      const orderBy = filters?.orderBy || 'created_at';
      const orderDirection = filters?.orderDirection || 'DESC';
      const limit = filters?.limit || 50;
      const offset = filters?.offset || 0;

      const result = await query<Trade>(`
        SELECT * FROM trades 
        ${whereClause}
        ORDER BY ${orderBy} ${orderDirection}
        LIMIT $${++paramCount} OFFSET $${++paramCount}
      `, [...params, limit, offset]);

      return {
        success: true,
        data: result.rows
      };
    } catch {
      console.error('❌ Error getting trades:');
      return {
        success: false,
        error: 'Unknown error'
      };
    }
  }

  /**
   * Check if a trade with the given client_order_id already exists
   * CRITICAL: Uses database-level unique constraint for race condition prevention
   */
  static async findByClientOrderId(user_vault_address: string, client_order_id: string): Promise<ServiceResponse<Trade | null>> {
    try {
      const result = await query<Trade>(`
        SELECT * FROM trades 
        WHERE user_vault_address = $1 AND client_order_id = $2
        LIMIT 1
      `, [user_vault_address, client_order_id]);
      
      return {
        success: true,
        data: result.rows[0] || null,
        message: result.rows.length > 0 ? 'Trade found' : 'No trade found'
      };
    } catch {
      console.error('❌ Error finding trade by client_order_id:');
      return {
        success: false,
        error: 'Unknown error'
      };
    }
  }

  /**
   * Generate a deterministic client_order_id for idempotent trade creation
   * CRITICAL: Must be deterministic based on trade properties for proper idempotency
   * Format: SHA-256 hash of (user_vault_address + from_token + to_token + amount_in + time_window)
   */
  static generateClientOrderId(
    user_vault_address: string,
    from_token_address: string,
    to_token_address: string,
    amount_in: bigint,
    time_window_minutes: number = 5
  ): string {
    // Create deterministic time window (rounds to nearest N minutes)
    const now = new Date();
    const timeWindow = Math.floor(now.getTime() / (time_window_minutes * 60 * 1000));
    
    // Create deterministic input string
    const inputString = [
      user_vault_address,
      from_token_address,
      to_token_address,
      amount_in.toString(),
      timeWindow.toString()
    ].join('|');
    
    // Generate SHA-256 hash for deterministic idempotency
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256').update(inputString).digest('hex');
    
    // Use first 32 chars for reasonable length while maintaining uniqueness
    return `trade_${hash.substring(0, 32)}`;
  }

  /**
   * Create trade with automatic deterministic idempotency key generation
   * RECOMMENDED: Use this method instead of create() for proper duplicate prevention
   */
  static async createIdempotent(data: Omit<CreateTradeData, 'client_order_id'>): Promise<ServiceResponse<Trade>> {
    const client_order_id = this.generateClientOrderId(
      data.user_vault_address,
      data.from_token_address,
      data.to_token_address,
      data.amount_in
    );
    
    return this.create({
      ...data,
      client_order_id
    });
  }
}

/**
 * BOT STATE SERVICE
 * Replaces in-memory bot state storage
 */
export class BotStateService {
  /**
   * Get or create bot state for user
   */
  static async getOrCreate(user_id: string): Promise<ServiceResponse<BotState>> {
    // CRITICAL: No fallbacks allowed - bot state is critical for trading operations
    if (process.env.NODE_ENV === 'development' && !process.env.DATABASE_URL && !process.env.DATABASE_HOST) {
      throw new CriticalDatabaseError('Database unavailable - cannot manage bot state without persistence layer', 'DB_UNAVAILABLE');
    }

    try {
      // Try to get existing state
      const existing = await query<BotState>(`
        SELECT * FROM bot_states WHERE user_id = $1
      `, [user_id]);

      if (existing.rows.length > 0) {
        return {
          success: true,
          data: existing.rows[0]
        };
      }

      // Create default state
      const result = await query<BotState>(`
        INSERT INTO bot_states (user_id, enabled, configuration)
        VALUES ($1, $2, $3)
        RETURNING *
      `, [user_id, true, JSON.stringify({ enabled: true })]);

      return {
        success: true,
        data: result.rows[0],
        message: 'Bot state created with defaults'
      };
    } catch {
      console.error('❌ Error getting or creating bot state:');
      return {
        success: false,
        error: 'Unknown error'
      };
    }
  }

  /**
   * Update bot state (enable/disable)
   */
  static async update(user_id: string, data: UpdateBotStateData): Promise<ServiceResponse<BotState>> {
    // CRITICAL: No fallbacks allowed - bot state changes must persist
    if (process.env.NODE_ENV === 'development' && !process.env.DATABASE_URL && !process.env.DATABASE_HOST) {
      throw new CriticalDatabaseError('Database unavailable - cannot update bot state without persistence layer', 'DB_UNAVAILABLE');
    }

    try {
      const result = await query<BotState>(`
        UPDATE bot_states 
        SET enabled = COALESCE($2, enabled),
            configuration = COALESCE($3, configuration),
            last_updated = now(),
            updated_at = now()
        WHERE user_id = $1
        RETURNING *
      `, [user_id, data.enabled, data.configuration ? JSON.stringify(data.configuration) : null]);

      if (result.rows.length === 0) {
        // If no existing state, create one
        return await this.create({ user_id, ...data });
      }

      return {
        success: true,
        data: result.rows[0],
        message: 'Bot state updated successfully'
      };
    } catch {
      console.error('❌ Error updating bot state:');
      return {
        success: false,
        error: 'Unknown error'
      };
    }
  }

  /**
   * Create bot state
   */
  static async create(data: CreateBotStateData): Promise<ServiceResponse<BotState>> {
    try {
      const result = await query<BotState>(`
        INSERT INTO bot_states (user_id, enabled, configuration)
        VALUES ($1, $2, $3)
        ON CONFLICT (user_id) 
        DO UPDATE SET 
          enabled = EXCLUDED.enabled,
          configuration = EXCLUDED.configuration,
          last_updated = now(),
          updated_at = now()
        RETURNING *
      `, [
        data.user_id, 
        data.enabled ?? true, 
        JSON.stringify(data.configuration || { enabled: data.enabled ?? true })
      ]);

      return {
        success: true,
        data: result.rows[0],
        message: 'Bot state created successfully'
      };
    } catch {
      console.error('❌ Error creating bot state:');
      return {
        success: false,
        error: 'Unknown error'
      };
    }
  }

  /**
   * Convert bot state to API response format
   */
  static toBotStatusResponse(botState: BotState): BotStatusResponse {
    return {
      user_id: botState.user_id,
      status: botState.enabled ? 'active' : 'stopped',
      last_execution: botState.last_updated.toISOString(),
      configuration: {
        enabled: botState.enabled,
        risk_profile: botState.configuration.risk_profile || 'balanced',
        max_trade_amount: botState.configuration.max_trade_amount
      }
    };
  }
}

/**
 * USER SETTINGS SERVICE 
 * Replaces in-memory user settings storage
 */
export class UserSettingsService {
  /**
   * Get or create user settings
   */
  static async getOrCreate(wallet_address: string): Promise<ServiceResponse<UserSettings>> {
    // CRITICAL: No fallbacks allowed - user settings affect trading behavior
    if (process.env.NODE_ENV === 'development' && !process.env.DATABASE_URL && !process.env.DATABASE_HOST) {
      throw new CriticalDatabaseError('Database unavailable - cannot access user settings without persistence layer', 'DB_UNAVAILABLE');
    }

    try {
      // Try to get existing settings
      const existing = await query<UserSettings>(`
        SELECT * FROM user_settings WHERE wallet_address = $1
      `, [wallet_address]);

      if (existing.rows.length > 0) {
        return {
          success: true,
          data: existing.rows[0]
        };
      }

      // Create default settings
      const defaultSettings = {
        maxDrawdownLimit: 15,
        positionSizePercent: 5,
        stopLossEnabled: true,
        takeProfitEnabled: true
      };

      const result = await query<UserSettings>(`
        INSERT INTO user_settings (wallet_address, risk_profile, settings)
        VALUES ($1, $2, $3)
        RETURNING *
      `, [wallet_address, 'Balanced', JSON.stringify(defaultSettings)]);

      return {
        success: true,
        data: result.rows[0],
        message: 'User settings created with defaults'
      };
    } catch {
      console.error('❌ Error getting or creating user settings:');
      return {
        success: false,
        error: 'Unknown error'
      };
    }
  }

  /**
   * Update user settings
   */
  static async update(
    wallet_address: string, 
    data: UpdateUserSettingsData
  ): Promise<ServiceResponse<UserSettings>> {
    // CRITICAL: No fallbacks allowed - user settings changes must persist
    if (process.env.NODE_ENV === 'development' && !process.env.DATABASE_URL && !process.env.DATABASE_HOST) {
      throw new CriticalDatabaseError('Database unavailable - cannot update user settings without persistence layer', 'DB_UNAVAILABLE');
    }

    try {
      const result = await query<UserSettings>(`
        UPDATE user_settings 
        SET risk_profile = COALESCE($2, risk_profile),
            settings = COALESCE($3, settings),
            updated_at = now()
        WHERE wallet_address = $1
        RETURNING *
      `, [
        wallet_address, 
        data.risk_profile, 
        data.settings ? JSON.stringify(data.settings) : null
      ]);

      if (result.rows.length === 0) {
        // If no existing settings, create them
        return await this.create({ wallet_address, ...data });
      }

      return {
        success: true,
        data: result.rows[0],
        message: 'User settings updated successfully'
      };
    } catch {
      console.error('❌ Error updating user settings:');
      return {
        success: false,
        error: 'Unknown error'
      };
    }
  }

  /**
   * Create user settings
   */
  static async create(data: CreateUserSettingsData): Promise<ServiceResponse<UserSettings>> {
    try {
      const defaultSettings = {
        maxDrawdownLimit: 15,
        positionSizePercent: 5,
        stopLossEnabled: true,
        takeProfitEnabled: true,
        ...(data.settings || {})
      };

      const result = await query<UserSettings>(`
        INSERT INTO user_settings (wallet_address, risk_profile, settings)
        VALUES ($1, $2, $3)
        ON CONFLICT (wallet_address) 
        DO UPDATE SET 
          risk_profile = EXCLUDED.risk_profile,
          settings = EXCLUDED.settings,
          updated_at = now()
        RETURNING *
      `, [
        data.wallet_address, 
        data.risk_profile || 'Balanced', 
        JSON.stringify(defaultSettings)
      ]);

      return {
        success: true,
        data: result.rows[0],
        message: 'User settings created successfully'
      };
    } catch {
      console.error('❌ Error creating user settings:');
      return {
        success: false,
        error: 'Unknown error'
      };
    }
  }
}

// All services are exported as classes above