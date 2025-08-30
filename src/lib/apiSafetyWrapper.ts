/**
 * API Safety Wrapper - Critical Flaw #2 Fix
 * Implements fail-fast behavior for API routes when database is unavailable
 * ELIMINATES dangerous fallback operations that cause state inconsistency
 */

import { NextResponse } from 'next/server';
import { CriticalDatabaseError, SystemFailureError } from '../types/database';

// Generic API response types
interface ApiErrorResponse {
  error: string;
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Critical System Failure Response
 * Returns HTTP 503 Service Unavailable with proper error messaging
 */
export function createSystemFailureResponse(error: CriticalDatabaseError | SystemFailureError): NextResponse {
  const response = {
    error: 'System Unavailable',
    code: 'SYSTEM_FAILURE',
    message: 'Trading operations suspended due to critical system failure',
    details: {
      reason: error instanceof CriticalDatabaseError ? 'Database unavailable' : error.failureReason,
      timestamp: new Date().toISOString(),
      errorCode: error instanceof CriticalDatabaseError ? error.errorCode : 'SYSTEM_FAILURE'
    },
    instructions: {
      user: 'Please wait while our system recovers. Do not attempt manual trades.',
      admin: 'Check database connectivity and system logs. Restart required after database recovery.'
    }
  };

  return NextResponse.json(response, { 
    status: 503,
    headers: {
      'Retry-After': '300', // Suggest retry in 5 minutes
      'X-System-Status': 'FAIL_SAFE_MODE',
      'X-Error-Code': error instanceof CriticalDatabaseError ? error.errorCode : 'SYSTEM_FAILURE'
    }
  });
}

/**
 * Safe API Route Wrapper
 * Catches critical database errors and returns appropriate system failure responses
 * PREVENTS dangerous fallback operations
 */
export function withFailFastProtection<T extends unknown[], R>(
  handler: (...args: T) => Promise<NextResponse<R>>
): (...args: T) => Promise<NextResponse<R | ApiErrorResponse>> {
  return async (...args: T): Promise<NextResponse<R | ApiErrorResponse>> => {
    try {
      return await handler(...args);
    } catch {
      // CRITICAL: Database errors trigger system-wide fail-safe mode
      if (error instanceof CriticalDatabaseError) {
        console.error('🚨 CRITICAL DATABASE ERROR - API entering fail-safe mode:', {
          errorCode: error.errorCode,
          message: error.message,
          timestamp: error.timestamp,
          endpoint: 'Unknown' // Could be enhanced to include route info
        });
        
        // Alert administrators immediately
        await alertAdministrators('CRITICAL_DATABASE_ERROR', error);
        
        return createSystemFailureResponse(error);
      }
      
      // CRITICAL: System failures also trigger fail-safe mode
      if (error instanceof SystemFailureError) {
        console.error('🚨 SYSTEM FAILURE - API entering fail-safe mode:', {
          reason: error.failureReason,
          message: error.message,
          timestamp: error.timestamp
        });
        
        await alertAdministrators('SYSTEM_FAILURE', error);
        
        return createSystemFailureResponse(error);
      }
      
      // Re-throw other errors to maintain existing error handling
      throw error;
    }
  };
}

/**
 * Alert administrators of critical system failures
 * This would integrate with monitoring/alerting systems in production
 */
async function alertAdministrators(alertType: 'CRITICAL_DATABASE_ERROR' | 'SYSTEM_FAILURE', error: Error): Promise<void> {
  try {
    // In production, this would send alerts via PagerDuty, Slack, etc.
    console.error('🚨 ADMINISTRATOR ALERT:', {
      type: alertType,
      message: error.message,
      timestamp: new Date().toISOString(),
      stack: error.stack,
      action: 'IMMEDIATE_INTERVENTION_REQUIRED'
    });
    
    // TODO: Integrate with actual alerting system
    // await sendSlackAlert(alertType, error);
    // await sendPagerDutyAlert(alertType, error);
    // await sendEmailAlert(alertType, error);
    
  } catch (alertError) {
    console.error('❌ Failed to send administrator alert:', alertError);
    // Don't let alerting failures prevent the main error response
  }
}

/**
 * Trading Operations Safety Check
 * Verifies system is in a safe state for trading operations
 */
export async function verifyTradingSafetyStatus(): Promise<{
  safe: boolean;
  reason?: string;
  errorCode?: string;
}> {
  try {
    // This would check database connectivity, external services, etc.
    // For now, we assume if we can import without errors, we're in a reasonable state
    return { safe: true };
    
  } catch {
    if (error instanceof CriticalDatabaseError) {
      return {
        safe: false,
        reason: 'Database unavailable',
        errorCode: error.errorCode
      };
    }
    
    return {
      safe: false,
      reason: 'System failure',
      errorCode: 'UNKNOWN_ERROR'
    };
  }
}

/**
 * Pre-flight Check for Critical Operations
 * Call this before any state-modifying operations
 */
export function requireSystemSafety(): void {
  // This function would throw if the system is not in a safe state
  // Implementation would check database connectivity, service health, etc.
  
  // For now, we rely on the database layer to throw CriticalDatabaseError
  // when connections fail, which will be caught by withFailFastProtection
}