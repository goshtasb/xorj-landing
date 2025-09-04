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
    
    
    if (result.status === 'completed') {
    }

    return result;
  } catch {
    throw error;
  }
}

/**
 * Example 2: Analyze multiple wallets in batch
 */
export async function exampleBatchWalletAnalysis() {

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
    
    
    // Show top performers
    const completedResults = result.walletResults.filter(r => r.status === 'completed');
    if (completedResults.length > 0) {
      const topPerformers = completedResults
        .sort((a, b) => b.metrics.netRoi - a.metrics.netRoi)
        .slice(0, 3);
      
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      topPerformers.forEach((result, index) => {
        // Processing logic would go here in a real implementation
      });
    }

    return result;
  } catch {
    throw error;
  }
}

/**
 * Example 3: Analyze wallet with specific token filters
 */
export async function exampleTokenFilteredAnalysis() {

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
    
    if (result.status === 'completed') {
    }

    return result;
  } catch {
    throw error;
  }
}

/**
 * Example 4: Health check and system status
 */
export async function exampleHealthCheck() {

  try {
    const health = await traderIntelligenceEngine.getHealthStatus();
    
    
    const processing = traderIntelligenceEngine.getProcessingStatus();

    return { health, processing };
  } catch {
    throw error;
  }
}

/**
 * Example 5: Using the REST API endpoints
 */
export async function exampleApiUsage() {

  // Example API request for single wallet analysis
  const apiRequest = {
    walletAddress: 'ExampleAnalysis789...', // Replace with real wallet
    startDate: Math.floor(Date.now() / 1000) - (90 * 24 * 60 * 60),
    minTradeValueUsd: 100
  };


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



  return { singleRequest: apiRequest, batchRequest: batchApiRequest };
}

/**
 * Run all examples (for testing)
 */
export async function runAllExamples() {

  try {
    // Note: These examples use placeholder wallet addresses
    // In real usage, replace with actual Solana wallet addresses
    
    
    await exampleHealthCheck();
    
    await exampleApiUsage();
    
    // Uncomment to run actual analysis (requires valid wallet addresses and API keys)
    // await exampleSingleWalletAnalysis();
    
    // await exampleTokenFilteredAnalysis();
    
    // await exampleBatchWalletAnalysis();
    
    
  } catch {
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