/**
 * Token Refresh API - Renew authentication tokens
 * POST /api/auth/refresh
 * SECURITY FIX: Phase 3 - Implement automatic token refresh for better UX
 */

import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { createErrorResponse } from '@/lib/validation/middleware';
import { SecureTokenManager } from '@/lib/secureTokenManager';
import { secureEnv } from '@/lib/security/envInit';

export async function POST(request: NextRequest) {
  try {
    // Get token from httpOnly cookie
    const currentToken = request.cookies.get('xorj_session_token')?.value;
    
    if (!currentToken) {
      return createErrorResponse(
        'UNAUTHORIZED',
        'No session found',
        'User is not authenticated',
        401
      );
    }

    // Validate current token
    const validation = SecureTokenManager.validateToken(currentToken);
    
    if (!validation.valid || !validation.payload) {
      // Clear invalid cookie
      const response = NextResponse.json(
        createErrorResponse(
          'UNAUTHORIZED',
          'Invalid session',
          validation.error || 'Token validation failed',
          401
        ).body
      );
      
      response.cookies.delete('xorj_session_token');
      return response;
    }

    // Check if token is expired (shouldn't refresh expired tokens)
    const currentTime = Math.floor(Date.now() / 1000);
    if (validation.payload.exp && validation.payload.exp < currentTime) {
      const response = NextResponse.json(
        createErrorResponse(
          'UNAUTHORIZED',
          'Session expired',
          'Token has expired and cannot be refreshed',
          401
        ).body
      );
      
      response.cookies.delete('xorj_session_token');
      return response;
    }

    // Generate new token with extended expiration
    const envConfig = secureEnv.getConfig();
    
    if (!envConfig.isValid || !envConfig.config.jwt.secret) {
      console.error('❌ JWT configuration invalid during token refresh');
      return createErrorResponse(
        'INTERNAL_ERROR',
        'Authentication service unavailable',
        'Unable to refresh authentication token',
        503
      );
    }

    const walletAddress = validation.payload.wallet_address || validation.payload.user_id;
    
    if (!walletAddress) {
      return createErrorResponse(
        'UNAUTHORIZED',
        'Invalid token payload',
        'No wallet address found in token',
        401
      );
    }

    const newToken = jwt.sign(
      { wallet_address: walletAddress },
      envConfig.config.jwt.secret,
      { 
        expiresIn: '24h',
        algorithm: envConfig.config.jwt.algorithm as jwt.Algorithm
      }
    );

    console.log(`🔄 Token refreshed for wallet: ${walletAddress}`);

    // Return success response with new token set as httpOnly cookie
    const response = NextResponse.json({
      success: true,
      data: {
        message: 'Token refreshed successfully',
        user_id: walletAddress,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      }
    });

    // Set new secure httpOnly cookie
    response.cookies.set('xorj_session_token', newToken, {
      httpOnly: true, // Prevents XSS attacks
      secure: process.env.NODE_ENV === 'production', // HTTPS only in production
      sameSite: 'strict', // Prevents CSRF attacks
      maxAge: 24 * 60 * 60, // 24 hours in seconds
      path: '/', // Available for all routes
    });

    return response;

  } catch (error) {
    console.error('❌ Token refresh error:', error);
    return createErrorResponse(
      'INTERNAL_ERROR',
      'Token refresh failed',
      undefined,
      500
    );
  }
}