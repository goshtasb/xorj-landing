-- Migration: Add client_order_id field and idempotency constraint to trades table
-- Version: 1.1
-- Purpose: Fix Critical Flaw #1 - Database-level duplicate trade prevention

-- Step 1: Add the client_order_id column
ALTER TABLE trades ADD COLUMN IF NOT EXISTS client_order_id TEXT;

-- Step 2: Set default values for existing trades (use existing id as fallback)
UPDATE trades 
SET client_order_id = COALESCE(client_order_id, 'legacy_' || id || '_' || EXTRACT(EPOCH FROM created_at))
WHERE client_order_id IS NULL;

-- Step 3: Make client_order_id NOT NULL
ALTER TABLE trades ALTER COLUMN client_order_id SET NOT NULL;

-- Step 4: Add the critical UNIQUE constraint for duplicate prevention
ALTER TABLE trades ADD CONSTRAINT trade_idempotency_key UNIQUE (user_vault_address, client_order_id);

-- Step 5: Add index for efficient idempotency lookups
CREATE INDEX IF NOT EXISTS idx_trades_client_order_id ON trades(client_order_id);
CREATE INDEX IF NOT EXISTS idx_trades_idempotency_lookup ON trades(user_vault_address, client_order_id);

-- Step 6: Update table comment
COMMENT ON COLUMN trades.client_order_id IS 'Idempotency key from bot to prevent duplicate trades - CRITICAL for race condition prevention';
COMMENT ON CONSTRAINT trade_idempotency_key ON trades IS 'Database-level duplicate trade prevention constraint';

-- Verification queries (uncomment to test after migration)
-- SELECT column_name, is_nullable, column_default 
-- FROM information_schema.columns 
-- WHERE table_name = 'trades' AND column_name = 'client_order_id';

-- SELECT constraint_name, constraint_type 
-- FROM information_schema.table_constraints 
-- WHERE table_name = 'trades' AND constraint_name = 'trade_idempotency_key';