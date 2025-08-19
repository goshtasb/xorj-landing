/**
 * Performance Metrics Calculator
 * Calculates the foundational metrics required by the PRD:
 * - Net ROI (%)
 * - Maximum Drawdown (%)
 * - Sharpe Ratio
 * - Win/Loss Ratio
 * - Total Trades
 */

import { 
  EnhancedSwap, 
  CompletedTrade, 
  TokenPosition, 
  WalletPerformanceMetrics,
  AnalysisError 
} from '@/types/trader-intelligence';
import { ANALYSIS_CONFIG } from '@/lib/constants';

export class PerformanceMetricsCalculator {

  /**
   * Calculate all performance metrics for a wallet
   */
  calculateMetrics(
    walletAddress: string,
    enhancedSwaps: EnhancedSwap[],
    completedTrades: CompletedTrade[],
    activePositions: TokenPosition[],
    analysisStartDate: number,
    analysisEndDate: number
  ): WalletPerformanceMetrics {
    console.log(`📊 Calculating performance metrics for wallet: ${walletAddress}`);
    console.log(`📈 Data: ${enhancedSwaps.length} swaps, ${completedTrades.length} trades, ${activePositions.length} positions`);

    // Core metrics from PRD
    const netRoi = this.calculateNetROI(completedTrades, activePositions);
    const maxDrawdown = this.calculateMaxDrawdown(completedTrades);
    const sharpeRatio = this.calculateSharpeRatio(completedTrades, analysisStartDate, analysisEndDate);
    const winLossRatio = this.calculateWinLossRatio(completedTrades);
    const totalTrades = completedTrades.length;

    // Additional derived metrics
    const tradeStats = this.calculateTradeStatistics(completedTrades, enhancedSwaps);
    const riskMetrics = this.calculateRiskMetrics(completedTrades);
    const timeBasedMetrics = this.calculateTimeBasedMetrics(completedTrades, analysisStartDate, analysisEndDate);

    // Data quality assessment
    const dataQuality = this.assessDataQuality(enhancedSwaps, completedTrades);
    const confidenceScore = this.calculateConfidenceScore(enhancedSwaps, completedTrades, activePositions);

    const metrics: WalletPerformanceMetrics = {
      walletAddress,
      analysisStartDate,
      analysisEndDate,
      
      // Core PRD metrics
      netRoi,
      maxDrawdown,
      sharpeRatio,
      winLossRatio,
      totalTrades,
      
      // Trading volume and activity
      totalVolumeUsd: tradeStats.totalVolumeUsd,
      totalFeesUsd: tradeStats.totalFeesUsd,
      avgTradeSize: tradeStats.avgTradeSize,
      avgHoldingPeriod: tradeStats.avgHoldingPeriod,
      
      // Win/loss statistics
      winRate: tradeStats.winRate,
      avgWinAmount: tradeStats.avgWinAmount,
      avgLossAmount: tradeStats.avgLossAmount,
      totalWins: tradeStats.totalWins,
      totalLosses: tradeStats.totalLosses,
      largestWin: tradeStats.largestWin,
      largestLoss: tradeStats.largestLoss,
      
      // Risk-adjusted metrics
      profitFactor: tradeStats.profitFactor,
      calmarRatio: riskMetrics.calmarRatio,
      volatility: riskMetrics.volatility,
      varAtRisk: riskMetrics.varAtRisk,
      
      // Time-based analysis
      bestMonth: timeBasedMetrics.bestMonth,
      worstMonth: timeBasedMetrics.worstMonth,
      consecutiveWins: timeBasedMetrics.consecutiveWins,
      consecutiveLosses: timeBasedMetrics.consecutiveLosses,
      
      // Current state
      activePositions,
      completedTrades,
      
      // Metadata
      lastUpdated: Date.now(),
      dataQuality,
      confidenceScore
    };

    console.log(`✅ Metrics calculated - Net ROI: ${netRoi.toFixed(2)}%, Time-Adjusted Sharpe: ${sharpeRatio.toFixed(3)}, Win Rate: ${tradeStats.winRate.toFixed(1)}%`);

    return metrics;
  }

  /**
   * Calculate Net ROI (%) - PRD Core Metric
   */
  private calculateNetROI(completedTrades: CompletedTrade[], activePositions: TokenPosition[]): number {
    if (completedTrades.length === 0 && activePositions.length === 0) return 0;

    // Total realized P&L from completed trades
    const realizedPnL = completedTrades.reduce((sum, trade) => sum + trade.realizedPnlUsd, 0);
    
    // Total unrealized P&L from active positions
    const unrealizedPnL = activePositions.reduce((sum, pos) => sum + (pos.unrealizedPnlUsd || 0), 0);
    
    // Total cost basis
    const realizedCostBasis = completedTrades.reduce((sum, trade) => sum + trade.entryValueUsd, 0);
    const unrealizedCostBasis = activePositions.reduce((sum, pos) => sum + pos.totalCostBasisUsd, 0);
    
    const totalPnL = realizedPnL + unrealizedPnL;
    const totalCostBasis = realizedCostBasis + unrealizedCostBasis;

    if (totalCostBasis === 0) return 0;

    return (totalPnL / totalCostBasis) * 100;
  }

  /**
   * Calculate Maximum Drawdown (%) - PRD Core Metric
   */
  private calculateMaxDrawdown(completedTrades: CompletedTrade[]): number {
    if (completedTrades.length === 0) return 0;

    // Sort trades by exit timestamp
    const sortedTrades = [...completedTrades].sort((a, b) => a.exitTimestamp - b.exitTimestamp);
    
    let runningTotal = 0;
    let peak = 0;
    let maxDrawdown = 0;
    
    for (const trade of sortedTrades) {
      runningTotal += trade.realizedPnlUsd;
      
      // Update peak if we have a new high
      if (runningTotal > peak) {
        peak = runningTotal;
      }
      
      // Calculate current drawdown from peak
      const currentDrawdown = peak - runningTotal;
      
      // Update max drawdown
      if (currentDrawdown > maxDrawdown) {
        maxDrawdown = currentDrawdown;
      }
    }

    // Convert to percentage (if we have a positive peak)
    return peak > 0 ? (maxDrawdown / peak) * 100 : 0;
  }

  /**
   * Calculate Time-Adjusted Sharpe Ratio - PRD Core Metric
   * Uses proper compound interest for risk-free rate and annualization with √252
   */
  private calculateSharpeRatio(
    completedTrades: CompletedTrade[], 
    startDate: number, 
    endDate: number
  ): number {
    if (completedTrades.length < 2) return 0;

    // Calculate analysis period in days
    const analysisDays = (endDate - startDate) / (24 * 60 * 60); // In days
    
    if (analysisDays <= 0) return 0;

    // De-annualize the risk-free rate to a daily rate using compound interest formula
    const dailyRiskFreeRate = Math.pow(1 + ANALYSIS_CONFIG.RISK_FREE_RATE, 1 / 365) - 1;

    // Calculate daily returns from P&L history
    const dailyReturns = this.calculateDailyReturns(completedTrades, startDate, endDate);
    
    if (dailyReturns.length < 2) return 0;

    // Calculate the average daily return of the portfolio
    const averageDailyReturn = dailyReturns.reduce((sum, ret) => sum + ret, 0) / dailyReturns.length;

    // Calculate the standard deviation of daily returns (daily volatility)
    const variance = dailyReturns.reduce((sum, ret) => sum + Math.pow(ret - averageDailyReturn, 2), 0) / (dailyReturns.length - 1);
    const dailyVolatility = Math.sqrt(variance);
    
    if (dailyVolatility === 0) return 0;

    // Calculate the daily Sharpe Ratio (time-consistent components)
    const dailySharpeRatio = (averageDailyReturn - dailyRiskFreeRate) / dailyVolatility;

    // Annualize the Sharpe Ratio by multiplying by the square root of trading days per year
    // 252 is the standard number of trading days in a year (excludes weekends and holidays)
    const annualizedSharpeRatio = dailySharpeRatio * Math.sqrt(252);

    return annualizedSharpeRatio;
  }

  /**
   * Calculate Win/Loss Ratio - PRD Core Metric
   */
  private calculateWinLossRatio(completedTrades: CompletedTrade[]): number {
    if (completedTrades.length === 0) return 0;

    const winningTrades = completedTrades.filter(trade => trade.realizedPnlUsd > 0);
    const losingTrades = completedTrades.filter(trade => trade.realizedPnlUsd < 0);

    if (losingTrades.length === 0) {
      return winningTrades.length > 0 ? Infinity : 0;
    }

    return winningTrades.length / losingTrades.length;
  }

  /**
   * Calculate daily returns for Sharpe ratio calculation
   */
  private calculateDailyReturns(
    completedTrades: CompletedTrade[], 
    startDate: number, 
    endDate: number
  ): number[] {
    // Group trades by day
    const tradesByDay = new Map<string, CompletedTrade[]>();
    
    for (const trade of completedTrades) {
      const date = new Date(trade.exitTimestamp * 1000);
      const dayKey = date.toISOString().split('T')[0]; // YYYY-MM-DD format
      
      if (!tradesByDay.has(dayKey)) {
        tradesByDay.set(dayKey, []);
      }
      tradesByDay.get(dayKey)!.push(trade);
    }

    // Calculate daily P&L and returns
    const dailyReturns: number[] = [];
    let cumulativeValue = 0;

    // Sort days chronologically
    const sortedDays = Array.from(tradesByDay.keys()).sort();

    for (const day of sortedDays) {
      const dayTrades = tradesByDay.get(day)!;
      const dayPnL = dayTrades.reduce((sum, trade) => sum + trade.realizedPnlUsd, 0);
      const dayInvestment = dayTrades.reduce((sum, trade) => sum + trade.entryValueUsd, 0);
      
      if (dayInvestment > 0) {
        const dayReturn = dayPnL / dayInvestment;
        dailyReturns.push(dayReturn);
      }
    }

    return dailyReturns;
  }

  /**
   * Calculate standard deviation for a series of values
   * Used for volatility calculations in risk metrics
   */
  private calculateStandardDeviation(values: number[]): number {
    if (values.length < 2) return 0;
    
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance = values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / (values.length - 1);
    
    return Math.sqrt(variance);
  }

  /**
   * Calculate comprehensive trade statistics
   */
  private calculateTradeStatistics(completedTrades: CompletedTrade[], enhancedSwaps: EnhancedSwap[]): {
    totalVolumeUsd: number;
    totalFeesUsd: number;
    avgTradeSize: number;
    avgHoldingPeriod: number;
    winRate: number;
    avgWinAmount: number;
    avgLossAmount: number;
    totalWins: number;
    totalLosses: number;
    largestWin: number;
    largestLoss: number;
    profitFactor: number;
  } {
    // Volume and fees from enhanced swaps
    const totalVolumeUsd = enhancedSwaps.reduce((sum, swap) => sum + swap.tokenInUsdValue, 0);
    const totalFeesUsd = enhancedSwaps.reduce((sum, swap) => sum + swap.gasFeesUsd, 0);

    if (completedTrades.length === 0) {
      return {
        totalVolumeUsd,
        totalFeesUsd,
        avgTradeSize: 0,
        avgHoldingPeriod: 0,
        winRate: 0,
        avgWinAmount: 0,
        avgLossAmount: 0,
        totalWins: 0,
        totalLosses: 0,
        largestWin: 0,
        largestLoss: 0,
        profitFactor: 0
      };
    }

    // Trade size and holding period
    const avgTradeSize = completedTrades.reduce((sum, trade) => sum + trade.entryValueUsd, 0) / completedTrades.length;
    const avgHoldingPeriod = completedTrades.reduce((sum, trade) => sum + trade.holdingPeriodDays, 0) / completedTrades.length;

    // Win/loss analysis
    const winningTrades = completedTrades.filter(trade => trade.realizedPnlUsd > 0);
    const losingTrades = completedTrades.filter(trade => trade.realizedPnlUsd < 0);

    const winRate = (winningTrades.length / completedTrades.length) * 100;
    
    const totalWins = winningTrades.reduce((sum, trade) => sum + trade.realizedPnlUsd, 0);
    const totalLosses = Math.abs(losingTrades.reduce((sum, trade) => sum + trade.realizedPnlUsd, 0));
    
    const avgWinAmount = winningTrades.length > 0 ? totalWins / winningTrades.length : 0;
    const avgLossAmount = losingTrades.length > 0 ? totalLosses / losingTrades.length : 0;
    
    const largestWin = winningTrades.length > 0 ? Math.max(...winningTrades.map(t => t.realizedPnlUsd)) : 0;
    const largestLoss = losingTrades.length > 0 ? Math.min(...losingTrades.map(t => t.realizedPnlUsd)) : 0;
    
    const profitFactor = totalLosses > 0 ? totalWins / totalLosses : (totalWins > 0 ? Infinity : 0);

    return {
      totalVolumeUsd,
      totalFeesUsd,
      avgTradeSize,
      avgHoldingPeriod,
      winRate,
      avgWinAmount,
      avgLossAmount,
      totalWins: winningTrades.length,
      totalLosses: losingTrades.length,
      largestWin,
      largestLoss,
      profitFactor
    };
  }

  /**
   * Calculate risk metrics
   */
  private calculateRiskMetrics(completedTrades: CompletedTrade[]): {
    calmarRatio: number;
    volatility: number;
    varAtRisk: number;
  } {
    if (completedTrades.length === 0) {
      return { calmarRatio: 0, volatility: 0, varAtRisk: 0 };
    }

    // Calculate returns for volatility
    const returns = completedTrades.map(trade => trade.roi / 100); // Convert percentage to decimal
    
    if (returns.length < 2) {
      return { calmarRatio: 0, volatility: 0, varAtRisk: 0 };
    }

    // Volatility (standard deviation of returns)
    const avgReturn = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
    const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - avgReturn, 2), 0) / (returns.length - 1);
    const volatility = Math.sqrt(variance) * 100; // Convert back to percentage

    // Calmar Ratio (Annual Return / Max Drawdown)
    const totalReturn = completedTrades.reduce((sum, trade) => sum + trade.realizedPnlUsd, 0);
    const totalInvestment = completedTrades.reduce((sum, trade) => sum + trade.entryValueUsd, 0);
    const annualReturn = totalInvestment > 0 ? (totalReturn / totalInvestment) * 100 : 0;
    const maxDrawdown = this.calculateMaxDrawdown(completedTrades);
    const calmarRatio = maxDrawdown > 0 ? annualReturn / maxDrawdown : 0;

    // Value at Risk (95th percentile)
    const sortedReturns = [...returns].sort((a, b) => a - b);
    const varIndex = Math.floor(sortedReturns.length * 0.05); // 5th percentile (95% confidence)
    const varAtRisk = sortedReturns[varIndex] * 100; // Convert back to percentage

    return {
      calmarRatio,
      volatility,
      varAtRisk: Math.abs(varAtRisk) // VaR is typically expressed as positive
    };
  }

  /**
   * Calculate time-based performance metrics
   */
  private calculateTimeBasedMetrics(
    completedTrades: CompletedTrade[], 
    startDate: number, 
    endDate: number
  ): {
    bestMonth: number;
    worstMonth: number;
    consecutiveWins: number;
    consecutiveLosses: number;
  } {
    if (completedTrades.length === 0) {
      return { bestMonth: 0, worstMonth: 0, consecutiveWins: 0, consecutiveLosses: 0 };
    }

    // Group trades by month
    const monthlyReturns = new Map<string, number>();
    
    for (const trade of completedTrades) {
      const date = new Date(trade.exitTimestamp * 1000);
      const monthKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
      
      if (!monthlyReturns.has(monthKey)) {
        monthlyReturns.set(monthKey, 0);
      }
      monthlyReturns.set(monthKey, monthlyReturns.get(monthKey)! + trade.realizedPnlUsd);
    }

    const monthlyValues = Array.from(monthlyReturns.values());
    const bestMonth = monthlyValues.length > 0 ? Math.max(...monthlyValues) : 0;
    const worstMonth = monthlyValues.length > 0 ? Math.min(...monthlyValues) : 0;

    // Calculate consecutive wins/losses
    const sortedTrades = [...completedTrades].sort((a, b) => a.exitTimestamp - b.exitTimestamp);
    
    let consecutiveWins = 0;
    let consecutiveLosses = 0;
    let currentWinStreak = 0;
    let currentLossStreak = 0;
    let maxWinStreak = 0;
    let maxLossStreak = 0;

    for (const trade of sortedTrades) {
      if (trade.realizedPnlUsd > 0) {
        currentWinStreak++;
        currentLossStreak = 0;
        maxWinStreak = Math.max(maxWinStreak, currentWinStreak);
      } else if (trade.realizedPnlUsd < 0) {
        currentLossStreak++;
        currentWinStreak = 0;
        maxLossStreak = Math.max(maxLossStreak, currentLossStreak);
      }
    }

    return {
      bestMonth,
      worstMonth,
      consecutiveWins: maxWinStreak,
      consecutiveLosses: maxLossStreak
    };
  }

  /**
   * Assess data quality based on completeness and consistency
   */
  private assessDataQuality(
    enhancedSwaps: EnhancedSwap[], 
    completedTrades: CompletedTrade[]
  ): 'excellent' | 'good' | 'fair' | 'poor' {
    if (enhancedSwaps.length === 0) return 'poor';

    // Check for missing price data
    const swapsWithPrices = enhancedSwaps.filter(swap => 
      swap.tokenInPriceUsd > 0 && swap.tokenOutPriceUsd > 0
    );
    
    const priceDataCompleteness = swapsWithPrices.length / enhancedSwaps.length;
    
    // Check for reasonable trade data
    const minTrades = ANALYSIS_CONFIG.MIN_TRADES_FOR_ANALYSIS;
    const hasMinTrades = completedTrades.length >= minTrades;
    
    // Quality scoring
    if (priceDataCompleteness >= 0.95 && hasMinTrades && completedTrades.length >= 50) {
      return 'excellent';
    } else if (priceDataCompleteness >= 0.85 && hasMinTrades) {
      return 'good';
    } else if (priceDataCompleteness >= 0.70) {
      return 'fair';
    } else {
      return 'poor';
    }
  }

  /**
   * Calculate confidence score (0-100)
   */
  private calculateConfidenceScore(
    enhancedSwaps: EnhancedSwap[],
    completedTrades: CompletedTrade[],
    activePositions: TokenPosition[]
  ): number {
    let score = 0;

    // Data volume (30 points)
    if (enhancedSwaps.length >= 100) score += 30;
    else if (enhancedSwaps.length >= 50) score += 20;
    else if (enhancedSwaps.length >= 20) score += 10;
    else if (enhancedSwaps.length >= 10) score += 5;

    // Price data quality (25 points)
    const swapsWithPrices = enhancedSwaps.filter(swap => 
      swap.tokenInPriceUsd > 0 && swap.tokenOutPriceUsd > 0
    );
    const priceQuality = enhancedSwaps.length > 0 ? swapsWithPrices.length / enhancedSwaps.length : 0;
    score += Math.floor(priceQuality * 25);

    // Trade completeness (20 points)
    if (completedTrades.length >= 50) score += 20;
    else if (completedTrades.length >= 20) score += 15;
    else if (completedTrades.length >= 10) score += 10;
    else if (completedTrades.length >= 5) score += 5;

    // Time span (15 points)
    if (completedTrades.length > 0) {
      const timeSpan = Math.max(...completedTrades.map(t => t.exitTimestamp)) - 
                     Math.min(...completedTrades.map(t => t.entryTimestamp));
      const daysSpan = timeSpan / (24 * 60 * 60);
      
      if (daysSpan >= 90) score += 15;
      else if (daysSpan >= 60) score += 10;
      else if (daysSpan >= 30) score += 5;
    }

    // Data consistency (10 points)
    const hasConsistentData = enhancedSwaps.every(swap => 
      swap.tokenInUsdValue > 0 && 
      swap.tokenOutUsdValue > 0 &&
      swap.signature &&
      swap.walletAddress
    );
    if (hasConsistentData) score += 10;

    return Math.min(100, Math.max(0, score));
  }

  /**
   * Validate metrics for reasonableness
   */
  validateMetrics(metrics: WalletPerformanceMetrics): {
    isValid: boolean;
    warnings: string[];
  } {
    const warnings: string[] = [];

    // Check for extreme values
    if (Math.abs(metrics.netRoi) > 10000) {
      warnings.push(`Extreme ROI value: ${metrics.netRoi}%`);
    }

    if (metrics.maxDrawdown > 100) {
      warnings.push(`Drawdown exceeds 100%: ${metrics.maxDrawdown}%`);
    }

    if (Math.abs(metrics.sharpeRatio) > 10) {
      warnings.push(`Extreme Sharpe ratio: ${metrics.sharpeRatio}`);
    }

    if (metrics.winLossRatio > 100 && metrics.winLossRatio !== Infinity) {
      warnings.push(`Very high win/loss ratio: ${metrics.winLossRatio}`);
    }

    // Check for data consistency
    if (metrics.totalWins + metrics.totalLosses !== metrics.totalTrades) {
      warnings.push('Trade count mismatch in win/loss statistics');
    }

    if (metrics.winRate < 0 || metrics.winRate > 100) {
      warnings.push(`Invalid win rate: ${metrics.winRate}%`);
    }

    return {
      isValid: warnings.length === 0,
      warnings
    };
  }
}

// Export singleton instance
export const performanceMetricsCalculator = new PerformanceMetricsCalculator();