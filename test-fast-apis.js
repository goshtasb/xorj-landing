/**
 * Test Fast API Performance
 * Compare optimized APIs vs original APIs
 */

console.log('🚀 TESTING FAST API PERFORMANCE');
console.log('===============================');

async function testAPI(url, name) {
  const startTime = Date.now();
  
  try {
    const response = await fetch(url);
    const loadTime = Date.now() - startTime;
    
    if (response.ok) {
      const data = await response.json();
      const serverTime = data.performance ? parseInt(data.performance) : 'N/A';
      console.log(`✅ ${name}: ${loadTime}ms (server: ${serverTime})`);
      return { success: true, clientTime: loadTime, serverTime };
    } else {
      console.log(`❌ ${name}: Failed (${response.status}) - ${loadTime}ms`);
      return { success: false, clientTime: loadTime, serverTime: 0 };
    }
  } catch (error) {
    const loadTime = Date.now() - startTime;
    console.log(`❌ ${name}: Error - ${loadTime}ms`);
    return { success: false, clientTime: loadTime, serverTime: 0 };
  }
}

async function runFastAPITest() {
  const baseUrl = 'http://localhost:3003';
  const testWallet = '5QfzCCipXjebAfHpMhCJAoxUJL2TyqM5p8tCFLjsPbmh';
  
  console.log('\n⚡ FAST API ENDPOINTS');
  console.log('====================');
  
  const fastTests = [
    { url: `${baseUrl}/api/fast/transactions?walletAddress=${testWallet}&limit=10`, name: 'Fast Transactions' },
    { url: `${baseUrl}/api/fast/settings?walletAddress=${testWallet}`, name: 'Fast Settings' },
    { url: `${baseUrl}/api/fast/status?walletAddress=${testWallet}`, name: 'Fast Status' }
  ];
  
  const fastResults = [];
  for (const test of fastTests) {
    const result = await testAPI(test.url, test.name);
    fastResults.push({ ...test, ...result });
    await new Promise(resolve => setTimeout(resolve, 100)); // Small delay between tests
  }
  
  console.log('\n📊 ORIGINAL API ENDPOINTS (for comparison)');
  console.log('==========================================');
  
  const originalTests = [
    { url: `${baseUrl}/api/user/transactions?walletAddress=${testWallet}&limit=10`, name: 'Original Transactions' },
    { url: `${baseUrl}/api/user/settings?walletAddress=${testWallet}`, name: 'Original Settings' },
    { url: `${baseUrl}/api/bot/status`, name: 'Original Bot Status' }
  ];
  
  const originalResults = [];
  for (const test of originalTests) {
    const result = await testAPI(test.url, test.name);
    originalResults.push({ ...test, ...result });
    await new Promise(resolve => setTimeout(resolve, 100)); // Small delay between tests
  }
  
  // Performance analysis
  console.log('\n📈 PERFORMANCE COMPARISON');
  console.log('==========================');
  
  const fastSuccessful = fastResults.filter(r => r.success);
  const originalSuccessful = originalResults.filter(r => r.success);
  
  if (fastSuccessful.length > 0 && originalSuccessful.length > 0) {
    const fastAvg = fastSuccessful.reduce((sum, r) => sum + r.clientTime, 0) / fastSuccessful.length;
    const originalAvg = originalSuccessful.reduce((sum, r) => sum + r.clientTime, 0) / originalSuccessful.length;
    
    const improvement = ((originalAvg - fastAvg) / originalAvg * 100).toFixed(1);
    
    console.log(`Fast APIs Average: ${fastAvg.toFixed(0)}ms`);
    console.log(`Original APIs Average: ${originalAvg.toFixed(0)}ms`);
    
    if (improvement > 0) {
      console.log(`🚀 Performance Improvement: ${improvement}% faster`);
    } else {
      console.log(`⚠️  Performance Change: ${Math.abs(improvement)}% slower`);
    }
  }
  
  // Final assessment
  const allFastSuccessful = fastResults.every(r => r.success);
  const fastAvgTime = fastSuccessful.reduce((sum, r) => sum + r.clientTime, 0) / fastSuccessful.length;
  
  console.log('\n🎯 FINAL ASSESSMENT');
  console.log('===================');
  
  if (allFastSuccessful && fastAvgTime < 100) {
    console.log('🏆 EXCELLENT: All fast APIs working, sub-100ms performance');
    console.log('✅ Ready for high-frequency trading operations');
  } else if (allFastSuccessful && fastAvgTime < 200) {
    console.log('✅ VERY GOOD: All fast APIs working, sub-200ms performance');
    console.log('🚀 Suitable for production trading operations');
  } else if (fastAvgTime < 300) {
    console.log('✅ GOOD: Acceptable performance for production use');
  } else {
    console.log('⚠️  NEEDS IMPROVEMENT: Performance below production standards');
  }
  
  console.log(`\n🔗 Access optimized profile at: ${baseUrl}/profile-optimized`);
  
  return allFastSuccessful && fastAvgTime < 200;
}

runFastAPITest().then(success => {
  process.exit(success ? 0 : 1);
});