/**
 * Fast Database Connection
 * Optimized for high performance with connection pooling and query caching
 */

import { Pool, PoolClient } from 'pg';

let fastPool: Pool | null = null;
let queryCache = new Map<string, { data: any; timestamp: number }>();

const CACHE_TTL = 30000; // 30 seconds
const MAX_CACHE_SIZE = 1000;

function getConnection(): Pool {
  if (!fastPool) {
    const dbUrl = process.env.DATABASE_URL || 
      'postgresql://xorj_prod_user:xorj_prod_2024_secure!@localhost:5435/xorj_production_localhost';
    
    fastPool = new Pool({
      connectionString: dbUrl,
      max: 20, // Maximum number of connections
      min: 5,  // Minimum number of connections
      idleTimeoutMillis: 10000, // Close connections after 10s idle
      connectionTimeoutMillis: 3000, // Fail fast on connection timeout
      acquireTimeoutMillis: 2000, // Fail fast on acquire timeout
      // Performance optimizations
      ssl: false,
      application_name: 'xorj_fast_api',
    });

    fastPool.on('error', (err) => {
      console.error('🚨 Fast database pool error:', err);
    });

    console.log('⚡ Fast database pool initialized');
  }
  
  return fastPool;
}

function getCacheKey(query: string, params: any[]): string {
  return `${query}_${JSON.stringify(params)}`;
}

function getFromCache(key: string): any | null {
  const cached = queryCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  queryCache.delete(key);
  return null;
}

function setCache(key: string, data: any): void {
  // Simple cache size management
  if (queryCache.size >= MAX_CACHE_SIZE) {
    const firstKey = queryCache.keys().next().value;
    queryCache.delete(firstKey);
  }
  
  queryCache.set(key, {
    data,
    timestamp: Date.now()
  });
}

export async function fastQuery<T = any>(
  query: string, 
  params: any[] = [],
  useCache: boolean = true
): Promise<T[]> {
  const startTime = Date.now();
  
  // Check cache first for SELECT queries
  if (useCache && query.trim().toLowerCase().startsWith('select')) {
    const cacheKey = getCacheKey(query, params);
    const cached = getFromCache(cacheKey);
    if (cached) {
      console.log(`⚡ Cache hit: ${Date.now() - startTime}ms`);
      return cached;
    }
  }

  const pool = getConnection();
  let client: PoolClient | null = null;
  
  try {
    client = await pool.connect();
    const result = await client.query(query, params);
    const duration = Date.now() - startTime;
    
    console.log(`⚡ Fast query: ${duration}ms (${result.rows.length} rows)`);
    
    // Cache SELECT results
    if (useCache && query.trim().toLowerCase().startsWith('select') && result.rows.length > 0) {
      const cacheKey = getCacheKey(query, params);
      setCache(cacheKey, result.rows);
    }
    
    return result.rows;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`❌ Fast query error: ${duration}ms -`, error);
    throw error;
  } finally {
    if (client) {
      client.release();
    }
  }
}

export async function fastTransaction<T>(callback: (query: typeof fastQuery) => Promise<T>): Promise<T> {
  const pool = getConnection();
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const txQuery = async <U = any>(query: string, params: any[] = []): Promise<U[]> => {
      const result = await client.query(query, params);
      return result.rows;
    };
    
    const result = await callback(txQuery);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Pre-optimized queries for common operations
export const FAST_QUERIES = {
  getUserTransactions: `
    SELECT 
      id, user_vault_address as "walletAddress", 
      created_at as timestamp, status,
      from_token_address as symbol, amount_in as amount,
      expected_amount_out as "totalValue", gas_fee as fees,
      transaction_signature as "txHash"
    FROM trades 
    WHERE user_vault_address = $1 
    ORDER BY created_at DESC 
    LIMIT $2
  `,
  
  getUserSettings: `
    SELECT wallet_address as "walletAddress", risk_profile as "riskProfile", settings
    FROM user_settings 
    WHERE wallet_address = $1
  `,
  
  getBotState: `
    SELECT 
      user_vault_address as "walletAddress",
      is_enabled as "isBotActive", 
      performance_metrics, last_execution_at
    FROM bot_states 
    WHERE user_vault_address = $1
  `,
  
  getSystemHealth: `
    SELECT 
      COUNT(*) as total_trades,
      COUNT(CASE WHEN status = 'CONFIRMED' THEN 1 END) as successful_trades,
      AVG(gas_fee) as avg_gas_fee
    FROM trades 
    WHERE created_at > NOW() - INTERVAL '24 hours'
  `
} as const;