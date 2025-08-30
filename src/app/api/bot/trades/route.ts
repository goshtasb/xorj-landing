import { NextRequest, NextResponse } from 'next/server';
import { TradeService } from '@/lib/botStateService';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

/**
 * V1 Bot Trades API - Database Only
 * GET /api/bot/trades?limit={limit}&offset={offset}
 */
async function getTradesHandler(request: NextRequest) {
  try {
    const authorization = request.headers.get('authorization');
    
    if (!authorization || !authorization.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Missing or invalid authorization header' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Extract user wallet address from JWT token
    let userWalletAddress: string | null = null;
    try {
      const token = authorization.replace('Bearer ', '');
      const decoded = jwt.verify(token, JWT_SECRET) as { wallet_address?: string; user_id?: string };
      userWalletAddress = decoded.wallet_address || decoded.user_id;
    } catch {
      console.warn('⚠️ Unable to decode JWT token:', error);
    }

    if (!userWalletAddress) {
      return NextResponse.json(
        { error: 'Invalid token or missing wallet address' },
        { status: 401 }
      );
    }

    console.log('📦 Fetching trades from database for wallet:', userWalletAddress);

    // Get trades from database
    const dbResult = await TradeService.getAll({
      user_vault_address: userWalletAddress,
      limit,
      offset,
      orderBy: 'created_at',
      orderDirection: 'DESC'
    });
    
    if (!dbResult.success) {
      return NextResponse.json(
        { error: `Database error: ${dbResult.error}` },
        { status: 500 }
      );
    }

    const trades = (dbResult.data || []).map(trade => ({
      trade_id: trade.id,
      timestamp: trade.created_at.toISOString(),
      from_token: trade.from_token_address,
      to_token: trade.to_token_address,
      from_amount: Number(trade.amount_in),
      to_amount: Number(trade.actual_amount_out || trade.expected_amount_out),
      status: trade.status.toLowerCase(),
      transaction_signature: trade.transaction_signature,
      slippage_realized: trade.slippage_realized || 0,
      gas_fee: Number(trade.gas_fee || 0),
      error_message: trade.error_message,
      job_id: trade.job_id
    }));

    console.log(`✅ Found ${trades.length} trades in database`);

    return NextResponse.json({
      user_id: userWalletAddress,
      trades,
      pagination: {
        limit,
        offset,
        total: trades.length,
        has_more: trades.length === limit
      },
      _source: 'database_v1'
    });

  } catch {
    console.error('Bot trades API error:');
    return NextResponse.json(
      { error: 'Failed to fetch bot trades' },
      { status: 500 }
    );
  }
}

export const GET = getTradesHandler;