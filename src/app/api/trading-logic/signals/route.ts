/**
 * Trading Logic Signals API
 * Core endpoint for trade signal generation and processing
 */

import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { tradingLogicService } from '@/lib/tradingLogic';

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const requestId = `signals_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
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
      const decoded = jwt.verify(token, JWT_SECRET) as { wallet_address?: string; sub?: string };
      walletAddress = decoded?.wallet_address || decoded?.sub || '';
      
      if (!walletAddress) {
        throw new Error('No wallet address in token');
      }
    } catch (error) {
      return NextResponse.json({
        error: 'Invalid token',
        requestId
      }, { status: 401 });
    }

    // Parse request body
    const body = await request.json();
    const { vaultAddress } = body;

    if (!vaultAddress) {
      return NextResponse.json({
        error: 'Vault address is required',
        requestId
      }, { status: 400 });
    }

    console.log(`🚀 Trade signal generation request from ${walletAddress} for vault ${vaultAddress}`);

    // Process trade signals through the complete pipeline
    const signals = await tradingLogicService.processTradeSignals(walletAddress, vaultAddress);
    
    const responseTime = Date.now() - startTime;

    if (signals.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No rebalancing signals generated - portfolio is within acceptable thresholds',
        signals: [],
        analysis: {
          vaultAddress,
          userId: walletAddress,
          signalsGenerated: 0,
          processingTime: `${responseTime}ms`,
          status: 'no_action_needed'
        },
        requestId,
        responseTime: `${responseTime}ms`
      }, {
        status: 200,
        headers: {
          'X-Request-ID': requestId,
          'X-Response-Time': `${responseTime}ms`
        }
      });
    }

    console.log(`✅ Generated ${signals.length} trade signal(s) for ${walletAddress}`);

    return NextResponse.json({
      success: true,
      message: `Generated ${signals.length} trade signal(s) for execution`,
      signals: signals.map(signal => ({
        // Core signal data
        action: signal.action,
        fromAsset: {
          mintAddress: signal.fromAsset.mintAddress,
          symbol: signal.fromAsset.symbol
        },
        toAsset: {
          mintAddress: signal.toAsset.mintAddress,
          symbol: signal.toAsset.symbol
        },
        targetPercentage: signal.targetPercentage,
        
        // Metadata for decision transparency
        signalId: signal.metadata?.signalId,
        discrepancy: signal.metadata?.discrepancy,
        confidence: signal.metadata?.confidence,
        currentPercentage: signal.metadata?.currentPercentage,
        generatedAt: signal.metadata?.timestamp
      })),
      analysis: {
        vaultAddress,
        userId: walletAddress,
        signalsGenerated: signals.length,
        processingTime: `${responseTime}ms`,
        status: 'signals_generated',
        nextStep: 'Signals ready for Risk Management Module validation'
      },
      requestId,
      responseTime: `${responseTime}ms`
    }, {
      status: 200,
      headers: {
        'X-Request-ID': requestId,
        'X-Response-Time': `${responseTime}ms`,
        'X-Signals-Generated': signals.length.toString()
      }
    });

  } catch (error) {
    console.error(`❌ Trade signal generation failed:`, error);
    const responseTime = Date.now() - startTime;
    
    return NextResponse.json({
      error: 'Trade signal generation failed',
      requestId,
      responseTime: `${responseTime}ms`,
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const requestId = `get_signals_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
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
      const decoded = jwt.verify(token, JWT_SECRET) as { wallet_address?: string; sub?: string };
      walletAddress = decoded?.wallet_address || decoded?.sub || '';
      
      if (!walletAddress) {
        throw new Error('No wallet address in token');
      }
    } catch (error) {
      return NextResponse.json({
        error: 'Invalid token',
        requestId
      }, { status: 401 });
    }

    // Get processed signals for the user
    const processedSignals = tradingLogicService.getProcessedSignals(walletAddress);
    const responseTime = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      processedSignals: processedSignals.map(signal => ({
        signalId: signal.metadata?.signalId,
        action: signal.action,
        fromAsset: signal.fromAsset,
        toAsset: signal.toAsset,
        targetPercentage: signal.targetPercentage,
        discrepancy: signal.metadata?.discrepancy,
        confidence: signal.metadata?.confidence,
        generatedAt: signal.metadata?.timestamp,
        vaultAddress: signal.vaultAddress
      })),
      count: processedSignals.length,
      userId: walletAddress,
      requestId,
      responseTime: `${responseTime}ms`
    }, {
      status: 200,
      headers: {
        'X-Request-ID': requestId,
        'X-Response-Time': `${responseTime}ms`
      }
    });

  } catch (error) {
    console.error(`❌ Get processed signals failed:`, error);
    const responseTime = Date.now() - startTime;
    
    return NextResponse.json({
      error: 'Failed to retrieve processed signals',
      requestId,
      responseTime: `${responseTime}ms`,
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const startTime = Date.now();
  const requestId = `clear_signals_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
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
      const decoded = jwt.verify(token, JWT_SECRET) as { wallet_address?: string; sub?: string };
      walletAddress = decoded?.wallet_address || decoded?.sub || '';
      
      if (!walletAddress) {
        throw new Error('No wallet address in token');
      }
    } catch (error) {
      return NextResponse.json({
        error: 'Invalid token',
        requestId
      }, { status: 401 });
    }

    // Clear processed signals for the user
    tradingLogicService.clearProcessedSignals(walletAddress);
    const responseTime = Date.now() - startTime;

    console.log(`🧹 Cleared processed signals for user ${walletAddress}`);

    return NextResponse.json({
      success: true,
      message: 'Processed signals cleared successfully',
      userId: walletAddress,
      requestId,
      responseTime: `${responseTime}ms`
    }, {
      status: 200,
      headers: {
        'X-Request-ID': requestId,
        'X-Response-Time': `${responseTime}ms`
      }
    });

  } catch (error) {
    console.error(`❌ Clear processed signals failed:`, error);
    const responseTime = Date.now() - startTime;
    
    return NextResponse.json({
      error: 'Failed to clear processed signals',
      requestId,
      responseTime: `${responseTime}ms`,
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}