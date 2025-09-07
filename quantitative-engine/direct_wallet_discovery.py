#!/usr/bin/env python3
"""
Direct V1 Wallet Discovery Script
Directly query Helius API to find promising wallets from mainnet DEX activity
Bypasses all complex architecture for simple V1 wallet identification
"""

import asyncio
import aiohttp
import json
import ssl
from datetime import datetime, timezone, timedelta
from collections import defaultdict
import os

HELIUS_API_KEY = "e5fdf1c6-20b1-48b6-b33c-4be56e8e219c"
HELIUS_BASE_URL = "https://api.helius.xyz/v0"

# DEX program IDs to monitor
DEX_PROGRAMS = [
    "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8",  # Raydium AMM V4
    "5quBtoiQqxF9Jv6KYKctB59NT3gtJD2Y65kdnB1Uev3h",  # Raydium AMM V5
    "JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB",   # Jupiter V4
    "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",   # Jupiter V6
]

async def get_recent_dex_signatures(session: aiohttp.ClientSession, limit: int = 1000) -> list:
    """Get recent signatures from DEX programs"""
    all_signatures = []
    
    for program_id in DEX_PROGRAMS:
        try:
            url = f"{HELIUS_BASE_URL}/addresses/{program_id}/transactions"
            params = {
                'api-key': HELIUS_API_KEY,
                'limit': limit
            }
            
            async with session.get(url, params=params) as response:
                if response.status == 200:
                    data = await response.json()
                    signatures = [tx['signature'] for tx in data if 'signature' in tx]
                    all_signatures.extend(signatures)
                    print(f"✅ Found {len(signatures)} signatures from {program_id}")
                else:
                    print(f"❌ Error querying {program_id}: {response.status}")
                    
        except Exception as e:
            print(f"❌ Error with program {program_id}: {e}")
            continue
            
    print(f"📊 Total signatures collected: {len(all_signatures)}")
    return list(set(all_signatures))  # Remove duplicates

async def get_transaction_details(session: aiohttp.ClientSession, signatures: list) -> list:
    """Get detailed transaction data from Helius"""
    transactions = []
    batch_size = 100  # Helius batch limit
    
    for i in range(0, len(signatures), batch_size):
        batch = signatures[i:i + batch_size]
        
        try:
            url = f"{HELIUS_BASE_URL}/transactions"
            params = {
                'api-key': HELIUS_API_KEY
            }
            
            payload = {
                'transactions': batch
            }
            
            async with session.post(url, params=params, json=payload) as response:
                if response.status == 200:
                    batch_data = await response.json()
                    transactions.extend([tx for tx in batch_data if tx])
                    print(f"✅ Processed batch {i//batch_size + 1}/{(len(signatures)-1)//batch_size + 1}")
                else:
                    print(f"❌ Batch error: {response.status}")
                    
        except Exception as e:
            print(f"❌ Batch processing error: {e}")
            continue
    
    return transactions

def analyze_wallet_activity(transactions: list) -> dict:
    """Analyze wallet activity from transaction data"""
    wallet_stats = defaultdict(lambda: {
        'total_swaps': 0,
        'volume_sol': 0.0,
        'first_seen': None,
        'last_seen': None,
        'tokens_traded': set(),
        'programs_used': set()
    })
    
    for tx in transactions:
        if not tx or 'accountKeys' not in tx:
            continue
            
        # Extract wallet addresses (first few accounts are usually signers/fee payers)
        accounts = tx.get('accountKeys', [])
        if not accounts:
            continue
            
        wallet = accounts[0]  # Primary signer
        timestamp = tx.get('blockTime', 0)
        
        if timestamp:
            tx_time = datetime.fromtimestamp(timestamp, timezone.utc)
            
            # Update wallet stats
            stats = wallet_stats[wallet]
            stats['total_swaps'] += 1
            stats['programs_used'].update(tx.get('instructions', []))
            
            if stats['first_seen'] is None or tx_time < stats['first_seen']:
                stats['first_seen'] = tx_time
            if stats['last_seen'] is None or tx_time > stats['last_seen']:
                stats['last_seen'] = tx_time
                
            # Try to extract token information and volume
            # This is simplified - real implementation would parse instruction data
            if 'meta' in tx and 'preBalances' in tx['meta'] and 'postBalances' in tx['meta']:
                pre = tx['meta']['preBalances']
                post = tx['meta']['postBalances']
                
                # Calculate SOL balance changes (simplified volume estimation)
                if len(pre) > 0 and len(post) > 0:
                    balance_change = abs(pre[0] - post[0]) / 1e9  # Convert lamports to SOL
                    stats['volume_sol'] += balance_change
    
    return wallet_stats

async def discover_promising_wallets():
    """Main discovery function"""
    print("🔍 Starting direct V1 wallet discovery from Helius API...")
    print("📊 Querying recent DEX transactions from mainnet...")
    
    # Create SSL context that doesn't verify certificates
    ssl_context = ssl.create_default_context()
    ssl_context.check_hostname = False
    ssl_context.verify_mode = ssl.CERT_NONE
    
    connector = aiohttp.TCPConnector(ssl=ssl_context)
    async with aiohttp.ClientSession(connector=connector) as session:
        # Step 1: Get recent DEX signatures
        print("\n🎯 Step 1: Collecting recent DEX signatures...")
        signatures = await get_recent_dex_signatures(session, limit=500)
        
        if not signatures:
            print("❌ No signatures found. Check API connectivity.")
            return []
        
        # Take a sample for analysis
        sample_signatures = signatures[:200]  # Analyze first 200 for speed
        print(f"📝 Analyzing sample of {len(sample_signatures)} transactions...")
        
        # Step 2: Get detailed transaction data
        print("\n🎯 Step 2: Fetching transaction details...")
        transactions = await get_transaction_details(session, sample_signatures)
        
        if not transactions:
            print("❌ No transaction details retrieved.")
            return []
        
        print(f"✅ Retrieved {len(transactions)} transaction details")
        
        # Step 3: Analyze wallet activity
        print("\n🎯 Step 3: Analyzing wallet activity patterns...")
        wallet_stats = analyze_wallet_activity(transactions)
        
        # Filter and rank promising wallets
        promising_wallets = []
        min_swaps = 5  # Lower threshold for V1 discovery
        
        for wallet, stats in wallet_stats.items():
            if stats['total_swaps'] >= min_swaps and stats['volume_sol'] > 0.1:
                # Calculate simple activity score
                days_active = 1
                if stats['first_seen'] and stats['last_seen']:
                    days_active = max(1, (stats['last_seen'] - stats['first_seen']).days)
                
                activity_score = (stats['total_swaps'] * stats['volume_sol']) / days_active
                
                promising_wallets.append({
                    'wallet_address': wallet,
                    'total_swaps': stats['total_swaps'],
                    'volume_sol': round(stats['volume_sol'], 3),
                    'days_active': days_active,
                    'activity_score': round(activity_score, 3),
                    'first_seen': stats['first_seen'].isoformat() if stats['first_seen'] else None,
                    'last_seen': stats['last_seen'].isoformat() if stats['last_seen'] else None
                })
        
        # Sort by activity score
        promising_wallets.sort(key=lambda x: x['activity_score'], reverse=True)
        
        return promising_wallets[:20]  # Return top 20

async def main():
    """Main execution function"""
    try:
        wallets = await discover_promising_wallets()
        
        if wallets:
            print(f"\n✅ Found {len(wallets)} promising wallet candidates for V1:")
            print("=" * 100)
            
            for i, wallet in enumerate(wallets, 1):
                print(f"{i:2d}. {wallet['wallet_address']}")
                print(f"    Swaps: {wallet['total_swaps']}")
                print(f"    Volume: {wallet['volume_sol']} SOL")
                print(f"    Days Active: {wallet['days_active']}")
                print(f"    Activity Score: {wallet['activity_score']}")
                print(f"    Period: {wallet['first_seen']} → {wallet['last_seen']}")
                print()
            
            print("\n🎯 V1 Recommended Wallets for 90-Day Data Ingestion:")
            print("=" * 80)
            for i, wallet in enumerate(wallets[:10], 1):
                print(f"{i}. {wallet['wallet_address']}")
            
            print(f"\n✨ Ready for V1: {len(wallets[:10])} wallets identified for manual curation")
            
        else:
            print("\n⚠️  No promising wallets identified from current sample.")
            print("💡 Try increasing the sample size or checking different time periods.")
            
    except Exception as e:
        print(f"❌ Discovery failed: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())