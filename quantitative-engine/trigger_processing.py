#!/usr/bin/env python3
"""
Trigger data processing pipeline for raw transactions
Direct script to process raw transactions without API authentication
"""

import asyncio
import os
import sys

# Add the app directory to the path
sys.path.append(os.path.join(os.path.dirname(__file__), 'app'))

from app.ingestion.worker import run_ingestion_for_wallets

async def main():
    """Trigger processing for the wallet with raw transaction data"""
    
    wallet_address = "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1"
    
    print(f"Triggering data processing pipeline for wallet: {wallet_address}")
    print("This will fetch and parse transaction data...")
    
    try:
        # Run ingestion for the wallet that has raw transaction data
        # 90 days = 90 * 24 = 2160 hours (required for trader qualification)
        results = await run_ingestion_for_wallets([wallet_address], lookback_hours=2160)
        
        # Display results
        for wallet, status in results.items():
            print(f"\nWallet: {wallet}")
            print(f"Success: {status.success}")
            print(f"Total transactions: {status.total_transactions_found}")
            print(f"Valid swaps extracted: {status.valid_swaps_extracted}")
            if status.errors:
                print(f"Errors: {status.errors}")
        
        print("\nData processing pipeline completed!")
        
    except Exception as e:
        print(f"Error triggering data processing: {e}")

if __name__ == "__main__":
    # Set required environment variables
    os.environ["HELIUS_API_KEY"] = "e5fdf1c6-20b1-48b6-b33c-4be56e8e219c"
    
    asyncio.run(main())