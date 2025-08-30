/**
 * Authentication API - Login with Wallet
 * POST /api/auth/login
 */

import { NextRequest } from 'next/server';
import { validateRequestBody, createErrorResponse, createSuccessResponse } from '@/lib/validation/middleware';
import { query } from '@/lib/database';
import jwt from 'jsonwebtoken';
import { z } from 'zod';

const LoginRequestSchema = z.object({
  wallet_address: z.string().min(32).max(50),
  signature: z.string().optional(), // For development, signature is optional
  message: z.string().optional()
});

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required but not set');
}

export async function POST(request: NextRequest) {
  try {
    // Validate request body
    const validation = await validateRequestBody(request, LoginRequestSchema);
    if (!validation.success) {
      return validation.response;
    }
    
    const { wallet_address, signature } = validation.data;

    console.log(`🔐 Login attempt for wallet: ${wallet_address}`);

    // In a real implementation, you would:
    // 1. Verify the signature against the message
    // 2. Check if the wallet is authorized
    // 3. Rate limit login attempts
    
    // For development, we'll skip signature verification
    if (process.env.NODE_ENV === 'production' && !signature) {
      return createErrorResponse(
        'AUTHENTICATION_ERROR',
        'Signature required for production environment',
        'Must provide valid signature for wallet verification',
        401
      );
    }

    // Check/create user in database
    try {
      let user;
      
      // Check if user exists
      const existingUser = await query(
        'SELECT wallet_address, created_at FROM user_settings WHERE wallet_address = $1',
        [wallet_address]
      );
      
      if (existingUser.rows.length === 0) {
        // Create new user
        const newUser = await query(`
          INSERT INTO user_settings (wallet_address, bot_enabled, risk_level, max_trade_size, created_at) 
          VALUES ($1, false, 'medium', 100, NOW()) 
          RETURNING wallet_address, created_at
        `, [wallet_address]);
        
        user = newUser.rows[0];
        console.log(`👤 Created new user: ${wallet_address}`);
      } else {
        user = existingUser.rows[0];
        console.log(`👤 Existing user login: ${wallet_address}`);
      }

      // Generate JWT token
      const token = jwt.sign(
        { 
          wallet_address: wallet_address,
          user_id: wallet_address, // For compatibility
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours
        },
        JWT_SECRET,
        { algorithm: 'HS256' }
      );

      console.log(`✅ JWT token generated for: ${wallet_address}`);

      return createSuccessResponse({
        token,
        wallet_address: user.wallet_address,
        user_created: !existingUser.rows.length
      });

    } catch (dbError) {
      console.error('❌ Database error during login:', dbError);
      return createErrorResponse(
        'INTERNAL_ERROR',
        'Database operation failed',
        'Unable to process login request',
        500
      );
    }

  } catch {
    console.error('❌ Login API error:');
    return createErrorResponse(
      'INTERNAL_ERROR',
      'Authentication failed',
      undefined,
      500
    );
  }
}