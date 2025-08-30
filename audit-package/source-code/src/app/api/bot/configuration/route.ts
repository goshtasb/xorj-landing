import { NextRequest, NextResponse } from 'next/server';

const FASTAPI_GATEWAY_URL = process.env.NEXT_PUBLIC_FASTAPI_GATEWAY_URL || 'http://localhost:8000';

/**
 * Bot Configuration API - IMPROVED API DESIGN
 * GET /api/bot/configuration - Get current configuration
 * PUT /api/bot/configuration - Update full configuration
 * UNIFIED AUTHENTICATION: Proxy to FastAPI gateway with session token
 */

/**
 * Get current bot configuration
 * GET /api/bot/configuration
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

    console.log('🔄 Proxying bot configuration request to FastAPI gateway');

    try {
      // Proxy request to FastAPI gateway with authentication
      const response = await fetch(`${FASTAPI_GATEWAY_URL}/bot/configuration`, {
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

      const configuration = await response.json();
      console.log('✅ Bot configuration fetched from FastAPI gateway');
      return NextResponse.json({
        success: true,
        configuration
      });
      
    } catch (error) {
      console.error('Failed to fetch bot configuration from FastAPI gateway:', error);
      
      if (error instanceof Error && error.name === 'TimeoutError') {
        return NextResponse.json(
          { error: 'Gateway request timed out' },
          { status: 504 }
        );
      }
      
      if (error instanceof Error && error.message.includes('fetch')) {
        // Fall through to mock configuration when gateway is unavailable
        console.log('🔄 FastAPI gateway unavailable, using mock configuration');
      } else {
        throw error;
      }
    }

    // Fallback to mock configuration when bot service is unavailable
    console.log('🔄 Using mock configuration - Bot service unavailable');
    const mockConfiguration = {
      risk_profile: 'balanced',
      slippage_tolerance: 1.0,
      enabled: true,
      max_trade_amount: 10000,
      _mock: true,
      _service_status: 'unavailable'
    };

    return NextResponse.json({
      success: true,
      configuration: mockConfiguration
    });

  } catch (error) {
    console.error('Bot configuration fetch API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch bot configuration' },
      { status: 500 }
    );
  }
}

/**
 * Update full bot configuration
 * PUT /api/bot/configuration
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { configuration } = body;

    if (!configuration) {
      return NextResponse.json(
        { error: 'configuration is required' },
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

    console.log('🔄 Proxying bot configuration update to FastAPI gateway');

    try {
      // Proxy request to FastAPI gateway with authentication
      const response = await fetch(`${FASTAPI_GATEWAY_URL}/bot/configuration`, {
        method: 'PUT',
        headers: {
          'Authorization': authorization,
          'Content-Type': 'application/json',
          'X-Request-ID': `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        },
        body: JSON.stringify({ configuration }),
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
      console.log('✅ Bot configuration updated via FastAPI gateway');
      return NextResponse.json(result);
      
    } catch (error) {
      console.error('Failed to update bot configuration via FastAPI gateway:', error);
      
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

    // Fallback mock response when bot service is unavailable
    console.log('🔄 Using mock response - Bot service unavailable for full configuration update');
    const updatedConfig = {
      success: true,
      message: 'Full configuration updated successfully (mock)',
      data: configuration,
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