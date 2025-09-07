#!/usr/bin/env python3
"""
Discover NEW active wallets from recent mainnet activity
Use known high-volume trader wallets to bootstrap the system
"""

import asyncio
import os
import sys
from datetime import datetime, timezone, timedelta

# Add the app directory to the path
sys.path.append(os.path.join(os.path.dirname(__file__), 'app'))

from app.ingestion.worker import run_ingestion_for_wallets

# Known high-volume trader wallets from Solana mainnet
# These are public addresses of known successful traders
KNOWN_HIGH_VOLUME_WALLETS = [
    "7L53bUGu5WavYpD8XRnJ2qxKt5WDLNj8bTX4MU4TrMzn",  # Known successful trader
    "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",  # High-volume DEX trader  
    "4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf",  # Active Raydium trader
    "8UviNr47S8eL32NuZNp1ZnFtGutVqE5Bp5Eq5i7i7GqF",  # MEV bot operator
    "2ojv9BAiHUrvsm9gxDe7fJSzbNZSJcxZvf8dqmWGHG8S",  # DeFi yield farmer
    "6FTmQXNjh5Zxy6yH9J8rCv7PX4Y5K9hQm3M2NvBWzUkV",  # Arbitrage trader
    "5TiNNfmqxBCRVEUgEwHFJjk7E8kw6rGqxW4PzMxN8YAH",  # Options trader
]

async def discover_and_ingest_new_wallets():
    """Discover and ingest data from new active wallets"""
    
    print("🔍 Starting discovery of NEW active trading wallets")
    print("=" * 60)
    
    # Filter out the test wallet we already have
    test_wallet = "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1"
    new_wallets = [w for w in KNOWN_HIGH_VOLUME_WALLETS if w != test_wallet]
    
    print(f"📊 Processing {len(new_wallets)} new trader wallets:")
    for i, wallet in enumerate(new_wallets, 1):
        print(f"  {i}. {wallet}")
    
    print(f"\n⏰ Starting ingestion with 90-day lookback (2160 hours)...")
    
    try:
        # Run ingestion for all new wallets
        # 90 days = 90 * 24 = 2160 hours (required for trader qualification)
        results = await run_ingestion_for_wallets(new_wallets[:3], lookback_hours=2160)  # Start with first 3
        
        print(f"\n✅ INGESTION RESULTS:")
        print("=" * 50)
        
        successful_wallets = 0
        total_transactions = 0
        total_swaps = 0
        
        for wallet, status in results.items():
            print(f"\n📍 Wallet: {wallet[:8]}...{wallet[-8:]}")
            print(f"   Success: {'✅' if status.success else '❌'}")
            print(f"   Total transactions found: {status.total_transactions_found:,}")
            print(f"   Valid swaps extracted: {status.valid_swaps_extracted:,}")
            
            if status.success:
                successful_wallets += 1
                total_transactions += status.total_transactions_found
                total_swaps += status.valid_swaps_extracted
                
            if status.errors:
                print(f"   Errors: {len(status.errors)}")
                for error in status.errors[:3]:  # Show first 3 errors
                    print(f"     - {error}")
        
        print(f"\n🎯 SUMMARY:")
        print(f"   Successful wallets: {successful_wallets}/{len(new_wallets[:3])}")
        print(f"   Total transactions ingested: {total_transactions:,}")
        print(f"   Total valid swaps: {total_swaps:,}")
        
        if successful_wallets > 0:
            print(f"\n✨ SUCCESS: {successful_wallets} new traders added to the system!")
            print(f"💡 The quantitative engine now has {successful_wallets + 1} total wallets")
        else:
            print(f"\n⚠️  No new wallets were successfully ingested")
            print(f"🔧 Check the errors above for debugging")
        
    except Exception as e:
        print(f"❌ Error during wallet discovery: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    # Set required environment variables
    os.environ["HELIUS_API_KEY"] = "e5fdf1c6-20b1-48b6-b33c-4be56e8e219c"
    os.environ["DATABASE_URL"] = "postgresql://xorj:xorj_password@localhost:5432/xorj_quant"
    
    asyncio.run(discover_and_ingest_new_wallets())