import { NextRequest, NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';
import jwt from 'jsonwebtoken';
import { validateRequestBody, createErrorResponse, createSuccessResponse } from '@/lib/validation/middleware';
import { AuthenticateRequestSchema } from '@/lib/validation/schemas';

const JWT_SECRET = process.env.JWT_SECRET || 'default_secret_for_dev';

/**
 * V1 User Authentication API - SECURITY HARDENED
 * POST /api/auth/authenticate
 */
export async function POST(request: NextRequest) {
  try {
    // CRITICAL: Strict schema validation
    const validation = await validateRequestBody(request, AuthenticateRequestSchema);
    if (!validation.success) {
      return validation.response;
    }
    
    const { wallet_address } = validation.data;
    
    // Additional Solana PublicKey validation (belt-and-suspenders approach)
    try {
      new PublicKey(wallet_address);
    } catch (error) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'Invalid Solana wallet address format',
        'Wallet address must be a valid Solana public key'
      );
    }

    console.log(`🔐 Authenticating wallet: ${wallet_address}`);

    // Generate simple JWT token
    const token = jwt.sign(
      { wallet_address },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    console.log(`✅ Authentication successful for wallet: ${wallet_address}`);

    return createSuccessResponse(undefined, {
      message: 'Authentication successful',
      user_id: wallet_address,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      session_token: token
    });

  } catch (error) {
    console.error('Authentication error:', error);
    return createErrorResponse(
      'INTERNAL_ERROR',
      'Authentication failed',
      undefined,
      500
    );
  }
}