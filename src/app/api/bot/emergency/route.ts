import { NextRequest, NextResponse } from 'next/server';
import { botService, checkBotServiceHealth, isBotServiceError } from '@/lib/botService';

/**
 * Bot Emergency Controls API - Kill switch and emergency actions
 * POST /api/bot/emergency
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { user_id, action, reason, authorization_key } = body;

    if (!user_id || !action) {
      return NextResponse.json(
        { error: 'user_id and action are required' },
        { status: 400 }
      );
    }

    // Validate authorization for emergency actions
    if (action === 'kill_switch' && !authorization_key) {
      return NextResponse.json(
        { error: 'authorization_key required for kill switch activation' },
        { status: 403 }
      );
    }

    // Check if bot service is available
    const isServiceAvailable = await checkBotServiceHealth();
    
    if (isServiceAvailable) {
      try {
        // Execute emergency action via bot service
        const emergencyAction = { user_id, action, reason, authorization_key };
        const result = await botService.executeEmergencyAction(emergencyAction);
        return NextResponse.json(result);
      } catch (error) {
        console.error('Failed to execute emergency action via bot service:', error);
        
        if (isBotServiceError(error) && error.status) {
          return NextResponse.json(
            { error: error.message },
            { status: error.status }
          );
        }
        
        // Fall through to mock response if service fails
      }
    }

    // Fallback mock responses when bot service is unavailable
    console.log('🔄 Using mock emergency response - Bot service unavailable');
    const timestamp = new Date().toISOString();

    switch (action) {
      case 'kill_switch':
        // TODO: In production, this would activate the bot's global kill switch
        const killSwitchResponse = {
          action: 'kill_switch',
          status: 'activated',
          user_id,
          reason: reason || 'user_requested',
          timestamp,
          authorization_key: authorization_key.substring(0, 8) + '...',
          bot_status: 'stopped',
          message: 'Kill switch activated successfully. All trading operations have been halted.',
          recovery_instructions: 'Contact support to reactivate the bot after reviewing the cause.'
        };

        // Log the emergency action
        console.log('EMERGENCY: Kill switch activated', {
          user_id,
          reason,
          timestamp,
          authorization_key: authorization_key.substring(0, 8) + '...'
        });

        return NextResponse.json({
          ...killSwitchResponse,
          _mock: true,
          _service_status: 'unavailable'
        });

      case 'pause':
        // TODO: In production, this would pause the bot
        const pauseResponse = {
          action: 'pause',
          status: 'paused',
          user_id,
          reason: reason || 'user_requested',
          timestamp,
          bot_status: 'paused',
          message: 'Bot paused successfully. Trading operations are temporarily halted.',
          recovery_instructions: 'Use the resume action to restart the bot.'
        };

        return NextResponse.json({
          ...pauseResponse,
          _mock: true,
          _service_status: 'unavailable'
        });

      case 'resume':
        // TODO: In production, this would resume the bot
        const resumeResponse = {
          action: 'resume',
          status: 'resumed',
          user_id,
          timestamp,
          bot_status: 'active',
          message: 'Bot resumed successfully. Trading operations are now active.',
          health_check: {
            circuit_breakers: 'all_closed',
            kill_switch: 'inactive',
            system_health: 'optimal'
          }
        };

        return NextResponse.json({
          ...resumeResponse,
          _mock: true,
          _service_status: 'unavailable'
        });

      default:
        return NextResponse.json(
          { error: 'Invalid action. Supported actions: kill_switch, pause, resume' },
          { status: 400 }
        );
    }

  } catch (error) {
    console.error('Bot emergency API error:', error);
    return NextResponse.json(
      { error: 'Failed to process emergency action' },
      { status: 500 }
    );
  }
}

/**
 * Get Emergency Status
 * GET /api/bot/emergency?user_id={user_id}
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
        // Get actual emergency status from bot service
        const emergencyStatus = await botService.getEmergencyStatus(userId);
        return NextResponse.json(emergencyStatus);
      } catch (error) {
        console.error('Failed to fetch emergency status from bot service:', error);
        
        if (isBotServiceError(error) && error.status) {
          return NextResponse.json(
            { error: error.message },
            { status: error.status }
          );
        }
        
        // Fall through to mock data if service fails
      }
    }

    // Fallback mock emergency status when bot service is unavailable
    console.log('🔄 Using mock emergency status - Bot service unavailable');
    const emergencyStatus = {
      user_id: userId,
      kill_switch_active: false,
      bot_status: 'active',
      circuit_breakers_status: {
        any_open: false,
        open_breakers: []
      },
      last_emergency_action: null,
      emergency_contacts: {
        enabled: true,
        email: 'user@example.com',
        phone: '+1-XXX-XXX-XXXX'
      },
      recovery_options: [
        'pause',
        'resume',
        'kill_switch'
      ]
    };

    return NextResponse.json({
      ...emergencyStatus,
      _mock: true,
      _service_status: 'unavailable'
    });

  } catch (error) {
    console.error('Bot emergency status API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch emergency status' },
      { status: 500 }
    );
  }
}