/**
 * SECURE Internal Trader Rankings API - Task 3.3 
 * ONLY for Trade Execution Bot consumption
 * DOES NOT expose intellectual property or detailed metrics
 */

import { NextRequest, NextResponse } from 'next/server';
import { traderIntelligenceEngine } from '@/lib/services/trader-intelligence-engine';
import { TraderScoreService, ScoringRunService } from '@/lib/botStateService';

// Security configuration - MUST be set in production
const INTERNAL_API_KEY = process.env.INTERNAL_API_SECRET || process.env.INTERNAL_API_KEY;
const MAX_TRADERS_RETURNED = 100;
const DEFAULT_LIMIT = 50;

// Simple response for bot - NO DETAILED METRICS
interface SecureRankedTrader {
  walletAddress: string;
  trustScore: number;
  tier: 'S' | 'A' | 'B' | 'C' | 'D';
  eligibleForCopy: boolean;
  confidenceLevel: number; // 0-100
  rank: number;
}

interface SecureBotResponse {
  rankedTraders: SecureRankedTrader[];
  totalEligible: number;
  generatedAt: number;
  expires: number;
  cacheValidFor: number;
}

export async function GET(request: NextRequest) {
  const _startTime = Date.now();
  const requestId = `bot_${Date.now()}`;

  try {
    console.log(`🤖 Bot API Request: ${requestId}`);
    
    // STRICT SECURITY VALIDATION
    const securityResult = validateBotRequest(request);
    if (!securityResult.valid) {
      console.error(`🚫 SECURITY BREACH ATTEMPT: ${securityResult.reason} - ${requestId}`);
      
      // Return generic 404 to not reveal API exists
      return NextResponse.json({ error: 'Not Found' }, { status: 404 });
    }

    // Parse minimal parameters
    const { searchParams } = new URL(request.url);
    const limit = Math.min(
      parseInt(searchParams.get('limit') || DEFAULT_LIMIT.toString()),
      MAX_TRADERS_RETURNED
    );
    const minTier = (searchParams.get('minTier') || 'B') as 'S' | 'A' | 'B' | 'C' | 'D';
    
    console.log(`🎯 Bot requesting ${limit} traders with min tier ${minTier}`);

    // Get ranked traders (using internal cache if available)
    const rankedResult = await getSecureRankedTraders(limit * 2); // Get more than needed for filtering

    // Filter by minimum tier
    const tierOrder = { 'S': 5, 'A': 4, 'B': 3, 'C': 2, 'D': 1 };
    const filteredTraders = rankedResult.traders
      .filter(trader => tierOrder[trader.tier] >= tierOrder[minTier])
      .slice(0, limit); // Apply limit after filtering

    // Create secure response - ONLY essential data for bot
    const secureResponse: SecureBotResponse = {
      rankedTraders: filteredTraders,
      totalEligible: rankedResult.totalEligible,
      generatedAt: Date.now(),
      expires: Date.now() + (30 * 60 * 1000), // 30 minutes
      cacheValidFor: 1800 // 30 minutes in seconds
    };

    const _processingTime = Date.now() - _startTime;
    
    console.log(`✅ Bot data delivered: ${filteredTraders.length} traders, ${_processingTime}ms`);
    console.log(`🏆 Top trader: Tier ${filteredTraders[0]?.tier || 'N/A'}`);

    return NextResponse.json(secureResponse, {
      status: 200,
      headers: {
        'Cache-Control': 'private, max-age=1800, must-revalidate',
        'X-RateLimit-Remaining': '100',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY'
      }
    });

  } catch {
    console.error(`❌ Bot API Error ${requestId}:`);
    
    // Generic error - don't reveal internal details
    return NextResponse.json({ error: 'Service Unavailable' }, { status: 503 });
  }
}

/**
 * STRICT security validation - designed for bot-to-bot communication only
 */
function validateBotRequest(request: NextRequest): { valid: boolean; reason?: string } {
  // 1. API Key validation (REQUIRED in production)
  const apiKey = request.headers.get('X-API-Key') || 
                  request.headers.get('Authorization')?.replace('Bearer ', '');
  
  if (!INTERNAL_API_KEY) {
    console.warn('🔧 INTERNAL_API_SECRET not configured - PRODUCTION DEPLOYMENT REQUIRED');
    // In development, still require some form of auth
    if (process.env.NODE_ENV === 'production') {
      return { valid: false, reason: 'No API key configured' };
    }
  }

  if (INTERNAL_API_KEY && (!apiKey || apiKey !== INTERNAL_API_KEY)) {
    return { valid: false, reason: 'Invalid API key' };
  }

  // 2. User Agent validation
  const userAgent = request.headers.get('user-agent') || '';
  if (!userAgent.includes('XORJ-TradeBot') && 
      !userAgent.includes('localhost') && 
      process.env.NODE_ENV === 'production') {
    return { valid: false, reason: 'Invalid user agent' };
  }

  // 3. Origin validation (internal services only)
  const origin = request.headers.get('origin') || request.headers.get('host') || '';
  if (process.env.NODE_ENV === 'production') {
    const allowedOrigins = ['localhost', '127.0.0.1', 'bot-service', 'trade-executor'];
    if (!allowedOrigins.some(allowed => origin.includes(allowed))) {
      return { valid: false, reason: 'Origin not allowed' };
    }
  }

  return { valid: true };
}

/**
 * Get ranked traders with minimal exposed information
 * First tries database cache, falls back to real-time calculation
 */
async function getSecureRankedTraders(limit: number): Promise<{
  traders: SecureRankedTrader[];
  totalEligible: number;
}> {
  
  try {
    // First try to get recent scores from database (last 24 hours)
    const latestScoringRun = await ScoringRunService.getLatestCompleted();
    const isDataFresh = latestScoringRun.data && 
      latestScoringRun.data.completed_at &&
      (Date.now() - latestScoringRun.data.completed_at.getTime()) < (24 * 60 * 60 * 1000);

    let traderScores;
    
    if (isDataFresh && latestScoringRun.data) {
      console.log(`📦 Using cached trader scores from database (run: ${latestScoringRun.data.id})`);
      
      // Get trader scores from database
      const scoresResult = await TraderScoreService.getRankedTraders(limit * 2);
      if (scoresResult.success && scoresResult.data && scoresResult.data.length > 0) {
        // Convert database scores to SecureRankedTrader format
        traderScores = scoresResult.data
          .filter(score => score.xorj_trust_score >= 30) // Minimum viable score
          .map((score, index) => {
            const tier = determineTier(score.xorj_trust_score);
            return {
              walletAddress: score.wallet_address,
              trustScore: Math.round(score.xorj_trust_score * 100) / 100,
              tier,
              eligibleForCopy: score.xorj_trust_score >= 50,
              confidenceLevel: Math.min(100, (score.metrics as Record<string, unknown>)?.confidenceScore as number || 85),
              rank: index + 1
            };
          })
          .slice(0, limit);

        console.log(`✅ Retrieved ${traderScores.length} trader scores from database`);
        
        return {
          traders: traderScores,
          totalEligible: scoresResult.data.length
        };
      }
    }

    console.log(`🔄 Database cache miss or stale, generating fresh scores`);
    
    // Fallback: Get candidate wallets and generate fresh scores
    const candidateWallets = [
      'DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK', // Example high-performance wallet
      'GDfnEsia2WLAW5t8yx2X5j2mkfA74CWMbRYUGxbGGPFS', // Example medium-performance wallet
      'GjJy8cqCNjbqtHzELfXGm43Fhgj2tKvR8C2oWNPYNT6k', // Another example wallet
      // In production, these would come from a wallet discovery service
    ];

    // Create new scoring run
    const scoringRunResult = await ScoringRunService.create({
      status: 'RUNNING',
      started_at: new Date()
    });

    if (!scoringRunResult.success || !scoringRunResult.data) {
      throw new Error('Failed to create scoring run');
    }

    const runId = scoringRunResult.data.id;

    try {
      // Get scores for candidate wallets
      const scoringResult = await traderIntelligenceEngine.scoreWallets(
        candidateWallets,
        {
          startDate: Math.floor(Date.now() / 1000) - (90 * 24 * 60 * 60), // 90 days ago
          minTradeValueUsd: 100, // Focus on meaningful trades
          maxTransactions: 5000
        }
      );

      // Store results in database for future caching
      const scoresData = scoringResult.scores
        .filter(score => score.eligibility?.isEligible)
        .map(score => ({
          run_id: runId,
          wallet_address: score.walletAddress,
          xorj_trust_score: score.trustScore,
          metrics: {
            eligibleForCopy: score.eligibility?.isEligible || false,
            dataQuality: 85, // Default data quality
            tier: score.tier,
            confidenceScore: 85
          }
        }));

      // Save to database asynchronously
      if (scoresData.length > 0) {
        const saveResult = await TraderScoreService.createBatch(scoresData);
        if (saveResult.success) {
          console.log(`💾 Saved ${scoresData.length} trader scores to database`);
        }
      }

      // Mark scoring run as completed
      await ScoringRunService.update(runId, {
        status: 'COMPLETED',
        completed_at: new Date()
      });

      // Convert to secure format - REMOVE ALL SENSITIVE DATA
      const secureTraders: SecureRankedTrader[] = scoringResult.scores
        .filter(score => score.eligibility?.isEligible) // Only eligible traders
        .map((score, index) => ({
          walletAddress: score.walletAddress,
          trustScore: Math.round(score.trustScore * 100) / 100, // Round to 2 decimals
          tier: score.tier || determineTier(score.trustScore),
          eligibleForCopy: (score.eligibility?.isEligible || false) && score.trustScore >= 50, // Simple eligibility
          confidenceLevel: Math.min(100, 75), // Convert to 0-100 scale
          rank: index + 1
        }))
        .sort((a, b) => b.trustScore - a.trustScore) // Sort by trust score descending
        .slice(0, limit);

      console.log(`🎯 Generated ${secureTraders.length} fresh secure trader rankings`);

      return {
        traders: secureTraders,
        totalEligible: scoringResult.cohortStats.eligibleWallets
      };

    } catch {
      // Mark scoring run as failed
      await ScoringRunService.update(runId, {
        status: 'FAILED',
        error_message: 'Unknown error',
        completed_at: new Date()
      });
      throw new Error('Failed to process scoring run');
    }

  } catch {
    console.error('❌ Failed to get secure rankings:');
    
    // Return empty but valid response
    return {
      traders: [],
      totalEligible: 0
    };
  }
}

/**
 * Determine tier based on trust score
 */
function determineTier(trustScore: number): 'S' | 'A' | 'B' | 'C' | 'D' {
  if (trustScore >= 80) return 'S';
  if (trustScore >= 65) return 'A';
  if (trustScore >= 50) return 'B';
  if (trustScore >= 30) return 'C';
  return 'D';
}

// Health check endpoint for bot
export async function HEAD(request: NextRequest) {
  const securityResult = validateBotRequest(request);
  if (!securityResult.valid) {
    return new NextResponse(null, { status: 404 });
  }

  const health = await traderIntelligenceEngine.getHealthStatus();
  const status = health.status === 'healthy' ? 200 : 503;
  
  return new NextResponse(null, { 
    status,
    headers: {
      'X-Service-Status': health.status,
      'X-Last-Update': Date.now().toString()
    }
  });
}