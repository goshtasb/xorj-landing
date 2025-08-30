/**
 * Wallet Balance API Endpoint
 * GET /api/wallet/balance?walletAddress=<address>
 * 
 * Returns real-time wallet balance information
 */

import { NextRequest, NextResponse } from 'next/server';
import { walletBalanceService } from '@/lib/walletBalance';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const walletAddress = searchParams.get('walletAddress');

    if (!walletAddress) {
      return NextResponse.json({ 
        success: false, 
        error: 'Wallet address is required' 
      }, { status: 400 });
    }

    console.log(`💰 Fetching balance for wallet: ${walletAddress}`);
    
    const balanceData = await walletBalanceService.getWalletBalances(walletAddress);
    
    return NextResponse.json({
      success: true,
      data: {
        walletAddress,
        totalUsdValue: balanceData.totalUsdValue,
        solBalance: balanceData.solBalance,
        solUsdValue: balanceData.solUsdValue,
        tokenBalances: balanceData.tokenBalances,
        maxInvestable: Math.max(0, balanceData.totalUsdValue * 0.98 - 10),
        lastUpdated: balanceData.lastUpdated
      }
    });

  } catch {
    console.error('Wallet balance API error:');
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch wallet balance'
    }, { status: 500 });
  }
}