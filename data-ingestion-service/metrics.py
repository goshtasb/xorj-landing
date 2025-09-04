"""
Success Metrics for XORJ On-Chain Data Ingestion Service
Section 7: Success Metrics - PRD Implementation
"""

import time
import json
from typing import Dict, Any, Optional
from datetime import datetime, timezone
from dataclasses import dataclass, asdict
import structlog

logger = structlog.get_logger(__name__)

@dataclass
class JobMetrics:
    """Metrics for individual fetch jobs"""
    job_id: str
    wallet_address: str
    started_at: float
    completed_at: Optional[float] = None
    failed_at: Optional[float] = None
    transactions_fetched: int = 0
    api_calls_made: int = 0
    total_processing_time: Optional[float] = None
    helius_response_time: Optional[float] = None
    database_write_time: Optional[float] = None
    error_message: Optional[str] = None

class MetricsCollector:
    """
    Section 7: Success Metrics Implementation
    Tracks performance, reliability, and operational metrics
    """
    
    def __init__(self):
        self.job_metrics: Dict[str, JobMetrics] = {}
        self.service_start_time = time.time()
        logger.info("Metrics collector initialized")
    
    # 7.1 Performance Metrics
    def start_job_timing(self, job_id: str, wallet_address: str) -> JobMetrics:
        """Start timing a new fetch job"""
        metrics = JobMetrics(
            job_id=job_id,
            wallet_address=wallet_address,
            started_at=time.time()
        )
        self.job_metrics[job_id] = metrics
        
        logger.debug("Job timing started", 
                    job_id=job_id, 
                    wallet_address=wallet_address[:10] + "...")
        return metrics
    
    def record_job_completion(self, job_id: str, transactions_fetched: int, 
                            api_calls_made: int = 1, 
                            helius_response_time: Optional[float] = None,
                            database_write_time: Optional[float] = None):
        """Record successful job completion with performance metrics"""
        if job_id not in self.job_metrics:
            logger.warning("Attempted to complete unknown job", job_id=job_id)
            return
        
        metrics = self.job_metrics[job_id]
        metrics.completed_at = time.time()
        metrics.transactions_fetched = transactions_fetched
        metrics.api_calls_made = api_calls_made
        metrics.helius_response_time = helius_response_time
        metrics.database_write_time = database_write_time
        metrics.total_processing_time = metrics.completed_at - metrics.started_at
        
        logger.info("Job completion recorded",
                   job_id=job_id,
                   processing_time=metrics.total_processing_time,
                   transactions_fetched=transactions_fetched,
                   api_calls=api_calls_made)
    
    def record_job_failure(self, job_id: str, error_message: str):
        """Record job failure"""
        if job_id not in self.job_metrics:
            logger.warning("Attempted to fail unknown job", job_id=job_id)
            return
        
        metrics = self.job_metrics[job_id]
        metrics.failed_at = time.time()
        metrics.error_message = error_message
        metrics.total_processing_time = metrics.failed_at - metrics.started_at
        
        logger.info("Job failure recorded",
                   job_id=job_id,
                   processing_time=metrics.total_processing_time,
                   error=error_message)
    
    # 7.2 Reliability Metrics
    def get_success_rate(self, time_window_hours: int = 24) -> float:
        """Calculate success rate over time window"""
        cutoff_time = time.time() - (time_window_hours * 3600)
        
        total_jobs = 0
        successful_jobs = 0
        
        for metrics in self.job_metrics.values():
            if metrics.started_at >= cutoff_time:
                total_jobs += 1
                if metrics.completed_at is not None:
                    successful_jobs += 1
        
        if total_jobs == 0:
            return 1.0  # No jobs = 100% success rate
        
        success_rate = successful_jobs / total_jobs
        logger.debug("Success rate calculated",
                    time_window_hours=time_window_hours,
                    success_rate=success_rate,
                    successful_jobs=successful_jobs,
                    total_jobs=total_jobs)
        
        return success_rate
    
    def get_error_rate(self, time_window_hours: int = 24) -> float:
        """Calculate error rate over time window"""
        return 1.0 - self.get_success_rate(time_window_hours)
    
    # 7.3 Operational Metrics
    def get_average_processing_time(self, time_window_hours: int = 24) -> Optional[float]:
        """Calculate average processing time for completed jobs"""
        cutoff_time = time.time() - (time_window_hours * 3600)
        
        processing_times = []
        for metrics in self.job_metrics.values():
            if (metrics.started_at >= cutoff_time and 
                metrics.completed_at is not None and 
                metrics.total_processing_time is not None):
                processing_times.append(metrics.total_processing_time)
        
        if not processing_times:
            return None
        
        avg_time = sum(processing_times) / len(processing_times)
        logger.debug("Average processing time calculated",
                    avg_processing_time=avg_time,
                    sample_size=len(processing_times))
        
        return avg_time
    
    def get_total_transactions_processed(self, time_window_hours: int = 24) -> int:
        """Get total transactions processed in time window"""
        cutoff_time = time.time() - (time_window_hours * 3600)
        
        total_transactions = 0
        for metrics in self.job_metrics.values():
            if (metrics.started_at >= cutoff_time and 
                metrics.completed_at is not None):
                total_transactions += metrics.transactions_fetched
        
        logger.debug("Total transactions calculated",
                    total_transactions=total_transactions,
                    time_window_hours=time_window_hours)
        
        return total_transactions
    
    # 7.4 Service Health Metrics
    def get_service_uptime(self) -> float:
        """Get service uptime in seconds"""
        return time.time() - self.service_start_time
    
    def get_comprehensive_metrics(self) -> Dict[str, Any]:
        """Get comprehensive metrics report"""
        uptime = self.get_service_uptime()
        
        metrics_report = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "service_uptime_seconds": uptime,
            "service_uptime_hours": uptime / 3600,
            
            # Performance Metrics (7.1)
            "performance": {
                "average_processing_time_seconds": self.get_average_processing_time(24),
                "total_jobs_24h": len([m for m in self.job_metrics.values() 
                                     if m.started_at >= time.time() - 86400]),
                "total_transactions_processed_24h": self.get_total_transactions_processed(24),
            },
            
            # Reliability Metrics (7.2)
            "reliability": {
                "success_rate_24h": self.get_success_rate(24),
                "error_rate_24h": self.get_error_rate(24),
                "success_rate_1h": self.get_success_rate(1),
                "error_rate_1h": self.get_error_rate(1),
            },
            
            # Operational Metrics (7.3)
            "operational": {
                "jobs_in_progress": len([m for m in self.job_metrics.values() 
                                       if m.completed_at is None and m.failed_at is None]),
                "total_jobs_completed": len([m for m in self.job_metrics.values() 
                                           if m.completed_at is not None]),
                "total_jobs_failed": len([m for m in self.job_metrics.values() 
                                        if m.failed_at is not None]),
            }
        }
        
        logger.info("Comprehensive metrics generated", **metrics_report["reliability"])
        return metrics_report

# Global metrics collector
_metrics_collector: Optional[MetricsCollector] = None

def get_metrics_collector() -> MetricsCollector:
    """Get or create global metrics collector"""
    global _metrics_collector
    if _metrics_collector is None:
        _metrics_collector = MetricsCollector()
    return _metrics_collector