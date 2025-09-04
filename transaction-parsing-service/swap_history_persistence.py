"""
Swap History Database Persistence Module
FR-1: Data Insertion Logic & FR-2: Data Transformation & Typing
SR-1: Idempotency via Uniqueness & SR-2: Transactional Writes
PRD: Core Data Pipeline - Database Persistence
"""

import uuid
import psycopg2
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime, timezone
import structlog
from psycopg2 import IntegrityError

logger = structlog.get_logger(__name__)

class SwapHistoryPersistence:
    """
    Production-grade persistence layer for swap_history table
    FR-1: Data Insertion Logic & FR-2: Data Transformation & Typing
    SR-1: Idempotency via Uniqueness & SR-2: Transactional Writes
    """
    
    def __init__(self, connection_string: str = "postgresql://xorj:@localhost:5432/xorj_quant"):
        self.connection_string = connection_string
        logger.info("Swap history persistence initialized")
    
    def insert_swap_records(self, parsed_swaps: List[Dict[str, Any]], job_id: Optional[str] = None) -> Tuple[int, int]:
        """
        FR-1: Insert parsed swap data into swap_history table
        FR-2: Handle proper data transformation and typing
        SR-1: Idempotency via Uniqueness - Handle constraint violations gracefully
        SR-2: Transactional Writes - All insertions in single transaction with rollback
        
        Args:
            parsed_swaps: List of parsed swap dictionaries from parsing service
            job_id: Optional job ID for logging and transaction grouping
            
        Returns:
            Tuple of (successfully_inserted_count, duplicate_signatures_count)
        """
        if not parsed_swaps:
            logger.info("No swap records to insert", job_id=job_id)
            return (0, 0)
        
        # FR-2: Transform and validate all records before starting transaction
        transformed_values = []
        invalid_records = 0
        
        for swap in parsed_swaps:
            transformed_record = self._transform_swap_data(swap)
            if transformed_record:
                transformed_values.append(transformed_record)
            else:
                invalid_records += 1
        
        if not transformed_values:
            logger.warning("No valid swap records after transformation", 
                          job_id=job_id,
                          invalid_count=invalid_records)
            return (0, 0)
        
        logger.info("Starting transactional insert batch",
                   job_id=job_id,
                   total_records=len(parsed_swaps),
                   valid_records=len(transformed_values),
                   invalid_records=invalid_records)
        
        # SR-2: Transactional Writes - Single transaction for entire batch
        try:
            with psycopg2.connect(self.connection_string) as conn:
                with conn.cursor() as cur:
                    # Begin explicit transaction for batch
                    cur.execute("BEGIN;")
                    
                    insert_query = """
                    INSERT INTO swap_history (
                        id,
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
                    RETURNING id, signature
                    """
                    
                    try:
                        # Execute batch insert with proper typing
                        from psycopg2.extras import execute_values
                        result = execute_values(
                            cur, 
                            insert_query, 
                            transformed_values, 
                            page_size=100,
                            fetch=True
                        )
                        
                        # Calculate results
                        inserted_count = len(result) if result else 0
                        duplicate_count = len(transformed_values) - inserted_count
                        
                        # Commit the transaction
                        cur.execute("COMMIT;")
                        
                        # SR-1: Log idempotency results
                        if duplicate_count > 0:
                            logger.info("Duplicate signatures detected and handled gracefully",
                                       job_id=job_id,
                                       duplicates_skipped=duplicate_count,
                                       new_records_inserted=inserted_count)
                        
                        logger.info("Transactional batch insert completed successfully",
                                   job_id=job_id,
                                   records_processed=len(parsed_swaps),
                                   records_inserted=inserted_count,
                                   duplicates_skipped=duplicate_count,
                                   invalid_records=invalid_records)
                        
                        return (inserted_count, duplicate_count)
                        
                    except IntegrityError as e:
                        # SR-1: Handle constraint violations gracefully
                        cur.execute("ROLLBACK;")
                        logger.warning("Integrity constraint violation - transaction rolled back",
                                     job_id=job_id,
                                     error=str(e),
                                     records_attempted=len(transformed_values))
                        
                        # For integrity errors, we can retry with individual inserts
                        # to identify which specific records are causing issues
                        return self._handle_individual_inserts(transformed_values, job_id)
                        
                    except Exception as e:
                        # SR-2: Any other error rolls back the entire transaction
                        cur.execute("ROLLBACK;")
                        logger.error("Transaction failed - rolling back entire batch",
                                   job_id=job_id,
                                   error=str(e),
                                   records_attempted=len(transformed_values))
                        raise
                        
        except psycopg2.OperationalError as e:
            # Database connection issues
            logger.error("Database connection failed for swap insertion",
                        job_id=job_id,
                        error=str(e),
                        swap_count=len(parsed_swaps))
            raise
            
        except Exception as e:
            # Any other unexpected errors
            logger.error("Unexpected error during swap record insertion",
                        job_id=job_id,
                        error=str(e),
                        swap_count=len(parsed_swaps))
            raise
    
    def _handle_individual_inserts(self, transformed_values: List[tuple], job_id: Optional[str] = None) -> Tuple[int, int]:
        """
        SR-1: Fallback method for individual record insertion when batch fails
        This helps identify specific problematic records while maintaining data integrity
        
        Args:
            transformed_values: List of transformed swap tuples ready for insertion
            job_id: Optional job ID for logging
            
        Returns:
            Tuple of (successfully_inserted_count, duplicate_signatures_count)
        """
        inserted_count = 0
        duplicate_count = 0
        error_count = 0
        
        logger.info("Attempting individual record insertions as fallback",
                   job_id=job_id,
                   records_to_process=len(transformed_values))
        
        with psycopg2.connect(self.connection_string) as conn:
            with conn.cursor() as cur:
                insert_query = """
                INSERT INTO swap_history (
                    id,
                    wallet_address,
                    signature,
                    block_time,
                    from_token_mint,
                    to_token_mint,
                    amount_in,
                    amount_out,
                    created_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (signature) DO NOTHING
                RETURNING id
                """
                
                for i, record in enumerate(transformed_values):
                    try:
                        cur.execute(insert_query, record)
                        result = cur.fetchone()
                        
                        if result:
                            inserted_count += 1
                        else:
                            duplicate_count += 1
                            logger.debug("Duplicate signature skipped in individual insert",
                                       job_id=job_id,
                                       signature=record[2][:20] + "...",
                                       record_index=i)
                        
                        # Commit each successful insert individually
                        conn.commit()
                        
                    except IntegrityError as e:
                        # SR-1: Handle constraint violations gracefully
                        duplicate_count += 1
                        conn.rollback()
                        logger.debug("Constraint violation handled in individual insert",
                                   job_id=job_id,
                                   signature=record[2][:20] + "...",
                                   record_index=i,
                                   error=str(e))
                        
                    except Exception as e:
                        # Other errors for individual records
                        error_count += 1
                        conn.rollback()
                        logger.warning("Individual record insertion failed",
                                     job_id=job_id,
                                     signature=record[2][:20] + "...",
                                     record_index=i,
                                     error=str(e))
        
        logger.info("Individual insertion fallback completed",
                   job_id=job_id,
                   records_inserted=inserted_count,
                   duplicates_skipped=duplicate_count,
                   errors=error_count)
        
        return (inserted_count, duplicate_count)
    
    def _transform_swap_data(self, swap: Dict[str, Any]) -> Optional[tuple]:
        """
        FR-2: Data Transformation & Typing
        Transform parsed swap data to match swap_history schema requirements
        
        Args:
            swap: Raw parsed swap dictionary
            
        Returns:
            Transformed tuple for database insertion or None if invalid
        """
        try:
            # FR-2: Handle proper data typing for database insertion
            
            # Generate unique ID
            record_id = str(uuid.uuid4())
            
            # Extract and validate wallet address
            wallet_address = swap.get('wallet_address')
            if not wallet_address or not isinstance(wallet_address, str):
                logger.warning("Invalid wallet_address in swap data", swap_data=swap)
                return None
            
            # Extract and validate signature
            signature = swap.get('signature')
            if not signature or not isinstance(signature, str):
                logger.warning("Invalid signature in swap data", swap_data=swap)
                return None
            
            # FR-2: Convert Unix timestamp to PostgreSQL TIMESTAMPTZ
            block_time = swap.get('block_time')
            if isinstance(block_time, (int, float)):
                block_timestamp = datetime.fromtimestamp(block_time, tz=timezone.utc)
            elif isinstance(block_time, datetime):
                block_timestamp = block_time.replace(tzinfo=timezone.utc) if block_time.tzinfo is None else block_time
            else:
                logger.warning("Invalid block_time format", block_time=block_time)
                return None
            
            # Extract and validate token mints
            from_token_mint = swap.get('from_token_mint')
            to_token_mint = swap.get('to_token_mint')
            if not from_token_mint or not to_token_mint:
                logger.warning("Missing token mint addresses", swap_data=swap)
                return None
            
            # FR-2: Handle u64 amounts as BIGINT to avoid precision loss
            amount_in = swap.get('amount_in')
            amount_out = swap.get('amount_out')
            
            # Convert to int if needed and validate
            if isinstance(amount_in, (int, float, str)):
                try:
                    amount_in = int(amount_in)
                except (ValueError, TypeError):
                    logger.warning("Invalid amount_in format", amount_in=amount_in)
                    return None
            else:
                logger.warning("Invalid amount_in type", amount_in=amount_in)
                return None
                
            if isinstance(amount_out, (int, float, str)):
                try:
                    amount_out = int(amount_out)
                except (ValueError, TypeError):
                    logger.warning("Invalid amount_out format", amount_out=amount_out)
                    return None
            else:
                logger.warning("Invalid amount_out type", amount_out=amount_out)
                return None
            
            # Current timestamp for created_at
            created_at = datetime.now(timezone.utc)
            
            # Return transformed tuple for database insertion
            return (
                record_id,
                wallet_address,
                signature,
                block_timestamp,
                from_token_mint,
                to_token_mint,
                amount_in,  # BIGINT - preserves full precision of u64
                amount_out, # BIGINT - preserves full precision of u64
                created_at
            )
            
        except Exception as e:
            logger.warning("Error transforming swap data",
                          error=str(e),
                          swap_data=swap)
            return None
    
    def get_recent_swaps(self, limit: int = 10) -> List[Dict[str, Any]]:
        """
        Utility method to retrieve recent swaps from swap_history
        
        Args:
            limit: Maximum number of records to retrieve
            
        Returns:
            List of recent swap records
        """
        try:
            with psycopg2.connect(self.connection_string) as conn:
                with conn.cursor() as cur:
                    cur.execute("""
                        SELECT 
                            id,
                            wallet_address,
                            signature,
                            block_time,
                            from_token_mint,
                            to_token_mint,
                            amount_in,
                            amount_out,
                            created_at
                        FROM swap_history
                        ORDER BY block_time DESC
                        LIMIT %s
                    """, (limit,))
                    
                    columns = [desc[0] for desc in cur.description]
                    rows = cur.fetchall()
                    
                    return [dict(zip(columns, row)) for row in rows]
                    
        except Exception as e:
            logger.error("Failed to retrieve recent swaps", error=str(e))
            return []

# Global instance
_persistence_client: Optional[SwapHistoryPersistence] = None

def get_persistence_client() -> SwapHistoryPersistence:
    """Get or create global persistence client"""
    global _persistence_client
    
    if _persistence_client is None:
        _persistence_client = SwapHistoryPersistence()
    
    return _persistence_client

