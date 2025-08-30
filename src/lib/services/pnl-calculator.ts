/**
 * P&L Calculator Service
 * Handles position tracking and profit/loss calculations with USD cost basis
 */

import { 
  RaydiumSwap, 
  EnhancedSwap, 
  TokenPosition, 
  PurchaseLot,
  CompletedTrade, 
  // TokenPriceData, // Unused
  AnalysisError 
} from '@/types/trader-intelligence';
import { priceDataService } from './price-data-service';

export class PnLCalculator {
  private positions = new Map<string, TokenPosition>();
  private completedTrades: CompletedTrade[] = [];
  private errors: AnalysisError[] = [];

  /**
   * Process multiple swaps and calculate P&L
   */
  async calculatePnLForSwaps(
    swaps: RaydiumSwap[]
  ): Promise<{ enhancedSwaps: EnhancedSwap[]; positions: TokenPosition[]; completedTrades: CompletedTrade[]; errors: AnalysisError[] }> {
    console.log(`💰 Calculating P&L for ${swaps.length} swaps`);

    this.positions.clear();
    this.completedTrades = [];
    this.errors = [];

    const enhancedSwaps: EnhancedSwap[] = [];

    // Sort swaps by timestamp for proper position tracking
    const sortedSwaps = [...swaps].sort((a, b) => a.timestamp - b.timestamp);

    for (let i = 0; i < sortedSwaps.length; i++) {
      const swap = sortedSwaps[i];
      
      try {
        const enhancedSwap = await this.processSwap(swap);
        if (enhancedSwap) {
          enhancedSwaps.push(enhancedSwap);
        }

        // Progress logging
        if (i > 0 && i % 50 === 0) {
          console.log(`📊 P&L Progress: ${i}/${sortedSwaps.length} swaps processed`);
        }

      } catch {
        console.error(`❌ Error processing swap ${swap.signature}:`);
        this.errors.push({
          type: 'calculation_error',
          message: `P&L calculation error: ${error}`,
          timestamp: Date.now(),
          context: { signature: swap.signature }
        });
      }
    }

    console.log(`✅ P&L calculation complete: ${enhancedSwaps.length} enhanced swaps`);
    console.log(`📈 Active positions: ${this.positions.size}`);
    console.log(`💼 Completed trades: ${this.completedTrades.length}`);

    return {
      enhancedSwaps,
      positions: Array.from(this.positions.values()),
      completedTrades: this.completedTrades,
      errors: this.errors
    };
  }

  /**
   * Process a single swap transaction
   */
  private async processSwap(swap: RaydiumSwap): Promise<EnhancedSwap | null> {
    // Get historical prices for both tokens at the time of the swap
    const priceResults = await priceDataService.getCurrentPrices([swap.tokenIn.mint, swap.tokenOut.mint]);
    
    // For historical accuracy, we should get historical prices
    // For now, using current prices as fallback - in production, implement historical price fetching
    const tokenInHistoricalPrice = await priceDataService.getHistoricalPrice(swap.tokenIn.mint, swap.timestamp);
    const tokenOutHistoricalPrice = await priceDataService.getHistoricalPrice(swap.tokenOut.mint, swap.timestamp);

    // Fallback to current prices if historical not available
    let tokenInPriceData = tokenInHistoricalPrice;
    let tokenOutPriceData = tokenOutHistoricalPrice;

    if (!tokenInPriceData) {
      tokenInPriceData = priceResults.prices.find(p => p.mint === swap.tokenIn.mint) || null;
    }
    if (!tokenOutPriceData) {
      tokenOutPriceData = priceResults.prices.find(p => p.mint === swap.tokenOut.mint) || null;
    }

    if (!tokenInPriceData || !tokenOutPriceData) {
      console.warn(`⚠️ Missing price data for swap ${swap.signature}`);
      return null;
    }

    const tokenInPriceUsd = tokenInPriceData.priceUsd;
    const tokenOutPriceUsd = tokenOutPriceData.priceUsd;

    // Calculate USD values
    const tokenInUsdValue = swap.tokenIn.amount * tokenInPriceUsd;
    const tokenOutUsdValue = swap.tokenOut.amount * tokenOutPriceUsd;

    // Calculate slippage
    const expectedTokenOutAmount = tokenInUsdValue / tokenOutPriceUsd;
    const slippage = ((expectedTokenOutAmount - swap.tokenOut.amount) / expectedTokenOutAmount) * 100;

    // Process position changes
    const realizedPnL = await this.updatePositions(swap, tokenInPriceUsd, tokenOutPriceUsd);

    // Calculate gas fees in USD (approximate SOL price for fees)
    const gasFeesUsd = await this.calculateGasFeesUsd(swap.fee, swap.timestamp);

    const enhancedSwap: EnhancedSwap = {
      ...swap,
      tokenInUsdValue,
      tokenOutUsdValue,
      tokenInPriceUsd,
      tokenOutPriceUsd,
      realizedPnlUsd: realizedPnL,
      costBasisUsd: tokenInUsdValue,
      slippage: Math.max(0, slippage), // Slippage can't be negative
      gasFeesUsd
    };

    return enhancedSwap;
  }

  /**
   * Update positions and calculate realized P&L using FIFO accounting
   */
  private async updatePositions(
    swap: RaydiumSwap,
    tokenInPriceUsd: number,
    tokenOutPriceUsd: number
  ): Promise<number> {
    let realizedPnL = 0;

    // Handle token being sold (tokenIn) - FIFO accounting
    const tokenInPosition = this.positions.get(swap.tokenIn.mint);
    if (tokenInPosition) {
      const fifoResult = this.calculateRealizedPnlFIFO(swap, tokenInPriceUsd, tokenInPosition);
      realizedPnL += fifoResult.pnl;

      // Update position totals after FIFO processing
      tokenInPosition.totalAmount = tokenInPosition.lots.reduce((sum, lot) => sum + lot.amount, 0);
      tokenInPosition.totalCostBasisUsd = tokenInPosition.lots.reduce((sum, lot) => sum + lot.costBasisUsd, 0);
      tokenInPosition.averageCostBasis = tokenInPosition.totalAmount > 0 
        ? tokenInPosition.totalCostBasisUsd / tokenInPosition.totalAmount 
        : 0;
      tokenInPosition.lastTransactionTimestamp = swap.timestamp;

      // Create completed trade records for each lot consumed
      fifoResult.completedTrades.forEach(trade => {
        this.completedTrades.push(trade);
      });

      // Remove position if fully sold
      if (tokenInPosition.totalAmount <= 1e-9) { // Use epsilon for floating-point precision
        this.positions.delete(swap.tokenIn.mint);
      }
    } else {
      // Short sale detected - selling without existing position
      console.warn(`⚠️ Short sale detected for ${swap.tokenIn.mint} in ${swap.signature}`);
      // For AMM context, we'll treat this as zero cost basis (conservative approach)
      realizedPnL += swap.tokenIn.amount * tokenInPriceUsd;
    }

    // Handle token being bought (tokenOut) - Add new lot to FIFO queue
    const tokenOutPosition = this.positions.get(swap.tokenOut.mint);
    const newLot: PurchaseLot = {
      amount: swap.tokenOut.amount,
      costBasisUsd: swap.tokenOut.amount * tokenOutPriceUsd,
      timestamp: swap.timestamp,
      signature: swap.signature
    };

    if (tokenOutPosition) {
      // Add to existing position
      tokenOutPosition.lots.push(newLot);
      tokenOutPosition.totalAmount += swap.tokenOut.amount;
      tokenOutPosition.totalCostBasisUsd += newLot.costBasisUsd;
      tokenOutPosition.averageCostBasis = tokenOutPosition.totalCostBasisUsd / tokenOutPosition.totalAmount;
      tokenOutPosition.lastTransactionTimestamp = swap.timestamp;
    } else {
      // Create new position
      this.positions.set(swap.tokenOut.mint, {
        mint: swap.tokenOut.mint,
        symbol: swap.tokenOut.symbol,
        totalAmount: swap.tokenOut.amount,
        averageCostBasis: tokenOutPriceUsd,
        totalCostBasisUsd: newLot.costBasisUsd,
        lots: [newLot],
        firstPurchaseTimestamp: swap.timestamp,
        lastTransactionTimestamp: swap.timestamp
      });
    }

    return realizedPnL;
  }

  /**
   * Calculate realized P&L using FIFO method for partial sells
   */
  private calculateRealizedPnlFIFO(
    swap: RaydiumSwap,
    currentPriceUsd: number,
    position: TokenPosition
  ): { pnl: number; costOfGoodsSold: number; completedTrades: CompletedTrade[] } {
    if (!position || position.lots.length === 0) {
      return { pnl: 0, costOfGoodsSold: 0, completedTrades: [] };
    }

    let amountToSell = swap.tokenIn.amount;
    let costOfGoodsSold = 0;
    let totalPnL = 0;
    const completedTrades: CompletedTrade[] = [];

    // Apply FIFO: Sell from the oldest lots first
    while (amountToSell > 0 && position.lots.length > 0) {
      const oldestLot = position.lots[0];
      const amountFromLot = Math.min(amountToSell, oldestLot.amount);

      // Calculate cost per token for this specific lot
      const costPerTokenInLot = oldestLot.costBasisUsd / oldestLot.amount;
      const lotCostOfGoodsSold = amountFromLot * costPerTokenInLot;
      const lotPnL = (currentPriceUsd * amountFromLot) - lotCostOfGoodsSold;

      costOfGoodsSold += lotCostOfGoodsSold;
      totalPnL += lotPnL;

      // Create completed trade record for this lot
      completedTrades.push({
        id: `${swap.signature}_${position.mint}_lot_${oldestLot.timestamp}`,
        tokenMint: position.mint,
        tokenSymbol: position.symbol,
        entryTimestamp: oldestLot.timestamp,
        exitTimestamp: swap.timestamp,
        entryPriceUsd: costPerTokenInLot,
        exitPriceUsd: currentPriceUsd,
        quantity: amountFromLot,
        entryValueUsd: lotCostOfGoodsSold,
        exitValueUsd: currentPriceUsd * amountFromLot,
        realizedPnlUsd: lotPnL,
        holdingPeriodDays: (swap.timestamp - oldestLot.timestamp) / (24 * 60 * 60),
        entryTransactionSignature: oldestLot.signature,
        exitTransactionSignature: swap.signature,
        tradeType: 'long',
        roi: costPerTokenInLot > 0 ? ((currentPriceUsd - costPerTokenInLot) / costPerTokenInLot) * 100 : 0
      });

      // Update the lot
      oldestLot.amount -= amountFromLot;
      oldestLot.costBasisUsd -= lotCostOfGoodsSold;
      amountToSell -= amountFromLot;

      // Remove lot if fully consumed (using epsilon for floating-point precision)
      if (oldestLot.amount <= 1e-9) {
        position.lots.shift();
      }
    }

    return {
      pnl: totalPnL,
      costOfGoodsSold,
      completedTrades
    };
  }

  /**
   * Calculate gas fees in USD
   */
  private async calculateGasFeesUsd(feeLamports: number, timestamp: number): Promise<number> {
    try {
      const solPriceData = await priceDataService.getHistoricalPrice(
        'So11111111111111111111111111111111111111112', // SOL mint
        timestamp
      );

      if (solPriceData) {
        const feeSol = feeLamports / 1_000_000_000; // Convert lamports to SOL
        return feeSol * solPriceData.priceUsd;
      }

      // Fallback to current SOL price
      const currentSolPrice = await priceDataService.getCurrentPrices(['So11111111111111111111111111111111111111112']);
      if (currentSolPrice.prices.length > 0) {
        const feeSol = feeLamports / 1_000_000_000;
        return feeSol * currentSolPrice.prices[0].priceUsd;
      }

      return 0;
    } catch {
      console.warn(`⚠️ Failed to calculate gas fees in USD:`, error);
      return 0;
    }
  }

  /**
   * Calculate unrealized P&L for current positions
   */
  async calculateUnrealizedPnL(currentPrices?: Map<string, number>): Promise<Map<string, number>> {
    const unrealizedPnL = new Map<string, number>();

    if (!currentPrices) {
      // Fetch current prices for all positions
      const mints = Array.from(this.positions.keys());
      const priceResults = await priceDataService.getCurrentPrices(mints);
      
      currentPrices = new Map();
      priceResults.prices.forEach(price => {
        currentPrices!.set(price.mint, price.priceUsd);
      });
    }

    for (const [mint, position] of this.positions) {
      const currentPrice = currentPrices.get(mint);
      if (currentPrice) {
        const unrealizedValue = position.totalAmount * currentPrice;
        const pnl = unrealizedValue - position.totalCostBasisUsd;
        unrealizedPnL.set(mint, pnl);
        
        // Update position with unrealized P&L
        position.unrealizedPnlUsd = pnl;
      }
    }

    return unrealizedPnL;
  }

  /**
   * Get total portfolio value
   */
  async getPortfolioValue(): Promise<{
    totalValue: number;
    totalCostBasis: number;
    totalUnrealizedPnL: number;
    totalRealizedPnL: number;
  }> {
    await this.calculateUnrealizedPnL();

    let totalValue = 0;
    let totalCostBasis = 0;
    let totalUnrealizedPnL = 0;

    for (const position of this.positions.values()) {
      totalCostBasis += position.totalCostBasisUsd;
      totalUnrealizedPnL += position.unrealizedPnlUsd || 0;
    }

    totalValue = totalCostBasis + totalUnrealizedPnL;

    const totalRealizedPnL = this.completedTrades.reduce(
      (sum, trade) => sum + trade.realizedPnlUsd, 0
    );

    return {
      totalValue,
      totalCostBasis,
      totalUnrealizedPnL,
      totalRealizedPnL
    };
  }

  /**
   * Get position summary
   */
  getPositionSummary(): {
    activePositions: number;
    totalPositionValue: number;
    largestPosition: TokenPosition | null;
    oldestPosition: TokenPosition | null;
  } {
    const positions = Array.from(this.positions.values());
    
    if (positions.length === 0) {
      return {
        activePositions: 0,
        totalPositionValue: 0,
        largestPosition: null,
        oldestPosition: null
      };
    }

    const totalPositionValue = positions.reduce(
      (sum, pos) => sum + pos.totalCostBasisUsd, 0
    );

    const largestPosition = positions.reduce((largest, current) =>
      current.totalCostBasisUsd > largest.totalCostBasisUsd ? current : largest
    );

    const oldestPosition = positions.reduce((oldest, current) =>
      current.firstPurchaseTimestamp < oldest.firstPurchaseTimestamp ? current : oldest
    );

    return {
      activePositions: positions.length,
      totalPositionValue,
      largestPosition,
      oldestPosition
    };
  }

  /**
   * Get trade statistics
   */
  getTradeStatistics(): {
    totalTrades: number;
    winningTrades: number;
    losingTrades: number;
    winRate: number;
    avgWinAmount: number;
    avgLossAmount: number;
    largestWin: number;
    largestLoss: number;
    profitFactor: number;
  } {
    if (this.completedTrades.length === 0) {
      return {
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        winRate: 0,
        avgWinAmount: 0,
        avgLossAmount: 0,
        largestWin: 0,
        largestLoss: 0,
        profitFactor: 0
      };
    }

    const winningTrades = this.completedTrades.filter(t => t.realizedPnlUsd > 0);
    const losingTrades = this.completedTrades.filter(t => t.realizedPnlUsd < 0);

    const totalWins = winningTrades.reduce((sum, t) => sum + t.realizedPnlUsd, 0);
    const totalLosses = Math.abs(losingTrades.reduce((sum, t) => sum + t.realizedPnlUsd, 0));

    return {
      totalTrades: this.completedTrades.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      winRate: (winningTrades.length / this.completedTrades.length) * 100,
      avgWinAmount: winningTrades.length > 0 ? totalWins / winningTrades.length : 0,
      avgLossAmount: losingTrades.length > 0 ? totalLosses / losingTrades.length : 0,
      largestWin: winningTrades.length > 0 ? Math.max(...winningTrades.map(t => t.realizedPnlUsd)) : 0,
      largestLoss: losingTrades.length > 0 ? Math.min(...losingTrades.map(t => t.realizedPnlUsd)) : 0,
      profitFactor: totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? Infinity : 0
    };
  }

  /**
   * Reset calculator state
   */
  reset(): void {
    this.positions.clear();
    this.completedTrades = [];
    this.errors = [];
  }

  /**
   * Get current positions
   */
  getPositions(): TokenPosition[] {
    return Array.from(this.positions.values());
  }

  /**
   * Get completed trades
   */
  getCompletedTrades(): CompletedTrade[] {
    return [...this.completedTrades];
  }

  /**
   * Get calculation errors
   */
  getErrors(): AnalysisError[] {
    return [...this.errors];
  }

  /**
   * Validate P&L calculations with FIFO lot integrity
   */
  validateCalculations(): {
    isValid: boolean;
    issues: string[];
  } {
    const issues: string[] = [];

    // Check for negative positions (shouldn't happen in normal AMM trading)
    for (const position of this.positions.values()) {
      if (position.totalAmount < 0) {
        issues.push(`Negative position detected for ${position.symbol}`);
      }
      if (position.averageCostBasis <= 0) {
        issues.push(`Invalid cost basis for ${position.symbol}`);
      }

      // Validate FIFO lots integrity
      if (!position.lots || position.lots.length === 0) {
        if (position.totalAmount > 1e-9) {
          issues.push(`Position ${position.symbol} has amount but no lots`);
        }
      } else {
        // Check lots consistency
        const calculatedAmount = position.lots.reduce((sum, lot) => sum + lot.amount, 0);
        const calculatedCostBasis = position.lots.reduce((sum, lot) => sum + lot.costBasisUsd, 0);

        if (Math.abs(calculatedAmount - position.totalAmount) > 1e-6) {
          issues.push(`Amount mismatch for ${position.symbol}: lots=${calculatedAmount}, position=${position.totalAmount}`);
        }

        if (Math.abs(calculatedCostBasis - position.totalCostBasisUsd) > 1e-6) {
          issues.push(`Cost basis mismatch for ${position.symbol}: lots=${calculatedCostBasis}, position=${position.totalCostBasisUsd}`);
        }

        // Check individual lots
        for (let i = 0; i < position.lots.length; i++) {
          const lot = position.lots[i];
          if (lot.amount <= 0) {
            issues.push(`Invalid lot amount for ${position.symbol} lot ${i}`);
          }
          if (lot.costBasisUsd <= 0) {
            issues.push(`Invalid lot cost basis for ${position.symbol} lot ${i}`);
          }

          // Verify FIFO order (lots should be chronological)
          if (i > 0 && lot.timestamp < position.lots[i - 1].timestamp) {
            issues.push(`FIFO order violation for ${position.symbol}: lot ${i} is older than lot ${i - 1}`);
          }
        }
      }
    }

    // Check trade data integrity
    for (const trade of this.completedTrades) {
      if (trade.entryTimestamp > trade.exitTimestamp) {
        issues.push(`Invalid trade timestamps for ${trade.id}`);
      }
      if (trade.quantity <= 0) {
        issues.push(`Invalid trade quantity for ${trade.id}`);
      }
      if (trade.entryPriceUsd <= 0) {
        issues.push(`Invalid entry price for ${trade.id}`);
      }
      if (trade.exitPriceUsd <= 0) {
        issues.push(`Invalid exit price for ${trade.id}`);
      }
    }

    return {
      isValid: issues.length === 0,
      issues
    };
  }
}

// Export singleton instance
export const pnlCalculator = new PnLCalculator();