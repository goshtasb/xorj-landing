#!/usr/bin/env python3
"""
Quantitative Wallet Discovery
Discover wallets that meet the quantitative engine's strict quality requirements:
- Minimum 20 trades
- Minimum $50,000 trading volume
- Minimum 35% win rate  
- Minimum 5% absolute ROI (positive or negative)
"""

import asyncio
import os
import sys
from datetime import datetime, timezone, timedelta

# Add the app directory to the path
sys.path.append(os.path.join(os.path.dirname(__file__), 'app'))

from app.blockchain.trader_discovery import get_trader_discovery

async def discover_quantitative_traders():
    """Discover traders that meet quantitative engine quality criteria"""
    
    print("🎯 QUANTITATIVE TRADER DISCOVERY")
    print("=" * 50)
    print("📊 Quality Requirements:")
    print("   • Minimum 20 trades")
    print("   • Minimum $50,000 trading volume")
    print("   • Minimum 35% win rate")
    print("   • Minimum 5% absolute ROI")
    print("   • Recent activity on mainnet DEXs")
    print()
    
    try:
        # Get the trader discovery service
        discovery_service = await get_trader_discovery()
        
        # Discover traders using quantitative criteria
        print("🔍 Scanning mainnet for qualified traders...")
        discovered_traders = await discovery_service.discover_top_traders(limit=25)
        
        if discovered_traders:
            print(f"✅ DISCOVERY RESULTS: {len(discovered_traders)} qualified traders found")
            print("=" * 80)
            print()
            print("Rank | Wallet Address                              | Trust | Volume ($) | Trades | Win% | ROI%")
            print("-----|---------------------------------------------|-------|-----------|--------|------|------")
            
            qualified_count = 0
            for trader in discovered_traders:
                addr = trader["wallet_address"][:20] + "..." + trader["wallet_address"][-20:]
                trust = trader["trust_score"]
                volume = trader["metrics"]["total_volume_usd"]
                trades = trader["metrics"]["total_trades"]
                
                # Calculate win rate from win_loss_ratio
                win_loss_ratio = trader["metrics"]["win_loss_ratio"]
                if win_loss_ratio == 10.0:  # Special case for 100% win rate
                    win_rate = 100.0
                else:
                    win_rate = (win_loss_ratio / (1 + win_loss_ratio)) * 100
                
                roi = trader["metrics"]["net_roi_percent"]
                
                print(f" #{trader['rank']:2d}  | {addr} | {trust:5.1f} | ${volume:8,.0f} | {trades:6,} | {win_rate:4.1f} | {roi:5.1f}")
                qualified_count += 1
            
            print("=" * 80)
            print(f"🎉 QUALIFIED TRADERS: {qualified_count}")
            print()
            print("📈 Performance Summary:")
            if qualified_count > 0:
                avg_trust = sum(t["trust_score"] for t in discovered_traders) / qualified_count
                total_volume = sum(t["metrics"]["total_volume_usd"] for t in discovered_traders)
                total_trades = sum(t["metrics"]["total_trades"] for t in discovered_traders)
                avg_roi = sum(t["metrics"]["net_roi_percent"] for t in discovered_traders) / qualified_count
                
                print(f"   Average Trust Score: {avg_trust:.2f}")
                print(f"   Total Trading Volume: ${total_volume:,.0f}")
                print(f"   Total Trades: {total_trades:,}")
                print(f"   Average ROI: {avg_roi:.2f}%")
            
            print()
            print("🚀 Next Steps:")
            print(f"   1. These {qualified_count} wallets can be ingested for full analysis")
            print(f"   2. The quantitative engine will track their ongoing performance")
            print(f"   3. Users can copy-trade based on their trust scores")
            
            return discovered_traders
            
        else:
            print("⚠️  NO QUALIFIED TRADERS FOUND")
            print()
            print("🔧 Possible reasons:")
            print("   • Current mainnet activity is low")
            print("   • API rate limits preventing full analysis")
            print("   • Quality thresholds are very strict")
            print("   • Most active traders don't meet all criteria")
            print()
            print("💡 Solutions:")
            print("   • Try again during high-activity periods")
            print("   • Lower quality thresholds temporarily for testing")
            print("   • Use different DEX programs for discovery")
            
            return []
            
    except Exception as e:
        print(f"❌ Discovery failed: {e}")
        import traceback
        traceback.print_exc()
        return []

async def main():
    """Main function to run quantitative discovery"""
    qualified_traders = await discover_quantitative_traders()
    
    if qualified_traders:
        print(f"\n✨ SUCCESS: Found {len(qualified_traders)} traders meeting quantitative criteria!")
        print("🎯 The system is ready to ingest these high-quality traders")
    else:
        print(f"\n⚠️  No qualified traders found with current criteria")
        print("🔧 The discovery system is working but mainnet activity may be insufficient")

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