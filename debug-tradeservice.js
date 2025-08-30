#!/usr/bin/env node

/**
 * Debug TradeService.getAll() method
 * Direct test of the TradeService to see what it returns
 */

// Set up environment to ensure database is available
process.env.DATABASE_HOST = 'localhost';

const path = require('path');
const { fileURLToPath } = require('url');

// Import the TradeService directly
const TradeService = require('./src/lib/botStateService').TradeService;

async function debugTradeService() {
  console.log('🔍 Debug TradeService.getAll() Method\n');

  const testWallet = 'DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK';

  try {
    console.log('1️⃣ Testing TradeService.getAll() with filters...');
    const result = await TradeService.getAll({
      user_vault_address: testWallet,
      limit: 1000,
      orderBy: 'created_at',
      orderDirection: 'DESC'
    });

    console.log(`   Success: ${result.success}`);
    console.log(`   Error: ${result.error || 'None'}`);
    console.log(`   Data length: ${result.data ? result.data.length : 'N/A'}`);
    console.log(`   Message: ${result.message || 'None'}`);

    if (result.success && result.data) {
      console.log(`   First trade ID: ${result.data[0]?.id || 'None'}`);
      console.log(`   First trade status: ${result.data[0]?.status || 'None'}`);
      console.log(`   First trade created_at: ${result.data[0]?.created_at || 'None'}`);
      
      console.log('\n   All trade IDs:');
      result.data.slice(0, 5).forEach((trade, i) => {
        console.log(`     ${i + 1}. ${trade.id} (${trade.status})`);
      });
    }

    console.log('\n2️⃣ Testing without filters...');
    const resultNoFilter = await TradeService.getAll();
    console.log(`   Success: ${resultNoFilter.success}`);
    console.log(`   Data length: ${resultNoFilter.data ? resultNoFilter.data.length : 'N/A'}`);

  } catch (error) {
    console.error('❌ Error testing TradeService:', error.message);
    console.error('   Stack:', error.stack);
  }
}

debugTradeService().catch(console.error);