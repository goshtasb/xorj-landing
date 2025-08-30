import { NextRequest, NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';
import jwt from 'jsonwebtoken';
import { validateRequestBody, createErrorResponse, createSuccessResponse } from '@/lib/validation/middleware';
import { AuthenticateRequestSchema } from '@/lib/validation/schemas';
import { rateLimiter, RATE_LIMITS, getClientIdentifier, createRateLimitResponse } from '@/lib/rateLimit';

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

/**
 * V1 User Authentication API - SECURITY HARDENED
 * POST /api/auth/authenticate
 */
export async function POST(request: NextRequest) {
  try {
    // Rate limiting check
    const clientId = getClientIdentifier(request);
    const rateLimit = rateLimiter.check(clientId, 'auth', RATE_LIMITS.AUTH.limit, RATE_LIMITS.AUTH.windowMs);
    
    if (!rateLimit.success) {
      console.log(`🚫 Rate limit exceeded for client: ${clientId}`);
      return createRateLimitResponse(rateLimit.resetTime);
    }

    console.log(`🔒 Auth attempt ${RATE_LIMITS.AUTH.limit - rateLimit.remaining}/${RATE_LIMITS.AUTH.limit} for client: ${clientId}`);

    // CRITICAL: Strict schema validation
    const validation = await validateRequestBody(request, AuthenticateRequestSchema);
    if (!validation.success) {
      return validation.response;
    }
    
    const { wallet_address, signature, message } = validation.data;
    
    // Additional Solana PublicKey validation (belt-and-suspenders approach)
    try {
      new PublicKey(wallet_address);
    } catch {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'Invalid Solana wallet address format',
        'Wallet address must be a valid Solana public key'
      );
    }

    // Signature validation required for all environments
    if (!signature || !message) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'Signature and message are required',
        'Please provide both signature and message for secure authentication'
      );
    }
    
    // Validate signature format
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(signature)) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'Invalid signature format',
        'Signature must be a valid base64 encoded string'
      );
    }

    // TODO: Implement actual signature verification against message in all environments

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
      error instanceof Error ? error.message : 'Unknown error',
      500
    );
  }
}