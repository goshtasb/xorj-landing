#!/usr/bin/env node

/**
 * Debug Trade History Synchronization
 * Deep debug version to understand exactly what's happening
 */

const jwt = require('jsonwebtoken');

const JWT_SECRET = 'dev_jwt_secret_2024_CHANGE_FOR_PRODUCTION';
const API_BASE_URL = 'http://localhost:3000';
const FUNDED_WALLET = 'DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK';

async function generateToken(walletAddress) {
  return jwt.sign(
    { 
      wallet_address: walletAddress,
      sub: walletAddress,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600
    },
    JWT_SECRET
  );
}

async function makeRequest(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json();
  return { response, data };
}

async function debugTradeHistory() {
  console.log('🔍 Debug Trade History Synchronization\n');

  try {
    // Step 1: Get initial count and list
    console.log('1️⃣ Getting initial transaction history...');
    let { data: historyData } = await makeRequest(
      `${API_BASE_URL}/api/user/transactions?walletAddress=${FUNDED_WALLET}&page=1&limit=20`
    );
    
    const initialCount = historyData.data.totalCount;
    const initialTransactions = historyData.data.transactions;
    console.log(`   Initial count: ${initialCount}`);
    console.log(`   Initial transaction IDs: ${initialTransactions.slice(0, 3).map(t => t.id.substring(0, 8)).join(', ')}...`);

    // Step 2: Execute a trade
    console.log('\n2️⃣ Executing a new trade...');
    const token = await generateToken(FUNDED_WALLET);
    const { data: tradeData } = await makeRequest(`${API_BASE_URL}/api/trades/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        from_token: 'So11111111111111111111111111111111111111112',
        to_token: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        amount: 12000000, // 0.012 SOL
        slippage_bps: 300
      })
    });
    
    console.log(`   Trade result success: ${tradeData.success}`);
    console.log(`   Trade ID: ${tradeData.success ? tradeData.data.tradeId : 'N/A'}`);
    console.log(`   Error: ${tradeData.error || 'None'}`);

    if (!tradeData.success) {
      console.error('❌ Trade execution failed, stopping debug');
      return;
    }

    const tradeId = tradeData.data.tradeId;
    console.log(`   Created trade ID: ${tradeId}`);

    // Step 3: Check immediately
    console.log('\n3️⃣ Checking transaction history immediately...');
    ({ data: historyData } = await makeRequest(
      `${API_BASE_URL}/api/user/transactions?walletAddress=${FUNDED_WALLET}&page=1&limit=20`
    ));
    
    const immediateCount = historyData.data.totalCount;
    const immediateTransactions = historyData.data.transactions;
    console.log(`   Immediate count: ${immediateCount} (was ${initialCount})`);
    console.log(`   Count increased: ${immediateCount > initialCount ? 'YES' : 'NO'}`);
    console.log(`   Our trade found: ${immediateTransactions.some(t => t.id === tradeId) ? 'YES' : 'NO'}`);

    // Step 4: Wait and check again
    console.log('\n4️⃣ Waiting 2 seconds and checking again...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    ({ data: historyData } = await makeRequest(
      `${API_BASE_URL}/api/user/transactions?walletAddress=${FUNDED_WALLET}&page=1&limit=20`
    ));
    
    const delayedCount = historyData.data.totalCount;
    const delayedTransactions = historyData.data.transactions;
    console.log(`   Delayed count: ${delayedCount} (was ${initialCount})`);
    console.log(`   Count increased: ${delayedCount > initialCount ? 'YES' : 'NO'}`);
    console.log(`   Our trade found: ${delayedTransactions.some(t => t.id === tradeId) ? 'YES' : 'NO'}`);

    // Step 5: Show detailed transaction info
    console.log('\n5️⃣ Detailed analysis...');
    console.log(`   Initial transactions (${initialCount}):`);
    initialTransactions.slice(0, 3).forEach((t, i) => {
      console.log(`     ${i + 1}. ${t.id} (${new Date(t.created_at).toISOString()})`);
    });
    
    console.log(`   Current transactions (${delayedCount}):`);
    delayedTransactions.slice(0, 3).forEach((t, i) => {
      console.log(`     ${i + 1}. ${t.id} (${new Date(t.created_at).toISOString()}) ${t.id === tradeId ? '← NEW TRADE' : ''}`);
    });

    // Step 6: Check if it's a cache issue by bypassing cache
    console.log('\n6️⃣ Checking with cache bypass...');
    ({ data: historyData } = await makeRequest(
      `${API_BASE_URL}/api/user/transactions?walletAddress=${FUNDED_WALLET}&page=1&limit=20&_t=${Date.now()}`
    ));
    
    const bypassCount = historyData.data.totalCount;
    console.log(`   Cache bypass count: ${bypassCount}`);
    console.log(`   Our trade found with bypass: ${historyData.data.transactions.some(t => t.id === tradeId) ? 'YES' : 'NO'}`);

    // Final analysis
    console.log('\n📊 ANALYSIS:');
    console.log(`   ✓ Trade executed successfully: ${tradeData.success}`);
    console.log(`   ✓ Trade appears immediately: ${immediateTransactions.some(t => t.id === tradeId)}`);
    console.log(`   ✓ Count increases immediately: ${immediateCount > initialCount}`);
    console.log(`   ✓ Trade appears after delay: ${delayedTransactions.some(t => t.id === tradeId)}`);
    console.log(`   ✓ Count increases after delay: ${delayedCount > initialCount}`);
    
    if (delayedTransactions.some(t => t.id === tradeId) && delayedCount > initialCount) {
      console.log('\n✅ Trade history synchronization is working correctly!');
      console.log('   The E2E test failure might be due to a different issue.');
    } else {
      console.log('\n❌ Trade history synchronization issue confirmed');
    }

  } catch (error) {
    console.error('❌ Debug failed:', error.message);
  }
}

debugTradeHistory().catch(console.error);