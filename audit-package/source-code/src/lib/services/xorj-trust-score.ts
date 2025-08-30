/**
 * XORJ Trust Score Algorithm - Task 3.2
 * Proprietary scoring system that prioritizes safety and risk-adjusted returns
 */

import { WalletPerformanceMetrics, CompletedTrade } from '@/types/trader-intelligence';

// XORJ Trust Score Algorithm Constants
const SHARPE_WEIGHT = 0.40;
const ROI_WEIGHT = 0.25;
const DRAWDOWN_PENALTY_WEIGHT = 0.35; // Penalty weight (subtracted)

// Eligibility Criteria
const MIN_TRADING_DAYS = 90;
const MIN_TRADES = 50;
const MAX_SINGLE_DAY_ROI_SPIKE = 500; // 500% single-day ROI spike threshold

export interface EligibilityResult {
  isEligible: boolean;
  reasons: string[];
  tradingDays: number;
  totalTrades: number;
  maxSingleDayROI: number;
  hasRiskySpikes: boolean;
}

export interface NormalizedMetrics {
  normalizedSharpe: number;
  normalizedRoi: number;
  normalizedMaxDrawdown: number; // Higher value = worse drawdown
}

export interface XORJTrustScore {
  walletAddress: string;
  trustScore: number; // 0-100
  eligibility: EligibilityResult;
  normalizedMetrics: NormalizedMetrics;
  performanceScore: number;
  riskPenalty: number;
  rank?: number;
  tier?: 'S' | 'A' | 'B' | 'C' | 'D';
}

export interface ScoringCohortStats {
  totalWallets: number;
  eligibleWallets: number;
  disqualifiedWallets: number;
  avgTrustScore: number;
  topScore: number;
  minROI: number;
  maxROI: number;
  minSharpe: number;
  maxSharpe: number;
  minDrawdown: number;
  maxDrawdown: number;
}

export class XORJTrustScoreCalculator {

  /**
   * Calculate XORJ Trust Scores for a list of wallet performance metrics
   */
  calculateTrustScores(walletMetrics: WalletPerformanceMetrics[]): {
    scores: XORJTrustScore[];
    cohortStats: ScoringCohortStats;
  } {
    console.log(`🎯 Calculating XORJ Trust Scores for ${walletMetrics.length} wallets`);

    // Step 1: Filter eligible wallets
    const eligibilityResults = walletMetrics.map(metrics => ({
      metrics,
      eligibility: this.checkEligibility(metrics)
    }));

    const eligibleWallets = eligibilityResults.filter(result => result.eligibility.isEligible);
    console.log(`✅ ${eligibleWallets.length}/${walletMetrics.length} wallets eligible for scoring`);

    if (eligibleWallets.length === 0) {
      console.warn('⚠️ No eligible wallets found for scoring');
      return {
        scores: eligibilityResults.map(result => ({
          walletAddress: result.metrics.walletAddress,
          trustScore: 0,
          eligibility: result.eligibility,
          normalizedMetrics: { normalizedSharpe: 0, normalizedRoi: 0, normalizedMaxDrawdown: 0 },
          performanceScore: 0,
          riskPenalty: 0
        })),
        cohortStats: this.createEmptyCohortStats(walletMetrics.length)
      };
    }

    // Step 2: Calculate normalization bounds from eligible wallets
    const bounds = this.calculateNormalizationBounds(eligibleWallets.map(w => w.metrics));

    // Step 3: Calculate normalized metrics and trust scores
    const scores: XORJTrustScore[] = eligibilityResults.map(result => {
      if (!result.eligibility.isEligible) {
        return {
          walletAddress: result.metrics.walletAddress,
          trustScore: 0,
          eligibility: result.eligibility,
          normalizedMetrics: { normalizedSharpe: 0, normalizedRoi: 0, normalizedMaxDrawdown: 0 },
          performanceScore: 0,
          riskPenalty: 0
        };
      }

      const normalizedMetrics = this.normalizeMetrics(result.metrics, bounds);
      const trustScore = this.calculateXORJTrustScore(normalizedMetrics);
      
      return {
        walletAddress: result.metrics.walletAddress,
        trustScore: Math.round(trustScore * 100) / 100, // Round to 2 decimal places
        eligibility: result.eligibility,
        normalizedMetrics,
        performanceScore: this.calculatePerformanceScore(normalizedMetrics),
        riskPenalty: this.calculateRiskPenalty(normalizedMetrics)
      };
    });

    // Step 4: Rank and assign tiers
    const rankedScores = this.rankAndTierScores(scores);

    // Step 5: Generate cohort statistics
    const cohortStats = this.generateCohortStats(walletMetrics, rankedScores, bounds);

    console.log(`🏆 Trust Score Results:`);
    console.log(`   • Top Score: ${cohortStats.topScore}`);
    console.log(`   • Average Score: ${cohortStats.avgTrustScore.toFixed(2)}`);
    console.log(`   • Eligible: ${cohortStats.eligibleWallets}/${cohortStats.totalWallets}`);

    return { scores: rankedScores, cohortStats };
  }

  /**
   * Check wallet eligibility based on XORJ criteria
   */
  private checkEligibility(metrics: WalletPerformanceMetrics): EligibilityResult {
    const reasons: string[] = [];
    let isEligible = true;

    // Calculate trading days
    const tradingDays = Math.ceil((metrics.analysisEndDate - metrics.analysisStartDate) / (24 * 60 * 60));
    
    // Check minimum trading history
    if (tradingDays < MIN_TRADING_DAYS) {
      reasons.push(`Insufficient trading history: ${tradingDays} days < ${MIN_TRADING_DAYS} required`);
      isEligible = false;
    }

    // Check minimum trades
    if (metrics.totalTrades < MIN_TRADES) {
      reasons.push(`Insufficient trades: ${metrics.totalTrades} < ${MIN_TRADES} required`);
      isEligible = false;
    }

    // Check for risky single-day ROI spikes
    const maxSingleDayROI = this.detectMaxSingleDayROI(metrics.completedTrades);
    const hasRiskySpikes = maxSingleDayROI > MAX_SINGLE_DAY_ROI_SPIKE;
    
    if (hasRiskySpikes) {
      reasons.push(`Risky trading detected: ${maxSingleDayROI.toFixed(2)}% single-day ROI > ${MAX_SINGLE_DAY_ROI_SPIKE}% threshold`);
      isEligible = false;
    }

    if (isEligible) {
      reasons.push('All eligibility criteria met');
    }

    return {
      isEligible,
      reasons,
      tradingDays,
      totalTrades: metrics.totalTrades,
      maxSingleDayROI,
      hasRiskySpikes
    };
  }

  /**
   * Detect maximum single-day ROI spike from completed trades
   */
  private detectMaxSingleDayROI(completedTrades: CompletedTrade[]): number {
    if (completedTrades.length === 0) return 0;

    // Group trades by day and calculate daily P&L
    const dailyPnL = new Map<string, { pnl: number; investment: number }>();
    
    for (const trade of completedTrades) {
      const date = new Date(trade.exitTimestamp * 1000);
      const dayKey = date.toISOString().split('T')[0]; // YYYY-MM-DD
      
      if (!dailyPnL.has(dayKey)) {
        dailyPnL.set(dayKey, { pnl: 0, investment: 0 });
      }
      
      const dayData = dailyPnL.get(dayKey)!;
      dayData.pnl += trade.realizedPnlUsd;
      dayData.investment += trade.entryValueUsd;
    }

    // Calculate daily ROI percentages
    let maxDailyROI = 0;
    
    for (const [day, data] of dailyPnL) {
      if (data.investment > 0) {
        const dailyROI = Math.abs((data.pnl / data.investment) * 100);
        maxDailyROI = Math.max(maxDailyROI, dailyROI);
      }
    }

    return maxDailyROI;
  }

  /**
   * Calculate normalization bounds from eligible wallets
   */
  private calculateNormalizationBounds(eligibleMetrics: WalletPerformanceMetrics[]): {
    minROI: number;
    maxROI: number;
    minSharpe: number;
    maxSharpe: number;
    minDrawdown: number;
    maxDrawdown: number;
  } {
    const rois = eligibleMetrics.map(m => m.netRoi);
    const sharpes = eligibleMetrics.map(m => m.sharpeRatio);
    const drawdowns = eligibleMetrics.map(m => m.maxDrawdown);

    return {
      minROI: Math.min(...rois),
      maxROI: Math.max(...rois),
      minSharpe: Math.min(...sharpes),
      maxSharpe: Math.max(...sharpes),
      minDrawdown: Math.min(...drawdowns),
      maxDrawdown: Math.max(...drawdowns)
    };
  }

  /**
   * Normalize metrics to 0.0-1.0 scale
   */
  private normalizeMetrics(
    metrics: WalletPerformanceMetrics,
    bounds: ReturnType<typeof this.calculateNormalizationBounds>
  ): NormalizedMetrics {
    // Normalize ROI (higher is better)
    const normalizedRoi = bounds.maxROI > bounds.minROI
      ? Math.max(0, Math.min(1, (metrics.netRoi - bounds.minROI) / (bounds.maxROI - bounds.minROI)))
      : 0.5;

    // Normalize Sharpe Ratio (higher is better)
    const normalizedSharpe = bounds.maxSharpe > bounds.minSharpe
      ? Math.max(0, Math.min(1, (metrics.sharpeRatio - bounds.minSharpe) / (bounds.maxSharpe - bounds.minSharpe)))
      : 0.5;

    // Normalize Max Drawdown (lower is better, so we invert it for penalty calculation)
    // Higher normalized value = worse drawdown = higher penalty
    const normalizedMaxDrawdown = bounds.maxDrawdown > bounds.minDrawdown
      ? Math.max(0, Math.min(1, (metrics.maxDrawdown - bounds.minDrawdown) / (bounds.maxDrawdown - bounds.minDrawdown)))
      : 0.5;

    return {
      normalizedRoi,
      normalizedSharpe,
      normalizedMaxDrawdown
    };
  }

  /**
   * Calculate XORJ Trust Score using proprietary formula
   */
  private calculateXORJTrustScore(normalizedMetrics: NormalizedMetrics): number {
    const performanceScore = this.calculatePerformanceScore(normalizedMetrics);
    const riskPenalty = this.calculateRiskPenalty(normalizedMetrics);

    // The final score heavily penalizes high drawdowns
    const finalScore = performanceScore - riskPenalty;

    // Scale to 0-100 and ensure it's not negative
    return Math.max(0, finalScore) * 100;
  }

  /**
   * Calculate performance component of trust score
   */
  private calculatePerformanceScore(normalizedMetrics: NormalizedMetrics): number {
    return (normalizedMetrics.normalizedSharpe * SHARPE_WEIGHT) + 
           (normalizedMetrics.normalizedRoi * ROI_WEIGHT);
  }

  /**
   * Calculate risk penalty component of trust score
   */
  private calculateRiskPenalty(normalizedMetrics: NormalizedMetrics): number {
    return normalizedMetrics.normalizedMaxDrawdown * DRAWDOWN_PENALTY_WEIGHT;
  }

  /**
   * Rank scores and assign performance tiers
   */
  private rankAndTierScores(scores: XORJTrustScore[]): XORJTrustScore[] {
    // Sort by trust score (descending)
    const sortedScores = [...scores].sort((a, b) => b.trustScore - a.trustScore);

    // Assign ranks and tiers
    return sortedScores.map((score, index) => {
      const rank = index + 1;
      let tier: 'S' | 'A' | 'B' | 'C' | 'D';

      // Tier assignment based on trust score
      if (score.trustScore >= 80) tier = 'S';
      else if (score.trustScore >= 65) tier = 'A';
      else if (score.trustScore >= 50) tier = 'B';
      else if (score.trustScore >= 30) tier = 'C';
      else tier = 'D';

      return { ...score, rank, tier };
    });
  }

  /**
   * Generate cohort statistics
   */
  private generateCohortStats(
    allMetrics: WalletPerformanceMetrics[],
    scores: XORJTrustScore[],
    bounds: ReturnType<typeof this.calculateNormalizationBounds>
  ): ScoringCohortStats {
    const eligibleScores = scores.filter(s => s.eligibility.isEligible);
    const trustScores = eligibleScores.map(s => s.trustScore);

    return {
      totalWallets: allMetrics.length,
      eligibleWallets: eligibleScores.length,
      disqualifiedWallets: allMetrics.length - eligibleScores.length,
      avgTrustScore: trustScores.length > 0 ? trustScores.reduce((sum, score) => sum + score, 0) / trustScores.length : 0,
      topScore: trustScores.length > 0 ? Math.max(...trustScores) : 0,
      minROI: bounds.minROI,
      maxROI: bounds.maxROI,
      minSharpe: bounds.minSharpe,
      maxSharpe: bounds.maxSharpe,
      minDrawdown: bounds.minDrawdown,
      maxDrawdown: bounds.maxDrawdown
    };
  }

  /**
   * Create empty cohort stats for edge cases
   */
  private createEmptyCohortStats(totalWallets: number): ScoringCohortStats {
    return {
      totalWallets,
      eligibleWallets: 0,
      disqualifiedWallets: totalWallets,
      avgTrustScore: 0,
      topScore: 0,
      minROI: 0,
      maxROI: 0,
      minSharpe: 0,
      maxSharpe: 0,
      minDrawdown: 0,
      maxDrawdown: 0
    };
  }

  /**
   * Get top N traders by trust score
   */
  getTopTraders(scores: XORJTrustScore[], limit: number = 10): XORJTrustScore[] {
    return scores
      .filter(score => score.eligibility.isEligible)
      .sort((a, b) => b.trustScore - a.trustScore)
      .slice(0, limit);
  }

  /**
   * Filter traders by minimum trust score
   */
  filterByMinScore(scores: XORJTrustScore[], minScore: number): XORJTrustScore[] {
    return scores.filter(score => 
      score.eligibility.isEligible && score.trustScore >= minScore
    );
  }

  /**
   * Get traders by tier
   */
  getTradersByTier(scores: XORJTrustScore[], tier: 'S' | 'A' | 'B' | 'C' | 'D'): XORJTrustScore[] {
    return scores.filter(score => 
      score.eligibility.isEligible && score.tier === tier
    );
  }

  /**
   * Validate trust score calculations
   */
  validateScores(scores: XORJTrustScore[]): {
    isValid: boolean;
    issues: string[];
  } {
    const issues: string[] = [];

    for (const score of scores) {
      // Check score bounds
      if (score.trustScore < 0 || score.trustScore > 100) {
        issues.push(`Invalid trust score for ${score.walletAddress}: ${score.trustScore}`);
      }

      // Check normalized metrics bounds
      const { normalizedRoi, normalizedSharpe, normalizedMaxDrawdown } = score.normalizedMetrics;
      
      if (normalizedRoi < 0 || normalizedRoi > 1) {
        issues.push(`Invalid normalized ROI for ${score.walletAddress}: ${normalizedRoi}`);
      }
      if (normalizedSharpe < 0 || normalizedSharpe > 1) {
        issues.push(`Invalid normalized Sharpe for ${score.walletAddress}: ${normalizedSharpe}`);
      }
      if (normalizedMaxDrawdown < 0 || normalizedMaxDrawdown > 1) {
        issues.push(`Invalid normalized drawdown for ${score.walletAddress}: ${normalizedMaxDrawdown}`);
      }

      // Check component calculations
      const expectedPerformance = (normalizedSharpe * SHARPE_WEIGHT) + (normalizedRoi * ROI_WEIGHT);
      const expectedPenalty = normalizedMaxDrawdown * DRAWDOWN_PENALTY_WEIGHT;
      
      if (Math.abs(score.performanceScore - expectedPerformance) > 0.01) {
        issues.push(`Performance score mismatch for ${score.walletAddress}`);
      }
      if (Math.abs(score.riskPenalty - expectedPenalty) > 0.01) {
        issues.push(`Risk penalty mismatch for ${score.walletAddress}`);
      }
    }

    return {
      isValid: issues.length === 0,
      issues
    };
  }
}

// Export singleton instance
export const xorjTrustScoreCalculator = new XORJTrustScoreCalculator();