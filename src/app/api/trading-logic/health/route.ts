/**
 * Trading Logic Health Check API
 * Monitor the signal processing pipeline and service status
 */

import { NextRequest, NextResponse } from 'next/server';
import { tradingLogicService } from '@/lib/tradingLogic';

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    // Get comprehensive health status
    const serviceHealth = tradingLogicService.getServiceHealth();
    
    // Calculate response metrics
    const responseTime = Date.now() - startTime;
    
    const healthStatus = {
      timestamp: new Date().toISOString(),
      responseTime: `${responseTime}ms`,
      service: {
        name: 'Trading Logic & Signal Processing',
        status: 'healthy',
        version: '2.0.0'
      },
      metrics: {
        activeUsers: serviceHealth.activeUsers,
        totalSignalsProcessed: serviceHealth.totalSignalsProcessed,
        cachedStrategicGuidance: serviceHealth.cachedGuidance,
        cachedVaultHoldings: serviceHealth.cachedHoldings,
        averageSignalsPerUser: serviceHealth.activeUsers > 0 
          ? (serviceHealth.totalSignalsProcessed / serviceHealth.activeUsers).toFixed(2)
          : '0'
      },
      configuration: {
        rebalanceThreshold: `${serviceHealth.config.rebalanceThreshold}%`,
        maxSignalsPerUser: serviceHealth.config.maxSignalsPerUser,
        confidenceThreshold: `${serviceHealth.config.confidenceThreshold * 100}%`,
        staleDataThreshold: `${serviceHealth.config.staleDataThreshold / 1000}s`
      },
      integrations: {
        quantitativeEngine: {
          endpoint: process.env.QUANTITATIVE_ENGINE_API || 'http://localhost:8000',
          status: 'unknown' // Would need to ping to verify
        },
        solanaRPC: {
          endpoint: 'https://api.mainnet-beta.solana.com',
          status: 'assumed_healthy'
        },
        marketDataService: {
          status: 'integrated',
          description: 'Real-time price data for asset valuation'
        }
      },
      pipeline: {
        steps: [
          '1. Fetch Strategic Guidance from Quantitative Engine',
          '2. Retrieve Current Vault Holdings from Solana',
          '3. Calculate Portfolio Discrepancies',
          '4. Generate TradeSignal Objects',
          '5. Pass to Risk Management Module'
        ],
        dataFlow: 'Strategy → Current State → Signal → Risk Validation → Execution'
      },
      alerts: []
    };

    // Generate alerts based on health metrics
    if (serviceHealth.totalSignalsProcessed === 0 && serviceHealth.activeUsers > 0) {
      healthStatus.alerts.push({
        level: 'warning',
        message: 'Active users but no signals processed - check strategic guidance integration',
        recommendation: 'Verify Quantitative Engine connectivity'
      });
    }

    if (serviceHealth.cachedGuidance === 0) {
      healthStatus.alerts.push({
        level: 'info',
        message: 'No cached strategic guidance - service ready for first requests',
        recommendation: 'Normal for fresh deployment'
      });
    }

    if (serviceHealth.activeUsers > 50) {
      healthStatus.alerts.push({
        level: 'info',
        message: `High user activity: ${serviceHealth.activeUsers} active users`,
        recommendation: 'Monitor performance under load'
      });
    }

    return NextResponse.json(healthStatus, {
      status: 200,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-Health-Check': 'trading-logic',
        'X-Response-Time': `${responseTime}ms`
      }
    });

  } catch (error) {
    const responseTime = Date.now() - startTime;
    
    return NextResponse.json({
      timestamp: new Date().toISOString(),
      responseTime: `${responseTime}ms`,
      service: {
        name: 'Trading Logic & Signal Processing',
        status: 'error',
        version: '2.0.0'
      },
      error: 'Health check failed',
      details: error instanceof Error ? error.message : 'Unknown error',
      alerts: [{
        level: 'critical',
        message: 'Service health check failure',
        recommendation: 'Check service logs and restart if necessary'
      }]
    }, {
      status: 500,
      headers: {
        'X-Health-Check': 'trading-logic',
        'X-Response-Time': `${responseTime}ms`
      }
    });
  }
}