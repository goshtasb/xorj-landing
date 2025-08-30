-- Update Production Database Schema to Match Application Expectations
-- This aligns our production schema with what the application code expects

-- Drop existing tables to recreate with correct schema
DROP TABLE IF EXISTS waitlist_signups CASCADE;
DROP TABLE IF EXISTS trades CASCADE;
DROP TABLE IF EXISTS trader_scores CASCADE;
DROP TABLE IF EXISTS execution_jobs CASCADE;
DROP TABLE IF EXISTS scoring_runs CASCADE;
DROP TABLE IF EXISTS user_settings CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS audit_log CASCADE;
DROP TABLE IF EXISTS compliance_events CASCADE;

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- scoring_runs: Tracks the state of the Quantitative Engine's analysis jobs
CREATE TABLE scoring_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create index for efficient status queries
CREATE INDEX idx_scoring_runs_status ON scoring_runs(status);
CREATE INDEX idx_scoring_runs_created_at ON scoring_runs(created_at DESC);

-- trader_scores: Stores the historical results from the Quantitative Engine
CREATE TABLE trader_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES scoring_runs(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  xorj_trust_score FLOAT NOT NULL CHECK (xorj_trust_score >= 0),
  metrics JSONB, -- Stores the raw metrics payload
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for efficient queries
CREATE INDEX idx_trader_scores_run_id ON trader_scores(run_id);
CREATE INDEX idx_trader_scores_wallet_address ON trader_scores(wallet_address);
CREATE INDEX idx_trader_scores_trust_score ON trader_scores(xorj_trust_score DESC);
CREATE INDEX idx_trader_scores_created_at ON trader_scores(created_at DESC);

-- execution_jobs: Tracks the state of the Trade Execution Bot's runs
CREATE TABLE execution_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED')),
  trigger_reason TEXT, -- e.g., 'SCHEDULED_RUN', 'MANUAL_TRIGGER', 'RECOVERY_RUN'
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for efficient status and time-based queries
CREATE INDEX idx_execution_jobs_status ON execution_jobs(status);
CREATE INDEX idx_execution_jobs_created_at ON execution_jobs(created_at DESC);
CREATE INDEX idx_execution_jobs_trigger_reason ON execution_jobs(trigger_reason);

-- trades: An immutable log of every trade attempt (most critical table for preventing duplicates)
CREATE TABLE trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES execution_jobs(id) ON DELETE CASCADE,
  user_vault_address TEXT NOT NULL,
  client_order_id TEXT NOT NULL, -- Idempotency key from bot to prevent duplicates
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'SUBMITTED', 'CONFIRMED', 'FAILED')),
  from_token_address TEXT NOT NULL,
  to_token_address TEXT NOT NULL,
  amount_in BIGINT NOT NULL CHECK (amount_in > 0),
  expected_amount_out BIGINT NOT NULL CHECK (expected_amount_out > 0),
  actual_amount_out BIGINT, -- Populated after confirmation
  transaction_signature TEXT UNIQUE, -- Populated after submission, must be unique
  slippage_realized FLOAT, -- Actual slippage experienced
  gas_fee BIGINT, -- Transaction fee in lamports
  error_message TEXT, -- Error details for failed trades
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  -- CRITICAL: Database-level duplicate prevention constraint
  -- This prevents race conditions at the application layer
  CONSTRAINT trade_idempotency_key UNIQUE (user_vault_address, client_order_id)
);

-- Critical indexes for trade operations
CREATE INDEX idx_trades_job_id ON trades(job_id);
CREATE INDEX idx_trades_user_vault_address ON trades(user_vault_address);
CREATE INDEX idx_trades_client_order_id ON trades(client_order_id);
CREATE INDEX idx_trades_status ON trades(status);
CREATE INDEX idx_trades_transaction_signature ON trades(transaction_signature);
CREATE INDEX idx_trades_created_at ON trades(created_at DESC);

-- Composite index for efficient idempotency queries (redundant with UNIQUE constraint but useful for lookups)
CREATE INDEX idx_trades_idempotency_lookup ON trades(user_vault_address, client_order_id);

-- Legacy composite index for fallback duplicate prevention queries (keep for backward compatibility)
CREATE INDEX idx_trades_duplicate_check ON trades(user_vault_address, from_token_address, to_token_address, amount_in, status);

-- user_settings: Replace in-memory user settings storage
CREATE TABLE user_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT NOT NULL UNIQUE,
  risk_profile TEXT NOT NULL DEFAULT 'Balanced' CHECK (risk_profile IN ('Conservative', 'Balanced', 'Aggressive')),
  settings JSONB NOT NULL DEFAULT '{}', -- Flexible settings storage
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for user settings queries
CREATE INDEX idx_user_settings_wallet_address ON user_settings(wallet_address);
CREATE INDEX idx_user_settings_risk_profile ON user_settings(risk_profile);

-- Audit log - Compliance and security tracking (additional for production)
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name VARCHAR(100) NOT NULL,
  operation VARCHAR(20) NOT NULL,
  user_id UUID,
  old_values JSONB,
  new_values JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Compliance events - Regulatory monitoring (additional for production)
CREATE TABLE compliance_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(100) NOT NULL,
  severity VARCHAR(20) NOT NULL,
  description TEXT NOT NULL,
  user_id UUID,
  metadata JSONB DEFAULT '{}',
  resolved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Additional performance indexes for production
CREATE INDEX idx_audit_log_table_name ON audit_log(table_name);
CREATE INDEX idx_audit_log_created_at ON audit_log(created_at);
CREATE INDEX idx_compliance_events_resolved ON compliance_events(resolved);

-- Insert production test data with correct schema
INSERT INTO scoring_runs (id, status, started_at, completed_at)
VALUES ('550e8400-e29b-41d4-a716-446655440001', 'COMPLETED', NOW() - INTERVAL '1 hour', NOW() - INTERVAL '30 minutes')
ON CONFLICT (id) DO UPDATE SET 
    status = EXCLUDED.status,
    completed_at = EXCLUDED.completed_at;

INSERT INTO trader_scores (run_id, wallet_address, xorj_trust_score, metrics)
VALUES 
    ('550e8400-e29b-41d4-a716-446655440001', 'prod-trader-001-anonymized', 35.3, '{"winRate": 78.0, "totalReturn": 85.0, "maxDrawdown": 8.0, "tradeCount": 150}'),
    ('550e8400-e29b-41d4-a716-446655440001', 'prod-trader-002-anonymized', 21.8, '{"winRate": 92.0, "totalReturn": 25.0, "maxDrawdown": 3.0, "tradeCount": 300}'),
    ('550e8400-e29b-41d4-a716-446655440001', 'prod-trader-003-anonymized', 0.0, '{"winRate": 55.0, "totalReturn": 180.0, "maxDrawdown": 45.0, "tradeCount": 50}')
ON CONFLICT DO NOTHING;

INSERT INTO user_settings (wallet_address, risk_profile, settings)
VALUES ('5QfzCCipXjebAfHpMhCJAoxUJL2TyqM5p8tCFLjsPbmh', 'Balanced', '{"maxTradeAmount": 5000.00, "slippageTolerance": 1.0, "autoCompound": false, "notificationsEnabled": true}')
ON CONFLICT (wallet_address) DO UPDATE SET 
    risk_profile = EXCLUDED.risk_profile,
    settings = EXCLUDED.settings,
    updated_at = NOW();

-- Insert sample execution job
INSERT INTO execution_jobs (status, trigger_reason, started_at, completed_at)
VALUES ('COMPLETED', 'MANUAL_TRIGGER', NOW() - INTERVAL '2 hours', NOW() - INTERVAL '1 hour')
ON CONFLICT DO NOTHING;

-- Insert sample trade with correct schema
INSERT INTO trades (
    job_id, user_vault_address, client_order_id, status, 
    from_token_address, to_token_address, amount_in, expected_amount_out, 
    actual_amount_out, transaction_signature, slippage_realized, gas_fee
)
SELECT 
    ej.id, 
    '5QfzCCipXjebAfHpMhCJAoxUJL2TyqM5p8tCFLjsPbmh', 
    'prod_order_sample_001', 
    'CONFIRMED',
    'So11111111111111111111111111111111111111112', -- SOL
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', -- USDC
    1000000000, -- 1 SOL in lamports
    150000000, -- Expected 150 USDC (micro units)
    148500000, -- Actual 148.5 USDC (with slippage)
    'prod_tx_sample_signature_001',
    0.01, -- 1% slippage
    5000 -- 0.005 SOL gas fee
FROM execution_jobs ej 
WHERE ej.status = 'COMPLETED'
LIMIT 1
ON CONFLICT (user_vault_address, client_order_id) DO NOTHING;