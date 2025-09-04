/**
 * Drizzle Schema for swap_history table
 * PRD: Core Data Pipeline - Database Persistence
 * 
 * This table stores a clean, structured record of every relevant swap transaction
 * identified by the Transaction Parsing & Filtering Service.
 */

import { pgTable, uuid, text, timestamp, bigint, index } from 'drizzle-orm/pg-core';

export const swapHistory = pgTable(
  'swap_history',
  {
    // A unique identifier for this record
    id: uuid('id').primaryKey().defaultRandom(),
    
    // The wallet address of the trader who executed the swap
    // TODO: This should eventually be a foreign key to a `users` or `traders` table
    walletAddress: text('wallet_address').notNull(),
    
    // The unique Solana transaction signature. Enforcing uniqueness prevents duplicate records
    signature: text('signature').notNull().unique(),
    
    // The precise time the transaction was confirmed on-chain
    blockTime: timestamp('block_time', { withTimezone: true }).notNull(),
    
    // The mint address of the token that was sold
    fromTokenMint: text('from_token_mint').notNull(),
    
    // The mint address of the token that was bought
    toTokenMint: text('to_token_mint').notNull(),
    
    // The raw amount of the input token (in its smallest denomination, e.g., lamports)
    amountIn: bigint('amount_in', { mode: 'number' }).notNull(),
    
    // The raw amount of the output token received
    amountOut: bigint('amount_out', { mode: 'number' }).notNull(),
    
    // Timestamp for when this record was created in our system
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    // Create indexes to ensure fast queries by wallet and time
    walletAddressIdx: index('idx_swap_history_wallet_address').on(table.walletAddress),
    blockTimeIdx: index('idx_swap_history_block_time').on(table.blockTime.desc()),
  })
);

export type SwapHistory = typeof swapHistory.$inferSelect;
export type NewSwapHistory = typeof swapHistory.$inferInsert;