/**
 * Phase 2 Test Endpoint
 * Test the write queue architecture without actual Redis dependency
 */

import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

// Type assertion after null check
const jwtSecret: string = JWT_SECRET;

export async function POST(request: NextRequest) {
  // Disable test endpoints in production
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'Test endpoints are disabled in production' },
      { status: 404 }
    );
  }

  const startTime = Date.now();
  const requestId = `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    // Step 1: Authenticate (same as real endpoints)
    const authorization = request.headers.get('authorization');
    
    if (!authorization || !authorization.startsWith('Bearer ')) {
      const responseTime = Date.now() - startTime;
      return NextResponse.json({
        error: 'Missing authorization header',
        requestId,
        responseTime: `${responseTime}ms`
      }, { status: 401 });
    }

    // Step 2: JWT verification (same as real endpoints)
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
        const responseTime = Date.now() - startTime;
        return NextResponse.json({
          error: 'Invalid token',
          requestId,
          responseTime: `${responseTime}ms`
        }, { status: 401 });
      }
    }

    // Step 3: MOCK queue operation (instant response)
    const responseTime = Date.now() - startTime;
    
    console.log(`✅ [${requestId}] Phase 2 test completed successfully (${responseTime}ms) for wallet: ${walletAddress}`);

    // Step 4: Return 202 Accepted (Phase 2 behavior)
    return NextResponse.json({
      success: true,
      message: 'Phase 2 test - instant response with queued processing simulation',
      requestId,
      mockJobId: `mock_${Date.now()}`,
      status: 'queued',
      responseTime: `${responseTime}ms`,
      walletAddress,
      phase: 2,
      architecture: 'write_queue'
    }, { 
      status: 202,
      headers: {
        'X-Request-ID': requestId,
        'X-Processing-Status': 'queued',
        'X-Response-Time': `${responseTime}ms`
      }
    });

  } catch (error) {
    const responseTime = Date.now() - startTime;
    return NextResponse.json({
      error: 'Test failed',
      requestId,
      responseTime: `${responseTime}ms`,
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}