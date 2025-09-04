/**
 * Authentication API - Login with Wallet
 * POST /api/auth/login
 */

import { NextRequest } from 'next/server';
import { validateRequestBody, createErrorResponse, createSuccessResponse } from '@/lib/validation/middleware';
import { query } from '@/lib/database';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { secureEnv } from '@/lib/security/envInit';
import { PublicKey } from '@solana/web3.js';
import nacl from 'tweetnacl';
import { Buffer } from 'buffer';

const LoginRequestSchema = z.object({
  wallet_address: z.string().min(32).max(50),
  signature: z.string().min(1), // Base58 encoded signature
  message: z.string().min(1) // Message that was signed - required for verification
});

/**
 * Verify Solana wallet signature using ed25519
 * @param publicKeyString - Base58 encoded public key (wallet address)
 * @param signature - Base58 encoded signature
 * @param message - Original message that was signed
 * @returns boolean indicating if signature is valid
 */
function verifySignature(publicKeyString: string, signature: string, message: string): boolean {
  try {
    // Decode the public key
    const publicKey = new PublicKey(publicKeyString);
    const publicKeyBytes = publicKey.toBytes();
    
    // Decode the signature from base58
    const signatureBytes = Buffer.from(signature, 'base64');
    
    // Convert message to bytes
    const messageBytes = new TextEncoder().encode(message);
    
    // Verify the signature using ed25519
    const isValid = nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
    
    return isValid;
  } catch (error) {
    console.error('❌ Signature verification error:', error);
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    // Validate request body
    const validation = await validateRequestBody(request, LoginRequestSchema);
    if (!validation.success) {
      return validation.response;
    }
    
    const { wallet_address, signature, message } = validation.data;

    console.log(`🔐 Login attempt for wallet: ${wallet_address}`);

    // SECURITY FIX: Implement proper signature verification
    const isSignatureValid = verifySignature(wallet_address, signature, message);
    
    if (!isSignatureValid) {
      console.log(`❌ Invalid signature for wallet: ${wallet_address}`);
      return createErrorResponse(
        'INVALID_SIGNATURE',
        'Authentication failed',
        'Invalid wallet signature provided',
        401
      );
    }
    
    console.log(`✅ Valid signature verified for wallet: ${wallet_address}`);

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

      // Generate JWT token using secure environment
      const envConfig = secureEnv.getConfig();
      
      if (!envConfig.isValid || !envConfig.config.jwt.secret) {
        console.error('❌ JWT configuration invalid during token generation');
        return createErrorResponse(
          'INTERNAL_ERROR',
          'Authentication service unavailable',
          'Unable to generate authentication token',
          503
        );
      }

      const token = jwt.sign(
        { 
          wallet_address: wallet_address,
          user_id: wallet_address, // For compatibility
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours
        },
        envConfig.config.jwt.secret,
        { algorithm: envConfig.config.jwt.algorithm as jwt.Algorithm }
      );

      console.log(`✅ JWT token generated for: ${wallet_address}`);

      // SECURITY FIX: Phase 2 - Set token as secure httpOnly cookie instead of returning it
      const response = createSuccessResponse({
        authenticated: true,
        wallet_address: user.wallet_address,
        user_created: !existingUser.rows.length,
        session_expires_at: new Date((Math.floor(Date.now() / 1000) + (24 * 60 * 60)) * 1000).toISOString()
      });

      // Set secure httpOnly cookie
      response.cookies.set('xorj_session_token', token, {
        httpOnly: true, // Prevents XSS attacks
        secure: process.env.NODE_ENV === 'production', // HTTPS only in production
        sameSite: 'strict', // Prevents CSRF attacks
        maxAge: 24 * 60 * 60, // 24 hours in seconds
        path: '/', // Available for all routes
      });

      return response;

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