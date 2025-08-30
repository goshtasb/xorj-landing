/**
 * Test Production API Endpoints
 * Verify the production localhost is connecting to the correct database
 */

console.log('🧪 TESTING PRODUCTION API ENDPOINTS');
console.log('===================================');

async function testProductionAPI() {
  try {
    const baseUrl = 'http://localhost:3003';
    
    // Test user transactions (should connect to production DB)
    console.log('📦 Testing user transactions endpoint...');
    const transactionsResponse = await fetch(`${baseUrl}/api/user/transactions?walletAddress=5QfzCCipXjebAfHpMhCJAoxUJL2TyqM5p8tCFLjsPbmh&page=1&limit=10`);
    
    if (transactionsResponse.ok) {
      const transactionsData = await transactionsResponse.json();
      console.log('✅ Transactions endpoint working');
      console.log('📊 Response:', JSON.stringify(transactionsData, null, 2));
    } else {
      console.log(`❌ Transactions endpoint failed: ${transactionsResponse.status} ${transactionsResponse.statusText}`);
    }
    
    // Test user settings
    console.log('\n⚙️ Testing user settings endpoint...');
    const settingsResponse = await fetch(`${baseUrl}/api/user/settings?walletAddress=5QfzCCipXjebAfHpMhCJAoxUJL2TyqM5p8tCFLjsPbmh`);
    
    if (settingsResponse.ok) {
      const settingsData = await settingsResponse.json();
      console.log('✅ Settings endpoint working');
      console.log('📊 Response:', JSON.stringify(settingsData, null, 2));
    } else {
      console.log(`❌ Settings endpoint failed: ${settingsResponse.status} ${settingsResponse.statusText}`);
    }
    
    // Test bot status
    console.log('\n🤖 Testing bot status endpoint...');
    const botResponse = await fetch(`${baseUrl}/api/bot/status`);
    
    if (botResponse.ok) {
      const botData = await botResponse.json();
      console.log('✅ Bot status endpoint working');
      console.log('📊 Response:', JSON.stringify(botData, null, 2));
    } else {
      console.log(`❌ Bot status endpoint failed: ${botResponse.status} ${botResponse.statusText}`);
    }
    
    console.log('\n🎉 PRODUCTION API TEST COMPLETE!');
    return true;
    
  } catch (error) {
    console.error('❌ Production API test failed:', error.message);
    return false;
  }
}

testProductionAPI().then(success => {
  process.exit(success ? 0 : 1);
});