"""
XORJ Quantitative Engine - Celery Worker Configuration
Configures Celery for scheduled data ingestion tasks
"""

import asyncio
from datetime import datetime, timedelta
from typing import Dict, List, Optional
from celery import Celery
from celery.schedules import crontab

from .core.config import get_settings
from .core.logging import get_worker_logger, CorrelationContext
from .core.reliability import get_fault_tolerant_processor, ReliabilityConfig, reliable_operation
from .core.observability import get_metrics_collector
from .ingestion.worker import run_ingestion_for_wallets
from .schemas.ingestion import WalletIngestionStatus

settings = get_settings()
logger = get_worker_logger()
metrics_collector = get_metrics_collector()

# Initialize Celery app
celery_app = Celery(
    "xorj-quantitative-engine",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=["app.worker"]
)

# Configure Celery
celery_app.conf.update(settings.celery_config)

# Configure periodic tasks
celery_app.conf.beat_schedule = {
    'scheduled-data-ingestion': {
        'task': 'app.worker.run_scheduled_data_ingestion',
        'schedule': crontab(minute=0, hour=f'*/{settings.ingestion_schedule_hours}'),  # Every N hours
        'options': {
            'expires': 60 * 60 * 2,  # Task expires after 2 hours
            'retry': True,
            'retry_policy': {
                'max_retries': 3,
                'interval_start': 0,
                'interval_step': 0.2,
                'interval_max': 0.2,
            }
        }
    },
    
    'health-check': {
        'task': 'app.worker.health_check',
        'schedule': crontab(minute='*/5'),  # Every 5 minutes
        'options': {
            'expires': 60 * 5,  # Expires after 5 minutes
        }
    }
}

# Configure timezone
celery_app.conf.timezone = 'UTC'


async def get_monitored_wallets() -> List[str]:
    """
    Get list of wallet addresses to monitor from live mainnet discovery
    Uses the fixed trader discovery service to find active Raydium traders
    
    Returns:
        List of wallet addresses to monitor
    """
    try:
        from .blockchain.trader_discovery_fixed import get_fixed_trader_discovery
        
        # Discover traders from live mainnet data
        discovery = await get_fixed_trader_discovery()
        discovered_traders = await discovery.discover_top_traders(limit=20)
        
        if discovered_traders:
            # Extract wallet addresses from discovery results
            wallet_addresses = [trader["wallet_address"] for trader in discovered_traders]
            
            logger.info(
                "Retrieved monitored wallets from mainnet discovery",
                wallet_count=len(wallet_addresses),
                discovered_count=len(discovered_traders)
            )
            
            return wallet_addresses
        else:
            logger.warning("No traders discovered from mainnet, using fallback")
            # Return existing known wallet as fallback
            return ["5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1"]
            
    except Exception as e:
        logger.error(f"Error discovering monitored wallets: {e}")
        # Return existing known wallet as fallback
        return ["5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1"]


async def process_single_wallet_ingestion(wallet_address: str, lookback_hours: int = None) -> WalletIngestionStatus:
    """
    NFR-1: Fault-tolerant single wallet ingestion
    Processes one wallet and returns its status without affecting other wallets
    
    Args:
        wallet_address: Wallet to process
        lookback_hours: Hours of data to ingest
    
    Returns:
        WalletIngestionStatus for this specific wallet
    """
    try:
        # Run ingestion for single wallet
        results = await run_ingestion_for_wallets(
            [wallet_address],
            lookback_hours=lookback_hours
        )
        
        # Return the result for this wallet
        return results.get(wallet_address, WalletIngestionStatus(
            wallet_address=wallet_address,
            success=False,
            errors=["No result returned from ingestion worker"]
        ))
        
    except Exception as e:
        logger.error(
            "Failed to process wallet ingestion",
            wallet=wallet_address,
            error=str(e),
            error_type=type(e).__name__
        )
        
        return WalletIngestionStatus(
            wallet_address=wallet_address,
            success=False,
            errors=[f"Processing error: {str(e)}"]
        )


@celery_app.task(bind=True, name="app.worker.run_scheduled_data_ingestion")
def run_scheduled_data_ingestion(self, wallet_addresses: Optional[List[str]] = None):
    """
    Celery task for scheduled data ingestion
    Runs every N hours as configured in settings
    
    Args:
        wallet_addresses: Optional list of specific wallets to process
                         If None, will fetch from monitoring configuration
    
    Returns:
        Dictionary with ingestion results
    """
    task_id = self.request.id
    start_time = datetime.utcnow()
    
    with CorrelationContext(task_id=task_id, task_type="scheduled_ingestion"):
        logger.info(
            "Starting scheduled data ingestion task",
            task_id=task_id,
            start_time=start_time.isoformat(),
            custom_wallets=bool(wallet_addresses)
        )
        
        try:
            # Get wallets to monitor
            if not wallet_addresses:
                wallet_addresses = get_monitored_wallets()
            
            if not wallet_addresses:
                logger.warning("No wallet addresses to process")
                return {
                    "success": False,
                    "error": "No wallet addresses configured for monitoring",
                    "processed_wallets": 0,
                    "task_id": task_id
                }
            
            # NFR-1: Use fault-tolerant processing
            # Configure reliability settings for production workloads
            reliability_config = ReliabilityConfig(
                max_retries=2,
                retry_delay_seconds=5.0,
                max_concurrent_wallets=5,
                timeout_seconds=120.0,  # 2 minutes per wallet
                circuit_breaker_threshold=0.8,  # Stop if >80% failure rate
                continue_on_failure=True
            )
            
            # Since Celery tasks can't be async, we need to run async code in event loop
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            
            try:
                async def run_ingestion():
                    async with reliable_operation("scheduled_data_ingestion"):
                        # Use fault-tolerant processor
                        processor = get_fault_tolerant_processor(reliability_config)
                        batch_result = await processor.process_wallet_batch(
                            wallet_addresses,
                            process_single_wallet_ingestion,
                            lookback_hours=settings.ingestion_schedule_hours
                        )
                        return batch_result
                
                batch_result = loop.run_until_complete(run_ingestion())
                
                # Extract results from fault-tolerant wrapper
                results = {}
                for wallet, proc_result in batch_result.results.items():
                    if proc_result.result:
                        results[wallet] = proc_result.result
                    else:
                        # Create failure status
                        results[wallet] = WalletIngestionStatus(
                            wallet_address=wallet,
                            success=False,
                            errors=[proc_result.error or "Unknown processing error"]
                        )
            finally:
                loop.close()
            
            # Process results
            successful_wallets = sum(1 for status in results.values() if status.success)
            total_swaps = sum(status.valid_swaps_extracted for status in results.values())
            total_errors = sum(len(status.errors) for status in results.values())
            
            end_time = datetime.utcnow()
            duration = (end_time - start_time).total_seconds()
            
            # NFR-3: Record operational metrics
            metrics_collector.record_batch_processing(duration, len(results), successful_wallets)
            
            # Record wallet processing metrics
            for wallet, status in results.items():
                metrics_collector.record_wallet_processing(duration / len(results), status.success)
                if not status.success:
                    # Record errors
                    for error in status.errors:
                        if "timeout" in error.lower():
                            metrics_collector.record_error("timeout", "ingestion")
                        elif "network" in error.lower() or "connection" in error.lower():
                            metrics_collector.record_error("network", "ingestion")
                        else:
                            metrics_collector.record_error("calculation", "ingestion")
            
            # Log completion
            logger.info(
                "Completed scheduled data ingestion task",
                task_id=task_id,
                duration_seconds=duration,
                processed_wallets=len(results),
                successful_wallets=successful_wallets,
                total_swaps_extracted=total_swaps,
                total_errors=total_errors,
                success_rate=f"{successful_wallets/len(results):.2%}" if results else "0%"
            )
            
            # Return summary
            return {
                "success": True,
                "task_id": task_id,
                "start_time": start_time.isoformat(),
                "end_time": end_time.isoformat(),
                "duration_seconds": duration,
                "processed_wallets": len(results),
                "successful_wallets": successful_wallets,
                "total_swaps_extracted": total_swaps,
                "total_errors": total_errors,
                "wallet_results": {
                    wallet: {
                        "success": status.success,
                        "transactions_found": status.total_transactions_found,
                        "swaps_extracted": status.valid_swaps_extracted,
                        "errors": len(status.errors)
                    }
                    for wallet, status in results.items()
                }
            }
            
        except Exception as e:
            end_time = datetime.utcnow()
            duration = (end_time - start_time).total_seconds()
            
            logger.error(
                "Scheduled data ingestion task failed",
                task_id=task_id,
                error=str(e),
                error_type=type(e).__name__,
                duration_seconds=duration
            )
            
            # Raise to trigger Celery retry if configured
            raise self.retry(
                exc=e,
                countdown=60,  # Retry after 1 minute
                max_retries=3
            )


@celery_app.task(bind=True, name="app.worker.process_wallet_batch")
def process_wallet_batch(
    self, 
    wallet_addresses: List[str], 
    start_date: Optional[str] = None,
    end_date: Optional[str] = None
):
    """
    Celery task for processing a specific batch of wallets
    Can be triggered manually or by other systems
    
    Args:
        wallet_addresses: List of wallet addresses to process
        start_date: Optional start date (ISO format string)
        end_date: Optional end date (ISO format string)
    
    Returns:
        Dictionary with processing results
    """
    task_id = self.request.id
    start_time = datetime.utcnow()
    
    with CorrelationContext(task_id=task_id, task_type="wallet_batch"):
        logger.info(
            "Starting wallet batch processing task",
            task_id=task_id,
            wallet_count=len(wallet_addresses),
            start_date=start_date,
            end_date=end_date
        )
        
        try:
            # Parse dates if provided
            start_dt = datetime.fromisoformat(start_date.replace('Z', '+00:00')) if start_date else None
            end_dt = datetime.fromisoformat(end_date.replace('Z', '+00:00')) if end_date else None
            
            # Calculate lookback hours if no start date
            lookback_hours = None
            if start_dt and not end_dt:
                end_dt = datetime.utcnow()
            if start_dt and end_dt:
                lookback_hours = int((end_dt - start_dt).total_seconds() / 3600)
            
            # NFR-1: Use fault-tolerant processing for batch operations too
            reliability_config = ReliabilityConfig(
                max_retries=2,
                retry_delay_seconds=3.0,
                max_concurrent_wallets=8,
                timeout_seconds=90.0,
                circuit_breaker_threshold=0.7,
                continue_on_failure=True
            )
            
            # Run the processing
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            
            try:
                async def run_batch_processing():
                    async with reliable_operation("wallet_batch_processing"):
                        processor = get_fault_tolerant_processor(reliability_config)
                        batch_result = await processor.process_wallet_batch(
                            wallet_addresses,
                            process_single_wallet_ingestion,
                            lookback_hours=lookback_hours
                        )
                        return batch_result
                
                batch_result = loop.run_until_complete(run_batch_processing())
                
                # Extract results from fault-tolerant wrapper
                results = {}
                for wallet, proc_result in batch_result.results.items():
                    if proc_result.result:
                        results[wallet] = proc_result.result
                    else:
                        results[wallet] = WalletIngestionStatus(
                            wallet_address=wallet,
                            success=False,
                            errors=[proc_result.error or "Unknown processing error"]
                        )
            finally:
                loop.close()
            
            # Calculate metrics
            successful_wallets = sum(1 for status in results.values() if status.success)
            total_swaps = sum(status.valid_swaps_extracted for status in results.values())
            
            end_time = datetime.utcnow()
            duration = (end_time - start_time).total_seconds()
            
            logger.info(
                "Completed wallet batch processing task",
                task_id=task_id,
                duration_seconds=duration,
                successful_wallets=successful_wallets,
                total_swaps=total_swaps
            )
            
            return {
                "success": True,
                "task_id": task_id,
                "duration_seconds": duration,
                "processed_wallets": len(results),
                "successful_wallets": successful_wallets,
                "total_swaps_extracted": total_swaps,
                "results": {
                    wallet: {
                        "success": status.success,
                        "swaps_extracted": status.valid_swaps_extracted,
                        "errors": len(status.errors)
                    }
                    for wallet, status in results.items()
                }
            }
            
        except Exception as e:
            end_time = datetime.utcnow()
            duration = (end_time - start_time).total_seconds()
            
            logger.error(
                "Wallet batch processing task failed",
                task_id=task_id,
                error=str(e),
                duration_seconds=duration
            )
            
            raise self.retry(exc=e, countdown=60, max_retries=3)


@celery_app.task(name="app.worker.health_check")
def health_check():
    """
    Health check task that runs periodically
    Monitors system health and logs status
    
    Returns:
        Health status information
    """
    try:
        # Basic health checks
        current_time = datetime.utcnow()
        
        # Check Redis connectivity (Celery broker)
        redis_healthy = True
        try:
            # This will fail if Redis is not accessible
            celery_app.control.inspect().stats()
        except Exception:
            redis_healthy = False
        
        # Check if we can get monitored wallets
        wallets_accessible = True
        try:
            wallets = get_monitored_wallets()
            wallets_accessible = len(wallets) > 0
        except Exception:
            wallets_accessible = False
        
        health_status = {
            "timestamp": current_time.isoformat(),
            "healthy": redis_healthy and wallets_accessible,
            "redis_healthy": redis_healthy,
            "wallets_accessible": wallets_accessible,
            "monitored_wallet_count": len(get_monitored_wallets()) if wallets_accessible else 0
        }
        
        if health_status["healthy"]:
            logger.debug("Health check passed", **health_status)
        else:
            logger.warning("Health check failed", **health_status)
        
        return health_status
        
    except Exception as e:
        logger.error(
            "Health check task failed",
            error=str(e),
            error_type=type(e).__name__
        )
        
        return {
            "timestamp": datetime.utcnow().isoformat(),
            "healthy": False,
            "error": str(e)
        }


# Celery signal handlers
@celery_app.task(bind=True)
def debug_task(self):
    """Debug task for testing Celery configuration"""
    logger.info(f'Request: {self.request!r}')
    return {
        "task_id": self.request.id,
        "message": "Debug task completed successfully",
        "timestamp": datetime.utcnow().isoformat(),
        "settings": {
            "broker": celery_app.conf.broker_url,
            "backend": celery_app.conf.result_backend,
            "timezone": celery_app.conf.timezone
        }
    }


# Task routing and queue configuration
celery_app.conf.task_routes = {
    'app.worker.run_scheduled_data_ingestion': {'queue': 'ingestion'},
    'app.worker.process_wallet_batch': {'queue': 'ingestion'},
    'app.worker.health_check': {'queue': 'monitoring'},
    'app.worker.debug_task': {'queue': 'testing'},
}

# Configure queues
celery_app.conf.task_default_queue = 'default'
celery_app.conf.task_queues = {
    'ingestion': {
        'exchange': 'ingestion',
        'routing_key': 'ingestion',
    },
    'monitoring': {
        'exchange': 'monitoring', 
        'routing_key': 'monitoring',
    },
    'testing': {
        'exchange': 'testing',
        'routing_key': 'testing',
    }
}


if __name__ == '__main__':
    # This allows running the worker directly with: python -m app.worker
    celery_app.start()