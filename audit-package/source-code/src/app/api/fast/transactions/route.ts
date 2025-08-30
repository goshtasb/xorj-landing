/**
 * Fast Transactions API
 * Optimized version with connection pooling and caching
 */

import { NextRequest, NextResponse } from 'next/server';
import { fastQuery, FAST_QUERIES } from '@/lib/fastDatabase';

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    const { searchParams } = new URL(request.url);
    const walletAddress = searchParams.get('walletAddress');
    const limit = parseInt(searchParams.get('limit') || '10');

    if (!walletAddress) {
      return NextResponse.json(
        { success: false, error: 'Wallet address required' },
        { status: 400 }
      );
    }

    // Use optimized query with caching
    const transactions = await fastQuery(
      FAST_QUERIES.getUserTransactions,
      [walletAddress, limit]
    );

    // Transform data for frontend compatibility
    const transformedTransactions = transactions.map(tx => ({
      id: tx.id,
      walletAddress: tx.walletAddress,
      timestamp: new Date(tx.timestamp).getTime(),
      type: tx.symbol === 'So11111111111111111111111111111111111111112' ? 'SELL' : 'BUY',
      status: 'COMPLETED',
      symbol: 'SOL',
      amount: parseFloat(tx.amount) / 1000000000, // Convert from lamports
      price: parseFloat(tx.totalValue) / parseFloat(tx.amount) * 1000000000,
      totalValue: parseFloat(tx.totalValue) / 1000000, // Convert to USDC
      fees: parseFloat(tx.fees) / 1000000000, // Convert from lamports
      txHash: tx.txHash
    }));

    const duration = Date.now() - startTime;
    console.log(`⚡ Fast transactions API: ${duration}ms`);

    return NextResponse.json({
      success: true,
      data: {
        transactions: transformedTransactions,
        totalCount: transformedTransactions.length,
        pageCount: 1,
        currentPage: 1
      },
      requestId: `fast_txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      performance: `${duration}ms`
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`❌ Fast transactions API error (${duration}ms):`, error);

    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch transactions',
        performance: `${duration}ms`
      },
      { status: 500 }
    );
  }
}