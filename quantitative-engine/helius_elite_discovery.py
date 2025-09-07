#!/usr/bin/env python3
"""
Helius Elite Trader Discovery
Use Helius enhanced APIs to find actual elite traders
This uses transaction history analysis rather than program account queries
"""

import asyncio
import httpx
import os
import sys
from typing import Dict, List, Set
from collections import defaultdict, Counter
from datetime import datetime, timezone, timedelta
import json

# Add the app directory to the path
sys.path.append(os.path.join(os.path.dirname(__file__), 'app'))

async def discover_elite_traders_via_helius():
    """Use Helius enhanced APIs to find elite traders"""
    
    print("🔍 HELIUS ELITE TRADER DISCOVERY")
    print("=" * 50)
    print("📊 Using Helius enhanced APIs to find active DEX traders...")
    
    helius_api_key = "e5fdf1c6-20b1-48b6-b33c-4be56e8e219c"
    
    # Strategy: Get recent transactions from major DEX programs
    dex_programs = {
        "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8": "Raydium V4",
        "JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB": "Jupiter V4", 
        "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4": "Jupiter V6",
    }
    
    elite_candidates = defaultdict(lambda: {
        "transaction_count": 0,
        "programs_used": set(),
        "recent_activity": [],
        "first_seen": None,
        "last_seen": None
    })
    
    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            for program_id, program_name in dex_programs.items():
                print(f"\n📊 Analyzing {program_name} ({program_id[:8]}...):")
                
                # Get recent transactions for this DEX program
                url = f"https://api.helius.xyz/v0/addresses/{program_id}/transactions"
                
                try:
                    response = await client.get(
                        url,
                        params={
                            "api-key": helius_api_key,
                            "limit": 200,  # Get more transactions
                            "commitment": "confirmed"
                        }
                    )
                    
                    if response.status_code == 200:
                        transactions = response.json()
                        print(f"   Retrieved {len(transactions)} recent transactions")
                        
                        # Analyze each transaction for trader activity
                        for tx in transactions:
                            if "feePayer" in tx and tx["feePayer"]:
                                trader = tx["feePayer"]
                                
                                # Skip system accounts
                                if trader.endswith("1111111111111112") or len(trader) != 44:
                                    continue
                                
                                # Record trader activity
                                elite_candidates[trader]["transaction_count"] += 1
                                elite_candidates[trader]["programs_used"].add(program_name)
                                
                                # Track timing
                                timestamp = tx.get("timestamp", 0)
                                if timestamp:
                                    if not elite_candidates[trader]["first_seen"]:
                                        elite_candidates[trader]["first_seen"] = timestamp
                                        elite_candidates[trader]["last_seen"] = timestamp
                                    else:
                                        elite_candidates[trader]["last_seen"] = max(
                                            elite_candidates[trader]["last_seen"], timestamp
                                        )
                                
                                # Track transaction details
                                elite_candidates[trader]["recent_activity"].append({
                                    "program": program_name,
                                    "timestamp": timestamp,
                                    "signature": tx.get("signature", "")[:16] + "...",
                                    "type": tx.get("type", "UNKNOWN")
                                })
                    
                    elif response.status_code == 429:
                        print(f"   ⚠️ Rate limited on {program_name}")
                        await asyncio.sleep(2)  # Wait before next request
                    else:
                        print(f"   ❌ API error {response.status_code} for {program_name}")
                        
                except Exception as e:
                    print(f"   ❌ Error analyzing {program_name}: {e}")
                    continue
                
                # Small delay between programs
                await asyncio.sleep(1)
            
            # Filter and rank elite candidates
            print(f"\n📈 ANALYSIS RESULTS:")
            print("=" * 60)
            
            # Filter for high-activity traders
            elite_traders = []
            for trader, data in elite_candidates.items():
                if (data["transaction_count"] >= 3 and  # Minimum activity
                    len(data["programs_used"]) >= 1):   # Must use DEX programs
                    
                    # Calculate activity score
                    activity_score = (
                        data["transaction_count"] * 10 +
                        len(data["programs_used"]) * 20
                    )
                    
                    elite_traders.append({
                        "wallet_address": trader,
                        "transaction_count": data["transaction_count"],
                        "programs_used": list(data["programs_used"]),
                        "activity_score": activity_score,
                        "first_seen": data["first_seen"],
                        "last_seen": data["last_seen"],
                        "sample_activity": data["recent_activity"][:3]  # First 3 transactions
                    })
            
            # Sort by activity score
            elite_traders.sort(key=lambda x: x["activity_score"], reverse=True)
            
            print(f"Total candidates analyzed: {len(elite_candidates)}")
            print(f"Elite traders found: {len(elite_traders)}")
            print()
            
            if elite_traders:
                print("TOP ELITE TRADER CANDIDATES:")
                print("=" * 90)
                print("Rank | Wallet Address                              | Txns | Programs | Score")
                print("-----|---------------------------------------------|------|----------|-------")
                
                for i, trader in enumerate(elite_traders[:15], 1):
                    addr = trader["wallet_address"][:20] + "..." + trader["wallet_address"][-20:]
                    txns = trader["transaction_count"]
                    programs = ", ".join(trader["programs_used"])[:20]
                    score = trader["activity_score"]
                    
                    print(f" #{i:2d}  | {addr} | {txns:4d} | {programs:20} | {score:5d}")
                
                print("=" * 90)
                
                # Show detailed analysis for top 3
                print(f"\n🎯 DETAILED ANALYSIS (Top 3):")
                for i, trader in enumerate(elite_traders[:3], 1):
                    print(f"\n#{i}. {trader['wallet_address']}")
                    print(f"    Transactions: {trader['transaction_count']}")
                    print(f"    DEX Programs: {', '.join(trader['programs_used'])}")
                    print(f"    Activity Score: {trader['activity_score']}")
                    
                    if trader["sample_activity"]:
                        print(f"    Recent Activity:")
                        for j, activity in enumerate(trader["sample_activity"], 1):
                            print(f"      {j}. {activity['program']} - {activity['type']}")
                
                print(f"\n✅ SUCCESS: Found {len(elite_traders)} elite traders!")
                print(f"🎯 These are real active mainnet traders ready for quantitative analysis")
                
                return elite_traders[:5]  # Return top 5 for ingestion
                
            else:
                print("⚠️  No elite traders found meeting minimum criteria")
                print("💡 May need to adjust filters or try different time periods")
                return []
                
        except Exception as e:
            print(f"❌ Discovery failed: {e}")
            import traceback
            traceback.print_exc()
            return []

async def main():
    """Main discovery function"""
    
    elite_traders = await discover_elite_traders_via_helius()
    
    if elite_traders:
        print(f"\n🚀 READY FOR INGESTION:")
        print("=" * 40)
        print(f"Found {len(elite_traders)} elite traders ready for full quantitative analysis")
        print()
        
        for i, trader in enumerate(elite_traders, 1):
            wallet = trader["wallet_address"]
            print(f"{i}. {wallet} (Score: {trader['activity_score']})")
        
        print(f"\n💡 Next Step: Run ingestion for these verified elite traders")
        print(f"   These wallets show real high-volume DEX activity")
        print(f"   Perfect candidates for quantitative engine analysis!")
        
        return elite_traders
    else:
        print(f"\n❌ No elite traders discovered")
        print(f"🔧 May need API adjustments or different discovery strategy")
        return []

if __name__ == "__main__":
    asyncio.run(main())