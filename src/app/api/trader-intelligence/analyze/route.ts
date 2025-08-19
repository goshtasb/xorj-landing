/**
 * Trader Intelligence API Endpoint
 * REST API for wallet analysis using the Trader Intelligence Engine
 */

import { NextRequest, NextResponse } from 'next/server';
import { traderIntelligenceEngine } from '@/lib/services/trader-intelligence-engine';
import { WalletAnalysisConfig, ApiResponse } from '@/types/trader-intelligence';

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  try {
    console.log(`📊 API Request: ${requestId} - Trader Intelligence Analysis`);
    
    const body = await request.json();
    const config: WalletAnalysisConfig = body;

    // Validate request
    if (!config.walletAddress) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: 'Wallet address is required',
        timestamp: Date.now(),
        requestId
      }, { status: 400 });
    }

    // Validate wallet address format (basic Solana public key validation)
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(config.walletAddress)) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: 'Invalid wallet address format',
        timestamp: Date.now(),
        requestId
      }, { status: 400 });
    }

    console.log(`🔍 Analyzing wallet: ${config.walletAddress}`);

    // Perform the analysis
    const result = await traderIntelligenceEngine.analyzeWallet(config);

    // Log results
    const processingTimeMs = Date.now() - startTime;
    console.log(`✅ Analysis complete for ${requestId}`);
    console.log(`⏱️ Processing time: ${processingTimeMs}ms`);
    console.log(`📊 Status: ${result.status}`);
    console.log(`🔢 Trades found: ${result.metrics.totalTrades}`);
    
    if (result.status === 'completed') {
      console.log(`💰 Net ROI: ${result.metrics.netRoi?.toFixed(2)}%`);
      console.log(`📉 Max Drawdown: ${result.metrics.maxDrawdown?.toFixed(2)}%`);
      console.log(`⚡ Sharpe Ratio: ${result.metrics.sharpeRatio?.toFixed(3)}`);
    }

    // Return success response
    return NextResponse.json<ApiResponse<typeof result>>({
      success: true,
      data: result,
      timestamp: Date.now(),
      requestId
    }, { 
      status: result.status === 'completed' ? 200 : 206 // 206 for partial content
    });

  } catch (error) {
    console.error(`❌ API Error ${requestId}:`, error);
    
    // Return error response
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: `Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      timestamp: Date.now(),
      requestId
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const requestId = `health_${Date.now()}`;

  try {
    console.log(`🔍 Health check request: ${requestId}`);

    const health = await traderIntelligenceEngine.getHealthStatus();
    const processingStatus = traderIntelligenceEngine.getProcessingStatus();

    return NextResponse.json<ApiResponse<{
      health: typeof health;
      processing: typeof processingStatus;
      version: string;
    }>>({
      success: true,
      data: {
        health,
        processing: processingStatus,
        version: '1.0.0'
      },
      timestamp: Date.now(),
      requestId
    });

  } catch (error) {
    console.error(`❌ Health check error ${requestId}:`, error);
    
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: `Health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      timestamp: Date.now(),
      requestId
    }, { status: 500 });
  }
}