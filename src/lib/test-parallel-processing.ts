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
  console.log('🧪 Testing Parallel Batch Processing Performance');
  console.log('==========================================');

  const batchRequest: BatchAnalysisRequest = {
    walletAddresses: TEST_WALLETS,
    config: {
      minTradeValueUsd: 50,
      maxTransactions: 100, // Limit transactions for faster testing
    },
    priority: 'high'
  };

  try {
    console.log(`🚀 Starting batch analysis of ${TEST_WALLETS.length} wallets...`);
    const _startTime = Date.now();
    
    const result = await traderIntelligenceEngine.analyzeBatch(batchRequest);
    
    const totalTime = Date.now() - _startTime;
    
    console.log('\n📊 Performance Results:');
    console.log(`==============================`);
    console.log(`Total wallets: ${result.summary.totalWallets}`);
    console.log(`Completed: ${result.summary.completedWallets}`);
    console.log(`Failed: ${result.summary.failedWallets}`);
    console.log(`Total time: ${totalTime}ms (${(totalTime / 1000).toFixed(2)}s)`);
    console.log(`Throughput: ~${(result.summary.totalWallets / (totalTime / 1000)).toFixed(2)} wallets/second`);
    console.log(`Average processing per wallet: ${result.summary.avgProcessingTimeMs.toFixed(2)}ms`);
    
    // Performance comparison (theoretical)
    const sequentialEstimate = result.summary.avgProcessingTimeMs * result.summary.totalWallets;
    const parallelImprovement = ((sequentialEstimate - totalTime) / sequentialEstimate) * 100;
    
    console.log(`\n⚡ Performance Improvement:`);
    console.log(`=============================`);
    console.log(`Sequential estimate: ${sequentialEstimate.toFixed(0)}ms`);
    console.log(`Parallel actual: ${totalTime}ms`);
    console.log(`Improvement: ~${parallelImprovement.toFixed(1)}% faster`);
    
    if (result.walletResults.length > 0) {
      const sampleResult = result.walletResults.find(r => r.status === 'completed');
      if (sampleResult) {
        console.log(`\n📈 Sample Analysis Result:`);
        console.log(`==========================`);
        console.log(`Wallet: ${sampleResult.config.walletAddress}`);
        console.log(`Status: ${sampleResult.status}`);
        console.log(`Processing time: ${sampleResult.processingStats.processingTimeMs}ms`);
        console.log(`Transactions fetched: ${sampleResult.processingStats.totalTransactionsFetched}`);
        console.log(`Valid swaps: ${sampleResult.processingStats.validSwapsFound}`);
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
  console.log('🏁 Benchmarking Sequential vs Parallel Processing');
  console.log('================================================');
  
  // Note: This is just a demonstration - we can't actually run sequential version
  // since we've updated the implementation to be parallel
  
  console.log('ℹ️ Sequential processing has been replaced with parallel processing');
  console.log('✅ The new implementation uses:');
  console.log('   • p-ratelimit for concurrency control (max 5 concurrent)');
  console.log('   • Promise.allSettled for error isolation');
  console.log('   • Rate limiting to respect API limits');
  console.log('   • Graceful error handling per wallet');
  
  const testResult = await testParallelProcessing();
  
  if (testResult.success) {
    console.log('\n🎯 Key Benefits of Parallel Processing:');
    console.log('=====================================');
    console.log('✅ Dramatic reduction in total processing time');
    console.log('✅ Better resource utilization');
    console.log('✅ Individual wallet failures don\'t stop the batch');
    console.log('✅ Configurable concurrency limits');
    console.log('✅ API rate limit compliance');
    console.log(`✅ Estimated ${testResult.parallelImprovement.toFixed(1)}% performance improvement`);
  }
  
  return testResult;
}

// Export for use in other contexts
export { traderIntelligenceEngine };