#!/usr/bin/env python3
"""
Populate swap_history with real Raydium swap data
Extracts swap data from Helius pre-parsed transactions
"""

import uuid
import json
import psycopg2
from datetime import datetime, timezone
from typing import List, Dict, Any

def extract_raydium_swaps_from_helius_data(job_id: str) -> List[Dict[str, Any]]:
    """Extract Raydium swaps from Helius pre-parsed transaction data"""
    
    connection_string = "postgresql://xorj:@localhost:5432/xorj_quant"
    
    try:
        with psycopg2.connect(connection_string) as conn:
            with conn.cursor() as cur:
                
                # Get all raw transactions for the job
                cur.execute("""
                    SELECT id, wallet_address, signature, block_time, raw_transaction_data
                    FROM raw_transactions 
                    WHERE job_id = %s
                """, (job_id,))
                
                raw_transactions = cur.fetchall()
                
                print(f"Processing {len(raw_transactions)} transactions for Raydium swaps...")
                
                extracted_swaps = []
                
                for tx_id, wallet_address, signature, block_time, raw_data in raw_transactions:
                    try:
                        # Check if this is a Raydium swap transaction
                        if (raw_data.get('source') == 'RAYDIUM' and 
                            raw_data.get('type') == 'SWAP' and 
                            'events' in raw_data and 
                            'swap' in raw_data['events']):
                            
                            swap_event = raw_data['events']['swap']
                            
                            # Extract token inputs and outputs
                            token_inputs = swap_event.get('tokenInputs', [])
                            token_outputs = swap_event.get('tokenOutputs', [])
                            native_input = swap_event.get('nativeInput')
                            native_output = swap_event.get('nativeOutput')
                            
                            # Determine from/to tokens and amounts
                            from_token_mint = None
                            to_token_mint = None
                            amount_in = 0
                            amount_out = 0
                            
                            # Handle token -> SOL swaps
                            if token_inputs and native_output:
                                from_token_mint = token_inputs[0]['mint']
                                to_token_mint = "So11111111111111111111111111111111111111112"  # SOL mint
                                amount_in = int(token_inputs[0]['rawTokenAmount']['tokenAmount'])
                                amount_out = int(native_output['amount'])
                                
                            # Handle SOL -> token swaps
                            elif native_input and token_outputs:
                                from_token_mint = "So11111111111111111111111111111111111111112"  # SOL mint
                                to_token_mint = token_outputs[0]['mint']
                                amount_in = int(native_input['amount'])
                                amount_out = int(token_outputs[0]['rawTokenAmount']['tokenAmount'])
                                
                            # Handle token -> token swaps
                            elif token_inputs and token_outputs:
                                from_token_mint = token_inputs[0]['mint']
                                to_token_mint = token_outputs[0]['mint']
                                amount_in = int(token_inputs[0]['rawTokenAmount']['tokenAmount'])
                                amount_out = int(token_outputs[0]['rawTokenAmount']['tokenAmount'])
                            
                            if from_token_mint and to_token_mint:
                                swap_record = {
                                    'id': str(uuid.uuid4()),
                                    'wallet_address': wallet_address,
                                    'signature': signature,
                                    'block_time': datetime.fromtimestamp(block_time, tz=timezone.utc),  # Convert to datetime
                                    'from_token_mint': from_token_mint,
                                    'to_token_mint': to_token_mint,
                                    'amount_in': amount_in,
                                    'amount_out': amount_out,
                                    'created_at': datetime.now(timezone.utc)
                                }
                                
                                extracted_swaps.append(swap_record)
                                
                                print(f"✅ Extracted Raydium swap: {signature[:10]}...")
                            
                    except Exception as e:
                        print(f"⚠️ Failed to process transaction {signature[:10]}...: {e}")
                        continue
                
                print(f"Successfully extracted {len(extracted_swaps)} Raydium swaps from Helius data")
                return extracted_swaps
                
    except Exception as e:
        print(f"❌ Database error: {e}")
        return []

def save_swaps_to_swap_history(swaps: List[Dict[str, Any]]) -> int:
    """Save extracted swaps to swap_history table"""
    
    if not swaps:
        print("No swaps to save")
        return 0
    
    connection_string = "postgresql://xorj:@localhost:5432/xorj_quant"
    
    try:
        with psycopg2.connect(connection_string) as conn:
            with conn.cursor() as cur:
                
                insert_query = """
                INSERT INTO swap_history (
                    id, wallet_address, signature, block_time, 
                    from_token_mint, to_token_mint, amount_in, amount_out, created_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (signature) DO NOTHING
                """
                
                inserted_count = 0
                
                for swap in swaps:
                    try:
                        record_data = (
                            swap['id'],
                            swap['wallet_address'],
                            swap['signature'],
                            swap['block_time'],
                            swap['from_token_mint'],
                            swap['to_token_mint'],
                            swap['amount_in'],
                            swap['amount_out'],
                            swap['created_at']
                        )
                        
                        cur.execute(insert_query, record_data)
                        inserted_count += 1
                        
                    except Exception as e:
                        print(f"⚠️ Failed to insert swap {swap['signature'][:10]}...: {e}")
                        continue
                
                conn.commit()
                print(f"✅ Successfully saved {inserted_count} swaps to swap_history table")
                return inserted_count
                
    except Exception as e:
        print(f"❌ Database error: {e}")
        return 0

def main():
    """Main execution function"""
    
    job_id = 'b21dbcfd-e901-45db-87a1-1c156e512a79'
    
    print(f"🚀 Starting swap_history population from Helius data")
    print(f"📋 Job ID: {job_id}")
    
    # Step 1: Extract Raydium swaps from Helius pre-parsed data
    extracted_swaps = extract_raydium_swaps_from_helius_data(job_id)
    
    if not extracted_swaps:
        print("❌ No Raydium swaps found in the data")
        return
    
    # Step 2: Save to swap_history table
    saved_count = save_swaps_to_swap_history(extracted_swaps)
    
    print(f"\n📊 RESULTS:")
    print(f"   Extracted: {len(extracted_swaps)} Raydium swaps")
    print(f"   Saved: {saved_count} swaps to swap_history")
    
    if saved_count > 0:
        print(f"✅ swap_history population completed successfully!")
    else:
        print(f"❌ swap_history population failed!")

if __name__ == "__main__":
    main()