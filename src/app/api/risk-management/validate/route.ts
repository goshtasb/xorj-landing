/**
 * Risk Management Validation API
 * The Final Guardian: Validates trade signals before execution authorization
 */

import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { riskManagementService, RiskValidationError } from '@/lib/riskManagement';
import { TradeSignal } from '@/lib/tradingLogic';

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

// Type assertion after null check
const jwtSecret: string = JWT_SECRET;

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const requestId = `risk_validate_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    // Authentication
    const authorization = request.headers.get('authorization');
    
    if (!authorization || !authorization.startsWith('Bearer ')) {
      return NextResponse.json({
        error: 'Missing authorization header',
        requestId
      }, { status: 401 });
    }

    const token = authorization.replace('Bearer ', '');
    let walletAddress: string;
    
    try {
      const decoded = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] }) as { wallet_address?: string; sub?: string };
      walletAddress = decoded?.wallet_address || decoded?.sub || '';
      
      if (!walletAddress) {
        throw new Error('No wallet address in token');
      }
    } catch {
      // FIXED: In development, handle malformed JWT tokens gracefully
      if (process.env.NODE_ENV === 'development') {
        console.log('🧪 Development mode: JWT malformed, using default wallet address');
        walletAddress = '5QfzCCipXjebAfHpMhCJAoxUJL2TyqM5p8tCFLjsPbmh';
      } else {
        return NextResponse.json({
          error: 'Invalid token',
          requestId
        }, { status: 401 });
      }
    }

    // Parse request body - expecting a TradeSignal
    const body = await request.json();
    const { signal } = body;

    if (!signal) {
      return NextResponse.json({
        error: 'TradeSignal is required in request body',
        requestId,
        example: {
          signal: {
            action: 'REBALANCE',
            userId: 'user_wallet_address',
            vaultAddress: 'vault_address',
            fromAsset: { mintAddress: 'mint1', symbol: 'TOKEN1' },
            toAsset: { mintAddress: 'mint2', symbol: 'TOKEN2' },
            targetPercentage: 100
          }
        }
      }, { status: 400 });
    }

    // Validate that the signal belongs to the authenticated user
    if (signal.userId !== walletAddress) {
      return NextResponse.json({
        error: 'Signal userId does not match authenticated user',
        requestId
      }, { status: 403 });
    }

    console.log(`🛡️ Risk validation request from ${walletAddress}`);
    console.log(`📊 Signal: ${signal.fromAsset.symbol} → ${signal.toAsset.symbol} (${signal.targetPercentage}%)`);

    try {
      // THE FINAL GUARDIAN - Risk Management Validation
      const validatedSignal = await riskManagementService.validateTradeSignal(signal as TradeSignal);
      
      const responseTime = Date.now() - startTime;

      console.log(`✅ SIGNAL AUTHORIZED: ${validatedSignal.riskValidation.validationId}`);

      return NextResponse.json({
        success: true,
        status: 'AUTHORIZED',
        message: 'Trade signal passed all risk management checks - authorized for execution',
        validatedSignal: {
          // Core signal data
          action: validatedSignal.action,
          userId: validatedSignal.userId,
          vaultAddress: validatedSignal.vaultAddress,
          fromAsset: validatedSignal.fromAsset,
          toAsset: validatedSignal.toAsset,
          targetPercentage: validatedSignal.targetPercentage,
          
          // Risk validation metadata
          riskValidation: {
            validatedAt: validatedSignal.riskValidation.validatedAt,
            validationId: validatedSignal.riskValidation.validationId,
            checksPerformed: validatedSignal.riskValidation.checksPerformed,
            tradeValueUSD: validatedSignal.riskValidation.tradeValueUSD,
            positionSizePercentage: validatedSignal.riskValidation.positionSizePercentage,
            currentDrawdown: validatedSignal.riskValidation.currentDrawdown,
            priceImpact: validatedSignal.riskValidation.priceImpact,
            slippage: validatedSignal.riskValidation.slippage
            // Note: Jupiter quote omitted from response for brevity
          }
        },
        analysis: {
          checksPerformed: validatedSignal.riskValidation.checksPerformed.length,
          allChecksPassed: true,
          tradeAuthorized: true,
          nextStep: 'Forward ValidatedTradeSignal to Trade Execution Bot'
        },
        requestId,
        responseTime: `${responseTime}ms`
      }, {
        status: 200,
        headers: {
          'X-Request-ID': requestId,
          'X-Response-Time': `${responseTime}ms`,
          'X-Risk-Status': 'AUTHORIZED'
        }
      });

    } catch (error) {
      if (error instanceof RiskValidationError) {
        // Risk check failed - return detailed rejection
        const responseTime = Date.now() - startTime;
        
        console.log(`🚫 SIGNAL REJECTED: ${error.checkFailed}`);
        console.log(`❌ Reason: ${error.message}`);

        return NextResponse.json({
          success: false,
          status: 'REJECTED',
          message: 'Trade signal failed risk management validation - execution denied',
          rejection: {
            code: error.code,
            checkFailed: error.checkFailed,
            reason: error.message,
            details: error.details
          },
          analysis: {
            checksPerformed: error.details.checksPerformed?.length || 0,
            allChecksPassed: false,
            tradeAuthorized: false,
            riskProtectionTriggered: true
          },
          requestId,
          responseTime: `${responseTime}ms`
        }, {
          status: 400, // Bad request due to risk violation
          headers: {
            'X-Request-ID': requestId,
            'X-Response-Time': `${responseTime}ms`,
            'X-Risk-Status': 'REJECTED',
            'X-Risk-Code': error.code
          }
        });
      }

      // System error during validation
      throw error;
    }

  } catch (error) {
    console.error(`❌ Risk validation system error:`, error);
    const responseTime = Date.now() - startTime;
    
    return NextResponse.json({
      error: 'Risk validation system error',
      requestId,
      responseTime: `${responseTime}ms`,
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function GET() {
  const startTime = Date.now();
  
  try {
    // Return risk management configuration and status
    const config = riskManagementService.getRiskConfig();
    const health = riskManagementService.getServiceHealth();
    const responseTime = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      riskManagement: {
        status: 'active',
        description: 'Final guardian protecting capital before trade execution',
        purpose: 'Transform trade intent into execution authorization via safety checks'
      },
      configuration: {
        maxPositionSize: `${config.maxPositionSizePercentage}% of vault value`,
        maxDrawdown: `${config.maxDrawdownThreshold}% portfolio drawdown`,
        maxPriceImpact: `${config.maxPriceImpact}% price impact`,
        maxSlippage: `${config.maxSlippage}% slippage`
      },
      checks: [
        'Position Sizing: Prevents trades exceeding 50% of vault value',
        'Portfolio Drawdown: Blocks trades when portfolio down >20%', 
        'Price Impact & Slippage: Rejects trades with >1% market impact'
      ],
      pipeline: 'TradeSignal → Risk Validation → ValidatedTradeSignal → Execution',
      health,
      responseTime: `${responseTime}ms`
    }, {
      status: 200,
      headers: {
        'X-Response-Time': `${responseTime}ms`
      }
    });

  } catch (error) {
    const responseTime = Date.now() - startTime;
    
    return NextResponse.json({
      error: 'Failed to retrieve risk management configuration',
      responseTime: `${responseTime}ms`,
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}