-- XORJ Production Database Initialization
-- Financial Industry Standards Compliant Schema

-- Clean slate setup
DROP TABLE IF EXISTS waitlist_signups CASCADE;
DROP TABLE IF EXISTS trades CASCADE;
DROP TABLE IF EXISTS trader_scores CASCADE;
DROP TABLE IF EXISTS execution_jobs CASCADE;
DROP TABLE IF EXISTS scoring_runs CASCADE;
DROP TABLE IF EXISTS user_settings CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS audit_log CASCADE;
DROP TABLE IF EXISTS compliance_events CASCADE;

-- Drop and recreate ENUM types
DROP TYPE IF EXISTS risk_profile CASCADE;
DROP TYPE IF EXISTS scoring_run_status CASCADE;
DROP TYPE IF EXISTS execution_job_status CASCADE;
DROP TYPE IF EXISTS trade_status CASCADE;
DROP TYPE IF EXISTS trade_side CASCADE;
DROP TYPE IF EXISTS waitlist_status CASCADE;
DROP TYPE IF EXISTS signup_source CASCADE;

-- Create ENUM types for financial compliance
CREATE TYPE risk_profile AS ENUM ('conservative', 'balanced', 'aggressive');
CREATE TYPE scoring_run_status AS ENUM ('pending', 'processing', 'completed', 'failed');
CREATE TYPE execution_job_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'cancelled');
CREATE TYPE trade_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'cancelled');
CREATE TYPE trade_side AS ENUM ('buy', 'sell');
CREATE TYPE waitlist_status AS ENUM ('pending', 'approved', 'invited', 'converted');
CREATE TYPE signup_source AS ENUM ('website', 'referral', 'social', 'email', 'other');

-- Users table - Financial identity management
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_address VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- User settings - Risk and compliance preferences
CREATE TABLE user_settings (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    risk_profile risk_profile DEFAULT 'balanced' NOT NULL,
    max_trade_amount DECIMAL(20,8) DEFAULT 1000 NOT NULL,
    slippage_tolerance DECIMAL(5,2) DEFAULT 1.0 NOT NULL,
    auto_compound BOOLEAN DEFAULT false NOT NULL,
    notifications_enabled BOOLEAN DEFAULT true NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Scoring runs - Algorithm execution tracking
CREATE TABLE scoring_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status scoring_run_status DEFAULT 'pending' NOT NULL,
    traders_analyzed INTEGER DEFAULT 0 NOT NULL,
    total_traders INTEGER DEFAULT 0 NOT NULL,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Trader scores - XORJ Trust Score results
CREATE TABLE trader_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES scoring_runs(id) ON DELETE CASCADE,
    wallet_address VARCHAR(255) NOT NULL,
    xorj_trust_score DECIMAL(5,2) NOT NULL,
    win_rate DECIMAL(5,2),
    total_return DECIMAL(10,2),
    max_drawdown DECIMAL(5,2),
    trade_count INTEGER DEFAULT 0,
    percentile DECIMAL(5,2),
    trend VARCHAR(20),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Execution jobs - Trade automation tracking
CREATE TABLE execution_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status execution_job_status DEFAULT 'pending' NOT NULL,
    job_type VARCHAR(50) NOT NULL,
    target_trader VARCHAR(255),
    parameters JSONB DEFAULT '{}',
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Trades - Financial transaction records
CREATE TABLE trades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID REFERENCES execution_jobs(id) ON DELETE SET NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    symbol VARCHAR(50) NOT NULL,
    side trade_side NOT NULL,
    quantity DECIMAL(20,8) NOT NULL,
    price DECIMAL(20,8),
    status trade_status DEFAULT 'pending' NOT NULL,
    transaction_hash VARCHAR(255) UNIQUE,
    slippage DECIMAL(5,2),
    fees DECIMAL(20,8),
    executed_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Waitlist signups - User acquisition tracking
CREATE TABLE waitlist_signups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    wallet_address VARCHAR(255),
    status waitlist_status DEFAULT 'pending' NOT NULL,
    signup_source signup_source DEFAULT 'website' NOT NULL,
    referral_code VARCHAR(50),
    position INTEGER,
    notes TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Audit log - Compliance and security tracking
CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_name VARCHAR(100) NOT NULL,
    operation VARCHAR(20) NOT NULL,
    user_id UUID,
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Compliance events - Regulatory monitoring
CREATE TABLE compliance_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(100) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    description TEXT NOT NULL,
    user_id UUID,
    metadata JSONB DEFAULT '{}',
    resolved BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Performance indexes
CREATE INDEX idx_users_wallet_address ON users(wallet_address);
CREATE INDEX idx_trader_scores_wallet_address ON trader_scores(wallet_address);
CREATE INDEX idx_trader_scores_run_id ON trader_scores(run_id);
CREATE INDEX idx_trades_user_id ON trades(user_id);
CREATE INDEX idx_trades_symbol ON trades(symbol);
CREATE INDEX idx_trades_status ON trades(status);
CREATE INDEX idx_execution_jobs_user_id ON execution_jobs(user_id);
CREATE INDEX idx_execution_jobs_status ON execution_jobs(status);
CREATE INDEX idx_audit_log_table_name ON audit_log(table_name);
CREATE INDEX idx_audit_log_created_at ON audit_log(created_at);
CREATE INDEX idx_compliance_events_resolved ON compliance_events(resolved);

-- Insert production test data
INSERT INTO users (id, wallet_address)
VALUES ('550e8400-e29b-41d4-a716-446655440000', '5QfzCCipXjebAfHpMhCJAoxUJL2TyqM5p8tCFLjsPbmh')
ON CONFLICT (wallet_address) DO UPDATE SET updated_at = NOW();

INSERT INTO user_settings (user_id, risk_profile, max_trade_amount, slippage_tolerance)
VALUES ('550e8400-e29b-41d4-a716-446655440000', 'balanced', 5000.00, 1.0)
ON CONFLICT (user_id) DO UPDATE SET 
    risk_profile = EXCLUDED.risk_profile,
    max_trade_amount = EXCLUDED.max_trade_amount,
    updated_at = NOW();

INSERT INTO scoring_runs (id, status, traders_analyzed, total_traders, completed_at)
VALUES ('550e8400-e29b-41d4-a716-446655440001', 'completed', 3, 3, NOW())
ON CONFLICT (id) DO UPDATE SET 
    status = EXCLUDED.status,
    completed_at = EXCLUDED.completed_at;

INSERT INTO trader_scores (run_id, wallet_address, xorj_trust_score, win_rate, total_return, max_drawdown, trade_count, percentile, trend)
VALUES 
    ('550e8400-e29b-41d4-a716-446655440001', 'prod-trader-001-anonymized', 35.3, 78.00, 85.00, 8.00, 150, 90.0, 'UP'),
    ('550e8400-e29b-41d4-a716-446655440001', 'prod-trader-002-anonymized', 21.8, 92.00, 25.00, 3.00, 300, 70.0, 'STABLE'),
    ('550e8400-e29b-41d4-a716-446655440001', 'prod-trader-003-anonymized', 0.0, 55.00, 180.00, 45.00, 50, 10.0, 'DOWN')
ON CONFLICT DO NOTHING;

-- Insert sample execution job
INSERT INTO execution_jobs (user_id, status, job_type, target_trader, completed_at)
VALUES ('550e8400-e29b-41d4-a716-446655440000', 'completed', 'copy_trade', 'prod-trader-001-anonymized', NOW())
ON CONFLICT DO NOTHING;

-- Insert sample trade
INSERT INTO trades (user_id, symbol, side, quantity, price, status, transaction_hash, executed_at)
VALUES ('550e8400-e29b-41d4-a716-446655440000', 'SOL/USDC', 'buy', 10.0, 150.00, 'completed', 'prod_tx_sample_hash', NOW())
ON CONFLICT (transaction_hash) DO NOTHING;