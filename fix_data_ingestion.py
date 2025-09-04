#!/usr/bin/env python3
"""
Direct Data Ingestion Fix Script
Fetches real Solana transactions and properly saves to database
"""

import uuid
import json
import psycopg2
import requests
from datetime import datetime, timezone
from typing import List, Dict, Any

def fetch_transactions_from_helius(wallet_address: str, api_key: str, limit: int = 100) -> List[Dict]:
    """Fetch transactions from Helius API"""
    url = f"https://api.helius.xyz/v0/addresses/{wallet_address}/transactions"
    
    headers = {
        "Content-Type": "application/json"
    }
    
    params = {
        "api-key": api_key,
        "limit": limit
    }
    
    print(f"Fetching {limit} transactions for {wallet_address[:10]}...")
    
    try:
        response = requests.get(url, headers=headers, params=params, timeout=30)
        response.raise_for_status()
        
        transactions = response.json()
        print(f"✅ Successfully fetched {len(transactions)} transactions")
        return transactions
        
    except Exception as e:
        print(f"❌ Failed to fetch transactions: {e}")
        return []

def save_transactions_to_database(transactions: List[Dict], wallet_address: str, job_id: str):
    """Save transactions directly to raw_transactions table"""
    
    if not transactions:
        print("No transactions to save")
        return 0
    
    connection_string = "postgresql://xorj:@localhost:5432/xorj_quant"
    
    try:
        with psycopg2.connect(connection_string) as conn:
            with conn.cursor() as cur:
                
                insert_query = """
                INSERT INTO raw_transactions (
                    id, job_id, wallet_address, signature, block_time, raw_transaction_data, created_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (signature) DO NOTHING
                """
                
                inserted_count = 0
                
                for tx in transactions:
                    try:
                        # Extract required fields
                        signature = tx.get('signature', '')
                        block_time_unix = tx.get('timestamp', 0)
                        
                        if not signature:
                            continue
                            
                        # Keep as unix timestamp for BIGINT database field
                        block_time = block_time_unix
                        
                        # Prepare data
                        record_data = (
                            str(uuid.uuid4()),  # id
                            job_id,             # job_id
                            wallet_address,     # wallet_address
                            signature,          # signature
                            block_time,         # block_time
                            json.dumps(tx),     # raw_transaction_data
                            datetime.now(timezone.utc)  # created_at
                        )
                        
                        # Insert record
                        cur.execute(insert_query, record_data)
                        inserted_count += 1
                        
                    except Exception as e:
                        print(f"⚠️ Failed to insert transaction {signature[:10]}...: {e}")
                        continue
                
                # Commit all changes
                conn.commit()
                
                print(f"✅ Successfully saved {inserted_count} transactions to database")
                return inserted_count
                
    except Exception as e:
        print(f"❌ Database error: {e}")
        return 0

def main():
    """Main execution function"""
    
    # Configuration
    wallet_address = "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1"
    api_key = "e5fdf1c6-20b1-48b6-b33c-4be56e8e219c"
    job_id = str(uuid.uuid4())
    
    print(f"🚀 Starting direct data ingestion fix")
    print(f"📋 Job ID: {job_id}")
    print(f"💼 Wallet: {wallet_address}")
    
    # Step 1: Fetch transactions
    transactions = fetch_transactions_from_helius(wallet_address, api_key, limit=50)
    
    if not transactions:
        print("❌ No transactions fetched - aborting")
        return
    
    # Step 2: Save to database
    saved_count = save_transactions_to_database(transactions, wallet_address, job_id)
    
    print(f"\n📊 RESULTS:")
    print(f"   Fetched: {len(transactions)} transactions")
    print(f"   Saved: {saved_count} transactions")
    print(f"   Job ID: {job_id}")
    
    if saved_count > 0:
        print(f"✅ Data ingestion fix completed successfully!")
        return job_id
    else:
        print(f"❌ Data ingestion fix failed!")
        return None

if __name__ == "__main__":
    main()