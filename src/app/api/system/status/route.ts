/**
 * System Status API - Critical Flaw #2 Fix
 * Provides system health status and fail-safe state information
 * NO fallback operations - reports true system state only
 */

import { NextResponse } from 'next/server';
import { healthCheck } from '@/lib/database';
import { verifyTradingSafetyStatus } from '@/lib/apiSafetyWrapper';
import { databaseRecovery } from '@/lib/databaseRecovery';
import { databaseErrorHandler } from '@/lib/databaseErrorHandler';

interface SystemStatus {
  status: 'healthy' | 'degraded' | 'fail_safe' | 'critical';
  timestamp: string;
  services: {
    database: {
      healthy: boolean;
      latency?: number;
      error?: string;
      recovery?: {
        isRecovering: boolean;
        failureCount: number;
        nextRetryTime?: string;
        timeUntilRetry?: number;
      };
    };
    errorHandling: {
      activeRetries: number;
      retryOperations: Array<{
        operationId: string;
        retryCount: number;
      }>;
    };
    trading: {
      safe: boolean;
      reason?: string;
      errorCode?: string;
    };
    api: {
      healthy: boolean;
      mode: 'normal' | 'fail_safe' | 'recovery';
    };
  };
  failSafeMode: {
    active: boolean;
    reason?: string;
    activatedAt?: string;
  };
  message: string;
  recommendations?: string[];
}

/**
 * GET /api/system/status
 * Returns comprehensive system health status
 * CRITICAL: No fallbacks - reports actual system state only
 */
export async function GET(): Promise<NextResponse<SystemStatus>> {
  const timestamp = new Date().toISOString();
  
  try {
    // Check database health - CRITICAL component
    const dbHealth = await healthCheck();
    
    // Get recovery status
    const recoveryStatus = databaseRecovery.getRecoveryStatus();
    
    // Get error handling statistics
    const errorStats = databaseErrorHandler.getRetryStatistics();
    
    // Check trading system safety
    const tradingSafety = await verifyTradingSafetyStatus();
    
    // Determine overall system status
    let overallStatus: SystemStatus['status'] = 'healthy';
    let message = 'All systems operational';
    const recommendations: string[] = [];
    let failSafeMode = { active: false };
    let apiMode: 'normal' | 'fail_safe' | 'recovery' = 'normal';
    
    if (!dbHealth.healthy || recoveryStatus.isRecovering) {
      if (recoveryStatus.isRecovering) {
        overallStatus = 'fail_safe';
        apiMode = 'recovery';
        message = `Database recovery in progress - System in fail-safe mode (attempt ${recoveryStatus.failureCount})`;
        failSafeMode = { 
          active: true, 
          reason: 'Database recovery in progress',
          activatedAt: timestamp
        };
        recommendations.push(
          `Recovery attempt ${recoveryStatus.failureCount} scheduled for ${recoveryStatus.nextRetryTime.toISOString()}`,
          'Monitor recovery progress',
          'Check database server status',
          'Review database connectivity'
        );
      } else {
        overallStatus = 'critical';
        apiMode = 'fail_safe';
        message = 'CRITICAL: Database unavailable - System in fail-safe mode';
        failSafeMode = { 
          active: true, 
          reason: 'Database connection failed',
          activatedAt: timestamp
        };
        recommendations.push(
          'Restore database connectivity immediately',
          'Check database server status and network connectivity',
          'Review database logs for connection issues',
          'System will automatically retry with exponential backoff'
        );
      }
    } else if (!tradingSafety.safe) {
      overallStatus = 'fail_safe';
      apiMode = 'fail_safe';
      message = 'Trading operations suspended - System in fail-safe mode';
      failSafeMode = { 
        active: true, 
        reason: tradingSafety.reason,
        activatedAt: timestamp
      };
      recommendations.push(
        'Investigate trading system issues',
        'Check external service connectivity',
        'Review system logs for errors'
      );
    } else if (errorStats.activeOperations > 0) {
      overallStatus = 'degraded';
      message = `System operational with ${errorStats.activeOperations} active retry operations`;
      recommendations.push(
        'Monitor transient error retry operations',
        'Check database performance if retries persist',
        'Review error patterns in logs'
      );
    } else if (dbHealth.latency && dbHealth.latency > 1000) {
      overallStatus = 'degraded';
      message = 'System operational but database performance degraded';
      recommendations.push(
        'Monitor database performance',
        'Check database server resources',
        'Consider scaling database if needed'
      );
    }
    
    const status: SystemStatus = {
      status: overallStatus,
      timestamp,
      services: {
        database: {
          ...dbHealth,
          recovery: recoveryStatus.isRecovering ? {
            isRecovering: recoveryStatus.isRecovering,
            failureCount: recoveryStatus.failureCount,
            nextRetryTime: recoveryStatus.nextRetryTime.toISOString(),
            timeUntilRetry: recoveryStatus.timeUntilRetry
          } : undefined
        },
        errorHandling: {
          activeRetries: errorStats.activeOperations,
          retryOperations: errorStats.operationRetries
        },
        trading: tradingSafety,
        api: {
          healthy: overallStatus !== 'critical',
          mode: apiMode
        }
      },
      failSafeMode,
      message,
      recommendations: recommendations.length > 0 ? recommendations : undefined
    };
    
    // Return appropriate HTTP status
    const httpStatus = overallStatus === 'critical' ? 503 : 
                      overallStatus === 'fail_safe' ? 503 :
                      overallStatus === 'degraded' ? 200 : 200;
    
    return NextResponse.json(status, { 
      status: httpStatus,
      headers: {
        'X-System-Status': overallStatus.toUpperCase(),
        'X-Fail-Safe-Mode': failSafeMode.active.toString(),
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    });
    
  } catch {
    // Even status checking failed - system is in critical state
    console.error('🚨 CRITICAL: System status check failed:');
    
    const criticalStatus: SystemStatus = {
      status: 'critical',
      timestamp,
      services: {
        database: { 
          healthy: false, 
          error: 'Status check failed' 
        },
        trading: { 
          safe: false, 
          reason: 'System status check failed' 
        },
        api: { 
          healthy: false, 
          mode: 'fail_safe' 
        }
      },
      failSafeMode: {
        active: true,
        reason: 'System status check failure',
        activatedAt: timestamp
      },
      message: 'CRITICAL SYSTEM FAILURE - Unable to determine system status',
      recommendations: [
        'IMMEDIATE ACTION REQUIRED',
        'Check all system components manually',
        'Review application logs',
        'Contact system administrators',
        'Consider emergency maintenance mode'
      ]
    };
    
    return NextResponse.json(criticalStatus, { 
      status: 503,
      headers: {
        'X-System-Status': 'CRITICAL',
        'X-Fail-Safe-Mode': 'true',
        'X-Error': 'Status check failed'
      }
    });
  }
}