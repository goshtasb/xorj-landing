/**
 * TypeScript types for the Trader Intelligence & Scoring Engine
 * Comprehensive type definitions for transaction analysis and performance metrics
 */

// import { PublicKey } from '@solana/web3.js'; // Unused

// Solana transaction metadata types
interface TransactionError {
  InstructionError?: [number, unknown];
  InsufficientFunds?: null;
  InvalidAccountIndex?: null;
  [key: string]: unknown;
}

interface InnerInstruction {
  index: number;
  instructions: Array<{
    programIdIndex: number;
    accounts: number[];
    data: string;
  }>;
}

// Base transaction data structure
export interface SolanaTransaction {
  signature: string;
  blockTime: number | null;
  slot: number;
  meta: {
    err: TransactionError | null;
    fee: number;
    preBalances: number[];
    postBalances: number[];
    preTokenBalances: TokenBalance[];
    postTokenBalances: TokenBalance[];
    logMessages: string[];
    innerInstructions: InnerInstruction[];
  };
  transaction: {
    message: {
      accountKeys: string[];
      instructions: TransactionInstruction[];
      recentBlockhash: string;
    };
    signatures: string[];
  };
}

export interface TokenBalance {
  accountIndex: number;
  mint: string;
  uiTokenAmount: {
    amount: string;
    decimals: number;
    uiAmount: number | null;
    uiAmountString: string;
  };
  owner?: string;
  programId?: string;
}

export interface TransactionInstruction {
  accounts: number[];
  data: string;
  programId: string;
  stackHeight?: number;
}

// Parsed swap transaction from Raydium
export interface RaydiumSwap {
  signature: string;
  timestamp: number;
  walletAddress: string;
  tokenIn: {
    mint: string;
    symbol: string;
    amount: number;
    decimals: number;
  };
  tokenOut: {
    mint: string;
    symbol: string;
    amount: number;
    decimals: number;
  };
  priceImpact?: number;
  fee: number;
  poolId: string;
  instructionType: 'swap' | 'swapBaseIn' | 'swapBaseOut';
}

// Enhanced swap with USD values and P&L
export interface EnhancedSwap extends RaydiumSwap {
  tokenInUsdValue: number;
  tokenOutUsdValue: number;
  tokenInPriceUsd: number;
  tokenOutPriceUsd: number;
  realizedPnlUsd: number;
  costBasisUsd: number;
  slippage: number;
  gasFeesUsd: number;
}

// Purchase lot for FIFO accounting
export interface PurchaseLot {
  amount: number;
  costBasisUsd: number; // Total USD cost for this lot
  timestamp: number;
  signature: string; // Transaction signature for audit trail
}

// Position tracking for P&L calculation with FIFO lots
export interface TokenPosition {
  mint: string;
  symbol: string;
  totalAmount: number;
  averageCostBasis: number; // USD per token (calculated from lots)
  totalCostBasisUsd: number; // Total USD invested (sum of all lots)
  lots: PurchaseLot[]; // FIFO queue of purchase lots
  firstPurchaseTimestamp: number;
  lastTransactionTimestamp: number;
  unrealizedPnlUsd?: number;
}

// Wallet performance metrics
export interface WalletPerformanceMetrics {
  walletAddress: string;
  analysisStartDate: number;
  analysisEndDate: number;
  
  // Core metrics from PRD
  netRoi: number; // Net ROI (%)
  maxDrawdown: number; // Maximum Drawdown (%)
  sharpeRatio: number; // Sharpe Ratio
  winLossRatio: number; // Win/Loss Ratio
  totalTrades: number; // Total number of completed trades
  
  // Additional derived metrics
  totalVolumeUsd: number;
  totalFeesUsd: number;
  avgTradeSize: number;
  avgHoldingPeriod: number; // in days
  winRate: number; // percentage of profitable trades
  avgWinAmount: number;
  avgLossAmount: number;
  profitFactor: number; // gross profit / gross loss
  calmarRatio: number; // annual return / max drawdown
  
  // Trade distribution
  totalWins: number;
  totalLosses: number;
  largestWin: number;
  largestLoss: number;
  
  // Risk metrics
  volatility: number; // standard deviation of returns
  varAtRisk: number; // Value at Risk (95th percentile)
  
  // Time-based analysis
  bestMonth: number;
  worstMonth: number;
  consecutiveWins: number;
  consecutiveLosses: number;
  
  // Position and token analysis
  activePositions: TokenPosition[];
  completedTrades: CompletedTrade[];
  
  // Metadata
  lastUpdated: number;
  dataQuality: 'excellent' | 'good' | 'fair' | 'poor';
  confidenceScore: number; // 0-100, based on data completeness
}

// Individual completed trade for detailed analysis
export interface CompletedTrade {
  id: string;
  tokenMint: string;
  tokenSymbol: string;
  entryTimestamp: number;
  exitTimestamp: number;
  entryPriceUsd: number;
  exitPriceUsd: number;
  quantity: number;
  entryValueUsd: number;
  exitValueUsd: number;
  realizedPnlUsd: number;
  holdingPeriodDays: number;
  entryTransactionSignature: string;
  exitTransactionSignature: string;
  tradeType: 'long' | 'short';
  roi: number; // return on investment for this trade
}

// Price data structures
export interface TokenPriceData {
  mint: string;
  symbol: string;
  priceUsd: number;
  timestamp: number;
  source: 'jupiter' | 'coingecko' | 'helius';
  confidence: number; // 0-100, reliability of the price
}

export interface HistoricalPriceData {
  mint: string;
  symbol: string;
  prices: Array<{
    timestamp: number;
    priceUsd: number;
    volume24h?: number;
  }>;
  source: string;
  granularity: 'minute' | 'hour' | 'day';
}

// Analysis configuration and filters
export interface WalletAnalysisConfig {
  walletAddress: string;
  startDate?: number; // Unix timestamp
  endDate?: number; // Unix timestamp
  minTradeValueUsd?: number;
  includeTokens?: string[]; // Mint addresses
  excludeTokens?: string[]; // Mint addresses
  maxTransactions?: number;
}

// Analysis result with metadata
export interface WalletAnalysisResult {
  config: WalletAnalysisConfig;
  metrics: WalletPerformanceMetrics;
  processingStats: {
    totalTransactionsFetched: number;
    validSwapsFound: number;
    priceDataMissingCount: number;
    processingTimeMs: number;
    errors: AnalysisError[];
  };
  status: 'completed' | 'partial' | 'failed';
  completedAt: number;
}

// Error tracking
export interface AnalysisError {
  type: 'rpc_error' | 'price_api_error' | 'parsing_error' | 'calculation_error';
  message: string;
  timestamp: number;
  context?: Record<string, unknown>;
}

// Batch processing for multiple wallets
export interface BatchAnalysisRequest {
  walletAddresses: string[];
  config: Omit<WalletAnalysisConfig, 'walletAddress'>;
  priority: 'high' | 'medium' | 'low';
}

export interface BatchAnalysisResult {
  requestId: string;
  walletResults: WalletAnalysisResult[];
  summary: {
    totalWallets: number;
    completedWallets: number;
    failedWallets: number;
    avgProcessingTimeMs: number;
  };
  startedAt: number;
  completedAt: number;
}

// Scoring system types (for future phases)
export interface TraderScore {
  walletAddress: string;
  overallScore: number; // 0-100
  categoryScores: {
    profitability: number; // 0-100
    consistency: number; // 0-100
    riskManagement: number; // 0-100
    activityLevel: number; // 0-100
    adaptability: number; // 0-100
  };
  rank: number; // Overall rank among analyzed traders
  tier: 'S' | 'A' | 'B' | 'C' | 'D'; // Trading tier classification
  lastUpdated: number;
}

// API response types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: number;
  requestId: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    hasNext: boolean;
  };
  timestamp: number;
}

// Rate limiting and caching
export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number; // time to live in milliseconds
}

export interface RateLimitInfo {
  remaining: number;
  resetTime: number;
  limit: number;
}

// Webhook/notification types (for future use)
export interface AnalysisCompleteNotification {
  walletAddress: string;
  analysisId: string;
  status: 'completed' | 'failed';
  metrics?: WalletPerformanceMetrics;
  error?: string;
  timestamp: number;
}

// Type guards and utility types
export type NonNullable<T> = T extends null | undefined ? never : T;
export type RequiredFields<T, K extends keyof T> = T & Required<Pick<T, K>>;
export type OptionalFields<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

// Union types for better type safety
export type AnalysisStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'partial';
export type PriceSource = 'jupiter' | 'coingecko' | 'helius' | 'cached';
export type DataQuality = 'excellent' | 'good' | 'fair' | 'poor';
export type TraderTier = 'S' | 'A' | 'B' | 'C' | 'D';

// Constants as types
export type SupportedProgramId = '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8' | 'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK';
export type SupportedTokenMint = 'So11111111111111111111111111111111111111112' | 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

// Export type aliases for organized imports
export type TraderIntelligenceTransaction = SolanaTransaction;
export type TraderIntelligenceSwap = RaydiumSwap;
export type TraderIntelligenceEnhancedSwap = EnhancedSwap;
export type TraderIntelligenceMetrics = WalletPerformanceMetrics;
export type TraderIntelligenceAnalysis = WalletAnalysisResult;
export type TraderIntelligenceScore = TraderScore;
export type TraderIntelligenceConfig = WalletAnalysisConfig;
export type TraderIntelligencePriceData = TokenPriceData;
export type TraderIntelligencePosition = TokenPosition;
export type TraderIntelligenceTrade = CompletedTrade;