/**
 * JWT Token Management Utilities
 * Handles token refresh, validation, and cleanup
 */

interface TokenPayload {
  wallet_address?: string;
  user_id?: string;
  iat?: number;
  exp?: number;
}

export class TokenManager {
  private static readonly TOKEN_KEY = 'xorj_session_token';
  private static readonly JWT_TOKEN_KEY = 'xorj_jwt_token';

  /**
   * Get current session token from localStorage
   */
  static getToken(): string | null {
    if (typeof window === 'undefined') return null;
    
    return localStorage.getItem(this.TOKEN_KEY) || 
           localStorage.getItem(this.JWT_TOKEN_KEY);
  }

  /**
   * Store session token in localStorage
   */
  static setToken(token: string): void {
    if (typeof window === 'undefined') return;
    
    localStorage.setItem(this.TOKEN_KEY, token);
    // Also store as JWT token for backward compatibility
    localStorage.setItem(this.JWT_TOKEN_KEY, token);
  }

  /**
   * Clear all tokens from localStorage
   */
  static clearTokens(): void {
    if (typeof window === 'undefined') return;
    
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.JWT_TOKEN_KEY);
    
    console.log('🔒 Session tokens cleared');
  }

  /**
   * Check if current token is expired or invalid
   */
  static isTokenExpired(token: string): boolean {
    try {
      // Simple JWT decode without verification (just to check expiry)
      const payload = JSON.parse(atob(token.split('.')[1])) as TokenPayload;
      
      if (!payload.exp) {
        return true; // No expiration claim means invalid
      }
      
      const currentTime = Math.floor(Date.now() / 1000);
      return payload.exp < currentTime;
    } catch {
      return true; // Invalid format means expired
    }
  }

  /**
   * Check if token needs refresh (expires in next 5 minutes)
   */
  static needsRefresh(token: string): boolean {
    try {
      const payload = JSON.parse(atob(token.split('.')[1])) as TokenPayload;
      
      if (!payload.exp) {
        return true;
      }
      
      const currentTime = Math.floor(Date.now() / 1000);
      const fiveMinutes = 5 * 60;
      return payload.exp < (currentTime + fiveMinutes);
    } catch {
      return true;
    }
  }

  /**
   * Force token refresh by clearing current tokens
   * This will trigger re-authentication
   */
  static forceRefresh(): void {
    console.log('🔄 Forcing token refresh...');
    this.clearTokens();
    
    // Trigger a page reload to restart authentication flow
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  }

  /**
   * Validate token format and basic structure
   */
  static isValidTokenFormat(token: string): boolean {
    try {
      // JWT should have 3 parts separated by dots
      const parts = token.split('.');
      if (parts.length !== 3) {
        return false;
      }
      
      // Try to decode payload
      const payload = JSON.parse(atob(parts[1])) as TokenPayload;
      
      // Should have either wallet_address or user_id
      return !!(payload.wallet_address || payload.user_id);
    } catch {
      return false;
    }
  }

  /**
   * Get wallet address from current token
   */
  static getWalletAddress(): string | null {
    const token = this.getToken();
    if (!token) return null;
    
    try {
      const payload = JSON.parse(atob(token.split('.')[1])) as TokenPayload;
      return payload.wallet_address || payload.user_id || null;
    } catch {
      return null;
    }
  }

  /**
   * Check if current session is valid
   */
  static isValidSession(): boolean {
    const token = this.getToken();
    
    if (!token) {
      return false;
    }
    
    if (!this.isValidTokenFormat(token)) {
      console.log('⚠️ Invalid token format detected, clearing...');
      this.clearTokens();
      return false;
    }
    
    if (this.isTokenExpired(token)) {
      console.log('⚠️ Token expired, clearing...');
      this.clearTokens();
      return false;
    }
    
    return true;
  }

  /**
   * Auto-cleanup old or invalid tokens
   */
  static cleanup(): void {
    const token = this.getToken();
    
    if (token && (!this.isValidTokenFormat(token) || this.isTokenExpired(token))) {
      console.log('🧹 Cleaning up invalid/expired tokens');
      this.clearTokens();
    }
  }
}

// Auto-cleanup on module load
if (typeof window !== 'undefined') {
  TokenManager.cleanup();
}