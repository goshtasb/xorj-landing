/**
 * Constants for the Trader Intelligence & Scoring Engine
 * Contains program IDs, API endpoints, and configuration values
 */

// Raydium AMM Program IDs
export const RAYDIUM_PROGRAM_IDS = {
  // Raydium Liquidity Pool V4 - Primary program for swap detection
  AMM_V4: '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',
  // Alternative programs for comprehensive coverage
  AMM_V3: 'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK',
  SERUM_PROGRAM: 'srmqPvymJeFKQ4zGQed1GFppgkRHL9kaELCbyksJtPX',
} as const;

// Solana Network Configuration
export const SOLANA_CONFIG = {
  // Default to mainnet for production analysis
  RPC_ENDPOINT: process.env.HELIUS_RPC_URL || 'https://api.mainnet-beta.solana.com',
  COMMITMENT_LEVEL: 'confirmed' as const,
  // Transaction batch size for efficient processing
  TRANSACTION_BATCH_SIZE: 100,
  // Maximum retries for RPC calls
  MAX_RETRIES: 3,
  // Request timeout in milliseconds
  REQUEST_TIMEOUT: 30000,
} as const;

// Price API Configuration
export const PRICE_API_CONFIG = {
  // Jupiter Price API V3 (V2 deprecated by Aug 1, 2025)
  JUPITER_PRICE_API: 'https://api.jup.ag/price/v3',
  // CoinGecko API for historical prices
  COINGECKO_API: 'https://api.coingecko.com/api/v3',
  // Helius Token API for metadata
  HELIUS_TOKEN_API: process.env.HELIUS_TOKEN_API || '',
  // Rate limiting
  API_RATE_LIMIT_MS: 100, // 10 requests per second
  PRICE_CACHE_TTL: 60 * 1000, // 1 minute cache for current prices
  HISTORICAL_PRICE_CACHE_TTL: 24 * 60 * 60 * 1000, // 24 hour cache for historical prices
} as const;

// Analysis Configuration
export const ANALYSIS_CONFIG = {
  // Rolling period for performance calculations (90 days)
  ANALYSIS_PERIOD_DAYS: 90,
  // Minimum number of trades required for analysis
  MIN_TRADES_FOR_ANALYSIS: 10,
  // Risk-free rate for Sharpe ratio calculation (4% annual)
  RISK_FREE_RATE: 0.04,
  // Minimum trade value in USD to consider
  MIN_TRADE_VALUE_USD: 10,
  // Maximum transactions to process per wallet
  MAX_TRANSACTIONS_PER_WALLET: 10000,
} as const;

// Whitelisted tokens for analysis
export const WHITELISTED_TOKENS = {
  // Major tokens on Solana
  SOL: 'So11111111111111111111111111111111111111112',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  RAY: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',
  // Add more tokens as needed for the whitelist
} as const;

// Performance Metrics Thresholds
export const PERFORMANCE_THRESHOLDS = {
  // Minimum ROI to be considered a successful trader (10%)
  MIN_ROI_THRESHOLD: 0.10,
  // Maximum acceptable drawdown (50%)
  MAX_DRAWDOWN_THRESHOLD: 0.50,
  // Minimum Sharpe ratio for quality traders (1.0)
  MIN_SHARPE_RATIO: 1.0,
  // Minimum win rate (40%)
  MIN_WIN_RATE: 0.40,
} as const;

// Database/Storage Configuration (for future use)
export const STORAGE_CONFIG = {
  // Table names for data storage
  TABLES: {
    WALLETS: 'trader_wallets',
    TRANSACTIONS: 'wallet_transactions',
    PERFORMANCE_METRICS: 'performance_metrics',
    PRICE_HISTORY: 'token_price_history',
  },
  // Data retention periods
  TRANSACTION_RETENTION_DAYS: 365,
  METRICS_RETENTION_DAYS: 180,
} as const;

// Error handling and logging
export const ERROR_CONFIG = {
  // Retry delays for different error types
  RETRY_DELAYS: [1000, 2000, 5000], // 1s, 2s, 5s
  // Error categories
  ERROR_TYPES: {
    RPC_ERROR: 'RPC_ERROR',
    PRICE_API_ERROR: 'PRICE_API_ERROR',
    PARSING_ERROR: 'PARSING_ERROR',
    CALCULATION_ERROR: 'CALCULATION_ERROR',
  },
  // Log levels
  LOG_LEVELS: {
    ERROR: 'error',
    WARN: 'warn',
    INFO: 'info',
    DEBUG: 'debug',
  },
} as const;

export type RaydiumProgramId = keyof typeof RAYDIUM_PROGRAM_IDS;
export type WhitelistedToken = keyof typeof WHITELISTED_TOKENS;
export type ErrorType = keyof typeof ERROR_CONFIG.ERROR_TYPES;