/**
 * Authentication Utilities
 * Handles JWT token extraction from both Authorization headers and httpOnly cookies
 * SECURITY FIX: Support migration from localStorage to httpOnly cookies
 */

import { NextRequest } from 'next/server';
import jwt from 'jsonwebtoken';
import { TokenManager } from './tokenManager';

export interface TokenData {
  token: string;
  wallet_address: string;
  source: 'header' | 'cookie';
}

export interface TokenExtractionResult {
  success: boolean;
  data?: TokenData;
  error?: string;
}

/**
 * Extract and verify JWT token from request (Authorization header or httpOnly cookie)
 * Priority: Authorization header first, then httpOnly cookie
 */
export function extractTokenFromRequest(request: NextRequest, jwtSecret: string): TokenExtractionResult {
  let token: string | null = null;
  let source: 'header' | 'cookie' = 'header';

  // Try Authorization header first (for existing clients)
  const authorization = request.headers.get('authorization');
  if (authorization && authorization.startsWith('Bearer ')) {
    token = authorization.replace('Bearer ', '');
    source = 'header';
  }

  // Fall back to httpOnly cookie (for new secure clients)
  if (!token) {
    token = request.cookies.get('xorj_session_token')?.value || null;
    source = 'cookie';
  }

  if (!token) {
    return {
      success: false,
      error: 'No authentication token found'
    };
  }

  // Verify and decode the JWT token
  try {
    const decoded = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] }) as { 
      wallet_address?: string; 
      sub?: string;
      user_id?: string;
    };
    
    const walletAddress = decoded?.wallet_address || decoded?.sub || decoded?.user_id;
    
    if (!walletAddress) {
      return {
        success: false,
        error: 'No wallet address found in token'
      };
    }

    return {
      success: true,
      data: {
        token,
        wallet_address: walletAddress,
        source
      }
    };
  } catch (error) {
    return {
      success: false,
      error: `JWT verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

/**
 * Extract wallet address from request with development bypass
 * Handles both Authorization headers and httpOnly cookies
 */
export function extractWalletAddress(request: NextRequest, jwtSecret: string): {
  success: boolean;
  walletAddress?: string;
  source?: 'header' | 'cookie' | 'development';
  error?: string;
} {
  // Development bypass - if no auth provided in dev mode
  const authorization = request.headers.get('authorization');
  const cookieToken = request.cookies.get('xorj_session_token')?.value;
  
  if ((!authorization || !authorization.startsWith('Bearer ')) && !cookieToken && process.env.NODE_ENV === 'development') {
    return {
      success: true,
      walletAddress: '5QfzCCipXjebAfHpMhCJAoxUJL2TyqM5p8tCFLjsPbmh',
      source: 'development'
    };
  }

  // Extract from authentication
  const result = extractTokenFromRequest(request, jwtSecret);
  
  if (!result.success) {
    return {
      success: false,
      error: result.error
    };
  }

  return {
    success: true,
    walletAddress: result.data!.wallet_address,
    source: result.data!.source
  };
}

// Legacy client-side utilities (preserved for backward compatibility)
export const AuthUtils = {
  /**
   * Clear all authentication data and refresh the page
   */
  refreshAuth(): void {
    console.log('🔄 Refreshing authentication...');
    TokenManager.clearTokens();
    
    // Clear any other auth-related localStorage items
    if (typeof window !== 'undefined') {
      // Clear any cached wallet connection state
      localStorage.removeItem('walletAdapter');
      
      // Force page refresh to restart auth flow
      window.location.reload();
    }
  },

  /**
   * Check if user has valid authentication
   */
  isAuthenticated(): boolean {
    return TokenManager.isValidSession();
  },

  /**
   * Get current wallet address from token
   */
  getWalletAddress(): string | null {
    return TokenManager.getWalletAddress();
  },

  /**
   * Debug authentication state
   */
  debugAuth(): void {
    const token = TokenManager.getToken();
    const isValid = TokenManager.isValidSession();
    const walletAddress = TokenManager.getWalletAddress();
    
    console.log('🔍 Authentication Debug:', {
      hasToken: !!token,
      tokenLength: token?.length,
      isValidSession: isValid,
      walletAddress: walletAddress,
      tokenFormat: token ? TokenManager.isValidTokenFormat(token) : false
    });
  }
};

// Add global debug function for easy access in browser console
if (typeof window !== 'undefined') {
  (window as Window & { debugAuth?: typeof AuthUtils.debugAuth; refreshAuth?: typeof AuthUtils.refreshAuth }).debugAuth = AuthUtils.debugAuth;
  (window as Window & { debugAuth?: typeof AuthUtils.refreshAuth }).refreshAuth = AuthUtils.refreshAuth;
}