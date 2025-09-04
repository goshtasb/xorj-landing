"""
Database Client for Transaction Parsing & Filtering Service
Handles reading raw transactions and writing parsed Raydium swaps
PRD Section 3: Input & Output Specification
"""

import uuid
import psycopg2
import pandas as pd
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone
import structlog

logger = structlog.get_logger(__name__)

class TransactionParsingDatabaseClient:
    """
    Database client for transaction parsing service
    Reads from raw_transactions, writes to parsed_raydium_swaps
    """
    
    def __init__(self, connection_string: str = "postgresql://xorj:@localhost:5432/xorj_quant"):
        self.connection_string = connection_string
        logger.info("Transaction parsing database client initialized")
    
    def get_raw_transactions_for_job(self, job_id: str) -> pd.DataFrame:
        """
        Fetch all raw transactions for a specific ingestion job
        
        Args:
            job_id: The ingestion job ID to process
            
        Returns:
            DataFrame with raw transaction data
        """
        try:
            with psycopg2.connect(self.connection_string) as conn:
                query = """
                SELECT 
                    id,
                    job_id,
                    wallet_address,
                    signature,
                    block_time,
                    raw_transaction_data,
                    created_at
                FROM raw_transactions 
                WHERE job_id = %s
                ORDER BY block_time ASC
                """
                
                df = pd.read_sql_query(
                    query, 
                    conn, 
                    params=(job_id,)
                )
                
                logger.info("Raw transactions fetched for parsing",
                           job_id=job_id,
                           transaction_count=len(df))
                
                return df
                
        except Exception as e:
            logger.error("Failed to fetch raw transactions",
                        job_id=job_id,
                        error=str(e))
            raise
    
    def insert_parsed_raydium_swaps(self, swaps: List[Dict[str, Any]]) -> int:
        """
        Insert parsed Raydium swaps into the database
        
        Args:
            swaps: List of parsed swap dictionaries
            
        Returns:
            Number of swaps successfully inserted
        """
        if not swaps:
            logger.info("No swaps to insert")
            return 0
        
        try:
            with psycopg2.connect(self.connection_string) as conn:
                with conn.cursor() as cur:
                    insert_query = """
                    INSERT INTO parsed_raydium_swaps (
                        id,
                        ingestion_job_id,
                        raw_transaction_id,
                        wallet_address,
                        signature,
                        block_time,
                        from_token_mint,
                        to_token_mint,
                        amount_in,
                        amount_out,
                        created_at
                    ) VALUES %s
                    ON CONFLICT (signature) DO NOTHING
                    """
                    
                    # Prepare data for batch insert
                    values = []
                    for swap in swaps:
                        values.append((
                            str(uuid.uuid4()),  # id
                            swap['ingestion_job_id'],
                            swap['raw_transaction_id'],
                            swap['wallet_address'],
                            swap['signature'],
                            datetime.fromtimestamp(swap['block_time'], tz=timezone.utc),
                            swap['from_token_mint'],
                            swap['to_token_mint'],
                            swap['amount_in'],
                            swap['amount_out'],
                            datetime.now(timezone.utc)  # created_at
                        ))
                    
                    # Execute batch insert
                    from psycopg2.extras import execute_values
                    execute_values(cur, insert_query, values, page_size=100)
                    
                    inserted_count = len(swaps)
                    conn.commit()
                    
                    logger.info("Parsed Raydium swaps inserted successfully",
                               swaps_inserted=inserted_count)
                    
                    return inserted_count
                    
        except Exception as e:
            logger.error("Failed to insert parsed swaps",
                        error=str(e),
                        swap_count=len(swaps))
            raise
    
    def get_parsing_job_statistics(self, job_id: str) -> Dict[str, int]:
        """
        Get statistics for a parsing job
        
        Args:
            job_id: The ingestion job ID
            
        Returns:
            Dictionary with parsing statistics
        """
        try:
            with psycopg2.connect(self.connection_string) as conn:
                with conn.cursor() as cur:
                    # Get raw transaction count
                    cur.execute(
                        "SELECT COUNT(*) FROM raw_transactions WHERE job_id = %s",
                        (job_id,)
                    )
                    raw_count = cur.fetchone()[0]
                    
                    # Get parsed swap count
                    cur.execute(
                        "SELECT COUNT(*) FROM parsed_raydium_swaps WHERE ingestion_job_id = %s",
                        (job_id,)
                    )
                    parsed_count = cur.fetchone()[0]
                    
                    stats = {
                        'raw_transactions': raw_count,
                        'parsed_swaps': parsed_count,
                        'parsing_rate': (parsed_count / raw_count * 100) if raw_count > 0 else 0
                    }
                    
                    logger.info("Parsing job statistics calculated",
                               job_id=job_id,
                               **stats)
                    
                    return stats
                    
        except Exception as e:
            logger.error("Failed to get parsing job statistics",
                        job_id=job_id,
                        error=str(e))
            return {'raw_transactions': 0, 'parsed_swaps': 0, 'parsing_rate': 0}

# Global database client instance
_db_client: Optional[TransactionParsingDatabaseClient] = None

def get_database_client() -> TransactionParsingDatabaseClient:
    """Get or create the global database client instance"""
    global _db_client
    
    if _db_client is None:
        _db_client = TransactionParsingDatabaseClient()
    
    return _db_client