/**
 * Simple in-memory rate limiter for API endpoints
 * Production should use Redis-based rate limiting
 */

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

class InMemoryRateLimit {
  private store = new Map<string, RateLimitEntry>();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Clean up expired entries every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000);
  }

  private cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.resetTime) {
        this.store.delete(key);
      }
    }
  }

  private getKey(identifier: string, endpoint: string): string {
    return `${identifier}:${endpoint}`;
  }

  check(identifier: string, endpoint: string, limit: number, windowMs: number): {
    success: boolean;
    remaining: number;
    resetTime: number;
  } {
    const key = this.getKey(identifier, endpoint);
    const now = Date.now();
    const resetTime = now + windowMs;

    let entry = this.store.get(key);

    // Create new entry or reset if expired
    if (!entry || now > entry.resetTime) {
      entry = {
        count: 1,
        resetTime
      };
      this.store.set(key, entry);
      return {
        success: true,
        remaining: limit - 1,
        resetTime
      };
    }

    // Check if limit exceeded
    if (entry.count >= limit) {
      return {
        success: false,
        remaining: 0,
        resetTime: entry.resetTime
      };
    }

    // Increment counter
    entry.count++;
    this.store.set(key, entry);

    return {
      success: true,
      remaining: limit - entry.count,
      resetTime: entry.resetTime
    };
  }

  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.store.clear();
  }
}

// Singleton instance
export const rateLimiter = new InMemoryRateLimit();

/**
 * Rate limit configuration for different endpoints
 */
export const RATE_LIMITS = {
  AUTH: {
    limit: 5, // 5 attempts
    windowMs: 15 * 60 * 1000 // per 15 minutes
  },
  API: {
    limit: 100, // 100 requests  
    windowMs: 60 * 1000 // per minute
  },
  BOT: {
    limit: 30, // 30 requests
    windowMs: 60 * 1000 // per minute
  }
} as const;

/**
 * Get client identifier from request (IP address + User-Agent hash)
 */
export function getClientIdentifier(request: Request): string {
  // In production, use actual IP from headers
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0] : 'unknown';
  const userAgent = request.headers.get('user-agent') || 'unknown';
  
  // Simple hash for user agent to avoid storing full UA strings
  const uaHash = userAgent.split('').reduce((hash, char) => {
    return ((hash << 5) - hash) + char.charCodeAt(0);
  }, 0).toString();
  
  return `${ip}-${uaHash}`;
}

/**
 * Create rate limit error response
 */
export function createRateLimitResponse(resetTime: number) {
  const retryAfter = Math.ceil((resetTime - Date.now()) / 1000);
  
  return new Response(JSON.stringify({
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests',
      details: `Rate limit exceeded. Try again in ${retryAfter} seconds.`
    }
  }), {
    status: 429,
    headers: {
      'Content-Type': 'application/json',
      'Retry-After': retryAfter.toString(),
      'X-RateLimit-Reset': Math.floor(resetTime / 1000).toString()
    }
  });
}