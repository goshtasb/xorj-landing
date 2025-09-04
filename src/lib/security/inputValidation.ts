/**
 * Comprehensive Input Validation & Sanitization
 * SECURITY FIX: Phase 2 - Prevent injection attacks and data corruption
 */

import { z } from 'zod';
import DOMPurify from 'isomorphic-dompurify';

/**
 * Security-focused input validation schemas
 */
export const SecurityValidationSchemas = {
  // Solana wallet address validation
  walletAddress: z.string()
    .min(32, 'Wallet address too short')
    .max(50, 'Wallet address too long')
    .regex(/^[1-9A-HJ-NP-Za-km-z]+$/, 'Invalid wallet address format'),

  // Email validation with additional security checks
  email: z.string()
    .email('Invalid email format')
    .max(254, 'Email too long')
    .refine((email) => !email.includes('<script>'), 'Email contains invalid characters'),

  // Secure string validation (prevents XSS)
  safeString: z.string()
    .max(1000, 'String too long')
    .transform((str) => DOMPurify.sanitize(str, { ALLOWED_TAGS: [] })),

  // Numeric validation with range checks
  positiveNumber: z.number()
    .positive('Must be positive')
    .finite('Must be finite')
    .safe('Number too large'),

  // Trade amount validation
  tradeAmount: z.number()
    .positive('Trade amount must be positive')
    .min(0.000001, 'Trade amount too small')
    .max(1000000, 'Trade amount too large')
    .finite('Trade amount must be finite'),

  // Risk profile validation
  riskProfile: z.enum(['Conservative', 'Balanced', 'Aggressive'], {
    errorMap: () => ({ message: 'Invalid risk profile' })
  }),

  // Pagination parameters
  pagination: z.object({
    page: z.number().int().min(1).max(1000),
    limit: z.number().int().min(1).max(100)
  }),

  // JWT token validation
  jwtToken: z.string()
    .regex(/^[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+$/, 'Invalid JWT format'),

  // CSRF token validation
  csrfToken: z.string()
    .length(64, 'Invalid CSRF token length')
    .regex(/^[a-f0-9]+$/, 'Invalid CSRF token format'),

  // Base58 signature validation (Solana)
  base58Signature: z.string()
    .min(64, 'Signature too short')
    .max(128, 'Signature too long')
    .regex(/^[1-9A-HJ-NP-Za-km-z]+$/, 'Invalid signature format')
};

/**
 * Advanced input sanitizer
 */
export class InputSanitizer {
  /**
   * Sanitize HTML content to prevent XSS
   */
  static sanitizeHTML(input: string): string {
    return DOMPurify.sanitize(input, {
      ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'p', 'br'],
      ALLOWED_ATTR: []
    });
  }

  /**
   * Sanitize plain text (strip all HTML)
   */
  static sanitizeText(input: string): string {
    return DOMPurify.sanitize(input, { ALLOWED_TAGS: [] });
  }

  /**
   * Sanitize and validate SQL identifiers
   */
  static sanitizeSQLIdentifier(input: string): string {
    // Only allow alphanumeric characters and underscores
    return input.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 64);
  }

  /**
   * Sanitize file paths to prevent directory traversal
   */
  static sanitizeFilePath(input: string): string {
    return input
      .replace(/\.\./g, '') // Remove parent directory references
      .replace(/[<>:"|?*]/g, '') // Remove invalid filename characters
      .slice(0, 255); // Limit length
  }

  /**
   * Remove potentially dangerous characters from user input
   */
  static sanitizeUserInput(input: string): string {
    return input
      .replace(/[<>&'"]/g, '') // Remove HTML/XML dangerous chars
      .replace(/javascript:/gi, '') // Remove javascript protocol
      .replace(/data:/gi, '') // Remove data protocol
      .replace(/vbscript:/gi, '') // Remove vbscript protocol
      .trim()
      .slice(0, 1000); // Limit length
  }

  /**
   * Validate and sanitize numeric input
   */
  static sanitizeNumeric(input: unknown): number | null {
    const num = Number(input);
    
    if (isNaN(num) || !isFinite(num)) {
      return null;
    }
    
    // Prevent extremely large numbers that could cause issues
    if (Math.abs(num) > Number.MAX_SAFE_INTEGER) {
      return null;
    }
    
    return num;
  }

  /**
   * Validate request headers for security
   */
  static validateHeaders(headers: Headers): { valid: boolean; issues: string[] } {
    const issues: string[] = [];
    
    // Check for suspicious User-Agent
    const userAgent = headers.get('user-agent');
    if (userAgent && (userAgent.includes('<script>') || userAgent.length > 500)) {
      issues.push('Suspicious User-Agent header');
    }
    
    // Check for suspicious custom headers
    for (const [name, value] of headers.entries()) {
      if (name.toLowerCase().startsWith('x-') && value.includes('<script>')) {
        issues.push(`Suspicious custom header: ${name}`);
      }
    }
    
    // Check Content-Length for potential DoS
    const contentLength = headers.get('content-length');
    if (contentLength && parseInt(contentLength) > 10 * 1024 * 1024) { // 10MB limit
      issues.push('Request body too large');
    }
    
    return { valid: issues.length === 0, issues };
  }
}

/**
 * Request validation middleware
 */
export class RequestValidator {
  /**
   * Validate request body against schema
   */
  static async validateBody<T>(
    request: Request,
    schema: z.ZodSchema<T>
  ): Promise<{ success: true; data: T } | { success: false; error: string }> {
    try {
      const body = await request.json();
      const result = schema.safeParse(body);
      
      if (!result.success) {
        const errorMessage = result.error.issues
          .map(issue => `${issue.path.join('.')}: ${issue.message}`)
          .join(', ');
        
        return { success: false, error: errorMessage };
      }
      
      return { success: true, data: result.data };
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error) {
      return { success: false, error: 'Invalid JSON in request body' };
    }
  }

  /**
   * Validate query parameters
   */
  static validateQuery<T>(
    searchParams: URLSearchParams,
    schema: z.ZodSchema<T>
  ): { success: true; data: T } | { success: false; error: string } {
    try {
      // Convert URLSearchParams to object
      const query: Record<string, string | string[]> = {};
      
      for (const [key, value] of searchParams.entries()) {
        if (query[key]) {
          // Handle multiple values for same key
          if (Array.isArray(query[key])) {
            (query[key] as string[]).push(value);
          } else {
            query[key] = [query[key] as string, value];
          }
        } else {
          query[key] = value;
        }
      }
      
      const result = schema.safeParse(query);
      
      if (!result.success) {
        const errorMessage = result.error.issues
          .map(issue => `${issue.path.join('.')}: ${issue.message}`)
          .join(', ');
        
        return { success: false, error: errorMessage };
      }
      
      return { success: true, data: result.data };
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error) {
      return { success: false, error: 'Invalid query parameters' };
    }
  }

  /**
   * Comprehensive request security check
   */
  static securityCheck(request: Request): { secure: boolean; issues: string[] } {
    const issues: string[] = [];
    
    // Validate headers
    const headerValidation = InputSanitizer.validateHeaders(request.headers);
    if (!headerValidation.valid) {
      issues.push(...headerValidation.issues);
    }
    
    // Check for suspicious URL patterns
    const url = new URL(request.url);
    if (url.pathname.includes('..') || url.pathname.includes('<script>')) {
      issues.push('Suspicious URL pattern detected');
    }
    
    // Check for SQL injection patterns in query string
    const queryString = url.search.toLowerCase();
    const sqlPatterns = ['union', 'select', 'insert', 'update', 'delete', 'drop', '--', ';'];
    for (const pattern of sqlPatterns) {
      if (queryString.includes(pattern)) {
        issues.push('Potential SQL injection attempt detected');
        break;
      }
    }
    
    return { secure: issues.length === 0, issues };
  }
}