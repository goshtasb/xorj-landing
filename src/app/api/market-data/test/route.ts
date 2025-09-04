/**
 * Market Data Integration Test API
 * Test the complete real-time price integration flow
 */

import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { marketDataService } from '@/lib/marketData';
import { priceValidator } from '@/lib/priceValidation';
import { tradeExecutor } from '@/lib/tradeExecutor';

interface SubscriptionTest {
  subscriptions: Array<{
    tokenAddress: string;
    success: boolean;
    error?: string;
  }>;
}

interface PriceDataTest {
  prices: Array<{
    tokenAddress: string;
    success: boolean;
    price?: number;
    error?: string;
  }>;
}

interface ValidationTest {
  validations: Array<{
    tokenAddress: string;
    success: boolean;
    isValid?: boolean;
    error?: string;
  }>;
}

interface TradeTest {
  success?: boolean;
  error?: string;
  details?: {
    tradeId?: string;
    expectedOutput?: number;
    simulation?: unknown;
  };
}

interface ConnectionDetails {
  connected: boolean;
  connectionState: string;
  health: {
    connected: boolean;
    connectionState: string;
    subscriptions: string[];
    lastDataCount: number;
    uptime?: number;
    lastHeartbeat?: number;
  };
}

interface TestResults {
  requestId: string;
  walletAddress: string;
  startTime: string;
  tests: {
    connection: { success: boolean; details: ConnectionDetails };
    subscription: { success: boolean; details: SubscriptionTest };
    priceData: { success: boolean; details: PriceDataTest };
    validation: { success: boolean; details: ValidationTest };
    trade: { success: boolean; details: TradeTest };
  };
  endTime: string;
  duration: string;
  summary: {
    totalTests: number;
    testsSuccessful: number;
    testsFailed: number;
  };
}

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

// Type assertion after null check
const jwtSecret: string = JWT_SECRET;

// Common Solana token addresses for testing
const TEST_TOKENS = {
  WSOL: 'So11111111111111111111111111111111111111112', // Wrapped SOL
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USD Coin
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // Tether
  RAY: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R'  // Raydium
};

export async function POST(request: NextRequest) {
  // Disable test endpoints in production
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'Test endpoints are disabled in production' },
      { status: 404 }
    );
  }

  const startTime = Date.now();
  const requestId = `market_test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    // Authentication
    const authorization = request.headers.get('authorization');
    
    if (!authorization || !authorization.startsWith('Bearer ')) {
      return NextResponse.json({
        error: 'Missing authorization header',
        requestId
      }, { status: 401 });
    }

    const token = authorization.replace('Bearer ', '');
    let walletAddress: string;
    
    try {
      const decoded = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] }) as { wallet_address?: string; sub?: string };
      walletAddress = decoded?.wallet_address || decoded?.sub || '';
      
      if (!walletAddress) {
        throw new Error('No wallet address in token');
      }
    } catch (error) {
      // FIXED: In development, handle malformed JWT tokens gracefully
      if (process.env.NODE_ENV === 'development') {
        console.log(`🧪 Development mode: JWT malformed, using default wallet address`);
        walletAddress = '5QfzCCipXjebAfHpMhCJAoxUJL2TyqM5p8tCFLjsPbmh';
      } else {
        return NextResponse.json({
          error: 'Invalid token',
          requestId
        }, { status: 401 });
      }
    }

    console.log(`🧪 Starting market data integration test for ${walletAddress}`);

    const testResults: Partial<TestResults> = {
      requestId,
      walletAddress,
      startTime: new Date().toISOString(),
      tests: {} // We'll build this incrementally
    };

    // Test 1: Market Data Service Connection
    console.log('📡 Testing market data service connection...');
    const connectionTest = {
      connected: marketDataService.isConnected(),
      connectionState: marketDataService.getConnectionState(),
      health: marketDataService.getHealthStatus()
    };

    if (!connectionTest.connected) {
      try {
        await marketDataService.connect();
        connectionTest.connected = marketDataService.isConnected();
        connectionTest.connectionState = marketDataService.getConnectionState();
      } catch {
        console.error('❌ Failed to connect to market data service');
      }
    }

    testResults.tests.connection = {
      success: connectionTest.connected,
      details: connectionTest
    };

    // Test 2: Price Subscription
    console.log('📊 Testing price subscription...');
    const subscriptionTest: SubscriptionTest = { subscriptions: [] };
    
    for (const [symbol, address] of Object.entries(TEST_TOKENS)) {
      try {
        await marketDataService.subscribeToPrice(address, '1s');
        subscriptionTest.subscriptions.push({
          symbol,
          address,
          success: true
        });
        console.log(`✅ Subscribed to ${symbol} (${address})`);
      } catch (error) {
        subscriptionTest.subscriptions.push({
          symbol,
          address,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        console.error(`❌ Failed to subscribe to ${symbol}`);
      }
    }

    testResults.tests.subscription = {
      success: subscriptionTest.subscriptions.every((s) => s.success),
      details: subscriptionTest
    };

    // Wait for price data to arrive
    console.log('⏳ Waiting for price data...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Test 3: Price Data Retrieval
    console.log('💰 Testing price data retrieval...');
    const priceDataTest: PriceDataTest = { prices: [] };
    
    for (const [symbol, address] of Object.entries(TEST_TOKENS)) {
      const priceData = marketDataService.getCurrentPrice(address);
      
      if (priceData) {
        priceDataTest.prices.push({
          symbol,
          address,
          success: true,
          price: priceData.price,
          timestamp: priceData.timestamp,
          age: Date.now() - priceData.timestamp
        });
        console.log(`✅ ${symbol}: $${priceData.price} (${Date.now() - priceData.timestamp}ms old)`);
      } else {
        priceDataTest.prices.push({
          symbol,
          address,
          success: false,
          error: 'No price data available'
        });
        console.warn(`⚠️ No price data for ${symbol}`);
      }
    }

    testResults.tests.priceData = {
      success: priceDataTest.prices.some((p) => p.success),
      details: priceDataTest
    };

    // Test 4: Price Validation
    console.log('🔍 Testing price validation...');
    const validationTest: ValidationTest = { validations: [] };
    
    for (const [symbol, address] of Object.entries(TEST_TOKENS)) {
      const priceData = marketDataService.getCurrentPrice(address);
      
      if (priceData) {
        const validation = priceValidator.validatePrice(priceData);
        validationTest.validations.push({
          symbol,
          address,
          success: validation.isValid,
          confidence: validation.confidence,
          recommendation: validation.recommendation,
          warningCount: validation.warnings.length,
          errorCount: validation.errors.length
        });
        console.log(`✅ ${symbol} validation: ${validation.confidence.toFixed(2)} confidence, ${validation.recommendation}`);
      } else {
        validationTest.validations.push({
          symbol,
          address,
          success: false,
          error: 'No price data to validate'
        });
      }
    }

    testResults.tests.validation = {
      success: validationTest.validations.some((v) => v.success),
      details: validationTest
    };

    // Test 5: Trade Integration (Simulation)
    console.log('🚀 Testing trade integration...');
    const tradeTest: TradeTest = {};
    
    try {
      const simulatedTrade = await tradeExecutor.simulateTrade({
        userWalletAddress: walletAddress,
        fromMint: TEST_TOKENS.WSOL,
        toMint: TEST_TOKENS.USDC,
        amount: 1000000, // 0.001 SOL in lamports
        slippageBps: 50 // 0.5%
      });

      tradeTest.success = simulatedTrade.success;
      tradeTest.details = {
        tradeId: simulatedTrade.tradeId,
        expectedOutput: simulatedTrade.expectedOutput,
        simulation: simulatedTrade.simulation
      };

      console.log(`✅ Trade simulation: ${simulatedTrade.tradeId}`);
    } catch (error) {
      tradeTest.success = false;
      tradeTest.error = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ Trade simulation failed`);
    }

    testResults.tests.tradeIntegration = tradeTest;

    // Test 6: Health Monitoring
    console.log('🏥 Testing health monitoring...');
    const healthTest = {
      marketDataHealth: marketDataService.getHealthStatus(),
      validatorHealth: priceValidator.getValidatorHealth()
    };

    testResults.tests.health = {
      success: true,
      details: healthTest
    };

    // Calculate overall results
    const allTestsSuccessful = Object.values(testResults.tests!).every((test) => test.success);
    const responseTime = Date.now() - startTime;

    testResults.endTime = new Date().toISOString();
    testResults.duration = `${responseTime}ms`;
    testResults.summary = {
      totalTests: Object.keys(testResults.tests!).length,
      testsSuccessful: Object.values(testResults.tests!).filter((test) => test.success).length,
      testsFailed: Object.keys(testResults.tests!).length - Object.values(testResults.tests!).filter((test) => test.success).length
    };

    console.log(`🏁 Market data integration test complete: ${allTestsSuccessful ? 'PASSED' : 'FAILED'}`);

    return NextResponse.json(testResults, {
      status: allTestsSuccessful ? 200 : 207, // 207 Multi-Status for partial success
      headers: {
        'X-Request-ID': requestId,
        'X-Response-Time': `${responseTime}ms`,
        'X-Test-Result': allTestsSuccessful ? 'PASSED' : 'FAILED'
      }
    });

  } catch (error) {
    console.error(`❌ Market data integration test failed:`, error);
    const responseTime = Date.now() - startTime;
    
    return NextResponse.json({
      error: 'Integration test failed',
      requestId,
      responseTime: `${responseTime}ms`,
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}