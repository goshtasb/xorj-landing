-- Initial Schema Migration for XORJ Trading Bot
-- Generated: 2024-01-01
-- Author: Drizzle ORM Migration System
-- 
-- This migration creates the complete database schema as defined in the PRD
-- Requirements 4.2: Mandatory Migration Management

-- Enable required PostgreSQL extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table - Core user identity linked to wallet addresses
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wallet_address" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_wallet_address_unique" UNIQUE("wallet_address")
);

-- User Settings table - User preferences and risk profiles
CREATE TABLE IF NOT EXISTS "user_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"risk_profile" text DEFAULT 'BALANCED' NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "user_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);

-- Scoring Runs table - Tracks quantitative analysis jobs
CREATE TABLE IF NOT EXISTS "scoring_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"error_message" text
);

-- Trader Scores table - Stores XORJ Trust Scores and metrics
CREATE TABLE IF NOT EXISTS "trader_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"wallet_address" text NOT NULL,
	"xorj_trust_score" real NOT NULL,
	"metrics" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trader_scores_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "scoring_runs"("id")
);

-- Execution Jobs table - Tracks bot trade execution jobs
CREATE TABLE IF NOT EXISTS "execution_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"parameters" jsonb,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"error_message" text,
	CONSTRAINT "execution_jobs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);

-- Trades table - Stores executed trade records with duplicate prevention
CREATE TABLE IF NOT EXISTS "trades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid,
	"user_id" uuid NOT NULL,
	"transaction_hash" text,
	"symbol" text NOT NULL,
	"side" text NOT NULL,
	"quantity" real NOT NULL,
	"price" real,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"trade_data" jsonb,
	"executed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trades_transaction_hash_unique" UNIQUE("transaction_hash"),
	CONSTRAINT "trades_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "execution_jobs"("id") ON DELETE SET NULL,
	CONSTRAINT "trades_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);

-- Waitlist Signups table - Early user registrations and marketing
CREATE TABLE IF NOT EXISTS "waitlist_signups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"wallet_address" text,
	"referral_code" text,
	"signup_source" text DEFAULT 'DIRECT' NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notified_at" timestamp with time zone,
	CONSTRAINT "waitlist_signups_email_unique" UNIQUE("email")
);

-- Create indexes for performance optimization
CREATE INDEX IF NOT EXISTS "idx_trader_scores_wallet_address" ON "trader_scores" ("wallet_address");
CREATE INDEX IF NOT EXISTS "idx_trader_scores_run_id" ON "trader_scores" ("run_id");
CREATE INDEX IF NOT EXISTS "idx_trades_user_id" ON "trades" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_trades_symbol" ON "trades" ("symbol");
CREATE INDEX IF NOT EXISTS "idx_trades_status" ON "trades" ("status");
CREATE INDEX IF NOT EXISTS "idx_trades_executed_at" ON "trades" ("executed_at");
CREATE INDEX IF NOT EXISTS "idx_execution_jobs_user_id" ON "execution_jobs" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_execution_jobs_status" ON "execution_jobs" ("status");
CREATE INDEX IF NOT EXISTS "idx_waitlist_signups_status" ON "waitlist_signups" ("status");
CREATE INDEX IF NOT EXISTS "idx_waitlist_signups_signup_source" ON "waitlist_signups" ("signup_source");
CREATE INDEX IF NOT EXISTS "idx_scoring_runs_status" ON "scoring_runs" ("status");

-- Add constraints for enum validation
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_risk_profile_check" 
  CHECK ("risk_profile" IN ('CONSERVATIVE', 'BALANCED', 'AGGRESSIVE'));

ALTER TABLE "scoring_runs" ADD CONSTRAINT "scoring_runs_status_check" 
  CHECK ("status" IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED'));

ALTER TABLE "execution_jobs" ADD CONSTRAINT "execution_jobs_status_check" 
  CHECK ("status" IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED'));

ALTER TABLE "trades" ADD CONSTRAINT "trades_status_check" 
  CHECK ("status" IN ('PENDING', 'CONFIRMED', 'FAILED', 'CANCELLED'));

ALTER TABLE "trades" ADD CONSTRAINT "trades_side_check" 
  CHECK ("side" IN ('BUY', 'SELL'));

ALTER TABLE "waitlist_signups" ADD CONSTRAINT "waitlist_signups_status_check" 
  CHECK ("status" IN ('PENDING', 'APPROVED', 'NOTIFIED', 'CONVERTED'));

ALTER TABLE "waitlist_signups" ADD CONSTRAINT "waitlist_signups_signup_source_check" 
  CHECK ("signup_source" IN ('DIRECT', 'SOCIAL_MEDIA', 'REFERRAL', 'SEARCH', 'ADVERTISING', 'PARTNERSHIP', 'EVENT', 'OTHER'));

-- Create migration metadata table
CREATE TABLE IF NOT EXISTS "__drizzle_migrations__" (
	"id" serial PRIMARY KEY,
	"hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Insert migration record
INSERT INTO "__drizzle_migrations__" ("hash") VALUES ('0001_initial_schema_drizzle_migration');