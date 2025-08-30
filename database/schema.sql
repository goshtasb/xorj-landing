-- XORJ Bot State Persistence & Reliability Database Schema
-- Version: 1.0
-- Description: PostgreSQL schema for stateless bot operations

-- Enable UUID extension for primary keys
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

-- Index for efficient user settings queries
CREATE INDEX idx_user_settings_wallet_address ON user_settings(wallet_address);

-- bot_states: Replace in-memory bot state storage
CREATE TABLE bot_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL UNIQUE, -- wallet_address or user identifier
  enabled BOOLEAN NOT NULL DEFAULT true,
  last_updated TIMESTAMPTZ DEFAULT now(),
  configuration JSONB DEFAULT '{}', -- Bot configuration settings
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for efficient bot state queries
CREATE INDEX idx_bot_states_user_id ON bot_states(user_id);
CREATE INDEX idx_bot_states_enabled ON bot_states(enabled);

-- Function to automatically update updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_scoring_runs_updated_at BEFORE UPDATE ON scoring_runs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_execution_jobs_updated_at BEFORE UPDATE ON execution_jobs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_trades_updated_at BEFORE UPDATE ON trades FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_user_settings_updated_at BEFORE UPDATE ON user_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_bot_states_updated_at BEFORE UPDATE ON bot_states FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create views for common queries
CREATE VIEW active_scoring_runs AS
SELECT * FROM scoring_runs WHERE status IN ('PENDING', 'RUNNING');

CREATE VIEW latest_trader_scores AS
SELECT DISTINCT ON (wallet_address) 
  wallet_address, 
  xorj_trust_score, 
  metrics, 
  created_at
FROM trader_scores 
ORDER BY wallet_address, created_at DESC;

CREATE VIEW active_execution_jobs AS
SELECT * FROM execution_jobs WHERE status IN ('PENDING', 'RUNNING');

CREATE VIEW pending_trades AS
SELECT * FROM trades WHERE status = 'PENDING';

CREATE VIEW submitted_trades AS
SELECT * FROM trades WHERE status = 'SUBMITTED';

-- Sample data insertion for testing (optional)
-- INSERT INTO bot_states (user_id, enabled, configuration) 
-- VALUES 
--   ('test_user_1', true, '{"risk_profile": "balanced", "max_position": 1000}'),
--   ('test_user_2', false, '{"risk_profile": "conservative", "max_position": 500}');

-- Grant permissions (adjust as needed for your deployment)
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO xorj_app_user;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO xorj_app_user;

COMMENT ON TABLE scoring_runs IS 'Tracks the state of Quantitative Engine analysis jobs';
COMMENT ON TABLE trader_scores IS 'Stores historical results from Quantitative Engine';
COMMENT ON TABLE execution_jobs IS 'Tracks the state of Trade Execution Bot runs';
COMMENT ON TABLE trades IS 'Immutable log of every trade attempt - CRITICAL: Database-level duplicate prevention via client_order_id UNIQUE constraint';
COMMENT ON TABLE user_settings IS 'User configuration and risk profile settings';
COMMENT ON TABLE bot_states IS 'Current bot enable/disable state per user';