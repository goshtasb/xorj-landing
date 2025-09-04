/**
 * Session Management API - Check Session Status
 * GET /api/auth/session
 * SECURITY FIX: Phase 2 - Secure session management with httpOnly cookies
 */

import { NextRequest } from 'next/server';
import { createErrorResponse, createSuccessResponse } from '@/lib/validation/middleware';
import { SecureTokenManager } from '@/lib/secureTokenManager';

export async function GET(request: NextRequest) {
  try {
    // Get token from httpOnly cookie (using request.cookies instead of SecureTokenManager)
    const token = request.cookies.get('xorj_session_token')?.value || null;
    
    if (!token) {
      return createErrorResponse(
        'UNAUTHORIZED',
        'No session found',
        'User is not authenticated',
        401
      );
    }

    // Validate token
    const validation = SecureTokenManager.validateToken(token);
    
    if (!validation.valid) {
      // Clear invalid cookie using NextResponse
      const response = createErrorResponse(
        'UNAUTHORIZED',
        'Invalid session',
        validation.error || 'Token validation failed',
        401
      );
      
      // Note: Cannot set cookies in error response from createErrorResponse
      // Client should handle by calling logout endpoint
      return response;
    }

    const walletAddress = SecureTokenManager.getWalletAddress(token);
    const needsRefresh = SecureTokenManager.needsRefresh(token);

    return createSuccessResponse({
      authenticated: true,
      wallet_address: walletAddress,
      needs_refresh: needsRefresh,
      expires_at: validation.payload?.exp ? new Date(validation.payload.exp * 1000).toISOString() : null
    });

  } catch (error) {
    console.error('❌ Session check error:', error);
    return createErrorResponse(
      'INTERNAL_ERROR',
      'Session check failed',
      undefined,
      500
    );
  }
}