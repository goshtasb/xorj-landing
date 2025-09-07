#!/usr/bin/env python3
"""
Test high-volume wallet historical data collection
Specifically designed for wallets with extremely high transaction volume
"""

import asyncio
import os
import sys
from datetime import datetime, timezone, timedelta

# Add the app directory to the path
sys.path.append(os.path.join(os.path.dirname(__file__), 'app'))

from app.ingestion.worker import DataIngestionWorker

async def test_high_volume_wallet():
    """Test high-volume wallet data collection with no transaction limit"""
    
    wallet_address = "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1"
    
    print(f"Testing high-volume wallet: {wallet_address}")
    print("This will attempt to collect historical data spanning 90+ days...")
    
    # Create worker with no transaction limit
    worker = DataIngestionWorker(
        max_transactions_per_wallet=1000000  # Very high limit to force historical collection
    )
    
    try:
        # Initialize worker
        await worker.initialize()
        
        # Calculate extended date range - go back 120 days to be sure
        end_date = datetime.now(timezone.utc)
        start_date = end_date - timedelta(days=120)
        
        print(f"Date range: {start_date.isoformat()} to {end_date.isoformat()}")
        
        # Fetch signatures with extended range
        print("Fetching transaction signatures...")
        signatures = await worker.fetch_wallet_signatures(
            wallet_address,
            start_date=start_date,
            end_date=end_date
        )
        
        print(f"Total signatures found: {len(signatures)}")
        
        if signatures:
            # Process first batch to see time distribution
            print(f"Processing first 1000 transactions to check time distribution...")
            
            parsed_swaps, errors = await worker.fetch_and_parse_transactions(
                wallet_address,
                signatures[:1000]  # Process first 1000 to check dates
            )
            
            print(f"Parsed {len(parsed_swaps)} swaps from first 1000 transactions")
            print(f"Errors: {len(errors)}")
            
            if parsed_swaps:
                # Check time distribution
                earliest = min(swap.block_time for swap in parsed_swaps)
                latest = max(swap.block_time for swap in parsed_swaps)
                print(f"Time range in first batch: {earliest} to {latest}")
                
                days_span = (latest - earliest).days
                print(f"Days span: {days_span}")
                
                if days_span > 1:
                    print("✅ SUCCESS: Found transactions spanning multiple days!")
                else:
                    print("❌ ISSUE: Still only getting same-day transactions")
            
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
    
    finally:
        await worker.shutdown()

if __name__ == "__main__":
    # Set required environment variables
    os.environ["HELIUS_API_KEY"] = "e5fdf1c6-20b1-48b6-b33c-4be56e8e219c"
    
    asyncio.run(test_high_volume_wallet())