/**
 * Test script to verify parallel batch processing performance improvement
 */

import { traderIntelligenceEngine } from './services/trader-intelligence-engine';
import { BatchAnalysisRequest } from '@/types/trader-intelligence';

// Test wallet addresses (using public Solana addresses for testing)
const TEST_WALLETS = [
  'ExampleWallet1111111111111111111111111111111',
  'ExampleWallet2222222222222222222222222222222',
  'ExampleWallet3333333333333333333333333333333',
  'ExampleWallet4444444444444444444444444444444',
  'ExampleWallet5555555555555555555555555555555',
];

export async function testParallelProcessing() {

  const batchRequest: BatchAnalysisRequest = {
    walletAddresses: TEST_WALLETS,
    config: {
      minTradeValueUsd: 50,
      maxTransactions: 100, // Limit transactions for faster testing
    },
    priority: 'high'
  };

  try {
    const _startTime = Date.now();
    
    const result = await traderIntelligenceEngine.analyzeBatch(batchRequest);
    
    const totalTime = Date.now() - _startTime;
    
    
    // Performance comparison (theoretical)
    const sequentialEstimate = result.summary.avgProcessingTimeMs * result.summary.totalWallets;
    const parallelImprovement = ((sequentialEstimate - totalTime) / sequentialEstimate) * 100;
    
    
    if (result.walletResults.length > 0) {
      const sampleResult = result.walletResults.find(r => r.status === 'completed');
      if (sampleResult) {
      }
    }

    return {
      success: true,
      totalTime,
      throughput: result.summary.totalWallets / (totalTime / 1000),
      parallelImprovement,
      results: result
    };

  } catch {
    console.error('❌ Test failed:');
    return {
      success: false,
      error: 'Unknown error'
    };
  }
}

export async function benchmarkSequentialVsParallel() {
  
  // Note: This is just a demonstration - we can't actually run sequential version
  // since we've updated the implementation to be parallel
  
  
  const testResult = await testParallelProcessing();
  
  if (testResult.success) {
  }
  
  return testResult;
}

// Export for use in other contexts
export { traderIntelligenceEngine };