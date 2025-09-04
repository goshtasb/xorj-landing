/**
 * XORJ Trust Score Usage Examples - Task 3.2
 * Demonstrates the proprietary trader scoring algorithm
 */

import { xorjTrustScoreCalculator } from '@/lib/services/xorj-trust-score';
import { traderIntelligenceEngine } from '@/lib/services/trader-intelligence-engine';
import { WalletPerformanceMetrics } from '@/types/trader-intelligence';

/**
 * Example 1: Score a cohort of pre-analyzed wallets
 */
export async function exampleTrustScoreCalculation() {

  // Example wallet metrics (normally from trader intelligence analysis)
  const mockWalletMetrics: WalletPerformanceMetrics[] = [
    {
      walletAddress: 'HighPerformer123...',
      netRoi: 85.5,
      maxDrawdown: 15.2,
      sharpeRatio: 2.8,
      winLossRatio: 2.1,
      totalTrades: 127,
      winRate: 68.5,
      analysisStartDate: Date.now() / 1000 - (120 * 24 * 60 * 60), // 120 days ago
      analysisEndDate: Date.now() / 1000,
      completedTrades: [] // Would contain actual trade data
    } as WalletPerformanceMetrics,
    
    {
      walletAddress: 'RiskyTrader456...',
      netRoi: 340.7,
      maxDrawdown: 75.8, // High drawdown - will be penalized
      sharpeRatio: 1.2,
      winLossRatio: 1.8,
      totalTrades: 89,
      winRate: 64.0,
      analysisStartDate: Date.now() / 1000 - (95 * 24 * 60 * 60),
      analysisEndDate: Date.now() / 1000,
      completedTrades: [] // Would contain trade with 600% single-day spike
    } as WalletPerformanceMetrics,

    {
      walletAddress: 'SafeTrader789...',
      netRoi: 42.3,
      maxDrawdown: 8.5, // Low drawdown - safety-focused
      sharpeRatio: 1.9,
      winLossRatio: 1.6,
      totalTrades: 203,
      winRate: 61.5,
      analysisStartDate: Date.now() / 1000 - (95 * 24 * 60 * 60),
      analysisEndDate: Date.now() / 1000,
      completedTrades: []
    } as WalletPerformanceMetrics
  ];

  // Calculate trust scores
  const { scores, cohortStats } = xorjTrustScoreCalculator.calculateTrustScores(mockWalletMetrics);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  scores.forEach((score, index) => {
    
    if (!score.eligibility.isEligible) {
    } else {
    }
  });


  return { scores, cohortStats };
}

/**
 * Example 2: End-to-end wallet analysis and scoring
 */
export async function exampleWalletScoringPipeline() {

  const testWallets = [
    'HighPerformer123abcd...', // Example wallet addresses (replace with real ones)
    'RiskyTrader456efgh...',
    'SafeTrader789ijkl...'
  ];

  try {
    // Use the integrated scoring pipeline
    const result = await traderIntelligenceEngine.scoreWallets(testWallets, {
      startDate: Math.floor(Date.now() / 1000) - (120 * 24 * 60 * 60), // 120 days
      minTradeValueUsd: 100
    });


    // Show top performers
    const topTraders = xorjTrustScoreCalculator.getTopTraders(result.scores, 5);
    
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    topTraders.forEach((trader, index) => {
      // Processing logic would go here
    });

    return result;

  } catch {
    throw error;
  }
}

/**
 * Example 3: Filtering and tier analysis
 */
export async function exampleTierAnalysis() {

  // Mock scores for demonstration
  const mockScores = await exampleTrustScoreCalculation();
  
  // Get S-tier traders (80+ points)
  const sTierTraders = xorjTrustScoreCalculator.getTradersByTier(mockScores.scores, 'S');

  // Filter by minimum score
  const highScoreTraders = xorjTrustScoreCalculator.filterByMinScore(mockScores.scores, 70);

  // Tier breakdown
  const tiers = ['S', 'A', 'B', 'C', 'D'] as const;
  tiers.forEach(tier => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const count = xorjTrustScoreCalculator.getTradersByTier(mockScores.scores, tier).length;
    // Analysis logic would go here
  });

  return {
    sTierTraders,
    highScoreTraders,
    tierCounts: tiers.map(tier => ({
      tier,
      count: xorjTrustScoreCalculator.getTradersByTier(mockScores.scores, tier).length
    }))
  };
}

/**
 * Example 4: API Usage Examples
 */
export async function exampleApiUsage() {

  // Example API request for wallet analysis and scoring
  const analyzeAndScoreRequest = {
    walletAddresses: [
      'ExampleWallet123abcd...',
      'AnotherWallet456efgh...'
    ],
    startDate: Math.floor(Date.now() / 1000) - (120 * 24 * 60 * 60),
    minTradeValueUsd: 100
  };


  // Example API request for scoring pre-calculated metrics
  const scoreOnlyRequest = {
    walletMetrics: [
      {
        walletAddress: 'Example123...',
        netRoi: 75.5,
        maxDrawdown: 22.1,
        sharpeRatio: 2.3,
        totalTrades: 156,
        analysisStartDate: Date.now() / 1000 - (100 * 24 * 60 * 60),
        analysisEndDate: Date.now() / 1000,
        completedTrades: []
      }
    ]
  };



  return { analyzeAndScoreRequest, scoreOnlyRequest };
}

/**
 * Example 5: Understanding the Algorithm Bias
 */
export async function exampleAlgorithmBias() {





  // Demonstrate with contrasting trader profiles
  const conservativeTrader = {
    netRoi: 45.0,      // Moderate returns
    maxDrawdown: 12.0, // Low risk
    sharpeRatio: 2.5   // Excellent risk-adjusted returns
  };

  const aggressiveTrader = {
    netRoi: 180.0,     // High returns
    maxDrawdown: 65.0, // High risk - heavily penalized
    sharpeRatio: 1.1   // Poor risk-adjusted returns
  };


  return { conservativeTrader, aggressiveTrader };
}

/**
 * Run all XORJ Trust Score examples
 */
export async function runAllTrustScoreExamples() {

  try {
    await exampleTrustScoreCalculation();
    
    await exampleTierAnalysis();
    
    await exampleApiUsage();
    
    await exampleAlgorithmBias();
    
    // Note: Commented out to avoid actual API calls with placeholder wallets
    // await exampleWalletScoringPipeline();
    
    
  } catch {
    throw error;
  }
}

// Export all examples
export {
  exampleTrustScoreCalculation,
  exampleWalletScoringPipeline,
  exampleTierAnalysis,
  exampleApiUsage,
  exampleAlgorithmBias
};