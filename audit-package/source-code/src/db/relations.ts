/**
 * Database Relations - Unified Relationship Definitions
 * 
 * This file defines all table relationships in one place to avoid circular
 * import issues and provide a clear view of the database structure.
 * 
 * @see PRD Section: Data Access Layer (DAL) Requirements
 */

import { relations } from 'drizzle-orm';
import { users } from './schema/users';
import { userSettings } from './schema/userSettings';
import { scoringRuns } from './schema/scoringRuns';
import { traderScores } from './schema/traderScores';
import { executionJobs } from './schema/executionJobs';
import { trades } from './schema/trades';

// User to UserSettings (1:1)
export const usersRelations = relations(users, ({ one, many }) => ({
  settings: one(userSettings, {
    fields: [users.id],
    references: [userSettings.userId]
  }),
  executionJobs: many(executionJobs),
  trades: many(trades)
}));

// UserSettings to User (1:1)
export const userSettingsRelationsUnified = relations(userSettings, ({ one }) => ({
  user: one(users, {
    fields: [userSettings.userId],
    references: [users.id]
  })
}));

// ScoringRuns to TraderScores (1:Many)
export const scoringRunsRelationsUnified = relations(scoringRuns, ({ many }) => ({
  traderScores: many(traderScores)
}));

// TraderScores to ScoringRuns (Many:1)
export const traderScoresRelationsUnified = relations(traderScores, ({ one }) => ({
  scoringRun: one(scoringRuns, {
    fields: [traderScores.runId],
    references: [scoringRuns.id]
  })
}));

// ExecutionJobs to User (Many:1) and Trades (1:Many)
export const executionJobsRelationsUnified = relations(executionJobs, ({ one, many }) => ({
  user: one(users, {
    fields: [executionJobs.userId],
    references: [users.id]
  }),
  trades: many(trades)
}));

// Trades to User (Many:1) and ExecutionJob (Many:1)
export const tradesRelationsUnified = relations(trades, ({ one }) => ({
  user: one(users, {
    fields: [trades.userId],
    references: [users.id]
  }),
  executionJob: one(executionJobs, {
    fields: [trades.jobId],
    references: [executionJobs.id]
  })
}));