#!/usr/bin/env python3
"""
Process Existing Raw Transaction Data
Parse Helius-formatted raw transaction data into standardized swap records
"""

import asyncio
import json
import os
import sys
from datetime import datetime, timezone
from decimal import Decimal
from typing import Dict, List, Optional, Any
import uuid

# Add the app directory to the path
sys.path.append(os.path.join(os.path.dirname(__file__), 'app'))

# Database imports
import asyncpg
from app.core.config import get_settings

settings = get_settings()

class HeliusTransactionProcessor:
    """Process Helius-formatted transaction data into swap records"""
    
    def __init__(self):
        self.processed_count = 0
        self.error_count = 0
        self.swap_count = 0
    
    def extract_swap_from_helius_data(self, raw_data: Dict[str, Any], wallet_address: str, signature: str) -> Optional[Dict[str, Any]]:
        """Extract swap data from Helius transaction format"""
        try:
            # Check if this is a swap transaction
            if raw_data.get('type') != 'SWAP':
                return None
            
            events = raw_data.get('events', {})
            swap_data = events.get('swap')
            if not swap_data:
                return None
            
            # Get inner swaps - this is where the actual swap data is
            inner_swaps = swap_data.get('innerSwaps', [])
            if not inner_swaps:
                return None
            
            # Process the first inner swap (main swap)
            inner_swap = inner_swaps[0]
            
            # Extract token changes from tokenBalanceChanges
            token_changes = raw_data.get('tokenTransfers', [])
            if not token_changes:
                return None
            
            # Find token changes for our wallet
            user_changes = []
            for change in token_changes:
                if change.get('fromUserAccount') == wallet_address:
                    # User is sending this token (token_in)
                    user_changes.append({
                        'mint': change.get('mint'),
                        'amount': -abs(float(change.get('tokenAmount', 0))),  # Negative for outgoing
                        'decimals': change.get('decimals', 0)
                    })
                elif change.get('toUserAccount') == wallet_address:
                    # User is receiving this token (token_out)
                    user_changes.append({
                        'mint': change.get('mint'),
                        'amount': abs(float(change.get('tokenAmount', 0))),  # Positive for incoming
                        'decimals': change.get('decimals', 0)
                    })
            
            if len(user_changes) < 2:
                return None
            
            # Identify token_in (negative amount) and token_out (positive amount)
            token_in = None
            token_out = None
            
            for change in user_changes:
                if change['amount'] < 0:  # Token going out
                    token_in = {
                        'mint': change['mint'],
                        'amount': abs(change['amount']),
                        'decimals': change['decimals']
                    }
                elif change['amount'] > 0:  # Token coming in
                    token_out = {
                        'mint': change['mint'],
                        'amount': change['amount'],
                        'decimals': change['decimals']
                    }
            
            if not token_in or not token_out:
                return None
            
            # Create swap record
            swap_record = {
                'ingestion_job_id': str(uuid.uuid4()),
                'wallet_address': wallet_address,
                'signature': signature,
                'block_time': datetime.fromtimestamp(raw_data.get('timestamp', 0), timezone.utc),
                'from_token_mint': token_in['mint'],
                'to_token_mint': token_out['mint'],
                'amount_in': int(token_in['amount'] * (10 ** token_in['decimals'])),  # Convert to base units
                'amount_out': int(token_out['amount'] * (10 ** token_out['decimals']))  # Convert to base units
            }
            
            return swap_record
            
        except Exception as e:
            print(f"Error extracting swap from {signature}: {e}")
            return None
    
    async def process_raw_transactions(self, wallet_address: str, limit: int = 100):
        """Process raw transactions for a wallet"""
        
        # Connect to database
        conn = await asyncpg.connect(settings.database_url)
        
        try:
            # Get raw transactions to process
            print(f"Fetching up to {limit} raw transactions for wallet {wallet_address}...")
            
            raw_transactions = await conn.fetch("""
                SELECT signature, raw_transaction_data, block_time
                FROM raw_transactions 
                WHERE wallet_address = $1
                ORDER BY block_time DESC
                LIMIT $2
            """, wallet_address, limit)
            
            print(f"Found {len(raw_transactions)} raw transactions to process")
            
            processed_swaps = []
            
            for row in raw_transactions:
                signature = row['signature']
                raw_data = row['raw_transaction_data']
                
                self.processed_count += 1
                
                try:
                    # Parse the JSON data
                    if isinstance(raw_data, str):
                        transaction_data = json.loads(raw_data)
                    else:
                        transaction_data = raw_data
                    
                    # Extract swap data
                    swap_record = self.extract_swap_from_helius_data(
                        transaction_data, wallet_address, signature
                    )
                    
                    if swap_record:
                        processed_swaps.append(swap_record)
                        self.swap_count += 1
                        
                        if self.swap_count % 10 == 0:
                            print(f"Processed {self.swap_count} swaps so far...")
                    
                except Exception as e:
                    print(f"Error processing transaction {signature}: {e}")
                    self.error_count += 1
                    continue
            
            # Insert processed swaps into database
            if processed_swaps:
                print(f"Inserting {len(processed_swaps)} swaps into database...")
                
                await conn.executemany("""
                    INSERT INTO parsed_raydium_swaps 
                    (ingestion_job_id, wallet_address, signature, block_time, from_token_mint, to_token_mint, amount_in, amount_out)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                    ON CONFLICT (signature) DO NOTHING
                """, [
                    (
                        swap['ingestion_job_id'],
                        swap['wallet_address'], 
                        swap['signature'],
                        swap['block_time'],
                        swap['from_token_mint'],
                        swap['to_token_mint'],
                        swap['amount_in'],
                        swap['amount_out']
                    ) for swap in processed_swaps
                ])
                
                print(f"Successfully inserted {len(processed_swaps)} swaps")
            
            print(f"Processing complete:")
            print(f"  - Total transactions processed: {self.processed_count}")
            print(f"  - Swaps extracted: {self.swap_count}")
            print(f"  - Errors encountered: {self.error_count}")
            
        finally:
            await conn.close()

async def main():
    """Process existing raw transaction data"""
    
    wallet_address = "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1"
    
    print(f"Processing existing raw transaction data for wallet: {wallet_address}")
    print("This will parse Helius-formatted transactions into standardized swap records...")
    
    try:
        processor = HeliusTransactionProcessor()
        await processor.process_raw_transactions(wallet_address, limit=500)
        
        print("\nData processing completed successfully!")
        
    except Exception as e:
        print(f"Error processing data: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())