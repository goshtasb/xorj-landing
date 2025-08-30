/**
 * Security Middleware System
 * Centralized security controls for all API endpoints
 * 
 * Features:
 * - Rate limiting enforcement
 * - Request validation and sanitization
 * - Security headers enforcement
 * - Attack pattern detection
 * - Comprehensive security logging
 * 
 * Integration with Next.js middleware for edge protection
 */

import { NextRequest, NextResponse } from 'next/server';
import { createRateLimitMiddleware, RATE_LIMIT_TIERS } from './rateLimiter';

/**
 * Security Configuration per Route
 */
interface RouteSecurityConfig {
  rateLimitTier: keyof typeof RATE_LIMIT_TIERS;
  requireAuth?: boolean;
  validateCSRF?: boolean;
  allowCORS?: boolean;
  customHeaders?: Record<string, string>;
  logRequests?: boolean;
}

/**
 * Route Security Mappings
 * Maps URL patterns to security configurations
 */
const ROUTE_SECURITY_CONFIG: Record<string, RouteSecurityConfig> = {
  // Authentication endpoints - highest security
  '/api/auth/*': {
    rateLimitTier: 'AUTH',
    requireAuth: false,
    validateCSRF: true,
    allowCORS: false,
    logRequests: true
  },
  
  // Trading endpoints - strict rate limiting
  '/api/bot/*': {
    rateLimitTier: 'TRADING',
    requireAuth: true,
    validateCSRF: true,
    allowCORS: false,
    logRequests: true
  },
  
  '/api/vault/*': {
    rateLimitTier: 'TRADING',
    requireAuth: true,
    validateCSRF: true,
    allowCORS: false,
    logRequests: true
  },
  
  '/api/risk-management/*': {
    rateLimitTier: 'TRADING',
    requireAuth: true,
    validateCSRF: false, // Internal service calls
    allowCORS: false,
    logRequests: true
  },
  
  // User endpoints - moderate security
  '/api/user/*': {
    rateLimitTier: 'AUTHENTICATED',
    requireAuth: true,
    validateCSRF: true,
    allowCORS: false,
    logRequests: false
  },
  
  // Admin endpoints - maximum security
  '/api/admin/*': {
    rateLimitTier: 'ADMIN',
    requireAuth: true,
    validateCSRF: true,
    allowCORS: false,
    logRequests: true
  },
  
  '/api/system/*': {
    rateLimitTier: 'ADMIN',
    requireAuth: true,
    validateCSRF: true,
    allowCORS: false,
    logRequests: true
  },
  
  // Health and monitoring - public but limited
  '/api/health': {
    rateLimitTier: 'PUBLIC',
    requireAuth: false,
    validateCSRF: false,
    allowCORS: true,
    logRequests: false
  },
  
  // Database health - internal use only
  '/api/database/*': {
    rateLimitTier: 'ADMIN',
    requireAuth: false, // Internal health checks
    validateCSRF: false,
    allowCORS: false,
    logRequests: true,
    customHeaders: {
      'X-Robots-Tag': 'noindex, nofollow',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    }
  },
  
  // Default for unspecified routes
  '*': {
    rateLimitTier: 'PUBLIC',
    requireAuth: false,
    validateCSRF: false,
    allowCORS: false,
    logRequests: true
  }
};

/**
 * Security Headers Configuration
 */
const SECURITY_HEADERS = {
  // HSTS - Force HTTPS
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  
  // Prevent XSS attacks
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  
  // Content Security Policy
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://cdn.jsdelivr.net",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https:",
    "connect-src 'self' https://api.mainnet-beta.solana.com https://quote-api.jup.ag",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'"
  ].join('; '),
  
  // Referrer Policy
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  
  // Permissions Policy
  'Permissions-Policy': [
    'geolocation=()',
    'microphone=()',
    'camera=()',
    'payment=(self)',
    'usb=()',
    'magnetometer=()',
    'gyroscope=()'
  ].join(', ')
};

/**
 * Security Middleware Class
 */
export class SecurityMiddleware {
  private rateLimitMiddlewares: Map<string, any> = new Map();

  constructor() {
    // Pre-create rate limit middlewares for better performance
    Object.keys(RATE_LIMIT_TIERS).forEach(tier => {
      this.rateLimitMiddlewares.set(tier, createRateLimitMiddleware(tier as keyof typeof RATE_LIMIT_TIERS));
    });
  }

  /**
   * Main middleware function
   */
  async handle(request: NextRequest): Promise<NextResponse> {
    const startTime = Date.now();
    const url = new URL(request.url);
    const pathname = url.pathname;

    try {
      console.log(`🛡️ Security middleware: ${request.method} ${pathname}`);

      // Find matching security configuration
      const config = this.getSecurityConfig(pathname);
      
      // Apply security headers to response
      const response = NextResponse.next();
      this.applySecurityHeaders(response, config);

      // 1. Rate Limiting Check
      const rateLimitResult = await this.checkRateLimit(request, config);
      if (rateLimitResult) {
        this.logSecurityEvent('RATE_LIMIT_EXCEEDED', request, {
          config: config.rateLimitTier,
          pathname
        });
        return rateLimitResult;
      }

      // 2. Authentication Check
      if (config.requireAuth) {
        const authResult = await this.checkAuthentication(request);
        if (authResult) {
          this.logSecurityEvent('AUTH_REQUIRED', request, { pathname });
          return authResult;
        }
      }

      // 3. CSRF Protection
      if (config.validateCSRF && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(request.method)) {
        const csrfResult = await this.validateCSRF(request);
        if (csrfResult) {
          this.logSecurityEvent('CSRF_VALIDATION_FAILED', request, { pathname });
          return csrfResult;
        }
      }

      // 4. Request Validation
      const validationResult = await this.validateRequest(request);
      if (validationResult) {
        this.logSecurityEvent('REQUEST_VALIDATION_FAILED', request, { 
          pathname,
          reason: validationResult.error 
        });
        return validationResult.response;
      }

      // 5. Log successful security check
      if (config.logRequests) {
        const processingTime = Date.now() - startTime;
        this.logSecurityEvent('REQUEST_ALLOWED', request, {
          pathname,
          processingTime,
          config: config.rateLimitTier
        });
      }

      // Add performance timing header
      response.headers.set('X-Security-Processing-Time', `${Date.now() - startTime}ms`);
      
      return response;

    } catch (error) {
      console.error('🚨 Security middleware error:', error);
      
      // Log security system failure
      this.logSecurityEvent('SECURITY_SYSTEM_ERROR', request, {
        pathname,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      // Fail secure - block request on security system failure
      return new NextResponse(
        JSON.stringify({
          error: 'Security system unavailable',
          message: 'Please try again later'
        }),
        {
          status: 503,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': '60'
          }
        }
      );
    }
  }

  /**
   * Get security configuration for route
   */
  private getSecurityConfig(pathname: string): RouteSecurityConfig {
    // Check for exact matches first
    for (const [pattern, config] of Object.entries(ROUTE_SECURITY_CONFIG)) {
      if (pattern === pathname) {
        return config;
      }
    }

    // Check for wildcard matches
    for (const [pattern, config] of Object.entries(ROUTE_SECURITY_CONFIG)) {
      if (pattern.endsWith('/*')) {
        const basePattern = pattern.slice(0, -2);
        if (pathname.startsWith(basePattern)) {
          return config;
        }
      }
    }

    // Return default configuration
    return ROUTE_SECURITY_CONFIG['*'];
  }

  /**
   * Apply security headers to response
   */
  private applySecurityHeaders(response: NextResponse, config: RouteSecurityConfig): void {
    // Apply standard security headers
    Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
      response.headers.set(key, value);
    });

    // Apply CORS headers if allowed
    if (config.allowCORS) {
      response.headers.set('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGINS || '*');
      response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-CSRF-Token');
      response.headers.set('Access-Control-Max-Age', '86400');
    }

    // Apply custom headers
    if (config.customHeaders) {
      Object.entries(config.customHeaders).forEach(([key, value]) => {
        response.headers.set(key, value);
      });
    }

    // Add security metadata
    response.headers.set('X-Security-Config', config.rateLimitTier);
    response.headers.set('X-Security-Timestamp', new Date().toISOString());
  }

  /**
   * Check rate limiting
   */
  private async checkRateLimit(request: NextRequest, config: RouteSecurityConfig): Promise<NextResponse | null> {
    const rateLimitMiddleware = this.rateLimitMiddlewares.get(config.rateLimitTier);
    if (rateLimitMiddleware) {
      return await rateLimitMiddleware(request);
    }
    return null;
  }

  /**
   * Check authentication
   */
  private async checkAuthentication(request: NextRequest): Promise<NextResponse | null> {
    const authHeader = request.headers.get('authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new NextResponse(
        JSON.stringify({
          error: 'Authentication required',
          message: 'Valid authorization header required'
        }),
        {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            'WWW-Authenticate': 'Bearer'
          }
        }
      );
    }

    try {
      // Basic JWT validation (would integrate with full auth system)
      const token = authHeader.replace('Bearer ', '');
      
      // Verify token format
      const parts = token.split('.');
      if (parts.length !== 3) {
        throw new Error('Invalid token format');
      }

      // In production, verify signature and expiration
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
      
      if (!payload.sub && !payload.wallet_address) {
        throw new Error('Invalid token payload');
      }

      return null; // Authentication successful

    } catch (error) {
      return new NextResponse(
        JSON.stringify({
          error: 'Invalid authentication',
          message: 'Token validation failed'
        }),
        {
          status: 401,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );
    }
  }

  /**
   * Validate CSRF token
   */
  private async validateCSRF(request: NextRequest): Promise<NextResponse | null> {
    const csrfToken = request.headers.get('x-csrf-token');
    const cookies = request.headers.get('cookie');
    
    if (!csrfToken) {
      return new NextResponse(
        JSON.stringify({
          error: 'CSRF validation failed',
          message: 'CSRF token required'
        }),
        {
          status: 403,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );
    }

    // In production, validate CSRF token against session
    // For now, just check that it exists and has proper format
    if (!csrfToken.match(/^[a-zA-Z0-9_-]{32,}$/)) {
      return new NextResponse(
        JSON.stringify({
          error: 'CSRF validation failed',
          message: 'Invalid CSRF token format'
        }),
        {
          status: 403,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );
    }

    return null; // CSRF validation successful
  }

  /**
   * Validate request content and structure
   */
  private async validateRequest(request: NextRequest): Promise<{ response: NextResponse; error: string } | null> {
    const url = new URL(request.url);
    
    // Check for suspicious patterns
    const suspiciousPatterns = [
      /\.\./,                    // Path traversal
      /<script/i,               // XSS attempts
      /union.*select/i,         // SQL injection
      /javascript:/i,           // JavaScript injection
      /data:text\/html/i,       // Data URL injection
      /eval\(/i,                // Code injection
      /expression\(/i,          // CSS expression injection
    ];

    const urlString = url.toString();
    const userAgent = request.headers.get('user-agent') || '';
    
    for (const pattern of suspiciousPatterns) {
      if (pattern.test(urlString) || pattern.test(userAgent)) {
        return {
          response: new NextResponse(
            JSON.stringify({
              error: 'Request validation failed',
              message: 'Malicious request detected'
            }),
            {
              status: 400,
              headers: {
                'Content-Type': 'application/json'
              }
            }
          ),
          error: `Suspicious pattern detected: ${pattern}`
        };
      }
    }

    // Validate request size
    const contentLength = request.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > 10 * 1024 * 1024) { // 10MB limit
      return {
        response: new NextResponse(
          JSON.stringify({
            error: 'Request validation failed',
            message: 'Request too large'
          }),
          {
            status: 413,
            headers: {
              'Content-Type': 'application/json'
            }
          }
        ),
        error: `Request too large: ${contentLength} bytes`
      };
    }

    return null; // Validation successful
  }

  /**
   * Log security events
   */
  private logSecurityEvent(
    event: string,
    request: NextRequest,
    metadata: Record<string, any> = {}
  ): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      event,
      method: request.method,
      url: request.url,
      ip: this.getClientIP(request),
      userAgent: request.headers.get('user-agent'),
      ...metadata
    };

    // Log based on event severity
    if (['RATE_LIMIT_EXCEEDED', 'CSRF_VALIDATION_FAILED', 'SECURITY_SYSTEM_ERROR'].includes(event)) {
      console.error('🚨 SECURITY EVENT:', logEntry);
    } else if (['AUTH_REQUIRED', 'REQUEST_VALIDATION_FAILED'].includes(event)) {
      console.warn('⚠️ Security Warning:', logEntry);
    } else {
      console.log('🛡️ Security Log:', logEntry);
    }

    // TODO: Send to security monitoring system
    // TODO: Send alerts for critical events
  }

  /**
   * Get client IP address
   */
  private getClientIP(request: NextRequest): string {
    const forwarded = request.headers.get('x-forwarded-for');
    const realIp = request.headers.get('x-real-ip');
    const cfConnectingIp = request.headers.get('cf-connecting-ip');
    
    return cfConnectingIp || realIp || forwarded?.split(',')[0] || 'unknown';
  }
}

// Export singleton instance
export const securityMiddleware = new SecurityMiddleware();