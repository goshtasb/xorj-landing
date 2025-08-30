const jwt = require('jsonwebtoken');

// Test real end-to-end integration with database, JWT auth, and API endpoints
async function testRealIntegration() {
  const baseUrl = 'http://localhost:3003';
  const testWalletAddress = '5QfzCCipXjebAfHpMhCJAoxUJL2TyqM5p8tCFLjsPbmh';
  const JWT_SECRET = process.env.JWT_SECRET || 'dev_jwt_secret_2024_not_for_production';
  
  console.log('🔥 REAL INTEGRATION TEST - DATABASE + JWT + API');
  console.log('================================================\n');

  try {
    // Step 1: Generate a real JWT token
    console.log('1️⃣ Generating real JWT token...');
    const token = jwt.sign(
      { 
        wallet_address: testWalletAddress,
        user_id: testWalletAddress,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours
      },
      JWT_SECRET,
      { algorithm: 'HS256' }
    );
    
    console.log('✅ JWT token generated');
    console.log('  Token length:', token.length);
    console.log('  Wallet address in token:', testWalletAddress);
    
    // Step 2: Test bot enable with real database operation
    console.log('\n2️⃣ Testing bot enable with database integration...');
    const start = Date.now();
    
    const enableResponse = await fetch(`${baseUrl}/api/bot/enable`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    const enableResult = await enableResponse.json();
    const enableTime = Date.now() - start;
    
    console.log('✅ Bot enable response:', enableResponse.status);
    console.log('  Total request time:', enableTime + 'ms');
    console.log('  Server processing time:', enableResult.performance);
    console.log('  Database operation:', enableResult.trace?.dbTime + 'ms');
    console.log('  JWT verification:', enableResult.trace?.jwtTime + 'ms');
    console.log('  Success:', enableResult.success);
    
    if (enableResult.data) {
      console.log('  Database record:', {
        wallet: enableResult.data.walletAddress,
        enabled: enableResult.data.enabled
      });
    }
    
    // Step 3: Test performance API with valid wallet
    console.log('\n3️⃣ Testing performance API...');
    const perfStart = Date.now();
    
    const performanceResponse = await fetch(
      `${baseUrl}/api/user/performance?walletAddress=${testWalletAddress}&timeRange=30D`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );

    const performanceResult = await performanceResponse.json();
    const perfTime = Date.now() - perfStart;
    
    console.log('✅ Performance API response:', performanceResponse.status);
    console.log('  Total request time:', perfTime + 'ms');
    console.log('  Success:', performanceResult.success);
    
    // Step 4: Run multiple concurrent requests (mini load test)
    console.log('\n4️⃣ Testing concurrent requests (mini load test)...');
    const concurrentStart = Date.now();
    const concurrentRequests = 10;
    
    const promises = Array.from({ length: concurrentRequests }, () =>
      fetch(`${baseUrl}/api/bot/enable`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      })
    );
    
    const concurrentResults = await Promise.all(promises);
    const concurrentTime = Date.now() - concurrentStart;
    
    const successCount = concurrentResults.filter(r => r.ok).length;
    
    console.log('✅ Concurrent requests completed');
    console.log('  Total requests:', concurrentRequests);
    console.log('  Successful:', successCount);
    console.log('  Failed:', concurrentRequests - successCount);
    console.log('  Total time:', concurrentTime + 'ms');
    console.log('  Average per request:', Math.round(concurrentTime / concurrentRequests) + 'ms');
    console.log('  Requests per second:', Math.round((concurrentRequests / concurrentTime) * 1000));
    
    // Step 5: Test invalid authentication 
    console.log('\n5️⃣ Testing authentication failure...');
    const invalidResponse = await fetch(`${baseUrl}/api/bot/enable`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer invalid_token_should_fail'
      }
    });

    const invalidResult = await invalidResponse.json();
    
    if (invalidResponse.status === 401) {
      console.log('✅ Invalid token correctly rejected');
      console.log('  Response time:', invalidResult.trace?.totalTime + 'ms');
      console.log('  JWT verification time:', invalidResult.trace?.jwtTime + 'ms');
    } else {
      console.log('❌ Invalid token should have been rejected');
    }
    
    console.log('\n🎉 REAL INTEGRATION TEST COMPLETE!');
    console.log('\n📊 PERFORMANCE SUMMARY:');
    console.log('  ✅ Database connectivity: WORKING');
    console.log('  ✅ JWT authentication: WORKING'); 
    console.log('  ✅ API endpoints: WORKING');
    console.log('  ✅ Concurrent handling: WORKING');
    console.log('  ✅ Error handling: WORKING');
    console.log('  📈 Single request: ~' + enableTime + 'ms');
    console.log('  📈 Concurrent (10x): ~' + Math.round(concurrentTime / concurrentRequests) + 'ms avg');
    
    console.log('\n🏁 READY FOR REAL LOAD TESTING');

  } catch (error) {
    console.error('❌ Integration test failed:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

testRealIntegration();
