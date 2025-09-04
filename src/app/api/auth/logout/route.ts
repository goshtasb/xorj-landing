/**
 * Logout API - Clear Session
 * POST /api/auth/logout
 * SECURITY FIX: Phase 2 - Secure session logout with httpOnly cookie clearing
 */

import { NextRequest } from 'next/server';
import { createErrorResponse, createSuccessResponse } from '@/lib/validation/middleware';
import { SecureTokenManager } from '@/lib/secureTokenManager';

export async function POST(request: NextRequest) {
  try {
    // Get current token to log the action
    const token = request.cookies.get('xorj_session_token')?.value || null;
    const walletAddress = token ? SecureTokenManager.getWalletAddress(token) : 'unknown';

    console.log(`🔓 User logged out: ${walletAddress}`);

    // Create response and clear the cookie
    const response = createSuccessResponse({
      message: 'Logged out successfully',
      logged_out_at: new Date().toISOString()
    });

    // Clear the session cookie
    response.cookies.set('xorj_session_token', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 0, // Expire immediately
      path: '/',
    });

    return response;

  } catch (error) {
    console.error('❌ Logout error:', error);
    
    // Still try to clear the cookie even if there was an error
    const response = createErrorResponse(
      'INTERNAL_ERROR',
      'Logout failed',
      undefined,
      500
    );

    response.cookies.set('xorj_session_token', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 0,
      path: '/',
    });

    return response;
  }
}