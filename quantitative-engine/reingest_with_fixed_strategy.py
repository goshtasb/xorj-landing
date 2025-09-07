#!/usr/bin/env python3
"""
Re-ingest existing wallet with fixed sampling strategy
Captures more complete data instead of just 10 samples per day
"""

import asyncio
import os
import sys
from datetime import datetime, timezone

# Add the app directory to the path
sys.path.append(os.path.join(os.path.dirname(__file__), 'app'))

from app.ingestion.worker import run_ingestion_for_wallets

async def reingest_wallet():
    """Re-ingest the existing wallet with improved settings"""
    
    wallet_address = "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1"
    
    print("🔧 RE-INGESTING WALLET WITH FIXED STRATEGY")
    print("=" * 60)
    print(f"   Wallet: {wallet_address}")
    print(f"   Settings improved:")
    print(f"     • Threshold increased to 50,000 (was 10,000)")
    print(f"     • Samples per day increased to 100 (was 10)")
    print(f"     • This should capture 10x more data")
    print()
    
    try:
        # Run ingestion with 30-day lookback for initial test
        print("📊 Starting re-ingestion with 30-day lookback...")
        results = await run_ingestion_for_wallets([wallet_address], lookback_hours=720)  # 30 days
        
        print("\n📊 INGESTION RESULTS:")
        for wallet, status in results.items():
            print(f"   Wallet: {wallet[:20]}...{wallet[-20:]}")
            print(f"   Success: {'✅' if status.success else '❌'}")
            print(f"   Total transactions found: {status.total_transactions_found:,}")
            print(f"   Valid swaps extracted: {status.valid_swaps_extracted:,}")
            
            if status.errors:
                print(f"   Errors: {len(status.errors)}")
                for error in status.errors[:3]:
                    print(f"     - {error[:100]}")
        
        print("\n✅ Re-ingestion complete!")
        print("   Next step: Check database for increased swap count")
        
    except Exception as e:
        print(f"❌ Error during re-ingestion: {e}")
        import traceback
        traceback.print_exc()

async def check_database_after_reingest():
    """Check the database to verify more swaps were captured"""
    
    from app.database.service import DatabaseService
    
    print("\n📊 CHECKING DATABASE...")
    print("=" * 60)
    
    db_service = DatabaseService()
    
    try:
        # Get swap count for the wallet
        query = """
            SELECT 
                COUNT(*) as total_swaps,
                MIN(block_time) as earliest_swap,
                MAX(block_time) as latest_swap,
                COUNT(DISTINCT DATE(block_time)) as trading_days
            FROM parsed_raydium_swaps 
            WHERE wallet_address = %s
        """
        
        wallet = "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1"
        
        result = await db_service.fetch_one(query, (wallet,))
        
        if result:
            total_swaps = result['total_swaps']
            earliest = result['earliest_swap']
            latest = result['latest_swap']
            trading_days = result['trading_days']
            
            print(f"   Wallet: {wallet[:20]}...{wallet[-20:]}")
            print(f"   Total Raydium swaps: {total_swaps:,}")
            print(f"   Trading days: {trading_days}")
            
            if earliest and latest:
                time_span = latest - earliest
                print(f"   Time span: {time_span.days} days")
                print(f"   Earliest swap: {earliest}")
                print(f"   Latest swap: {latest}")
                
                if total_swaps > 95:
                    print(f"\n   🎉 SUCCESS! Increased from 95 to {total_swaps:,} swaps!")
                    print(f"   📈 That's {(total_swaps/95 - 1)*100:.1f}% more data!")
                else:
                    print(f"\n   ⚠️  Still only {total_swaps} swaps")
                    print(f"   May need to adjust strategy further")
        else:
            print("   ❌ No data found for wallet")
            
    except Exception as e:
        print(f"❌ Database check failed: {e}")
    finally:
        await db_service.close()

async def main():
    """Main function"""
    
    # First reingest
    await reingest_wallet()
    
    # Then check results
    await check_database_after_reingest()
    
    print("\n✅ COMPLETE!")
    print("   The ingestion strategy has been improved")
    print("   High-frequency traders will now have more complete data")

if __name__ == "__main__":
    # Set required environment variables
    os.environ.update({
        "HELIUS_API_KEY": "e5fdf1c6-20b1-48b6-b33c-4be56e8e219c",
        "DATABASE_URL": "postgresql://xorj:xorj_password@localhost:5432/xorj_quant",
        "REDIS_URL": "redis://localhost:6379",
        "SOLANA_RPC_URL": "https://mainnet.helius-rpc.com/?api-key=e5fdf1c6-20b1-48b6-b33c-4be56e8e219c",
        "XORJ_INTERNAL_API_KEY": "xorj-internal-api-key-v1-prod-2025"
    })
    
    asyncio.run(main())