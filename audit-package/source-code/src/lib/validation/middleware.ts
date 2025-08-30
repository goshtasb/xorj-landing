/**
 * XORJ V1 Validation Middleware
 * Critical Security Fix: Request validation and error handling
 */

import { NextRequest, NextResponse } from 'next/server';
import { z, ZodError } from 'zod';
import { ValidationError, SuccessResponse } from './schemas';

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
export function createSuccessResponse<T = any>(
  data?: T,
  additionalFields?: Record<string, any>
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
    } catch (error) {
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
    const jwt = require('jsonwebtoken');
    const JWT_SECRET = process.env.JWT_SECRET || 'default_secret_for_dev';
    
    const token = authorization.replace('Bearer ', '');
    const decoded = jwt.verify(token, JWT_SECRET) as any;
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
    return {
      success: false,
      response: createErrorResponse(
        'AUTHENTICATION_ERROR',
        'Invalid or expired token',
        undefined,
        401
      )
    };
  }
}

/**
 * Rate limiting validation (placeholder for future implementation)
 */
export function validateRateLimit(userWalletAddress: string): 
  { success: true } | 
  { success: false; response: NextResponse } {
  
  // TODO: Implement actual rate limiting logic
  // For now, just return success
  return { success: true };
}