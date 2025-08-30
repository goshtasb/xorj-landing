/**
 * Ranked Traders Cache Service - Task 3.3
 * High-performance caching layer for bot consumption of ranked traders
 */

import { XORJTrustScore } from './xorj-trust-score';
import { WalletPerformanceMetrics } from '@/types/trader-intelligence';

export interface RankedTraderPayload {
  walletAddress: string;
  trustScore: number;
  rank: number;
  tier: 'S' | 'A' | 'B' | 'C' | 'D';
  
  // Raw metrics for bot consumption
  rawMetrics: {
    netRoi: number;
    maxDrawdown: number;
    sharpeRatio: number;
    winLossRatio: number;
    totalTrades: number;
    winRate: number;
    totalVolumeUsd: number;
    avgTradeSize: number;
    avgHoldingPeriod: number;
    profitFactor: number;
    volatility: number;
    calmarRatio: number;
  };
  
  // Normalized metrics for transparency
  normalizedMetrics: {
    normalizedSharpe: number;
    normalizedRoi: number;
    normalizedMaxDrawdown: number;
  };
  
  // Additional context
  eligibility: {
    tradingDays: number;
    totalTrades: number;
    maxSingleDayROI: number;
  };
  
  // Metadata
  lastUpdated: number;
  dataQuality: 'excellent' | 'good' | 'fair' | 'poor';
  confidenceScore: number;
}

export interface RankedTradersResponse {
  traders: RankedTraderPayload[];
  metadata: {
    totalAnalyzed: number;
    eligibleTraders: number;
    topTierCount: number; // S-tier traders
    cacheStatus: 'hit' | 'miss' | 'refresh';
    generatedAt: number;
    expiresAt: number;
    ttlSeconds: number;
    cohortStats: {
      avgTrustScore: number;
      topScore: number;
      scoreRange: { min: number; max: number };
    };
  };
}

interface CacheEntry {
  data: RankedTradersResponse;
  timestamp: number;
  expiresAt: number;
}

export class RankedTradersCache {
  private cache = new Map<string, CacheEntry>();
  private readonly TTL_MS = 60 * 60 * 1000; // 1 hour TTL per requirements
  private readonly MAX_CACHE_ENTRIES = 10; // Prevent memory bloat
  private isRefreshing = false;

  /**
   * Get ranked traders with intelligent caching
   */
  async getRankedTraders(
    limit: number = 20,
    forceRefresh: boolean = false
  ): Promise<RankedTradersResponse> {
    const cacheKey = `ranked_traders_${limit}`;
    const now = Date.now();

    // Check cache first unless forced refresh
    if (!forceRefresh) {
      const cached = this.getCachedEntry(cacheKey, now);
      if (cached) {
        console.log(`🎯 Cache HIT for ranked traders (${limit})`);
        return {
          ...cached.data,
          metadata: {
            ...cached.data.metadata,
            cacheStatus: 'hit'
          }
        };
      }
    }

    console.log(`🔄 Cache MISS - generating fresh ranked traders (${limit})`);
    
    // Prevent concurrent refreshes
    if (this.isRefreshing) {
      console.log('⏳ Concurrent refresh detected, waiting for completion...');
      await this.waitForRefresh();
      return this.getRankedTraders(limit, false); // Try cache again
    }

    return await this.refreshRankedTraders(cacheKey, limit);
  }

  /**
   * Force refresh the cached data
   */
  async refreshRankedTraders(
    cacheKey: string,
    limit: number
  ): Promise<RankedTradersResponse> {
    this.isRefreshing = true;
    const startTime = Date.now();

    try {
      // This would typically call your trader intelligence engine
      // For now, we'll simulate with a placeholder that should be replaced
      const response = await this.generateRankedTraders(limit);
      
      const now = Date.now();
      const expiresAt = now + this.TTL_MS;

      // Add cache metadata
      const cachedResponse: RankedTradersResponse = {
        ...response,
        metadata: {
          ...response.metadata,
          cacheStatus: 'refresh',
          generatedAt: now,
          expiresAt,
          ttlSeconds: Math.floor(this.TTL_MS / 1000)
        }
      };

      // Store in cache
      this.cache.set(cacheKey, {
        data: cachedResponse,
        timestamp: now,
        expiresAt
      });

      // Cleanup old entries
      this.cleanupExpiredEntries();

      const processingTime = Date.now() - startTime;
      console.log(`✅ Ranked traders cache refreshed in ${processingTime}ms`);

      return cachedResponse;

    } finally {
      this.isRefreshing = false;
    }
  }

  /**
   * Generate ranked traders data (placeholder - should be replaced with actual implementation)
   */
  private async generateRankedTraders(limit: number): Promise<RankedTradersResponse> {
    // TODO: Replace with actual call to trader intelligence engine
    // This is a placeholder implementation
    console.warn('🚧 Using placeholder data - replace with actual trader analysis');

    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 100));

    // Mock data for development
    const mockTraders: RankedTraderPayload[] = Array.from({ length: Math.min(limit, 20) }, (_, i) => ({
      walletAddress: `MockTrader${i + 1}${'x'.repeat(32)}`,
      trustScore: Math.round((95 - (i * 2.5)) * 100) / 100,
      rank: i + 1,
      tier: i < 2 ? 'S' : i < 6 ? 'A' : i < 12 ? 'B' : i < 18 ? 'C' : 'D',
      rawMetrics: {
        netRoi: Math.round((80 - (i * 3)) * 100) / 100,
        maxDrawdown: Math.round((15 + (i * 1.2)) * 100) / 100,
        sharpeRatio: Math.round((3.2 - (i * 0.1)) * 100) / 100,
        winLossRatio: Math.round((2.1 - (i * 0.05)) * 100) / 100,
        totalTrades: Math.floor(200 - (i * 5)),
        winRate: Math.round((75 - (i * 1.5)) * 100) / 100,
        totalVolumeUsd: Math.floor(1000000 - (i * 25000)),
        avgTradeSize: Math.floor(5000 - (i * 100)),
        avgHoldingPeriod: Math.round((4.2 - (i * 0.1)) * 100) / 100,
        profitFactor: Math.round((2.8 - (i * 0.08)) * 100) / 100,
        volatility: Math.round((18 + (i * 0.5)) * 100) / 100,
        calmarRatio: Math.round((1.8 - (i * 0.05)) * 100) / 100
      },
      normalizedMetrics: {
        normalizedSharpe: Math.round((0.95 - (i * 0.04)) * 1000) / 1000,
        normalizedRoi: Math.round((0.90 - (i * 0.04)) * 1000) / 1000,
        normalizedMaxDrawdown: Math.round((0.20 + (i * 0.03)) * 1000) / 1000
      },
      eligibility: {
        tradingDays: Math.floor(120 - (i * 2)),
        totalTrades: Math.floor(200 - (i * 5)),
        maxSingleDayROI: Math.round((45 + (i * 2)) * 100) / 100
      },
      lastUpdated: Date.now(),
      dataQuality: i < 5 ? 'excellent' : i < 12 ? 'good' : i < 18 ? 'fair' : 'poor',
      confidenceScore: Math.floor(95 - (i * 2))
    }));

    return {
      traders: mockTraders,
      metadata: {
        totalAnalyzed: 100,
        eligibleTraders: mockTraders.length,
        topTierCount: mockTraders.filter(t => t.tier === 'S').length,
        cacheStatus: 'miss',
        generatedAt: Date.now(),
        expiresAt: Date.now() + this.TTL_MS,
        ttlSeconds: Math.floor(this.TTL_MS / 1000),
        cohortStats: {
          avgTrustScore: Math.round(mockTraders.reduce((sum, t) => sum + t.trustScore, 0) / mockTraders.length * 100) / 100,
          topScore: Math.max(...mockTraders.map(t => t.trustScore)),
          scoreRange: {
            min: Math.min(...mockTraders.map(t => t.trustScore)),
            max: Math.max(...mockTraders.map(t => t.trustScore))
          }
        }
      }
    };
  }

  /**
   * Get cached entry if valid
   */
  private getCachedEntry(cacheKey: string, now: number): CacheEntry | null {
    const entry = this.cache.get(cacheKey);
    if (!entry) return null;

    if (now > entry.expiresAt) {
      this.cache.delete(cacheKey);
      return null;
    }

    return entry;
  }

  /**
   * Wait for ongoing refresh to complete
   */
  private async waitForRefresh(maxWaitMs: number = 30000): Promise<void> {
    const startTime = Date.now();
    
    while (this.isRefreshing && (Date.now() - startTime) < maxWaitMs) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  /**
   * Clean up expired cache entries
   */
  private cleanupExpiredEntries(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, entry] of this.cache) {
      if (now > entry.expiresAt) {
        expiredKeys.push(key);
      }
    }

    expiredKeys.forEach(key => this.cache.delete(key));

    // Also enforce max cache size
    if (this.cache.size > this.MAX_CACHE_ENTRIES) {
      const entries = Array.from(this.cache.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp); // Sort by timestamp
      
      const toRemove = entries.slice(0, entries.length - this.MAX_CACHE_ENTRIES);
      toRemove.forEach(([key]) => this.cache.delete(key));
    }

    if (expiredKeys.length > 0) {
      console.log(`🧹 Cleaned up ${expiredKeys.length} expired cache entries`);
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    entries: number;
    memoryUsage: number;
    hitRate?: number;
    oldestEntry?: number;
    newestEntry?: number;
  } {
    const entries = Array.from(this.cache.values());
    
    return {
      entries: this.cache.size,
      memoryUsage: entries.length * 1024, // Rough estimate
      oldestEntry: entries.length > 0 ? Math.min(...entries.map(e => e.timestamp)) : undefined,
      newestEntry: entries.length > 0 ? Math.max(...entries.map(e => e.timestamp)) : undefined
    };
  }

  /**
   * Clear all cache entries
   */
  clearCache(): void {
    this.cache.clear();
    console.log('🗑️ Ranked traders cache cleared');
  }

  /**
   * Warm up cache with initial data
   */
  async warmUp(limit: number = 20): Promise<void> {
    console.log('🔥 Warming up ranked traders cache...');
    await this.getRankedTraders(limit, true);
  }
}

// Export singleton instance
export const rankedTradersCache = new RankedTradersCache();