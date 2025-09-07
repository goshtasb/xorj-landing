#!/usr/bin/env python3
"""
Add a single new wallet to the system for testing
Use a wallet with known recent activity
"""

import asyncio
import os
import sys
from datetime import datetime, timezone, timedelta

# Add the app directory to the path
sys.path.append(os.path.join(os.path.dirname(__file__), 'app'))

from app.ingestion.worker import run_ingestion_for_wallets

async def add_single_active_wallet():
    """Add one known active wallet with minimal lookback"""
    
    # Use a wallet with known recent activity on mainnet
    # This is a public address of a known MEV bot that's very active
    new_wallet = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"
    
    print("🎯 Adding single active wallet to quantitative engine")
    print("=" * 55)
    print(f"📍 Target wallet: {new_wallet}")
    print(f"⏰ Using 7-day lookback to avoid rate limits...")
    
    try:
        # Use a much shorter lookback period (7 days = 168 hours) to avoid rate limits
        results = await run_ingestion_for_wallets([new_wallet], lookback_hours=168)
        
        print(f"\n✅ INGESTION RESULT:")
        print("=" * 40)
        
        for wallet, status in results.items():
            print(f"📍 Wallet: {wallet}")
            print(f"   Success: {'✅' if status.success else '❌'}")
            print(f"   Total transactions: {status.total_transactions_found:,}")
            print(f"   Valid swaps: {status.valid_swaps_extracted:,}")
            
            if status.errors:
                print(f"   Errors ({len(status.errors)}):")
                for i, error in enumerate(status.errors[:5], 1):
                    print(f"     {i}. {error}")
        
        if status.success and status.valid_swaps_extracted > 0:
            print(f"\n🎉 SUCCESS! New wallet added to the system!")
            print(f"💡 The quantitative engine now has 2 total wallets")
        else:
            print(f"\n⚠️  Wallet ingestion had issues")
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    os.environ["HELIUS_API_KEY"] = "e5fdf1c6-20b1-48b6-b33c-4be56e8e219c"
    os.environ["DATABASE_URL"] = "postgresql://xorj:xorj_password@localhost:5432/xorj_quant"
    
    asyncio.run(add_single_active_wallet())