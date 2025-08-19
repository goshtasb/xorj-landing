/**
 * Batch Trader Intelligence API Endpoint
 * REST API for batch wallet analysis
 */

import { NextRequest, NextResponse } from 'next/server';
import { traderIntelligenceEngine } from '@/lib/services/trader-intelligence-engine';
import { BatchAnalysisRequest, ApiResponse } from '@/types/trader-intelligence';

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const requestId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  try {
    console.log(`📊 Batch API Request: ${requestId} - Multiple Wallet Analysis`);
    
    const body = await request.json();
    const batchRequest: BatchAnalysisRequest = body;

    // Validate request
    if (!batchRequest.walletAddresses || !Array.isArray(batchRequest.walletAddresses)) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: 'walletAddresses array is required',
        timestamp: Date.now(),
        requestId
      }, { status: 400 });
    }

    if (batchRequest.walletAddresses.length === 0) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: 'At least one wallet address is required',
        timestamp: Date.now(),
        requestId
      }, { status: 400 });
    }

    if (batchRequest.walletAddresses.length > 50) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: 'Maximum 50 wallets per batch request',
        timestamp: Date.now(),
        requestId
      }, { status: 400 });
    }

    // Validate wallet address formats
    for (const address of batchRequest.walletAddresses) {
      if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) {
        return NextResponse.json<ApiResponse<null>>({
          success: false,
          error: `Invalid wallet address format: ${address}`,
          timestamp: Date.now(),
          requestId
        }, { status: 400 });
      }
    }

    console.log(`🔍 Batch analyzing ${batchRequest.walletAddresses.length} wallets`);
    console.log(`⚡ Priority: ${batchRequest.priority}`);

    // Perform batch analysis
    const result = await traderIntelligenceEngine.analyzeBatch(batchRequest);

    // Log results
    const processingTimeMs = Date.now() - startTime;
    console.log(`✅ Batch analysis complete for ${requestId}`);
    console.log(`⏱️ Total processing time: ${processingTimeMs}ms`);
    console.log(`📊 Success rate: ${result.summary.completedWallets}/${result.summary.totalWallets}`);
    console.log(`⚡ Average per wallet: ${result.summary.avgProcessingTimeMs}ms`);

    // Return success response
    return NextResponse.json<ApiResponse<typeof result>>({
      success: true,
      data: result,
      timestamp: Date.now(),
      requestId
    });

  } catch (error) {
    console.error(`❌ Batch API Error ${requestId}:`, error);
    
    // Return error response
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: `Batch analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      timestamp: Date.now(),
      requestId
    }, { status: 500 });
  }
}

// GET endpoint to retrieve batch analysis status (for future use)
export async function GET(request: NextRequest) {
  const requestId = `batch_status_${Date.now()}`;
  
  // This would be used to check the status of a running batch job
  // For now, return a simple status response
  
  return NextResponse.json<ApiResponse<{
    message: string;
    processingStatus: any;
  }>>({
    success: true,
    data: {
      message: 'Batch analysis endpoint is available',
      processingStatus: traderIntelligenceEngine.getProcessingStatus()
    },
    timestamp: Date.now(),
    requestId
  });
}