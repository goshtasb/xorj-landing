/**
 * Wallet Balance Service
 * Fetches real-time balance from connected Solana wallets
 * Validates investment amounts against available funds
 */

import { PublicKey, Connection } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';

// Solana mainnet RPC endpoint
const SOLANA_RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

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
  private balanceCache: Map<string, { data: WalletBalanceData; expiry: number }> = new Map();
  private readonly CACHE_DURATION = 30000; // 30 seconds

  constructor() {
    this.connection = new Connection(SOLANA_RPC_URL, 'confirmed');
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
      console.log(`🔍 Fetching REAL balance for wallet: ${walletAddress}`);
      const publicKey = new PublicKey(walletAddress);
      
      // Get SOL balance from blockchain
      console.log('⚡ Fetching SOL balance from Solana blockchain...');
      const solBalance = await this.connection.getBalance(publicKey);
      const solBalanceFormatted = solBalance / 1e9; // Convert lamports to SOL
      console.log(`⚡ SOL Balance: ${solBalanceFormatted} SOL`);

      // Get real SOL price from CoinGecko
      const solPrice = await this.getSolPrice();
      const solUsdValue = solBalanceFormatted * solPrice;
      console.log(`💰 SOL USD Value: $${solUsdValue.toFixed(2)}`);

      // Get real token balances from blockchain
      const tokenBalances = await this.getTokenBalances(publicKey);
      
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
      console.log(`💰 REAL WALLET BALANCE FETCHED: $${totalUsdValue.toFixed(2)}`);
      console.log(`📊 Breakdown: SOL: $${solUsdValue.toFixed(2)} + Tokens: $${totalTokenUsdValue.toFixed(2)}`);
      
      if (totalUsdValue < 1) {
        console.log('⚠️ Wallet has insufficient funds for trading (less than $1)');
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
      console.log('❌ Unable to fetch balance, returning zero balance');
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
      console.log('🪙 Fetching real token balances from Solana...');
      
      // Get all token accounts for this wallet
      const tokenAccountsResponse = await this.connection.getTokenAccountsByOwner(publicKey, {
        programId: TOKEN_PROGRAM_ID,
      });

      const balances: TokenBalance[] = [];
      const tokenAccounts = tokenAccountsResponse.value;
      console.log(`🪙 Found ${tokenAccounts.length} token accounts`);

      for (const { account, pubkey } of tokenAccounts) {
        try {
          // Parse the token account data
          const accountInfo = await this.connection.getParsedAccountInfo(pubkey);
          
          if (accountInfo.value?.data && 'parsed' in accountInfo.value.data) {
            const parsedData = accountInfo.value.data.parsed;
            const tokenAmount = parsedData.info.tokenAmount;
            const mint = parsedData.info.mint;
            
            // Only include accounts with balance > 0
            if (tokenAmount.uiAmount && tokenAmount.uiAmount > 0) {
              console.log(`🪙 Token found: ${mint} - Balance: ${tokenAmount.uiAmount}`);
              
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
                console.log(`🪙 Unknown token mint: ${mint}`);
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
        } catch (error) {
          console.warn('🪙 Error parsing token account:', error);
        }
      }

      console.log(`🪙 Final token balances: ${balances.length} tokens with value`);
      return balances;
    } catch (error) {
      console.warn('🪙 Error fetching token balances:', error);
      return [];
    }
  }

  /**
   * Get current SOL price in USD from CoinGecko
   */
  private async getSolPrice(): Promise<number> {
    try {
      console.log('💲 Fetching real SOL price from CoinGecko...');
      const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd', {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        // Add timeout
        signal: AbortSignal.timeout(5000)
      });

      if (!response.ok) {
        throw new Error(`CoinGecko API error: ${response.status}`);
      }

      const data = await response.json();
      const solPrice = data.solana?.usd;
      
      if (typeof solPrice === 'number' && solPrice > 0) {
        console.log(`💲 Real SOL price: $${solPrice}`);
        return solPrice;
      } else {
        throw new Error('Invalid price data received');
      }
    } catch (error) {
      console.error('💲 Error fetching SOL price, using fallback:', error);
      return 100; // Fallback price of $100 per SOL
    }
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