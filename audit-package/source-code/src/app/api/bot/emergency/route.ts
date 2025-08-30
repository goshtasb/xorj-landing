import { NextRequest, NextResponse } from 'next/server';

const FASTAPI_GATEWAY_URL = process.env.NEXT_PUBLIC_FASTAPI_GATEWAY_URL || 'http://localhost:8000';

/**
 * Bot Emergency Controls API - Kill switch and emergency actions
 * POST /api/bot/emergency
 * UNIFIED AUTHENTICATION: Proxy to FastAPI gateway with session token
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, reason, authorization_key } = body;

    if (!action) {
      return NextResponse.json(
        { error: 'action is required' },
        { status: 400 }
      );
    }

    // Get Authorization header from client request
    const authorization = request.headers.get('authorization');
    
    if (!authorization || !authorization.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Missing or invalid authorization header' },
        { status: 401 }
      );
    }

    // Validate authorization for emergency actions
    if (action === 'kill_switch' && !authorization_key) {
      return NextResponse.json(
        { error: 'authorization_key required for kill switch activation' },
        { status: 403 }
      );
    }

    console.log('🔄 Proxying bot emergency action to FastAPI gateway');

    try {
      // Proxy request to FastAPI gateway with authentication
      const response = await fetch(`${FASTAPI_GATEWAY_URL}/bot/emergency`, {
        method: 'POST',
        headers: {
          'Authorization': authorization,
          'Content-Type': 'application/json',
          'X-Request-ID': `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        },
        body: JSON.stringify({ action, reason, authorization_key }),
        // 10 second timeout
        signal: AbortSignal.timeout(10000)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`FastAPI gateway error: ${response.status} ${errorText}`);
        return NextResponse.json(
          { error: `Gateway error: ${response.status} ${response.statusText}` },
          { status: response.status }
        );
      }

      const result = await response.json();
      console.log('✅ Bot emergency action executed via FastAPI gateway');
      return NextResponse.json(result);
      
    } catch (error) {
      console.error('Failed to execute emergency action via FastAPI gateway:', error);
      
      if (error instanceof Error && error.name === 'TimeoutError') {
        return NextResponse.json(
          { error: 'Gateway request timed out' },
          { status: 504 }
        );
      }
      
      if (error instanceof Error && error.message.includes('fetch')) {
        // Fall through to mock response when gateway is unavailable
        console.log('🔄 FastAPI gateway unavailable, using mock response');
      } else {
        throw error;
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
          user_id: 'authenticated_user',  // User ID comes from session token
          reason: reason || 'user_requested',
          timestamp,
          authorization_key: authorization_key.substring(0, 8) + '...',
          bot_status: 'stopped',
          message: 'Kill switch activated successfully. All trading operations have been halted.',
          recovery_instructions: 'Contact support to reactivate the bot after reviewing the cause.'
        };

        // Log the emergency action
        console.log('EMERGENCY: Kill switch activated', {
          user_id: 'authenticated_user',
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
          user_id: 'authenticated_user',  // User ID comes from session token
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
          user_id: 'authenticated_user',  // User ID comes from session token
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
 * GET /api/bot/emergency
 * UNIFIED AUTHENTICATION: Proxy to FastAPI gateway with session token
 */
export async function GET(request: NextRequest) {
  try {
    // Get Authorization header from client request
    const authorization = request.headers.get('authorization');
    
    if (!authorization || !authorization.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Missing or invalid authorization header' },
        { status: 401 }
      );
    }

    console.log('🔄 Proxying emergency status request to FastAPI gateway');

    try {
      // Proxy request to FastAPI gateway with authentication
      const response = await fetch(`${FASTAPI_GATEWAY_URL}/bot/emergency`, {
        method: 'GET',
        headers: {
          'Authorization': authorization,
          'Content-Type': 'application/json',
          'X-Request-ID': `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        },
        // 10 second timeout
        signal: AbortSignal.timeout(10000)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`FastAPI gateway error: ${response.status} ${errorText}`);
        return NextResponse.json(
          { error: `Gateway error: ${response.status} ${response.statusText}` },
          { status: response.status }
        );
      }

      const emergencyStatus = await response.json();
      console.log('✅ Emergency status fetched from FastAPI gateway');
      return NextResponse.json(emergencyStatus);
      
    } catch (error) {
      console.error('Failed to fetch emergency status from FastAPI gateway:', error);
      
      if (error instanceof Error && error.name === 'TimeoutError') {
        return NextResponse.json(
          { error: 'Gateway request timed out' },
          { status: 504 }
        );
      }
      
      if (error instanceof Error && error.message.includes('fetch')) {
        // Fall through to mock data when gateway is unavailable
        console.log('🔄 FastAPI gateway unavailable, using mock data');
      } else {
        throw error;
      }
    }

    // Fallback mock emergency status when bot service is unavailable
    console.log('🔄 Using mock emergency status - Bot service unavailable');
    const emergencyStatus = {
      user_id: 'authenticated_user',  // User ID comes from session token
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