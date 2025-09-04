import { NextRequest, NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';
import nacl from 'tweetnacl';
import jwt from 'jsonwebtoken';
import { validateRequestBody, createErrorResponse } from '@/lib/validation/middleware';
import { AuthenticateRequestSchema } from '@/lib/validation/schemas';
import { rateLimiter, RATE_LIMITS, getClientIdentifier, createRateLimitResponse } from '@/lib/rateLimit';
import { secureEnv } from '@/lib/security/envInit';

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

    // CRITICAL: Verify signature against message using Solana's ed25519 verification
    try {
      const publicKey = new PublicKey(wallet_address);
      
      // Special handling for development mode with placeholder signature
      const isDevelopmentPlaceholder = signature === 'YXV0aGVudGljYXRlZF92aWFfd2FsbGV0X2FkYXB0ZXI=';
      
      if (process.env.NODE_ENV === 'development' && isDevelopmentPlaceholder) {
        console.log('🔓 Development mode: Accepting wallet adapter authentication for:', wallet_address);
        // In development, accept the placeholder signature from SimpleWalletContext
      } else {
        // Production signature verification
        const signatureBytes = Buffer.from(signature, 'base64');
        const messageBytes = Buffer.from(message, 'utf8');

        const isValidSignature = nacl.sign.detached.verify(
          messageBytes,
          signatureBytes,
          publicKey.toBytes()
        );

        if (!isValidSignature) {
          return createErrorResponse(
            'AUTHENTICATION_ERROR',
            'Invalid signature',
            'The provided signature does not match the message for this wallet'
          );
        }
      }
    } catch (error) {
      console.error('Signature verification error:', error);
      return createErrorResponse(
        'AUTHENTICATION_ERROR',
        'Signature verification failed',
        'Failed to verify the cryptographic signature'
      );
    }

    console.log(`🔐 Signature verified successfully for wallet: ${wallet_address}`);

    // Generate JWT token using secure environment
    const envConfig = secureEnv.getConfig();
    
    if (!envConfig.isValid || !envConfig.config.jwt.secret) {
      console.error('❌ JWT configuration invalid during token generation');
      return createErrorResponse(
        'INTERNAL_ERROR',
        'Authentication service unavailable',
        'Unable to generate authentication token',
        503
      );
    }

    const token = jwt.sign(
      { wallet_address },
      envConfig.config.jwt.secret,
      { 
        expiresIn: '24h',
        algorithm: envConfig.config.jwt.algorithm as jwt.Algorithm
      }
    );

    console.log(`✅ Authentication successful for wallet: ${wallet_address}`);

    // SECURITY FIX: Set token as secure httpOnly cookie instead of returning it
    const response = NextResponse.json({
      success: true,
      data: {
        message: 'Authentication successful',
        user_id: wallet_address,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        // Note: No session_token in response body for security
      }
    });

    // Set secure httpOnly cookie
    response.cookies.set('xorj_session_token', token, {
      httpOnly: true, // Prevents XSS attacks
      secure: process.env.NODE_ENV === 'production', // HTTPS only in production
      sameSite: 'strict', // Prevents CSRF attacks
      maxAge: 24 * 60 * 60, // 24 hours in seconds
      path: '/', // Available for all routes
    });

    return response;

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