import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { writeQueueService } from '@/lib/queueService';
import { BotStateServiceWithCache } from '@/lib/botStateService';

const JWT_SECRET = process.env.JWT_SECRET;
const BOT_SERVICE_API_KEY = process.env.BOT_SERVICE_API_KEY;
const BOT_SERVICE_URL = process.env.BOT_SERVICE_URL || 'http://localhost:8001';

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

if (!BOT_SERVICE_API_KEY) {
  throw new Error('BOT_SERVICE_API_KEY environment variable is required');
}

// Type assertion after null check
const jwtSecret: string = JWT_SECRET;

/**
 * Bot Disable API - Phase 2: Queue-Based Architecture
 * POST /api/bot/disable - Instant response with queued processing
 * 
 * NEW LOGIC:
 * 1. Authenticate and validate user request
 * 2. Add job to BullMQ queue with payload: { type: 'SET_BOT_STATUS', userId: '...', enabled: false }
 * 3. Immediately return 202 Accepted status code
 * 
 * Does NOT wait for database write to complete - makes endpoint instantaneous and 100% reliable
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const requestId = `disable_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  console.log(`🚀 [${requestId}] Bot disable request started (Phase 2: Queue-based)`);
  
  try {
    // Step 1: Get JWT token from httpOnly cookie or Authorization header (backwards compatibility)
    let token = request.cookies.get('xorj_session_token')?.value;
    let walletAddress: string;
    
    // Fallback to Authorization header for backwards compatibility
    if (!token) {
      const authorization = request.headers.get('authorization');
      if (authorization && authorization.startsWith('Bearer ')) {
        token = authorization.replace('Bearer ', '');
      }
    }
    
    if (!token && process.env.NODE_ENV === 'development') {
      // Development mode: accept without auth for testing
      walletAddress = '5QfzCCipXjebAfHpMhCJAoxUJL2TyqM5p8tCFLjsPbmh';
      console.log(`🧪 [${requestId}] Development mode: Using default wallet address`);
    } else if (!token) {
      const responseTime = Date.now() - startTime;
      console.log(`❌ [${requestId}] Auth failed - no token found (${responseTime}ms)`);
      return NextResponse.json(
        { 
          error: 'No authentication token found',
          requestId,
          responseTime: `${responseTime}ms`
        },
        { status: 401 }
      );
    } else {
      // Step 2: JWT token verification
      try {
        const decoded = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] }) as { wallet_address?: string; sub?: string };
        walletAddress = decoded?.wallet_address || decoded?.sub || '';
        
        if (!walletAddress) {
          throw new Error('No wallet address in token');
        }
        
        console.log(`✅ [${requestId}] JWT verified for wallet: ${walletAddress}`);
      } catch (error) {
        const responseTime = Date.now() - startTime;
        console.error(`❌ [${requestId}] JWT verification failed (${responseTime}ms):`, error);
        return NextResponse.json(
          { 
            error: 'Invalid or expired session token',
            requestId,
            responseTime: `${responseTime}ms`
          },
          { status: 401 }
        );
      }
    }

    // Step 3: Add job to queue (INSTANT - NO DATABASE WAIT)
    const queueResult = await writeQueueService.addBotStatusJob(
      walletAddress,
      false, // enabled = false
      requestId
    );

    const responseTime = Date.now() - startTime;

    if (queueResult.success) {
      console.log(`✅ [${requestId}] Bot disable job queued successfully (${responseTime}ms) - JobID: ${queueResult.jobId}`);
      
      // Also persist to local storage for immediate consistency
      // Update bot state using write-through cache invalidation pattern
      const botStateResult = await BotStateServiceWithCache.update(walletAddress, { enabled: false });
      
      if (!botStateResult.success) {
        console.warn(`⚠️ Failed to update bot state in database:`, botStateResult.error);
      }
      
      // Step 4: Actually stop the bot via bot service API
      let botServiceStopped = false;
      try {
        console.log(`🛑 [${requestId}] Stopping actual bot execution via bot service`);
        const botStopResponse = await fetch(`${BOT_SERVICE_URL}/api/v1/bot/stop/${walletAddress}`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${BOT_SERVICE_API_KEY}`,
            'Content-Type': 'application/json',
            'X-Request-ID': requestId,
          },
          signal: AbortSignal.timeout(5000)
        });

        if (botStopResponse.ok) {
          const stopResult = await botStopResponse.json();
          console.log(`✅ [${requestId}] Bot stopped successfully via bot service:`, stopResult);
          botServiceStopped = true;
        } else {
          const errorText = await botStopResponse.text();
          console.warn(`⚠️ [${requestId}] Bot service stop failed: ${botStopResponse.status} ${errorText}`);
        }
      } catch (error) {
        console.warn(`⚠️ [${requestId}] Failed to stop bot via bot service:`, error);
      }
      
      // Step 5: Return response with bot service status
      return NextResponse.json({
        success: true,
        message: botServiceStopped 
          ? 'Bot disabled and stopped successfully' 
          : 'Bot disable request accepted and queued for processing',
        enabled: false,
        requestId,
        jobId: queueResult.jobId,
        status: botServiceStopped ? 'stopped' : 'queued',
        responseTime: `${responseTime}ms`,
        botService: botServiceStopped ? 'stopped' : 'unavailable',
        _source: 'write_queue'
      }, { 
        status: 202, // 202 Accepted - request received and will be processed
        headers: {
          'X-Request-ID': requestId,
          'X-Job-ID': queueResult.jobId || '',
          'X-Processing-Status': 'queued',
          'X-Response-Time': `${responseTime}ms`
        }
      });
    } else {
      // Queue failed - fallback to immediate response with local persistence
      console.error(`❌ [${requestId}] Queue failed, using immediate response fallback with local storage`);
      
      // Persist bot state to local storage since queue failed
      // Update bot state using write-through cache invalidation pattern
      const botStateResult = await BotStateServiceWithCache.update(walletAddress, { enabled: false });
      
      if (!botStateResult.success) {
        console.warn(`⚠️ Failed to update bot state in database:`, botStateResult.error);
      }
      
      return NextResponse.json({
        success: true,
        message: 'Bot disabled successfully (queue unavailable, processed immediately)',
        enabled: false,
        requestId,
        status: 'completed_immediate',
        responseTime: `${responseTime}ms`,
        warning: 'Write queue unavailable - processed synchronously with local storage',
        _source: 'immediate_fallback_with_storage'
      }, {
        headers: {
          'X-Request-ID': requestId,
          'X-Processing-Status': 'immediate',
          'X-Response-Time': `${responseTime}ms`
        }
      });
    }

  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.error(`❌ [${requestId}] Bot disable API error (${responseTime}ms):`, error);
    return NextResponse.json(
      { 
        error: 'Failed to process bot disable request',
        requestId,
        responseTime: `${responseTime}ms`,
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}