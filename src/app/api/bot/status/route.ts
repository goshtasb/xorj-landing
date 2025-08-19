import { NextRequest, NextResponse } from 'next/server';
import { botService, checkBotServiceHealth, isBotServiceError } from '@/lib/botService';

/**
 * Bot Status API - Get real-time status of XORJ Trade Execution Bot
 * GET /api/bot/status?user_id={user_id}
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('user_id');
    
    if (!userId) {
      return NextResponse.json(
        { error: 'user_id parameter is required' },
        { status: 400 }
      );
    }

    // Check if bot service is available
    const isServiceAvailable = await checkBotServiceHealth();
    
    if (isServiceAvailable) {
      try {
        // Get actual bot status from service
        const botStatus = await botService.getBotStatus(userId);
        return NextResponse.json(botStatus);
      } catch (error) {
        console.error('Failed to fetch bot status from service:', error);
        
        // If it's a service error, return appropriate status
        if (isBotServiceError(error) && error.status) {
          return NextResponse.json(
            { error: error.message },
            { status: error.status }
          );
        }
        
        // Fall through to mock data if service fails
      }
    }

    // Fallback to mock data when bot service is unavailable
    console.log('🔄 Using mock data - Bot service unavailable');
    const mockBotStatus = {
      user_id: userId,
      status: 'active',
      last_execution: new Date().toISOString(),
      health_score: 95.5,
      circuit_breakers: {
        trade_failure: { status: 'closed', failure_count: 0 },
        network: { status: 'closed', failure_count: 0 },
        volatility: { status: 'closed', threshold: 5.0 },
        hsm: { status: 'closed', last_check: new Date().toISOString() },
        slippage: { status: 'closed', rejection_count: 0 },
        system_error: { status: 'closed', error_count: 0 },
        confirmation_timeout: { status: 'closed', timeout_count: 0 }
      },
      kill_switch_active: false,
      configuration: {
        risk_profile: 'balanced',
        slippage_tolerance: 1.0,
        enabled: true,
        max_trade_amount: 10000
      },
      performance: {
        total_trades: 147,
        successful_trades: 146,
        success_rate: 99.3,
        average_slippage: 0.08,
        total_volume_usd: 1250000
      }
    };

    return NextResponse.json({
      ...mockBotStatus,
      _mock: true,
      _service_status: 'unavailable'
    });

  } catch (error) {
    console.error('Bot status API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch bot status' },
      { status: 500 }
    );
  }
}

/**
 * Update Bot Configuration
 * POST /api/bot/status
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { user_id, configuration } = body;

    if (!user_id || !configuration) {
      return NextResponse.json(
        { error: 'user_id and configuration are required' },
        { status: 400 }
      );
    }

    // Check if bot service is available
    const isServiceAvailable = await checkBotServiceHealth();
    
    if (isServiceAvailable) {
      try {
        // Update configuration via bot service
        const result = await botService.updateBotConfiguration(user_id, configuration);
        return NextResponse.json(result);
      } catch (error) {
        console.error('Failed to update bot configuration via service:', error);
        
        if (isBotServiceError(error) && error.status) {
          return NextResponse.json(
            { error: error.message },
            { status: error.status }
          );
        }
        
        // Fall through to mock response if service fails
      }
    }

    // Fallback mock response when bot service is unavailable
    console.log('🔄 Using mock response - Bot service unavailable for configuration update');
    const updatedConfig = {
      success: true,
      message: 'Configuration updated successfully (mock)',
      user_id,
      updated_fields: Object.keys(configuration),
      timestamp: new Date().toISOString(),
      _mock: true,
      _service_status: 'unavailable'
    };

    return NextResponse.json(updatedConfig);

  } catch (error) {
    console.error('Bot configuration update error:', error);
    return NextResponse.json(
      { error: 'Failed to update bot configuration' },
      { status: 500 }
    );
  }
}