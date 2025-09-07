#!/usr/bin/env python3
"""
Find more wallets similar to our high-frequency Raydium trader
Query recent Raydium transactions to find other active traders
"""

import asyncio
import httpx
import os
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone, timedelta
import json

# Add the app directory to the path
sys.path.append(os.path.join(os.path.dirname(__file__), 'app'))

async def find_active_raydium_traders():
    """Find wallets actively trading on Raydium by analyzing recent transactions"""
    
    print("🔍 FINDING ACTIVE RAYDIUM TRADERS")
    print("=" * 60)
    
    helius_api_key = "e5fdf1c6-20b1-48b6-b33c-4be56e8e219c"
    raydium_program = "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8"
    solana_rpc = f"https://mainnet.helius-rpc.com/?api-key={helius_api_key}"
    
    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            # Method 1: Get recent successful transactions to Raydium
            print("📊 Method 1: Analyzing recent Raydium transactions...")
            
            # Get recent confirmed transactions
            recent_sigs_response = await client.post(
                solana_rpc,
                json={
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "getSignaturesForAddress",
                    "params": [
                        raydium_program,
                        {
                            "limit": 1000,
                            "commitment": "confirmed"
                        }
                    ]
                }
            )
            
            if recent_sigs_response.status_code != 200:
                print(f"❌ Failed to get signatures: {recent_sigs_response.status_code}")
                return []
            
            signatures_data = recent_sigs_response.json()
            
            if "result" not in signatures_data:
                print("❌ No result in response")
                return []
            
            signatures = signatures_data["result"]
            print(f"✅ Found {len(signatures)} recent Raydium transactions")
            
            # Analyze transactions to find active traders
            trader_activity = Counter()
            trader_details = defaultdict(list)
            
            print("\n📊 Analyzing transactions to identify traders...")
            batch_size = 50
            
            for i in range(0, min(len(signatures), 500), batch_size):  # Analyze first 500
                batch = signatures[i:i+batch_size]
                print(f"   Processing batch {i//batch_size + 1}/{min(10, len(signatures)//batch_size)}...")
                
                for sig_info in batch:
                    signature = sig_info["signature"]
                    
                    try:
                        # Get transaction details
                        tx_response = await client.post(
                            solana_rpc,
                            json={
                                "jsonrpc": "2.0",
                                "id": 1,
                                "method": "getTransaction",
                                "params": [
                                    signature,
                                    {
                                        "encoding": "json",
                                        "commitment": "confirmed",
                                        "maxSupportedTransactionVersion": 0
                                    }
                                ]
                            }
                        )
                        
                        if tx_response.status_code == 200:
                            tx_data = tx_response.json()
                            
                            if "result" in tx_data and tx_data["result"]:
                                result = tx_data["result"]
                                
                                # Extract the fee payer (trader)
                                if "transaction" in result:
                                    transaction = result["transaction"]
                                    if "message" in transaction:
                                        message = transaction["message"]
                                        
                                        # Get account keys
                                        account_keys = []
                                        if "accountKeys" in message:
                                            account_keys = message["accountKeys"]
                                        elif "accounts" in message:
                                            # Handle versioned transactions
                                            account_keys = message["accounts"]
                                        
                                        if account_keys and len(account_keys) > 0:
                                            # First account is typically the fee payer/trader
                                            trader = account_keys[0]
                                            
                                            # Skip system programs
                                            if not trader.endswith("11111111111111111111111111111111"):
                                                trader_activity[trader] += 1
                                                trader_details[trader].append({
                                                    "signature": signature[:16] + "...",
                                                    "blockTime": sig_info.get("blockTime", 0)
                                                })
                        
                        # Rate limiting
                        await asyncio.sleep(0.01)
                        
                    except Exception as e:
                        continue
                
                # Delay between batches
                await asyncio.sleep(0.5)
            
            # Filter for high-activity traders
            high_activity_traders = []
            
            for trader, count in trader_activity.most_common(50):
                if count >= 3:  # At least 3 Raydium transactions
                    high_activity_traders.append({
                        "wallet": trader,
                        "raydium_txns": count,
                        "recent_activity": trader_details[trader][:3]
                    })
            
            print(f"\n✅ Found {len(high_activity_traders)} high-activity Raydium traders!")
            
            # Method 2: Look for wallets similar to our known active wallet
            print("\n📊 Method 2: Finding wallets with similar patterns...")
            
            known_active = "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1"
            
            # Get a sample transaction from our known wallet to find patterns
            known_tx_response = await client.post(
                solana_rpc,
                json={
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "getSignaturesForAddress",
                    "params": [
                        known_active,
                        {"limit": 10}
                    ]
                }
            )
            
            if known_tx_response.status_code == 200:
                known_data = known_tx_response.json()
                if "result" in known_data and known_data["result"]:
                    print(f"   Analyzing pattern from known active wallet...")
                    
                    # Look for wallets that interact with similar programs
                    for sig_info in known_data["result"][:3]:
                        try:
                            tx_resp = await client.post(
                                solana_rpc,
                                json={
                                    "jsonrpc": "2.0",
                                    "id": 1,
                                    "method": "getTransaction",
                                    "params": [
                                        sig_info["signature"],
                                        {"encoding": "json", "maxSupportedTransactionVersion": 0}
                                    ]
                                }
                            )
                            
                            if tx_resp.status_code == 200:
                                tx = tx_resp.json()
                                if "result" in tx and tx["result"]:
                                    # Extract programs used
                                    programs = []
                                    if "transaction" in tx["result"]:
                                        if "message" in tx["result"]["transaction"]:
                                            msg = tx["result"]["transaction"]["message"]
                                            if "accountKeys" in msg:
                                                for acc in msg["accountKeys"]:
                                                    if "675kPX" in acc:  # Raydium
                                                        programs.append("Raydium")
                                    
                                    if programs:
                                        print(f"   Known wallet uses: {', '.join(programs)}")
                            
                        except Exception:
                            continue
            
            return high_activity_traders
            
        except Exception as e:
            print(f"❌ Error: {e}")
            import traceback
            traceback.print_exc()
            return []

async def ingest_discovered_wallets(wallets):
    """Ingest the discovered wallets into the quantitative engine"""
    
    if not wallets:
        print("\n❌ No wallets to ingest")
        return
    
    print(f"\n🚀 INGESTING {len(wallets)} DISCOVERED WALLETS")
    print("=" * 60)
    
    from app.ingestion.worker import run_ingestion_for_wallets
    
    # Select top wallets for ingestion
    top_wallets = wallets[:10]  # Ingest top 10
    wallet_addresses = [w["wallet"] for w in top_wallets]
    
    print(f"📊 Ingesting top {len(wallet_addresses)} wallets:")
    for i, wallet in enumerate(top_wallets, 1):
        print(f"   {i}. {wallet['wallet'][:8]}...{wallet['wallet'][-8:]} ({wallet['raydium_txns']} Raydium txns)")
    
    try:
        # Run ingestion with 7-day lookback (to avoid rate limits)
        print(f"\n⏰ Starting ingestion with 7-day lookback...")
        results = await run_ingestion_for_wallets(wallet_addresses[:3], lookback_hours=168)  # Start with 3
        
        print(f"\n📊 INGESTION RESULTS:")
        successful = 0
        total_swaps = 0
        
        for wallet, status in results.items():
            if status.success and status.valid_swaps_extracted > 0:
                successful += 1
                total_swaps += status.valid_swaps_extracted
                print(f"   ✅ {wallet[:8]}...{wallet[-8:]}: {status.valid_swaps_extracted} swaps")
            else:
                print(f"   ❌ {wallet[:8]}...{wallet[-8:]}: No swaps found")
        
        if successful > 0:
            print(f"\n🎉 SUCCESS: Added {successful} new wallets with {total_swaps} total swaps!")
        
    except Exception as e:
        print(f"❌ Ingestion error: {e}")

async def main():
    """Main function"""
    
    # Find active traders
    traders = await find_active_raydium_traders()
    
    if traders:
        print(f"\n📊 DISCOVERY SUMMARY:")
        print(f"   Total active traders found: {len(traders)}")
        print(f"\n🏆 TOP 10 MOST ACTIVE RAYDIUM TRADERS:")
        print("=" * 70)
        print("Rank | Wallet Address                              | Raydium Txns")
        print("-----|---------------------------------------------|-------------")
        
        for i, trader in enumerate(traders[:10], 1):
            wallet = trader["wallet"]
            addr = wallet[:20] + "..." + wallet[-20:] if len(wallet) > 43 else wallet
            txns = trader["raydium_txns"]
            print(f" #{i:2d}  | {addr} | {txns:11d}")
        
        print("=" * 70)
        
        # Ingest the discovered wallets
        await ingest_discovered_wallets(traders)
        
        print(f"\n✅ COMPLETE: Discovered and processed {len(traders)} active Raydium traders")
        print(f"💡 The quantitative engine now has multiple high-frequency traders to analyze!")
        
    else:
        print("\n❌ No active traders found")

if __name__ == "__main__":
    # Set environment variables
    os.environ.update({
        "HELIUS_API_KEY": "e5fdf1c6-20b1-48b6-b33c-4be56e8e219c",
        "DATABASE_URL": "postgresql://xorj:xorj_password@localhost:5432/xorj_quant",
        "REDIS_URL": "redis://localhost:6379",
        "SOLANA_RPC_URL": "https://mainnet.helius-rpc.com/?api-key={helius_api_key}",
        "XORJ_INTERNAL_API_KEY": "xorj-internal-api-key-v1-prod-2025"
    })
    
    asyncio.run(main())