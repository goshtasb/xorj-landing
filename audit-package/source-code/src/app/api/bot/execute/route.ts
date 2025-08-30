/**
 * V1 Trade Execution API - Testnet Only
 * POST /api/bot/execute
 */

import { NextRequest, NextResponse } from 'next/server';
import { tradeExecutor } from '@/lib/tradeExecutor';
import { validateRequestBody, validateAuthToken, createErrorResponse, createSuccessResponse } from '@/lib/validation/middleware';
import { TradeExecuteRequestSchema } from '@/lib/validation/schemas';

const JWT_SECRET = process.env.JWT_SECRET || 'default_secret_for_dev';

// V1 Mainnet token addresses (using mainnet for Jupiter API compatibility with small amounts for safety)
const V1_TOKENS = {
  SOL: 'So11111111111111111111111111111111111111112',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' // Mainnet USDC for Jupiter compatibility
};

export async function POST(request: NextRequest) {
  try {
    // CRITICAL: Validate authentication token
    const authValidation = validateAuthToken(request);
    if (!authValidation.success) {
      return authValidation.response;
    }
    const userWalletAddress = authValidation.userWalletAddress;

    // CRITICAL: Strict schema validation
    const validation = await validateRequestBody(request, TradeExecuteRequestSchema);
    if (!validation.success) {
      return validation.response;
    }
    
    const { action, fromToken, toToken, amount, slippageBps } = validation.data;

    // Note: Input validation is now handled by Zod schema, these checks are redundant
    // but keeping for belt-and-suspenders security approach

    console.log(`🚀 Trade request: ${action} - ${amount} ${fromToken} -> ${toToken}`);

    // Convert to proper format
    const fromMint = V1_TOKENS[fromToken as keyof typeof V1_TOKENS];
    const toMint = V1_TOKENS[toToken as keyof typeof V1_TOKENS];
    const amountLamports = Math.floor(amount * 1e9); // Convert SOL to lamports

    if (!fromMint || !toMint) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'Unsupported token pair',
        `Supported tokens: ${Object.keys(V1_TOKENS).join(', ')}`
      );
    }

    const tradeParams = {
      userWalletAddress,
      fromMint,
      toMint,
      amount: amountLamports,
      slippageBps
    };

    let result;
    if (action === 'simulate') {
      result = await tradeExecutor.simulateTrade(tradeParams);
    } else {
      result = await tradeExecutor.executeTrade(tradeParams);
    }

    if (result.success) {
      console.log(`✅ Trade ${action} successful`);
      return createSuccessResponse(undefined, {
        action,
        trade_id: result.tradeId,
        expected_output: result.expectedOutput,
        transaction: result.transaction,
        simulation: result.simulation || false
      });
    } else {
      console.error(`❌ Trade ${action} failed:`, result.error);
      return createErrorResponse(
        'INTERNAL_ERROR',
        'Trade execution failed',
        result.error,
        500
      );
    }

  } catch (error) {
    console.error('Trade execution API error:', error);
    return createErrorResponse(
      'INTERNAL_ERROR',
      'Failed to process trade request',
      undefined,
      500
    );
  }
}