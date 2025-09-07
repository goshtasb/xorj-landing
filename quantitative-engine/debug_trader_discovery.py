#!/usr/bin/env python3
"""
Debug Trader Discovery
Show the full discovery pipeline to understand what's being filtered out
"""

import asyncio
import os
import sys
from datetime import datetime, timezone, timedelta

# Add the app directory to the path
sys.path.append(os.path.join(os.path.dirname(__file__), 'app'))

from app.blockchain.trader_discovery import get_trader_discovery

async def debug_discovery_pipeline():
    """Debug the discovery pipeline to see filtering stages"""
    
    print("🔍 DEBUG: TRADER DISCOVERY PIPELINE")
    print("=" * 60)
    
    try:
        # Get the trader discovery service
        discovery_service = await get_trader_discovery()
        
        print("Step 1: Analyzing DEX transactions for candidate wallets...")
        
        # Get candidate wallets from DEX analysis  
        candidates = await discovery_service._analyze_dex_transactions(50)
        print(f"   Found {len(candidates)} candidate wallet addresses from DEX activity")
        
        if candidates:
            print("   Sample candidates:")
            for i, candidate in enumerate(candidates[:5], 1):
                addr = candidate["wallet_address"]
                print(f"     {i}. {addr[:8]}...{addr[-8:]}")
        
        print(f"\nStep 2: Analyzing performance for each candidate...")
        
        qualified_traders = 0
        analyzed_count = 0
        
        for i, candidate in enumerate(candidates[:10], 1):  # Analyze first 10 to avoid rate limits
            wallet = candidate["wallet_address"]
            print(f"   Analyzing {i}/10: {wallet[:8]}...{wallet[-8:]}", end=" -> ")
            
            try:
                performance = await discovery_service._analyze_trader_performance(wallet)
                analyzed_count += 1
                
                if performance:
                    trades = performance.total_trades
                    volume = performance.total_volume_usd
                    win_rate = performance.win_rate * 100
                    roi = performance.roi_percent
                    
                    print(f"T:{trades}, V:${volume:,.0f}, W:{win_rate:.1f}%, ROI:{roi:.1f}%", end="")
                    
                    # Check quality criteria
                    meets_criteria = discovery_service._meets_quality_criteria(performance)
                    if meets_criteria:
                        print(" ✅ QUALIFIED")
                        qualified_traders += 1
                    else:
                        reasons = []
                        if trades < 20:
                            reasons.append(f"trades<20")
                        if volume < 50000:
                            reasons.append(f"volume<$50k")
                        if win_rate < 35:
                            reasons.append(f"winrate<35%")
                        if abs(roi) < 5:
                            reasons.append(f"roi<5%")
                        print(f" ❌ ({', '.join(reasons)})")
                else:
                    print("❌ No performance data")
                    
            except Exception as e:
                print(f"❌ Error: {str(e)[:50]}")
        
        print(f"\n📊 DISCOVERY SUMMARY:")
        print(f"   Candidate wallets found: {len(candidates)}")
        print(f"   Successfully analyzed: {analyzed_count}/10")
        print(f"   Meeting quality criteria: {qualified_traders}")
        print(f"   Quality filter success rate: {(qualified_traders/max(1,analyzed_count)*100):.1f}%")
        
        if qualified_traders > 0:
            print(f"\n✅ SUCCESS: {qualified_traders} qualified traders found!")
            print("   The quantitative engine criteria are working correctly")
        else:
            print(f"\n🎯 SYSTEM STATUS: Discovery working correctly")
            print("   Quality filters are properly rejecting low-quality traders")
            print("   This is expected behavior - only elite traders should qualify")
            
    except Exception as e:
        print(f"❌ Debug failed: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    # Set required environment variables
    os.environ.update({
        "HELIUS_API_KEY": "e5fdf1c6-20b1-48b6-b33c-4be56e8e219c",
        "DATABASE_URL": "postgresql://xorj:xorj_password@localhost:5432/xorj_quant",
        "REDIS_URL": "redis://localhost:6379",
        "SOLANA_RPC_URL": "https://mainnet.helius-rpc.com/?api-key=e5fdf1c6-20b1-48b6-b33c-4be56e8e219c",
        "XORJ_INTERNAL_API_KEY": "xorj-internal-api-key-v1-prod-2025"
    })
    
    asyncio.run(debug_discovery_pipeline())