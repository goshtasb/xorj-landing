/**
 * Comprehensive Production Panel Test
 * Tests all panels and data sources on localhost:3003
 */

console.log('🎛️ TESTING ALL PRODUCTION PANELS');
console.log('=================================');

async function testAllPanels() {
  const baseUrl = 'http://localhost:3003';
  const testWallet = '5QfzCCipXjebAfHpMhCJAoxUJL2TyqM5p8tCFLjsPbmh';
  
  let totalTests = 0;
  let passedTests = 0;
  let failedTests = 0;
  
  function testResult(name, success, details) {
    totalTests++;
    if (success) {
      passedTests++;
      console.log(`✅ ${name}: PASSED`);
      if (details) console.log(`   ${details}`);
    } else {
      failedTests++;
      console.log(`❌ ${name}: FAILED`);
      if (details) console.log(`   ${details}`);
    }
  }

  try {
    // Test 1: User Transactions (Real Database Data)
    console.log('\n📦 TESTING USER TRANSACTIONS PANEL');
    console.log('===================================');
    
    const transactionsResponse = await fetch(`${baseUrl}/api/user/transactions?walletAddress=${testWallet}&page=1&limit=10`);
    const transactionsData = await transactionsResponse.json();
    
    testResult('Transactions API Response', transactionsResponse.ok, `Status: ${transactionsResponse.status}`);
    testResult('Transactions Data Structure', transactionsData.success && transactionsData.data, 'Valid response structure');
    testResult('Real Database Transactions', transactionsData.data.transactions && transactionsData.data.transactions.length > 0, 
              `Found ${transactionsData.data.transactions?.length || 0} transactions`);
    
    if (transactionsData.data.transactions && transactionsData.data.transactions.length > 0) {
      const firstTx = transactionsData.data.transactions[0];
      testResult('Transaction Has Real UUID', firstTx.id && firstTx.id.includes('-'), `ID: ${firstTx.id}`);
      testResult('Transaction Has Production Data', firstTx.txHash === 'prod_tx_sample_signature_001', `Hash: ${firstTx.txHash}`);
    }

    // Test 2: User Settings
    console.log('\n⚙️ TESTING USER SETTINGS PANEL');
    console.log('==============================');
    
    const settingsResponse = await fetch(`${baseUrl}/api/user/settings?walletAddress=${testWallet}`);
    const settingsData = await settingsResponse.json();
    
    testResult('Settings API Response', settingsResponse.ok, `Status: ${settingsResponse.status}`);
    testResult('Settings Data Structure', settingsData.success && settingsData.data, 'Valid response structure');
    testResult('Settings Has Wallet Address', settingsData.data.walletAddress === testWallet, `Wallet: ${settingsData.data.walletAddress}`);

    // Test 3: User Performance
    console.log('\n📊 TESTING USER PERFORMANCE PANEL');
    console.log('==================================');
    
    const performanceResponse = await fetch(`${baseUrl}/api/user/performance?walletAddress=${testWallet}&timeRange=30D`);
    const performanceData = await performanceResponse.json();
    
    testResult('Performance API Response', performanceResponse.ok, `Status: ${performanceResponse.status}`);

    // Test 4: Bot Status (Authentication Required)
    console.log('\n🤖 TESTING BOT STATUS PANEL');
    console.log('============================');
    
    const botStatusResponse = await fetch(`${baseUrl}/api/bot/status`);
    testResult('Bot Status Endpoint Accessible', botStatusResponse.status !== 404, `Status: ${botStatusResponse.status}`);
    
    // Test 5: System Status
    console.log('\n🔧 TESTING SYSTEM STATUS');
    console.log('=========================');
    
    try {
      const systemResponse = await fetch(`${baseUrl}/api/system/status`);
      if (systemResponse.ok) {
        const systemData = await systemResponse.json();
        testResult('System Status Available', true, `Environment: ${systemData.environment || 'Unknown'}`);
      } else {
        testResult('System Status Available', false, `Status: ${systemResponse.status}`);
      }
    } catch (error) {
      testResult('System Status Available', false, `Error: ${error.message}`);
    }

    // Test 6: Database Health
    console.log('\n🗄️ TESTING DATABASE HEALTH');
    console.log('============================');
    
    try {
      const dbHealthResponse = await fetch(`${baseUrl}/api/database/health`);
      if (dbHealthResponse.ok) {
        const dbHealthData = await dbHealthResponse.json();
        testResult('Database Health Check', true, `Status: ${dbHealthData.database || 'Unknown'}`);
      } else {
        testResult('Database Health Check', false, `Status: ${dbHealthResponse.status}`);
      }
    } catch (error) {
      testResult('Database Health Check', false, `Error: ${error.message}`);
    }

    // Test 7: Verify Production Database Connection
    console.log('\n🏭 VERIFYING PRODUCTION DATABASE');
    console.log('================================');
    
    // Check if we're getting real data vs mock data
    const hasRealTransactions = transactionsData.data.transactions && 
                               transactionsData.data.transactions.some(tx => tx.txHash.includes('prod_'));
    testResult('Connected to Production Database', hasRealTransactions, 
              'Transactions contain production test data');

    // Test 8: Performance Metrics
    console.log('\n⚡ TESTING PERFORMANCE METRICS');
    console.log('==============================');
    
    const startTime = Date.now();
    await fetch(`${baseUrl}/api/user/transactions?walletAddress=${testWallet}&limit=1`);
    const responseTime = Date.now() - startTime;
    
    testResult('API Response Time', responseTime < 2000, `${responseTime}ms (target: <2000ms)`);
    testResult('Fast Database Queries', responseTime < 500, `${responseTime}ms (target: <500ms)`);

    // Summary
    console.log('\n📋 TEST SUMMARY');
    console.log('================');
    console.log(`Total Tests: ${totalTests}`);
    console.log(`Passed: ${passedTests} ✅`);
    console.log(`Failed: ${failedTests} ❌`);
    console.log(`Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);

    if (failedTests === 0) {
      console.log('\n🎉 ALL PANELS WORKING CORRECTLY!');
      console.log('🏆 Production localhost environment fully operational');
      console.log('🚀 Ready for comprehensive user testing');
    } else {
      console.log('\n⚠️  Some panels need attention');
      console.log('🔧 Review failed tests above');
    }

    return failedTests === 0;

  } catch (error) {
    console.error('❌ Panel test failed:', error.message);
    return false;
  }
}

testAllPanels().then(success => {
  process.exit(success ? 0 : 1);
});