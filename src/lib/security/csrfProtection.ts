/**
 * CSRF Protection Implementation
 * SECURITY FIX: Phase 2 - Protect against Cross-Site Request Forgery attacks
 */

import { NextRequest, NextResponse } from 'next/server';
import { createHash, randomBytes } from 'crypto';

export class CSRFProtection {
  private static readonly CSRF_TOKEN_LENGTH = 32;
  private static readonly CSRF_COOKIE_NAME = 'xorj_csrf_token';
  private static readonly CSRF_HEADER_NAME = 'x-csrf-token';

  /**
   * Generate a cryptographically secure CSRF token
   */
  static generateToken(): string {
    return randomBytes(this.CSRF_TOKEN_LENGTH).toString('hex');
  }

  /**
   * Create hash of token for comparison (prevents timing attacks)
   */
  private static hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /**
   * Set CSRF token as cookie
   */
  static setTokenCookie(response: NextResponse, token: string): void {
    response.cookies.set(this.CSRF_COOKIE_NAME, token, {
      httpOnly: false, // Client needs to read this to send in headers
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60, // 24 hours
      path: '/'
    });
  }

  /**
   * Get CSRF token from cookie
   */
  static getTokenFromCookie(request: NextRequest): string | null {
    return request.cookies.get(this.CSRF_COOKIE_NAME)?.value || null;
  }

  /**
   * Get CSRF token from request header
   */
  static getTokenFromHeader(request: NextRequest): string | null {
    return request.headers.get(this.CSRF_HEADER_NAME) || null;
  }

  /**
   * Validate CSRF token
   */
  static validateToken(request: NextRequest): { valid: boolean; error?: string } {
    const cookieToken = this.getTokenFromCookie(request);
    const headerToken = this.getTokenFromHeader(request);

    // Both tokens must be present
    if (!cookieToken) {
      return { valid: false, error: 'CSRF cookie token missing' };
    }

    if (!headerToken) {
      return { valid: false, error: 'CSRF header token missing' };
    }

    // Tokens must match (constant-time comparison)
    const cookieHash = this.hashToken(cookieToken);
    const headerHash = this.hashToken(headerToken);

    if (cookieHash !== headerHash) {
      return { valid: false, error: 'CSRF token mismatch' };
    }

    return { valid: true };
  }

  /**
   * Check if request needs CSRF validation
   */
  static needsCSRFValidation(request: NextRequest): boolean {
    const method = request.method.toLowerCase();
    
    // Only validate state-changing operations
    const stateMutatingMethods = ['post', 'put', 'delete', 'patch'];
    
    // Skip validation for safe methods
    if (!stateMutatingMethods.includes(method)) {
      return false;
    }

    // Skip validation for login endpoint (chicken-and-egg problem)
    const pathname = new URL(request.url).pathname;
    if (pathname === '/api/auth/login') {
      return false;
    }

    return true;
  }

  /**
   * Middleware for CSRF protection
   */
  static middleware(request: NextRequest): NextResponse | null {
    // Check if CSRF validation is needed
    if (!this.needsCSRFValidation(request)) {
      return null; // Continue without validation
    }

    // Validate CSRF token
    const validation = this.validateToken(request);
    
    if (!validation.valid) {
      console.warn(`🛡️ CSRF validation failed: ${validation.error} for ${request.url}`);
      
      return new NextResponse(
        JSON.stringify({
          error: 'CSRF_VALIDATION_FAILED',
          message: 'Cross-site request forgery validation failed',
          details: validation.error
        }),
        { 
          status: 403,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    return null; // Continue to next middleware
  }

  /**
   * Generate CSRF token API response
   */
  static generateTokenResponse(): NextResponse {
    const token = this.generateToken();
    
    const response = NextResponse.json({
      success: true,
      csrf_token: token,
      generated_at: new Date().toISOString()
    });

    this.setTokenCookie(response, token);
    
    return response;
  }
}