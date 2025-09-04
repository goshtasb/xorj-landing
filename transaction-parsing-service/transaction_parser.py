"""
Transaction Parser for Raydium Swap Detection
FR-1: Data Retrieval Implementation
PRD Core Logic & Functional Requirements
"""

import pandas as pd
from typing import List, Dict, Any, Optional
import structlog
from database_client import get_database_client
from raydium_detector import RaydiumSwapDetector
from token_filter import TokenFilter
from swap_extractor import SwapDataExtractor
from swap_history_persistence import get_persistence_client

logger = structlog.get_logger(__name__)

class RaydiumSwapParser:
    """
    Main parser class for identifying and extracting Raydium AMM v4 swaps
    """
    
    def __init__(self):
        self.db_client = get_database_client()
        self.raydium_detector = RaydiumSwapDetector()  # FR-2: Initialize swap detector
        self.token_filter = TokenFilter()              # FR-3: Initialize token filter
        self.swap_extractor = SwapDataExtractor()      # FR-4: Initialize data extractor
        self.persistence_client = get_persistence_client()  # NEW: Production persistence
        logger.info("Raydium swap parser initialized with all components including production persistence")
    
    def process_job(self, job_id: str) -> Dict[str, Any]:
        """
        FR-1: Data Retrieval - Process all raw transactions for a given job_id
        
        Args:
            job_id: The ingestion job ID to process
            
        Returns:
            Processing results dictionary
        """
        try:
            logger.info("Starting transaction parsing job", job_id=job_id)
            
            # FR-1: Data Retrieval - Fetch raw transactions for the job
            raw_transactions_df = self.db_client.get_raw_transactions_for_job(job_id)
            
            if raw_transactions_df.empty:
                logger.warning("No raw transactions found for job", job_id=job_id)
                return {
                    'job_id': job_id,
                    'status': 'completed',
                    'raw_transactions_processed': 0,
                    'raydium_swaps_found': 0,
                    'error': None
                }
            
            logger.info("Raw transactions retrieved successfully",
                       job_id=job_id,
                       transaction_count=len(raw_transactions_df))
            
            # Initialize processing counters
            total_transactions = len(raw_transactions_df)
            parsed_swaps = []
            
            # Process each transaction with full FR-1 through FR-5 pipeline
            for index, row in raw_transactions_df.iterrows():
                try:
                    logger.debug("Processing transaction",
                               signature=row['signature'][:10] + "...",
                               block_time=row['block_time'])
                    
                    # FR-2: Detect Raydium swaps in the transaction
                    raw_transaction_data = row['raw_transaction_data']
                    detected_swaps = self.raydium_detector.detect_raydium_swaps(raw_transaction_data)
                    
                    if not detected_swaps:
                        continue  # No Raydium swaps found, skip to next transaction
                    
                    # Process each detected swap
                    for detected_swap in detected_swaps:
                        try:
                            # FR-4: Extract swap data (token mints, amounts, etc.)
                            swap_data = self.swap_extractor.extract_swap_data(
                                detected_swap=detected_swap,
                                raw_transaction_data=raw_transaction_data,
                                signature=row['signature'],
                                block_time=row['block_time'],
                                wallet_address=row['wallet_address'],
                                ingestion_job_id=job_id,
                                raw_transaction_id=str(row['id'])
                            )
                            
                            if not swap_data:
                                continue  # Failed to extract swap data
                            
                            # FR-3: Check if swap involves whitelisted tokens
                            if not self.token_filter.is_swap_whitelisted(
                                swap_data['from_token_mint'], 
                                swap_data['to_token_mint']
                            ):
                                logger.debug("Swap discarded - no whitelisted tokens",
                                           signature=row['signature'][:10] + "...",
                                           from_token=swap_data['from_token_mint'][:10] + "...",
                                           to_token=swap_data['to_token_mint'][:10] + "...")
                                continue  # Swap doesn't involve whitelisted tokens
                            
                            # Swap passed all filters - add to parsed swaps
                            parsed_swaps.append(swap_data)
                            
                            logger.info("Valid Raydium swap parsed",
                                       signature=row['signature'][:10] + "...",
                                       from_token=swap_data['from_token_mint'][:10] + "...",
                                       to_token=swap_data['to_token_mint'][:10] + "...")
                            
                        except Exception as e:
                            # SR-1: Robust Error Handling - Continue with next swap
                            logger.warning("Failed to process detected swap",
                                         signature=row['signature'][:10] + "...",
                                         error=str(e))
                            continue
                    
                except Exception as e:
                    # SR-1: Robust Error Handling - Continue processing other transactions
                    logger.warning("Failed to process individual transaction",
                                 signature=row['signature'][:10] + "...",
                                 error=str(e))
                    continue
            
            # FR-5: Database Persistence - Save to production swap_history table
            swaps_saved = 0
            if parsed_swaps:
                try:
                    # Save to legacy parsed_raydium_swaps table (for backwards compatibility)
                    legacy_saved = self.db_client.insert_parsed_raydium_swaps(parsed_swaps)
                    
                    # FR-1, FR-2, SR-1, SR-2: Save to production swap_history table with security requirements
                    swaps_saved, duplicates_skipped = self.persistence_client.insert_swap_records(parsed_swaps, job_id)
                    
                    logger.info("Parsed swaps saved to production database",
                               job_id=job_id,
                               legacy_saved=legacy_saved,
                               production_saved=swaps_saved,
                               duplicates_skipped=duplicates_skipped)
                               
                except Exception as e:
                    # SR-1: Robust Error Handling
                    logger.error("Failed to save parsed swaps to database",
                                job_id=job_id,
                                error=str(e))
                    return {
                        'job_id': job_id,
                        'status': 'failed',
                        'raw_transactions_processed': total_transactions,
                        'raydium_swaps_found': 0,
                        'error': f"Database save failed: {str(e)}"
                    }
            
            # Return processing results
            results = {
                'job_id': job_id,
                'status': 'completed',
                'raw_transactions_processed': total_transactions,
                'raydium_swaps_found': len(parsed_swaps),
                'raydium_swaps_saved': swaps_saved,
                'error': None
            }
            
            logger.info("Transaction parsing job completed",
                       **results)
            
            return results
            
        except Exception as e:
            # SR-1: Robust Error Handling
            error_msg = f"Transaction parsing job failed: {str(e)}"
            logger.error("Transaction parsing job failed",
                        job_id=job_id,
                        error=str(e))
            
            return {
                'job_id': job_id,
                'status': 'failed',
                'raw_transactions_processed': 0,
                'raydium_swaps_found': 0,
                'error': error_msg
            }

