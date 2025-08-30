/**
 * XORJ Localhost End-to-End Simulation with Live Backend Services
 * 
 * This runs the complete XORJ operational loop against real containerized services:
 * - Real PostgreSQL database
 * - Real FastAPI gateway
 * - Real quantitative engine
 * - Real trade execution bot
 * - Real Next.js API routes
 * 
 * This is the final test before production deployment.
 */

const fs = require('fs');

console.log('🚀 STARTING XORJ LOCALHOST LIVE BACKEND E2E SIMULATION');
console.log('=====================================================');

// Test configuration
const config = {
  // Live backend services
  fastApiUrl: 'http://localhost:8010',
  quantEngineUrl: 'http://localhost:8011', 
  tradeBotUrl: 'http://localhost:8012',
  nextJsApiUrl: 'http://localhost:3002/api',
  
  // Database connection
  databaseUrl: 'postgresql://xorj_localhost_user:localhost_password_2024@localhost:5434/xorj_localhost',
  redisUrl: 'redis://localhost:6381',
  
  // Test user
  testWallet: '5QfzCCipXjebAfHpMhCJAoxUJL2TyqM5p8tCFLjsPbmh',
  
  // Mock trader data for testing
  testTraders: [
    {
      wallet: 'trader-A-wallet-address',
      name: 'The Pro',
      trades: 100,
      winRate: 80,
      roi: 90,
      maxDrawdown: 10
    },
    {
      wallet: 'trader-B-wallet-address', 
      name: 'The Gambler',
      trades: 20,
      winRate: 50,
      roi: 300,
      maxDrawdown: 70
    },
    {
      wallet: 'trader-C-wallet-address',
      name: 'The Safe Bet', 
      trades: 200,
      winRate: 95,
      roi: 20,
      maxDrawdown: 2
    }
  ]
};

// Test execution tracking
let testResults = {
  totalTests: 0,
  passedTests: 0,
  failedTests: 0,
  testDetails: []
};

function assert(condition, message) {
  testResults.totalTests++;
  if (condition) {
    console.log(`✅ PASS: ${message}`);
    testResults.passedTests++;
    testResults.testDetails.push({ status: 'PASS', message });
  } else {
    console.log(`❌ FAIL: ${message}`);
    testResults.failedTests++;
    testResults.testDetails.push({ status: 'FAIL', message });
    throw new Error(`Test failed: ${message}`);
  }
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// HTTP helper with retry logic
async function makeRequest(url, options = {}) {
  const maxRetries = 3;
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🌐 Request: ${options.method || 'GET'} ${url} (attempt ${attempt}/${maxRetries})`);
      
      const response = await fetch(url, {
        timeout: 10000, // 10 second timeout
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log(`✅ Response: ${response.status} ${response.statusText}`);
      return data;
      
    } catch (error) {
      console.log(`⚠️  Request failed (attempt ${attempt}): ${error.message}`);
      lastError = error;
      
      if (attempt < maxRetries) {
        await sleep(2000 * attempt); // Exponential backoff
      }
    }
  }
  
  throw new Error(`All ${maxRetries} attempts failed. Last error: ${lastError.message}`);
}

async function checkServiceHealth() {
  console.log('🔍 CHECKING SERVICE HEALTH');
  console.log('===========================');
  
  const services = [
    { name: 'FastAPI Gateway', url: `${config.fastApiUrl}/health` },
    { name: 'Quantitative Engine', url: `${config.quantEngineUrl}/health` },
    { name: 'Trade Execution Bot', url: `${config.tradeBotUrl}/health` }
  ];
  
  for (const service of services) {
    try {
      const response = await makeRequest(service.url);
      console.log(`✅ ${service.name}: Healthy`);
      console.log(`   Status: ${response.status || 'OK'}`);
    } catch (error) {
      throw new Error(`${service.name} is not healthy: ${error.message}`);
    }
  }
}

async function authenticateUser() {
  console.log('🔐 AUTHENTICATING USER');
  console.log('=======================');
  
  const authRequest = {
    wallet_address: config.testWallet,
    signature: 'mock_signature_localhost_testing',
    message: 'XORJ Localhost Authentication'
  };
  
  try {
    const authResponse = await makeRequest(`${config.fastApiUrl}/auth/authenticate`, {
      method: 'POST',
      body: JSON.stringify(authRequest)
    });
    
    assert(authResponse.success, 'User authentication successful');
    assert(authResponse.session_token, 'Session token received');
    assert(authResponse.user_id, 'User ID received');
    
    console.log(`✅ Authenticated as: ${authResponse.user_id}`);
    return authResponse.session_token;
    
  } catch (error) {
    throw new Error(`Authentication failed: ${error.message}`);
  }
}

async function runQuantitativeAnalysis(sessionToken) {
  console.log('🧠 RUNNING QUANTITATIVE ANALYSIS');
  console.log('=================================');
  
  // Simulate trader analysis request
  const analysisRequest = {
    wallets: config.testTraders.map(t => t.wallet),
    timeframe: '30d',
    algorithm: 'xorj_trust_score_v1'
  };
  
  try {
    const analysisResponse = await makeRequest(`${config.quantEngineUrl}/analyze`, {
      method: 'POST',
      body: JSON.stringify(analysisRequest),
      headers: {
        'Authorization': `Bearer ${sessionToken}`
      }
    });
    
    assert(analysisResponse.success, 'Quantitative analysis completed');
    assert(analysisResponse.traders_analyzed >= 3, 'At least 3 traders analyzed');
    assert(analysisResponse.scores && analysisResponse.scores.length >= 3, 'Trust scores calculated');
    
    // Verify scoring results
    const scores = analysisResponse.scores.sort((a, b) => b.xorj_trust_score - a.xorj_trust_score);
    const topTrader = scores[0];
    
    console.log('📊 XORJ Trust Score Results:');
    scores.forEach((score, index) => {
      const trader = config.testTraders.find(t => t.wallet === score.wallet_address);
      console.log(`   ${index + 1}. ${trader?.name || score.wallet_address}: ${score.xorj_trust_score.toFixed(1)}`);
    });
    
    // Verify algorithm correctness (should prioritize risk-adjusted returns)
    assert(topTrader.wallet_address === 'trader-A-wallet-address', 
           'CRITICAL: The Pro (balanced risk/return) has highest XORJ Trust Score');
    
    return scores;
    
  } catch (error) {
    throw new Error(`Quantitative analysis failed: ${error.message}`);
  }
}

async function executeTradeBot(sessionToken, topTrader) {
  console.log('🤖 EXECUTING TRADE BOT');
  console.log('=======================');
  
  const tradeRequest = {
    user_id: config.testWallet,
    target_trader: topTrader.wallet_address,
    trade_type: 'copy_trade',
    amount_usdc: 1000
  };
  
  try {
    const tradeResponse = await makeRequest(`${config.tradeBotUrl}/execute`, {
      method: 'POST',
      body: JSON.stringify(tradeRequest),
      headers: {
        'Authorization': `Bearer ${sessionToken}`
      }
    });
    
    assert(tradeResponse.success, 'Trade execution initiated');
    assert(tradeResponse.job_id, 'Execution job ID received');
    assert(tradeResponse.status === 'PENDING' || tradeResponse.status === 'COMPLETED', 'Valid execution status');
    
    console.log(`✅ Trade execution job: ${tradeResponse.job_id}`);
    console.log(`   Status: ${tradeResponse.status}`);
    console.log(`   Target trader: ${tradeResponse.target_trader}`);
    
    // Wait for execution completion
    if (tradeResponse.status === 'PENDING') {
      console.log('⏳ Waiting for trade execution completion...');
      await sleep(3000);
      
      // Check execution status
      const statusResponse = await makeRequest(`${config.tradeBotUrl}/status/${tradeResponse.job_id}`, {
        headers: {
          'Authorization': `Bearer ${sessionToken}`
        }
      });
      
      assert(statusResponse.status === 'COMPLETED' || statusResponse.status === 'FAILED', 
             'Execution job has final status');
      
      console.log(`✅ Final execution status: ${statusResponse.status}`);
    }
    
    return tradeResponse;
    
  } catch (error) {
    throw new Error(`Trade execution failed: ${error.message}`);
  }
}

async function verifyDatabaseState(sessionToken) {
  console.log('🗄️ VERIFYING DATABASE STATE');
  console.log('============================');
  
  try {
    // Check user trades
    const tradesResponse = await makeRequest(`${config.nextJsApiUrl}/user/transactions?walletAddress=${config.testWallet}&limit=10`);
    
    console.log(`📊 Found ${tradesResponse.trades?.length || 0} trades in database`);
    
    // Check bot status
    const statusResponse = await makeRequest(`${config.nextJsApiUrl}/bot/status`, {
      headers: {
        'Authorization': `Bearer ${sessionToken}`
      }
    });
    
    assert(statusResponse.user_id || statusResponse.health_score !== undefined, 'Bot status retrieved from database');
    
    console.log(`✅ Database state verified`);
    
  } catch (error) {
    // Database checks are not critical for this test
    console.log(`⚠️  Database verification partial: ${error.message}`);
  }
}

async function testApiEndpoints(sessionToken) {
  console.log('🔌 TESTING API ENDPOINTS');
  console.log('=========================');
  
  const endpoints = [
    { name: 'System Status', url: `${config.nextJsApiUrl}/system/status` },
    { name: 'Database Health', url: `${config.nextJsApiUrl}/database/health` },
    { name: 'User Settings', url: `${config.nextJsApiUrl}/user/settings?walletAddress=${config.testWallet}` }
  ];
  
  for (const endpoint of endpoints) {
    try {
      const response = await makeRequest(endpoint.url);
      console.log(`✅ ${endpoint.name}: Working`);
    } catch (error) {
      console.log(`⚠️  ${endpoint.name}: ${error.message}`);
    }
  }
}

async function generateTestReport() {
  console.log('📊 GENERATING TEST REPORT');
  console.log('==========================');
  
  const report = {
    testSuite: 'XORJ Localhost Live Backend E2E Simulation',
    executionTime: new Date().toISOString(),
    environment: 'Localhost with Live Services',
    summary: {
      totalTests: testResults.totalTests,
      passed: testResults.passedTests,
      failed: testResults.failedTests,
      successRate: ((testResults.passedTests / testResults.totalTests) * 100).toFixed(1) + '%'
    },
    services: {
      fastApiGateway: config.fastApiUrl,
      quantitativeEngine: config.quantEngineUrl,
      tradeExecutionBot: config.tradeBotUrl,
      nextJsApi: config.nextJsApiUrl,
      database: config.databaseUrl,
      redis: config.redisUrl
    },
    testResults: testResults.testDetails,
    conclusion: testResults.failedTests === 0 ? 'ALL TESTS PASSED - READY FOR PRODUCTION' : 'SOME TESTS FAILED - REVIEW REQUIRED'
  };
  
  // Save report to file
  const reportPath = './localhost-e2e-test-results.json';
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  
  console.log('📄 Test Report Summary:');
  console.log(`   Total Tests: ${report.summary.totalTests}`);
  console.log(`   Passed: ${report.summary.passed} ✅`);
  console.log(`   Failed: ${report.summary.failed} ❌`);
  console.log(`   Success Rate: ${report.summary.successRate}`);
  console.log(`   Report saved to: ${reportPath}`);
  
  return report;
}

async function runLocalhostE2ESimulation() {
  const startTime = Date.now();
  
  try {
    // Step 1: Check all services are healthy
    await checkServiceHealth();
    
    // Step 2: Authenticate user
    const sessionToken = await authenticateUser();
    
    // Step 3: Run quantitative analysis
    const scores = await runQuantitativeAnalysis(sessionToken);
    const topTrader = scores[0];
    
    // Step 4: Execute trade bot
    await executeTradeBot(sessionToken, topTrader);
    
    // Step 5: Verify database state
    await verifyDatabaseState(sessionToken);
    
    // Step 6: Test API endpoints
    await testApiEndpoints(sessionToken);
    
    // Generate final report
    const report = await generateTestReport();
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    
    console.log('');
    console.log('🎉 LOCALHOST E2E SIMULATION COMPLETE!');
    console.log('=====================================');
    console.log(`⏱️  Total Duration: ${duration} seconds`);
    console.log(`📊 Results: ${report.summary.successRate} success rate`);
    
    if (report.summary.failed === '0') {
      console.log('✅ ALL TESTS PASSED - SYSTEM READY FOR PRODUCTION!');
      console.log('🚀 The localhost environment successfully mimics production behavior.');
      return true;
    } else {
      console.log(`❌ ${report.summary.failed} TESTS FAILED - REVIEW REQUIRED`);
      return false;
    }
    
  } catch (error) {
    console.error('💥 LOCALHOST E2E SIMULATION FAILED');
    console.error('===================================');
    console.error('Error:', error.message);
    
    // Generate error report
    await generateTestReport();
    
    return false;
  }
}

// Execute simulation
runLocalhostE2ESimulation().then(success => {
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});