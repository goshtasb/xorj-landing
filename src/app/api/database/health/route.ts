/**
 * Database Health Check API
 * Tests database connection and service layer
 */

import { NextRequest, NextResponse } from 'next/server';
import { UserSettingsService, BotStateServiceWithCache, TradeService } from '@/lib/botStateService';

export async function GET(request: NextRequest) {
  const _startTime = Date.now();
  const requestId = `health_${Date.now()}`;
  
  try {
    console.log(`🔍 Database Health Check: ${requestId} from ${request.url}`);
    
    const healthChecks = {
      timestamp: Date.now(),
      requestId,
      services: {
        userSettings: { available: false, error: null as string | null },
        botState: { available: false, error: null as string | null },
        trades: { available: false, error: null as string | null }
      },
      database: {
        connected: false,
        error: null as string | null
      }
    };

    // Test UserSettingsService
    try {
      // This will fail gracefully if no database connection
      const result = await UserSettingsService.getOrCreate('test_wallet_address');
      healthChecks.services.userSettings.available = result.success;
      if (!result.success) {
        healthChecks.services.userSettings.error = result.error || 'Unknown error';
      }
    } catch {
      healthChecks.services.userSettings.error = 'Unknown error'
    }

    // Test BotStateService - DISABLED to prevent NULL errors
    // The test_user_id was causing database constraint violations
    // Health check should not create test records in production database
    healthChecks.services.botState.available = false;
    healthChecks.services.botState.error = 'Health check disabled - was causing NULL constraint violations';

    // Test TradeService
    try {
      const result = await TradeService.getAll({ limit: 1 });
      healthChecks.services.trades.available = result.success;
      if (!result.success) {
        healthChecks.services.trades.error = result.error || 'Unknown error';
      }
    } catch {
      healthChecks.services.trades.error = 'Unknown error'
    }

    // Overall database connection status
    const servicesWorking = Object.values(healthChecks.services).filter(s => s.available).length;
    healthChecks.database.connected = servicesWorking > 0;
    
    if (!healthChecks.database.connected) {
      healthChecks.database.error = 'No database services available';
    }

    const _processingTime = Date.now() - _startTime;
    
    const status = healthChecks.database.connected ? 200 : 503;
    
    console.log(`${healthChecks.database.connected ? '✅' : '❌'} Database Health Check completed: ${_processingTime}ms`);

    return NextResponse.json({
      ...healthChecks,
      processingTime: `${_processingTime}ms`,
      summary: {
        status: healthChecks.database.connected ? 'healthy' : 'unhealthy',
        servicesAvailable: servicesWorking,
        totalServices: 3
      }
    }, { 
      status,
      headers: {
        'Cache-Control': 'no-cache',
        'X-Processing-Time': `${_processingTime}ms`
      }
    });

  } catch {
    const _processingTime = Date.now() - _startTime;
    console.error(`❌ Database Health Check error: ${requestId}`);
    
    return NextResponse.json({
      timestamp: Date.now(),
      requestId,
      error: 'Health check failed',
      details: 'Unknown error',
      processingTime: `${_processingTime}ms`
    }, { status: 500 });
  }
}