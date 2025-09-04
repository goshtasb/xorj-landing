/**
 * Market Data Subscription API
 * Subscribe to real-time price feeds for specific tokens
 */

import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { marketDataService } from '@/lib/marketData';

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

// Type assertion after null check
const jwtSecret: string = JWT_SECRET;

interface SubscriptionRequest {
  tokenAddress: string;
  interval?: '1s' | '15s' | '30s';
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const requestId = `subscribe_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    // Authentication
    const authorization = request.headers.get('authorization');
    
    if (!authorization || !authorization.startsWith('Bearer ')) {
      return NextResponse.json({
        error: 'Missing authorization header',
        requestId
      }, { status: 401 });
    }

    const token = authorization.replace('Bearer ', '');
    let walletAddress: string;
    
    try {
      const decoded = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] }) as { wallet_address?: string; sub?: string };
      walletAddress = decoded?.wallet_address || decoded?.sub || '';
      
      if (!walletAddress) {
        throw new Error('No wallet address in token');
      }
    } catch {
      // FIXED: In development, handle malformed JWT tokens gracefully
      if (process.env.NODE_ENV === 'development') {
        console.log('🧪 Development mode: JWT malformed, using default wallet address');
        walletAddress = '5QfzCCipXjebAfHpMhCJAoxUJL2TyqM5p8tCFLjsPbmh';
      } else {
        return NextResponse.json({
          error: 'Invalid token',
          requestId
        }, { status: 401 });
      }
    }

    // Parse request body
    const body: SubscriptionRequest = await request.json();
    const { tokenAddress, interval = '1s' } = body;

    if (!tokenAddress) {
      return NextResponse.json({
        error: 'Token address is required',
        requestId
      }, { status: 400 });
    }

    // Validate token address format (basic Solana address validation)
    if (tokenAddress.length < 32 || tokenAddress.length > 44) {
      return NextResponse.json({
        error: 'Invalid token address format',
        requestId
      }, { status: 400 });
    }

    // Validate interval
    if (!['1s', '15s', '30s'].includes(interval)) {
      return NextResponse.json({
        error: 'Invalid interval. Must be 1s, 15s, or 30s',
        requestId
      }, { status: 400 });
    }

    console.log(`📡 Subscription request from ${walletAddress} for ${tokenAddress} (${interval})`);

    // Subscribe to price feed
    try {
      await marketDataService.subscribeToPrice(tokenAddress, interval);
      
      const responseTime = Date.now() - startTime;
      
      console.log(`✅ Successfully subscribed to ${tokenAddress} price feed`);
      
      return NextResponse.json({
        success: true,
        message: 'Successfully subscribed to price feed',
        subscription: {
          tokenAddress,
          interval,
          subscribedAt: new Date().toISOString()
        },
        requestId,
        responseTime: `${responseTime}ms`,
        marketDataStatus: {
          connected: marketDataService.isConnected(),
          connectionState: marketDataService.getConnectionState()
        }
      }, {
        status: 200,
        headers: {
          'X-Request-ID': requestId,
          'X-Response-Time': `${responseTime}ms`
        }
      });

    } catch (marketDataError) {
      console.error(`❌ Failed to subscribe to price feed:`, marketDataError);
      
      return NextResponse.json({
        error: 'Failed to subscribe to price feed',
        details: marketDataError instanceof Error ? marketDataError.message : 'Unknown error',
        requestId,
        marketDataStatus: {
          connected: marketDataService.isConnected(),
          connectionState: marketDataService.getConnectionState()
        }
      }, { status: 503 });
    }

  } catch (error) {
    console.error(`❌ Subscription request failed:`, error);
    const responseTime = Date.now() - startTime;
    
    return NextResponse.json({
      error: 'Subscription request failed',
      requestId,
      responseTime: `${responseTime}ms`,
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const startTime = Date.now();
  const requestId = `unsubscribe_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    // Authentication (same as POST)
    const authorization = request.headers.get('authorization');
    
    if (!authorization || !authorization.startsWith('Bearer ')) {
      return NextResponse.json({
        error: 'Missing authorization header',
        requestId
      }, { status: 401 });
    }

    const token = authorization.replace('Bearer ', '');
    let walletAddress: string;
    
    try {
      const decoded = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] }) as { wallet_address?: string; sub?: string };
      walletAddress = decoded?.wallet_address || decoded?.sub || '';
      
      if (!walletAddress) {
        throw new Error('No wallet address in token');
      }
    } catch {
      // FIXED: In development, handle malformed JWT tokens gracefully
      if (process.env.NODE_ENV === 'development') {
        console.log('🧪 Development mode: JWT malformed, using default wallet address');
        walletAddress = '5QfzCCipXjebAfHpMhCJAoxUJL2TyqM5p8tCFLjsPbmh';
      } else {
        return NextResponse.json({
          error: 'Invalid token',
          requestId
        }, { status: 401 });
      }
    }

    // Parse request body
    const body: SubscriptionRequest = await request.json();
    const { tokenAddress, interval = '1s' } = body;

    if (!tokenAddress) {
      return NextResponse.json({
        error: 'Token address is required',
        requestId
      }, { status: 400 });
    }

    console.log(`📡 Unsubscription request from ${walletAddress} for ${tokenAddress}`);

    // Unsubscribe from price feed
    marketDataService.unsubscribeFromPrice(tokenAddress, interval);
    
    const responseTime = Date.now() - startTime;
    
    console.log(`✅ Successfully unsubscribed from ${tokenAddress} price feed`);
    
    return NextResponse.json({
      success: true,
      message: 'Successfully unsubscribed from price feed',
      unsubscription: {
        tokenAddress,
        interval,
        unsubscribedAt: new Date().toISOString()
      },
      requestId,
      responseTime: `${responseTime}ms`
    }, {
      status: 200,
      headers: {
        'X-Request-ID': requestId,
        'X-Response-Time': `${responseTime}ms`
      }
    });

  } catch (error) {
    console.error(`❌ Unsubscription request failed:`, error);
    const responseTime = Date.now() - startTime;
    
    return NextResponse.json({
      error: 'Unsubscription request failed',
      requestId,
      responseTime: `${responseTime}ms`,
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}