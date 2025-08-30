-- Add Investment Amount Column to User Settings
-- Generated: 2025-01-20
-- Author: XORJ Investment Amount Integration
-- 
-- This migration adds the investment_amount column to the user_settings table
-- to support user-configurable investment amounts for trading bot operations.

-- Add investment_amount column to user_settings table
ALTER TABLE "user_settings" 
ADD COLUMN IF NOT EXISTS "investment_amount" DECIMAL(20,8) DEFAULT 1000.00 NOT NULL;

-- Update existing records to have default investment amount
UPDATE "user_settings" 
SET "investment_amount" = 1000.00 
WHERE "investment_amount" IS NULL;

-- Add constraint to ensure investment amount is within reasonable bounds
ALTER TABLE "user_settings" 
ADD CONSTRAINT "user_settings_investment_amount_check" 
  CHECK ("investment_amount" >= 1 AND "investment_amount" <= 1000000);

-- Create index for performance optimization on investment amount queries
CREATE INDEX IF NOT EXISTS "idx_user_settings_investment_amount" ON "user_settings" ("investment_amount");

-- Insert migration record
INSERT INTO "__drizzle_migrations__" ("hash") VALUES ('0002_add_investment_amount_drizzle_migration');