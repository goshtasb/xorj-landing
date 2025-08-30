/**
 * Database Health Check API
 * Tests database connection and service layer
 */

import { NextRequest, NextResponse } from 'next/server';
import { UserSettingsService, BotStateService, TradeService } from '@/lib/botStateService';

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const requestId = `health_${Date.now()}`;
  
  try {
    console.log(`🔍 Database Health Check: ${requestId}`);
    
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
    } catch (error) {
      healthChecks.services.userSettings.error = error instanceof Error ? error.message : 'Unknown error';
    }

    // Test BotStateService
    try {
      const result = await BotStateService.getOrCreate('test_user_id');
      healthChecks.services.botState.available = result.success;
      if (!result.success) {
        healthChecks.services.botState.error = result.error || 'Unknown error';
      }
    } catch (error) {
      healthChecks.services.botState.error = error instanceof Error ? error.message : 'Unknown error';
    }

    // Test TradeService
    try {
      const result = await TradeService.getAll({ limit: 1 });
      healthChecks.services.trades.available = result.success;
      if (!result.success) {
        healthChecks.services.trades.error = result.error || 'Unknown error';
      }
    } catch (error) {
      healthChecks.services.trades.error = error instanceof Error ? error.message : 'Unknown error';
    }

    // Overall database connection status
    const servicesWorking = Object.values(healthChecks.services).filter(s => s.available).length;
    healthChecks.database.connected = servicesWorking > 0;
    
    if (!healthChecks.database.connected) {
      healthChecks.database.error = 'No database services available';
    }

    const processingTime = Date.now() - startTime;
    
    const status = healthChecks.database.connected ? 200 : 503;
    
    console.log(`${healthChecks.database.connected ? '✅' : '❌'} Database Health Check completed: ${processingTime}ms`);

    return NextResponse.json({
      ...healthChecks,
      processingTime: `${processingTime}ms`,
      summary: {
        status: healthChecks.database.connected ? 'healthy' : 'unhealthy',
        servicesAvailable: servicesWorking,
        totalServices: 3
      }
    }, { 
      status,
      headers: {
        'Cache-Control': 'no-cache',
        'X-Processing-Time': `${processingTime}ms`
      }
    });

  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error(`❌ Database Health Check error: ${requestId}`, error);
    
    return NextResponse.json({
      timestamp: Date.now(),
      requestId,
      error: 'Health check failed',
      details: error instanceof Error ? error.message : 'Unknown error',
      processingTime: `${processingTime}ms`
    }, { status: 500 });
  }
}