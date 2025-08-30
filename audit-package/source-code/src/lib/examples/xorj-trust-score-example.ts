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
  console.log('🎯 Example 1: XORJ Trust Score Calculation');

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

  console.log('🏆 XORJ Trust Score Results:');
  scores.forEach((score, index) => {
    console.log(`\n${index + 1}. ${score.walletAddress}`);
    console.log(`   Trust Score: ${score.trustScore.toFixed(2)} (Tier ${score.tier})`);
    console.log(`   Eligible: ${score.eligibility.isEligible ? '✅' : '❌'}`);
    
    if (!score.eligibility.isEligible) {
      console.log(`   Reasons: ${score.eligibility.reasons.join(', ')}`);
    } else {
      console.log(`   Performance: ${score.performanceScore.toFixed(3)}, Risk Penalty: ${score.riskPenalty.toFixed(3)}`);
      console.log(`   Normalized - Sharpe: ${score.normalizedMetrics.normalizedSharpe.toFixed(3)}, ROI: ${score.normalizedMetrics.normalizedRoi.toFixed(3)}, Drawdown: ${score.normalizedMetrics.normalizedMaxDrawdown.toFixed(3)}`);
    }
  });

  console.log(`\n📊 Cohort Statistics:`);
  console.log(`   Eligible: ${cohortStats.eligibleWallets}/${cohortStats.totalWallets}`);
  console.log(`   Top Score: ${cohortStats.topScore.toFixed(2)}`);
  console.log(`   Average Score: ${cohortStats.avgTrustScore.toFixed(2)}`);

  return { scores, cohortStats };
}

/**
 * Example 2: End-to-end wallet analysis and scoring
 */
export async function exampleWalletScoringPipeline() {
  console.log('🎯 Example 2: Complete Wallet Analysis & Scoring Pipeline');

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

    console.log('🚀 Pipeline Results:');
    console.log(`   Analyzed: ${result.processingStats.analyzedWallets}/${result.processingStats.totalWallets}`);
    console.log(`   Eligible for Scoring: ${result.processingStats.eligibleWallets}`);
    console.log(`   Processing Time: ${result.processingStats.processingTimeMs}ms`);

    // Show top performers
    const topTraders = xorjTrustScoreCalculator.getTopTraders(result.scores, 5);
    
    console.log('\n🏆 Top 5 XORJ Trust Score Leaders:');
    topTraders.forEach((trader, index) => {
      console.log(`   ${index + 1}. ${trader.walletAddress.slice(0, 8)}... - Score: ${trader.trustScore.toFixed(2)} (${trader.tier})`);
    });

    return result;

  } catch (error) {
    console.error('❌ Pipeline failed:', error);
    throw error;
  }
}

/**
 * Example 3: Filtering and tier analysis
 */
export async function exampleTierAnalysis() {
  console.log('🎯 Example 3: Tier Analysis & Filtering');

  // Mock scores for demonstration
  const mockScores = await exampleTrustScoreCalculation();
  
  // Get S-tier traders (80+ points)
  const sTierTraders = xorjTrustScoreCalculator.getTradersByTier(mockScores.scores, 'S');
  console.log(`\n⭐ S-Tier Traders (≥80 points): ${sTierTraders.length}`);

  // Filter by minimum score
  const highScoreTraders = xorjTrustScoreCalculator.filterByMinScore(mockScores.scores, 70);
  console.log(`💎 High Score Traders (≥70 points): ${highScoreTraders.length}`);

  // Tier breakdown
  const tiers = ['S', 'A', 'B', 'C', 'D'] as const;
  console.log('\n🎯 Tier Breakdown:');
  tiers.forEach(tier => {
    const count = xorjTrustScoreCalculator.getTradersByTier(mockScores.scores, tier).length;
    console.log(`   ${tier}-Tier: ${count} traders`);
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
  console.log('🎯 Example 4: XORJ Trust Score API Usage');

  // Example API request for wallet analysis and scoring
  const analyzeAndScoreRequest = {
    walletAddresses: [
      'ExampleWallet123abcd...',
      'AnotherWallet456efgh...'
    ],
    startDate: Math.floor(Date.now() / 1000) - (120 * 24 * 60 * 60),
    minTradeValueUsd: 100
  };

  console.log('📡 POST /api/trader-intelligence/score (Analyze & Score)');
  console.log(JSON.stringify(analyzeAndScoreRequest, null, 2));

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

  console.log('\n📡 POST /api/trader-intelligence/score (Score Only)');
  console.log(JSON.stringify(scoreOnlyRequest, null, 2));

  console.log('\n📡 GET /api/trader-intelligence/score (Algorithm Info)');
  console.log('Returns: Algorithm weights, eligibility criteria, tier definitions');

  return { analyzeAndScoreRequest, scoreOnlyRequest };
}

/**
 * Example 5: Understanding the Algorithm Bias
 */
export async function exampleAlgorithmBias() {
  console.log('🎯 Example 5: XORJ Trust Score Algorithm Bias Analysis');

  console.log('\n🔬 Algorithm Design Philosophy:');
  console.log('   • SAFETY-FIRST: Heavy penalty for high drawdowns (35% weight)');
  console.log('   • RISK-ADJUSTED: Sharpe ratio prioritized over raw ROI (40% vs 25%)');
  console.log('   • CONSISTENT PERFORMANCE: Favors steady gains over volatile spikes');
  console.log('   • QUALITY FILTER: Excludes risky presale/memecoin flippers (>500% single-day)');

  console.log('\n📊 Scoring Weights:');
  console.log('   • Sharpe Ratio: 40% (risk-adjusted returns)');
  console.log('   • Net ROI: 25% (absolute performance)'); 
  console.log('   • Drawdown Penalty: -35% (risk management)');

  console.log('\n🚫 Eligibility Filters:');
  console.log('   • Minimum 90 days trading history');
  console.log('   • Minimum 50 completed trades');
  console.log('   • Maximum 500% single-day ROI spike');

  console.log('\n🎯 Target "Dana" Persona:');
  console.log('   • Conservative investor seeking steady returns');
  console.log('   • Risk-averse, prioritizes capital preservation');
  console.log('   • Prefers consistent 2-3x annual returns over risky 10x attempts');
  console.log('   • Values proven track record over explosive growth');

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

  console.log('\n🔄 Algorithm Preference Demonstration:');
  console.log(`Conservative Trader: ROI ${conservativeTrader.netRoi}%, Drawdown ${conservativeTrader.maxDrawdown}%, Sharpe ${conservativeTrader.sharpeRatio}`);
  console.log(`Aggressive Trader: ROI ${aggressiveTrader.netRoi}%, Drawdown ${aggressiveTrader.maxDrawdown}%, Sharpe ${aggressiveTrader.sharpeRatio}`);
  console.log('👑 XORJ Trust Score will favor the Conservative Trader despite lower absolute ROI');

  return { conservativeTrader, aggressiveTrader };
}

/**
 * Run all XORJ Trust Score examples
 */
export async function runAllTrustScoreExamples() {
  console.log('🎯 Running All XORJ Trust Score Examples...\n');

  try {
    await exampleTrustScoreCalculation();
    console.log('\n' + '='.repeat(60) + '\n');
    
    await exampleTierAnalysis();
    console.log('\n' + '='.repeat(60) + '\n');
    
    await exampleApiUsage();
    console.log('\n' + '='.repeat(60) + '\n');
    
    await exampleAlgorithmBias();
    console.log('\n' + '='.repeat(60) + '\n');
    
    // Note: Commented out to avoid actual API calls with placeholder wallets
    // await exampleWalletScoringPipeline();
    
    console.log('✅ All XORJ Trust Score examples completed!');
    
  } catch (error) {
    console.error('❌ Example execution failed:', error);
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