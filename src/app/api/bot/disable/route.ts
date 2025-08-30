import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { writeQueueService } from '@/lib/queueService';
import { ServerBotStateStorage } from '@/lib/botStateStorage';

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

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
    // Step 1: Authenticate and validate user request
    const authorization = request.headers.get('authorization');
    
    if (!authorization || !authorization.startsWith('Bearer ')) {
      const responseTime = Date.now() - startTime;
      console.log(`❌ [${requestId}] Auth failed - header missing (${responseTime}ms)`);
      return NextResponse.json(
        { 
          error: 'Missing or invalid authorization header',
          requestId,
          responseTime: `${responseTime}ms`
        },
        { status: 401 }
      );
    }

    // Step 2: JWT token verification
    const token = authorization.replace('Bearer ', '');
    let walletAddress: string;
    
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { wallet_address?: string; sub?: string };
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
      ServerBotStateStorage.setBotState(walletAddress, false);
      
      // Step 4: Immediately return 202 Accepted
      return NextResponse.json({
        success: true,
        message: 'Bot disable request accepted and queued for processing',
        enabled: false, // Will be processed asynchronously
        requestId,
        jobId: queueResult.jobId,
        status: 'queued',
        responseTime: `${responseTime}ms`,
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
      ServerBotStateStorage.setBotState(walletAddress, false);
      
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