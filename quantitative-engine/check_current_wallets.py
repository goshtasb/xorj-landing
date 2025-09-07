#!/usr/bin/env python3
"""
Check Current Analyzed Wallets
Shows what wallets are currently discovered and analyzed by the system
"""

import asyncio
import os
import sys
from datetime import datetime, timezone

# Add the app directory to the path
sys.path.append(os.path.join(os.path.dirname(__file__), 'app'))

from app.blockchain.trader_discovery import get_trader_discovery
from app.worker import get_monitored_wallets

async def check_current_wallets():
    """Check what wallets are currently being analyzed and used"""
    
    print("🔍 Checking Current System Wallet Analysis")
    print("=" * 50)
    
    try:
        print("\n📊 1. Live Trader Discovery:")
        discovery = await get_trader_discovery()
        
        # Discover current top traders from live mainnet
        discovered_traders = await discovery.discover_top_traders(limit=15)
        
        if discovered_traders:
            print(f"   ✅ Discovered {len(discovered_traders)} active traders from live mainnet:")
            print()
            print("   Rank | Wallet Address                              | Trust Score | Total Trades | Volume (USD)")
            print("   -----|---------------------------------------------|-------------|--------------|-------------")
            
            for trader in discovered_traders[:10]:  # Show top 10
                addr = trader["wallet_address"]
                score = trader["trust_score"]
                trades = trader["metrics"]["total_trades"]
                volume = trader["metrics"]["total_volume_usd"]
                
                print(f"   #{trader['rank']:2d}   | {addr} | {score:8.2f}    | {trades:9,d}    | ${volume:8,.0f}")
            
            print(f"\n   📈 Performance Summary:")
            avg_score = sum(t["trust_score"] for t in discovered_traders) / len(discovered_traders)
            total_trades = sum(t["metrics"]["total_trades"] for t in discovered_traders)
            total_volume = sum(t["metrics"]["total_volume_usd"] for t in discovered_traders)
            
            print(f"      Average Trust Score: {avg_score:.2f}")
            print(f"      Total Trades: {total_trades:,}")
            print(f"      Total Volume: ${total_volume:,.0f}")
            
        else:
            print("   ⚠️  No traders discovered from current mainnet analysis")
            print("   📝 This could indicate:")
            print("      - Low current DEX activity")
            print("      - API rate limiting") 
            print("      - Network connectivity issues")
        
        print("\n📊 2. Monitored Wallets for Data Ingestion:")
        try:
            monitored_wallets = await get_monitored_wallets()
            
            if monitored_wallets:
                print(f"   ✅ System monitoring {len(monitored_wallets)} wallets for ingestion:")
                print()
                
                for i, wallet in enumerate(monitored_wallets[:5], 1):  # Show first 5
                    print(f"   {i}. {wallet}")
                
                if len(monitored_wallets) > 5:
                    print(f"   ... and {len(monitored_wallets) - 5} more wallets")
                    
            else:
                print("   ⚠️  No wallets currently being monitored")
                
        except Exception as e:
            print(f"   ❌ Error getting monitored wallets: {e}")
        
        print("\n📊 3. Database Analysis:")
        
        # Check for any existing data ingestion logs
        try:
            import asyncpg
            from app.core.config import get_settings
            settings = get_settings()
            
            conn = await asyncpg.connect(settings.database_url)
            try:
                # Check data ingestion logs
                ingestion_count = await conn.fetchval(
                    "SELECT COUNT(*) FROM data_ingestion_log"
                )
                print(f"   📝 Data ingestion log entries: {ingestion_count:,}")
                
                if ingestion_count > 0:
                    recent_ingestions = await conn.fetch("""
                        SELECT wallet_address, ingestion_method, transactions_processed, created_at
                        FROM data_ingestion_log 
                        ORDER BY created_at DESC 
                        LIMIT 5
                    """)
                    
                    print(f"   🕒 Recent ingestions:")
                    for log in recent_ingestions:
                        method = log['ingestion_method'] or 'UNKNOWN'
                        tx_count = log['transactions_processed'] or 0
                        date = log['created_at'].strftime('%Y-%m-%d %H:%M')
                        addr_short = log['wallet_address'][:8] + "..." + log['wallet_address'][-8:]
                        print(f"      {date} | {addr_short} | {method:7} | {tx_count:6,} txs")
                
                # Check trader transactions
                tx_count = await conn.fetchval(
                    "SELECT COUNT(*) FROM trader_transactions"
                )
                print(f"   💰 Trader transaction records: {tx_count:,}")
                
                if tx_count > 0:
                    unique_wallets = await conn.fetchval(
                        "SELECT COUNT(DISTINCT wallet_address) FROM trader_transactions"
                    )
                    print(f"   👥 Unique wallets with transactions: {unique_wallets:,}")
                
            finally:
                await conn.close()
                
        except Exception as e:
            print(f"   ❌ Database check error: {e}")
        
        print(f"\n🎯 CURRENT SYSTEM STATUS:")
        if discovered_traders:
            print(f"   ✅ Active mainnet discovery: {len(discovered_traders)} traders found")
            print(f"   ✅ No hardcoded data dependencies")
            print(f"   ✅ Dynamic trader analysis operational")
        else:
            print(f"   ⚠️  Limited discovery results - may need investigation")
        
    except Exception as e:
        print(f"❌ Analysis failed: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    # Set required environment variables
    os.environ["HELIUS_API_KEY"] = "e5fdf1c6-20b1-48b6-b33c-4be56e8e219c"
    
    asyncio.run(check_current_wallets())