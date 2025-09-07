#!/usr/bin/env python3
"""
Real Elite Trader Discovery
Find actual elite traders from recent mainnet block activity
Uses recent blocks and transaction analysis to identify high-volume traders
"""

import asyncio
import httpx
import os
import sys
from typing import Dict, List, Set
from collections import defaultdict, Counter
from datetime import datetime, timezone, timedelta

# Add the app directory to the path
sys.path.append(os.path.join(os.path.dirname(__file__), 'app'))

async def find_elite_traders_from_recent_blocks():
    """Find elite traders by analyzing recent block activity"""
    
    print("🔍 REAL ELITE TRADER DISCOVERY")
    print("=" * 50)
    print("📊 Analyzing recent mainnet blocks for high-volume traders...")
    
    helius_api_key = "e5fdf1c6-20b1-48b6-b33c-4be56e8e219c"
    solana_rpc_url = f"https://mainnet.helius-rpc.com/?api-key={helius_api_key}"
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            # Step 1: Get recent slot numbers
            print("Step 1: Getting recent block data...")
            slot_response = await client.post(
                solana_rpc_url,
                json={
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "getSlot",
                    "params": [{"commitment": "confirmed"}]
                }
            )
            
            if slot_response.status_code != 200:
                print(f"❌ Failed to get current slot: {slot_response.status_code}")
                return []
            
            current_slot = slot_response.json()["result"]
            print(f"   Current slot: {current_slot}")
            
            # Step 2: Analyze recent blocks for high-activity wallets
            print("\nStep 2: Analyzing recent blocks for transaction volume...")
            
            wallet_activity = defaultdict(int)
            wallet_programs = defaultdict(set)
            analyzed_blocks = 0
            
            # Check last 20 blocks for active traders
            for i in range(20):
                target_slot = current_slot - i
                
                try:
                    # Get block data
                    block_response = await client.post(
                        solana_rpc_url,
                        json={
                            "jsonrpc": "2.0",
                            "id": 1,
                            "method": "getBlock",
                            "params": [
                                target_slot,
                                {
                                    "encoding": "json",
                                    "transactionDetails": "accounts",
                                    "rewards": False
                                }
                            ]
                        }
                    )
                    
                    if block_response.status_code == 200:
                        block_data = block_response.json()
                        if "result" in block_data and block_data["result"]:
                            transactions = block_data["result"].get("transactions", [])
                            
                            # Count activity per wallet
                            for tx in transactions:
                                if "transaction" in tx and "message" in tx["transaction"]:
                                    message = tx["transaction"]["message"]
                                    if "accountKeys" in message:
                                        # First account is usually the fee payer (trader)
                                        if message["accountKeys"]:
                                            trader = message["accountKeys"][0]
                                            wallet_activity[trader] += 1
                                            
                                            # Track which programs they interact with
                                            for account in message["accountKeys"]:
                                                # Known DEX program IDs
                                                if account in [
                                                    "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8",  # Raydium
                                                    "JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB",   # Jupiter
                                                    "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc",   # Whirlpool
                                                ]:
                                                    wallet_programs[trader].add(account)
                            
                            analyzed_blocks += 1
                    
                except Exception as e:
                    print(f"   Warning: Could not analyze block {target_slot}: {e}")
                    continue
            
            print(f"   Analyzed {analyzed_blocks} recent blocks")
            print(f"   Found {len(wallet_activity)} active wallets")
            
            # Step 3: Filter for high-activity traders
            print("\nStep 3: Identifying high-activity traders...")
            
            # Filter for wallets with significant activity and DEX interactions
            elite_candidates = []
            
            for wallet, activity_count in wallet_activity.items():
                # Skip system accounts
                if wallet.endswith("1111111111111112") or len(wallet) != 44:
                    continue
                
                # Look for wallets with multiple transactions AND DEX interactions
                if activity_count >= 2 and wallet in wallet_programs:
                    dex_programs = wallet_programs[wallet]
                    elite_candidates.append({
                        "wallet_address": wallet,
                        "recent_activity": activity_count,
                        "dex_programs": list(dex_programs),
                        "dex_count": len(dex_programs)
                    })
            
            # Sort by activity level
            elite_candidates.sort(key=lambda x: (x["recent_activity"], x["dex_count"]), reverse=True)
            
            print(f"   Found {len(elite_candidates)} high-activity trader candidates")
            
            # Step 4: Display top candidates
            print("\nStep 4: Top Elite Trader Candidates:")
            print("=" * 80)
            print("Rank | Wallet Address                              | Activity | DEX Programs")
            print("-----|---------------------------------------------|----------|-------------")
            
            for i, candidate in enumerate(elite_candidates[:15], 1):
                addr = candidate["wallet_address"][:20] + "..." + candidate["wallet_address"][-20:]
                activity = candidate["recent_activity"]
                dex_count = candidate["dex_count"]
                
                print(f" #{i:2d}  | {addr} |    {activity:2d}    |     {dex_count}")
            
            if elite_candidates:
                print("=" * 80)
                print(f"✅ DISCOVERY SUCCESS: Found {len(elite_candidates)} elite trader candidates!")
                print(f"🎯 These wallets show high recent activity and DEX interactions")
                print(f"📊 Ready for quantitative analysis and ingestion")
                
                # Return top candidates for further analysis
                return elite_candidates[:10]
            else:
                print("⚠️  No elite traders found in recent blocks")
                print("💡 Try analyzing more blocks or different time periods")
                return []
                
        except Exception as e:
            print(f"❌ Discovery failed: {e}")
            import traceback
            traceback.print_exc()
            return []

async def analyze_candidate_performance(candidate_wallet: str):
    """Quick performance analysis of a candidate trader"""
    
    print(f"\n🔍 Quick Analysis: {candidate_wallet[:8]}...{candidate_wallet[-8:]}")
    
    helius_api_key = "e5fdf1c6-20b1-48b6-b33c-4be56e8e219c"
    helius_url = f"https://api.helius.xyz/v0/addresses/{candidate_wallet}/transactions"
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                helius_url,
                params={
                    "api-key": helius_api_key,
                    "limit": 100
                }
            )
            
            if response.status_code == 200:
                transactions = response.json()
                
                print(f"   Recent transactions: {len(transactions)}")
                
                # Analyze transaction types
                tx_types = Counter()
                for tx in transactions:
                    if "type" in tx:
                        tx_types[tx["type"]] += 1
                
                print(f"   Transaction types: {dict(tx_types.most_common(3))}")
                
                # Look for swap/trade patterns
                swap_count = tx_types.get("SWAP", 0) + tx_types.get("UNKNOWN", 0)
                if swap_count >= 5:
                    print(f"   ✅ Active trader: {swap_count} potential swaps found")
                    return True
                else:
                    print(f"   ❌ Low activity: Only {swap_count} swaps")
                    return False
            else:
                print(f"   ❌ API error: {response.status_code}")
                return False
                
    except Exception as e:
        print(f"   ❌ Analysis failed: {e}")
        return False

async def main():
    """Main discovery function"""
    
    candidates = await find_elite_traders_from_recent_blocks()
    
    if candidates:
        print(f"\n🎯 ANALYZING TOP CANDIDATES:")
        print("=" * 40)
        
        validated_traders = []
        
        # Analyze top 3 candidates to avoid rate limits
        for candidate in candidates[:3]:
            wallet = candidate["wallet_address"]
            is_active = await analyze_candidate_performance(wallet)
            
            if is_active:
                validated_traders.append(wallet)
        
        print(f"\n✅ FINAL RESULTS:")
        print(f"   Elite trader candidates found: {len(candidates)}")
        print(f"   Validated active traders: {len(validated_traders)}")
        
        if validated_traders:
            print(f"\n🎉 SUCCESS! Found {len(validated_traders)} elite traders ready for ingestion:")
            for i, trader in enumerate(validated_traders, 1):
                print(f"   {i}. {trader}")
            
            print(f"\n💡 Next steps:")
            print(f"   1. Ingest these traders with full 90-day analysis")
            print(f"   2. Calculate their quantitative metrics")
            print(f"   3. Add them to the trading engine")
        else:
            print(f"\n⚠️  No traders validated with sufficient activity")
    else:
        print(f"\n❌ No elite trader candidates found")

if __name__ == "__main__":
    asyncio.run(main())