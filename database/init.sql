-- XORJ Production Database Initialization
-- PostgreSQL initialization script for production deployment

\c postgres;

-- Create the main database if it doesn't exist
SELECT 'CREATE DATABASE xorj_bot_state'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'xorj_bot_state')\gexec

-- Connect to the main database
\c xorj_bot_state;

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create roles and permissions
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'xorj_app') THEN
        CREATE ROLE xorj_app WITH LOGIN PASSWORD '${DATABASE_PASSWORD}';
        -- WARNING: Replace ${DATABASE_PASSWORD} with a secure password before running this script
    END IF;
END
$$;

-- Grant permissions
GRANT CONNECT ON DATABASE xorj_bot_state TO xorj_app;
GRANT USAGE ON SCHEMA public TO xorj_app;
GRANT CREATE ON SCHEMA public TO xorj_app;

-- Grant permissions on all current and future tables
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO xorj_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO xorj_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO xorj_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO xorj_app;

-- Create indexes for performance
-- Note: These will be created by Drizzle migrations, but we can add additional ones here

-- Performance monitoring table (optional)
CREATE TABLE IF NOT EXISTS performance_metrics (
    id SERIAL PRIMARY KEY,
    metric_name VARCHAR(100) NOT NULL,
    metric_value DECIMAL(10,4) NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_performance_metrics_name_timestamp 
ON performance_metrics(metric_name, timestamp DESC);

-- Audit log table (optional)
CREATE TABLE IF NOT EXISTS audit_log (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(100),
    action VARCHAR(100) NOT NULL,
    resource VARCHAR(100),
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_user_timestamp 
ON audit_log(user_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_action_timestamp 
ON audit_log(action, timestamp DESC);

-- Health check function
CREATE OR REPLACE FUNCTION health_check()
RETURNS TABLE(status TEXT, timestamp TIMESTAMP WITH TIME ZONE) AS $$
BEGIN
    RETURN QUERY SELECT 'healthy'::TEXT, NOW();
END;
$$ LANGUAGE plpgsql;

-- Log database initialization
INSERT INTO performance_metrics (metric_name, metric_value, metadata) 
VALUES ('database_initialized', 1, '{"version": "1.0", "environment": "production"}')
ON CONFLICT DO NOTHING;

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'XORJ database initialization completed successfully';
END $$;