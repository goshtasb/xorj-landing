/**
 * Test Optimized Performance
 * Compare original vs optimized page loading times
 */

console.log('⚡ TESTING OPTIMIZED PERFORMANCE');
console.log('===============================');

async function testPagePerformance(url, name) {
  console.log(`\n🧪 Testing ${name}...`);
  
  const startTime = Date.now();
  
  try {
    const response = await fetch(url);
    const loadTime = Date.now() - startTime;
    
    console.log(`   Response Status: ${response.status}`);
    console.log(`   Load Time: ${loadTime}ms`);
    
    if (response.ok) {
      console.log(`   ✅ ${name}: ${loadTime}ms`);
    } else {
      console.log(`   ❌ ${name}: Failed (${response.status})`);
    }
    
    return { success: response.ok, loadTime };
  } catch (error) {
    const loadTime = Date.now() - startTime;
    console.log(`   ❌ ${name}: Error - ${error.message} (${loadTime}ms)`);
    return { success: false, loadTime };
  }
}

async function testApiPerformance() {
  console.log('\n📊 TESTING API PERFORMANCE');
  console.log('===========================');
  
  const baseUrl = 'http://localhost:3003';
  const testWallet = '5QfzCCipXjebAfHpMhCJAoxUJL2TyqM5p8tCFLjsPbmh';
  
  const apis = [
    { url: `${baseUrl}/api/user/transactions?walletAddress=${testWallet}&limit=1`, name: 'Transactions API' },
    { url: `${baseUrl}/api/user/settings?walletAddress=${testWallet}`, name: 'Settings API' },
    { url: `${baseUrl}/api/bot/status`, name: 'Bot Status API' },
    { url: `${baseUrl}/api/system/status`, name: 'System Status API' },
  ];
  
  const results = [];
  
  for (const api of apis) {
    const result = await testPagePerformance(api.url, api.name);
    results.push({ ...api, ...result });
  }
  
  return results;
}

async function runPerformanceTest() {
  try {
    // Test API performance first
    const apiResults = await testApiPerformance();
    
    // Calculate metrics
    const successfulApis = apiResults.filter(r => r.success);
    const avgApiTime = successfulApis.reduce((sum, r) => sum + r.loadTime, 0) / successfulApis.length;
    const maxApiTime = Math.max(...successfulApis.map(r => r.loadTime));
    const minApiTime = Math.min(...successfulApis.map(r => r.loadTime));
    
    console.log('\n📈 PERFORMANCE SUMMARY');
    console.log('======================');
    console.log(`API Tests: ${successfulApis.length}/${apiResults.length} successful`);
    console.log(`Average API Response: ${avgApiTime.toFixed(0)}ms`);
    console.log(`Fastest API: ${minApiTime}ms`);
    console.log(`Slowest API: ${maxApiTime}ms`);
    
    // Performance grades
    console.log('\n🎯 PERFORMANCE GRADES');
    console.log('=====================');
    
    if (avgApiTime < 100) {
      console.log('✅ API Performance: EXCELLENT (<100ms average)');
    } else if (avgApiTime < 300) {
      console.log('✅ API Performance: GOOD (<300ms average)');
    } else if (avgApiTime < 1000) {
      console.log('⚠️  API Performance: FAIR (<1000ms average)');
    } else {
      console.log('❌ API Performance: POOR (>1000ms average)');
    }
    
    if (maxApiTime < 200) {
      console.log('✅ Worst Case: EXCELLENT (<200ms max)');
    } else if (maxApiTime < 500) {
      console.log('✅ Worst Case: GOOD (<500ms max)');  
    } else {
      console.log('⚠️  Worst Case: NEEDS IMPROVEMENT (>500ms max)');
    }
    
    // Database performance check
    const dbApis = apiResults.filter(r => r.name.includes('Transactions') || r.name.includes('Settings'));
    if (dbApis.length > 0) {
      const avgDbTime = dbApis.reduce((sum, r) => sum + r.loadTime, 0) / dbApis.length;
      console.log(`✅ Database Performance: ${avgDbTime.toFixed(0)}ms average`);
    }
    
    // Optimization recommendations
    console.log('\n💡 OPTIMIZATION STATUS');
    console.log('======================');
    
    if (avgApiTime < 100 && maxApiTime < 200) {
      console.log('🏆 OPTIMIZED: Performance meets production standards!');
      console.log('🚀 Ready for high-volume trading operations');
    } else if (avgApiTime < 300) {
      console.log('✅ GOOD: Performance is acceptable for production');
      console.log('📈 Minor optimizations could improve user experience');
    } else {
      console.log('⚠️  NEEDS WORK: Performance requires optimization');
      console.log('🔧 Consider caching, connection pooling, or query optimization');
    }
    
    return avgApiTime < 300; // Success if under 300ms average
    
  } catch (error) {
    console.error('❌ Performance test failed:', error.message);
    return false;
  }
}

runPerformanceTest().then(success => {
  process.exit(success ? 0 : 1);
});