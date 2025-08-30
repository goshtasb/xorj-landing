/**
 * Next.js Edge Middleware
 * Production-grade security at the edge
 * 
 * This middleware runs on Vercel Edge Runtime before any API routes,
 * providing immediate protection against attacks and abuse.
 * 
 * Features:
 * - Rate limiting enforcement
 * - Security headers
 * - Attack pattern detection
 * - Geographic blocking (if needed)
 * - Request validation
 */

import { NextRequest, NextResponse } from 'next/server';
import { securityMiddleware } from './src/lib/security/middleware';

/**
 * Paths that should be protected by security middleware
 */
const PROTECTED_PATHS = [
  '/api/auth',
  '/api/bot',
  '/api/user',
  '/api/admin',
  '/api/system',
  '/api/vault',
  '/api/risk-management',
  '/api/database',
  '/api/trader-intelligence'
];

/**
 * Paths that should be completely blocked
 */
const BLOCKED_PATHS = [
  '/.env',
  '/wp-admin',
  '/admin',
  '/phpMyAdmin',
  '/wp-login.php',
  '/.well-known/security.txt',
  '/robots.txt'
];

/**
 * Suspicious user agents to block
 */
const BLOCKED_USER_AGENTS = [
  /bot/i,
  /crawler/i,
  /spider/i,
  /scraper/i,
  /curl/i,
  /wget/i,
  /postman/i,
  /insomnia/i
];

/**
 * Allow legitimate bots and health checkers
 */
const ALLOWED_USER_AGENTS = [
  /googlebot/i,
  /bingbot/i,
  /slurp/i,
  /uptimerobot/i,
  /pingdom/i,
  /newrelic/i,
  /datadog/i
];

/**
 * Main middleware function
 */
export async function middleware(request: NextRequest) {
  const startTime = Date.now();
  const url = new URL(request.url);
  const pathname = url.pathname;

  try {
    // 1. Block known malicious paths immediately
    if (BLOCKED_PATHS.some(blocked => pathname.startsWith(blocked))) {
      console.warn(`🚫 Blocked malicious path: ${pathname}`);
      
      return new NextResponse(null, {
        status: 404,
        headers: {
          'X-Blocked-Reason': 'Malicious path detected',
          'X-Security-Event': 'PATH_BLOCKED'
        }
      });
    }

    // 2. Handle OPTIONS requests for CORS
    if (request.method === 'OPTIONS') {
      return handleOptionsRequest(request);
    }

    // 3. User agent filtering
    const userAgent = request.headers.get('user-agent') || '';
    const userAgentBlocked = await checkUserAgent(userAgent, pathname);
    
    if (userAgentBlocked) {
      console.warn(`🚫 Blocked user agent: ${userAgent.substring(0, 100)}`);
      
      return new NextResponse(null, {
        status: 403,
        headers: {
          'X-Blocked-Reason': 'Suspicious user agent',
          'X-Security-Event': 'USER_AGENT_BLOCKED'
        }
      });
    }

    // 4. Geographic blocking (if configured)
    const geoBlocked = await checkGeographicBlocking(request);
    if (geoBlocked) {
      return geoBlocked;
    }

    // 5. Apply security middleware for protected paths
    if (shouldProtectPath(pathname)) {
      const securityResult = await securityMiddleware.handle(request);
      
      // If security middleware returns a response, it means request was blocked
      if (securityResult.status >= 400) {
        return securityResult;
      }
      
      // Add processing time header for monitoring
      securityResult.headers.set('X-Edge-Processing-Time', `${Date.now() - startTime}ms`);
      
      return securityResult;
    }

    // 6. For unprotected paths, still apply basic security headers
    const response = NextResponse.next();
    applyBasicSecurityHeaders(response);
    response.headers.set('X-Edge-Processing-Time', `${Date.now() - startTime}ms`);
    
    return response;

  } catch (error) {
    console.error('🚨 Edge middleware error:', error);
    
    // Log the error with request details
    const errorLog = {
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
      pathname,
      method: request.method,
      userAgent: request.headers.get('user-agent'),
      ip: getClientIP(request)
    };
    
    console.error('🚨 EDGE MIDDLEWARE FAILURE:', errorLog);

    // Fail secure - return 503 on middleware failure
    return new NextResponse(
      JSON.stringify({
        error: 'Security system unavailable',
        message: 'Please try again later',
        requestId: `edge_error_${Date.now()}`
      }),
      {
        status: 503,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': '30',
          'X-Security-Event': 'MIDDLEWARE_FAILURE'
        }
      }
    );
  }
}

/**
 * Check if path should be protected by full security middleware
 */
function shouldProtectPath(pathname: string): boolean {
  return PROTECTED_PATHS.some(path => pathname.startsWith(path));
}

/**
 * Handle CORS preflight requests
 */
function handleOptionsRequest(request: NextRequest): NextResponse {
  const response = new NextResponse(null, { status: 200 });
  
  // Get origin from request
  const origin = request.headers.get('origin');
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(o => o.trim());
  
  // Check if origin is allowed
  if (origin && (allowedOrigins.includes('*') || allowedOrigins.includes(origin))) {
    response.headers.set('Access-Control-Allow-Origin', origin);
  } else {
    response.headers.set('Access-Control-Allow-Origin', 'https://xorj.com'); // Default allowed origin
  }
  
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-CSRF-Token');
  response.headers.set('Access-Control-Max-Age', '86400');
  response.headers.set('Vary', 'Origin');
  
  return response;
}

/**
 * Check user agent for suspicious patterns
 */
async function checkUserAgent(userAgent: string, pathname: string): Promise<boolean> {
  // Skip user agent checking for health endpoints
  if (pathname === '/api/health') {
    return false;
  }

  // Allow empty user agents for health checks
  if (!userAgent) {
    return pathname.startsWith('/api/'); // Block API access without user agent
  }

  // Check if user agent is explicitly allowed
  if (ALLOWED_USER_AGENTS.some(pattern => pattern.test(userAgent))) {
    return false;
  }

  // Check if user agent should be blocked
  if (BLOCKED_USER_AGENTS.some(pattern => pattern.test(userAgent))) {
    return true;
  }

  // Block suspiciously short user agents (likely bots)
  if (userAgent.length < 10) {
    return true;
  }

  return false;
}

/**
 * Geographic blocking based on request headers
 */
async function checkGeographicBlocking(request: NextRequest): Promise<NextResponse | null> {
  // Check for Cloudflare country header
  const country = request.headers.get('cf-ipcountry');
  
  // List of blocked countries (if any)
  const blockedCountries = (process.env.BLOCKED_COUNTRIES || '').split(',').map(c => c.trim().toUpperCase());
  
  if (country && blockedCountries.includes(country)) {
    console.warn(`🌍 Geographic block: ${country}`);
    
    return new NextResponse(
      JSON.stringify({
        error: 'Service not available',
        message: 'This service is not available in your region'
      }),
      {
        status: 451, // Unavailable For Legal Reasons
        headers: {
          'Content-Type': 'application/json',
          'X-Blocked-Reason': 'Geographic restriction',
          'X-Security-Event': 'GEO_BLOCKED',
          'X-Blocked-Country': country
        }
      }
    );
  }
  
  return null;
}

/**
 * Apply basic security headers to response
 */
function applyBasicSecurityHeaders(response: NextResponse): void {
  const headers = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  };
  
  Object.entries(headers).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
}

/**
 * Get client IP address from various headers
 */
function getClientIP(request: NextRequest): string {
  // Try various headers in order of preference
  const headers = [
    'cf-connecting-ip',    // Cloudflare
    'x-real-ip',           // Nginx
    'x-forwarded-for',     // Standard proxy header
    'x-client-ip',         // Some proxies
    'x-forwarded',         // Some proxies
    'forwarded-for',       // RFC 7239
    'forwarded'            // RFC 7239
  ];
  
  for (const header of headers) {
    const value = request.headers.get(header);
    if (value) {
      // Handle comma-separated IPs (take the first one)
      const ip = value.split(',')[0].trim();
      if (isValidIP(ip)) {
        return ip;
      }
    }
  }
  
  return 'unknown';
}

/**
 * Basic IP validation
 */
function isValidIP(ip: string): boolean {
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
  
  return ipv4Regex.test(ip) || ipv6Regex.test(ip);
}

/**
 * Middleware configuration
 */
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder files
     */
    '/((?!_next/static|_next/image|favicon.ico|public/).*)',
  ],
};