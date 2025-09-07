-- XORJ Supabase Migration Script
-- This migrates user-facing tables to Supabase while keeping quantitative data local

-- =====================================================
-- USER SETTINGS TABLE (for Supabase)
-- =====================================================
CREATE TABLE IF NOT EXISTS user_settings (
    wallet_address VARCHAR(50) PRIMARY KEY,
    bot_enabled BOOLEAN DEFAULT false,
    risk_level VARCHAR(20) DEFAULT 'medium' CHECK (risk_level IN ('low', 'medium', 'high')),
    max_trade_size DECIMAL(10, 2) DEFAULT 100.00,
    slippage_tolerance DECIMAL(5, 4) DEFAULT 0.01,
    stop_loss_percentage DECIMAL(5, 4) DEFAULT 0.05,
    take_profit_percentage DECIMAL(5, 4) DEFAULT 0.10,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add RLS (Row Level Security) for user_settings
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only view/edit their own settings
CREATE POLICY "Users can view own settings" ON user_settings
    FOR SELECT USING (wallet_address = auth.jwt() ->> 'wallet_address');

CREATE POLICY "Users can update own settings" ON user_settings
    FOR UPDATE USING (wallet_address = auth.jwt() ->> 'wallet_address');

CREATE POLICY "Users can insert own settings" ON user_settings
    FOR INSERT WITH CHECK (wallet_address = auth.jwt() ->> 'wallet_address');

-- =====================================================
-- BOT STATES TABLE (for Supabase) 
-- =====================================================
CREATE TABLE IF NOT EXISTS bot_states (
    id SERIAL PRIMARY KEY,
    user_wallet VARCHAR(50) NOT NULL,
    enabled BOOLEAN DEFAULT false,
    last_execution_at TIMESTAMP WITH TIME ZONE,
    total_trades_executed INTEGER DEFAULT 0,
    successful_trades INTEGER DEFAULT 0,
    failed_trades INTEGER DEFAULT 0,
    total_profit_loss DECIMAL(15, 6) DEFAULT 0,
    last_error TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT fk_user_wallet FOREIGN KEY (user_wallet) 
        REFERENCES user_settings(wallet_address) ON DELETE CASCADE
);

-- Index for faster lookups
CREATE INDEX idx_bot_states_user_wallet ON bot_states(user_wallet);
CREATE INDEX idx_bot_states_enabled ON bot_states(enabled);

-- Add RLS for bot_states
ALTER TABLE bot_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own bot state" ON bot_states
    FOR SELECT USING (user_wallet = auth.jwt() ->> 'wallet_address');

CREATE POLICY "Users can update own bot state" ON bot_states
    FOR UPDATE USING (user_wallet = auth.jwt() ->> 'wallet_address');

-- =====================================================
-- TRADES TABLE (for Supabase)
-- =====================================================
CREATE TABLE IF NOT EXISTS trades (
    id SERIAL PRIMARY KEY,
    user_vault_address VARCHAR(50) NOT NULL,
    transaction_signature VARCHAR(100) UNIQUE,
    from_token_address VARCHAR(50),
    to_token_address VARCHAR(50),
    amount_in DECIMAL(20, 9),
    expected_amount_out DECIMAL(20, 9),
    actual_amount_out DECIMAL(20, 9),
    price_impact DECIMAL(10, 6),
    gas_fee DECIMAL(15, 9),
    status VARCHAR(20) DEFAULT 'PENDING',
    error_message TEXT,
    executed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT fk_user_vault FOREIGN KEY (user_vault_address) 
        REFERENCES user_settings(wallet_address) ON DELETE CASCADE
);

-- Indexes for trades
CREATE INDEX idx_trades_user_vault ON trades(user_vault_address);
CREATE INDEX idx_trades_status ON trades(status);
CREATE INDEX idx_trades_created_at ON trades(created_at DESC);

-- Add RLS for trades
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own trades" ON trades
    FOR SELECT USING (user_vault_address = auth.jwt() ->> 'wallet_address');

-- =====================================================
-- REAL-TIME SUBSCRIPTIONS
-- =====================================================
-- Enable real-time for bot_states changes
ALTER PUBLICATION supabase_realtime ADD TABLE bot_states;

-- Enable real-time for new trades
ALTER PUBLICATION supabase_realtime ADD TABLE trades;

-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================
-- Function to update bot statistics after trade
CREATE OR REPLACE FUNCTION update_bot_stats_after_trade()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'CONFIRMED' THEN
        UPDATE bot_states
        SET 
            total_trades_executed = total_trades_executed + 1,
            successful_trades = successful_trades + 1,
            total_profit_loss = total_profit_loss + 
                COALESCE(NEW.actual_amount_out - NEW.amount_in, 0),
            last_execution_at = NEW.executed_at,
            last_updated = NOW()
        WHERE user_wallet = NEW.user_vault_address;
    ELSIF NEW.status = 'FAILED' THEN
        UPDATE bot_states
        SET 
            total_trades_executed = total_trades_executed + 1,
            failed_trades = failed_trades + 1,
            last_error = NEW.error_message,
            last_execution_at = NEW.executed_at,
            last_updated = NOW()
        WHERE user_wallet = NEW.user_vault_address;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updating bot stats
CREATE TRIGGER trigger_update_bot_stats
AFTER INSERT OR UPDATE ON trades
FOR EACH ROW
EXECUTE FUNCTION update_bot_stats_after_trade();

-- =====================================================
-- MIGRATION NOTES
-- =====================================================
-- Tables to keep LOCAL (in xorj_quant):
-- - parsed_raydium_swaps (sensitive trading data)
-- - trader_rankings (proprietary algorithms)
-- - token_metadata (can be cached locally)
-- - discovered_traders (competitive advantage)
-- 
-- Tables moved to SUPABASE:
-- - user_settings (user preferences)
-- - bot_states (bot status for UI)
-- - trades (user's trade history)