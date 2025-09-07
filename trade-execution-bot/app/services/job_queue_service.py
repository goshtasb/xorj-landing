"""
Redis-based Job Queue Service for XORJ Trading Bot.

This service provides a production-ready job queue system for autonomous trading operations.
It manages trade execution jobs, scheduling, retry logic, and job prioritization.

Key Features:
- Redis-based persistent job queue
- Priority job scheduling  
- Automatic retry with exponential backoff
- Job status tracking and monitoring
- Integration with background trading service
- Production-ready error handling
"""

import asyncio
import json
import time
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Any, Callable
from dataclasses import dataclass, asdict
from enum import Enum
import uuid

import structlog
import redis.asyncio as redis
from app.core.config import get_config

logger = structlog.get_logger(__name__)


class JobStatus(Enum):
    """Job status enumeration."""
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    RETRYING = "retrying"
    CANCELLED = "cancelled"


class JobPriority(Enum):
    """Job priority enumeration (lower number = higher priority)."""
    CRITICAL = 1
    HIGH = 2
    NORMAL = 3
    LOW = 4
    BACKGROUND = 5


@dataclass
class TradingJob:
    """Trading job data structure."""
    job_id: str
    job_type: str  # 'execute_trade', 'sync_portfolio', 'health_check', etc.
    wallet_address: str
    priority: int
    payload: Dict[str, Any]
    created_at: datetime
    scheduled_at: datetime
    status: str = JobStatus.PENDING.value
    retry_count: int = 0
    max_retries: int = 3
    last_error: Optional[str] = None
    processing_started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert job to dictionary for JSON serialization."""
        data = asdict(self)
        # Convert datetime objects to ISO strings
        for key, value in data.items():
            if isinstance(value, datetime):
                data[key] = value.isoformat()
        return data
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'TradingJob':
        """Create job from dictionary."""
        # Convert ISO strings back to datetime objects
        datetime_fields = ['created_at', 'scheduled_at', 'processing_started_at', 'completed_at']
        for field in datetime_fields:
            if data.get(field) and isinstance(data[field], str):
                data[field] = datetime.fromisoformat(data[field])
        return cls(**data)


class JobQueueService:
    """
    Redis-based job queue service for autonomous trading operations.
    
    Provides high-performance job queuing with priority scheduling,
    retry logic, and comprehensive monitoring.
    """
    
    def __init__(self):
        self.config = get_config()
        self.redis_client: Optional[redis.Redis] = None
        
        # Queue configuration
        self.queue_key = "xorj:trading_jobs"
        self.processing_key = "xorj:processing_jobs"
        self.completed_key = "xorj:completed_jobs"
        self.failed_key = "xorj:failed_jobs"
        self.job_data_key = "xorj:job_data"
        
        # Service state
        self.is_running = False
        self.worker_tasks: List[asyncio.Task] = []
        self.job_processors: Dict[str, Callable] = {}
        
        # Performance metrics
        self.jobs_processed = 0
        self.jobs_failed = 0
        self.start_time = datetime.now(timezone.utc)
        
        logger.info("Job Queue Service initialized")
    
    async def initialize(self) -> bool:
        """Initialize the job queue service."""
        try:
            logger.info("Initializing Job Queue Service")
            
            # Connect to Redis
            redis_url = getattr(self.config, 'redis_url', 'redis://localhost:6379')
            self.redis_client = redis.from_url(redis_url, decode_responses=True)
            
            # Test connection
            await self.redis_client.ping()
            logger.info("Redis connection established", redis_url=redis_url)
            
            # Register job processors
            self._register_job_processors()
            
            logger.info("Job Queue Service initialized successfully")
            return True
            
        except Exception as e:
            logger.critical(
                "Failed to initialize Job Queue Service",
                error=str(e),
                error_type=type(e).__name__
            )
            return False
    
    def _register_job_processors(self):
        """Register job processing functions."""
        self.job_processors = {
            "execute_trade": self._process_trade_execution_job,
            "sync_portfolio": self._process_portfolio_sync_job,
            "health_check": self._process_health_check_job,
            "user_session_start": self._process_session_start_job,
            "user_session_stop": self._process_session_stop_job,
            "risk_assessment": self._process_risk_assessment_job,
        }
        
        logger.info(
            "Job processors registered",
            processor_count=len(self.job_processors),
            job_types=list(self.job_processors.keys())
        )
    
    async def start_workers(self, worker_count: int = 3):
        """Start job processing workers."""
        if self.is_running:
            logger.warning("Job queue workers are already running")
            return
        
        self.is_running = True
        logger.info("Starting job queue workers", worker_count=worker_count)
        
        # Start worker tasks
        for i in range(worker_count):
            worker_task = asyncio.create_task(self._worker_loop(f"worker_{i}"))
            self.worker_tasks.append(worker_task)
        
        # Start job cleanup task
        cleanup_task = asyncio.create_task(self._cleanup_loop())
        self.worker_tasks.append(cleanup_task)
        
        logger.info("Job queue workers started successfully")
    
    async def stop_workers(self):
        """Stop job processing workers."""
        if not self.is_running:
            return
        
        logger.info("Stopping job queue workers")
        self.is_running = False
        
        # Cancel all worker tasks
        for task in self.worker_tasks:
            if not task.done():
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass
        
        self.worker_tasks.clear()
        
        # Close Redis connection
        if self.redis_client:
            await self.redis_client.close()
        
        logger.info("Job queue workers stopped")
    
    async def enqueue_job(
        self,
        job_type: str,
        wallet_address: str,
        payload: Dict[str, Any],
        priority: JobPriority = JobPriority.NORMAL,
        schedule_delay: Optional[timedelta] = None
    ) -> str:
        """Enqueue a new job."""
        try:
            # Create job
            job_id = str(uuid.uuid4())
            now = datetime.now(timezone.utc)
            scheduled_at = now + (schedule_delay or timedelta(0))
            
            job = TradingJob(
                job_id=job_id,
                job_type=job_type,
                wallet_address=wallet_address,
                priority=priority.value,
                payload=payload,
                created_at=now,
                scheduled_at=scheduled_at
            )
            
            # Store job data
            await self.redis_client.hset(
                self.job_data_key,
                job_id,
                json.dumps(job.to_dict())
            )
            
            # Add to priority queue
            score = priority.value * 1000000 + int(scheduled_at.timestamp())
            await self.redis_client.zadd(self.queue_key, {job_id: score})
            
            logger.info(
                "Job enqueued",
                job_id=job_id,
                job_type=job_type,
                wallet_address=wallet_address[:10] + "...",
                priority=priority.name,
                scheduled_at=scheduled_at.isoformat()
            )
            
            return job_id
            
        except Exception as e:
            logger.error(
                "Failed to enqueue job",
                job_type=job_type,
                wallet_address=wallet_address,
                error=str(e)
            )
            raise
    
    async def get_job_status(self, job_id: str) -> Optional[Dict[str, Any]]:
        """Get job status and details."""
        try:
            job_data = await self.redis_client.hget(self.job_data_key, job_id)
            if not job_data:
                return None
            
            return json.loads(job_data)
            
        except Exception as e:
            logger.error("Failed to get job status", job_id=job_id, error=str(e))
            return None
    
    async def cancel_job(self, job_id: str) -> bool:
        """Cancel a pending job."""
        try:
            # Remove from queue
            removed = await self.redis_client.zrem(self.queue_key, job_id)
            
            if removed:
                # Update job status
                job_data = await self.redis_client.hget(self.job_data_key, job_id)
                if job_data:
                    job_dict = json.loads(job_data)
                    job_dict['status'] = JobStatus.CANCELLED.value
                    await self.redis_client.hset(
                        self.job_data_key,
                        job_id,
                        json.dumps(job_dict)
                    )
                
                logger.info("Job cancelled", job_id=job_id)
                return True
            
            return False
            
        except Exception as e:
            logger.error("Failed to cancel job", job_id=job_id, error=str(e))
            return False
    
    async def _worker_loop(self, worker_id: str):
        """Main worker loop for processing jobs."""
        logger.info("Worker started", worker_id=worker_id)
        
        while self.is_running:
            try:
                # Get next job from priority queue
                job_ids = await self.redis_client.zrangebyscore(
                    self.queue_key,
                    0,
                    int(time.time()) * 1000000 + 999999,  # Include all jobs up to now
                    start=0,
                    num=1
                )
                
                if not job_ids:
                    # No jobs available, wait
                    await asyncio.sleep(1)
                    continue
                
                job_id = job_ids[0]
                
                # Try to claim the job (atomic operation)
                removed = await self.redis_client.zrem(self.queue_key, job_id)
                if not removed:
                    # Another worker got this job
                    continue
                
                # Move to processing queue
                await self.redis_client.sadd(self.processing_key, job_id)
                
                # Process the job
                await self._process_job(job_id, worker_id)
                
                # Remove from processing queue
                await self.redis_client.srem(self.processing_key, job_id)
                
            except asyncio.CancelledError:
                logger.info("Worker cancelled", worker_id=worker_id)
                break
                
            except Exception as e:
                logger.error(
                    "Worker error",
                    worker_id=worker_id,
                    error=str(e)
                )
                await asyncio.sleep(5)
        
        logger.info("Worker stopped", worker_id=worker_id)
    
    async def _process_job(self, job_id: str, worker_id: str):
        """Process a single job."""
        try:
            # Get job data
            job_data = await self.redis_client.hget(self.job_data_key, job_id)
            if not job_data:
                logger.error("Job data not found", job_id=job_id)
                return
            
            job = TradingJob.from_dict(json.loads(job_data))
            
            logger.info(
                "Processing job",
                job_id=job_id,
                job_type=job.job_type,
                worker_id=worker_id,
                wallet_address=job.wallet_address[:10] + "..."
            )
            
            # Update job status
            job.status = JobStatus.PROCESSING.value
            job.processing_started_at = datetime.now(timezone.utc)
            await self._update_job_data(job)
            
            # Get job processor
            processor = self.job_processors.get(job.job_type)
            if not processor:
                raise ValueError(f"No processor found for job type: {job.job_type}")
            
            # Execute job processor
            await processor(job)
            
            # Mark job as completed
            job.status = JobStatus.COMPLETED.value
            job.completed_at = datetime.now(timezone.utc)
            await self._update_job_data(job)
            
            # Move to completed queue
            await self.redis_client.sadd(self.completed_key, job_id)
            
            self.jobs_processed += 1
            
            logger.info(
                "Job completed successfully",
                job_id=job_id,
                job_type=job.job_type,
                worker_id=worker_id,
                duration_seconds=(job.completed_at - job.processing_started_at).total_seconds()
            )
            
        except Exception as e:
            await self._handle_job_failure(job_id, str(e))
            self.jobs_failed += 1
    
    async def _handle_job_failure(self, job_id: str, error_message: str):
        """Handle job processing failure."""
        try:
            job_data = await self.redis_client.hget(self.job_data_key, job_id)
            if not job_data:
                return
            
            job = TradingJob.from_dict(json.loads(job_data))
            job.retry_count += 1
            job.last_error = error_message
            
            if job.retry_count < job.max_retries:
                # Schedule for retry with exponential backoff
                delay_seconds = min(300, 30 * (2 ** (job.retry_count - 1)))  # Max 5 minutes
                job.scheduled_at = datetime.now(timezone.utc) + timedelta(seconds=delay_seconds)
                job.status = JobStatus.RETRYING.value
                
                await self._update_job_data(job)
                
                # Re-enqueue with delay
                score = job.priority * 1000000 + int(job.scheduled_at.timestamp())
                await self.redis_client.zadd(self.queue_key, {job_id: score})
                
                logger.warning(
                    "Job scheduled for retry",
                    job_id=job_id,
                    retry_count=job.retry_count,
                    delay_seconds=delay_seconds,
                    error=error_message
                )
            else:
                # Max retries exceeded, mark as failed
                job.status = JobStatus.FAILED.value
                job.completed_at = datetime.now(timezone.utc)
                await self._update_job_data(job)
                
                # Move to failed queue
                await self.redis_client.sadd(self.failed_key, job_id)
                
                logger.error(
                    "Job failed after max retries",
                    job_id=job_id,
                    retry_count=job.retry_count,
                    error=error_message
                )
                
        except Exception as e:
            logger.error(
                "Failed to handle job failure",
                job_id=job_id,
                error=str(e)
            )
    
    async def _update_job_data(self, job: TradingJob):
        """Update job data in Redis."""
        await self.redis_client.hset(
            self.job_data_key,
            job.job_id,
            json.dumps(job.to_dict())
        )
    
    async def _cleanup_loop(self):
        """Clean up old completed and failed jobs."""
        logger.info("Job cleanup loop started")
        
        while self.is_running:
            try:
                cutoff_time = datetime.now(timezone.utc) - timedelta(hours=24)
                cutoff_timestamp = cutoff_time.timestamp()
                
                # Clean up completed jobs older than 24 hours
                completed_jobs = await self.redis_client.smembers(self.completed_key)
                cleaned_completed = 0
                
                for job_id in completed_jobs:
                    job_data = await self.redis_client.hget(self.job_data_key, job_id)
                    if job_data:
                        job_dict = json.loads(job_data)
                        if job_dict.get('completed_at'):
                            completed_at = datetime.fromisoformat(job_dict['completed_at'])
                            if completed_at.timestamp() < cutoff_timestamp:
                                await self.redis_client.srem(self.completed_key, job_id)
                                await self.redis_client.hdel(self.job_data_key, job_id)
                                cleaned_completed += 1
                
                # Clean up failed jobs older than 24 hours
                failed_jobs = await self.redis_client.smembers(self.failed_key)
                cleaned_failed = 0
                
                for job_id in failed_jobs:
                    job_data = await self.redis_client.hget(self.job_data_key, job_id)
                    if job_data:
                        job_dict = json.loads(job_data)
                        if job_dict.get('completed_at'):
                            completed_at = datetime.fromisoformat(job_dict['completed_at'])
                            if completed_at.timestamp() < cutoff_timestamp:
                                await self.redis_client.srem(self.failed_key, job_id)
                                await self.redis_client.hdel(self.job_data_key, job_id)
                                cleaned_failed += 1
                
                if cleaned_completed > 0 or cleaned_failed > 0:
                    logger.info(
                        "Job cleanup completed",
                        cleaned_completed=cleaned_completed,
                        cleaned_failed=cleaned_failed
                    )
                
                # Sleep for 1 hour
                await asyncio.sleep(3600)
                
            except asyncio.CancelledError:
                logger.info("Job cleanup loop cancelled")
                break
                
            except Exception as e:
                logger.error("Job cleanup error", error=str(e))
                await asyncio.sleep(3600)
    
    # Job Processors
    
    async def _process_trade_execution_job(self, job: TradingJob):
        """Process trade execution job."""
        logger.info(
            "Executing trade job",
            job_id=job.job_id,
            wallet_address=job.wallet_address[:10] + "...",
            payload=job.payload
        )
        
        # Simulate trade execution
        await asyncio.sleep(2)  # Simulate processing time
        
        # Here you would implement actual trade execution logic
        # For now, we'll just log the operation
        
        logger.info(
            "Trade execution completed",
            job_id=job.job_id,
            wallet_address=job.wallet_address[:10] + "..."
        )
    
    async def _process_portfolio_sync_job(self, job: TradingJob):
        """Process portfolio synchronization job."""
        logger.info(
            "Syncing portfolio",
            job_id=job.job_id,
            wallet_address=job.wallet_address[:10] + "..."
        )
        
        # Simulate portfolio sync
        await asyncio.sleep(1)
        
        logger.info(
            "Portfolio sync completed",
            job_id=job.job_id,
            wallet_address=job.wallet_address[:10] + "..."
        )
    
    async def _process_health_check_job(self, job: TradingJob):
        """Process health check job."""
        logger.info("Processing health check job", job_id=job.job_id)
        
        # Simulate health check
        await asyncio.sleep(0.5)
        
        logger.info("Health check completed", job_id=job.job_id)
    
    async def _process_session_start_job(self, job: TradingJob):
        """Process user session start job."""
        logger.info(
            "Starting user session",
            job_id=job.job_id,
            wallet_address=job.wallet_address[:10] + "..."
        )
        
        # Simulate session start
        await asyncio.sleep(1)
        
        logger.info(
            "User session started",
            job_id=job.job_id,
            wallet_address=job.wallet_address[:10] + "..."
        )
    
    async def _process_session_stop_job(self, job: TradingJob):
        """Process user session stop job."""
        logger.info(
            "Stopping user session",
            job_id=job.job_id,
            wallet_address=job.wallet_address[:10] + "..."
        )
        
        # Simulate session stop
        await asyncio.sleep(0.5)
        
        logger.info(
            "User session stopped",
            job_id=job.job_id,
            wallet_address=job.wallet_address[:10] + "..."
        )
    
    async def _process_risk_assessment_job(self, job: TradingJob):
        """Process risk assessment job."""
        logger.info(
            "Processing risk assessment",
            job_id=job.job_id,
            wallet_address=job.wallet_address[:10] + "..."
        )
        
        # Simulate risk assessment
        await asyncio.sleep(3)
        
        logger.info(
            "Risk assessment completed",
            job_id=job.job_id,
            wallet_address=job.wallet_address[:10] + "..."
        )
    
    def get_queue_status(self) -> Dict[str, Any]:
        """Get current queue status and metrics."""
        uptime = datetime.now(timezone.utc) - self.start_time
        
        return {
            "service_name": "JobQueueService",
            "is_running": self.is_running,
            "worker_count": len(self.worker_tasks),
            "uptime_seconds": uptime.total_seconds(),
            "jobs_processed": self.jobs_processed,
            "jobs_failed": self.jobs_failed,
            "success_rate": self.jobs_processed / max(self.jobs_processed + self.jobs_failed, 1),
            "registered_job_types": list(self.job_processors.keys())
        }


# Global service instance
_job_queue_service: Optional[JobQueueService] = None


def get_job_queue_service() -> JobQueueService:
    """Get the global job queue service instance."""
    global _job_queue_service
    if _job_queue_service is None:
        _job_queue_service = JobQueueService()
    return _job_queue_service