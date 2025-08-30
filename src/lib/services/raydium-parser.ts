/**
 * Raydium Transaction Parser
 * Specialized parser for extracting swap data from Raydium AMM transactions
 */

// import { PublicKey } from '@solana/web3.js'; // Unused
import { SolanaTransaction, RaydiumSwap, AnalysisError, TokenBalance } from '@/types/trader-intelligence';
import { RAYDIUM_PROGRAM_IDS, WHITELISTED_TOKENS } from '@/lib/constants';

export class RaydiumTransactionParser {
  private whitelistedTokens: Set<string>;
  private raydiumProgramIds: Set<string>;

  constructor() {
    this.whitelistedTokens = new Set(Object.values(WHITELISTED_TOKENS));
    this.raydiumProgramIds = new Set(Object.values(RAYDIUM_PROGRAM_IDS));
  }

  /**
   * Parse multiple transactions to extract Raydium swaps
   */
  async parseTransactions(
    transactions: SolanaTransaction[],
    walletAddress: string
  ): Promise<{ swaps: RaydiumSwap[]; errors: AnalysisError[] }> {
    const swaps: RaydiumSwap[] = [];
    const errors: AnalysisError[] = [];

    console.log(`🔍 Parsing ${transactions.length} transactions for Raydium swaps`);

    for (let i = 0; i < transactions.length; i++) {
      const transaction = transactions[i];
      
      try {
        const swap = await this.parseRaydiumSwap(transaction, walletAddress);
        if (swap) {
          swaps.push(swap);
        }
      } catch {
        console.warn(`⚠️ Error parsing transaction ${transaction.signature}:`, error);
        errors.push({
          type: 'parsing_error',
          message: `Failed to parse transaction: ${error}`,
          timestamp: Date.now(),
          context: { 
            signature: transaction.signature, 
            walletAddress,
            transactionIndex: i 
          }
        });
      }

      // Progress logging for large batches
      if (i > 0 && i % 100 === 0) {
        console.log(`📊 Parsed ${i}/${transactions.length} transactions, found ${swaps.length} swaps`);
      }
    }

    console.log(`✅ Parsing complete: ${swaps.length} Raydium swaps found from ${transactions.length} transactions`);
    console.log(`⚠️ Parsing errors: ${errors.length}`);

    return { swaps, errors };
  }

  /**
   * Parse a single transaction to extract Raydium swap data
   */
  private async parseRaydiumSwap(
    transaction: SolanaTransaction,
    walletAddress: string
  ): Promise<RaydiumSwap | null> {
    // Skip failed transactions
    if (transaction.meta?.err) {
      return null;
    }

    // Check if transaction involves Raydium programs
    const hasRaydiumInstruction = this.hasRaydiumInstruction(transaction);
    if (!hasRaydiumInstruction) {
      return null;
    }

    // Check if transaction involves the target wallet
    const walletIndex = this.findWalletAccountIndex(transaction, walletAddress);
    if (walletIndex === -1) {
      return null;
    }

    // Extract swap data from token balance changes
    const swapData = this.extractSwapFromBalanceChanges(
      transaction,
      walletAddress,
      walletIndex
    );

    if (!swapData) {
      return null;
    }

    // Validate that the tokens are in our whitelist
    if (!this.isTokenWhitelisted(swapData.tokenIn.mint) || 
        !this.isTokenWhitelisted(swapData.tokenOut.mint)) {
      return null;
    }

    // Extract additional metadata
    const poolId = this.extractPoolId(transaction);
    const instructionType = this.determineSwapType(transaction);

    return {
      signature: transaction.signature,
      timestamp: transaction.blockTime || Date.now() / 1000,
      walletAddress,
      tokenIn: swapData.tokenIn,
      tokenOut: swapData.tokenOut,
      fee: transaction.meta?.fee || 0,
      poolId: poolId || 'unknown',
      instructionType: instructionType || 'swap',
      priceImpact: undefined // Will be calculated later with price data
    };
  }

  /**
   * Check if transaction contains Raydium program instructions
   */
  private hasRaydiumInstruction(transaction: SolanaTransaction): boolean {
    const instructions = transaction.transaction.message.instructions;
    const accountKeys = transaction.transaction.message.accountKeys;

    return instructions.some(instruction => {
      const programId = accountKeys[instruction.accounts[0]] || instruction.programId;
      return this.raydiumProgramIds.has(programId);
    });
  }

  /**
   * Find the account index for the target wallet
   */
  private findWalletAccountIndex(transaction: SolanaTransaction, walletAddress: string): number {
    const accountKeys = transaction.transaction.message.accountKeys;
    return accountKeys.findIndex(key => key === walletAddress);
  }

  /**
   * Extract swap data from token balance changes
   */
  private extractSwapFromBalanceChanges(
    transaction: SolanaTransaction,
    walletAddress: string
    /* _walletIndex: number */
  ): { tokenIn: { mint: string; amount: number }; tokenOut: { mint: string; amount: number } } | null {
    const preTokenBalances = transaction.meta?.preTokenBalances || [];
    const postTokenBalances = transaction.meta?.postTokenBalances || [];

    // Find token accounts owned by the wallet
    const walletPreBalances = preTokenBalances.filter(balance => 
      balance.owner === walletAddress || 
      transaction.transaction.message.accountKeys[balance.accountIndex] === walletAddress
    );

    const walletPostBalances = postTokenBalances.filter(balance => 
      balance.owner === walletAddress ||
      transaction.transaction.message.accountKeys[balance.accountIndex] === walletAddress
    );

    // Detect balance changes
    const balanceChanges = this.calculateBalanceChanges(walletPreBalances, walletPostBalances);
    
    if (balanceChanges.length !== 2) {
      // Should have exactly 2 token balance changes for a swap
      return null;
    }

    // Determine which token was sold (negative change) and which was bought (positive change)
    const tokenOut = balanceChanges.find(change => change.change > 0);
    const tokenIn = balanceChanges.find(change => change.change < 0);

    if (!tokenIn || !tokenOut) {
      return null;
    }

    return {
      tokenIn: {
        mint: tokenIn.mint,
        symbol: this.getTokenSymbol(tokenIn.mint),
        amount: Math.abs(tokenIn.change),
        decimals: tokenIn.decimals
      },
      tokenOut: {
        mint: tokenOut.mint,
        symbol: this.getTokenSymbol(tokenOut.mint),
        amount: tokenOut.change,
        decimals: tokenOut.decimals
      }
    };
  }

  /**
   * Calculate balance changes between pre and post token balances
   */
  private calculateBalanceChanges(
    preBalances: TokenBalance[],
    postBalances: TokenBalance[]
  ): Array<{ mint: string; change: number; decimals: number }> {
    const changes: Array<{ mint: string; change: number; decimals: number }> = [];

    // Create maps for easier lookup
    const preBalanceMap = new Map(
      preBalances.map(balance => [
        balance.mint,
        {
          amount: parseFloat(balance.uiTokenAmount.amount),
          decimals: balance.uiTokenAmount.decimals
        }
      ])
    );

    const postBalanceMap = new Map(
      postBalances.map(balance => [
        balance.mint,
        {
          amount: parseFloat(balance.uiTokenAmount.amount),
          decimals: balance.uiTokenAmount.decimals
        }
      ])
    );

    // Find all tokens that had balance changes
    const allMints = new Set([...preBalanceMap.keys(), ...postBalanceMap.keys()]);

    for (const mint of allMints) {
      const preBalance = preBalanceMap.get(mint);
      const postBalance = postBalanceMap.get(mint);

      const preAmount = preBalance?.amount || 0;
      const postAmount = postBalance?.amount || 0;
      const decimals = preBalance?.decimals || postBalance?.decimals || 0;

      const change = postAmount - preAmount;

      // Only include significant changes (to avoid dust)
      if (Math.abs(change) > 0.000001) {
        changes.push({
          mint,
          change,
          decimals
        });
      }
    }

    return changes;
  }

  /**
   * Extract pool ID from transaction logs
   */
  private extractPoolId(transaction: SolanaTransaction): string | null {
    const logMessages = transaction.meta?.logMessages || [];
    
    // Look for pool-related log messages
    for (const log of logMessages) {
      // This is a simplified approach - in practice, you might need more sophisticated parsing
      if (log.includes('ray_log') && log.includes('pool')) {
        // Extract pool ID from the log message
        const matches = log.match(/[1-9A-HJ-NP-Za-km-z]{32,44}/g);
        if (matches && matches.length > 0) {
          return matches[0];
        }
      }
    }

    return null;
  }

  /**
   * Determine the type of swap instruction
   */
  private determineSwapType(transaction: SolanaTransaction): 'swap' | 'swapBaseIn' | 'swapBaseOut' {
    const logMessages = transaction.meta?.logMessages || [];
    
    for (const log of logMessages) {
      if (log.includes('swapBaseIn')) return 'swapBaseIn';
      if (log.includes('swapBaseOut')) return 'swapBaseOut';
    }

    return 'swap'; // default
  }

  /**
   * Check if a token is in the whitelist
   */
  private isTokenWhitelisted(mint: string): boolean {
    return this.whitelistedTokens.has(mint);
  }

  /**
   * Get token symbol from mint address (simplified mapping)
   */
  private getTokenSymbol(mint: string): string {
    const tokenMap: Record<string, string> = {
      'So11111111111111111111111111111111111111112': 'SOL',
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': 'USDC',
      'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': 'USDT',
      '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R': 'RAY',
    };

    return tokenMap[mint] || mint.slice(0, 8);
  }

  /**
   * Add new token to whitelist
   */
  addWhitelistedToken(mint: string /* _symbol: string */): void {
    this.whitelistedTokens.add(mint);
  }

  /**
   * Remove token from whitelist
   */
  removeWhitelistedToken(mint: string): void {
    this.whitelistedTokens.delete(mint);
  }

  /**
   * Get current whitelist
   */
  getWhitelistedTokens(): string[] {
    return Array.from(this.whitelistedTokens);
  }

  /**
   * Validate swap data integrity
   */
  validateSwap(swap: RaydiumSwap): boolean {
    // Basic validation checks
    if (!swap.signature || !swap.walletAddress) return false;
    if (!swap.tokenIn.mint || !swap.tokenOut.mint) return false;
    if (swap.tokenIn.amount <= 0 || swap.tokenOut.amount <= 0) return false;
    if (swap.tokenIn.mint === swap.tokenOut.mint) return false;
    
    return true;
  }

  /**
   * Filter swaps by criteria
   */
  filterSwaps(
    swaps: RaydiumSwap[],
    criteria: {
      minAmount?: number;
      maxAmount?: number;
      _startTime?: number;
      endTime?: number;
      tokenMints?: string[];
    }
  ): RaydiumSwap[] {
    return swaps.filter(swap => {
      // Time range filter
      if (criteria._startTime && swap.timestamp < criteria._startTime) return false;
      if (criteria.endTime && swap.timestamp > criteria.endTime) return false;

      // Amount filters (based on tokenIn amount)
      if (criteria.minAmount && swap.tokenIn.amount < criteria.minAmount) return false;
      if (criteria.maxAmount && swap.tokenIn.amount > criteria.maxAmount) return false;

      // Token filter
      if (criteria.tokenMints && criteria.tokenMints.length > 0) {
        const hasMatchingToken = criteria.tokenMints.includes(swap.tokenIn.mint) ||
                                criteria.tokenMints.includes(swap.tokenOut.mint);
        if (!hasMatchingToken) return false;
      }

      return true;
    });
  }

  /**
   * Get swap statistics
   */
  getSwapStatistics(swaps: RaydiumSwap[]): {
    totalSwaps: number;
    uniqueTokens: Set<string>;
    totalVolume: number; // in token units, not USD
    avgSwapSize: number;
    timeRange: { start: number; end: number } | null;
  } {
    if (swaps.length === 0) {
      return {
        totalSwaps: 0,
        uniqueTokens: new Set(),
        totalVolume: 0,
        avgSwapSize: 0,
        timeRange: null
      };
    }

    const uniqueTokens = new Set<string>();
    let totalVolume = 0;

    for (const swap of swaps) {
      uniqueTokens.add(swap.tokenIn.mint);
      uniqueTokens.add(swap.tokenOut.mint);
      totalVolume += swap.tokenIn.amount;
    }

    const timestamps = swaps.map(s => s.timestamp).sort((a, b) => a - b);
    
    return {
      totalSwaps: swaps.length,
      uniqueTokens,
      totalVolume,
      avgSwapSize: totalVolume / swaps.length,
      timeRange: {
        start: timestamps[0],
        end: timestamps[timestamps.length - 1]
      }
    };
  }
}

// Export singleton instance
export const raydiumParser = new RaydiumTransactionParser();