/**
 * Secure JWT Token Management with httpOnly Cookies
 * SECURITY FIX: Phase 2 - Move JWT storage from localStorage to secure cookies
 */

import { cookies } from 'next/headers';

interface TokenPayload {
  wallet_address?: string;
  user_id?: string;
  iat?: number;
  exp?: number;
}

export class SecureTokenManager {
  private static readonly TOKEN_COOKIE_NAME = 'xorj_session_token';
  private static readonly MAX_AGE = 24 * 60 * 60; // 24 hours in seconds

  /**
   * Set secure session token as httpOnly cookie
   * SECURITY: httpOnly prevents XSS access, secure forces HTTPS, sameSite prevents CSRF
   */
  static setTokenCookie(token: string): void {
    const cookieOptions = {
      name: this.TOKEN_COOKIE_NAME,
      value: token,
      httpOnly: true, // Prevents XSS attacks
      secure: process.env.NODE_ENV === 'production', // HTTPS only in production
      sameSite: 'strict' as const, // Prevents CSRF attacks
      maxAge: this.MAX_AGE,
      path: '/', // Available for all routes
    };

    // Set the cookie (server-side)
    if (typeof window === 'undefined') {
      const cookieStore = cookies();
      cookieStore.set(cookieOptions);
    }
  }

  /**
   * Get session token from httpOnly cookie
   */
  static getTokenFromCookie(): string | null {
    if (typeof window !== 'undefined') {
      // Client-side: Cookie is httpOnly, so we can't access it directly
      // This is by design for security
      return null;
    }

    try {
      const cookieStore = cookies();
      return cookieStore.get(this.TOKEN_COOKIE_NAME)?.value || null;
    } catch (error) {
      console.error('Error reading token cookie:', error);
      return null;
    }
  }

  /**
   * Clear session token cookie
   */
  static clearTokenCookie(): void {
    if (typeof window === 'undefined') {
      const cookieStore = cookies();
      cookieStore.delete(this.TOKEN_COOKIE_NAME);
    }
  }

  /**
   * Validate token structure and expiration
   */
  static validateToken(token: string): { valid: boolean; payload?: TokenPayload; error?: string } {
    try {
      // JWT should have 3 parts
      const parts = token.split('.');
      if (parts.length !== 3) {
        return { valid: false, error: 'Invalid token format' };
      }

      // Decode payload
      const payload = JSON.parse(atob(parts[1])) as TokenPayload;
      
      // Check required fields
      if (!payload.wallet_address && !payload.user_id) {
        return { valid: false, error: 'Missing user identifier' };
      }

      // Check expiration
      if (!payload.exp) {
        return { valid: false, error: 'Missing expiration claim' };
      }

      const currentTime = Math.floor(Date.now() / 1000);
      if (payload.exp < currentTime) {
        return { valid: false, error: 'Token expired' };
      }

      return { valid: true, payload };
    } catch (error) {
      return { valid: false, error: `Token validation failed: ${error}` };
    }
  }

  /**
   * Check if token needs refresh (expires within 5 minutes)
   */
  static needsRefresh(token: string): boolean {
    const validation = this.validateToken(token);
    
    if (!validation.valid || !validation.payload?.exp) {
      return true;
    }

    const currentTime = Math.floor(Date.now() / 1000);
    const fiveMinutes = 5 * 60;
    return validation.payload.exp < (currentTime + fiveMinutes);
  }

  /**
   * Extract wallet address from token
   */
  static getWalletAddress(token: string): string | null {
    const validation = this.validateToken(token);
    
    if (!validation.valid || !validation.payload) {
      return null;
    }

    return validation.payload.wallet_address || validation.payload.user_id || null;
  }
}

/**
 * Client-side session management (without access to httpOnly cookie)
 * Uses secure API calls to check session status
 */
export class ClientSessionManager {
  private static sessionChecked = false;
  private static isValid = false;

  /**
   * Check if user has valid session by calling API
   */
  static async checkSession(): Promise<boolean> {
    try {
      const response = await fetch('/api/auth/session', {
        method: 'GET',
        credentials: 'include', // Include httpOnly cookies
        headers: {
          'Content-Type': 'application/json',
        },
      });

      this.isValid = response.ok;
      this.sessionChecked = true;
      return this.isValid;
    } catch (error) {
      console.error('Session check failed:', error);
      this.isValid = false;
      this.sessionChecked = true;
      return false;
    }
  }

  /**
   * Get cached session status (call checkSession first)
   */
  static getSessionStatus(): { checked: boolean; valid: boolean } {
    return {
      checked: this.sessionChecked,
      valid: this.isValid
    };
  }

  /**
   * Clear session (logout)
   */
  static async logout(): Promise<boolean> {
    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      this.isValid = false;
      this.sessionChecked = true;
      return response.ok;
    } catch (error) {
      console.error('Logout failed:', error);
      return false;
    }
  }

  /**
   * Reset session state
   */
  static reset(): void {
    this.sessionChecked = false;
    this.isValid = false;
  }
}