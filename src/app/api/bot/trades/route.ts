import { NextRequest, NextResponse } from 'next/server';
import { botService, checkBotServiceHealth, isBotServiceError } from '@/lib/botService';

/**
 * Bot Trades API - Get trade execution history
 * GET /api/bot/trades?user_id={user_id}&limit={limit}&offset={offset}
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('user_id');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');
    
    if (!userId) {
      return NextResponse.json(
        { error: 'user_id parameter is required' },
        { status: 400 }
      );
    }

    // Check if bot service is available
    const isServiceAvailable = await checkBotServiceHealth();
    
    if (isServiceAvailable) {
      try {
        // Get actual trade data from bot service
        const tradesData = await botService.getBotTrades(userId, limit, offset);
        return NextResponse.json(tradesData);
      } catch (error) {
        console.error('Failed to fetch trades from bot service:', error);
        
        if (isBotServiceError(error) && error.status) {
          return NextResponse.json(
            { error: error.message },
            { status: error.status }
          );
        }
        
        // Fall through to mock data if service fails
      }
    }

    // Fallback to mock data when bot service is unavailable
    console.log('🔄 Using mock trade data - Bot service unavailable');
    const mockTrades = Array.from({ length: Math.min(limit, 20) }, (_, i) => {
      const tradeId = `trade-${Date.now()}-${i + offset}`;
      const tokens = ['USDC', 'SOL', 'JUP', 'RAY', 'ORCA'];
      const fromToken = tokens[Math.floor(Math.random() * tokens.length)];
      let toToken = tokens[Math.floor(Math.random() * tokens.length)];
      while (toToken === fromToken) {
        toToken = tokens[Math.floor(Math.random() * tokens.length)];
      }

      const amount = Math.random() * 10000 + 100;
      const slippage = Math.random() * 0.2; // 0-0.2%
      const timestamp = new Date(Date.now() - (i + offset) * 3600000).toISOString();

      return {
        trade_id: tradeId,
        timestamp,
        from_token: fromToken,
        to_token: toToken,
        from_amount: Math.round(amount * 100) / 100,
        to_amount: Math.round((amount * (0.98 + Math.random() * 0.04)) * 100) / 100,
        status: Math.random() > 0.05 ? 'confirmed' : 'failed',
        transaction_signature: `sig${Math.random().toString(36).substring(2, 15)}`,
        slippage_realized: Math.round(slippage * 1000) / 1000,
        execution_time_ms: Math.round(Math.random() * 3000 + 500),
        rationale: `Rebalance portfolio: Swap ${Math.round((amount/10000)*100)}% of ${fromToken} for ${toToken} to achieve target allocation`,
        risk_score: Math.round(Math.random() * 30 + 5)
      };
    });

    const response = {
      user_id: userId,
      trades: mockTrades,
      pagination: {
        limit,
        offset,
        total: 147, // Mock total
        has_more: offset + limit < 147
      },
      summary: {
        total_trades: 147,
        successful_trades: 146,
        failed_trades: 1,
        success_rate: 99.3,
        total_volume_usd: 1250000,
        average_slippage: 0.08
      }
    };

    return NextResponse.json({
      ...response,
      _mock: true,
      _service_status: 'unavailable'
    });

  } catch (error) {
    console.error('Bot trades API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch bot trades' },
      { status: 500 }
    );
  }
}