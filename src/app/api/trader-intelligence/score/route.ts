/**
 * XORJ Trust Score API Endpoint
 * REST API for calculating proprietary trader trust scores
 */

import { NextRequest, NextResponse } from 'next/server';
import { xorjTrustScoreCalculator } from '@/lib/services/xorj-trust-score';
import { traderIntelligenceEngine } from '@/lib/services/trader-intelligence-engine';
import { ApiResponse, WalletPerformanceMetrics } from '@/types/trader-intelligence';

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const requestId = `score_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  try {
    console.log(`🎯 XORJ Trust Score API Request: ${requestId}`);
    
    const body = await request.json();
    
    // Support two input formats:
    // 1. Array of wallet addresses (will analyze and score)
    // 2. Array of pre-calculated performance metrics (will score only)
    
    let walletMetrics: WalletPerformanceMetrics[];

    if (body.walletAddresses && Array.isArray(body.walletAddresses)) {
      // Format 1: Analyze wallets first, then score
      console.log(`📊 Analyzing ${body.walletAddresses.length} wallets for scoring`);
      
      const analysisResults = await Promise.all(
        body.walletAddresses.map((address: string) =>
          traderIntelligenceEngine.analyzeWallet({
            walletAddress: address,
            startDate: body.startDate,
            endDate: body.endDate,
            minTradeValueUsd: body.minTradeValueUsd || 10,
            maxTransactions: body.maxTransactions || 5000
          })
        )
      );

      walletMetrics = analysisResults
        .filter(result => result.status === 'completed')
        .map(result => result.metrics);

      console.log(`✅ Analysis complete: ${walletMetrics.length}/${body.walletAddresses.length} successful`);

    } else if (body.walletMetrics && Array.isArray(body.walletMetrics)) {
      // Format 2: Use pre-calculated metrics
      walletMetrics = body.walletMetrics;
      console.log(`📊 Using ${walletMetrics.length} pre-calculated wallet metrics`);

    } else {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: 'Either walletAddresses or walletMetrics array is required',
        timestamp: Date.now(),
        requestId
      }, { status: 400 });
    }

    if (walletMetrics.length === 0) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: 'No valid wallet metrics available for scoring',
        timestamp: Date.now(),
        requestId
      }, { status: 400 });
    }

    // Calculate XORJ Trust Scores
    console.log(`🔮 Calculating XORJ Trust Scores...`);
    const { scores, cohortStats } = xorjTrustScoreCalculator.calculateTrustScores(walletMetrics);

    // Validate results
    const validation = xorjTrustScoreCalculator.validateScores(scores);
    if (!validation.isValid) {
      console.warn(`⚠️ Score validation warnings:`, validation.issues);
    }

    // Get top traders
    const topTraders = xorjTrustScoreCalculator.getTopTraders(scores, 10);
    const sTierTraders = xorjTrustScoreCalculator.getTradersByTier(scores, 'S');

    const processingTimeMs = Date.now() - startTime;
    
    console.log(`✅ XORJ Trust Score calculation complete: ${requestId}`);
    console.log(`🏆 Results: ${cohortStats.eligibleWallets}/${cohortStats.totalWallets} eligible`);
    console.log(`⭐ Top Score: ${cohortStats.topScore}`);
    console.log(`📊 S-Tier Traders: ${sTierTraders.length}`);
    console.log(`⏱️ Processing Time: ${processingTimeMs}ms`);

    const result = {
      scores,
      cohortStats,
      topTraders,
      tierBreakdown: {
        S: xorjTrustScoreCalculator.getTradersByTier(scores, 'S').length,
        A: xorjTrustScoreCalculator.getTradersByTier(scores, 'A').length,
        B: xorjTrustScoreCalculator.getTradersByTier(scores, 'B').length,
        C: xorjTrustScoreCalculator.getTradersByTier(scores, 'C').length,
        D: xorjTrustScoreCalculator.getTradersByTier(scores, 'D').length
      },
      validation,
      processingStats: {
        processingTimeMs,
        inputWallets: walletMetrics.length,
        eligibleForScoring: cohortStats.eligibleWallets,
        scoringMethod: body.walletAddresses ? 'analyze_and_score' : 'score_only'
      }
    };

    return NextResponse.json<ApiResponse<typeof result>>({
      success: true,
      data: result,
      timestamp: Date.now(),
      requestId
    });

  } catch (error) {
    console.error(`❌ XORJ Trust Score API Error ${requestId}:`, error);
    
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: `Trust score calculation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      timestamp: Date.now(),
      requestId
    }, { status: 500 });
  }
}

// GET endpoint for scoring algorithm information
export async function GET(request: NextRequest) {
  const requestId = `score_info_${Date.now()}`;

  return NextResponse.json<ApiResponse<{
    algorithm: string;
    version: string;
    weights: any;
    eligibilityCriteria: any;
    tiers: any;
  }>>({
    success: true,
    data: {
      algorithm: 'XORJ Trust Score',
      version: '1.0.0',
      weights: {
        sharpe: 0.40,
        roi: 0.25,
        drawdownPenalty: 0.35
      },
      eligibilityCriteria: {
        minTradingDays: 90,
        minTrades: 50,
        maxSingleDayROISpike: 500
      },
      tiers: {
        S: '≥ 80 points',
        A: '65-79 points', 
        B: '50-64 points',
        C: '30-49 points',
        D: '< 30 points'
      }
    },
    timestamp: Date.now(),
    requestId
  });
}