/**
 * Execution Jobs Schema Definition - Drizzle ORM
 * 
 * Defines the execution_jobs table that tracks the state and progress of
 * individual trade execution jobs managed by the XORJ Trading Bot.
 * 
 * Features:
 * - Foreign key relationship to users table
 * - Job status tracking throughout execution lifecycle
 * - Flexible parameters storage via JSONB
 * - Error handling and retry logic support
 * - Automatic timestamp management
 * 
 * Integrates with the Trade Execution Bot and bot state management systems.
 * 
 * @see PRD Section: Unified Database Schema Definition
 * @see src/lib/botService.ts
 */

import { pgTable, uuid, text, jsonb, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { relations } from 'drizzle-orm';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import { users } from './users';

/**
 * Execution Job Status Enumeration
 * 
 * Standardized status values for tracking job execution lifecycle.
 * These match the bot service job management system.
 */
export const EXECUTION_JOB_STATUSES = ['PENDING', 'RUNNING', 'COMPLETED', 'FAILED'] as const;
export type ExecutionJobStatus = typeof EXECUTION_JOB_STATUSES[number];

/**
 * Job Parameters Schema
 * 
 * Defines the structure of the JSONB parameters field.
 * This provides type safety for flexible job configuration data.
 */
export const jobParametersSchema = z.object({
  // Trade execution parameters
  symbol: z.string().optional(),
  side: z.enum(['BUY', 'SELL']).optional(),
  amount: z.number().positive().optional(),
  price: z.number().positive().optional(),
  orderType: z.enum(['MARKET', 'LIMIT', 'STOP_LOSS', 'TAKE_PROFIT']).optional(),
  
  // Risk management parameters
  maxSlippage: z.number().min(0).max(1).optional(),
  stopLoss: z.number().positive().optional(),
  takeProfit: z.number().positive().optional(),
  
  // Execution strategy parameters
  strategy: z.string().optional(),
  timeInForce: z.enum(['IOC', 'FOK', 'GTC']).optional(),
  splitOrder: z.boolean().optional(),
  maxChunks: z.number().int().positive().optional(),
  
  // Bot-specific parameters
  riskProfile: z.enum(['CONSERVATIVE', 'BALANCED', 'AGGRESSIVE']).optional(),
  maxPositionSize: z.number().positive().optional(),
  
  // Additional flexible parameters
  customParameters: z.record(z.unknown()).optional()
}).strict();

export type JobParameters = z.infer<typeof jobParametersSchema>;

/**
 * Execution Jobs Table
 * 
 * Tracks the state and configuration of individual trade execution jobs.
 * Each job represents a specific trading operation to be executed by the bot.
 * 
 * SQL Equivalent:
 * CREATE TABLE execution_jobs (
 *   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 *   user_id UUID REFERENCES users(id),
 *   status TEXT NOT NULL DEFAULT 'PENDING',
 *   parameters JSONB,
 *   started_at TIMESTAMPTZ,
 *   completed_at TIMESTAMPTZ,
 *   error_message TEXT
 * );
 */
export const executionJobs = pgTable('execution_jobs', {
  // Primary key - auto-generated UUID
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`)
    .notNull(),
  
  // Foreign key to users table
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  
  // Job status - tracks execution state
  status: text('status', { enum: EXECUTION_JOB_STATUSES })
    .notNull()
    .default('PENDING'),
  
  // Job parameters in JSONB format for flexibility
  parameters: jsonb('parameters').$type<JobParameters>(),
  
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
 * Define the relationship between execution_jobs and users tables.
 * This enables type-safe joins and cascading operations.
 */
export const executionJobsRelations = relations(executionJobs, ({ one }) => ({
  user: one(users, {
    fields: [executionJobs.userId],
    references: [users.id]
  })
  // trades relation will be defined in unified schema to avoid circular imports
}));

/**
 * Zod Validation Schemas
 * 
 * Type-safe validation schemas for execution_jobs table operations.
 * These ensure data integrity and provide runtime validation.
 */

// Status validation schema
const statusSchema = z.enum(EXECUTION_JOB_STATUSES, {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  errorMap: (_issue, _ctx) => {
    return { message: `Status must be one of: ${EXECUTION_JOB_STATUSES.join(', ')}` };
  }
});

// Insert schema - for creating new execution jobs
export const insertExecutionJobSchema = createInsertSchema(executionJobs, {
  status: statusSchema,
  parameters: jobParametersSchema.optional(),
  startedAt: z.date().optional(),
  completedAt: z.date().optional(),
  errorMessage: z.string().max(1000).optional()
}).omit({
  id: true
});

// Select schema - for reading execution jobs
export const selectExecutionJobSchema = createSelectSchema(executionJobs, {
  status: statusSchema,
  parameters: jobParametersSchema.optional()
});

// Update schema - for modifying execution jobs
export const updateExecutionJobSchema = insertExecutionJobSchema.partial();

/**
 * TypeScript Types
 * 
 * Inferred types for TypeScript integration throughout the application.
 * These provide compile-time type safety for bot execution systems.
 */
export type ExecutionJob = typeof executionJobs.$inferSelect;
export type NewExecutionJob = typeof executionJobs.$inferInsert;
export type ExecutionJobUpdate = Partial<NewExecutionJob>;

/**
 * Execution Job Validation Types
 * 
 * Zod-validated types for runtime type checking and API validation.
 */
export type ValidatedExecutionJob = z.infer<typeof selectExecutionJobSchema>;
export type ValidatedNewExecutionJob = z.infer<typeof insertExecutionJobSchema>;
export type ValidatedExecutionJobUpdate = z.infer<typeof updateExecutionJobSchema>;

/**
 * Compatibility Types
 * 
 * Types that maintain compatibility with existing bot service interfaces.
 * These bridge the gap between bot management and database systems.
 */
export interface CompatibleExecutionJob {
  id: string;
  userId: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  parameters?: JobParameters;
  startedAt?: Date;
  completedAt?: Date;
  errorMessage?: string;
  duration?: number; // Computed field for API responses
}

export interface BotJobRequest {
  userId: string;
  parameters: JobParameters;
  priority?: number;
  retryCount?: number;
}

/**
 * Utility Functions
 * 
 * Helper functions for execution job management and status tracking.
 */

// Calculate job duration in milliseconds
export const calculateJobDuration = (job: ExecutionJob): number | null => {
  if (!job.startedAt) return null;
  const endTime = job.completedAt || new Date();
  return endTime.getTime() - job.startedAt.getTime();
};

// Check if a job is in a terminal state
export const isTerminalStatus = (status: ExecutionJobStatus): boolean => {
  return status === 'COMPLETED' || status === 'FAILED';
};

// Check if a job is currently active
export const isActiveJob = (job: ExecutionJob): boolean => {
  return job.status === 'RUNNING' || job.status === 'PENDING';
};

// Validate job parameters for specific operation types
export const validateJobParameters = (parameters: JobParameters, operationType: string): boolean => {
  switch (operationType) {
    case 'TRADE_EXECUTION':
      return !!(parameters.symbol && parameters.side && parameters.amount);
    case 'PORTFOLIO_REBALANCE':
      return !!(parameters.strategy);
    case 'RISK_MANAGEMENT':
      return !!(parameters.riskProfile);
    default:
      return true; // Allow custom operations
  }
};

// Convert to API format with computed fields
export const convertToApiFormat = (dbJob: ExecutionJob): CompatibleExecutionJob => ({
  id: dbJob.id,
  userId: dbJob.userId,
  status: dbJob.status,
  parameters: dbJob.parameters || undefined,
  startedAt: dbJob.startedAt || undefined,
  completedAt: dbJob.completedAt || undefined,
  errorMessage: dbJob.errorMessage || undefined,
  duration: calculateJobDuration(dbJob) || undefined
});

// Convert from bot service format
export const convertFromBotFormat = (botRequest: BotJobRequest): NewExecutionJob => ({
  userId: botRequest.userId,
  status: 'PENDING' as ExecutionJobStatus,
  parameters: botRequest.parameters,
  startedAt: undefined,
  completedAt: undefined,
  errorMessage: undefined
});

/**
 * Job Queue Management Types
 * 
 * Types for managing job queues and batch operations.
 */
export interface JobQueueStats {
  pending: number;
  running: number;
  completed: number;
  failed: number;
  totalJobs: number;
}

export interface JobBatchRequest {
  userId: string;
  jobs: Array<{
    parameters: JobParameters;
    priority?: number;
  }>;
}