-- XORJ Staging Database Initialization
-- Real production-like schema with chaos testing tables

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(255) PRIMARY KEY,
    wallet_address VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User Settings table
CREATE TABLE IF NOT EXISTS user_settings (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) REFERENCES users(id) ON DELETE CASCADE,
    risk_profile VARCHAR(50) DEFAULT 'BALANCED',
    max_trade_amount DECIMAL(20, 6),
    slippage_tolerance DECIMAL(5, 2) DEFAULT 1.0,
    bot_enabled BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Scoring runs table
CREATE TABLE IF NOT EXISTS scoring_runs (
    id VARCHAR(255) PRIMARY KEY,
    status VARCHAR(50) NOT NULL,
    traders_analyzed INTEGER DEFAULT 0,
    start_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    end_time TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Trader scores table
CREATE TABLE IF NOT EXISTS trader_scores (
    id VARCHAR(255) PRIMARY KEY,
    run_id VARCHAR(255) REFERENCES scoring_runs(id) ON DELETE CASCADE,
    wallet_address VARCHAR(255) NOT NULL,
    xorj_trust_score DECIMAL(10, 2) NOT NULL,
    win_rate DECIMAL(5, 2),
    total_return DECIMAL(10, 2),
    max_drawdown DECIMAL(5, 2),
    trade_count INTEGER,
    sharpe_ratio DECIMAL(10, 4),
    eligibility_status VARCHAR(50) DEFAULT 'eligible',
    raw_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Execution jobs table
CREATE TABLE IF NOT EXISTS execution_jobs (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255) REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL, -- PENDING, RUNNING, COMPLETED, FAILED
    target_trader VARCHAR(255),
    job_type VARCHAR(50) DEFAULT 'REBALANCE',
    priority INTEGER DEFAULT 0,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    error_message TEXT,
    metadata JSONB,
    scheduled_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Trades table
CREATE TABLE IF NOT EXISTS trades (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255) REFERENCES users(id) ON DELETE CASCADE,
    execution_job_id VARCHAR(255) REFERENCES execution_jobs(id),
    from_token VARCHAR(255) NOT NULL,
    to_token VARCHAR(255) NOT NULL,
    amount DECIMAL(20, 6) NOT NULL,
    status VARCHAR(50) NOT NULL, -- PENDING, SUBMITTED, CONFIRMED, FAILED
    slippage DECIMAL(5, 2),
    transaction_signature VARCHAR(255),
    block_slot BIGINT,
    confirmation_time TIMESTAMP WITH TIME ZONE,
    gas_used BIGINT,
    gas_price DECIMAL(20, 6),
    actual_amount_out DECIMAL(20, 6),
    price_impact DECIMAL(5, 2),
    jupiter_route_info JSONB,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- System health table for chaos testing
CREATE TABLE IF NOT EXISTS system_health (
    id SERIAL PRIMARY KEY,
    service_name VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL, -- HEALTHY, DEGRADED, DOWN
    response_time_ms INTEGER,
    error_count INTEGER DEFAULT 0,
    last_error TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Chaos test results table
CREATE TABLE IF NOT EXISTS chaos_test_results (
    id SERIAL PRIMARY KEY,
    test_type VARCHAR(100) NOT NULL, -- RPC_FAILURE, DB_FAILURE, ONCHAIN_FAILURE
    test_description TEXT,
    status VARCHAR(50) NOT NULL, -- RUNNING, PASSED, FAILED
    failure_injected_at TIMESTAMP WITH TIME ZONE,
    recovery_detected_at TIMESTAMP WITH TIME ZONE,
    recovery_time_ms INTEGER,
    expected_behavior TEXT,
    actual_behavior TEXT,
    assertions_passed INTEGER DEFAULT 0,
    assertions_failed INTEGER DEFAULT 0,
    test_data JSONB,
    error_logs TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Alert notifications table
CREATE TABLE IF NOT EXISTS alert_notifications (
    id SERIAL PRIMARY KEY,
    alert_type VARCHAR(100) NOT NULL,
    severity VARCHAR(50) NOT NULL, -- LOW, MEDIUM, HIGH, CRITICAL
    message TEXT NOT NULL,
    service_name VARCHAR(100),
    details JSONB,
    acknowledged BOOLEAN DEFAULT false,
    acknowledged_by VARCHAR(255),
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_trader_scores_run_id_score ON trader_scores(run_id, xorj_trust_score DESC);
CREATE INDEX IF NOT EXISTS idx_trades_user_created ON trades(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trades_status ON trades(status);
CREATE INDEX IF NOT EXISTS idx_execution_jobs_status ON execution_jobs(status);
CREATE INDEX IF NOT EXISTS idx_execution_jobs_user_created ON execution_jobs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scoring_runs_created ON scoring_runs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_health_service_created ON system_health(service_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chaos_test_results_type_created ON chaos_test_results(test_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alert_notifications_severity_created ON alert_notifications(severity, created_at DESC);

-- Trigger for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers to relevant tables
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_user_settings_updated_at BEFORE UPDATE ON user_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_scoring_runs_updated_at BEFORE UPDATE ON scoring_runs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_execution_jobs_updated_at BEFORE UPDATE ON execution_jobs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_trades_updated_at BEFORE UPDATE ON trades FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_chaos_test_results_updated_at BEFORE UPDATE ON chaos_test_results FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Seed test data for staging
INSERT INTO users (id, wallet_address) VALUES 
    ('staging-user-1', 'StAgInGtEsT1234567890ABCDEFabcdef12345678'),
    ('staging-user-2', 'StAgInGtEsT9876543210ZYXWVUzyxwvu98765432')
ON CONFLICT (id) DO NOTHING;

INSERT INTO user_settings (user_id, risk_profile, bot_enabled, max_trade_amount, slippage_tolerance) VALUES 
    ('staging-user-1', 'AGGRESSIVE', true, 1000.0, 2.0),
    ('staging-user-2', 'CONSERVATIVE', true, 500.0, 1.0)
ON CONFLICT DO NOTHING;

-- Initial system health entries
INSERT INTO system_health (service_name, status, response_time_ms) VALUES 
    ('quantitative-engine', 'HEALTHY', 150),
    ('trade-execution-bot', 'HEALTHY', 200),
    ('fastapi-gateway', 'HEALTHY', 50),
    ('database', 'HEALTHY', 10),
    ('redis', 'HEALTHY', 5)
ON CONFLICT DO NOTHING;

-- Grant permissions
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO xorj_staging_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO xorj_staging_user;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO xorj_staging_user;