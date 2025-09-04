/**
 * XORJ V1 Validation Middleware
 * Critical Security Fix: Request validation and error handling
 */

import { NextRequest, NextResponse } from 'next/server';
import { z, ZodError } from 'zod';
import { ValidationError, SuccessResponse } from './schemas';
import { rateLimiter, RATE_LIMITS, getClientIdentifier, createRateLimitResponse } from '../rateLimit';
import { secureEnv } from '../security/envInit';
// import { credentialValidator } from '../security/credentialValidator'; // Unused for now

/**
 * Standardized error response creator
 */
export function createErrorResponse(
  code: ValidationError['error']['code'],
  message: string,
  details?: string | string[] | Record<string, string[]>,
  status: number = 400
): NextResponse {
  const errorResponse: ValidationError = {
    success: false,
    error: {
      code,
      message,
      ...(details && { details })
    }
  };

  return NextResponse.json(errorResponse, { status });
}

/**
 * Standardized success response creator
 */
export function createSuccessResponse<T = unknown>(
  data?: T,
  additionalFields?: Record<string, unknown>
): NextResponse {
  const response: SuccessResponse<T> = {
    success: true,
    ...(data !== undefined && { data }),
    ...additionalFields
  };

  return NextResponse.json(response);
}

/**
 * Validate request body against schema
 */
export async function validateRequestBody<T>(
  request: NextRequest,
  schema: z.ZodSchema<T>
): Promise<{ success: true; data: T } | { success: false; response: NextResponse }> {
  try {
    // First, ensure we can parse the JSON
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return {
        success: false,
        response: createErrorResponse(
          'VALIDATION_ERROR',
          'Invalid JSON in request body',
          'Request body must be valid JSON'
        )
      };
    }

    // Then validate against the schema
    const validatedData = schema.parse(body);

    return {
      success: true,
      data: validatedData
    };

  } catch (error) {
    if (error instanceof ZodError) {
      // Convert Zod errors to our standard format
      const details: Record<string, string[]> = {};
      error.errors.forEach(err => {
        const path = err.path.join('.');
        if (!details[path]) {
          details[path] = [];
        }
        details[path].push(err.message);
      });

      return {
        success: false,
        response: createErrorResponse(
          'VALIDATION_ERROR',
          'Request validation failed',
          details
        )
      };
    }

    // Unexpected error
    console.error('Unexpected validation error:', error);
    return {
      success: false,
      response: createErrorResponse(
        'INTERNAL_ERROR',
        'Internal validation error',
        undefined,
        500
      )
    };
  }
}

/**
 * Validate query parameters against schema
 */
export function validateQueryParams<T>(
  request: NextRequest,
  schema: z.ZodSchema<T>
): { success: true; data: T } | { success: false; response: NextResponse } {
  try {
    const { searchParams } = new URL(request.url);
    const queryObject: Record<string, string | string[]> = {};
    
    // Convert URLSearchParams to plain object
    searchParams.forEach((value, key) => {
      if (queryObject[key]) {
        // Handle multiple values for the same key
        if (Array.isArray(queryObject[key])) {
          (queryObject[key] as string[]).push(value);
        } else {
          queryObject[key] = [queryObject[key] as string, value];
        }
      } else {
        queryObject[key] = value;
      }
    });

    const validatedData = schema.parse(queryObject);

    return {
      success: true,
      data: validatedData
    };

  } catch (error) {
    if (error instanceof ZodError) {
      const details: Record<string, string[]> = {};
      error.errors.forEach(err => {
        const path = err.path.join('.');
        if (!details[path]) {
          details[path] = [];
        }
        details[path].push(err.message);
      });

      return {
        success: false,
        response: createErrorResponse(
          'VALIDATION_ERROR',
          'Query parameter validation failed',
          details
        )
      };
    }

    console.error('Unexpected query validation error:', error);
    return {
      success: false,
      response: createErrorResponse(
        'INTERNAL_ERROR',
        'Internal validation error',
        undefined,
        500
      )
    };
  }
}

/**
 * Validate JWT token and extract user info
 */
export function validateAuthToken(request: NextRequest): 
  { success: true; userWalletAddress: string } | 
  { success: false; response: NextResponse } {
  
  const authorization = request.headers.get('authorization');
  
  if (!authorization || !authorization.startsWith('Bearer ')) {
    return {
      success: false,
      response: createErrorResponse(
        'AUTHENTICATION_ERROR',
        'Missing or invalid authorization header',
        'Authorization header must be in format: Bearer <token>',
        401
      )
    };
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const jwt = require('jsonwebtoken');
    
    // Get validated environment configuration
    const envConfig = secureEnv.getConfig();
    
    if (!envConfig.isValid) {
      console.error('❌ Environment validation failed:', envConfig.errors);
      return {
        success: false,
        response: createErrorResponse(
          'AUTHENTICATION_ERROR',
          'Server configuration error',
          'Authentication service unavailable',
          503
        )
      };
    }
    
    const { secret: JWT_SECRET, algorithm } = envConfig.config.jwt;
    
    if (!JWT_SECRET) {
      console.error('❌ JWT_SECRET not available in validated environment');
      return {
        success: false,
        response: createErrorResponse(
          'AUTHENTICATION_ERROR',
          'Server configuration error',
          'Authentication service unavailable',
          503
        )
      };
    }
    
    const token = authorization.replace('Bearer ', '');
    
    // Use validated JWT configuration with algorithm specification
    const decoded = jwt.verify(token, JWT_SECRET, { 
      algorithms: [algorithm] 
    }) as { wallet_address?: string; user_id?: string };
    
    const userWalletAddress = decoded.wallet_address || decoded.user_id;

    if (!userWalletAddress) {
      return {
        success: false,
        response: createErrorResponse(
          'AUTHENTICATION_ERROR',
          'Invalid token payload',
          'Token must contain wallet_address or user_id',
          401
        )
      };
    }

    return {
      success: true,
      userWalletAddress
    };

  } catch (error) {
    // Sanitize error logging - don't expose sensitive token data
    const sanitizedError = error instanceof Error ? error.message : 'Unknown JWT error';
    console.error('JWT validation error:', sanitizedError);
    
    return {
      success: false,
      response: createErrorResponse(
        'AUTHENTICATION_ERROR',
        'Invalid or expired token',
        'Please re-authenticate and try again',
        401
      )
    };
  }
}

/**
 * Environment validation on startup
 * Call this during application initialization
 */
export function validateEnvironmentOnStartup(): {
  success: boolean;
  errors: string[];
  warnings: string[];
} {
  console.log('🔍 Validating environment configuration...');
  
  const envConfig = secureEnv.initialize();
  
  if (!envConfig.isValid) {
    console.error('❌ Environment validation failed:');
    envConfig.errors.forEach(error => console.error(`  - ${error}`));
    
    if (envConfig.warnings.length > 0) {
      console.warn('⚠️ Environment warnings:');
      envConfig.warnings.forEach(warning => console.warn(`  - ${warning}`));
    }
    
    return {
      success: false,
      errors: envConfig.errors,
      warnings: envConfig.warnings
    };
  }
  
  console.log('✅ Environment validation successful');
  
  if (envConfig.warnings.length > 0) {
    console.warn('⚠️ Environment warnings:');
    envConfig.warnings.forEach(warning => console.warn(`  - ${warning}`));
  }
  
  // Log sanitized configuration for debugging
  const sanitizedConfig = secureEnv.getSanitizedConfig();
  console.log('📊 Environment configuration:', JSON.stringify(sanitizedConfig, null, 2));
  
  return {
    success: true,
    errors: [],
    warnings: envConfig.warnings
  };
}

/**
 * Rate limiting validation
 */
export function validateRateLimit(
  request: NextRequest, 
  endpoint: string = 'api',
  customLimits?: { limit: number; windowMs: number }
): { success: true; remaining: number } | { success: false; response: NextResponse } {
  
  const limits = customLimits || RATE_LIMITS.API;
  const clientId = getClientIdentifier(request);
  const rateLimit = rateLimiter.check(clientId, endpoint, limits.limit, limits.windowMs);
  
  if (!rateLimit.success) {
    console.log(`🚫 Rate limit exceeded for endpoint ${endpoint}, client: ${clientId}`);
    return {
      success: false,
      response: createRateLimitResponse(rateLimit.resetTime)
    };
  }
  
  return { 
    success: true, 
    remaining: rateLimit.remaining 
  };
}