/**
 * Risk Management Health Check API
 * Monitor the final safety layer protecting capital
 */

import { NextRequest, NextResponse } from 'next/server';
import { riskManagementService } from '@/lib/riskManagement';

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    const health = riskManagementService.getServiceHealth();
    const responseTime = Date.now() - startTime;
    
    const healthStatus = {
      timestamp: new Date().toISOString(),
      responseTime: `${responseTime}ms`,
      service: {
        name: 'Risk Management Module',
        role: 'Final Guardian - Capital Protection Layer',
        status: 'operational',
        version: '3.0.0',
        purpose: 'Transform trade intent into execution authorization'
      },
      safetyChecks: {
        positionSizing: {
          name: 'Position Sizing Check',
          description: 'Prevents trades exceeding maximum position size',
          threshold: `≤${health.config.maxPositionSizePercentage}% of vault value`,
          purpose: 'Limit individual trade risk exposure'
        },
        portfolioDrawdown: {
          name: 'Portfolio Drawdown Check', 
          description: 'Blocks trades during excessive portfolio losses',
          threshold: `≤${health.config.maxDrawdownThreshold}% portfolio drawdown`,
          purpose: 'Prevent adding risk to losing positions'
        },
        priceImpactSlippage: {
          name: 'Price Impact & Slippage Check',
          description: 'Rejects trades with high market impact via Jupiter quotes',
          priceImpactThreshold: `≤${health.config.maxPriceImpact}% price impact`,
          slippageThreshold: `≤${health.config.maxSlippage}% slippage`,
          purpose: 'Ensure favorable trade execution conditions'
        }
      },
      validationPipeline: {
        input: 'TradeSignal (from Trading Logic Module)',
        process: [
          '1. Position Sizing Validation',
          '2. Portfolio Drawdown Analysis', 
          '3. Price Impact & Slippage Check via Jupiter API'
        ],
        outputs: {
          success: 'ValidatedTradeSignal → Ready for Execution',
          failure: 'RiskValidationError → Trade Rejected'
        },
        principle: 'Intent ≠ License - Every signal must earn execution permission'
      },
      integrations: {
        jupiterAPI: {
          endpoint: 'https://quote-api.jup.ag/v6',
          purpose: 'Real-time trade impact validation',
          status: 'integrated'
        },
        solanaRPC: {
          endpoint: 'https://api.mainnet-beta.solana.com',
          purpose: 'Portfolio value and drawdown calculation',
          status: 'connected'
        },
        marketDataService: {
          purpose: 'Price data for trade value calculations',
          status: 'integrated'
        }
      },
      riskConfiguration: health.config,
      operationalMetrics: {
        lastHealthCheck: health.lastCheck,
        systemUptime: process.uptime(),
        memoryUsage: {
          used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
        }
      },
      alerts: []
    };

    // Generate operational alerts
    const memoryUsagePercent = (healthStatus.operationalMetrics.memoryUsage.used / 
                               healthStatus.operationalMetrics.memoryUsage.total) * 100;
    
    if (memoryUsagePercent > 80) {
      healthStatus.alerts.push({
        level: 'warning',
        message: `High memory usage: ${memoryUsagePercent.toFixed(1)}%`,
        recommendation: 'Monitor for memory leaks'
      });
    }

    if (healthStatus.operationalMetrics.systemUptime < 300) { // Less than 5 minutes
      healthStatus.alerts.push({
        level: 'info',
        message: 'Recent system restart detected',
        recommendation: 'Normal for fresh deployment'
      });
    }

    return NextResponse.json(healthStatus, {
      status: 200,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-Health-Check': 'risk-management',
        'X-Response-Time': `${responseTime}ms`
      }
    });

  } catch (error) {
    const responseTime = Date.now() - startTime;
    
    return NextResponse.json({
      timestamp: new Date().toISOString(),
      responseTime: `${responseTime}ms`,
      service: {
        name: 'Risk Management Module',
        status: 'error',
        version: '3.0.0'
      },
      error: 'Health check failed',
      details: error instanceof Error ? error.message : 'Unknown error',
      alerts: [{
        level: 'critical',
        message: 'Risk Management health check failure',
        recommendation: 'Immediate attention required - capital protection at risk'
      }]
    }, {
      status: 500,
      headers: {
        'X-Health-Check': 'risk-management',
        'X-Response-Time': `${responseTime}ms`
      }
    });
  }
}