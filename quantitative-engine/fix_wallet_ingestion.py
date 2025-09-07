#!/usr/bin/env python3
"""
Fix wallet ingestion to capture ALL swaps, not just first batch
"""

import asyncio
import httpx
import os
import sys
from datetime import datetime, timezone, timedelta

# Add the app directory to the path
sys.path.append(os.path.join(os.path.dirname(__file__), 'app'))

from app.ingestion.worker import run_ingestion_for_wallets

async def check_wallet_full_history():
    """Check the actual full history of the wallet on-chain"""
    
    wallet_address = "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1"
    helius_api_key = "e5fdf1c6-20b1-48b6-b33c-4be56e8e219c"
    solana_rpc = f"https://mainnet.helius-rpc.com/?api-key={helius_api_key}"
    
    print(f"🔍 CHECKING FULL HISTORY FOR WALLET")
    print(f"   Address: {wallet_address}")
    print("=" * 60)
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            print("\n📊 Fetching ALL transaction signatures (not just first batch)...")
            
            all_signatures = []
            before_signature = None
            batch_count = 0
            
            while True:
                batch_count += 1
                
                # Get signatures batch
                params = {
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "getSignaturesForAddress",
                    "params": [
                        wallet_address,
                        {
                            "limit": 1000,  # Max allowed
                            "commitment": "confirmed"
                        }
                    ]
                }
                
                if before_signature:
                    params["params"][1]["before"] = before_signature
                
                response = await client.post(solana_rpc, json=params)
                
                if response.status_code != 200:
                    print(f"❌ API error: {response.status_code}")
                    break
                
                data = response.json()
                if "result" not in data or not data["result"]:
                    print(f"   Batch {batch_count}: No more signatures")
                    break
                
                batch_signatures = data["result"]
                print(f"   Batch {batch_count}: Found {len(batch_signatures)} signatures")
                
                all_signatures.extend(batch_signatures)
                
                # Set up for next batch
                if len(batch_signatures) < 1000:
                    # This was the last batch
                    break
                else:
                    # Get the last signature for pagination
                    before_signature = batch_signatures[-1]["signature"]
                    
                # Safety limit to avoid infinite loop
                if batch_count >= 10:
                    print(f"   Stopping at {batch_count} batches for safety")
                    break
            
            print(f"\n📊 TOTAL SIGNATURES FOUND: {len(all_signatures)}")
            
            if all_signatures:
                # Analyze time range
                first_time = all_signatures[0].get("blockTime")
                last_time = all_signatures[-1].get("blockTime")
                
                if first_time and last_time:
                    first_date = datetime.fromtimestamp(first_time, timezone.utc)
                    last_date = datetime.fromtimestamp(last_time, timezone.utc)
                    time_span = first_date - last_date
                    
                    print(f"\n⏰ TIME RANGE:")
                    print(f"   First transaction: {first_date}")
                    print(f"   Last transaction: {last_date}")
                    print(f"   Time span: {time_span.days} days, {time_span.seconds//3600} hours")
                
                print(f"\n💡 This wallet has {len(all_signatures)} total transactions on-chain")
                print(f"   But database only has 95 swaps from a 14-minute window")
                print(f"   The ingestion is clearly incomplete!")
            
        except Exception as e:
            print(f"❌ Error: {e}")
            import traceback
            traceback.print_exc()

async def fix_wallet_ingestion():
    """Re-ingest the wallet with proper parameters to get ALL data"""
    
    wallet_address = "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1"
    
    print(f"\n🔧 FIXING WALLET INGESTION")
    print("=" * 60)
    print(f"   Re-ingesting with 90-day lookback to capture full history...")
    
    try:
        # Run ingestion with 90-day lookback
        results = await run_ingestion_for_wallets([wallet_address], lookback_hours=2160)  # 90 days
        
        print(f"\n📊 INGESTION RESULTS:")
        for wallet, status in results.items():
            print(f"   Wallet: {wallet}")
            print(f"   Success: {'✅' if status.success else '❌'}")
            print(f"   Total transactions found: {status.total_transactions_found:,}")
            print(f"   Valid swaps extracted: {status.valid_swaps_extracted:,}")
            
            if status.errors:
                print(f"   Errors: {len(status.errors)}")
                for error in status.errors[:3]:
                    print(f"     - {error}")
        
        print(f"\n✅ Re-ingestion complete!")
        print(f"   Check database to verify more swaps were captured")
        
    except Exception as e:
        print(f"❌ Error during re-ingestion: {e}")
        import traceback
        traceback.print_exc()

async def main():
    """Main function"""
    
    # First check the actual on-chain history
    await check_wallet_full_history()
    
    # Then fix the ingestion
    await fix_wallet_ingestion()
    
    print(f"\n🎯 NEXT STEP: Check database to verify complete data was captured")
    print(f"   Run: psql -c \"SELECT COUNT(*) FROM parsed_raydium_swaps WHERE wallet_address = '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1';\"")

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