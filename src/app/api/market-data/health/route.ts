/**
 * Market Data Health Check API
 * Monitor real-time price feeds and validation systems
 */

import { NextResponse } from 'next/server';
import { marketDataService } from '@/lib/marketData';
import { priceValidator } from '@/lib/priceValidation';

export async function GET() {
  const startTime = Date.now();
  
  try {
    // Get comprehensive health status
    const marketDataHealth = marketDataService.getHealthStatus();
    const validatorHealth = priceValidator.getValidatorHealth();
    
    // Calculate response metrics
    const responseTime = Date.now() - startTime;
    
    const healthStatus = {
      timestamp: new Date().toISOString(),
      responseTime: `${responseTime}ms`,
      services: {
        marketData: {
          status: marketDataHealth.connected ? 'healthy' : 'unhealthy',
          connected: marketDataHealth.connected,
          connectionState: marketDataHealth.connectionState,
          activeSubscriptions: marketDataHealth.subscriptions.length,
          priceDataSources: marketDataHealth.lastDataCount,
          reconnectAttempts: marketDataHealth.reconnectAttempts,
          subscriptionDetails: marketDataHealth.subscriptions
        },
        priceValidator: {
          status: 'healthy',
          tokensTracked: validatorHealth.totalTokensTracked,
          activeCircuitBreakers: validatorHealth.activeCircuitBreakers,
          lastValidations: validatorHealth.lastValidationCount,
          circuitBreakers: validatorHealth.circuitBreakers.map(cb => ({
            address: cb.address,
            tripped: cb.tripped,
            reason: cb.reason,
            timestamp: cb.timestamp,
            duration: cb.tripped ? Date.now() - cb.timestamp : null
          }))
        }
      },
      overall: {
        status: marketDataHealth.connected ? 'healthy' : 'degraded',
        uptime: process.uptime(),
        memory: {
          used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
        }
      },
      alerts: []
    };

    // Generate alerts based on health metrics
    if (!marketDataHealth.connected) {
      healthStatus.alerts.push({
        level: 'critical',
        message: 'Market data service disconnected',
        service: 'marketData'
      });
    }

    if (marketDataHealth.reconnectAttempts > 0) {
      healthStatus.alerts.push({
        level: 'warning',
        message: `Market data service has ${marketDataHealth.reconnectAttempts} recent reconnect attempts`,
        service: 'marketData'
      });
    }

    if (validatorHealth.activeCircuitBreakers > 0) {
      healthStatus.alerts.push({
        level: 'warning',
        message: `${validatorHealth.activeCircuitBreakers} price validation circuit breakers are active`,
        service: 'priceValidator'
      });
    }

    if (marketDataHealth.subscriptions.length === 0 && marketDataHealth.connected) {
      healthStatus.alerts.push({
        level: 'info',
        message: 'No active price subscriptions',
        service: 'marketData'
      });
    }

    // Determine HTTP status based on overall health
    const httpStatus = healthStatus.overall.status === 'healthy' ? 200 : 
                      healthStatus.overall.status === 'degraded' ? 503 : 500;

    return NextResponse.json(healthStatus, { 
      status: httpStatus,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-Health-Check': 'market-data',
        'X-Response-Time': `${responseTime}ms`
      }
    });

  } catch (error) {
    const responseTime = Date.now() - startTime;
    
    return NextResponse.json({
      timestamp: new Date().toISOString(),
      responseTime: `${responseTime}ms`,
      status: 'error',
      error: 'Health check failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { 
      status: 500,
      headers: {
        'X-Health-Check': 'market-data',
        'X-Response-Time': `${responseTime}ms`
      }
    });
  }
}