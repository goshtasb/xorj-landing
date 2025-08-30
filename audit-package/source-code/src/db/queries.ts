/**
 * Type-Safe Database Queries - Drizzle ORM Query Library
 * 
 * This file provides pre-built, type-safe query functions for common database
 * operations. All queries use the Drizzle query builder to ensure 100% type safety
 * as required by DAL specifications.
 * 
 * Requirements Addressed:
 * - 4.3: Type-Safe Queries - No raw SQL, 100% type safety
 * - Performance optimized queries with proper indexing
 * - Reusable query patterns for the entire application
 * 
 * @see PRD Section: Data Access Layer (DAL) Requirements
 */

import { eq, desc, asc, count, sum, avg, max, min, and, or, inArray, isNull, isNotNull, gte, lte, like } from 'drizzle-orm';
import { db, Tables } from './connection';
import type {
  User, NewUser, UserUpdate,
  UserSettings, NewUserSettings, UserSettingsUpdate,
  ScoringRun, NewScoringRun, ScoringRunUpdate,
  TraderScore, NewTraderScore, TraderScoreUpdate,
  ExecutionJob, NewExecutionJob, ExecutionJobUpdate,
  Trade, NewTrade, TradeUpdate,
  WaitlistSignup, NewWaitlistSignup, WaitlistSignupUpdate
} from './schema';

// =============================================================================
// USER MANAGEMENT QUERIES
// =============================================================================

/**
 * User Management - Type-safe operations for user accounts
 */
export const UserQueries = {
  /**
   * Create a new user
   * @param userData - User data to insert
   * @returns Promise<User> - Created user record
   */
  async create(userData: NewUser): Promise<User> {
    const [user] = await db.insert(Tables.users)
      .values(userData)
      .returning();
    return user;
  },

  /**
   * Find user by wallet address
   * @param walletAddress - Solana wallet address
   * @returns Promise<User | undefined> - User record or undefined
   */
  async findByWallet(walletAddress: string): Promise<User | undefined> {
    const [user] = await db.select()
      .from(Tables.users)
      .where(eq(Tables.users.walletAddress, walletAddress))
      .limit(1);
    return user;
  },

  /**
   * Find user by ID
   * @param id - User UUID
   * @returns Promise<User | undefined> - User record or undefined
   */
  async findById(id: string): Promise<User | undefined> {
    const [user] = await db.select()
      .from(Tables.users)
      .where(eq(Tables.users.id, id))
      .limit(1);
    return user;
  },

  /**
   * Get user with settings (joined query)
   * @param walletAddress - Solana wallet address
   * @returns Promise<{user: User, settings: UserSettings | null}>
   */
  async findWithSettings(walletAddress: string) {
    const result = await db.select({
      user: Tables.users,
      settings: Tables.userSettings
    })
      .from(Tables.users)
      .leftJoin(Tables.userSettings, eq(Tables.users.id, Tables.userSettings.userId))
      .where(eq(Tables.users.walletAddress, walletAddress))
      .limit(1);

    if (result.length === 0) return null;
    
    return {
      user: result[0].user,
      settings: result[0].settings
    };
  },

  /**
   * Update user information
   * @param id - User UUID
   * @param updates - Partial user data to update
   * @returns Promise<User> - Updated user record
   */
  async update(id: string, updates: UserUpdate): Promise<User> {
    const [user] = await db.update(Tables.users)
      .set(updates)
      .where(eq(Tables.users.id, id))
      .returning();
    return user;
  },

  /**
   * Delete user (cascade will handle related records)
   * @param id - User UUID
   * @returns Promise<boolean> - Success status
   */
  async delete(id: string): Promise<boolean> {
    const result = await db.delete(Tables.users)
      .where(eq(Tables.users.id, id));
    return result.rowCount > 0;
  }
};

/**
 * User Settings Management - Type-safe operations for user preferences
 */
export const UserSettingsQueries = {
  /**
   * Create user settings
   * @param settingsData - Settings data to insert
   * @returns Promise<UserSettings> - Created settings record
   */
  async create(settingsData: NewUserSettings): Promise<UserSettings> {
    const [settings] = await db.insert(Tables.userSettings)
      .values(settingsData)
      .returning();
    return settings;
  },

  /**
   * Find settings by user ID
   * @param userId - User UUID
   * @returns Promise<UserSettings | undefined> - Settings record or undefined
   */
  async findByUserId(userId: string): Promise<UserSettings | undefined> {
    const [settings] = await db.select()
      .from(Tables.userSettings)
      .where(eq(Tables.userSettings.userId, userId))
      .limit(1);
    return settings;
  },

  /**
   * Update user settings
   * @param userId - User UUID
   * @param updates - Partial settings data to update
   * @returns Promise<UserSettings> - Updated settings record
   */
  async update(userId: string, updates: UserSettingsUpdate): Promise<UserSettings> {
    const [settings] = await db.update(Tables.userSettings)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(Tables.userSettings.userId, userId))
      .returning();
    return settings;
  },

  /**
   * Create or update user settings (upsert)
   * @param userId - User UUID
   * @param settingsData - Settings data
   * @returns Promise<UserSettings> - Created or updated settings
   */
  async upsert(userId: string, settingsData: Omit<NewUserSettings, 'userId'>): Promise<UserSettings> {
    const existing = await this.findByUserId(userId);
    
    if (existing) {
      return await this.update(userId, settingsData);
    } else {
      return await this.create({ userId, ...settingsData });
    }
  }
};

// =============================================================================
// TRADING INTELLIGENCE QUERIES
// =============================================================================

/**
 * Scoring Run Management - Operations for quantitative analysis jobs
 */
export const ScoringRunQueries = {
  /**
   * Create a new scoring run
   * @param runData - Scoring run data to insert
   * @returns Promise<ScoringRun> - Created scoring run record
   */
  async create(runData: NewScoringRun): Promise<ScoringRun> {
    const [run] = await db.insert(Tables.scoringRuns)
      .values(runData)
      .returning();
    return run;
  },

  /**
   * Find scoring run by ID
   * @param id - Scoring run UUID
   * @returns Promise<ScoringRun | undefined> - Scoring run record or undefined
   */
  async findById(id: string): Promise<ScoringRun | undefined> {
    const [run] = await db.select()
      .from(Tables.scoringRuns)
      .where(eq(Tables.scoringRuns.id, id))
      .limit(1);
    return run;
  },

  /**
   * Get latest scoring run
   * @returns Promise<ScoringRun | undefined> - Most recent scoring run
   */
  async getLatest(): Promise<ScoringRun | undefined> {
    const [run] = await db.select()
      .from(Tables.scoringRuns)
      .orderBy(desc(Tables.scoringRuns.startedAt))
      .limit(1);
    return run;
  },

  /**
   * Get active scoring runs (PENDING or RUNNING)
   * @returns Promise<ScoringRun[]> - Array of active runs
   */
  async getActive(): Promise<ScoringRun[]> {
    return await db.select()
      .from(Tables.scoringRuns)
      .where(or(
        eq(Tables.scoringRuns.status, 'PENDING'),
        eq(Tables.scoringRuns.status, 'RUNNING')
      ))
      .orderBy(asc(Tables.scoringRuns.startedAt));
  },

  /**
   * Update scoring run status
   * @param id - Scoring run UUID
   * @param updates - Status and related fields to update
   * @returns Promise<ScoringRun> - Updated scoring run
   */
  async update(id: string, updates: ScoringRunUpdate): Promise<ScoringRun> {
    const [run] = await db.update(Tables.scoringRuns)
      .set(updates)
      .where(eq(Tables.scoringRuns.id, id))
      .returning();
    return run;
  },

  /**
   * Mark scoring run as started
   * @param id - Scoring run UUID
   * @returns Promise<ScoringRun> - Updated scoring run
   */
  async markStarted(id: string): Promise<ScoringRun> {
    return await this.update(id, {
      status: 'RUNNING',
      startedAt: new Date()
    });
  },

  /**
   * Mark scoring run as completed
   * @param id - Scoring run UUID
   * @returns Promise<ScoringRun> - Updated scoring run
   */
  async markCompleted(id: string): Promise<ScoringRun> {
    return await this.update(id, {
      status: 'COMPLETED',
      completedAt: new Date()
    });
  },

  /**
   * Mark scoring run as failed
   * @param id - Scoring run UUID
   * @param errorMessage - Error details
   * @returns Promise<ScoringRun> - Updated scoring run
   */
  async markFailed(id: string, errorMessage: string): Promise<ScoringRun> {
    return await this.update(id, {
      status: 'FAILED',
      completedAt: new Date(),
      errorMessage
    });
  }
};

/**
 * Trader Score Management - Operations for XORJ Trust Scores
 */
export const TraderScoreQueries = {
  /**
   * Create trader score records (batch insert)
   * @param scoresData - Array of trader scores to insert
   * @returns Promise<TraderScore[]> - Created trader score records
   */
  async createBatch(scoresData: NewTraderScore[]): Promise<TraderScore[]> {
    return await db.insert(Tables.traderScores)
      .values(scoresData)
      .returning();
  },

  /**
   * Get latest scores for all traders
   * @returns Promise<TraderScore[]> - Latest scores from most recent run
   */
  async getLatestScores(): Promise<TraderScore[]> {
    const latestRun = await ScoringRunQueries.getLatest();
    if (!latestRun) return [];

    return await db.select()
      .from(Tables.traderScores)
      .where(eq(Tables.traderScores.runId, latestRun.id))
      .orderBy(desc(Tables.traderScores.xorjTrustScore));
  },

  /**
   * Get top-ranked traders with pagination
   * @param limit - Number of traders to return
   * @param offset - Number of traders to skip
   * @returns Promise<TraderScore[]> - Top-ranked traders
   */
  async getTopTraders(limit: number = 100, offset: number = 0): Promise<TraderScore[]> {
    const latestRun = await ScoringRunQueries.getLatest();
    if (!latestRun) return [];

    return await db.select()
      .from(Tables.traderScores)
      .where(eq(Tables.traderScores.runId, latestRun.id))
      .orderBy(desc(Tables.traderScores.xorjTrustScore))
      .limit(limit)
      .offset(offset);
  },

  /**
   * Get trader score by wallet address (latest run)
   * @param walletAddress - Solana wallet address
   * @returns Promise<TraderScore | undefined> - Trader score or undefined
   */
  async getByWallet(walletAddress: string): Promise<TraderScore | undefined> {
    const latestRun = await ScoringRunQueries.getLatest();
    if (!latestRun) return undefined;

    const [score] = await db.select()
      .from(Tables.traderScores)
      .where(and(
        eq(Tables.traderScores.runId, latestRun.id),
        eq(Tables.traderScores.walletAddress, walletAddress)
      ))
      .limit(1);
    
    return score;
  },

  /**
   * Get trader score history for a wallet
   * @param walletAddress - Solana wallet address
   * @param limit - Number of historical scores to return
   * @returns Promise<TraderScore[]> - Historical scores ordered by date
   */
  async getScoreHistory(walletAddress: string, limit: number = 30): Promise<TraderScore[]> {
    return await db.select()
      .from(Tables.traderScores)
      .where(eq(Tables.traderScores.walletAddress, walletAddress))
      .orderBy(desc(Tables.traderScores.createdAt))
      .limit(limit);
  },

  /**
   * Get score statistics for analytics
   * @returns Promise<Object> - Score distribution statistics
   */
  async getScoreStatistics() {
    const latestRun = await ScoringRunQueries.getLatest();
    if (!latestRun) return null;

    const [stats] = await db.select({
      totalScores: count(Tables.traderScores.id),
      averageScore: avg(Tables.traderScores.xorjTrustScore),
      maxScore: max(Tables.traderScores.xorjTrustScore),
      minScore: min(Tables.traderScores.xorjTrustScore)
    })
      .from(Tables.traderScores)
      .where(eq(Tables.traderScores.runId, latestRun.id));

    return stats;
  }
};

// =============================================================================
// TRADE EXECUTION QUERIES
// =============================================================================

/**
 * Execution Job Management - Operations for bot trade execution jobs
 */
export const ExecutionJobQueries = {
  /**
   * Create a new execution job
   * @param jobData - Execution job data to insert
   * @returns Promise<ExecutionJob> - Created execution job record
   */
  async create(jobData: NewExecutionJob): Promise<ExecutionJob> {
    const [job] = await db.insert(Tables.executionJobs)
      .values(jobData)
      .returning();
    return job;
  },

  /**
   * Find execution job by ID
   * @param id - Execution job UUID
   * @returns Promise<ExecutionJob | undefined> - Execution job or undefined
   */
  async findById(id: string): Promise<ExecutionJob | undefined> {
    const [job] = await db.select()
      .from(Tables.executionJobs)
      .where(eq(Tables.executionJobs.id, id))
      .limit(1);
    return job;
  },

  /**
   * Get jobs for a specific user
   * @param userId - User UUID
   * @param limit - Maximum number of jobs to return
   * @returns Promise<ExecutionJob[]> - User's execution jobs
   */
  async getByUserId(userId: string, limit: number = 50): Promise<ExecutionJob[]> {
    return await db.select()
      .from(Tables.executionJobs)
      .where(eq(Tables.executionJobs.userId, userId))
      .orderBy(desc(Tables.executionJobs.startedAt))
      .limit(limit);
  },

  /**
   * Get pending jobs (ready for execution)
   * @param limit - Maximum number of jobs to return
   * @returns Promise<ExecutionJob[]> - Pending execution jobs
   */
  async getPending(limit: number = 10): Promise<ExecutionJob[]> {
    return await db.select()
      .from(Tables.executionJobs)
      .where(eq(Tables.executionJobs.status, 'PENDING'))
      .orderBy(asc(Tables.executionJobs.startedAt))
      .limit(limit);
  },

  /**
   * Update execution job
   * @param id - Execution job UUID
   * @param updates - Job data to update
   * @returns Promise<ExecutionJob> - Updated execution job
   */
  async update(id: string, updates: ExecutionJobUpdate): Promise<ExecutionJob> {
    const [job] = await db.update(Tables.executionJobs)
      .set(updates)
      .where(eq(Tables.executionJobs.id, id))
      .returning();
    return job;
  },

  /**
   * Mark job as started
   * @param id - Execution job UUID
   * @returns Promise<ExecutionJob> - Updated job
   */
  async markStarted(id: string): Promise<ExecutionJob> {
    return await this.update(id, {
      status: 'RUNNING',
      startedAt: new Date()
    });
  },

  /**
   * Mark job as completed
   * @param id - Execution job UUID
   * @returns Promise<ExecutionJob> - Updated job
   */
  async markCompleted(id: string): Promise<ExecutionJob> {
    return await this.update(id, {
      status: 'COMPLETED',
      completedAt: new Date()
    });
  },

  /**
   * Mark job as failed
   * @param id - Execution job UUID
   * @param errorMessage - Error details
   * @returns Promise<ExecutionJob> - Updated job
   */
  async markFailed(id: string, errorMessage: string): Promise<ExecutionJob> {
    return await this.update(id, {
      status: 'FAILED',
      completedAt: new Date(),
      errorMessage
    });
  }
};

/**
 * Trade Management - Operations for trade execution records
 */
export const TradeQueries = {
  /**
   * Create a new trade record
   * @param tradeData - Trade data to insert
   * @returns Promise<Trade> - Created trade record
   */
  async create(tradeData: NewTrade): Promise<Trade> {
    const [trade] = await db.insert(Tables.trades)
      .values(tradeData)
      .returning();
    return trade;
  },

  /**
   * Find trade by transaction hash (duplicate prevention)
   * @param transactionHash - Blockchain transaction hash
   * @returns Promise<Trade | undefined> - Existing trade or undefined
   */
  async findByTransactionHash(transactionHash: string): Promise<Trade | undefined> {
    const [trade] = await db.select()
      .from(Tables.trades)
      .where(eq(Tables.trades.transactionHash, transactionHash))
      .limit(1);
    return trade;
  },

  /**
   * Get trades for a specific user
   * @param userId - User UUID
   * @param limit - Maximum number of trades to return
   * @returns Promise<Trade[]> - User's trades
   */
  async getByUserId(userId: string, limit: number = 100): Promise<Trade[]> {
    return await db.select()
      .from(Tables.trades)
      .where(eq(Tables.trades.userId, userId))
      .orderBy(desc(Tables.trades.executedAt))
      .limit(limit);
  },

  /**
   * Get trades for a specific symbol
   * @param symbol - Trading pair symbol
   * @param limit - Maximum number of trades to return
   * @returns Promise<Trade[]> - Symbol trades
   */
  async getBySymbol(symbol: string, limit: number = 100): Promise<Trade[]> {
    return await db.select()
      .from(Tables.trades)
      .where(eq(Tables.trades.symbol, symbol))
      .orderBy(desc(Tables.trades.executedAt))
      .limit(limit);
  },

  /**
   * Update trade status
   * @param id - Trade UUID
   * @param updates - Trade data to update
   * @returns Promise<Trade> - Updated trade
   */
  async update(id: string, updates: TradeUpdate): Promise<Trade> {
    const [trade] = await db.update(Tables.trades)
      .set(updates)
      .where(eq(Tables.trades.id, id))
      .returning();
    return trade;
  },

  /**
   * Get portfolio positions for a user
   * @param userId - User UUID
   * @returns Promise<Object[]> - Portfolio positions by symbol
   */
  async getPortfolio(userId: string) {
    return await db.select({
      symbol: Tables.trades.symbol,
      totalQuantity: sum(Tables.trades.quantity),
      tradeCount: count(Tables.trades.id),
      lastTradeDate: max(Tables.trades.executedAt)
    })
      .from(Tables.trades)
      .where(and(
        eq(Tables.trades.userId, userId),
        eq(Tables.trades.status, 'CONFIRMED')
      ))
      .groupBy(Tables.trades.symbol);
  },

  /**
   * Get trading performance statistics
   * @param userId - User UUID
   * @param days - Number of days to analyze
   * @returns Promise<Object> - Performance statistics
   */
  async getPerformanceStats(userId: string, days: number = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const [stats] = await db.select({
      totalTrades: count(Tables.trades.id),
      totalVolume: sum(Tables.trades.quantity),
      successfulTrades: count(Tables.trades.id),
    })
      .from(Tables.trades)
      .where(and(
        eq(Tables.trades.userId, userId),
        gte(Tables.trades.executedAt, since),
        eq(Tables.trades.status, 'CONFIRMED')
      ));

    return stats;
  }
};

// =============================================================================
// WAITLIST AND MARKETING QUERIES
// =============================================================================

/**
 * Waitlist Management - Operations for signup tracking and marketing
 */
export const WaitlistQueries = {
  /**
   * Create a new waitlist signup
   * @param signupData - Waitlist signup data to insert
   * @returns Promise<WaitlistSignup> - Created signup record
   */
  async create(signupData: NewWaitlistSignup): Promise<WaitlistSignup> {
    const [signup] = await db.insert(Tables.waitlistSignups)
      .values(signupData)
      .returning();
    return signup;
  },

  /**
   * Find signup by email
   * @param email - Email address
   * @returns Promise<WaitlistSignup | undefined> - Signup record or undefined
   */
  async findByEmail(email: string): Promise<WaitlistSignup | undefined> {
    const [signup] = await db.select()
      .from(Tables.waitlistSignups)
      .where(eq(Tables.waitlistSignups.email, email.toLowerCase()))
      .limit(1);
    return signup;
  },

  /**
   * Get signups by status
   * @param status - Waitlist status
   * @param limit - Maximum number of signups to return
   * @returns Promise<WaitlistSignup[]> - Signups with specified status
   */
  async getByStatus(status: string, limit: number = 1000): Promise<WaitlistSignup[]> {
    return await db.select()
      .from(Tables.waitlistSignups)
      .where(eq(Tables.waitlistSignups.status, status))
      .orderBy(asc(Tables.waitlistSignups.createdAt))
      .limit(limit);
  },

  /**
   * Update waitlist signup
   * @param id - Signup UUID
   * @param updates - Signup data to update
   * @returns Promise<WaitlistSignup> - Updated signup
   */
  async update(id: string, updates: WaitlistSignupUpdate): Promise<WaitlistSignup> {
    const [signup] = await db.update(Tables.waitlistSignups)
      .set(updates)
      .where(eq(Tables.waitlistSignups.id, id))
      .returning();
    return signup;
  },

  /**
   * Get waitlist analytics
   * @returns Promise<Object> - Waitlist statistics and metrics
   */
  async getAnalytics() {
    const [stats] = await db.select({
      totalSignups: count(Tables.waitlistSignups.id),
      pendingSignups: count(Tables.waitlistSignups.id),
      approvedSignups: count(Tables.waitlistSignups.id),
    })
      .from(Tables.waitlistSignups);

    return stats;
  },

  /**
   * Get signups by referral code
   * @param referralCode - Referral code
   * @returns Promise<WaitlistSignup[]> - Signups from referral
   */
  async getByReferralCode(referralCode: string): Promise<WaitlistSignup[]> {
    return await db.select()
      .from(Tables.waitlistSignups)
      .where(eq(Tables.waitlistSignups.referralCode, referralCode.toUpperCase()))
      .orderBy(asc(Tables.waitlistSignups.createdAt));
  }
};

// =============================================================================
// COMPLEX ANALYTICAL QUERIES
// =============================================================================

/**
 * Analytics Queries - Complex cross-table analytics and reporting
 */
export const AnalyticsQueries = {
  /**
   * Get user activity summary
   * @param userId - User UUID
   * @returns Promise<Object> - Comprehensive user activity data
   */
  async getUserActivitySummary(userId: string) {
    const user = await UserQueries.findById(userId);
    if (!user) return null;

    const [tradeStats] = await db.select({
      totalTrades: count(Tables.trades.id),
      totalVolume: sum(Tables.trades.quantity),
      lastTradeDate: max(Tables.trades.executedAt)
    })
      .from(Tables.trades)
      .where(eq(Tables.trades.userId, userId));

    const [jobStats] = await db.select({
      totalJobs: count(Tables.executionJobs.id),
      completedJobs: count(Tables.executionJobs.id),
      lastJobDate: max(Tables.executionJobs.startedAt)
    })
      .from(Tables.executionJobs)
      .where(eq(Tables.executionJobs.userId, userId));

    const score = await TraderScoreQueries.getByWallet(user.walletAddress);

    return {
      user,
      tradeStats,
      jobStats,
      currentScore: score?.xorjTrustScore || null,
      lastActivity: tradeStats.lastTradeDate || jobStats.lastJobDate
    };
  },

  /**
   * Get platform-wide statistics
   * @returns Promise<Object> - Platform usage and performance metrics
   */
  async getPlatformStats() {
    const [userStats] = await db.select({
      totalUsers: count(Tables.users.id)
    })
      .from(Tables.users);

    const [tradeStats] = await db.select({
      totalTrades: count(Tables.trades.id),
      totalVolume: sum(Tables.trades.quantity),
      confirmedTrades: count(Tables.trades.id)
    })
      .from(Tables.trades);

    const [waitlistStats] = await db.select({
      totalSignups: count(Tables.waitlistSignups.id)
    })
      .from(Tables.waitlistSignups);

    return {
      users: userStats,
      trades: tradeStats,
      waitlist: waitlistStats,
      timestamp: new Date().toISOString()
    };
  }
};

// =============================================================================
// EXPORT ALL QUERY MODULES
// =============================================================================

export const queries = {
  users: UserQueries,
  userSettings: UserSettingsQueries,
  scoringRuns: ScoringRunQueries,
  traderScores: TraderScoreQueries,
  executionJobs: ExecutionJobQueries,
  trades: TradeQueries,
  waitlist: WaitlistQueries,
  analytics: AnalyticsQueries
} as const;