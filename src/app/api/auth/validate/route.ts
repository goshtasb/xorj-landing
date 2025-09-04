import { NextRequest } from 'next/server';
import jwt from 'jsonwebtoken';
import { createErrorResponse, createSuccessResponse } from '@/lib/validation/middleware';
import { secureEnv } from '@/lib/security/envInit';

/**
 * JWT Token Validation API - Validates httpOnly session cookie
 * GET /api/auth/validate
 */
export async function GET(request: NextRequest) {
  try {
    // Get JWT token from httpOnly cookie
    const token = request.cookies.get('xorj_session_token')?.value;
    
    if (!token) {
      return createErrorResponse(
        'AUTHENTICATION_ERROR',
        'No authentication token found',
        'Please log in to access this resource',
        401
      );
    }

    // Verify JWT token using secure environment
    const envConfig = secureEnv.getConfig();
    
    if (!envConfig.isValid || !envConfig.config.jwt.secret) {
      console.error('❌ JWT configuration invalid during token validation');
      return createErrorResponse(
        'INTERNAL_ERROR',
        'Authentication service unavailable',
        'Unable to validate authentication token',
        503
      );
    }

    try {
      // Verify and decode the JWT token
      const decoded = jwt.verify(token, envConfig.config.jwt.secret, {
        algorithms: [envConfig.config.jwt.algorithm as jwt.Algorithm]
      }) as { wallet_address: string; exp: number; iat: number };

      // Token is valid
      return createSuccessResponse({
        message: 'Token is valid',
        user_id: decoded.wallet_address,
        expires_at: new Date(decoded.exp * 1000).toISOString()
      });
      
    } catch (jwtError) {
      console.log('❌ Invalid JWT token during validation:', jwtError);
      
      // Clear invalid cookie
      const response = createErrorResponse(
        'AUTHENTICATION_ERROR',
        'Invalid or expired token',
        'Please log in again',
        401
      );
      
      response.cookies.set('xorj_session_token', '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 0, // Expire immediately
        path: '/',
      });
      
      return response;
    }

  } catch (error) {
    console.error('Token validation error:', error);
    return createErrorResponse(
      'INTERNAL_ERROR',
      'Token validation failed',
      error instanceof Error ? error.message : 'Unknown error',
      500
    );
  }
}