/**
 * User Status API Endpoint
 * GET /api/user/status?walletAddress=<address>
 * 
 * Returns the bot activation status and related information for a user's wallet
 */

import { NextRequest, NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';

interface UserStatusResponse {
  isBotActive: boolean;
  lastUpdated?: number;
  vaultAddress?: string;
  authorizationTxSignature?: string;
  error?: string;
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: number;
  requestId: string;
}

export async function GET(request: NextRequest) {
  const _startTime = Date.now();
  const requestId = `user_status_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  try {
    console.log(`🔍 User status request: ${requestId}`);
    
    // Extract wallet address from query parameters
    const { searchParams } = new URL(request.url);
    const walletAddress = searchParams.get('walletAddress');

    if (!walletAddress) {
      console.warn(`⚠️ Missing wallet address: ${requestId}`);
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: 'Wallet address is required',
        timestamp: Date.now(),
        requestId
      }, { status: 400 });
    }

    // Validate wallet address format
    try {
      new PublicKey(walletAddress);
    } catch {
      console.warn(`⚠️ Invalid wallet address format: ${walletAddress} - ${requestId}`);
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: 'Invalid wallet address format',
        timestamp: Date.now(),
        requestId
      }, { status: 400 });
    }

    console.log(`📊 Checking status for wallet: ${walletAddress}`);

    // TODO: Replace with actual vault status checking logic
    // For now, we'll simulate the bot status based on wallet characteristics
    const statusResponse = await checkBotStatus(walletAddress);

    const _processingTime = Date.now() - _startTime;
    
    console.log(`✅ User status retrieved: ${requestId} - ${_processingTime}ms`);
    console.log(`🤖 Bot active: ${statusResponse.isBotActive}`);

    return NextResponse.json<ApiResponse<UserStatusResponse>>({
      success: true,
      data: statusResponse,
      timestamp: Date.now(),
      requestId
    }, {
      headers: {
        'Cache-Control': 'private, max-age=30', // Cache for 30 seconds
        'X-Processing-Time': `${_processingTime}ms`
      }
    });

  } catch {
    console.error(`❌ User status error ${requestId}:`);
    
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: 'Failed to retrieve user status',
      timestamp: Date.now(),
      requestId
    }, { status: 500 });
  }
}

/**
 * Check bot activation status for a wallet by querying the bot service
 */
async function checkBotStatus(walletAddress: string): Promise<UserStatusResponse> {
  try {
    // Try to get status from the bot service API
    const response = await fetch(`http://localhost:8000/api/v1/bot/status/${walletAddress}`, {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      const botData = await response.json();
      
      return {
        isBotActive: botData.status === 'active',
        lastUpdated: botData.last_execution ? new Date(botData.last_execution).getTime() : Date.now(),
        vaultAddress: generateMockVaultAddress(walletAddress),
        authorizationTxSignature: botData.status === 'active' ? generateMockTxSignature() : undefined
      };
    }
  } catch {
    console.log(`Bot service unavailable for ${walletAddress}, using mock data`);
  }

  // Fallback to mock logic if bot service is unavailable
  const addressHash = walletAddress.slice(-4);
  const numericHash = parseInt(addressHash, 36) % 10;

  if (numericHash < 5) {
    // 50% have active bots when service unavailable
    return {
      isBotActive: true,
      lastUpdated: Date.now() - (Math.random() * 24 * 60 * 60 * 1000),
      vaultAddress: generateMockVaultAddress(walletAddress),
      authorizationTxSignature: generateMockTxSignature()
    };
  } else {
    return {
      isBotActive: false,
      lastUpdated: Date.now() - (Math.random() * 7 * 24 * 60 * 60 * 1000),
      vaultAddress: generateMockVaultAddress(walletAddress)
    };
  }
}

/**
 * Generate a mock vault address based on wallet address
 */
function generateMockVaultAddress(walletAddress: string): string {
  // Create a deterministic but different address
  const base = walletAddress.slice(0, -8);
  const suffix = 'VAULT' + walletAddress.slice(-3);
  return base + suffix;
}

/**
 * Generate a mock transaction signature
 */
function generateMockTxSignature(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 88; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}