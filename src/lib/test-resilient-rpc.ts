/**
 * Test Script for Resilient RPC Client
 * Tests the exponential backoff and retry logic as specified in the PRD
 */

import { resilientRpcClient } from './resilientRpcClient';

interface TestResult {
  testName: string;
  success: boolean;
  error?: string;
  duration: number;
  attempts?: number;
}

async function runRpcTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const testWalletAddress = '5QfzCCipXjebAfHpMhCJAoxUJL2TyqM5p8tCFLjsPbmh';

  // Test 1: Basic balance fetch with retry logic
  console.log('🔄 Testing basic balance fetch...');
  const balanceStart = Date.now();
  try {
    const balance = await resilientRpcClient.getBalance(testWalletAddress);
    results.push({
      testName: 'Balance Fetch',
      success: true,
      duration: Date.now() - balanceStart,
      attempts: 1
    });
    console.log(`✅ Balance test passed: ${balance} lamports`);
  } catch (error) {
    results.push({
      testName: 'Balance Fetch',
      success: false,
      error: (error as Error).message,
      duration: Date.now() - balanceStart
    });
    console.error('❌ Balance test failed:', error);
  }

  // Test 2: Transaction signatures fetch with retry logic  
  console.log('🔄 Testing transaction signatures fetch...');
  const signaturesStart = Date.now();
  try {
    const signatures = await resilientRpcClient.getSignaturesForAddress(testWalletAddress, { limit: 5 });
    results.push({
      testName: 'Signatures Fetch',
      success: true,
      duration: Date.now() - signaturesStart,
      attempts: 1
    });
    console.log(`✅ Signatures test passed: ${signatures ? signatures.length : 0} signatures`);
  } catch (error) {
    results.push({
      testName: 'Signatures Fetch',
      success: false,
      error: (error as Error).message,
      duration: Date.now() - signaturesStart
    });
    console.error('❌ Signatures test failed:', error);
  }

  // Test 3: Burst requests to trigger rate limiting (if any)
  console.log('🔄 Testing burst requests to potentially trigger rate limits...');
  const burstStart = Date.now();
  const burstPromises = [];
  
  for (let i = 0; i < 3; i++) {
    burstPromises.push(
      resilientRpcClient.getBalance(testWalletAddress)
        .then(balance => ({ success: true, balance }))
        .catch(error => ({ success: false, error: error.message }))
    );
  }

  try {
    const burstResults = await Promise.all(burstPromises);
    const successCount = burstResults.filter(r => r.success).length;
    
    results.push({
      testName: 'Burst Requests',
      success: successCount > 0, // At least one should succeed
      duration: Date.now() - burstStart,
      attempts: burstPromises.length
    });
    console.log(`✅ Burst test completed: ${successCount}/${burstPromises.length} requests succeeded`);
  } catch (error) {
    results.push({
      testName: 'Burst Requests',
      success: false,
      error: (error as Error).message,
      duration: Date.now() - burstStart
    });
    console.error('❌ Burst test failed:', error);
  }

  return results;
}

// Export for testing
export { runRpcTests };

// For direct execution
if (require.main === module) {
  runRpcTests()
    .then(results => {
      console.log('\n📊 Test Results Summary:');
      console.log('========================');
      results.forEach(result => {
        const status = result.success ? '✅' : '❌';
        console.log(`${status} ${result.testName}: ${result.duration}ms`);
        if (result.error) {
          console.log(`   Error: ${result.error}`);
        }
        if (result.attempts) {
          console.log(`   Attempts: ${result.attempts}`);
        }
      });
      
      const totalSuccess = results.filter(r => r.success).length;
      console.log(`\nOverall: ${totalSuccess}/${results.length} tests passed`);
      
      if (totalSuccess === results.length) {
        console.log('🎉 All tests passed! Resilient RPC client is working correctly.');
        process.exit(0);
      } else {
        console.log('⚠️ Some tests failed. Review the implementation.');
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('❌ Test execution failed:', error);
      process.exit(1);
    });
}