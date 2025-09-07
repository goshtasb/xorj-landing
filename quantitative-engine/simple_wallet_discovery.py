#!/usr/bin/env python3
"""
Simple V1 Wallet Discovery Script
Extract wallet addresses directly from recent Raydium transactions
"""

import json
import requests
from collections import Counter
import time

HELIUS_API_KEY = "e5fdf1c6-20b1-48b6-b33c-4be56e8e219c"
RAYDIUM_PROGRAM_ID = "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8"

def get_promising_wallets():
    """Get promising wallets from recent Raydium transactions"""
    print("🔍 Starting V1 wallet discovery from recent Raydium transactions...")
    
    # Get recent transactions from Raydium
    url = f"https://api.helius.xyz/v0/addresses/{RAYDIUM_PROGRAM_ID}/transactions"
    params = {
        'api-key': HELIUS_API_KEY,
        'limit': 500  # Get more transactions
    }
    
    try:
        print("📊 Fetching recent Raydium transactions...")
        response = requests.get(url, params=params, timeout=30)
        
        if response.status_code != 200:
            print(f"❌ API error: {response.status_code}")
            return []
            
        transactions = response.json()
        print(f"✅ Retrieved {len(transactions)} transactions")
        
        # Extract wallet addresses from fee payers
        wallet_activity = Counter()
        wallet_details = {}
        
        for tx in transactions:
            if not tx or 'feePayer' not in tx:
                continue
                
            fee_payer = tx['feePayer']
            
            # Skip known system accounts
            if fee_payer in ['11111111111111111111111111111111']:
                continue
                
            wallet_activity[fee_payer] += 1
            
            # Store additional details
            if fee_payer not in wallet_details:
                wallet_details[fee_payer] = {
                    'first_seen': tx.get('timestamp', 0),
                    'last_seen': tx.get('timestamp', 0),
                    'transactions': []
                }
            
            wallet_details[fee_payer]['transactions'].append({
                'signature': tx.get('signature', ''),
                'timestamp': tx.get('timestamp', 0),
                'type': tx.get('type', ''),
                'description': tx.get('description', '')[:100] + '...' if len(tx.get('description', '')) > 100 else tx.get('description', '')
            })
            
            # Update time range
            timestamp = tx.get('timestamp', 0)
            if timestamp > wallet_details[fee_payer]['last_seen']:
                wallet_details[fee_payer]['last_seen'] = timestamp
            if timestamp < wallet_details[fee_payer]['first_seen']:
                wallet_details[fee_payer]['first_seen'] = timestamp
        
        # Filter for active wallets (minimum activity)
        min_transactions = 3
        promising_wallets = []
        
        for wallet, count in wallet_activity.most_common():
            if count >= min_transactions:
                details = wallet_details[wallet]
                
                # Calculate activity period
                time_range_days = 1
                if details['first_seen'] and details['last_seen']:
                    time_range_seconds = details['last_seen'] - details['first_seen']
                    time_range_days = max(1, time_range_seconds / (24 * 3600))
                
                # Calculate activity score
                activity_score = count / time_range_days
                
                promising_wallets.append({
                    'wallet_address': wallet,
                    'transaction_count': count,
                    'activity_score': round(activity_score, 3),
                    'time_range_days': round(time_range_days, 1),
                    'first_seen': time.strftime('%Y-%m-%d %H:%M:%S', time.gmtime(details['first_seen'])) if details['first_seen'] else 'Unknown',
                    'last_seen': time.strftime('%Y-%m-%d %H:%M:%S', time.gmtime(details['last_seen'])) if details['last_seen'] else 'Unknown',
                    'sample_transactions': details['transactions'][:3]  # Show first 3 transactions
                })
        
        # Sort by activity score
        promising_wallets.sort(key=lambda x: x['activity_score'], reverse=True)
        
        return promising_wallets[:20]  # Return top 20
        
    except Exception as e:
        print(f"❌ Error: {e}")
        return []

def main():
    """Main function"""
    wallets = get_promising_wallets()
    
    if wallets:
        print(f"\n✅ Found {len(wallets)} promising wallet candidates for V1:")
        print("=" * 100)
        
        for i, wallet in enumerate(wallets, 1):
            print(f"{i:2d}. {wallet['wallet_address']}")
            print(f"    Transactions: {wallet['transaction_count']}")
            print(f"    Activity Score: {wallet['activity_score']} (tx/day)")
            print(f"    Active Period: {wallet['time_range_days']} days")
            print(f"    Time Range: {wallet['first_seen']} → {wallet['last_seen']}")
            
            # Show sample transactions
            if wallet['sample_transactions']:
                print(f"    Sample Activity:")
                for j, tx in enumerate(wallet['sample_transactions'][:2], 1):
                    tx_time = time.strftime('%m-%d %H:%M', time.gmtime(tx['timestamp'])) if tx['timestamp'] else 'Unknown'
                    print(f"      {j}. {tx_time} - {tx['type']} - {tx['description']}")
            print()
        
        print("\n🎯 V1 Recommended Wallets for 90-Day Data Ingestion:")
        print("=" * 80)
        for i, wallet in enumerate(wallets[:10], 1):
            print(f"{i}. {wallet['wallet_address']}")
        
        print(f"\n✨ Ready for V1: {len(wallets[:10])} wallets identified for manual curation")
        
        # Save to file for reference
        with open('v1_wallet_candidates.json', 'w') as f:
            json.dump(wallets, f, indent=2)
        print("📁 Results saved to v1_wallet_candidates.json")
        
    else:
        print("\n⚠️  No promising wallets identified from current sample.")

if __name__ == "__main__":
    main()