/**
 * Trades Schema Definition - Drizzle ORM
 * 
 * Defines the trades table that stores executed trade records from the
 * XORJ Trading Bot execution system. Critical for duplicate prevention
 * and trading history analysis.
 * 
 * Features:
 * - Foreign key relationships to users and execution_jobs
 * - Transaction hash uniqueness for duplicate prevention
 * - Comprehensive trade data storage via JSONB
 * - Real-time status tracking
 * - Automatic timestamp management
 * 
 * Integrates with the Trade Execution Bot and portfolio analysis systems.
 * 
 * @see PRD Section: Unified Database Schema Definition
 * @see src/lib/botService.ts
 */

import { pgTable, uuid, text, real, jsonb, timestamp, unique } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { relations } from 'drizzle-orm';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import { users } from './users';
import { executionJobs } from './executionJobs';

/**
 * Trade Status Enumeration
 * 
 * Standardized status values for tracking trade execution lifecycle.
 * These match the bot service and blockchain transaction statuses.
 */
export const TRADE_STATUSES = ['PENDING', 'CONFIRMED', 'FAILED', 'CANCELLED'] as const;
export type TradeStatus = typeof TRADE_STATUSES[number];

/**
 * Trade Side Enumeration
 * 
 * Standardized trade direction values.
 */
export const TRADE_SIDES = ['BUY', 'SELL'] as const;
export type TradeSide = typeof TRADE_SIDES[number];

/**
 * Trade Data Schema
 * 
 * Defines the structure of the JSONB trade_data field.
 * This provides type safety for comprehensive trade information storage.
 */
export const tradeDataSchema = z.object({
  // Order details
  orderId: z.string().optional(),
  orderType: z.enum(['MARKET', 'LIMIT', 'STOP_LOSS', 'TAKE_PROFIT']).optional(),
  timeInForce: z.enum(['IOC', 'FOK', 'GTC']).optional(),
  
  // Price and quantity details
  requestedPrice: z.number().positive().optional(),
  executedPrice: z.number().positive().optional(),
  requestedQuantity: z.number().positive().optional(),
  executedQuantity: z.number().positive().optional(),
  averagePrice: z.number().positive().optional(),
  
  // Fees and costs
  tradingFee: z.number().optional(),
  networkFee: z.number().optional(),
  slippage: z.number().optional(),
  priceImpact: z.number().optional(),
  
  // Market data
  marketPrice: z.number().positive().optional(),
  bidPrice: z.number().positive().optional(),
  askPrice: z.number().positive().optional(),
  spread: z.number().optional(),
  
  // Execution details
  exchange: z.string().optional(),
  liquidityProvider: z.string().optional(),
  executionVenue: z.string().optional(),
  routingStrategy: z.string().optional(),
  
  // Timing information
  orderTimestamp: z.number().optional(),
  executionTimestamp: z.number().optional(),
  settlementTimestamp: z.number().optional(),
  
  // Risk and compliance
  riskScore: z.number().min(0).max(100).optional(),
  complianceFlags: z.array(z.string()).optional(),
  
  // Additional metadata
  tags: z.array(z.string()).optional(),
  notes: z.string().optional(),
  customData: z.record(z.unknown()).optional()
}).strict();

export type TradeData = z.infer<typeof tradeDataSchema>;

/**
 * Trades Table
 * 
 * Stores executed trade records with comprehensive transaction details.
 * Each trade represents a completed or attempted transaction execution.
 * 
 * SQL Equivalent:
 * CREATE TABLE trades (
 *   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 *   job_id UUID REFERENCES execution_jobs(id),
 *   user_id UUID REFERENCES users(id),
 *   transaction_hash TEXT UNIQUE,
 *   symbol TEXT NOT NULL,
 *   side TEXT NOT NULL,
 *   quantity FLOAT NOT NULL,
 *   price FLOAT,
 *   status TEXT NOT NULL DEFAULT 'PENDING',
 *   trade_data JSONB,
 *   executed_at TIMESTAMPTZ DEFAULT now()
 * );
 */
export const trades = pgTable('trades', {
  // Primary key - auto-generated UUID
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`)
    .notNull(),
  
  // Foreign key to execution_jobs table (optional - some trades may be manual)
  jobId: uuid('job_id')
    .references(() => executionJobs.id, { onDelete: 'set null' }),
  
  // Foreign key to users table
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  
  // Client order ID for idempotency - must be unique per user
  clientOrderId: text('client_order_id')
    .notNull(),
  
  // Blockchain transaction hash - unique for duplicate prevention
  transactionHash: text('transaction_hash')
    .unique(),
  
  // Trading pair symbol (e.g., 'SOL/USDC', 'BTC/USD')
  symbol: text('symbol')
    .notNull(),
  
  // Trade direction - BUY or SELL
  side: text('side', { enum: TRADE_SIDES })
    .notNull(),
  
  // Trade quantity/amount
  quantity: real('quantity')
    .notNull(),
  
  // Execution price (may be null for failed trades)
  price: real('price'),
  
  // Trade status - tracks execution state
  status: text('status', { enum: TRADE_STATUSES })
    .notNull()
    .default('PENDING'),
  
  // Comprehensive trade data in JSONB format
  tradeData: jsonb('trade_data').$type<TradeData>(),
  
  // Execution timestamp - when the trade was executed
  executedAt: timestamp('executed_at', { 
    withTimezone: true, 
    mode: 'date' 
  })
    .default(sql`now()`)
    .notNull()
}, (table) => ({
  // Unique constraint for idempotency - one client_order_id per user
  tradeIdempotencyKey: unique('trade_idempotency_key').on(table.userId, table.clientOrderId)
}));

/**
 * Drizzle Relations
 * 
 * Define relationships between trades and related tables.
 * This enables type-safe joins and cascading operations.
 */
export const tradesRelations = relations(trades, ({ one }) => ({
  user: one(users, {
    fields: [trades.userId],
    references: [users.id]
  }),
  executionJob: one(executionJobs, {
    fields: [trades.jobId],
    references: [executionJobs.id]
  })
}));

/**
 * Zod Validation Schemas
 * 
 * Type-safe validation schemas for trades table operations.
 * These ensure data integrity and provide runtime validation.
 */

// Status validation schema
const statusSchema = z.enum(TRADE_STATUSES, {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  errorMap: (_issue, _ctx) => {
    return { message: `Status must be one of: ${TRADE_STATUSES.join(', ')}` };
  }
});

// Side validation schema
const sideSchema = z.enum(TRADE_SIDES, {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  errorMap: (_issue, _ctx) => {
    return { message: `Side must be one of: ${TRADE_SIDES.join(', ')}` };
  }
});

// Symbol validation schema
const symbolSchema = z.string().min(3).max(20).regex(/^[A-Z0-9]+\/[A-Z0-9]+$/, 'Symbol must be in format TOKEN/QUOTE (e.g., SOL/USDC)');

// Client order ID validation schema
const clientOrderIdSchema = z.string().min(10).max(100).regex(/^trade_[a-f0-9]+$/, 'Client order ID must be in format trade_[hash]');

// Insert schema - for creating new trades
export const insertTradeSchema = createInsertSchema(trades, {
  clientOrderId: clientOrderIdSchema,
  symbol: symbolSchema,
  side: sideSchema,
  quantity: z.number().positive(),
  price: z.number().positive().optional(),
  status: statusSchema,
  transactionHash: z.string().min(64).max(128).optional(),
  tradeData: tradeDataSchema.optional(),
  executedAt: z.date().optional()
}).omit({
  id: true
});

// Select schema - for reading trades
export const selectTradeSchema = createSelectSchema(trades, {
  clientOrderId: clientOrderIdSchema,
  symbol: symbolSchema,
  side: sideSchema,
  status: statusSchema,
  tradeData: tradeDataSchema.optional()
});

// Update schema - for modifying trades
export const updateTradeSchema = insertTradeSchema.partial();

/**
 * TypeScript Types
 * 
 * Inferred types for TypeScript integration throughout the application.
 * These provide compile-time type safety for trading systems.
 */
export type Trade = typeof trades.$inferSelect;
export type NewTrade = typeof trades.$inferInsert;
export type TradeUpdate = Partial<NewTrade>;

/**
 * Trade Validation Types
 * 
 * Zod-validated types for runtime type checking and API validation.
 */
export type ValidatedTrade = z.infer<typeof selectTradeSchema>;
export type ValidatedNewTrade = z.infer<typeof insertTradeSchema>;
export type ValidatedTradeUpdate = z.infer<typeof updateTradeSchema>;

/**
 * Compatibility Types
 * 
 * Types that maintain compatibility with existing trading system interfaces.
 * These bridge the gap between bot execution and database systems.
 */
export interface CompatibleTrade {
  id: string;
  jobId?: string;
  userId: string;
  clientOrderId: string;
  transactionHash?: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  price?: number;
  status: 'PENDING' | 'CONFIRMED' | 'FAILED' | 'CANCELLED';
  tradeData?: TradeData;
  executedAt: Date;
  
  // Computed fields for API responses
  value?: number;
  fees?: number;
  netAmount?: number;
}

export interface TradeRequest {
  userId: string;
  jobId?: string;
  clientOrderId?: string; // Optional - will be generated if not provided
  symbol: string;
  side: TradeSide;
  quantity: number;
  price?: number;
  orderType?: 'MARKET' | 'LIMIT';
  tradeData?: Partial<TradeData>;
}

/**
 * Portfolio and Analytics Types
 * 
 * Types for portfolio analysis and trading performance metrics.
 */
export interface PortfolioPosition {
  symbol: string;
  totalQuantity: number;
  averagePrice: number;
  currentValue: number;
  unrealizedPnL: number;
  realizedPnL: number;
  firstTradeDate: Date;
  lastTradeDate: Date;
}

export interface TradingPerformance {
  userId: string;
  totalTrades: number;
  successfulTrades: number;
  failedTrades: number;
  successRate: number;
  totalVolume: number;
  totalFees: number;
  netPnL: number;
  averageTradeSize: number;
  largestWin: number;
  largestLoss: number;
  winLossRatio: number;
}

/**
 * Utility Functions
 * 
 * Helper functions for trade management, analysis, and portfolio calculations.
 */

// Calculate trade value
export const calculateTradeValue = (trade: Trade): number | null => {
  if (!trade.price) return null;
  return trade.quantity * trade.price;
};

// Calculate trade fees
export const calculateTradeFees = (trade: Trade): number => {
  const tradeData = trade.tradeData;
  if (!tradeData) return 0;
  
  const tradingFee = tradeData.tradingFee || 0;
  const networkFee = tradeData.networkFee || 0;
  
  return tradingFee + networkFee;
};

// Check if trade is a duplicate based on transaction hash
export const isDuplicateTrade = (transactionHash: string, existingHashes: string[]): boolean => {
  return existingHashes.includes(transactionHash);
};

// Validate trade for duplicate prevention
export const validateTradeForDuplication = (trade: NewTrade, existingTrades: Trade[]): boolean => {
  if (!trade.transactionHash) return true; // Allow trades without transaction hash (pending trades)
  
  return !existingTrades.some(existing => 
    existing.transactionHash === trade.transactionHash
  );
};

// Convert to API format with computed fields
export const convertToApiFormat = (dbTrade: Trade): CompatibleTrade => {
  const value = calculateTradeValue(dbTrade);
  const fees = calculateTradeFees(dbTrade);
  
  return {
    id: dbTrade.id,
    jobId: dbTrade.jobId || undefined,
    userId: dbTrade.userId,
    clientOrderId: dbTrade.clientOrderId,
    transactionHash: dbTrade.transactionHash || undefined,
    symbol: dbTrade.symbol,
    side: dbTrade.side,
    quantity: dbTrade.quantity,
    price: dbTrade.price || undefined,
    status: dbTrade.status,
    tradeData: dbTrade.tradeData || undefined,
    executedAt: dbTrade.executedAt,
    value: value || undefined,
    fees: fees || undefined,
    netAmount: value ? value - fees : undefined
  };
};

// Convert from trading system format
export const convertFromTradingSystem = async (tradeRequest: TradeRequest): Promise<NewTrade> => ({
  userId: tradeRequest.userId,
  jobId: tradeRequest.jobId,
  clientOrderId: tradeRequest.clientOrderId || await generateClientOrderId(tradeRequest),
  symbol: tradeRequest.symbol,
  side: tradeRequest.side,
  quantity: tradeRequest.quantity,
  price: tradeRequest.price,
  status: 'PENDING' as TradeStatus,
  tradeData: tradeRequest.tradeData,
  transactionHash: undefined,
  executedAt: new Date()
});

// Generate client order ID for idempotency if not provided
const generateClientOrderId = async (tradeRequest: TradeRequest): Promise<string> => {
  // Create deterministic time window (rounds to nearest 5 minutes)
  const now = new Date();
  const timeWindow = Math.floor(now.getTime() / (5 * 60 * 1000));
  
  // Create deterministic input string
  const inputString = [
    tradeRequest.userId,
    tradeRequest.symbol,
    tradeRequest.side,
    tradeRequest.quantity.toString(),
    timeWindow.toString()
  ].join('|');
  
  // Generate SHA-256 hash for deterministic idempotency
  const crypto = await import('crypto');
  const hash = crypto.createHash('sha256').update(inputString).digest('hex');
  
  // Use first 32 chars for reasonable length while maintaining uniqueness
  return `trade_${hash.substring(0, 32)}`;
};

// Group trades by symbol for portfolio analysis
export const groupTradesBySymbol = (trades: Trade[]): Map<string, Trade[]> => {
  return trades.reduce((acc, trade) => {
    const symbol = trade.symbol;
    if (!acc.has(symbol)) {
      acc.set(symbol, []);
    }
    acc.get(symbol)!.push(trade);
    return acc;
  }, new Map<string, Trade[]>());
};

// Calculate position from trades
export const calculatePosition = (trades: Trade[]): PortfolioPosition | null => {
  if (trades.length === 0) return null;
  
  const symbol = trades[0].symbol;
  let totalBuyQuantity = 0;
  let totalSellQuantity = 0;
  let totalBuyValue = 0;
  let totalSellValue = 0;
  
  const confirmedTrades = trades.filter(t => t.status === 'CONFIRMED' && t.price);
  
  for (const trade of confirmedTrades) {
    const value = trade.quantity * trade.price!;
    
    if (trade.side === 'BUY') {
      totalBuyQuantity += trade.quantity;
      totalBuyValue += value;
    } else {
      totalSellQuantity += trade.quantity;
      totalSellValue += value;
    }
  }
  
  const netQuantity = totalBuyQuantity - totalSellQuantity;
  const averagePrice = netQuantity > 0 ? totalBuyValue / totalBuyQuantity : 0;
  
  return {
    symbol,
    totalQuantity: netQuantity,
    averagePrice,
    currentValue: 0, // Would need current market price to calculate
    unrealizedPnL: 0, // Would need current market price to calculate
    realizedPnL: totalSellValue - (totalSellQuantity * averagePrice),
    firstTradeDate: new Date(Math.min(...confirmedTrades.map(t => t.executedAt.getTime()))),
    lastTradeDate: new Date(Math.max(...confirmedTrades.map(t => t.executedAt.getTime())))
  };
};