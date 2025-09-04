/**
 * Wallet Balance Service
 * Fetches real-time balance from connected Solana wallets
 * Validates investment amounts against available funds
 */

import { PublicKey, Connection } from '@solana/web3.js';
import { resilientRpcClient } from './resilientRpcClient';

// Use the program ID directly instead of importing from @solana/spl-token
const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

// Use Helius RPC for better rate limits and reliability  
const HELIUS_API_KEY = process.env.HELIUS_API_KEY || 'e5fdf1c6-20b1-48b6-b33c-4be56e8e219c';
const SOLANA_RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;

// Fallback to public RPC if needed
const PUBLIC_RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 
  process.env.SOLANA_RPC_URL || 
  'https://api.mainnet-beta.solana.com';

// Common token mint addresses
const TOKEN_MINTS = {
  SOL: 'So11111111111111111111111111111111111111112', // Wrapped SOL
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USD Coin
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // Tether USD
};

interface TokenBalance {
  mint: string;
  symbol: string;
  balance: number;
  usdValue: number;
  decimals: number;
}

interface WalletBalanceData {
  solBalance: number;
  solUsdValue: number;
  tokenBalances: TokenBalance[];
  totalUsdValue: number;
  lastUpdated: number;
}

export class WalletBalanceService {
  private connection: Connection;
  private fallbackConnection: Connection;
  private balanceCache: Map<string, { data: WalletBalanceData; expiry: number }> = new Map();
  private readonly CACHE_DURATION = 300000; // 5 minutes - reduced RPC calls
  private lastRpcCall: number = 0;
  private readonly MIN_RPC_INTERVAL = 1000; // 1 second minimum between RPC calls

  constructor() {
    // Primary: Use Helius RPC for better rate limits
    this.connection = new Connection(SOLANA_RPC_URL, 'confirmed');
    
    // Fallback: Use public RPC as backup
    this.fallbackConnection = new Connection(PUBLIC_RPC_URL, 'confirmed');
    
  }

  /**
   * Rate limit RPC calls to prevent 429 errors
   */
  private async rateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastCall = now - this.lastRpcCall;
    
    if (timeSinceLastCall < this.MIN_RPC_INTERVAL) {
      const delay = this.MIN_RPC_INTERVAL - timeSinceLastCall;
      console.log(`⏳ Rate limiting: waiting ${delay}ms before RPC call`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    this.lastRpcCall = Date.now();
  }

  /**
   * Get total USD balance for a wallet
   */
  async getWalletUsdBalance(walletAddress: string): Promise<number> {
    try {
      const balanceData = await this.getWalletBalances(walletAddress);
      return balanceData.totalUsdValue;
    } catch (error) {
      console.error('Error fetching wallet USD balance:', error);
      return 0;
    }
  }

  /**
   * Get detailed balance information for a wallet
   */
  async getWalletBalances(walletAddress: string): Promise<WalletBalanceData> {
    // Check cache first
    const cached = this.balanceCache.get(walletAddress);
    if (cached && Date.now() < cached.expiry) {
      return cached.data;
    }

    try {
      const publicKey = new PublicKey(walletAddress);
      
      // Get SOL balance from blockchain
      
      let solBalance = 0;
      let solBalanceFormatted = 0;
      
      try {
        // Use resilient RPC client with exponential backoff and retry logic
        solBalance = await resilientRpcClient.getBalance(walletAddress);
        solBalanceFormatted = solBalance / 1e9; // Convert lamports to SOL
        console.log(`💰 MAINNET BALANCE: ${solBalanceFormatted.toFixed(4)} SOL ($${(solBalanceFormatted * await this.getSolPrice()).toFixed(2)} USD) for ${walletAddress}`);
      } catch (rpcError: unknown) {
        const error = rpcError as Error;
        console.error('❌ Solana RPC returned 429', error?.message || error);
        
        // Resilient client already handles retries, so if we get here, all attempts failed
        if (error?.message?.includes('429') || error?.message?.includes('rate limit')) {
          console.warn('⚠️ Rate limit exceeded even with exponential backoff, continuing with zero balance');
          solBalance = 0;
          solBalanceFormatted = 0;
        } else if (error?.message?.includes('Invalid param')) {
          solBalance = 0;
          solBalanceFormatted = 0;
        } else {
          // For development, continue with zero balance instead of failing
          console.warn('⚠️ RPC request failed after all retries, continuing with zero balance');
          solBalance = 0;
          solBalanceFormatted = 0;
        }
      }

      // Get real SOL price from CoinGecko
      const solPrice = await this.getSolPrice();
      const solUsdValue = solBalanceFormatted * solPrice;

      // Get real token balances from blockchain  
      let tokenBalances: TokenBalance[] = [];
      try {
        tokenBalances = await this.getTokenBalances(publicKey);
      } catch {
        // Continue with empty token balances - at least we have SOL balance
      }
      
      const totalTokenUsdValue = tokenBalances.reduce((sum, token) => sum + token.usdValue, 0);
      const totalUsdValue = solUsdValue + totalTokenUsdValue;

      const balanceData: WalletBalanceData = {
        solBalance: solBalanceFormatted,
        solUsdValue,
        tokenBalances,
        totalUsdValue,
        lastUpdated: Date.now()
      };

      // Log the REAL balance data
      
      if (totalUsdValue === 0) {
      } else if (totalUsdValue < 1) {
      } else {
      }

      // Cache the real result
      this.balanceCache.set(walletAddress, {
        data: balanceData,
        expiry: Date.now() + this.CACHE_DURATION
      });

      return balanceData;
    } catch (error) {
      console.error('Error fetching wallet balances:', error);
      
      // Return zero balance instead of mock data
      return {
        solBalance: 0,
        solUsdValue: 0,
        tokenBalances: [],
        totalUsdValue: 0,
        lastUpdated: Date.now()
      };
    }
  }

  /**
   * Generate realistic mock balance data for development/testing
   */
  private generateMockBalanceData(walletAddress: string): WalletBalanceData {
    // Generate deterministic but varied mock data based on wallet address
    const seed = walletAddress.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const pseudoRandom = (seed % 100) / 100;
    
    // Generate realistic balance between $1000-$10000
    const baseAmount = 1000 + (pseudoRandom * 9000);
    const solBalance = 1 + (pseudoRandom * 4); // 1-5 SOL
    const solUsdValue = solBalance * 100; // $100 per SOL
    const usdcBalance = baseAmount - solUsdValue;
    
    return {
      solBalance,
      solUsdValue,
      tokenBalances: [
        {
          mint: TOKEN_MINTS.USDC,
          symbol: 'USDC',
          balance: usdcBalance,
          usdValue: usdcBalance,
          decimals: 6
        }
      ],
      totalUsdValue: baseAmount,
      lastUpdated: Date.now()
    };
  }

  /**
   * Get token balances for a wallet
   */
  private async getTokenBalances(publicKey: PublicKey): Promise<TokenBalance[]> {
    try {
      
      // Get all token accounts for this wallet with fallback
      const tokenAccountsResponse = await this.connection.getTokenAccountsByOwner(publicKey, {
        programId: TOKEN_PROGRAM_ID,
      });

      const balances: TokenBalance[] = [];
      const tokenAccounts = tokenAccountsResponse.value;

      for (const { pubkey } of tokenAccounts) {
        try {
          // Parse the token account data
          const accountInfo = await this.connection.getParsedAccountInfo(pubkey);
          
          if (accountInfo.value?.data && 'parsed' in accountInfo.value.data) {
            const parsedData = accountInfo.value.data.parsed;
            const tokenAmount = parsedData.info.tokenAmount;
            const mint = parsedData.info.mint;
            
            // Only include accounts with balance > 0
            if (tokenAmount.uiAmount && tokenAmount.uiAmount > 0) {
              
              // Get token info (for known tokens like USDC, USDT)
              let symbol = 'UNKNOWN';
              let usdValue = 0;
              
              if (mint === TOKEN_MINTS.USDC) {
                symbol = 'USDC';
                usdValue = tokenAmount.uiAmount; // USDC is 1:1 with USD
              } else if (mint === TOKEN_MINTS.USDT) {
                symbol = 'USDT';
                usdValue = tokenAmount.uiAmount; // USDT is 1:1 with USD
              } else {
                // For unknown tokens, assume 0 USD value for now
              }
              
              balances.push({
                mint,
                symbol,
                balance: tokenAmount.uiAmount,
                usdValue,
                decimals: tokenAmount.decimals
              });
            }
          }
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (error) {
          // Ignore individual account errors
        }
      }

      return balances;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error) {
      return [];
    }
  }

  /**
   * Get current SOL price in USD from CoinGecko with caching and rate limit handling
   */
  private async getSolPrice(): Promise<number> {
    try {
      // Check cache first (cache for 30 seconds for live price tracking)
      const cacheKey = 'sol_price_usd';
      const cachedPrice = await this.getCachedValue(cacheKey);
      if (cachedPrice && typeof cachedPrice === 'number') {
        return cachedPrice;
      }

      const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd', {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        // Add timeout
        signal: AbortSignal.timeout(5000)
      });

      if (!response.ok) {
        // Handle rate limiting more gracefully
        if (response.status === 429) {
          return 200; // More reasonable fallback price
        }
        throw new Error(`CoinGecko API error: ${response.status}`);
      }

      const data = await response.json();
      const solPrice = data.solana?.usd;
      
      if (typeof solPrice === 'number' && solPrice > 0) {
        // Cache the price for 30 seconds for live price tracking
        await this.setCachedValue(cacheKey, solPrice, 30);
        return solPrice;
      } else {
        throw new Error('Invalid price data received');
      }
    } catch (error) {
      console.error('💲 Error fetching SOL price, using fallback:', error);
      return 200; // Updated fallback price
    }
  }

  /**
   * Simple cache helpers for price data
   */
  private priceCache = new Map<string, { value: number, expiry: number }>();

  private async getCachedValue(key: string): Promise<number | null> {
    const cached = this.priceCache.get(key);
    if (cached && cached.expiry > Date.now()) {
      return cached.value;
    }
    this.priceCache.delete(key); // Clean expired
    return null;
  }

  private async setCachedValue(key: string, value: number, ttlSeconds: number): Promise<void> {
    this.priceCache.set(key, {
      value,
      expiry: Date.now() + (ttlSeconds * 1000)
    });
  }

  /**
   * Validate if investment amount is within wallet balance
   */
  async validateInvestmentAmount(walletAddress: string, investmentAmount: number): Promise<{
    isValid: boolean;
    availableBalance: number;
    error?: string;
  }> {
    try {
      const availableBalance = await this.getWalletUsdBalance(walletAddress);
      
      // Leave a small buffer for transaction fees (2% or minimum $10)
      const feeBuffer = Math.max(availableBalance * 0.02, 10);
      const maxInvestable = availableBalance - feeBuffer;

      if (investmentAmount <= 0) {
        return {
          isValid: false,
          availableBalance,
          error: 'Investment amount must be greater than $0'
        };
      }

      if (investmentAmount > maxInvestable) {
        return {
          isValid: false,
          availableBalance,
          error: availableBalance === 0 
            ? `Cannot invest $${investmentAmount.toLocaleString()} - wallet has no funds. Please deposit SOL or USDC first.`
            : `Investment amount ($${investmentAmount.toLocaleString()}) exceeds available balance ($${maxInvestable.toLocaleString()}). A buffer is kept for transaction fees.`
        };
      }

      return {
        isValid: true,
        availableBalance
      };
    } catch (error) {
      console.error('Error validating investment amount:', error);
      return {
        isValid: false,
        availableBalance: 0,
        error: 'Unable to verify wallet balance. Please try again.'
      };
    }
  }

  /**
   * Clear cache for a specific wallet (useful for manual refresh)
   */
  clearCache(walletAddress?: string): void {
    if (walletAddress) {
      this.balanceCache.delete(walletAddress);
    } else {
      this.balanceCache.clear();
    }
  }

  /**
   * Format balance for display
   */
  formatBalance(amount: number, symbol: string = 'USD'): string {
    if (symbol === 'USD') {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(amount);
    }
    
    return `${amount.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 6
    })} ${symbol}`;
  }
}

// Export singleton instance
export const walletBalanceService = new WalletBalanceService();