/**
 * Price Data Service
 * Handles fetching current and historical token prices from multiple APIs
 */

import { TokenPriceData, HistoricalPriceData, AnalysisError, CacheEntry } from '@/types/trader-intelligence';
import { PRICE_API_CONFIG } from '@/lib/constants';

export class PriceDataService {
  private priceCache = new Map<string, CacheEntry<TokenPriceData>>();
  private historicalCache = new Map<string, CacheEntry<HistoricalPriceData>>();
  private lastRequestTime = 0;

  constructor(
    private jupiterApiKey?: string,
    private coingeckoApiKey?: string
  ) {}

  /**
   * Get current prices for multiple tokens
   */
  async getCurrentPrices(
    tokenMints: string[]
  ): Promise<{ prices: TokenPriceData[]; errors: AnalysisError[] }> {
    const prices: TokenPriceData[] = [];
    const errors: AnalysisError[] = [];

    console.log(`💰 Fetching current prices for ${tokenMints.length} tokens`);

    for (const mint of tokenMints) {
      try {
        // Check cache first
        const cached = this.getCachedPrice(mint);
        if (cached) {
          prices.push(cached);
          continue;
        }

        // Fetch from API with rate limiting
        await this.rateLimitDelay();
        
        const priceData = await this.fetchCurrentPriceFromJupiter(mint);
        if (priceData) {
          this.cachePrice(mint, priceData);
          prices.push(priceData);
        } else {
          // Fallback to CoinGecko
          const fallbackPrice = await this.fetchCurrentPriceFromCoinGecko(mint);
          if (fallbackPrice) {
            this.cachePrice(mint, fallbackPrice);
            prices.push(fallbackPrice);
          } else {
            errors.push({
              type: 'price_api_error',
              message: `Failed to fetch current price for ${mint}`,
              timestamp: Date.now(),
              context: { mint }
            });
          }
        }
      } catch (error) {
        console.error(`❌ Error fetching price for ${mint}:`, error);
        errors.push({
          type: 'price_api_error',
          message: `Price fetch error for ${mint}: ${error}`,
          timestamp: Date.now(),
          context: { mint }
        });
      }
    }

    console.log(`✅ Fetched prices for ${prices.length}/${tokenMints.length} tokens`);
    return { prices, errors };
  }

  /**
   * Get historical price for a specific timestamp
   */
  async getHistoricalPrice(
    mint: string,
    timestamp: number
  ): Promise<TokenPriceData | null> {
    const cacheKey = `${mint}_${Math.floor(timestamp / 3600) * 3600}`; // Hour-level caching
    
    // Check cache first
    const cached = this.getCachedHistoricalPrice(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      await this.rateLimitDelay();
      
      // Try Jupiter API first (more accurate for recent prices)
      let priceData = await this.fetchHistoricalPriceFromJupiter(mint, timestamp);
      
      if (!priceData) {
        // Fallback to CoinGecko
        priceData = await this.fetchHistoricalPriceFromCoinGecko(mint, timestamp);
      }

      if (priceData) {
        // Cache the result
        this.cacheHistoricalPrice(cacheKey, priceData);
      }

      return priceData;
    } catch (error) {
      console.error(`❌ Error fetching historical price for ${mint} at ${timestamp}:`, error);
      return null;
    }
  }

  /**
   * Get historical prices for multiple timestamps
   */
  async getHistoricalPricesForTimestamps(
    mint: string,
    timestamps: number[]
  ): Promise<{ prices: TokenPriceData[]; errors: AnalysisError[] }> {
    const prices: TokenPriceData[] = [];
    const errors: AnalysisError[] = [];

    console.log(`📈 Fetching historical prices for ${mint} at ${timestamps.length} timestamps`);

    // Sort timestamps for more efficient API usage
    const sortedTimestamps = [...timestamps].sort((a, b) => a - b);

    for (let i = 0; i < sortedTimestamps.length; i++) {
      const timestamp = sortedTimestamps[i];
      
      try {
        const priceData = await this.getHistoricalPrice(mint, timestamp);
        
        if (priceData) {
          prices.push(priceData);
        } else {
          errors.push({
            type: 'price_api_error',
            message: `Failed to fetch historical price for ${mint} at ${timestamp}`,
            timestamp: Date.now(),
            context: { mint, requestedTimestamp: timestamp }
          });
        }

        // Progress logging
        if (i > 0 && i % 50 === 0) {
          console.log(`📊 Progress: ${i}/${sortedTimestamps.length} historical prices fetched`);
        }

      } catch (error) {
        errors.push({
          type: 'price_api_error',
          message: `Historical price fetch error: ${error}`,
          timestamp: Date.now(),
          context: { mint, requestedTimestamp: timestamp }
        });
      }
    }

    console.log(`✅ Historical price fetch complete: ${prices.length}/${timestamps.length} prices retrieved`);
    return { prices, errors };
  }

  /**
   * Fetch current price from Jupiter API V3
   */
  private async fetchCurrentPriceFromJupiter(mint: string): Promise<TokenPriceData | null> {
    try {
      const url = `${PRICE_API_CONFIG.JUPITER_PRICE_API}/price?ids=${mint}`;
      
      const response = await fetch(url, {
        headers: this.jupiterApiKey ? { 'Authorization': `Bearer ${this.jupiterApiKey}` } : {},
      });

      if (!response.ok) {
        console.warn(`⚠️ Jupiter API error for ${mint}: ${response.status} ${response.statusText}`);
        return null;
      }

      const data = await response.json();
      
      if (data.data && data.data[mint]) {
        const price = data.data[mint];
        return {
          mint,
          symbol: this.getTokenSymbol(mint),
          priceUsd: parseFloat(price.price || '0'),
          timestamp: Date.now(),
          source: 'jupiter',
          confidence: 95 // Jupiter is generally very reliable
        };
      }

      return null;
    } catch (error) {
      console.error(`❌ Jupiter API fetch error for ${mint}:`, error);
      return null;
    }
  }

  /**
   * Fetch current price from CoinGecko API
   */
  private async fetchCurrentPriceFromCoinGecko(mint: string): Promise<TokenPriceData | null> {
    try {
      // Map Solana mint addresses to CoinGecko IDs
      const coingeckoId = this.getMintToCoinGeckoId(mint);
      if (!coingeckoId) {
        return null;
      }

      const url = `${PRICE_API_CONFIG.COINGECKO_API}/simple/price?ids=${coingeckoId}&vs_currencies=usd`;
      
      const headers: Record<string, string> = {};
      if (this.coingeckoApiKey) {
        headers['X-CG-Demo-API-Key'] = this.coingeckoApiKey;
      }

      const response = await fetch(url, { headers });

      if (!response.ok) {
        console.warn(`⚠️ CoinGecko API error for ${mint}: ${response.status} ${response.statusText}`);
        return null;
      }

      const data = await response.json();
      
      if (data[coingeckoId] && data[coingeckoId].usd) {
        return {
          mint,
          symbol: this.getTokenSymbol(mint),
          priceUsd: data[coingeckoId].usd,
          timestamp: Date.now(),
          source: 'coingecko',
          confidence: 90 // CoinGecko is reliable but might be slightly delayed
        };
      }

      return null;
    } catch (error) {
      console.error(`❌ CoinGecko API fetch error for ${mint}:`, error);
      return null;
    }
  }

  /**
   * Fetch historical price from Jupiter API
   */
  private async fetchHistoricalPriceFromJupiter(
    mint: string,
    timestamp: number
  ): Promise<TokenPriceData | null> {
    try {
      // Jupiter API V3 might not have extensive historical data
      // This is a placeholder - actual implementation would depend on Jupiter's historical endpoints
      console.log(`🔍 Jupiter historical price not implemented yet for ${mint} at ${timestamp}`);
      return null;
    } catch (error) {
      console.error(`❌ Jupiter historical API error:`, error);
      return null;
    }
  }

  /**
   * Fetch historical price from CoinGecko API
   */
  private async fetchHistoricalPriceFromCoinGecko(
    mint: string,
    timestamp: number
  ): Promise<TokenPriceData | null> {
    try {
      const coingeckoId = this.getMintToCoinGeckoId(mint);
      if (!coingeckoId) {
        return null;
      }

      // Convert timestamp to date string (CoinGecko format: DD-MM-YYYY)
      const date = new Date(timestamp * 1000);
      const dateStr = `${date.getDate().toString().padStart(2, '0')}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getFullYear()}`;

      const url = `${PRICE_API_CONFIG.COINGECKO_API}/coins/${coingeckoId}/history?date=${dateStr}`;
      
      const headers: Record<string, string> = {};
      if (this.coingeckoApiKey) {
        headers['X-CG-Demo-API-Key'] = this.coingeckoApiKey;
      }

      const response = await fetch(url, { headers });

      if (!response.ok) {
        console.warn(`⚠️ CoinGecko historical API error for ${mint}: ${response.status} ${response.statusText}`);
        return null;
      }

      const data = await response.json();
      
      if (data.market_data && data.market_data.current_price && data.market_data.current_price.usd) {
        return {
          mint,
          symbol: this.getTokenSymbol(mint),
          priceUsd: data.market_data.current_price.usd,
          timestamp: timestamp * 1000, // Convert to milliseconds
          source: 'coingecko',
          confidence: 85 // Historical data might be less precise
        };
      }

      return null;
    } catch (error) {
      console.error(`❌ CoinGecko historical API error:`, error);
      return null;
    }
  }

  /**
   * Map Solana mint addresses to CoinGecko IDs
   */
  private getMintToCoinGeckoId(mint: string): string | null {
    const mapping: Record<string, string> = {
      'So11111111111111111111111111111111111111112': 'solana',
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': 'usd-coin',
      'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': 'tether',
      '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R': 'raydium',
      // Add more mappings as needed
    };

    return mapping[mint] || null;
  }

  /**
   * Get token symbol from mint address
   */
  private getTokenSymbol(mint: string): string {
    const symbolMap: Record<string, string> = {
      'So11111111111111111111111111111111111111112': 'SOL',
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': 'USDC',
      'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': 'USDT',
      '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R': 'RAY',
    };

    return symbolMap[mint] || mint.slice(0, 8);
  }

  /**
   * Rate limiting to avoid API limits
   */
  private async rateLimitDelay(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < PRICE_API_CONFIG.API_RATE_LIMIT_MS) {
      const delay = PRICE_API_CONFIG.API_RATE_LIMIT_MS - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    this.lastRequestTime = Date.now();
  }

  /**
   * Cache current price data
   */
  private cachePrice(mint: string, price: TokenPriceData): void {
    this.priceCache.set(mint, {
      data: price,
      timestamp: Date.now(),
      ttl: PRICE_API_CONFIG.PRICE_CACHE_TTL
    });
  }

  /**
   * Get cached current price if still valid
   */
  private getCachedPrice(mint: string): TokenPriceData | null {
    const cached = this.priceCache.get(mint);
    if (!cached) return null;

    const isExpired = Date.now() - cached.timestamp > cached.ttl;
    if (isExpired) {
      this.priceCache.delete(mint);
      return null;
    }

    return cached.data;
  }

  /**
   * Cache historical price data
   */
  private cacheHistoricalPrice(key: string, price: TokenPriceData): void {
    this.historicalCache.set(key, {
      data: price,
      timestamp: Date.now(),
      ttl: PRICE_API_CONFIG.HISTORICAL_PRICE_CACHE_TTL
    });
  }

  /**
   * Get cached historical price if still valid
   */
  private getCachedHistoricalPrice(key: string): TokenPriceData | null {
    const cached = this.historicalCache.get(key);
    if (!cached) return null;

    const isExpired = Date.now() - cached.timestamp > cached.ttl;
    if (isExpired) {
      this.historicalCache.delete(key);
      return null;
    }

    return cached.data;
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.priceCache.clear();
    this.historicalCache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    currentPriceEntries: number;
    historicalPriceEntries: number;
    totalMemoryUsage: number;
  } {
    return {
      currentPriceEntries: this.priceCache.size,
      historicalPriceEntries: this.historicalCache.size,
      totalMemoryUsage: (this.priceCache.size + this.historicalCache.size) * 1024 // Rough estimate
    };
  }

  /**
   * Validate price data integrity
   */
  validatePriceData(price: TokenPriceData): boolean {
    if (!price.mint || !price.symbol) return false;
    if (price.priceUsd <= 0 || price.priceUsd > 1000000) return false; // Reasonable bounds
    if (price.confidence < 0 || price.confidence > 100) return false;
    return true;
  }

  /**
   * Get price data health metrics
   */
  async getHealthMetrics(): Promise<{
    jupiterStatus: 'ok' | 'error' | 'unknown';
    coingeckoStatus: 'ok' | 'error' | 'unknown';
    cacheHitRate: number;
    avgResponseTime: number;
  }> {
    // Simple health check implementation
    const startTime = Date.now();
    
    try {
      // Test Jupiter API
      const jupiterTest = await this.fetchCurrentPriceFromJupiter('So11111111111111111111111111111111111111112');
      const jupiterStatus = jupiterTest ? 'ok' : 'error';

      // Test CoinGecko API
      const coingeckoTest = await this.fetchCurrentPriceFromCoinGecko('So11111111111111111111111111111111111111112');
      const coingeckoStatus = coingeckoTest ? 'ok' : 'error';

      const avgResponseTime = Date.now() - startTime;

      return {
        jupiterStatus,
        coingeckoStatus,
        cacheHitRate: 0, // Would need to track this over time
        avgResponseTime
      };
    } catch (error) {
      return {
        jupiterStatus: 'unknown',
        coingeckoStatus: 'unknown',
        cacheHitRate: 0,
        avgResponseTime: Date.now() - startTime
      };
    }
  }
}

// Export singleton instance
export const priceDataService = new PriceDataService();