/**
 * Trader Intelligence Engine Usage Examples
 * Demonstrates how to use the Task 3.1 data pipeline
 */

import { traderIntelligenceEngine } from '@/lib/services/trader-intelligence-engine';
import { WalletAnalysisConfig, BatchAnalysisRequest } from '@/types/trader-intelligence';

/**
 * Example 1: Analyze a single wallet with basic configuration
 */
export async function exampleSingleWalletAnalysis() {
  console.log('🚀 Example 1: Single Wallet Analysis');

  const config: WalletAnalysisConfig = {
    walletAddress: 'ExampleTrader123...', // Replace with real wallet address
    // Analyze last 90 days
    startDate: Math.floor(Date.now() / 1000) - (90 * 24 * 60 * 60),
    endDate: Math.floor(Date.now() / 1000),
    // Minimum trade value of $100
    minTradeValueUsd: 100,
    // Maximum 5000 transactions to process
    maxTransactions: 5000
  };

  try {
    const result = await traderIntelligenceEngine.analyzeWallet(config);
    
    console.log('📊 Analysis Results:');
    console.log(`Status: ${result.status}`);
    console.log(`Processing Time: ${result.processingStats.processingTimeMs}ms`);
    console.log(`Transactions Fetched: ${result.processingStats.totalTransactionsFetched}`);
    console.log(`Valid Swaps: ${result.processingStats.validSwapsFound}`);
    
    if (result.status === 'completed') {
      console.log('📈 Performance Metrics:');
      console.log(`Net ROI: ${result.metrics.netRoi.toFixed(2)}%`);
      console.log(`Max Drawdown: ${result.metrics.maxDrawdown.toFixed(2)}%`);
      console.log(`Sharpe Ratio: ${result.metrics.sharpeRatio.toFixed(3)}`);
      console.log(`Win/Loss Ratio: ${result.metrics.winLossRatio.toFixed(2)}`);
      console.log(`Total Trades: ${result.metrics.totalTrades}`);
      console.log(`Win Rate: ${result.metrics.winRate.toFixed(1)}%`);
      console.log(`Total Volume: $${result.metrics.totalVolumeUsd.toLocaleString()}`);
      console.log(`Data Quality: ${result.metrics.dataQuality}`);
      console.log(`Confidence Score: ${result.metrics.confidenceScore}/100`);
    }

    return result;
  } catch {
    console.error('❌ Analysis failed:');
    throw error;
  }
}

/**
 * Example 2: Analyze multiple wallets in batch
 */
export async function exampleBatchWalletAnalysis() {
  console.log('🚀 Example 2: Batch Wallet Analysis');

  const batchRequest: BatchAnalysisRequest = {
    walletAddresses: [
      'ExampleWallet1...', // Replace with real wallet addresses
      'ExampleWallet2...',
      'ExampleWallet3...',
    ],
    config: {
      startDate: Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60), // Last 30 days
      minTradeValueUsd: 50,
      maxTransactions: 1000
    },
    priority: 'high'
  };

  try {
    const result = await traderIntelligenceEngine.analyzeBatch(batchRequest);
    
    console.log('📊 Batch Analysis Results:');
    console.log(`Request ID: ${result.requestId}`);
    console.log(`Total Wallets: ${result.summary.totalWallets}`);
    console.log(`Completed: ${result.summary.completedWallets}`);
    console.log(`Failed: ${result.summary.failedWallets}`);
    console.log(`Average Processing Time: ${result.summary.avgProcessingTimeMs}ms`);
    
    // Show top performers
    const completedResults = result.walletResults.filter(r => r.status === 'completed');
    if (completedResults.length > 0) {
      console.log('\n🏆 Top Performers by ROI:');
      const topPerformers = completedResults
        .sort((a, b) => b.metrics.netRoi - a.metrics.netRoi)
        .slice(0, 3);
      
      topPerformers.forEach((result, index) => {
        console.log(`${index + 1}. ${result.config.walletAddress}`);
        console.log(`   ROI: ${result.metrics.netRoi.toFixed(2)}%`);
        console.log(`   Sharpe: ${result.metrics.sharpeRatio.toFixed(3)}`);
        console.log(`   Trades: ${result.metrics.totalTrades}`);
      });
    }

    return result;
  } catch {
    console.error('❌ Batch analysis failed:');
    throw error;
  }
}

/**
 * Example 3: Analyze wallet with specific token filters
 */
export async function exampleTokenFilteredAnalysis() {
  console.log('🚀 Example 3: Token-Filtered Analysis');

  const config: WalletAnalysisConfig = {
    walletAddress: 'ExampleSOLTrader456...', // Replace with real wallet
    startDate: Math.floor(Date.now() / 1000) - (60 * 24 * 60 * 60), // Last 60 days
    // Only analyze trades involving SOL and USDC
    includeTokens: [
      'So11111111111111111111111111111111111111112', // SOL
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
    ],
    minTradeValueUsd: 200
  };

  try {
    const result = await traderIntelligenceEngine.analyzeWallet(config);
    
    console.log('📊 SOL/USDC Trading Analysis:');
    if (result.status === 'completed') {
      console.log(`SOL/USDC Performance:`);
      console.log(`Net ROI: ${result.metrics.netRoi.toFixed(2)}%`);
      console.log(`Win Rate: ${result.metrics.winRate.toFixed(1)}%`);
      console.log(`Total Volume: $${result.metrics.totalVolumeUsd.toLocaleString()}`);
      console.log(`Average Trade Size: $${result.metrics.avgTradeSize.toLocaleString()}`);
      console.log(`Average Holding Period: ${result.metrics.avgHoldingPeriod.toFixed(1)} days`);
    }

    return result;
  } catch {
    console.error('❌ Token-filtered analysis failed:');
    throw error;
  }
}

/**
 * Example 4: Health check and system status
 */
export async function exampleHealthCheck() {
  console.log('🚀 Example 4: System Health Check');

  try {
    const health = await traderIntelligenceEngine.getHealthStatus();
    
    console.log('🔍 System Health Status:');
    console.log(`Overall Status: ${health.status}`);
    console.log(`Solana RPC: ${health.services.solanaRpc ? '✅' : '❌'}`);
    console.log(`Price APIs: ${health.services.priceApis ? '✅' : '❌'}`);
    console.log(`Parser: ${health.services.parser ? '✅' : '❌'}`);
    console.log(`Last Check: ${new Date(health.lastCheck).toISOString()}`);
    
    const processing = traderIntelligenceEngine.getProcessingStatus();
    console.log(`\n⚙️ Processing Status:`);
    console.log(`Currently Processing: ${processing.isProcessing ? 'Yes' : 'No'}`);
    console.log(`Analysis Count: ${processing.currentAnalysisId}`);

    return { health, processing };
  } catch {
    console.error('❌ Health check failed:');
    throw error;
  }
}

/**
 * Example 5: Using the REST API endpoints
 */
export async function exampleApiUsage() {
  console.log('🚀 Example 5: REST API Usage');

  // Example API request for single wallet analysis
  const apiRequest = {
    walletAddress: 'ExampleAnalysis789...', // Replace with real wallet
    startDate: Math.floor(Date.now() / 1000) - (90 * 24 * 60 * 60),
    minTradeValueUsd: 100
  };

  console.log('📡 API Request Example:');
  console.log('POST /api/trader-intelligence/analyze');
  console.log('Body:', JSON.stringify(apiRequest, null, 2));

  // Example batch API request
  const batchApiRequest = {
    walletAddresses: [
      'ExampleBatchWallet1...',
      'ExampleBatchWallet2...'
    ],
    config: {
      minTradeValueUsd: 50,
      maxTransactions: 1000
    },
    priority: 'medium'
  };

  console.log('\n📡 Batch API Request Example:');
  console.log('POST /api/trader-intelligence/batch');
  console.log('Body:', JSON.stringify(batchApiRequest, null, 2));

  console.log('\n📡 Health Check API Example:');
  console.log('GET /api/trader-intelligence/analyze');

  return { singleRequest: apiRequest, batchRequest: batchApiRequest };
}

/**
 * Run all examples (for testing)
 */
export async function runAllExamples() {
  console.log('🎯 Running all Trader Intelligence examples...\n');

  try {
    // Note: These examples use placeholder wallet addresses
    // In real usage, replace with actual Solana wallet addresses
    
    console.log('ℹ️  Note: Replace placeholder wallet addresses with real ones before running');
    
    await exampleHealthCheck();
    console.log('\n' + '='.repeat(60) + '\n');
    
    await exampleApiUsage();
    console.log('\n' + '='.repeat(60) + '\n');
    
    // Uncomment to run actual analysis (requires valid wallet addresses and API keys)
    // await exampleSingleWalletAnalysis();
    // console.log('\n' + '='.repeat(60) + '\n');
    
    // await exampleTokenFilteredAnalysis();
    // console.log('\n' + '='.repeat(60) + '\n');
    
    // await exampleBatchWalletAnalysis();
    
    console.log('✅ All examples completed successfully!');
    
  } catch {
    console.error('❌ Example execution failed:');
    throw error;
  }
}

// Export all examples
export {
  exampleSingleWalletAnalysis,
  exampleBatchWalletAnalysis,
  exampleTokenFilteredAnalysis,
  exampleHealthCheck,
  exampleApiUsage
};