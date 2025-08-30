/**
 * Fast Settings API
 * Optimized version with minimal database calls
 */

import { NextRequest, NextResponse } from 'next/server';
import { fastQuery, FAST_QUERIES } from '@/lib/fastDatabase';

export async function GET(request: NextRequest) {
  const _startTime = Date.now();
  
  try {
    const { searchParams } = new URL(request.url);
    const walletAddress = searchParams.get('walletAddress');

    if (!walletAddress) {
      return NextResponse.json(
        { success: false, error: 'Wallet address required' },
        { status: 400 }
      );
    }

    // Use optimized query with caching
    const settings = await fastQuery(
      FAST_QUERIES.getUserSettings,
      [walletAddress]
    );

    let settingsData;
    if (settings.length > 0) {
      const dbSettings = settings[0];
      settingsData = {
        walletAddress: dbSettings.walletAddress,
        riskProfile: dbSettings.riskProfile || 'Balanced',
        ...dbSettings.settings,
        lastUpdated: Date.now(),
        createdAt: Date.now()
      };
    } else {
      // Default settings for new users
      settingsData = {
        walletAddress,
        riskProfile: 'Balanced',
        maxDrawdownLimit: 15,
        positionSizePercent: 5,
        stopLossEnabled: true,
        takeProfitEnabled: true,
        lastUpdated: Date.now(),
        createdAt: Date.now()
      };
    }

    const duration = Date.now() - _startTime;
    console.log(`⚡ Fast settings API: ${duration}ms`);

    return NextResponse.json({
      success: true,
      data: settingsData,
      timestamp: Date.now(),
      requestId: `fast_settings_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      performance: `${duration}ms`
    });

  } catch {
    const duration = Date.now() - _startTime;
    console.error(`❌ Fast settings API error (${duration}ms):`);

    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch settings',
        performance: `${duration}ms`
      },
      { status: 500 }
    );
  }
}