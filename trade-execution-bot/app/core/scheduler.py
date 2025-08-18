"""
Scheduled execution system for XORJ Trade Execution Bot.

Implements FR-1: Scheduled Polling & Strategy Ingestion
- Runs on fixed schedule (configurable, default every 5 minutes)
- Fetches latest ranked traders from Quantitative Engine
- Selects target portfolio based on user risk profile thresholds
- Maintains execution timing and cycle management

Security Features:
- Prevents overlapping executions
- Comprehensive error handling and recovery
- Emergency stop functionality
- Detailed audit logging of all scheduling decisions
"""

import asyncio
import signal
import sys
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any
from dataclasses import dataclass

import structlog
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from apscheduler.triggers.cron import CronTrigger

from app.core.config import get_config
from app.core.system_orchestrator import get_orchestrator, ExecutionCycleResult
from app.logging.audit_logger import get_audit_logger, AuditEventType, AuditSeverity


logger = structlog.get_logger(__name__)


@dataclass
class SchedulingStats:
    """Statistics for scheduled execution monitoring."""
    total_cycles_run: int = 0
    successful_cycles: int = 0
    failed_cycles: int = 0
    last_execution_time: Optional[datetime] = None
    last_execution_duration: Optional[float] = None
    average_execution_duration: float = 0.0
    consecutive_failures: int = 0
    
    @property
    def success_rate(self) -> float:
        """Calculate success rate percentage."""
        if self.total_cycles_run == 0:
            return 0.0
        return (self.successful_cycles / self.total_cycles_run) * 100
    
    @property
    def is_healthy(self) -> bool:
        """Check if scheduler is in healthy state."""
        return (
            self.consecutive_failures < 3 and  # Less than 3 consecutive failures
            (self.total_cycles_run == 0 or self.success_rate >= 95.0)  # 95%+ success rate
        )


class TradeExecutionScheduler:
    """
    Scheduled execution system for XORJ Trade Execution Bot.
    
    Implements FR-1: Scheduled Polling & Strategy Ingestion with:
    - Fixed interval execution (configurable, default 5 minutes)
    - Overlap protection (prevents multiple executions running simultaneously)
    - Comprehensive error handling and recovery
    - Emergency stop functionality
    - Detailed audit logging and monitoring
    """
    
    def __init__(self):
        self.config = get_config()
        self.orchestrator = get_orchestrator()
        self.audit_logger = get_audit_logger()
        
        # Scheduler configuration
        self.scheduler: Optional[AsyncIOScheduler] = None
        self.is_running = False
        self.current_execution_running = False
        self.emergency_stop_active = False
        
        # Execution statistics
        self.stats = SchedulingStats()
        
        # Timing configuration
        self.execution_interval_seconds = self.config.execution_interval_seconds
        self.max_execution_time_seconds = self.config.max_execution_time_seconds
        
        logger.info(
            "Trade Execution Scheduler initialized",
            execution_interval_seconds=self.execution_interval_seconds,
            max_execution_time_seconds=self.max_execution_time_seconds
        )
    
    async def initialize(self) -> bool:
        """
        Initialize the scheduler system.
        
        Returns:
            bool: True if initialization successful
        """
        logger.info("Initializing Trade Execution Scheduler")
        
        try:
            # Initialize system orchestrator
            if not await self.orchestrator.initialize():
                logger.error("Failed to initialize system orchestrator")
                return False
            
            # Create scheduler instance
            self.scheduler = AsyncIOScheduler(
                timezone='UTC',
                job_defaults={
                    'coalesce': True,  # Combine multiple pending executions
                    'max_instances': 1,  # Only one instance of job can run at a time
                    'misfire_grace_time': 30  # 30 seconds grace period
                }
            )
            
            # Add the main execution job
            self.scheduler.add_job(
                func=self._execute_trading_cycle_wrapper,
                trigger=IntervalTrigger(seconds=self.execution_interval_seconds),
                id='main_trading_cycle',
                name='XORJ Trade Execution Cycle',
                replace_existing=True
            )
            
            # Add health monitoring job (every minute)
            self.scheduler.add_job(
                func=self._health_monitoring_cycle,
                trigger=IntervalTrigger(seconds=60),
                id='health_monitoring',
                name='Health Monitoring',
                replace_existing=True
            )
            
            # Set up signal handlers for graceful shutdown
            self._setup_signal_handlers()
            
            logger.info("Trade Execution Scheduler initialized successfully")
            return True
            
        except Exception as e:
            logger.error(
                "Failed to initialize Trade Execution Scheduler",
                error=str(e),
                error_type=type(e).__name__
            )
            return False
    
    def _setup_signal_handlers(self):
        """Set up signal handlers for graceful shutdown."""
        def signal_handler(signum, frame):
            logger.info(
                "Received shutdown signal",
                signal=signum,
                signal_name=signal.Signals(signum).name
            )
            asyncio.create_task(self.shutdown())
        
        signal.signal(signal.SIGINT, signal_handler)
        signal.signal(signal.SIGTERM, signal_handler)
    
    async def start(self):
        """
        Start the scheduled execution system.
        
        This begins the fixed schedule execution as specified in FR-1.
        """
        if self.is_running:
            logger.warning("Scheduler is already running")
            return
        
        logger.info("Starting XORJ Trade Execution Scheduler")
        
        try:
            # Log scheduler start
            await self.audit_logger.log_system_event(
                event_type=AuditEventType.SYSTEM_START,
                severity=AuditSeverity.INFO,
                event_data={
                    "scheduler_started": True,
                    "execution_interval_seconds": self.execution_interval_seconds,
                    "max_execution_time_seconds": self.max_execution_time_seconds,
                    "environment": self.config.environment
                },
                decision_rationale=f"Starting scheduled trade execution every {self.execution_interval_seconds} seconds"
            )
            
            # Start the scheduler
            self.scheduler.start()
            self.is_running = True
            
            logger.info(
                "XORJ Trade Execution Scheduler started successfully",
                next_run_time=self.scheduler.get_job('main_trading_cycle').next_run_time
            )
            
            # Keep the scheduler running
            while self.is_running and not self.emergency_stop_active:
                await asyncio.sleep(1)
                
        except Exception as e:
            logger.error(
                "Error in scheduler main loop",
                error=str(e),
                error_type=type(e).__name__
            )
            await self.emergency_stop()
    
    async def _execute_trading_cycle_wrapper(self):
        """
        Wrapper for trading cycle execution with comprehensive error handling.
        
        This implements the core FR-1 functionality:
        1. Prevents overlapping executions
        2. Enforces maximum execution time
        3. Handles errors gracefully
        4. Updates statistics and monitoring
        """
        if self.current_execution_running:
            logger.warning("Previous trading cycle still running - skipping this execution")
            return
        
        if self.emergency_stop_active:
            logger.warning("Emergency stop active - skipping trading cycle")
            return
        
        self.current_execution_running = True
        execution_start_time = datetime.now(timezone.utc)
        cycle_result: Optional[ExecutionCycleResult] = None
        
        logger.info(
            "Starting scheduled trading cycle",
            execution_number=self.stats.total_cycles_run + 1,
            scheduled_time=execution_start_time.isoformat()
        )
        
        try:
            # Execute trading cycle with timeout
            cycle_result = await asyncio.wait_for(
                self.orchestrator.execute_trading_cycle(),
                timeout=self.max_execution_time_seconds
            )
            
            # Update statistics
            self.stats.total_cycles_run += 1
            self.stats.last_execution_time = execution_start_time
            self.stats.last_execution_duration = cycle_result.duration_seconds
            
            # Update average execution duration
            if self.stats.total_cycles_run == 1:
                self.stats.average_execution_duration = cycle_result.duration_seconds
            else:
                # Rolling average
                self.stats.average_execution_duration = (
                    (self.stats.average_execution_duration * (self.stats.total_cycles_run - 1) + 
                     cycle_result.duration_seconds) / self.stats.total_cycles_run
                )
            
            # Check cycle success
            if cycle_result.success_rate >= 0.95 and len(cycle_result.errors) == 0:
                self.stats.successful_cycles += 1
                self.stats.consecutive_failures = 0
                
                logger.info(
                    "Trading cycle completed successfully",
                    duration_seconds=cycle_result.duration_seconds,
                    trades_executed=cycle_result.trades_executed,
                    success_rate=cycle_result.success_rate
                )
            else:
                self.stats.failed_cycles += 1
                self.stats.consecutive_failures += 1
                
                logger.error(
                    "Trading cycle completed with errors",
                    duration_seconds=cycle_result.duration_seconds,
                    errors_count=len(cycle_result.errors),
                    success_rate=cycle_result.success_rate
                )
                
                # Check if we need to trigger emergency stop
                if self.stats.consecutive_failures >= 5:
                    await self._trigger_emergency_stop("Too many consecutive failures")
        
        except asyncio.TimeoutError:
            error_msg = f"Trading cycle timed out after {self.max_execution_time_seconds} seconds"
            logger.error(error_msg)
            
            self.stats.total_cycles_run += 1
            self.stats.failed_cycles += 1
            self.stats.consecutive_failures += 1
            
            await self.audit_logger.log_error_event(
                error_message=error_msg,
                error_type="execution_timeout",
                severity=AuditSeverity.ERROR
            )
            
        except Exception as e:
            error_msg = f"Critical error in trading cycle execution: {str(e)}"
            logger.critical(
                error_msg,
                error_type=type(e).__name__,
                execution_number=self.stats.total_cycles_run + 1
            )
            
            self.stats.total_cycles_run += 1
            self.stats.failed_cycles += 1
            self.stats.consecutive_failures += 1
            
            await self.audit_logger.log_error_event(
                error_message=error_msg,
                error_type=type(e).__name__,
                severity=AuditSeverity.CRITICAL
            )
            
            # Consider emergency stop for critical errors
            if self.stats.consecutive_failures >= 3:
                await self._trigger_emergency_stop("Critical errors in execution")
        
        finally:
            self.current_execution_running = False
            
            logger.info(
                "Trading cycle execution completed",
                total_cycles_run=self.stats.total_cycles_run,
                success_rate=self.stats.success_rate,
                consecutive_failures=self.stats.consecutive_failures
            )
    
    async def _health_monitoring_cycle(self):
        """
        Periodic health monitoring and system status checks.
        
        Monitors:
        - Execution statistics and success rates
        - System resource utilization
        - Integration health (if needed)
        - Emergency conditions
        """
        try:
            # Check scheduler health
            scheduler_healthy = self.stats.is_healthy
            
            # Log health status
            logger.info(
                "Health monitoring check",
                scheduler_healthy=scheduler_healthy,
                total_cycles=self.stats.total_cycles_run,
                success_rate=self.stats.success_rate,
                consecutive_failures=self.stats.consecutive_failures,
                average_duration=self.stats.average_execution_duration
            )
            
            # Alert if unhealthy
            if not scheduler_healthy:
                logger.warning(
                    "Scheduler health check failed",
                    consecutive_failures=self.stats.consecutive_failures,
                    success_rate=self.stats.success_rate
                )
                
                await self.audit_logger.log_system_event(
                    event_type=AuditEventType.ERROR_EVENT,
                    severity=AuditSeverity.WARNING,
                    event_data={
                        "health_check_failed": True,
                        "consecutive_failures": self.stats.consecutive_failures,
                        "success_rate": self.stats.success_rate,
                        "total_cycles": self.stats.total_cycles_run
                    },
                    decision_rationale="Scheduler health metrics indicate potential issues"
                )
                
        except Exception as e:
            logger.error(
                "Error in health monitoring cycle",
                error=str(e),
                error_type=type(e).__name__
            )
    
    async def _trigger_emergency_stop(self, reason: str):
        """
        Trigger emergency stop due to critical conditions.
        
        Args:
            reason: Reason for emergency stop
        """
        logger.critical(
            "TRIGGERING EMERGENCY STOP",
            reason=reason,
            consecutive_failures=self.stats.consecutive_failures
        )
        
        self.emergency_stop_active = True
        
        await self.audit_logger.log_system_event(
            event_type=AuditEventType.EMERGENCY_STOP,
            severity=AuditSeverity.CRITICAL,
            event_data={
                "emergency_stop_triggered": True,
                "reason": reason,
                "consecutive_failures": self.stats.consecutive_failures,
                "success_rate": self.stats.success_rate,
                "timestamp": datetime.now(timezone.utc).isoformat()
            },
            decision_rationale=f"Emergency stop triggered: {reason}"
        )
    
    def get_status(self) -> Dict[str, Any]:
        """
        Get current scheduler status and statistics.
        
        Returns:
            Dict containing comprehensive status information
        """
        next_run_time = None
        if self.scheduler and self.scheduler.running:
            job = self.scheduler.get_job('main_trading_cycle')
            if job:
                next_run_time = job.next_run_time.isoformat() if job.next_run_time else None
        
        return {
            "is_running": self.is_running,
            "current_execution_running": self.current_execution_running,
            "emergency_stop_active": self.emergency_stop_active,
            "next_run_time": next_run_time,
            "execution_interval_seconds": self.execution_interval_seconds,
            "statistics": {
                "total_cycles_run": self.stats.total_cycles_run,
                "successful_cycles": self.stats.successful_cycles,
                "failed_cycles": self.stats.failed_cycles,
                "success_rate": self.stats.success_rate,
                "consecutive_failures": self.stats.consecutive_failures,
                "last_execution_time": self.stats.last_execution_time.isoformat() if self.stats.last_execution_time else None,
                "last_execution_duration": self.stats.last_execution_duration,
                "average_execution_duration": self.stats.average_execution_duration,
                "is_healthy": self.stats.is_healthy
            }
        }
    
    async def emergency_stop(self):
        """Immediately stop all scheduled execution."""
        logger.critical("EMERGENCY STOP REQUESTED")
        
        await self._trigger_emergency_stop("Manual emergency stop requested")
        await self.shutdown()
    
    async def shutdown(self):
        """
        Gracefully shutdown the scheduler system.
        
        Ensures:
        - Current execution completes if possible
        - All resources are properly cleaned up
        - Audit log entry for shutdown
        """
        logger.info("Shutting down Trade Execution Scheduler")
        
        self.is_running = False
        
        # Wait for current execution to complete (with timeout)
        if self.current_execution_running:
            logger.info("Waiting for current execution to complete...")
            
            wait_time = 0
            max_wait = min(60, self.max_execution_time_seconds)  # Wait up to 60 seconds
            
            while self.current_execution_running and wait_time < max_wait:
                await asyncio.sleep(1)
                wait_time += 1
            
            if self.current_execution_running:
                logger.warning("Current execution did not complete within timeout")
        
        # Shutdown scheduler
        if self.scheduler:
            self.scheduler.shutdown(wait=True)
            logger.info("Scheduler stopped")
        
        # Shutdown orchestrator
        await self.orchestrator.shutdown()
        
        # Log shutdown
        await self.audit_logger.log_system_event(
            event_type=AuditEventType.SYSTEM_STOP,
            severity=AuditSeverity.INFO,
            event_data={
                "scheduler_shutdown": True,
                "final_statistics": {
                    "total_cycles": self.stats.total_cycles_run,
                    "success_rate": self.stats.success_rate,
                    "average_duration": self.stats.average_execution_duration
                }
            },
            decision_rationale="Trade execution scheduler shutting down"
        )
        
        logger.info("Trade Execution Scheduler shutdown complete")


# Global scheduler instance
scheduler: Optional[TradeExecutionScheduler] = None


def get_scheduler() -> TradeExecutionScheduler:
    """Get the global scheduler instance."""
    global scheduler
    if scheduler is None:
        scheduler = TradeExecutionScheduler()
    return scheduler