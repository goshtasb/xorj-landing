"""
XORJ Quantitative Engine - Data Ingestion Worker
Scheduled worker for ingesting Raydium swap transaction data
"""

import asyncio
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional, Set, Tuple
import uuid

from ..core.config import get_settings
from ..core.logging import get_ingestion_logger, CorrelationContext, RequestLogger
from ..core.retry import RetrySession
from ..schemas.ingestion import (
    RaydiumSwap, 
    WalletIngestionStatus, 
    IngestionBatch,
    TransactionStatus
)
from .solana_client import get_helius_client, EnhancedSolanaClient
from .raydium_parser import get_raydium_parser, RaydiumTransactionParser

settings = get_settings()
logger = get_ingestion_logger()


class DataIngestionWorker:
    """
    Scheduled worker for ingesting swap transaction data from Raydium protocol
    Implements robust error handling and retry logic as specified in FR-1
    """
    
    def __init__(
        self,
        solana_client: Optional[EnhancedSolanaClient] = None,
        parser: Optional[RaydiumTransactionParser] = None,
        batch_size: int = 100,
        max_transactions_per_wallet: int = None
    ):
        self.solana_client = solana_client
        self.parser = parser or get_raydium_parser()
        self.batch_size = batch_size
        self.max_transactions_per_wallet = max_transactions_per_wallet or settings.max_transactions_per_wallet
        
        # Retry session for robust error handling
        self.retry_session = RetrySession(
            max_attempts=settings.max_retries,
            base_delay=1.0,
            max_delay=settings.max_retry_delay_seconds
        )
        
        # Processing statistics
        self.stats = {
            'total_wallets_processed': 0,
            'total_transactions_fetched': 0,
            'total_swaps_extracted': 0,
            'total_errors': 0,
            'processing_time_seconds': 0
        }
        
        logger.info(
            "Initialized Data Ingestion Worker",
            batch_size=self.batch_size,
            max_transactions_per_wallet=self.max_transactions_per_wallet,
            retry_config={
                'max_attempts': settings.max_retries,
                'base_delay': 1.0,
                'max_delay': settings.max_retry_delay_seconds
            }
        )
    
    async def initialize(self):
        """Initialize the worker and its dependencies"""
        if not self.solana_client:
            self.solana_client = await get_helius_client()
        
        logger.info("Data ingestion worker initialized successfully")
    
    async def shutdown(self):
        """Shutdown the worker and clean up resources"""
        if self.solana_client:
            await self.solana_client.close()
        
        logger.info("Data ingestion worker shutdown complete")
    
    async def fetch_wallet_signatures(
        self, 
        wallet_address: str,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> List[Dict[str, any]]:
        """
        Fetch transaction signatures for a wallet with date filtering
        
        Args:
            wallet_address: Wallet address to fetch signatures for
            start_date: Start date for fetching (optional)
            end_date: End date for fetching (optional)
            
        Returns:
            List of transaction signature objects
        """
        all_signatures = []
        before_signature = None
        
        logger.debug(
            "Fetching signatures for wallet",
            wallet=wallet_address,
            start_date=start_date.isoformat() if start_date else None,
            end_date=end_date.isoformat() if end_date else None
        )
        
        while len(all_signatures) < self.max_transactions_per_wallet:
            try:
                # Fetch batch of signatures
                signatures = await self.retry_session.execute_with_retry(
                    self.solana_client.get_transaction_signatures,
                    wallet_address,
                    before=before_signature,
                    limit=min(1000, self.max_transactions_per_wallet - len(all_signatures))
                )
                
                if not signatures:
                    logger.debug("No more signatures found", wallet=wallet_address)
                    break
                
                # Filter by date if specified
                filtered_signatures = []
                for sig_info in signatures:
                    # Handle solders object properties
                    block_time = getattr(sig_info, 'block_time', None)
                    if not block_time:
                        continue
                    
                    sig_date = datetime.fromtimestamp(block_time, timezone.utc)
                    
                    # Check date filters
                    if start_date and sig_date < start_date:
                        # We've gone back too far, stop here
                        logger.debug(
                            "Reached start date limit",
                            wallet=wallet_address,
                            sig_date=sig_date.isoformat(),
                            start_date=start_date.isoformat()
                        )
                        return all_signatures
                    
                    if end_date and sig_date > end_date:
                        continue
                    
                    filtered_signatures.append(sig_info)
                
                all_signatures.extend(filtered_signatures)
                
                # Set up for next batch
                if signatures:
                    before_signature = str(getattr(signatures[-1], 'signature', None))
                    
                logger.debug(
                    "Fetched signature batch",
                    wallet=wallet_address,
                    batch_size=len(signatures),
                    filtered_size=len(filtered_signatures),
                    total_collected=len(all_signatures)
                )
                
                # If we got fewer than requested, we've reached the end
                if len(signatures) < 1000:
                    break
                    
            except Exception as e:
                logger.error(
                    "Failed to fetch signatures batch",
                    wallet=wallet_address,
                    error=str(e),
                    collected_so_far=len(all_signatures)
                )
                # Continue with what we have
                break
        
        logger.info(
            "Completed signature fetching",
            wallet=wallet_address,
            total_signatures=len(all_signatures)
        )
        
        return all_signatures
    
    async def estimate_transaction_count(
        self,
        wallet_address: str,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> int:
        """
        Pre-flight check to estimate transaction count without fetching all data
        
        Args:
            wallet_address: Wallet address to check
            start_date: Start date for estimation (optional)
            end_date: End date for estimation (optional)
            
        Returns:
            Estimated transaction count
        """
        try:
            # Use a small sample to estimate total volume
            sample_signatures = await self.retry_session.execute_with_retry(
                self.solana_client.get_transaction_signatures,
                wallet_address,
                limit=100  # Small sample for estimation
            )
            
            if not sample_signatures or len(sample_signatures) < 2:
                return 0
            
            # Get timestamps from first and last signatures in sample
            first_timestamp = getattr(sample_signatures[0], 'block_time', None)
            last_timestamp = getattr(sample_signatures[-1], 'block_time', None)
            
            if not first_timestamp or not last_timestamp:
                return len(sample_signatures)
            
            # Calculate time span in the sample
            sample_time_span = first_timestamp - last_timestamp  # in seconds
            if sample_time_span <= 0:
                return len(sample_signatures)
            
            # Calculate target time span (90 days if no dates provided)
            if not start_date or not end_date:
                target_time_span = 90 * 24 * 3600  # 90 days in seconds
            else:
                target_time_span = int((end_date - start_date).total_seconds())
            
            # Estimate total transactions based on sample rate
            transactions_per_second = len(sample_signatures) / sample_time_span
            estimated_total = int(transactions_per_second * target_time_span)
            
            logger.info(
                "Transaction count estimation",
                wallet=wallet_address,
                sample_size=len(sample_signatures),
                sample_time_span=sample_time_span,
                transactions_per_second=transactions_per_second,
                estimated_total=estimated_total
            )
            
            return estimated_total
            
        except Exception as e:
            logger.error(
                "Failed to estimate transaction count",
                wallet=wallet_address,
                error=str(e)
            )
            # Conservative estimate - assume high volume
            return settings.transaction_threshold + 1
    
    async def execute_sampling_backfill(
        self,
        wallet_address: str,
        start_date: datetime,
        end_date: datetime
    ) -> Tuple[List[Dict[str, any]], List[str]]:
        """
        Execute sampling backfill strategy for high-volume wallets
        
        Args:
            wallet_address: Wallet address to sample
            start_date: Start date for sampling
            end_date: End date for sampling
            
        Returns:
            Tuple of (sampled_signatures, errors)
        """
        all_sampled_signatures = []
        errors = []
        
        logger.info(
            "Starting sampling backfill",
            wallet=wallet_address,
            start_date=start_date.isoformat(),
            end_date=end_date.isoformat(),
            samples_per_day=settings.num_samples_per_day
        )
        
        # Loop through each day in the range
        current_date = start_date.date()
        end_date_only = end_date.date()
        
        while current_date <= end_date_only:
            try:
                # Create datetime objects for start and end of day
                day_start = datetime.combine(current_date, datetime.min.time()).replace(tzinfo=timezone.utc)
                day_end = datetime.combine(current_date, datetime.max.time()).replace(tzinfo=timezone.utc)
                
                # Fetch sample transactions for this day
                # Note: Due to API limitations, we'll sample recent transactions and filter by date
                try:
                    day_signatures = await self.retry_session.execute_with_retry(
                        self.solana_client.get_transaction_signatures,
                        wallet_address,
                        limit=settings.num_samples_per_day * 4  # Get more to have options for filtering
                    )
                    
                    # Filter for transactions actually within this day and take samples
                    day_filtered = []
                    for sig in day_signatures or []:
                        sig_time = getattr(sig, 'block_time', None)
                        if sig_time:
                            sig_date = datetime.fromtimestamp(sig_time, timezone.utc)
                            if day_start <= sig_date <= day_end:
                                day_filtered.append(sig)
                                # Take limited samples per day
                                if len(day_filtered) >= settings.num_samples_per_day:
                                    break
                    
                    all_sampled_signatures.extend(day_filtered)
                    
                    # Log sampling for this day
                    if day_filtered:
                        logger.debug(
                            "Sampled transactions for day",
                            wallet=wallet_address,
                            date=current_date.isoformat(),
                            samples=len(day_filtered)
                        )
                    
                except Exception as e:
                    errors.append(f"Failed to fetch samples for {current_date}: {str(e)}")
                
                # Move to next day
                current_date += timedelta(days=1)
                
            except Exception as e:
                errors.append(f"Failed to process day {current_date}: {str(e)}")
                current_date += timedelta(days=1)
                continue
        
        logger.info(
            "Completed sampling backfill",
            wallet=wallet_address,
            total_samples=len(all_sampled_signatures),
            errors=len(errors)
        )
        
        return all_sampled_signatures, errors
    
    async def fetch_and_parse_transactions(
        self,
        wallet_address: str,
        signatures: List[Dict[str, any]]
    ) -> Tuple[List[RaydiumSwap], List[str]]:
        """
        Fetch full transaction data and parse Raydium swaps
        
        Args:
            wallet_address: Wallet address being processed
            signatures: List of signature objects to fetch
            
        Returns:
            Tuple of (parsed_swaps, errors)
        """
        parsed_swaps = []
        errors = []
        
        if not signatures:
            return parsed_swaps, errors
        
        logger.debug(
            "Fetching and parsing transactions",
            wallet=wallet_address,
            signature_count=len(signatures)
        )
        
        # Extract signature strings
        sig_strings = [str(getattr(sig, 'signature', None)) for sig in signatures if getattr(sig, 'signature', None)]
        
        # Fetch transactions in batches
        try:
            transactions = await self.retry_session.execute_with_retry(
                self.solana_client.get_multiple_transactions,
                sig_strings,
                batch_size=self.batch_size
            )
            
            # Filter for successful transactions
            valid_transactions = []
            for i, tx in enumerate(transactions):
                if tx is not None:
                    valid_transactions.append((tx, sig_strings[i], wallet_address))
                else:
                    errors.append(f"Failed to fetch transaction: {sig_strings[i]}")
            
            logger.debug(
                "Fetched transactions",
                wallet=wallet_address,
                requested=len(sig_strings),
                received=len(valid_transactions)
            )
            
            # Parse Raydium swaps
            if valid_transactions:
                parsed_swaps = self.parser.parse_multiple_swaps(valid_transactions)
                
                # Validate parsed swaps
                validated_swaps = []
                for swap in parsed_swaps:
                    validation_errors = self.parser.validate_swap_data(swap)
                    if validation_errors:
                        errors.extend([f"Validation error for {swap.signature}: {err}" for err in validation_errors])
                    else:
                        validated_swaps.append(swap)
                
                parsed_swaps = validated_swaps
            
        except Exception as e:
            error_msg = f"Failed to fetch/parse transactions: {str(e)}"
            logger.error(error_msg, wallet=wallet_address)
            errors.append(error_msg)
        
        logger.info(
            "Completed transaction parsing",
            wallet=wallet_address,
            total_signatures=len(signatures),
            parsed_swaps=len(parsed_swaps),
            errors=len(errors)
        )
        
        return parsed_swaps, errors
    
    async def process_wallet(
        self,
        wallet_address: str,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> WalletIngestionStatus:
        """
        Process a single wallet for Raydium swap data
        
        Args:
            wallet_address: Wallet address to process
            start_date: Start date for data collection
            end_date: End date for data collection
            
        Returns:
            WalletIngestionStatus with processing results
        """
        status = WalletIngestionStatus(wallet_address=wallet_address)
        
        with CorrelationContext(wallet=wallet_address, operation="wallet_ingestion"):
            with RequestLogger("wallet_ingestion", wallet=wallet_address):
                try:
                    logger.info(
                        "Starting wallet processing",
                        wallet=wallet_address,
                        start_date=start_date.isoformat() if start_date else None,
                        end_date=end_date.isoformat() if end_date else None
                    )
                    
                    # Step 1: Pre-flight transaction count check
                    estimated_count = await self.estimate_transaction_count(
                        wallet_address, start_date, end_date
                    )
                    
                    ingestion_method = "FULL"
                    
                    # Step 2: Conditional logic based on transaction threshold
                    if estimated_count > settings.transaction_threshold:
                        logger.info(
                            "High-volume wallet detected, using sampling strategy",
                            wallet=wallet_address,
                            estimated_count=estimated_count,
                            threshold=settings.transaction_threshold
                        )
                        
                        # Execute sampling backfill for high-volume wallets
                        signatures, errors = await self.execute_sampling_backfill(
                            wallet_address, start_date, end_date
                        )
                        ingestion_method = "SAMPLED"
                    else:
                        logger.info(
                            "Low-volume wallet detected, using full backfill",
                            wallet=wallet_address,
                            estimated_count=estimated_count,
                            threshold=settings.transaction_threshold
                        )
                        
                        # Execute full backfill for low-volume wallets
                        signatures = await self.fetch_wallet_signatures(
                            wallet_address, start_date, end_date
                        )
                        errors = []
                        ingestion_method = "FULL"
                    
                    status.total_transactions_found = len(signatures)
                    
                    if not signatures:
                        status.add_warning("No transactions found for wallet")
                        status.mark_completed(success=True)
                        return status
                    
                    # Step 3: Filter for potential Raydium transactions
                    # For now, we'll process all signatures and let the parser filter
                    status.raydium_transactions_found = len(signatures)
                    
                    # Step 4: Fetch and parse transactions (if not already done in sampling)
                    if ingestion_method == "SAMPLED":
                        # Signatures are already fetched, now parse them
                        parsed_swaps, parse_errors = await self.fetch_and_parse_transactions(
                            wallet_address, signatures
                        )
                        errors.extend(parse_errors)
                    else:
                        # Full backfill - fetch and parse transactions
                        parsed_swaps, errors = await self.fetch_and_parse_transactions(
                            wallet_address, signatures
                        )
                    
                    status.valid_swaps_extracted = len(parsed_swaps)
                    status.invalid_transactions = len(signatures) - len(parsed_swaps)
                    
                    # Add errors to status
                    for error in errors:
                        status.add_error(error)
                    
                    # Update statistics
                    self.stats['total_transactions_fetched'] += len(signatures)
                    self.stats['total_swaps_extracted'] += len(parsed_swaps)
                    self.stats['total_errors'] += len(errors)
                    
                    # Mark as completed
                    success = len(parsed_swaps) > 0 or len(signatures) == 0
                    status.mark_completed(success=success)
                    
                    logger.info(
                        "Completed wallet processing",
                        wallet=wallet_address,
                        transactions_found=status.total_transactions_found,
                        swaps_extracted=status.valid_swaps_extracted,
                        success=success,
                        duration=status.duration_seconds
                    )
                    
                except Exception as e:
                    error_msg = f"Wallet processing failed: {str(e)}"
                    status.add_error(error_msg)
                    status.mark_completed(success=False)
                    
                    self.stats['total_errors'] += 1
                    
                    logger.error(
                        "Wallet processing failed",
                        wallet=wallet_address,
                        error=str(e),
                        error_type=type(e).__name__
                    )
        
        return status
    
    async def process_batch(self, batch: IngestionBatch) -> Dict[str, WalletIngestionStatus]:
        """
        Process a batch of wallets for ingestion
        
        Args:
            batch: Batch of wallet addresses to process
            
        Returns:
            Dict mapping wallet addresses to their ingestion status
        """
        batch_start_time = datetime.utcnow()
        results = {}
        
        with CorrelationContext(batch_id=batch.batch_id, batch_size=batch.wallet_count):
            logger.info(
                "Starting batch processing",
                batch_id=batch.batch_id,
                wallet_count=batch.wallet_count,
                priority=batch.priority
            )
            
            # Process wallets with controlled concurrency
            semaphore = asyncio.Semaphore(settings.max_concurrent_workers)
            
            async def process_single_wallet(wallet_address: str):
                async with semaphore:
                    return await self.process_wallet(
                        wallet_address,
                        batch.start_date,
                        batch.end_date
                    )
            
            # Create tasks for all wallets
            tasks = {
                wallet: process_single_wallet(wallet)
                for wallet in batch.wallet_addresses
            }
            
            # Execute with proper error handling
            for wallet, task in tasks.items():
                try:
                    status = await task
                    results[wallet] = status
                except Exception as e:
                    logger.error(
                        "Wallet task failed",
                        wallet=wallet,
                        batch_id=batch.batch_id,
                        error=str(e)
                    )
                    # Create failed status
                    failed_status = WalletIngestionStatus(wallet_address=wallet)
                    failed_status.add_error(f"Task execution failed: {str(e)}")
                    failed_status.mark_completed(success=False)
                    results[wallet] = failed_status
            
            # Update batch statistics
            total_duration = (datetime.utcnow() - batch_start_time).total_seconds()
            self.stats['total_wallets_processed'] += len(results)
            self.stats['processing_time_seconds'] += total_duration
            
            # Calculate success metrics
            successful_wallets = sum(1 for status in results.values() if status.success)
            total_swaps = sum(status.valid_swaps_extracted for status in results.values())
            
            logger.info(
                "Completed batch processing",
                batch_id=batch.batch_id,
                wallet_count=batch.wallet_count,
                successful_wallets=successful_wallets,
                total_swaps_extracted=total_swaps,
                duration_seconds=total_duration,
                success_rate=f"{successful_wallets/len(results):.2%}" if results else "0%"
            )
        
        return results
    
    async def run_scheduled_ingestion(
        self,
        wallet_addresses: List[str],
        lookback_hours: int = None
    ) -> Dict[str, WalletIngestionStatus]:
        """
        Run scheduled ingestion for a list of wallet addresses
        This is the main entry point for scheduled execution
        
        Args:
            wallet_addresses: List of wallet addresses to process
            lookback_hours: Hours to look back for new transactions
            
        Returns:
            Dict mapping wallet addresses to their processing status
        """
        if lookback_hours is None:
            lookback_hours = settings.ingestion_schedule_hours
        
        # Calculate date range (timezone-aware to match signature timestamps)
        end_date = datetime.now(timezone.utc)
        start_date = end_date - timedelta(hours=lookback_hours)
        
        # Create ingestion batch
        batch = IngestionBatch(
            batch_id=str(uuid.uuid4()),
            wallet_addresses=wallet_addresses,
            start_date=start_date,
            end_date=end_date,
            max_transactions=self.max_transactions_per_wallet
        )
        
        logger.info(
            "Starting scheduled ingestion",
            wallet_count=len(wallet_addresses),
            lookback_hours=lookback_hours,
            start_date=start_date.isoformat(),
            end_date=end_date.isoformat(),
            batch_id=batch.batch_id
        )
        
        # Initialize if needed
        await self.initialize()
        
        try:
            # Process the batch
            results = await self.process_batch(batch)
            
            # Log summary statistics
            logger.info(
                "Scheduled ingestion completed",
                batch_id=batch.batch_id,
                results=self.get_statistics(),
                retry_stats=self.retry_session.get_statistics()
            )
            
            return results
            
        finally:
            # Don't close client here as it might be reused
            pass
    
    def get_statistics(self) -> Dict[str, any]:
        """Get current processing statistics"""
        return {
            **self.stats,
            'average_processing_time_per_wallet': (
                self.stats['processing_time_seconds'] / max(self.stats['total_wallets_processed'], 1)
            ),
            'swaps_per_wallet_average': (
                self.stats['total_swaps_extracted'] / max(self.stats['total_wallets_processed'], 1)
            )
        }


# Global worker instance
_worker_instance: Optional[DataIngestionWorker] = None


def get_ingestion_worker() -> DataIngestionWorker:
    """Get global ingestion worker instance"""
    global _worker_instance
    
    if _worker_instance is None:
        _worker_instance = DataIngestionWorker()
    
    return _worker_instance


async def run_ingestion_for_wallets(
    wallet_addresses: List[str],
    lookback_hours: int = None
) -> Dict[str, WalletIngestionStatus]:
    """
    Convenience function to run ingestion for a list of wallets
    
    Args:
        wallet_addresses: List of wallet addresses to process
        lookback_hours: Hours to look back for transactions
        
    Returns:
        Processing results for each wallet
    """
    worker = get_ingestion_worker()
    return await worker.run_scheduled_ingestion(wallet_addresses, lookback_hours)