/**
 * Performance Controls Utility
 * Prevents infinite loops while maintaining functionality through smart throttling and caching
 */

interface RequestCache {
  data: unknown;
  timestamp: number;
  ttl: number;
}

interface ThrottleEntry {
  lastCall: number;
  minInterval: number;
}

class PerformanceController {
  private cache = new Map<string, RequestCache>();
  private throttleMap = new Map<string, ThrottleEntry>();
  private activeRequests = new Set<string>();

  // Cache management
  getCachedData(key: string): unknown | null {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      return cached.data;
    }
    this.cache.delete(key);
    return null;
  }

  setCachedData(key: string, data: unknown, ttl = 30000): void {
    this.cache.set(key, { data, timestamp: Date.now(), ttl });
  }

  // Throttling
  isThrottled(key: string, minInterval = 5000): boolean {
    const entry = this.throttleMap.get(key);
    const now = Date.now();
    
    if (!entry) {
      this.throttleMap.set(key, { lastCall: now, minInterval });
      return false;
    }

    if (now - entry.lastCall < entry.minInterval) {
      return true; // Still throttled
    }

    entry.lastCall = now;
    return false;
  }

  // Request deduplication
  isDuplicateRequest(key: string): boolean {
    return this.activeRequests.has(key);
  }

  markRequestStart(key: string): void {
    this.activeRequests.add(key);
  }

  markRequestEnd(key: string): void {
    this.activeRequests.delete(key);
  }

  // Smart API wrapper
  async smartFetch(url: string, options: RequestInit = {}, cacheKey?: string, ttl = 30000): Promise<unknown> {
    const key = cacheKey || url;
    
    // Check cache first
    const cachedData = this.getCachedData(key);
    if (cachedData) {
      console.log(`📋 Using cached data for ${key}`);
      return cachedData;
    }

    // Check if throttled
    if (this.isThrottled(key)) {
      console.log(`⏳ Request throttled: ${key}`);
      return this.getCachedData(key) || null; // Return stale cache if available
    }

    // Check for duplicate requests
    if (this.isDuplicateRequest(key)) {
      console.log(`🔄 Duplicate request blocked: ${key}`);
      return new Promise(resolve => {
        // Wait for the active request to complete
        const checkInterval = setInterval(() => {
          if (!this.isDuplicateRequest(key)) {
            clearInterval(checkInterval);
            resolve(this.getCachedData(key));
          }
        }, 100);
      });
    }

    this.markRequestStart(key);

    try {
      console.log(`🚀 Making API request: ${key}`);
      const response = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(8000), // 8 second timeout
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      this.setCachedData(key, data, ttl);
      return data;
    } catch (error) {
      console.warn(`⚠️ API request failed: ${key}`, error);
      // Return stale cache data if available
      const staleData = this.getCachedData(key + '_stale');
      if (staleData) {
        console.log(`🗄️ Using stale cache for ${key}`);
        return staleData;
      }
      throw error;
    } finally {
      this.markRequestEnd(key);
    }
  }

  // Optimized useEffect dependency tracker
  createStableDeps(deps: unknown[]): string {
    return JSON.stringify(deps.map(dep => typeof dep === 'function' ? dep.name : dep));
  }

  // Clear all caches and throttles (for development)
  reset(): void {
    this.cache.clear();
    this.throttleMap.clear();
    this.activeRequests.clear();
  }
}

// Global instance
export const performanceController = new PerformanceController();

// Hook for components
export function usePerformantAPI() {
  return {
    smartFetch: performanceController.smartFetch.bind(performanceController),
    getCached: performanceController.getCachedData.bind(performanceController),
    setCached: performanceController.setCachedData.bind(performanceController),
    isThrottled: performanceController.isThrottled.bind(performanceController),
  };
}

// Utility for creating stable dependencies
export function useStableDeps(deps: unknown[]): string {
  return performanceController.createStableDeps(deps);
}