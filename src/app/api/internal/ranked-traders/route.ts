/**
 * Internal Ranked Traders API Endpoint - Task 3.3
 * Secure endpoint for bot execution logic to consume ranked trader data
 */

import { NextRequest, NextResponse } from 'next/server';
import { rankedTradersCache, RankedTradersResponse } from '@/lib/services/ranked-traders-cache';
import { traderIntelligenceEngine } from '@/lib/services/trader-intelligence-engine';
import { xorjTrustScoreCalculator } from '@/lib/services/xorj-trust-score';
import { ApiResponse } from '@/types/trader-intelligence';

// Security configuration
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;
const ALLOWED_ORIGINS = process.env.ALLOWED_INTERNAL_ORIGINS?.split(',') || ['localhost'];
const MAX_TRADERS_LIMIT = 50;
const DEFAULT_LIMIT = 20;

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const requestId = `ranked_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  try {
    console.log(`🎯 Internal API Request: ${requestId} - Ranked Traders`);
    
    // Security checks
    const securityCheck = validateRequest(request);
    if (!securityCheck.valid) {
      console.warn(`🚫 Security violation: ${securityCheck.reason} - ${requestId}`);
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: 'Unauthorized',
        timestamp: Date.now(),
        requestId
      }, { status: 401 });
    }

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const limit = Math.min(
      parseInt(searchParams.get('limit') || DEFAULT_LIMIT.toString()),
      MAX_TRADERS_LIMIT
    );
    const forceRefresh = searchParams.get('refresh') === 'true';
    const includeRawMetrics = searchParams.get('includeRaw') !== 'false'; // Default true
    const minTier = (searchParams.get('minTier') || 'D') as 'S' | 'A' | 'B' | 'C' | 'D';

    console.log(`📊 Request params - Limit: ${limit}, Refresh: ${forceRefresh}, MinTier: ${minTier}`);

    // Get ranked traders from cache
    let rankedData: RankedTradersResponse;
    
    try {
      rankedData = await rankedTradersCache.getRankedTraders(limit, forceRefresh);
    } catch (cacheError) {
      console.warn(`⚠️ Cache error, falling back to direct calculation: ${cacheError}`);
      
      // Fallback to direct calculation if cache fails
      rankedData = await generateRankedTradersDirect(limit);
    }

    // Apply tier filtering
    const filteredTraders = rankedData.traders.filter(trader => {
      const tierOrder = { 'S': 5, 'A': 4, 'B': 3, 'C': 2, 'D': 1 };
      return tierOrder[trader.tier] >= tierOrder[minTier];
    });

    // Optionally remove raw metrics to reduce payload size
    const responseTraders = includeRawMetrics 
      ? filteredTraders 
      : filteredTraders.map(trader => ({
          ...trader,
          rawMetrics: undefined // Remove raw metrics if not needed
        }));

    const processingTime = Date.now() - startTime;

    // Enhanced response for bot consumption
    const response = {
      ...rankedData,
      traders: responseTraders,
      metadata: {
        ...rankedData.metadata,
        requestId,
        processingTimeMs: processingTime,
        filteredCount: filteredTraders.length,
        originalCount: rankedData.traders.length,
        appliedFilters: {
          limit,
          minTier,
          includeRawMetrics
        },
        performance: {
          cacheHit: rankedData.metadata.cacheStatus === 'hit',
          responseTime: processingTime,
          dataFreshness: Date.now() - rankedData.metadata.generatedAt
        }
      }
    };

    console.log(`✅ Ranked traders delivered: ${requestId}`);
    console.log(`📊 Stats: ${filteredTraders.length} traders, ${processingTime}ms, cache: ${rankedData.metadata.cacheStatus}`);
    console.log(`🏆 Top trader: ${filteredTraders[0]?.trustScore || 'N/A'} score`);

    return NextResponse.json<ApiResponse<typeof response>>({
      success: true,
      data: response,
      timestamp: Date.now(),
      requestId
    }, {
      headers: {
        'Cache-Control': `private, max-age=${Math.floor(rankedTradersCache['TTL_MS'] / 1000)}`,
        'X-RateLimit-Remaining': '100', // Could implement actual rate limiting
        'X-Data-Source': rankedData.metadata.cacheStatus
      }
    });

  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error(`❌ Internal API Error ${requestId}:`, error);
    
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: `Ranked traders fetch failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      timestamp: Date.now(),
      requestId
    }, { status: 500 });
  }
}

// POST endpoint for cache management
export async function POST(request: NextRequest) {
  const requestId = `cache_mgmt_${Date.now()}`;

  try {
    // Security checks
    const securityCheck = validateRequest(request);
    if (!securityCheck.valid) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: 'Unauthorized',
        timestamp: Date.now(),
        requestId
      }, { status: 401 });
    }

    const body = await request.json();
    const action = body.action as 'refresh' | 'clear' | 'warmup' | 'stats';

    switch (action) {
      case 'refresh':
        console.log(`🔄 Manual cache refresh requested: ${requestId}`);
        const limit = Math.min(body.limit || DEFAULT_LIMIT, MAX_TRADERS_LIMIT);
        const refreshed = await rankedTradersCache.refreshRankedTraders(`ranked_traders_${limit}`, limit);
        
        return NextResponse.json<ApiResponse<{ message: string; traders: number }>>({
          success: true,
          data: {
            message: 'Cache refreshed successfully',
            traders: refreshed.traders.length
          },
          timestamp: Date.now(),
          requestId
        });

      case 'clear':
        console.log(`🗑️ Manual cache clear requested: ${requestId}`);
        rankedTradersCache.clearCache();
        
        return NextResponse.json<ApiResponse<{ message: string }>>({
          success: true,
          data: { message: 'Cache cleared successfully' },
          timestamp: Date.now(),
          requestId
        });

      case 'warmup':
        console.log(`🔥 Manual cache warmup requested: ${requestId}`);
        const warmupLimit = Math.min(body.limit || DEFAULT_LIMIT, MAX_TRADERS_LIMIT);
        await rankedTradersCache.warmUp(warmupLimit);
        
        return NextResponse.json<ApiResponse<{ message: string }>>({
          success: true,
          data: { message: 'Cache warmed up successfully' },
          timestamp: Date.now(),
          requestId
        });

      case 'stats':
        const stats = rankedTradersCache.getCacheStats();
        
        return NextResponse.json<ApiResponse<typeof stats>>({
          success: true,
          data: stats,
          timestamp: Date.now(),
          requestId
        });

      default:
        return NextResponse.json<ApiResponse<null>>({
          success: false,
          error: 'Invalid action. Supported: refresh, clear, warmup, stats',
          timestamp: Date.now(),
          requestId
        }, { status: 400 });
    }

  } catch (error) {
    console.error(`❌ Cache management error ${requestId}:`, error);
    
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: `Cache management failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      timestamp: Date.now(),
      requestId
    }, { status: 500 });
  }
}

/**
 * Validate request security (API key, origin, etc.)
 */
function validateRequest(request: NextRequest): { valid: boolean; reason?: string } {
  // Check API key
  const apiKey = request.headers.get('X-API-Key') || request.headers.get('Authorization')?.replace('Bearer ', '');
  
  if (!INTERNAL_API_KEY) {
    console.warn('🔧 INTERNAL_API_KEY not configured - allowing all requests in development');
    return { valid: true }; // Allow in development
  }

  if (!apiKey || apiKey !== INTERNAL_API_KEY) {
    return { valid: false, reason: 'Invalid or missing API key' };
  }

  // Check origin (optional - for CORS-like security)
  const origin = request.headers.get('origin') || request.headers.get('host');
  if (origin && !ALLOWED_ORIGINS.some(allowed => origin.includes(allowed))) {
    return { valid: false, reason: `Origin not allowed: ${origin}` };
  }

  // Check user agent (basic bot identification)
  const userAgent = request.headers.get('user-agent') || '';
  if (!userAgent.includes('XORJ-Bot') && !userAgent.includes('localhost')) {
    console.warn(`🤖 Non-bot user agent detected: ${userAgent}`);
    // Don't block, just warn for now
  }

  return { valid: true };
}

/**
 * Direct calculation fallback (when cache fails)
 */
async function generateRankedTradersDirect(limit: number): Promise<RankedTradersResponse> {
  console.log('🔄 Generating ranked traders directly (cache fallback)');
  
  // This would normally call the trader intelligence engine
  // For now, return the same mock data structure
  const mockResponse: RankedTradersResponse = {
    traders: [], // Would be populated with actual data
    metadata: {
      totalAnalyzed: 0,
      eligibleTraders: 0,
      topTierCount: 0,
      cacheStatus: 'miss',
      generatedAt: Date.now(),
      expiresAt: Date.now() + (60 * 60 * 1000),
      ttlSeconds: 3600,
      cohortStats: {
        avgTrustScore: 0,
        topScore: 0,
        scoreRange: { min: 0, max: 0 }
      }
    }
  };

  console.warn('🚧 Direct calculation not implemented - using fallback response');
  return mockResponse;
}