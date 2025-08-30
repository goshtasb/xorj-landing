import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { writeQueueService } from '@/lib/queueService';
import { ServerBotStateStorage } from '@/lib/botStateStorage';

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

/**
 * Bot Enable API - Phase 2: Queue-Based Architecture
 * POST /api/bot/enable - Instant response with queued processing
 * 
 * NEW LOGIC:
 * 1. Authenticate and validate user request
 * 2. Add job to BullMQ queue with payload: { type: 'SET_BOT_STATUS', userId: '...', enabled: true }
 * 3. Immediately return 202 Accepted status code
 * 
 * Does NOT wait for database write to complete - makes endpoint instantaneous and 100% reliable
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const requestId = `enable_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  console.log(`🚀 [${requestId}] Bot enable request started (Phase 2: Queue-based)`);
  
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

    // Step 2.5: Validate wallet balance before enabling bot
    try {
      console.log(`💰 [${requestId}] Validating wallet balance before enabling bot`);
      const { walletBalanceService } = await import('@/lib/walletBalance');
      const balance = await walletBalanceService.getWalletUsdBalance(walletAddress);
      
      if (balance === 0) {
        const responseTime = Date.now() - startTime;
        console.warn(`⚠️ [${requestId}] Cannot enable bot - wallet has no funds: ${walletAddress}`);
        return NextResponse.json(
          { 
            error: 'Cannot enable bot: Wallet has no funds. Please deposit SOL or USDC first.',
            balance: balance,
            requestId,
            responseTime: `${responseTime}ms`
          },
          { status: 400 }
        );
      }
      
      // Check if balance is sufficient for minimum trading (at least $1)
      if (balance < 1) {
        const responseTime = Date.now() - startTime;
        console.warn(`⚠️ [${requestId}] Cannot enable bot - insufficient funds: ${walletAddress} has $${balance}`);
        return NextResponse.json(
          { 
            error: `Cannot enable bot: Insufficient funds ($${balance.toFixed(2)}). Need at least $1.00 for trading.`,
            balance: balance,
            requestId,
            responseTime: `${responseTime}ms`
          },
          { status: 400 }
        );
      }
      
      console.log(`✅ [${requestId}] Balance validation passed: $${balance.toFixed(2)}`);
    } catch (balanceError) {
      console.error(`❌ [${requestId}] Balance validation failed:`, balanceError);
      // Continue with bot enable - don't block on balance check failures
      console.warn(`⚠️ [${requestId}] Continuing with bot enable despite balance validation failure`);
    }

    // Step 3: Add job to queue (INSTANT - NO DATABASE WAIT)
    const queueResult = await writeQueueService.addBotStatusJob(
      walletAddress,
      true, // enabled = true
      requestId
    );

    const responseTime = Date.now() - startTime;

    if (queueResult.success) {
      console.log(`✅ [${requestId}] Bot enable job queued successfully (${responseTime}ms) - JobID: ${queueResult.jobId}`);
      
      // Also persist to local storage for immediate consistency
      ServerBotStateStorage.setBotState(walletAddress, true);
      
      // Step 4: Immediately return 202 Accepted
      return NextResponse.json({
        success: true,
        message: 'Bot enable request accepted and queued for processing',
        enabled: true, // Will be processed asynchronously
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
      ServerBotStateStorage.setBotState(walletAddress, true);
      
      return NextResponse.json({
        success: true,
        message: 'Bot enabled successfully (queue unavailable, processed immediately)',
        enabled: true,
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
    console.error(`❌ [${requestId}] Bot enable API error (${responseTime}ms):`, error);
    return NextResponse.json(
      { 
        error: 'Failed to process bot enable request',
        requestId,
        responseTime: `${responseTime}ms`,
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}