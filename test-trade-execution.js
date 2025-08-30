#!/usr/bin/env node

/**
 * Trade Execution Test Script
 * Tests the POST /api/trades/execute endpoint with valid parameters
 */

const jwt = require('jsonwebtoken');

// Environment variables
const JWT_SECRET = 'dev_jwt_secret_2024_CHANGE_FOR_PRODUCTION';
const API_BASE_URL = 'http://localhost:3000';

// Test parameters
const TEST_WALLET = '5QfzCCipXjebAfHpMhCJAoxUJL2TyqM5p8tCFLjsPbmh';
const SOL_TOKEN = 'So11111111111111111111111111111111111111112'; // Wrapped SOL
const USDC_TOKEN = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'; // USDC

async function testTradeExecution() {
  console.log('🧪 Testing Trade Execution API...\n');

  try {
    // Step 1: Generate JWT token
    console.log('1️⃣ Generating JWT token...');
    const token = jwt.sign(
      { 
        wallet_address: TEST_WALLET,
        sub: TEST_WALLET,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600 // 1 hour expiry
      },
      JWT_SECRET
    );
    console.log(`✅ JWT token generated for wallet: ${TEST_WALLET}\n`);

    // Step 2: Prepare trade parameters
    console.log('2️⃣ Preparing trade parameters...');
    const tradeParams = {
      from_token: SOL_TOKEN,      // SOL
      to_token: USDC_TOKEN,       // USDC
      amount: 100000000,          // 0.1 SOL (in lamports)
      slippage_bps: 300,          // 3% slippage
      priority_fee: 5000          // 5000 lamports priority fee
    };
    console.log(`📊 Trade: ${tradeParams.amount / 1e9} SOL → USDC`);
    console.log(`📊 Slippage: ${tradeParams.slippage_bps / 100}%`);
    console.log(`📊 Priority Fee: ${tradeParams.priority_fee} lamports\n`);

    // Step 3: Execute trade
    console.log('3️⃣ Executing trade...');
    const startTime = Date.now();
    
    const response = await fetch(`${API_BASE_URL}/api/trades/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      },
      body: JSON.stringify(tradeParams)
    });

    const responseData = await response.json();
    const executionTime = Date.now() - startTime;

    // Step 4: Display results
    console.log('4️⃣ Trade execution results:\n');
    console.log(`📊 HTTP Status: ${response.status}`);
    console.log(`⏱️ Execution Time: ${executionTime}ms`);
    console.log(`🆔 Request ID: ${responseData.requestId}`);
    
    if (responseData.success) {
      console.log(`✅ Trade Status: ${responseData.data.status}`);
      console.log(`🆔 Trade ID: ${responseData.data.tradeId}`);
      
      if (responseData.data.transactionSignature) {
        console.log(`🔗 Transaction: ${responseData.data.transactionSignature}`);
      }
      
      console.log(`💰 Expected Output: ${responseData.data.expectedOutput} tokens`);
      
      if (responseData.data.jupiterQuote) {
        const quote = responseData.data.jupiterQuote;
        console.log(`📈 Price Impact: ${quote.priceImpactPct}%`);
        console.log(`🎯 Slippage: ${quote.slippageBps / 100}%`);
      }
      
      console.log('\n✅ TRADE EXECUTION SUCCESSFUL! 🎉');
    } else {
      console.log(`❌ Trade Status: FAILED`);
      console.log(`📝 Error: ${responseData.error}`);
      console.log('\n❌ TRADE EXECUTION FAILED! 😞');
    }

    // Step 5: Verify database record
    console.log('\n5️⃣ Checking database record...');
    console.log(`🔍 Trade should be recorded in database with ID: ${responseData.data?.tradeId || 'N/A'}`);

  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
    process.exit(1);
  }
}

// Run the test
testTradeExecution().catch(console.error);