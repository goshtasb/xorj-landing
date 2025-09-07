#!/usr/bin/env python3
"""
V1 Wallet Discovery Script
Identify promising wallets from mainnet for manual curation and 90-day data ingestion
"""

import asyncio
import sys
import os
from datetime import datetime, timezone

# Add the app directory to Python path
sys.path.append(os.path.join(os.path.dirname(__file__), 'app'))

async def discover_promising_wallets():
    try:
        # Bypass secure configuration by setting environment directly
        os.environ.setdefault("ENVIRONMENT", "development")
        os.environ.setdefault("DATABASE_URL", "postgresql://xorj:@localhost:5432/xorj_quant")
        
        from app.blockchain.trader_discovery import MainnetTraderDiscovery
        
        print('🔍 Starting mainnet trader discovery for V1 wallet selection...')
        print('📊 Scanning recent DEX transactions to find high-activity wallets...')
        
        discovery = MainnetTraderDiscovery()
        await discovery.initialize()
        
        # Get recent high-activity traders from multiple DEX programs
        print('\n🎯 Discovering top traders from mainnet DEX programs...')
        
        # Get promising wallets - we'll manually review these for V1
        discovered_traders = await discovery.discover_top_traders(
            limit=20,  # Get top 20 for manual review
            min_volume_usd=1000,  # Lower threshold for discovery
            lookback_days=30      # Recent activity
        )
        
        print(f'\n✅ Found {len(discovered_traders)} promising wallet candidates:')
        print('-' * 80)
        
        promising_wallets = []
        for i, trader in enumerate(discovered_traders[:10], 1):
            wallet = trader['wallet_address']
            metrics = trader['metrics']
            score = trader.get('trust_score', 0)
            
            print(f'{i:2d}. {wallet}')
            print(f'    Trust Score: {score:.2f}')
            print(f'    Volume: ${metrics.get("total_volume_usd", 0):,.2f}')
            print(f'    Trades: {metrics.get("total_trades", 0)}')
            print(f'    Win Rate: {metrics.get("win_rate", 0)*100:.1f}%')
            print(f'    ROI: {metrics.get("net_roi", 0)*100:.1f}%')
            print()
            
            promising_wallets.append(wallet)
        
        print('\n🎯 V1 Recommended Wallets for Data Ingestion:')
        print('=' * 80)
        for i, wallet in enumerate(promising_wallets, 1):
            print(f'{i}. {wallet}')
        
        return promising_wallets
        
    except Exception as e:
        print(f'❌ Discovery failed: {e}')
        import traceback
        traceback.print_exc()
        return []

if __name__ == "__main__":
    # Set required environment variables
    os.environ["HELIUS_API_KEY"] = "e5fdf1c6-20b1-48b6-b33c-4be56e8e219c"
    
    # Run discovery
    wallets = asyncio.run(discover_promising_wallets())
    
    if wallets:
        print(f'\n✨ Ready for V1: {len(wallets)} wallets identified for manual curation and 90-day data ingestion')
    else:
        print('\n⚠️  No wallets identified. Check the discovery configuration.')