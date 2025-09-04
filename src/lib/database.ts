/**
 * Database Connection and Configuration
 * PostgreSQL connection management for XORJ Bot State Persistence
 * CRITICAL: Implements fail-fast approach - no fallback operations when database unavailable
 */

import { CriticalDatabaseError } from '../types/database';
import { databaseRecovery } from './databaseRecovery';
import { databaseErrorHandler } from './databaseErrorHandler';

// Import PostgreSQL types and classes
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pg = require('pg');
const Pool = pg.Pool;
const PoolClient = pg.PoolClient;
const QueryResult = pg.QueryResult;

// Database configuration interface
interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl?: boolean;
  maxConnections?: number;
}

// Database connection pool
let pool: Pool | null = null;

/**
 * Get database configuration from environment variables
 */
function getDatabaseConfig(): DatabaseConfig {
  // First try to parse DATABASE_URL if available (production environments)
  if (process.env.DATABASE_URL) {
    try {
      const url = new URL(process.env.DATABASE_URL);
      return {
        host: url.hostname,
        port: parseInt(url.port) || 5432,
        database: url.pathname.slice(1), // Remove leading slash
        username: url.username,
        password: url.password,
        ssl: url.searchParams.get('ssl') === 'true' || url.protocol === 'postgres:',
        maxConnections: parseInt(process.env.DATABASE_MAX_CONNECTIONS || '20')
      };
    } catch (error) {
      console.error('❌ Failed to parse DATABASE_URL:', error);
      // Fall back to individual environment variables
    }
  }

  // Fallback to individual environment variables
  const config: DatabaseConfig = {
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '5432'),
    database: process.env.DATABASE_NAME || 'xorj_bot_state',
    username: process.env.DATABASE_USER || 'postgres',
    password: process.env.DATABASE_PASSWORD || '',
    ssl: process.env.DATABASE_SSL === 'true',
    maxConnections: parseInt(process.env.DATABASE_MAX_CONNECTIONS || '20')
  };

  // Validate required configuration
  if (!config.password && process.env.NODE_ENV === 'production') {
    throw new Error('Database password is required in production');
  }

  return config;
}

/**
 * Initialize database connection pool
 */
export function initializeDatabase(): Pool {
  if (pool) {
    return pool;
  }

  // CRITICAL: Fail-fast if database not configured in any production-like environment
  if (process.env.NODE_ENV === 'development' && !process.env.DATABASE_URL && !process.env.DATABASE_HOST) {
    console.log('🔧 Skipping database initialization in development mode - no configuration provided');
    throw new CriticalDatabaseError('Database not configured - system cannot operate without persistence layer', 'DB_UNAVAILABLE');
  }

  const config = getDatabaseConfig();

  try {
    pool = new Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.username,
      password: config.password,
      ssl: config.ssl ? { rejectUnauthorized: false } : false,
      max: config.maxConnections,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });

    // CRITICAL: Database pool errors are system failures - no graceful handling
    pool.on('error', (err) => {
      console.error('🚨 CRITICAL DATABASE POOL ERROR - SYSTEM ENTERING FAIL-SAFE MODE:', err);
      throw new CriticalDatabaseError(`Database pool error: ${err.message}`, 'CONNECTION_FAILED');
    });

    // Handle pool connections
    pool.on('connect', () => {
      console.log('🔗 Database client connected');
    });

    console.log(`🗄️ Database pool initialized: ${config.host}:${config.port}/${config.database}`);
    
    return pool;
  } catch (error) {
    console.error('🚨 CRITICAL: Failed to initialize database pool - SYSTEM CANNOT OPERATE:', error);
    throw new CriticalDatabaseError(
      `Cannot initialize database connection: Unknown error`,
      'CONNECTION_FAILED'
    );
  }
}

/**
 * Get database connection pool
 */
export function getDatabase(): Pool {
  if (!pool) {
    return initializeDatabase();
  }
  return pool;
}

/**
 * Execute a database query with sophisticated error handling
 * CRITICAL: Distinguishes between transient and critical errors
 */
export async function query<T = unknown>(
  text: string,
  params?: unknown[]
): Promise<unknown> {
  // CRITICAL: Fail-fast if database not configured (no feature flag override)
  if (process.env.NODE_ENV === 'development' && !process.env.DATABASE_URL && !process.env.DATABASE_HOST) {
    const error = new CriticalDatabaseError('Database not configured - system cannot operate without persistence layer', 'DB_UNAVAILABLE');
    await databaseRecovery.onDatabaseFailure(error);
    throw error;
  }

  // Check if system is in recovery mode
  if (!databaseRecovery.canAttemptDatabaseOperation()) {
    const recoveryStatus = databaseRecovery.getRecoveryStatus();
    throw new CriticalDatabaseError(
      `Database operations suspended - recovery in progress (retry in ${Math.round(recoveryStatus.timeUntilRetry / 1000)}s)`,
      'DB_UNAVAILABLE'
    );
  }

  // Execute with sophisticated retry logic
  return databaseErrorHandler.executeWithRetry(async () => {
    let db;
    try {
      db = getDatabase();
    } catch (error) {
      const criticalError = new CriticalDatabaseError(
        `Cannot get database connection: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'CONNECTION_FAILED'
      );
      await databaseRecovery.onDatabaseFailure(criticalError);
      throw criticalError;
    }

    const start = Date.now();
    
    try {
      const result = await db.query<T>(text, params);
      const duration = Date.now() - start;
      
      console.log('🔍 Database query executed', {
        duration: `${duration}ms`,
        rows: result.rowCount,
        command: text.split(' ')[0].toUpperCase()
      });
      
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      console.error('❌ Database query error (will be analyzed for retry/critical)', {
        duration: `${duration}ms`,
        sqlstate: error instanceof Error ? (error as Error & { code?: string }).code : 'unknown',
        command: text.split(' ')[0].toUpperCase(),
        timestamp: new Date().toISOString()
      });
      
      // Let error handler analyze and decide retry vs critical
      throw error;
    }
  }, `query_${text.split(' ')[0].toLowerCase()}_${Date.now()}`);
}

/**
 * Execute a transaction with sophisticated error handling and automatic rollback
 * CRITICAL: Distinguishes between transient and critical transaction failures
 */
export async function transaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  // CRITICAL: Fail-fast if database not configured (no feature flag override)
  if (process.env.NODE_ENV === 'development' && !process.env.DATABASE_URL && !process.env.DATABASE_HOST) {
    const error = new CriticalDatabaseError('Database not configured - system cannot operate without persistence layer', 'DB_UNAVAILABLE');
    await databaseRecovery.onDatabaseFailure(error);
    throw error;
  }

  // Check if system is in recovery mode
  if (!databaseRecovery.canAttemptDatabaseOperation()) {
    const recoveryStatus = databaseRecovery.getRecoveryStatus();
    throw new CriticalDatabaseError(
      `Transaction operations suspended - recovery in progress (retry in ${Math.round(recoveryStatus.timeUntilRetry / 1000)}s)`,
      'DB_UNAVAILABLE'
    );
  }

  // Execute transaction with sophisticated retry logic
  return databaseErrorHandler.executeWithRetry(async () => {
    let db;
    try {
      db = getDatabase();
    } catch (error) {
      const criticalError = new CriticalDatabaseError(
        `Cannot get database connection for transaction: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'CONNECTION_FAILED'
      );
      await databaseRecovery.onDatabaseFailure(criticalError);
      throw criticalError;
    }

    let client;
    try {
      client = await db.connect();
    } catch (error) {
      // Connection acquisition failure is critical
      throw error; // Will be handled by executeWithRetry
    }
    
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      console.log('✅ Database transaction committed');
      return result;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
        console.error('🔄 Database transaction rolled back due to error');
      } catch (rollbackError) {
        console.error('🚨 CRITICAL: Failed to rollback transaction - DATABASE INTEGRITY AT RISK');
        const criticalError = new CriticalDatabaseError(
          `Transaction rollback failed: ${rollbackError instanceof Error ? rollbackError.message : 'Unknown rollback error'}`,
          'TRANSACTION_FAILED'
        );
        await databaseRecovery.onDatabaseFailure(criticalError);
        throw criticalError;
      }
      
      // Let error handler analyze the transaction error
      throw error;
    } finally {
      if (client) {
        client.release();
      }
    }
  }, `transaction_${Date.now()}`);
}

/**
 * Health check for database connection
 */
export async function healthCheck(): Promise<{
  healthy: boolean;
  latency?: number;
  error?: string;
}> {
  const start = Date.now();
  
  try {
    await query('SELECT 1 as health_check');
    const latency = Date.now() - start;
    
    return {
      healthy: true,
      latency
    };
  } catch (error) {
    return {
      healthy: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Close database connection pool
 */
export async function closeDatabase(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    console.log('🔒 Database pool closed');
  }
}

/**
 * Database utility functions
 */
export const dbUtils = {
  /**
   * Generate a UUID v4
   */
  generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  },

  /**
   * Convert JavaScript Date to PostgreSQL timestamp
   */
  toTimestamp(date: Date): string {
    return date.toISOString();
  },

  /**
   * Convert PostgreSQL timestamp to JavaScript Date
   */
  fromTimestamp(timestamp: string): Date {
    return new Date(timestamp);
  }
};

// Types for better TypeScript support
export type DatabaseClient = unknown;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export type DatabaseResult<T = unknown> = unknown;

// Export the main database interface
const database = {
  query,
  transaction,
  healthCheck,
  close: closeDatabase,
  utils: dbUtils
};

export default database;