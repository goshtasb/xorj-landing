-- Add missing bot_states table for performance optimization

CREATE TABLE IF NOT EXISTS bot_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_vault_address TEXT NOT NULL UNIQUE,
  is_enabled BOOLEAN DEFAULT true,
  current_strategy TEXT,
  risk_parameters JSONB DEFAULT '{}',
  performance_metrics JSONB DEFAULT '{}',
  last_execution_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_bot_states_user_vault_address ON bot_states(user_vault_address);
CREATE INDEX IF NOT EXISTS idx_bot_states_is_enabled ON bot_states(is_enabled);
CREATE INDEX IF NOT EXISTS idx_bot_states_last_execution ON bot_states(last_execution_at);

-- Insert test bot state
INSERT INTO bot_states (
  user_vault_address, 
  is_enabled, 
  current_strategy, 
  risk_parameters, 
  performance_metrics,
  last_execution_at
)
VALUES (
  '5QfzCCipXjebAfHpMhCJAoxUJL2TyqM5p8tCFLjsPbmh',
  true,
  'copy_trading',
  '{"maxTradeAmount": 5000, "slippageTolerance": 1.0, "riskProfile": "Balanced"}',
  '{"totalTrades": 1, "successRate": 100, "totalProfit": 148.5}',
  NOW() - INTERVAL '1 hour'
)
ON CONFLICT (user_vault_address) DO UPDATE SET
  is_enabled = EXCLUDED.is_enabled,
  current_strategy = EXCLUDED.current_strategy,
  risk_parameters = EXCLUDED.risk_parameters,
  performance_metrics = EXCLUDED.performance_metrics,
  last_execution_at = EXCLUDED.last_execution_at,
  updated_at = NOW();