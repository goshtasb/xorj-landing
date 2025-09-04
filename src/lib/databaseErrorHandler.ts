/**
 * Nuanced Database Error Handler - Critical Flaw #2 Fix
 * Distinguishes between transient errors (retry) and critical failures (fail-fast)
 * Prevents system shutdown from recoverable database errors
 */

import { CriticalDatabaseError } from '../types/database';

// Database error types
interface DatabaseError extends Error {
  code?: string;
  sqlstate?: string;
  detail?: string;
  hint?: string;
  position?: string;
  internalPosition?: string;
  internalQuery?: string;
  where?: string;
  schema?: string;
  table?: string;
  column?: string;
  dataType?: string;
  constraint?: string;
}

interface ExtendedError extends Error {
  originalError?: DatabaseError;
  errorClassification?: string;
}

interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterMs: number;
}

interface TransientErrorConfig {
  sqlstateCode: string;
  name: string;
  description: string;
  retryConfig: RetryConfig;
}

/**
 * PostgreSQL Error Classification
 * Based on official PostgreSQL documentation and production experience
 */
const TRANSIENT_ERRORS: TransientErrorConfig[] = [
  {
    sqlstateCode: '40P01',
    name: 'Deadlock',
    description: 'Deadlock detected - transaction was chosen as victim',
    retryConfig: { maxRetries: 3, baseDelayMs: 100, maxDelayMs: 1000, jitterMs: 100 }
  },
  {
    sqlstateCode: '40001',
    name: 'Serialization Failure',
    description: 'Could not serialize access due to concurrent update',
    retryConfig: { maxRetries: 5, baseDelayMs: 50, maxDelayMs: 500, jitterMs: 50 }
  },
  {
    sqlstateCode: '53200',
    name: 'Out of Memory',
    description: 'Database server temporary memory shortage',
    retryConfig: { maxRetries: 2, baseDelayMs: 1000, maxDelayMs: 5000, jitterMs: 500 }
  },
  {
    sqlstateCode: '53300',
    name: 'Too Many Connections',
    description: 'Connection limit reached, retry after brief delay',
    retryConfig: { maxRetries: 3, baseDelayMs: 2000, maxDelayMs: 10000, jitterMs: 1000 }
  },
  {
    sqlstateCode: '57P03',
    name: 'Cannot Connect Now',
    description: 'Database is starting up or in recovery',
    retryConfig: { maxRetries: 5, baseDelayMs: 5000, maxDelayMs: 30000, jitterMs: 2000 }
  }
];

/**
 * Critical errors that should trigger immediate system fail-fast
 */
const CRITICAL_ERRORS = [
  '08000', // Connection exception
  '08003', // Connection does not exist
  '08006', // Connection failure
  '08001', // Unable to connect to server
  '08004', // Server rejected connection
  '28000', // Invalid authorization specification
  '28P01', // Invalid password
  '3D000', // Invalid catalog name (database doesn't exist)
  '42P04', // Database does not exist
];

export class DatabaseErrorHandler {
  private static instance: DatabaseErrorHandler;
  private retryAttempts = new Map<string, number>();

  private constructor() {}

  public static getInstance(): DatabaseErrorHandler {
    if (!DatabaseErrorHandler.instance) {
      DatabaseErrorHandler.instance = new DatabaseErrorHandler();
    }
    return DatabaseErrorHandler.instance;
  }

  /**
   * Analyze database error and determine appropriate response
   * Returns: 'retry' | 'critical' | 'unknown'
   */
  public async handleDatabaseError(error: DatabaseError, operationId?: string): Promise<{
    action: 'retry' | 'critical' | 'unknown';
    retryAfterMs?: number;
    shouldThrow?: boolean;
    errorInfo?: {
      classification: string;
      sqlstate: string;
      retryAttempt?: number;
      maxRetries?: number;
    };
  }> {
    const sqlstate = error.code;
    const operation = operationId || `op_${Date.now()}`;
    
    // Log the error for debugging
    console.error('🔍 Database error analysis:', {
      sqlstate,
      message: error.message,
      operation,
      timestamp: new Date().toISOString()
    });

    // Check for critical errors that require immediate fail-fast
    if (CRITICAL_ERRORS.includes(sqlstate)) {
      console.error('🚨 CRITICAL DATABASE ERROR detected - triggering fail-fast:', {
        sqlstate,
        message: error.message,
        operation
      });
      
      return {
        action: 'critical',
        shouldThrow: true,
        errorInfo: {
          classification: 'critical_connection_failure',
          sqlstate
        }
      };
    }

    // Check for transient errors that can be retried
    const transientError = TRANSIENT_ERRORS.find(te => te.sqlstateCode === sqlstate);
    if (transientError) {
      const retryAttempt = (this.retryAttempts.get(operation) || 0) + 1;
      this.retryAttempts.set(operation, retryAttempt);

      if (retryAttempt <= transientError.retryConfig.maxRetries) {
        // Calculate retry delay with exponential backoff + jitter
        const baseDelay = Math.min(
          transientError.retryConfig.baseDelayMs * Math.pow(2, retryAttempt - 1),
          transientError.retryConfig.maxDelayMs
        );
        const jitter = Math.random() * transientError.retryConfig.jitterMs;
        const retryAfterMs = baseDelay + jitter;

        console.warn(`⚠️ Transient database error - will retry: ${transientError.name}`, {
          sqlstate,
          retryAttempt,
          maxRetries: transientError.retryConfig.maxRetries,
          retryAfterMs: Math.round(retryAfterMs),
          operation
        });

        return {
          action: 'retry',
          retryAfterMs,
          shouldThrow: false,
          errorInfo: {
            classification: transientError.name.toLowerCase().replace(/\s+/g, '_'),
            sqlstate,
            retryAttempt,
            maxRetries: transientError.retryConfig.maxRetries
          }
        };
      } else {
        // Exceeded max retries for transient error - escalate to critical
        console.error(`🚨 Transient error exceeded max retries - escalating to critical: ${transientError.name}`, {
          sqlstate,
          retryAttempt,
          maxRetries: transientError.retryConfig.maxRetries,
          operation
        });

        // Clean up retry tracking
        this.retryAttempts.delete(operation);

        return {
          action: 'critical',
          shouldThrow: true,
          errorInfo: {
            classification: 'transient_error_escalated',
            sqlstate,
            retryAttempt,
            maxRetries: transientError.retryConfig.maxRetries
          }
        };
      }
    }

    // Check for business logic constraint violations that should be handled by services
    if (sqlstate === '23505') { // unique_violation
      console.log('🔄 Constraint violation - passing to service for handling:', {
        sqlstate,
        constraint: (error as Error & { constraint?: string }).constraint,
        operation
      });
      
      return {
        action: 'passthrough',
        shouldThrow: false,
        errorInfo: {
          classification: 'constraint_violation',
          sqlstate
        }
      };
    }

    if (sqlstate === '23503') { // foreign_key_violation
      console.log('🔄 Foreign key violation - passing to service for handling:', {
        sqlstate,
        constraint: (error as Error & { constraint?: string }).constraint,
        operation
      });
      
      return {
        action: 'passthrough',
        shouldThrow: false,
        errorInfo: {
          classification: 'foreign_key_violation',
          sqlstate
        }
      };
    }

    // Unknown error - treat as critical for safety
    console.error('❓ Unknown database error - treating as critical for safety:', {
      sqlstate,
      message: error.message,
      operation
    });

    return {
      action: 'critical',
      shouldThrow: true,
      errorInfo: {
        classification: 'unknown_error',
        sqlstate
      }
    };
  }

  /**
   * Execute database operation with automatic retry for transient errors
   */
  public async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationId?: string
  ): Promise<T> {
    const opId = operationId || `retry_op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    while (true) {
      try {
        const result = await operation();
        
        // Success - clean up any retry tracking
        this.retryAttempts.delete(opId);
        return result;
        
      } catch (error) {
        const errorResponse = await this.handleDatabaseError(error, opId);
        
        if (errorResponse.action === 'critical') {
          // Critical error - throw CriticalDatabaseError to trigger fail-fast
          const criticalError = new CriticalDatabaseError(
            `Critical database failure: ${error.message}`,
            this.mapSqlstateToCriticalCode(error.code)
          );
          
          // Add additional context
          (criticalError as ExtendedError).originalError = error;
          (criticalError as ExtendedError).errorClassification = errorResponse.errorInfo?.classification;
          
          throw criticalError;
        }
        
        if (errorResponse.action === 'retry' && errorResponse.retryAfterMs) {
          // Transient error - wait and retry
          console.log(`⏳ Waiting ${errorResponse.retryAfterMs}ms before retry...`);
          await this.delay(errorResponse.retryAfterMs);
          continue; // Retry the operation
        }

        if (errorResponse.action === 'passthrough') {
          // Business logic error - pass through to service for handling
          throw error;
        }
        
        // Unknown error - re-throw as-is for now
        throw error;
      }
    }
  }

  /**
   * Clear retry tracking for an operation (useful for cleanup)
   */
  public clearRetryTracking(operationId: string): void {
    this.retryAttempts.delete(operationId);
  }

  /**
   * Get current retry statistics for monitoring
   */
  public getRetryStatistics(): {
    activeOperations: number;
    operationRetries: Array<{ operationId: string; retryCount: number }>;
  } {
    return {
      activeOperations: this.retryAttempts.size,
      operationRetries: Array.from(this.retryAttempts.entries()).map(([operationId, retryCount]) => ({
        operationId,
        retryCount
      }))
    };
  }

  /**
   * Map SQLSTATE codes to CriticalDatabaseError codes
   */
  private mapSqlstateToCriticalCode(sqlstate: string): 'DB_UNAVAILABLE' | 'CONNECTION_FAILED' | 'TRANSACTION_FAILED' {
    const connectionErrors = ['08000', '08003', '08006', '08001', '08004'];
    const authErrors = ['28000', '28P01'];
    const dbErrors = ['3D000', '42P04'];
    
    if (connectionErrors.includes(sqlstate)) {
      return 'CONNECTION_FAILED';
    }
    
    if (authErrors.includes(sqlstate) || dbErrors.includes(sqlstate)) {
      return 'DB_UNAVAILABLE';
    }
    
    return 'TRANSACTION_FAILED';
  }

  /**
   * Promise-based delay utility
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export singleton instance
export const databaseErrorHandler = DatabaseErrorHandler.getInstance();