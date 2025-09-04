/**
 * Redis Connection and Caching Service
 * High-performance read-through caching layer for XORJ
 * Phase 1: Architecting for Concurrency
 */

import { createClient, RedisClientType } from 'redis';

interface CacheConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
  maxRetriesPerRequest?: number;
  retryDelayOnFailover?: number;
  enableReadyCheck?: boolean;
}

interface CacheResult<T> {
  success: boolean;
  data?: T;
  fromCache?: boolean;
  error?: string;
}

class RedisService {
  private client: RedisClientType | null = null;
  private isConnected = false;
  private connectionPromise: Promise<void> | null = null;

  constructor() {
    // Initialize Redis connection asynchronously - don't block application startup
    this.initialize().catch(error => {
      console.error('🚨 Redis initialization failed, continuing without cache:', error);
    });
  }

  private async initialize(): Promise<void> {
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionPromise = this.connect();
    return this.connectionPromise;
  }

  private async connect(): Promise<void> {
    try {
      const config = this.getRedisConfig();
      console.log(`🔄 Attempting to connect to Redis at ${config.host}:${config.port}`);
      
      this.client = createClient({
        socket: {
          host: config.host,
          port: config.port,
          connectTimeout: 3000, // Reduced timeout
          commandTimeout: 2000, // Reduced timeout
        },
        password: config.password,
        database: config.db || 0,
      });

      // Handle connection events
      this.client.on('error', (err) => {
        console.error('🚨 Redis connection error:', err);
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        console.log('🔗 Redis client connected');
      });

      this.client.on('ready', () => {
        console.log('✅ Redis client ready for commands');
        this.isConnected = true;
      });

      this.client.on('end', () => {
        console.log('🔒 Redis connection ended');
        this.isConnected = false;
      });

      // Connect with timeout
      const connectPromise = this.client.connect();
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Connection timeout')), 5000)
      );
      
      await Promise.race([connectPromise, timeoutPromise]);
      
      // Test connection
      await this.client.ping();
      console.log('🎯 Redis connection established successfully');

    } catch (error) {
      console.error('❌ Failed to connect to Redis:', error);
      this.isConnected = false;
      this.client = null;
      // Don't throw - allow application to continue without caching
    } finally {
      // Clear the connection promise so future calls don't wait
      this.connectionPromise = null;
    }
  }

  private getRedisConfig(): CacheConfig {
    // Try Docker/production Redis first
    if (process.env.REDIS_URL) {
      try {
        const url = new URL(process.env.REDIS_URL);
        return {
          host: url.hostname,
          port: parseInt(url.port) || 6379,
          password: url.password || undefined,
          db: parseInt(url.pathname.slice(1)) || 0,
        };
      } catch (error) {
        console.error('❌ Failed to parse REDIS_URL:', error);
      }
    }

    // Fallback to individual environment variables or defaults
    return {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD || undefined,
      db: parseInt(process.env.REDIS_DB || '0'),
    };
  }

  /**
   * Check if Redis is available and connected
   */
  async isAvailable(): Promise<boolean> {
    // Wait for initialization to complete if still in progress
    if (this.connectionPromise) {
      try {
        await this.connectionPromise;
      } catch (error) {
        // Connection failed, continue with unavailable state
      }
    }

    if (!this.client || !this.isConnected) {
      console.log('📊 Redis not available: client not connected');
      return false;
    }

    try {
      // Add timeout to ping command
      const pingPromise = this.client.ping();
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Ping timeout')), 1000)
      );
      
      await Promise.race([pingPromise, timeoutPromise]);
      return true;
    } catch (error) {
      console.error('📊 Redis ping failed:', error);
      this.isConnected = false;
      return false;
    }
  }

  /**
   * Get data from cache
   */
  async get<T>(key: string): Promise<CacheResult<T>> {
    if (!await this.isAvailable()) {
      return { success: false, error: 'Redis not available' };
    }

    try {
      const result = await this.client!.get(key);
      
      if (result === null) {
        return { success: true, data: undefined, fromCache: false };
      }

      const parsedData = JSON.parse(result) as T;
      return { success: true, data: parsedData, fromCache: true };
    } catch (error) {
      console.error(`❌ Redis GET error for key "${key}":`, error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Set data in cache with TTL
   */
  async set(key: string, value: unknown, ttlSeconds: number = 30): Promise<CacheResult<void>> {
    if (!await this.isAvailable()) {
      return { success: false, error: 'Redis not available' };
    }

    try {
      const serializedValue = JSON.stringify(value);
      await this.client!.setEx(key, ttlSeconds, serializedValue);
      
      return { success: true };
    } catch (error) {
      console.error(`❌ Redis SET error for key "${key}":`, error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Delete data from cache
   */
  async delete(key: string): Promise<CacheResult<void>> {
    if (!await this.isAvailable()) {
      return { success: false, error: 'Redis not available' };
    }

    try {
      await this.client!.del(key);
      return { success: true };
    } catch (error) {
      console.error(`❌ Redis DELETE error for key "${key}":`, error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Read-through cache implementation
   * 1. Check Redis for data
   * 2. If cache miss, execute fallback function
   * 3. Store result in Redis with TTL
   * 4. Return data
   */
  async readThrough<T>(
    key: string,
    fallback: () => Promise<T>,
    ttlSeconds: number = 30
  ): Promise<CacheResult<T>> {
    // Step 1: Check Redis
    const cachedResult = await this.get<T>(key);
    
    if (cachedResult.success && cachedResult.data !== undefined) {
      console.log(`🎯 Cache HIT for key: ${key}`);
      return cachedResult;
    }

    // Step 2: Cache miss - execute fallback
    console.log(`💾 Cache MISS for key: ${key} - executing fallback`);
    
    try {
      const fallbackResult = await fallback();
      
      // Step 3: Store in Redis (don't await - fire and forget)
      this.set(key, fallbackResult, ttlSeconds).catch(error => {
        console.error(`⚠️ Failed to cache result for key "${key}":`, error);
      });
      
      // Step 4: Return data
      return { success: true, data: fallbackResult, fromCache: false };
    } catch (error) {
      console.error(`❌ Fallback function failed for key "${key}":`, error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Generate cache keys with consistent format
   */
  generateKey(namespace: string, identifier: string, suffix?: string): string {
    const key = `xorj:${namespace}:${identifier}`;
    return suffix ? `${key}:${suffix}` : key;
  }

  /**
   * Health check for Redis connection
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    latency?: number;
    error?: string;
  }> {
    const start = Date.now();
    
    try {
      if (!await this.isAvailable()) {
        return { healthy: false, error: 'Redis not connected' };
      }

      await this.client!.ping();
      const latency = Date.now() - start;
      
      return { healthy: true, latency };
    } catch (error) {
      return { 
        healthy: false, 
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.isConnected = false;
      console.log('🔒 Redis connection closed');
    }
  }
}

// Ensure singleton pattern in development mode (Next.js hot reload)
const globalForRedis = globalThis as unknown as {
  redisService: RedisService | undefined;
};

// Export singleton instance
export const redisService = globalForRedis.redisService ?? new RedisService();

if (process.env.NODE_ENV !== 'production') {
  globalForRedis.redisService = redisService;
}

// Export utilities for direct use
export const cacheUtils = {
  /**
   * Generate consistent cache keys for user data
   */
  userKey: (userId: string, dataType: string): string => 
    redisService.generateKey('user', userId, dataType),

  /**
   * Generate consistent cache keys for system data
   */
  systemKey: (resource: string, identifier?: string): string => 
    redisService.generateKey('system', resource, identifier),

  /**
   * Common TTL values
   */
  TTL: {
    SHORT: 15,    // 15 seconds - for real-time data
    MEDIUM: 60,   // 1 minute - for user data
    LONG: 300,    // 5 minutes - for reference data
  } as const,
};

export default redisService;