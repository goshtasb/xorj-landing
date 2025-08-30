/**
 * Scoring Runs Schema Definition - Drizzle ORM
 * 
 * Defines the scoring_runs table that tracks the state and history of the
 * Quantitative Engine's analysis jobs for XORJ Trust Score calculations.
 * 
 * Features:
 * - UUID primary keys for scalability
 * - Status tracking for job lifecycle management
 * - Timestamp management for performance monitoring
 * - Error message storage for debugging
 * 
 * Integrates with the Quantitative Engine and trader intelligence systems.
 * 
 * @see PRD Section: Unified Database Schema Definition
 * @see quantitative-engine/app/main_secure.py
 */

import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { relations } from 'drizzle-orm';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';

/**
 * Scoring Run Status Enumeration
 * 
 * Standardized status values for tracking scoring run lifecycle.
 * These match the quantitative engine's job management system.
 */
export const SCORING_RUN_STATUSES = ['PENDING', 'RUNNING', 'COMPLETED', 'FAILED'] as const;
export type ScoringRunStatus = typeof SCORING_RUN_STATUSES[number];

/**
 * Scoring Runs Table
 * 
 * Tracks the state and history of quantitative analysis jobs.
 * Each run represents a complete analysis cycle of trader data.
 * 
 * SQL Equivalent:
 * CREATE TABLE scoring_runs (
 *   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 *   status TEXT NOT NULL,
 *   started_at TIMESTAMPTZ,
 *   completed_at TIMESTAMPTZ,
 *   error_message TEXT
 * );
 */
export const scoringRuns = pgTable('scoring_runs', {
  // Primary key - auto-generated UUID
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`)
    .notNull(),
  
  // Job status - tracks execution state
  status: text('status', { enum: SCORING_RUN_STATUSES })
    .notNull()
    .default('PENDING'),
  
  // Job start timestamp - set when execution begins
  startedAt: timestamp('started_at', { 
    withTimezone: true, 
    mode: 'date' 
  }),
  
  // Job completion timestamp - set when execution finishes
  completedAt: timestamp('completed_at', { 
    withTimezone: true, 
    mode: 'date' 
  }),
  
  // Error message - populated when status is FAILED
  errorMessage: text('error_message')
});

/**
 * Drizzle Relations
 * 
 * Define relationships to other tables that reference scoring runs.
 * This enables type-safe joins and cascading operations.
 */
export const scoringRunsRelations = relations(scoringRuns, ({ many }) => ({
  // Forward reference to traderScores - relationship will be defined in unified schema
  traderScores: many(scoringRuns)
}));

/**
 * Zod Validation Schemas
 * 
 * Type-safe validation schemas for scoring_runs table operations.
 * These ensure data integrity and provide runtime validation.
 */

// Status validation schema
const statusSchema = z.enum(SCORING_RUN_STATUSES, {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  errorMap: (_issue, _ctx) => {
    return { message: `Status must be one of: ${SCORING_RUN_STATUSES.join(', ')}` };
  }
});

// Insert schema - for creating new scoring runs
export const insertScoringRunSchema = createInsertSchema(scoringRuns, {
  status: statusSchema,
  startedAt: z.date().optional(),
  completedAt: z.date().optional(),
  errorMessage: z.string().max(1000).optional()
}).omit({
  id: true
});

// Select schema - for reading scoring runs
export const selectScoringRunSchema = createSelectSchema(scoringRuns, {
  status: statusSchema
});

// Update schema - for modifying scoring runs
export const updateScoringRunSchema = insertScoringRunSchema.partial();

/**
 * TypeScript Types
 * 
 * Inferred types for TypeScript integration throughout the application.
 * These provide compile-time type safety for quantitative engine integration.
 */
export type ScoringRun = typeof scoringRuns.$inferSelect;
export type NewScoringRun = typeof scoringRuns.$inferInsert;
export type ScoringRunUpdate = Partial<NewScoringRun>;

/**
 * Scoring Run Validation Types
 * 
 * Zod-validated types for runtime type checking and API validation.
 */
export type ValidatedScoringRun = z.infer<typeof selectScoringRunSchema>;
export type ValidatedNewScoringRun = z.infer<typeof insertScoringRunSchema>;
export type ValidatedScoringRunUpdate = z.infer<typeof updateScoringRunSchema>;

/**
 * Compatibility Types
 * 
 * Types that maintain compatibility with existing scoring run interfaces.
 * These bridge quantitative engine and database layer communications.
 */
export interface CompatibleScoringRun {
  id: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  startedAt?: Date;
  completedAt?: Date;
  errorMessage?: string;
  duration?: number; // Computed field for API responses
}

/**
 * Utility Functions
 * 
 * Helper functions for scoring run management and status tracking.
 */

// Calculate run duration in milliseconds
export const calculateRunDuration = (scoringRun: ScoringRun): number | null => {
  if (!scoringRun.startedAt) return null;
  const endTime = scoringRun.completedAt || new Date();
  return endTime.getTime() - scoringRun.startedAt.getTime();
};

// Check if a run is in a terminal state
export const isTerminalStatus = (status: ScoringRunStatus): boolean => {
  return status === 'COMPLETED' || status === 'FAILED';
};

// Check if a run is currently active
export const isActiveRun = (scoringRun: ScoringRun): boolean => {
  return scoringRun.status === 'RUNNING' || scoringRun.status === 'PENDING';
};

// Convert to API format with computed fields
export const convertToApiFormat = (dbRun: ScoringRun): CompatibleScoringRun => ({
  id: dbRun.id,
  status: dbRun.status,
  startedAt: dbRun.startedAt || undefined,
  completedAt: dbRun.completedAt || undefined,
  errorMessage: dbRun.errorMessage || undefined,
  duration: calculateRunDuration(dbRun) || undefined
});