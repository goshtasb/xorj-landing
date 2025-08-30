/**
 * High-Level Caching Layer Utilities
 * Implements read-through caching patterns for XORJ API endpoints
 * Phase 1: Architecting for Concurrency - Fixing Latency Issues
 */

import { redisService, cacheUtils } from './redis';
import { query } from './database';

// Type definition for database query results
interface QueryResult<T = unknown> {
  rows: T[];
  rowCount: number | null;
}

// Types for caching operations
interface CachedResponse<T> {
  success: boolean;
  data?: T;
  fromCache?: boolean;
  cacheKey?: string;
  error?: string;
}

/**
 * Read-Through Cache Implementation for User Data
 * Logic: Check Redis → Cache Miss → Query Database → Store in Redis → Return
 */
export class CacheLayer {
  
  /**
   * Cache user performance data
   * Key: user:{walletAddress}:performance
   * TTL: 30 seconds (real-time performance data)
   */
  async getUserPerformance(walletAddress: string): Promise<CachedResponse<unknown>> {
    const cacheKey = cacheUtils.userKey(walletAddress, 'performance');
    
    return await redisService.readThrough(
      cacheKey,
      async () => {
        // Fallback: Query database directly
        console.log(`🗄️ Database fallback for user performance: ${walletAddress}`);
        
        const result = await query(`
          SELECT 
            total_trades,
            win_rate,
            total_pnl,
            best_trade,
            worst_trade,
            avg_trade_size,
            last_trade_timestamp
          FROM user_performance 
          WHERE wallet_address = $1
        `, [walletAddress]);
        
        return result.rows[0] || {
          total_trades: 0,
          win_rate: 0,
          total_pnl: 0,
          best_trade: 0,
          worst_trade: 0,
          avg_trade_size: 0,
          last_trade_timestamp: null
        };
      },
      cacheUtils.TTL.SHORT // 15 seconds
    );
  }

  /**
   * Cache user transaction history
   * Key: user:{walletAddress}:transactions:{page}:{limit}
   * TTL: 60 seconds (transaction data changes less frequently)
   */
  async getUserTransactions(
    walletAddress: string, 
    page: number = 1, 
    limit: number = 20
  ): Promise<CachedResponse<unknown>> {
    const cacheKey = cacheUtils.userKey(walletAddress, `transactions:${page}:${limit}`);
    
    return await redisService.readThrough(
      cacheKey,
      async () => {
        // Fallback: Query database directly
        console.log(`🗄️ Database fallback for user transactions: ${walletAddress}, page: ${page}`);
        
        const offset = (page - 1) * limit;
        
        // Get total count
        const countResult = await query(`
          SELECT COUNT(*) as total 
          FROM trades 
          WHERE user_vault_address = $1
        `, [walletAddress]);
        
        // Get paginated transactions
        const transactionsResult = await query(`
          SELECT 
            id,
            from_token_address,
            to_token_address,
            amount_in,
            expected_amount_out,
            actual_amount_out,
            gas_fee,
            transaction_signature,
            status,
            created_at
          FROM trades 
          WHERE user_vault_address = $1 
          ORDER BY created_at DESC 
          LIMIT $2 OFFSET $3
        `, [walletAddress, limit, offset]);
        
        const totalCount = parseInt(countResult.rows[0]?.total || '0');
        const pageCount = Math.ceil(totalCount / limit);
        
        return {
          transactions: transactionsResult.rows,
          totalCount,
          pageCount,
          currentPage: page
        };
      },
      cacheUtils.TTL.MEDIUM // 60 seconds
    );
  }

  /**
   * Cache user settings
   * Key: user:{walletAddress}:settings
   * TTL: 300 seconds (settings change infrequently)
   */
  async getUserSettings(walletAddress: string): Promise<CachedResponse<unknown>> {
    const cacheKey = cacheUtils.userKey(walletAddress, 'settings');
    
    return await redisService.readThrough(
      cacheKey,
      async () => {
        // Fallback: Query database directly
        console.log(`🗄️ Database fallback for user settings: ${walletAddress}`);
        
        const result = await query(`
          SELECT 
            risk_profile,
            settings,
            updated_at
          FROM user_settings 
          WHERE wallet_address = $1
        `, [walletAddress]);
        
        const userSettings = result.rows[0];
        if (userSettings) {
          // Extract settings from JSONB and combine with risk_profile
          const settings = userSettings.settings || {};
          return {
            trading_enabled: settings.trading_enabled || true,
            risk_level: userSettings.risk_profile?.toLowerCase() || 'balanced',
            max_trade_size: settings.max_trade_size || 0.1,
            stop_loss_percentage: settings.stop_loss_percentage || 5,
            take_profit_percentage: settings.take_profit_percentage || 10,
            notification_preferences: settings.notification_preferences || {},
            updated_at: userSettings.updated_at
          };
        }
        
        // No database data - check UserSettingsService for database persistence
        try {
          const { UserSettingsService } = await import('./userSettingsService');
          const dbSettings = await UserSettingsService.getUserSettings(walletAddress);
          
          if (dbSettings) {
            console.log(`📦 Using persistent storage for settings: ${walletAddress} riskProfile=${dbSettings.riskProfile}`);
            return {
              success: true,
              data: {
                trading_enabled: true,
                risk_level: dbSettings.riskProfile.toLowerCase(),
                max_trade_size: 0.1,
                stop_loss_percentage: 5,
                take_profit_percentage: 10,
                notification_preferences: {},
                investment_amount: dbSettings.investmentAmount || 1000,
                updated_at: dbSettings.lastUpdated
              },
              fromCache: false
            };
          }
        } catch (error) {
          console.warn(`⚠️ Failed to check persistent storage for ${walletAddress}:`, error);
        }
        
        // Final fallback to defaults
        console.log(`🔄 No user data found, returning defaults for: ${walletAddress}`);
        return {
          trading_enabled: true,
          risk_level: 'balanced',
          max_trade_size: 0.1,
          stop_loss_percentage: 5,
          take_profit_percentage: 10,
          notification_preferences: {},
          updated_at: new Date()
        };
      },
      cacheUtils.TTL.LONG // 300 seconds
    );
  }

  /**
   * Cache bot trades data
   * Key: user:{walletAddress}:bot_trades:{status}
   * TTL: 15 seconds (bot data is real-time)
   */
  async getBotTrades(walletAddress: string, status?: string): Promise<CachedResponse<unknown>> {
    const statusSuffix = status ? `:${status}` : '';
    const cacheKey = cacheUtils.userKey(walletAddress, `bot_trades${statusSuffix}`);
    
    return await redisService.readThrough(
      cacheKey,
      async () => {
        // Fallback: Query database directly
        console.log(`🗄️ Database fallback for bot trades: ${walletAddress}, status: ${status || 'all'}`);
        
        let query_text = `
          SELECT 
            id,
            from_token_address,
            to_token_address,
            amount_in,
            expected_amount_out,
            actual_amount_out,
            gas_fee,
            transaction_signature,
            status,
            created_at,
            updated_at
          FROM trades 
          WHERE user_vault_address = $1
        `;
        
        const queryParams: (string | number)[] = [walletAddress];
        
        if (status) {
          query_text += ` AND status = $2`;
          queryParams.push(status);
        }
        
        query_text += ` ORDER BY created_at DESC LIMIT 100`;
        
        const result = await query(query_text, queryParams);
        
        return {
          trades: result.rows,
          count: result.rows.length,
          status: status || 'all'
        };
      },
      cacheUtils.TTL.SHORT // 15 seconds
    );
  }

  /**
   * Cache system status data
   * Key: system:status
   * TTL: 30 seconds
   */
  async getSystemStatus(): Promise<CachedResponse<unknown>> {
    const cacheKey = cacheUtils.systemKey('status');
    
    return await redisService.readThrough(
      cacheKey,
      async () => {
        // Fallback: Query database for system health
        console.log(`🗄️ Database fallback for system status`);
        
        // Check database health
        const dbHealthResult = await query('SELECT 1 as health_check');
        const dbHealthy = dbHealthResult.rows.length > 0;
        
        // Get recent activity metrics
        const recentTradesResult = await query(`
          SELECT COUNT(*) as recent_trades 
          FROM trades 
          WHERE created_at > NOW() - INTERVAL '1 hour'
        `);
        
        const activeUsersResult = await query(`
          SELECT COUNT(DISTINCT user_vault_address) as active_users 
          FROM trades 
          WHERE created_at > NOW() - INTERVAL '24 hours'
        `);
        
        return {
          database: { healthy: dbHealthy },
          recent_trades: parseInt(recentTradesResult.rows[0]?.recent_trades || '0'),
          active_users: parseInt(activeUsersResult.rows[0]?.active_users || '0'),
          timestamp: new Date().toISOString()
        };
      },
      cacheUtils.TTL.SHORT // 15 seconds
    );
  }

  /**
   * Invalidate user cache when data changes
   * Call this after any write operations affecting user data
   */
  async invalidateUserCache(walletAddress: string, dataType?: string): Promise<void> {
    try {
      if (dataType) {
        // Special handling for paginated transactions cache
        if (dataType === 'transactions') {
          // Invalidate all paginated transaction caches
          for (let page = 1; page <= 10; page++) {
            for (const limit of [3, 5, 10, 20, 50]) {
              const cacheKey = cacheUtils.userKey(walletAddress, `transactions:${page}:${limit}`);
              await redisService.delete(cacheKey);
            }
          }
          console.log(`🗑️ Invalidated all paginated transaction cache for user ${walletAddress}`);
        } else {
          // Invalidate specific data type
          const cacheKey = cacheUtils.userKey(walletAddress, dataType);
          await redisService.delete(cacheKey);
          console.log(`🗑️ Invalidated cache for user ${walletAddress}:${dataType}`);
        }
      } else {
        // Invalidate all user data (pattern-based deletion would be ideal, but not implemented yet)
        const dataTypes = ['performance', 'settings', 'bot_trades'];
        for (const type of dataTypes) {
          const cacheKey = cacheUtils.userKey(walletAddress, type);
          await redisService.delete(cacheKey);
        }
        
        // Also invalidate paginated transaction caches (approximation)
        for (let page = 1; page <= 10; page++) {
          for (const limit of [10, 20, 50]) {
            const cacheKey = cacheUtils.userKey(walletAddress, `transactions:${page}:${limit}`);
            await redisService.delete(cacheKey);
          }
        }
        
        console.log(`🗑️ Invalidated all cache for user ${walletAddress}`);
      }
    } catch (error) {
      console.error(`❌ Failed to invalidate cache for user ${walletAddress}:`, error);
      // Don't throw - cache invalidation failure should not break the application
    }
  }

  /**
   * Invalidate system cache
   */
  async invalidateSystemCache(resource?: string): Promise<void> {
    try {
      const cacheKey = cacheUtils.systemKey(resource || 'status');
      await redisService.delete(cacheKey);
      console.log(`🗑️ Invalidated system cache: ${resource || 'status'}`);
    } catch (error) {
      console.error(`❌ Failed to invalidate system cache:`, error);
      // Don't throw - cache invalidation failure should not break the application
    }
  }

  /**
   * Get cache statistics for monitoring
   */
  async getCacheStats(): Promise<{
    redis_healthy: boolean;
    cache_hits?: number;
    cache_misses?: number;
    error?: string;
  }> {
    try {
      const healthCheck = await redisService.healthCheck();
      
      if (!healthCheck.healthy) {
        return {
          redis_healthy: false,
          error: healthCheck.error
        };
      }

      // Basic stats - in production, you'd track hits/misses more sophisticated
      return {
        redis_healthy: true,
        cache_hits: 0, // Would need to implement hit/miss tracking
        cache_misses: 0
      };
    } catch (error) {
      return {
        redis_healthy: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

// Export singleton instance
export const cacheLayer = new CacheLayer();

// Export convenience functions for common caching patterns
export const cachedData = {
  /**
   * Wrapper for caching any async function result
   */
  async withCache<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttlSeconds: number = cacheUtils.TTL.MEDIUM
  ): Promise<CachedResponse<T>> {
    return await redisService.readThrough(key, fetcher, ttlSeconds);
  },

  /**
   * Quick cache check without fallback
   */
  async getOnly<T>(key: string): Promise<T | null> {
    const result = await redisService.get<T>(key);
    return result.success && result.data !== undefined ? result.data : null;
  },

  /**
   * Force refresh - delete cache and execute fetcher
   */
  async forceRefresh<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttlSeconds: number = cacheUtils.TTL.MEDIUM
  ): Promise<CachedResponse<T>> {
    await redisService.delete(key);
    return await redisService.readThrough(key, fetcher, ttlSeconds);
  }
};

export default cacheLayer;