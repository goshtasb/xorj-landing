/**
 * Trader Scores Schema Definition - Drizzle ORM
 * 
 * Defines the trader_scores table that stores historical XORJ Trust Score
 * results from each scoring run of the Quantitative Engine.
 * 
 * Features:
 * - Foreign key relationship to scoring_runs
 * - JSONB storage for flexible metrics data
 * - Wallet address indexing for efficient queries
 * - Automatic timestamp management
 * 
 * Integrates with the trader intelligence and ranking systems.
 * 
 * @see PRD Section: Unified Database Schema Definition
 * @see src/app/api/internal/trader-rankings/route.ts
 */

import { pgTable, uuid, text, real, jsonb, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { relations } from 'drizzle-orm';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import { scoringRuns } from './scoringRuns';

/**
 * Trader Score Metrics Schema
 * 
 * Defines the structure of the JSONB metrics field.
 * This provides type safety for the flexible metrics data.
 */
export const traderMetricsSchema = z.object({
  // Core performance metrics
  totalVolume: z.number().optional(),
  tradeCount: z.number().optional(),
  winRate: z.number().min(0).max(1).optional(),
  avgProfitLoss: z.number().optional(),
  maxDrawdown: z.number().optional(),
  
  // Risk metrics
  volatility: z.number().optional(),
  sharpeRatio: z.number().optional(),
  riskScore: z.number().min(0).max(100).optional(),
  
  // Behavioral metrics
  consistencyScore: z.number().min(0).max(100).optional(),
  diversificationScore: z.number().min(0).max(100).optional(),
  liquidityScore: z.number().min(0).max(100).optional(),
  
  // Temporal metrics
  activityDays: z.number().optional(),
  avgDailyTrades: z.number().optional(),
  lastTradeTimestamp: z.number().optional(),
  
  // Additional flexible metrics
  customMetrics: z.record(z.unknown()).optional()
}).strict();

export type TraderMetrics = z.infer<typeof traderMetricsSchema>;

/**
 * Trader Scores Table
 * 
 * Stores XORJ Trust Scores and associated metrics for each wallet
 * from each scoring run. This creates a historical record of all scores.
 * 
 * SQL Equivalent:
 * CREATE TABLE trader_scores (
 *   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 *   run_id UUID REFERENCES scoring_runs(id),
 *   wallet_address TEXT NOT NULL,
 *   xorj_trust_score FLOAT NOT NULL,
 *   metrics JSONB,
 *   created_at TIMESTAMPTZ DEFAULT now()
 * );
 */
export const traderScores = pgTable('trader_scores', {
  // Primary key - auto-generated UUID
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`)
    .notNull(),
  
  // Foreign key to scoring_runs table
  runId: uuid('run_id')
    .references(() => scoringRuns.id)
    .notNull(),
  
  // Solana wallet address - indexed for efficient queries
  walletAddress: text('wallet_address')
    .notNull(),
  
  // XORJ Trust Score - primary scoring metric (0-100)
  xorjTrustScore: real('xorj_trust_score')
    .notNull(),
  
  // Additional metrics in JSONB format for flexibility
  metrics: jsonb('metrics').$type<TraderMetrics>(),
  
  // Creation timestamp - automatically set
  createdAt: timestamp('created_at', { 
    withTimezone: true, 
    mode: 'date' 
  })
    .default(sql`now()`)
    .notNull()
});

/**
 * Drizzle Relations
 * 
 * Define the relationship between trader_scores and scoring_runs tables.
 * This enables type-safe joins and nested queries.
 */
export const traderScoresRelations = relations(traderScores, ({ one }) => ({
  scoringRun: one(scoringRuns, {
    fields: [traderScores.runId],
    references: [scoringRuns.id]
  })
}));

/**
 * Zod Validation Schemas
 * 
 * Type-safe validation schemas for trader_scores table operations.
 * These ensure data integrity and validate complex JSONB data.
 */

// Insert schema - for creating new trader scores
export const insertTraderScoreSchema = createInsertSchema(traderScores, {
  walletAddress: z.string().min(32).max(44).regex(/^[A-Za-z0-9]+$/, 'Invalid wallet address format'),
  xorjTrustScore: z.number().min(0).max(100),
  metrics: traderMetricsSchema.optional()
}).omit({
  id: true,
  createdAt: true
});

// Select schema - for reading trader scores
export const selectTraderScoreSchema = createSelectSchema(traderScores, {
  walletAddress: z.string().min(32).max(44),
  xorjTrustScore: z.number().min(0).max(100),
  metrics: traderMetricsSchema.optional()
});

// Update schema - for modifying trader scores (rarely used)
export const updateTraderScoreSchema = insertTraderScoreSchema.partial();

/**
 * TypeScript Types
 * 
 * Inferred types for TypeScript integration throughout the application.
 * These provide compile-time type safety for trader intelligence features.
 */
export type TraderScore = typeof traderScores.$inferSelect;
export type NewTraderScore = typeof traderScores.$inferInsert;
export type TraderScoreUpdate = Partial<NewTraderScore>;

/**
 * Trader Score Validation Types
 * 
 * Zod-validated types for runtime type checking and API validation.
 */
export type ValidatedTraderScore = z.infer<typeof selectTraderScoreSchema>;
export type ValidatedNewTraderScore = z.infer<typeof insertTraderScoreSchema>;
export type ValidatedTraderScoreUpdate = z.infer<typeof updateTraderScoreSchema>;

/**
 * Compatibility Types
 * 
 * Types that maintain compatibility with existing trader intelligence APIs.
 * These bridge the gap between old and new systems.
 */
export interface CompatibleTraderScore {
  walletAddress: string;
  xorjTrustScore: number;
  metrics?: TraderMetrics;
  createdAt: Date;
  runId?: string;
}

export interface RankedTrader extends CompatibleTraderScore {
  rank: number;
  percentile: number;
}

/**
 * Query Helper Types
 * 
 * Types for complex queries and aggregations commonly used in the API.
 */
export interface LatestTraderScore {
  walletAddress: string;
  xorjTrustScore: number;
  metrics?: TraderMetrics;
  createdAt: Date;
  runId: string;
  isLatest: boolean;
}

export interface TraderScoreHistory {
  walletAddress: string;
  scores: Array<{
    score: number;
    date: Date;
    runId: string;
  }>;
  currentScore: number;
  scoreChange: number;
  trend: 'up' | 'down' | 'stable';
}

/**
 * Utility Functions
 * 
 * Helper functions for trader score analysis and ranking operations.
 */

// Calculate score percentile within a dataset
export const calculatePercentile = (score: number, allScores: number[]): number => {
  const sortedScores = [...allScores].sort((a, b) => a - b);
  const index = sortedScores.indexOf(score);
  return (index / (sortedScores.length - 1)) * 100;
};

// Determine score trend based on historical data
export const determineScoreTrend = (currentScore: number, previousScore?: number): 'up' | 'down' | 'stable' => {
  if (!previousScore) return 'stable';
  const change = currentScore - previousScore;
  const threshold = 0.5; // Minimum change to be considered significant
  
  if (change > threshold) return 'up';
  if (change < -threshold) return 'down';
  return 'stable';
};

// Convert to API format with computed fields
export const convertToApiFormat = (dbScore: TraderScore): CompatibleTraderScore => ({
  walletAddress: dbScore.walletAddress,
  xorjTrustScore: dbScore.xorjTrustScore,
  metrics: dbScore.metrics || undefined,
  createdAt: dbScore.createdAt,
  runId: dbScore.runId
});

// Convert to ranked trader format
export const convertToRankedFormat = (dbScore: TraderScore, rank: number, percentile: number): RankedTrader => ({
  ...convertToApiFormat(dbScore),
  rank,
  percentile
});