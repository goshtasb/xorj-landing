import { NextRequest, NextResponse } from 'next/server';
import { fastQuery } from '@/lib/fastDatabase';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'default_secret_for_dev';

/**
 * Bot Enable API - Production Localhost Version
 * POST /api/bot/enable - Simple endpoint to turn the bot ON
 * 
 * Use this for quick bot activation without changing other settings
 * Works directly with database - no FastAPI gateway required
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    // Get Authorization header from client request
    const authorization = request.headers.get('authorization');
    
    if (!authorization || !authorization.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Missing or invalid authorization header' },
        { status: 401 }
      );
    }

    // Extract wallet address from the session token (mock for production localhost)
    const token = authorization.replace('Bearer ', '');
    let walletAddress: string;
    
    try {
      // For production localhost, decode the token to get wallet address
      const decoded = jwt.decode(token) as any;
      walletAddress = decoded?.wallet_address || decoded?.sub || '5QfzCCipXjebAfHpMhCJAoxUJL2TyqM5p8tCFLjsPbmh';
    } catch {
      // Fallback wallet for testing
      walletAddress = '5QfzCCipXjebAfHpMhCJAoxUJL2TyqM5p8tCFLjsPbmh';
    }

    console.log('🔄 Enabling bot for wallet:', walletAddress);

    // Update bot state directly in database using actual schema
    const updateResult = await fastQuery(`
      INSERT INTO bot_states (user_vault_address, is_enabled)
      VALUES ($1, $2)
      ON CONFLICT (user_vault_address)
      DO UPDATE SET 
        is_enabled = EXCLUDED.is_enabled,
        updated_at = now()
      RETURNING *
    `, [walletAddress, true]);
    
    const duration = Date.now() - startTime;
    
    if (updateResult.length > 0) {
      const botState = updateResult[0];
      console.log('✅ Bot enabled successfully in database');
      return NextResponse.json({
        success: true,
        message: 'Bot enabled successfully',
        enabled: true,
        data: {
          walletAddress: botState.user_vault_address,
          enabled: botState.is_enabled,
          lastUpdated: botState.updated_at
        },
        performance: `${duration}ms`,
        _source: 'database_direct'
      });
    } else {
      console.error('❌ Failed to update bot state in database');
      return NextResponse.json(
        { 
          error: 'Failed to update bot state in database',
          performance: `${duration}ms`
        },
        { status: 500 }
      );
    }

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('Bot enable API error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to enable bot',
        performance: `${duration}ms`
      },
      { status: 500 }
    );
  }
}