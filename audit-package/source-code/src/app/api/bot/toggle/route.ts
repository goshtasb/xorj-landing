/**
 * Simple Bot Toggle API
 * Works with actual database schema for production localhost environment
 */

import { NextRequest, NextResponse } from 'next/server';
import { fastQuery } from '@/lib/fastDatabase';

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    const body = await request.json();
    const { walletAddress, enabled } = body;
    
    if (!walletAddress) {
      return NextResponse.json(
        { success: false, error: 'Wallet address required' },
        { status: 400 }
      );
    }
    
    console.log(`🔄 Toggling bot for ${walletAddress} to ${enabled ? 'ENABLED' : 'DISABLED'}`);
    
    // Update bot state in database using actual schema
    const updateResult = await fastQuery(`
      INSERT INTO bot_states (user_vault_address, is_enabled)
      VALUES ($1, $2)
      ON CONFLICT (user_vault_address)
      DO UPDATE SET 
        is_enabled = EXCLUDED.is_enabled,
        updated_at = now()
      RETURNING *
    `, [walletAddress, enabled === true]);
    
    const duration = Date.now() - startTime;
    
    if (updateResult.length > 0) {
      const botState = updateResult[0];
      console.log(`✅ Bot ${enabled ? 'enabled' : 'disabled'} successfully for ${walletAddress}`);
      
      return NextResponse.json({
        success: true,
        data: {
          walletAddress: botState.user_vault_address,
          enabled: botState.is_enabled,
          lastUpdated: botState.updated_at
        },
        performance: `${duration}ms`,
        requestId: `bot_toggle_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      });
    } else {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Failed to update bot state',
          performance: `${duration}ms` 
        },
        { status: 500 }
      );
    }
    
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('❌ Bot toggle API error:', error);
    
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to toggle bot state',
        performance: `${duration}ms`
      },
      { status: 500 }
    );
  }
}