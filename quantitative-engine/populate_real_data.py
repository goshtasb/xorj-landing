#!/usr/bin/env python3
"""
Emergency fix for Data Ingestion Service
Populates real trading data to activate the quantitative engine
"""

import asyncio
import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.core.logging import get_api_logger
from app.ingestion.worker import DataIngestionWorker
from app.ingestion.solana_client import get_helius_client

logger = get_api_logger()

# High-activity Solana wallets known to trade on Raydium/Jupiter
ACTIVE_TRADER_WALLETS = [
    "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1",  # Jupiter aggregator wallet
    "GThUX1Atko4tqhN2NaiTazWSeFWMuiUiswQeNf8DMYjV",  # High-volume trader
    "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",  # DEX trader
    "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R",  # Another active wallet
    "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"   # Known Solana trader
]

async def populate_real_trading_data():
    """Populate the system with real trading data"""
    print("🚀 Starting emergency data population...")
    
    try:
        # Initialize worker
        worker = DataIngestionWorker()
        await worker.initialize()
        
        print(f"📊 Processing {len(ACTIVE_TRADER_WALLETS)} active trader wallets...")
        
        total_swaps = 0
        successful_wallets = 0
        
        for i, wallet in enumerate(ACTIVE_TRADER_WALLETS, 1):
            print(f"\n[{i}/{len(ACTIVE_TRADER_WALLETS)}] Processing wallet: {wallet}")
            
            try:
                # Fetch recent signatures (last 7 days)
                signatures = await worker.fetch_wallet_signatures(wallet)
                print(f"  Found {len(signatures)} transactions")
                
                if signatures:
                    # Parse transactions for swaps
                    swaps, errors = await worker.fetch_and_parse_transactions(wallet, signatures)
                    print(f"  Extracted {len(swaps)} swaps")
                    
                    if errors:
                        print(f"  ⚠️ {len(errors)} parsing errors")
                    
                    total_swaps += len(swaps)
                    if len(swaps) > 0:
                        successful_wallets += 1
                        print(f"  ✅ Successfully processed with {len(swaps)} swaps")
                    else:
                        print(f"  ℹ️ No swaps found (may be non-trader)")
                else:
                    print(f"  ℹ️ No transactions found")
                    
            except Exception as e:
                print(f"  ❌ Failed to process: {str(e)}")
                continue
        
        print(f"\n🎉 Data population completed!")
        print(f"📈 Results:")
        print(f"  - Processed wallets: {len(ACTIVE_TRADER_WALLETS)}")
        print(f"  - Successful wallets: {successful_wallets}")
        print(f"  - Total swaps extracted: {total_swaps}")
        
        # Update worker stats
        worker.stats['total_wallets_processed'] = len(ACTIVE_TRADER_WALLETS)
        worker.stats['total_swaps_extracted'] = total_swaps
        
        await worker.shutdown()
        
        if total_swaps > 0:
            print("\n✅ SUCCESS: Data ingestion service is now active with real trading data!")
            return True
        else:
            print("\n⚠️ WARNING: No swaps were extracted. May need to check wallet addresses or parsing logic.")
            return False
            
    except Exception as e:
        print(f"\n❌ CRITICAL ERROR during data population: {str(e)}")
        return False

if __name__ == "__main__":
    success = asyncio.run(populate_real_trading_data())
    sys.exit(0 if success else 1)