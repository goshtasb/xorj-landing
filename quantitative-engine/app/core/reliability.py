"""
XORJ Quantitative Engine - NFR-1: Reliability
Fault-tolerant processing engine ensuring single wallet errors don't terminate entire runs
"""

import asyncio
import traceback
from typing import Dict, List, Optional, Callable, Any, TypeVar, Generic
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
import contextlib
from concurrent.futures import ThreadPoolExecutor, as_completed
import structlog

from ..core.logging import get_reliability_logger

logger = get_reliability_logger()

T = TypeVar('T')
R = TypeVar('R')


class ProcessingStatus(Enum):
    """Status of individual wallet processing"""
    PENDING = "pending"
    PROCESSING = "processing"
    SUCCESS = "success"
    FAILED = "failed"
    RETRIED = "retried"
    SKIPPED = "skipped"


@dataclass
class ProcessingResult(Generic[T]):
    """Result of individual wallet processing"""
    wallet_address: str
    status: ProcessingStatus
    result: Optional[T] = None
    error: Optional[str] = None
    error_type: Optional[str] = None
    retry_count: int = 0
    processing_time_ms: float = 0
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    
    def __post_init__(self):
        if self.start_time is None:
            self.start_time = datetime.now(timezone.utc)


@dataclass
class BatchProcessingResult(Generic[T]):
    """Results of batch processing operation"""
    total_wallets: int
    successful_wallets: int
    failed_wallets: int
    skipped_wallets: int
    total_retries: int
    processing_time_ms: float
    results: Dict[str, ProcessingResult[T]] = field(default_factory=dict)
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    
    @property
    def success_rate(self) -> float:
        """Calculate success rate as percentage"""
        if self.total_wallets == 0:
            return 0.0
        return (self.successful_wallets / self.total_wallets) * 100
    
    @property
    def errors(self) -> Dict[str, List[str]]:
        """Group errors by type for analysis"""
        error_groups = {}
        for result in self.results.values():
            if result.status == ProcessingStatus.FAILED and result.error_type:
                if result.error_type not in error_groups:
                    error_groups[result.error_type] = []
                error_groups[result.error_type].append(result.wallet_address)
        return error_groups


@dataclass
class ReliabilityConfig:
    """Configuration for fault-tolerant processing"""
    max_retries: int = 3
    retry_delay_seconds: float = 1.0
    retry_backoff_multiplier: float = 2.0
    max_concurrent_wallets: int = 10
    timeout_seconds: Optional[float] = 60.0
    circuit_breaker_threshold: float = 0.5  # If failure rate > 50%, stop processing
    circuit_breaker_window: int = 20  # Check last N wallets for circuit breaker
    continue_on_failure: bool = True
    log_individual_errors: bool = True
    collect_detailed_metrics: bool = True


class CircuitBreakerError(Exception):
    """Raised when circuit breaker trips due to high failure rate"""
    pass


class FaultTolerantProcessor(Generic[T]):
    """
    NFR-1: Fault-tolerant processor for wallet operations
    Ensures single wallet failures don't terminate entire batch operations
    """
    
    def __init__(self, config: ReliabilityConfig = None):
        self.config = config or ReliabilityConfig()
        self.recent_results: List[bool] = []  # For circuit breaker
        logger.info(
            "Initialized fault-tolerant processor",
            max_retries=self.config.max_retries,
            max_concurrent=self.config.max_concurrent_wallets,
            timeout_seconds=self.config.timeout_seconds,
            circuit_breaker_threshold=self.config.circuit_breaker_threshold
        )
    
    async def process_single_wallet(
        self,
        wallet_address: str,
        processor_func: Callable[..., Any],
        *args,
        **kwargs
    ) -> ProcessingResult[T]:
        """
        Process single wallet with fault tolerance and retry logic
        
        Args:
            wallet_address: Wallet address being processed
            processor_func: Async function to process the wallet
            *args, **kwargs: Arguments to pass to processor_func
            
        Returns:
            ProcessingResult with outcome and details
        """
        result = ProcessingResult[T](
            wallet_address=wallet_address,
            status=ProcessingStatus.PENDING
        )
        
        for attempt in range(self.config.max_retries + 1):
            result.status = ProcessingStatus.PROCESSING
            start_time = datetime.now(timezone.utc)
            
            try:
                if self.config.log_individual_errors or attempt == 0:
                    logger.debug(
                        "Processing wallet",
                        wallet=wallet_address,
                        attempt=attempt + 1,
                        max_attempts=self.config.max_retries + 1
                    )
                
                # Apply timeout if configured
                if self.config.timeout_seconds:
                    wallet_result = await asyncio.wait_for(
                        processor_func(wallet_address, *args, **kwargs),
                        timeout=self.config.timeout_seconds
                    )
                else:
                    wallet_result = await processor_func(wallet_address, *args, **kwargs)
                
                # Success!
                end_time = datetime.now(timezone.utc)
                result.result = wallet_result
                result.status = ProcessingStatus.SUCCESS
                result.retry_count = attempt
                result.end_time = end_time
                result.processing_time_ms = (end_time - start_time).total_seconds() * 1000
                
                if attempt > 0:
                    result.status = ProcessingStatus.RETRIED
                    logger.info(
                        "Wallet processing succeeded after retries",
                        wallet=wallet_address,
                        retry_count=attempt,
                        processing_time_ms=result.processing_time_ms
                    )
                
                return result
                
            except asyncio.TimeoutError:
                end_time = datetime.now(timezone.utc)
                error_msg = f"Processing timed out after {self.config.timeout_seconds}s"
                
                if self.config.log_individual_errors:
                    logger.warning(
                        "Wallet processing timeout",
                        wallet=wallet_address,
                        attempt=attempt + 1,
                        timeout_seconds=self.config.timeout_seconds
                    )
                
                if attempt < self.config.max_retries:
                    retry_delay = self.config.retry_delay_seconds * (
                        self.config.retry_backoff_multiplier ** attempt
                    )
                    await asyncio.sleep(retry_delay)
                    continue
                else:
                    result.status = ProcessingStatus.FAILED
                    result.error = error_msg
                    result.error_type = "TimeoutError"
                    result.retry_count = attempt
                    result.end_time = end_time
                    result.processing_time_ms = (end_time - start_time).total_seconds() * 1000
                    
            except Exception as e:
                end_time = datetime.now(timezone.utc)
                error_msg = str(e)
                error_type = type(e).__name__
                
                if self.config.log_individual_errors:
                    logger.error(
                        "Wallet processing error",
                        wallet=wallet_address,
                        attempt=attempt + 1,
                        error=error_msg,
                        error_type=error_type,
                        traceback=traceback.format_exc() if attempt == self.config.max_retries else None
                    )
                
                if attempt < self.config.max_retries:
                    retry_delay = self.config.retry_delay_seconds * (
                        self.config.retry_backoff_multiplier ** attempt
                    )
                    await asyncio.sleep(retry_delay)
                    continue
                else:
                    result.status = ProcessingStatus.FAILED
                    result.error = error_msg
                    result.error_type = error_type
                    result.retry_count = attempt
                    result.end_time = end_time
                    result.processing_time_ms = (end_time - start_time).total_seconds() * 1000
        
        return result
    
    def _check_circuit_breaker(self) -> bool:
        """
        Check if circuit breaker should trip based on recent failure rate
        
        Returns:
            True if processing should continue, False if circuit breaker trips
        """
        if len(self.recent_results) < self.config.circuit_breaker_window:
            return True
        
        recent_window = self.recent_results[-self.config.circuit_breaker_window:]
        failure_rate = 1.0 - (sum(recent_window) / len(recent_window))
        
        if failure_rate > self.config.circuit_breaker_threshold:
            logger.error(
                "Circuit breaker tripped",
                failure_rate=f"{failure_rate:.2%}",
                threshold=f"{self.config.circuit_breaker_threshold:.2%}",
                window_size=self.config.circuit_breaker_window
            )
            return False
        
        return True
    
    async def process_wallet_batch(
        self,
        wallet_addresses: List[str],
        processor_func: Callable[..., Any],
        *args,
        **kwargs
    ) -> BatchProcessingResult[T]:
        """
        Process multiple wallets with fault tolerance
        
        Args:
            wallet_addresses: List of wallet addresses to process
            processor_func: Async function to process each wallet
            *args, **kwargs: Arguments to pass to processor_func
            
        Returns:
            BatchProcessingResult with outcomes for all wallets
        """
        batch_start_time = datetime.now(timezone.utc)
        
        logger.info(
            "Starting fault-tolerant batch processing",
            total_wallets=len(wallet_addresses),
            max_concurrent=self.config.max_concurrent_wallets,
            continue_on_failure=self.config.continue_on_failure
        )
        
        batch_result = BatchProcessingResult[T](
            total_wallets=len(wallet_addresses),
            successful_wallets=0,
            failed_wallets=0,
            skipped_wallets=0,
            total_retries=0,
            processing_time_ms=0,
            start_time=batch_start_time
        )
        
        # Process wallets in concurrent batches
        semaphore = asyncio.Semaphore(self.config.max_concurrent_wallets)
        
        async def process_with_semaphore(wallet: str) -> ProcessingResult[T]:
            async with semaphore:
                # Check circuit breaker before processing
                if not self._check_circuit_breaker() and not self.config.continue_on_failure:
                    return ProcessingResult[T](
                        wallet_address=wallet,
                        status=ProcessingStatus.SKIPPED,
                        error="Circuit breaker tripped - high failure rate detected",
                        error_type="CircuitBreakerError"
                    )
                
                result = await self.process_single_wallet(
                    wallet, processor_func, *args, **kwargs
                )
                
                # Update circuit breaker state
                self.recent_results.append(result.status in [ProcessingStatus.SUCCESS, ProcessingStatus.RETRIED])
                
                # Limit recent results to avoid memory growth
                if len(self.recent_results) > self.config.circuit_breaker_window * 2:
                    self.recent_results = self.recent_results[-self.config.circuit_breaker_window:]
                
                return result
        
        # Create tasks for all wallets
        tasks = [
            process_with_semaphore(wallet) 
            for wallet in wallet_addresses
        ]
        
        # Process all tasks concurrently
        try:
            results = await asyncio.gather(*tasks, return_exceptions=True)
            
            # Process results
            for i, result in enumerate(results):
                wallet = wallet_addresses[i]
                
                if isinstance(result, Exception):
                    # Handle unexpected exceptions from gather
                    result = ProcessingResult[T](
                        wallet_address=wallet,
                        status=ProcessingStatus.FAILED,
                        error=str(result),
                        error_type=type(result).__name__,
                        end_time=datetime.now(timezone.utc)
                    )
                
                batch_result.results[wallet] = result
                
                # Update batch statistics
                if result.status in [ProcessingStatus.SUCCESS, ProcessingStatus.RETRIED]:
                    batch_result.successful_wallets += 1
                elif result.status == ProcessingStatus.FAILED:
                    batch_result.failed_wallets += 1
                elif result.status == ProcessingStatus.SKIPPED:
                    batch_result.skipped_wallets += 1
                
                batch_result.total_retries += result.retry_count
                
        except Exception as e:
            logger.error(
                "Critical error in batch processing",
                error=str(e),
                error_type=type(e).__name__,
                traceback=traceback.format_exc()
            )
            
            # Mark all unprocessed wallets as failed
            for wallet in wallet_addresses:
                if wallet not in batch_result.results:
                    batch_result.results[wallet] = ProcessingResult[T](
                        wallet_address=wallet,
                        status=ProcessingStatus.FAILED,
                        error=f"Batch processing failed: {str(e)}",
                        error_type="BatchProcessingError",
                        end_time=datetime.now(timezone.utc)
                    )
                    batch_result.failed_wallets += 1
        
        batch_end_time = datetime.now(timezone.utc)
        batch_result.end_time = batch_end_time
        batch_result.processing_time_ms = (batch_end_time - batch_start_time).total_seconds() * 1000
        
        # Log batch completion summary
        logger.info(
            "Batch processing completed",
            total_wallets=batch_result.total_wallets,
            successful_wallets=batch_result.successful_wallets,
            failed_wallets=batch_result.failed_wallets,
            skipped_wallets=batch_result.skipped_wallets,
            success_rate=f"{batch_result.success_rate:.2f}%",
            total_retries=batch_result.total_retries,
            processing_time_ms=batch_result.processing_time_ms
        )
        
        if batch_result.failed_wallets > 0 and self.config.collect_detailed_metrics:
            logger.warning(
                "Batch processing had failures",
                error_breakdown=batch_result.errors,
                failed_wallets=batch_result.failed_wallets
            )
        
        return batch_result
    
    def get_health_metrics(self) -> Dict[str, Any]:
        """
        Get health metrics for the fault-tolerant processor
        
        Returns:
            Dictionary with processor health metrics
        """
        recent_success_rate = 0.0
        if self.recent_results:
            recent_success_rate = sum(self.recent_results) / len(self.recent_results)
        
        return {
            "processor_status": "healthy",
            "config": {
                "max_retries": self.config.max_retries,
                "max_concurrent_wallets": self.config.max_concurrent_wallets,
                "timeout_seconds": self.config.timeout_seconds,
                "circuit_breaker_threshold": self.config.circuit_breaker_threshold,
                "continue_on_failure": self.config.continue_on_failure
            },
            "recent_performance": {
                "recent_operations": len(self.recent_results),
                "recent_success_rate": f"{recent_success_rate:.2%}",
                "circuit_breaker_active": not self._check_circuit_breaker()
            },
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
    
    def reset_circuit_breaker(self):
        """Reset circuit breaker state"""
        self.recent_results.clear()
        logger.info("Circuit breaker state reset")


# Global processor instance
_global_processor: Optional[FaultTolerantProcessor] = None


def get_fault_tolerant_processor(config: ReliabilityConfig = None) -> FaultTolerantProcessor:
    """Get global fault-tolerant processor instance"""
    global _global_processor
    
    if _global_processor is None or config is not None:
        _global_processor = FaultTolerantProcessor(config)
    
    return _global_processor


# Utility functions for common operations
async def process_wallets_safely(
    wallet_addresses: List[str],
    processor_func: Callable[..., Any],
    config: ReliabilityConfig = None,
    *args,
    **kwargs
) -> BatchProcessingResult:
    """
    Convenience function for safe wallet processing
    
    Args:
        wallet_addresses: List of wallets to process
        processor_func: Function to process each wallet
        config: Optional reliability configuration
        *args, **kwargs: Arguments for processor function
        
    Returns:
        BatchProcessingResult with all outcomes
    """
    processor = get_fault_tolerant_processor(config)
    return await processor.process_wallet_batch(
        wallet_addresses, processor_func, *args, **kwargs
    )


@contextlib.asynccontextmanager
async def reliable_operation(operation_name: str):
    """
    Context manager for logging reliable operations
    
    Args:
        operation_name: Name of the operation being performed
    """
    start_time = datetime.now(timezone.utc)
    logger.info(f"Starting reliable operation: {operation_name}")
    
    try:
        yield
        end_time = datetime.now(timezone.utc)
        duration_ms = (end_time - start_time).total_seconds() * 1000
        logger.info(
            f"Completed reliable operation: {operation_name}",
            duration_ms=duration_ms
        )
    except Exception as e:
        end_time = datetime.now(timezone.utc)
        duration_ms = (end_time - start_time).total_seconds() * 1000
        logger.error(
            f"Failed reliable operation: {operation_name}",
            error=str(e),
            error_type=type(e).__name__,
            duration_ms=duration_ms
        )
        raise