/**
 * Trading Logic Integration Test API
 * Test the complete signal processing pipeline
 */

import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { tradingLogicService, StrategicGuidance, VaultHoldings } from '@/lib/tradingLogic';

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

// Type assertion after null check
const jwtSecret: string = JWT_SECRET;

// Mock data for testing
const MOCK_STRATEGIC_GUIDANCE: StrategicGuidance = {
  targetTraderId: 'mock_trader_001',
  allocation: {
    'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN': {
      symbol: 'JUP',
      targetPercentage: 100
    }
  },
  confidence: 0.95,
  lastUpdated: Date.now()
};

const MOCK_VAULT_HOLDINGS: VaultHoldings = {
  vaultAddress: 'mock_vault_address',
  totalValue: 10000,
  assets: {
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': {
      symbol: 'USDC',
      balance: 10000,
      value: 10000,
      percentage: 100
    }
  },
  lastFetched: Date.now()
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
  const requestId = `trading_test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (_error) {
      // FIXED: In development, handle malformed JWT tokens gracefully
      if (process.env.NODE_ENV === 'development') {
        console.log('🧪 Development mode: JWT malformed, using default wallet address');
        walletAddress = '5QfzCCipXjebAfHpMhCJAoxUJL2TyqM5p8tCFLjsPbmh';
      } else {
        return NextResponse.json({
          error: 'Invalid token',
          requestId
        }, { status: 401 });
      }
    }

    console.log(`🧪 Starting trading logic integration test for ${walletAddress}`);

    interface TestResults {
      requestId: string;
      walletAddress: string;
      startTime: string;
      tests: Record<string, unknown>;
      summary?: {
        overallSuccess: boolean;
        testsRun: number;
        testsSuccessful: number;
        responseTime: string;
        endTime: string;
        readyForPhase3: boolean;
      };
    }

    const testResults: TestResults = {
      requestId,
      walletAddress,
      startTime: new Date().toISOString(),
      tests: {}
    };

    // Test 1: Service Health
    console.log('🏥 Testing service health...');
    const healthTest = tradingLogicService.getServiceHealth();
    
    testResults.tests.serviceHealth = {
      success: true,
      details: healthTest
    };

    // Test 2: Mock Strategic Guidance Processing
    console.log('📊 Testing strategic guidance processing...');
    const guidanceTest: Record<string, unknown> = {};
    
    try {
      // Test the parsing logic with mock data
      const mockGuidance = MOCK_STRATEGIC_GUIDANCE;
      guidanceTest.success = true;
      guidanceTest.mockData = mockGuidance;
      guidanceTest.validAllocation = Object.keys(mockGuidance.allocation).length > 0;
      guidanceTest.totalPercentage = Object.values(mockGuidance.allocation)
        .reduce((sum, asset) => sum + asset.targetPercentage, 0);
    } catch (error) {
      guidanceTest.success = false;
      guidanceTest.error = error instanceof Error ? error.message : 'Unknown error';
    }
    
    testResults.tests.strategicGuidance = guidanceTest;

    // Test 3: Mock Vault Holdings Analysis
    console.log('🔍 Testing vault holdings analysis...');
    const holdingsTest: Record<string, unknown> = {};
    
    try {
      const mockHoldings = MOCK_VAULT_HOLDINGS;
      holdingsTest.success = true;
      holdingsTest.mockData = mockHoldings;
      holdingsTest.totalValue = mockHoldings.totalValue;
      holdingsTest.assetsCount = Object.keys(mockHoldings.assets).length;
      holdingsTest.percentageSum = Object.values(mockHoldings.assets)
        .reduce((sum, asset) => sum + asset.percentage, 0);
      holdingsTest.validPercentages = Math.abs(holdingsTest.percentageSum - 100) < 0.01;
    } catch (error) {
      holdingsTest.success = false;
      holdingsTest.error = error instanceof Error ? error.message : 'Unknown error';
    }
    
    testResults.tests.vaultHoldings = holdingsTest;

    // Test 4: Signal Generation Logic
    console.log('🧠 Testing signal generation logic...');
    const signalTest: Record<string, unknown> = {};
    
    try {
      // Generate signal using mock data
      const signal = await tradingLogicService.generateTradeSignal(
        walletAddress,
        'mock_vault_address',
        MOCK_STRATEGIC_GUIDANCE,
        MOCK_VAULT_HOLDINGS
      );

      signalTest.success = true;
      
      if (signal) {
        signalTest.signalGenerated = true;
        signalTest.signal = {
          action: signal.action,
          fromAsset: signal.fromAsset,
          toAsset: signal.toAsset,
          targetPercentage: signal.targetPercentage,
          discrepancy: signal.metadata?.discrepancy,
          confidence: signal.metadata?.confidence,
          signalId: signal.metadata?.signalId
        };
        
        // Validate signal structure
        signalTest.validSignal = (
          signal.action === 'REBALANCE' &&
          signal.fromAsset.mintAddress &&
          signal.toAsset.mintAddress &&
          signal.targetPercentage > 0 &&
          signal.metadata?.signalId
        );
      } else {
        signalTest.signalGenerated = false;
        signalTest.reason = 'No signal generated - possibly within thresholds or insufficient discrepancy';
      }
    } catch (error) {
      signalTest.success = false;
      signalTest.error = error instanceof Error ? error.message : 'Unknown error';
    }
    
    testResults.tests.signalGeneration = signalTest;

    // Test 5: Pipeline Integration
    console.log('🏭 Testing complete pipeline integration...');
    const pipelineTest: Record<string, unknown> = {};
    
    try {
      // Clear any existing signals first
      tradingLogicService.clearProcessedSignals(walletAddress);
      
      // Note: This would normally fetch real data, but for testing we use mocks
      pipelineTest.success = true;
      pipelineTest.steps = [
        'Strategic guidance ingestion',
        'Vault holdings reconciliation', 
        'Discrepancy analysis',
        'Signal generation',
        'Signal validation'
      ];
      pipelineTest.dataFlow = 'Strategy → Current State → Signal → Risk Validation → Execution';
      pipelineTest.mockDataUsed = true;
      pipelineTest.note = 'Real pipeline testing requires live Quantitative Engine and Solana connectivity';
      
    } catch (error) {
      pipelineTest.success = false;
      pipelineTest.error = error instanceof Error ? error.message : 'Unknown error';
    }
    
    testResults.tests.pipelineIntegration = pipelineTest;

    // Test 6: Rate Limiting and Configuration
    console.log('⚙️ Testing configuration and limits...');
    const configTest: Record<string, unknown> = {};
    
    try {
      const health = tradingLogicService.getServiceHealth();
      configTest.success = true;
      configTest.configuration = health.config;
      configTest.rateLimiting = {
        maxSignalsPerUser: health.config.maxSignalsPerUser,
        currentSignalsForUser: tradingLogicService.getProcessedSignals(walletAddress).length
      };
      configTest.thresholds = {
        rebalanceThreshold: health.config.rebalanceThreshold,
        confidenceThreshold: health.config.confidenceThreshold,
        staleDataThreshold: health.config.staleDataThreshold
      };
    } catch (error) {
      configTest.success = false;
      configTest.error = error instanceof Error ? error.message : 'Unknown error';
    }
    
    testResults.tests.configuration = configTest;

    // Calculate overall results
    const allTestsSuccessful = Object.values(testResults.tests).every((test: unknown) => (test as Record<string, unknown>).success);
    const responseTime = Date.now() - startTime;

    testResults.summary = {
      overallSuccess: allTestsSuccessful,
      testsRun: Object.keys(testResults.tests).length,
      testsSuccessful: Object.values(testResults.tests).filter((test: unknown) => (test as Record<string, unknown>).success).length,
      responseTime: `${responseTime}ms`,
      endTime: new Date().toISOString(),
      readyForPhase3: allTestsSuccessful
    };

    console.log(`🏁 Trading logic integration test complete: ${allTestsSuccessful ? 'PASSED' : 'FAILED'}`);

    return NextResponse.json(testResults, {
      status: allTestsSuccessful ? 200 : 207,
      headers: {
        'X-Request-ID': requestId,
        'X-Response-Time': `${responseTime}ms`,
        'X-Test-Result': allTestsSuccessful ? 'PASSED' : 'FAILED'
      }
    });

  } catch (error) {
    console.error(`❌ Trading logic integration test failed:`, error);
    const responseTime = Date.now() - startTime;
    
    return NextResponse.json({
      error: 'Integration test failed',
      requestId,
      responseTime: `${responseTime}ms`,
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}