"""
XORJ Quantitative Engine - NFR-3: Observability
Comprehensive metrics export to Prometheus and Datadog monitoring systems
"""

import time
import asyncio
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional, Any, Union
from dataclasses import dataclass, field
from enum import Enum
import threading
from collections import defaultdict, deque
from contextlib import contextmanager
import structlog

try:
    from prometheus_client import (
        Counter, Histogram, Gauge, Summary, Info,
        CollectorRegistry, generate_latest, CONTENT_TYPE_LATEST,
        start_http_server
    )
    PROMETHEUS_AVAILABLE = True
except ImportError:
    PROMETHEUS_AVAILABLE = False

try:
    from datadog import initialize, statsd
    DATADOG_AVAILABLE = True
except ImportError:
    DATADOG_AVAILABLE = False

from ..core.logging import get_metrics_logger
from ..core.config import get_settings

logger = get_metrics_logger()
settings = get_settings()


class MetricType(Enum):
    """Types of metrics we can collect"""
    COUNTER = "counter"
    GAUGE = "gauge"
    HISTOGRAM = "histogram"
    SUMMARY = "summary"
    INFO = "info"


@dataclass
class MetricDefinition:
    """Definition of a metric"""
    name: str
    metric_type: MetricType
    description: str
    labels: List[str] = field(default_factory=list)
    buckets: Optional[List[float]] = None  # For histograms


@dataclass
class OperationalMetrics:
    """Container for operational metrics values"""
    # Processing metrics
    total_wallets_processed: int = 0
    successful_wallets: int = 0
    failed_wallets: int = 0
    processing_time_seconds: float = 0.0
    
    # Scoring metrics
    trust_scores_calculated: int = 0
    eligible_wallets: int = 0
    average_trust_score: float = 0.0
    
    # Error metrics
    calculation_errors: int = 0
    network_errors: int = 0
    timeout_errors: int = 0
    
    # Performance metrics
    api_response_time_ms: float = 0.0
    database_query_time_ms: float = 0.0
    memory_usage_mb: float = 0.0
    cpu_usage_percent: float = 0.0
    
    # Business metrics
    total_volume_usd: float = 0.0
    total_profit_usd: float = 0.0
    total_trades_analyzed: int = 0
    
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


class MetricsCollector:
    """
    NFR-3: Core metrics collector for operational observability
    Supports both Prometheus and Datadog backends
    """
    
    def __init__(self, enable_prometheus: bool = True, enable_datadog: bool = True):
        self.enable_prometheus = enable_prometheus and PROMETHEUS_AVAILABLE
        self.enable_datadog = enable_datadog and DATADOG_AVAILABLE
        
        # Prometheus setup
        if self.enable_prometheus:
            self.registry = CollectorRegistry()
            self._init_prometheus_metrics()
        
        # Datadog setup
        if self.enable_datadog:
            self._init_datadog()
        
        # Internal metrics storage
        self._metrics_buffer = deque(maxlen=1000)
        self._current_metrics = OperationalMetrics()
        self._lock = threading.Lock()
        
        logger.info(
            "Metrics collector initialized",
            prometheus_enabled=self.enable_prometheus,
            datadog_enabled=self.enable_datadog
        )
    
    def _init_prometheus_metrics(self):
        """Initialize Prometheus metrics"""
        try:
            # Define all metrics
            self.prometheus_metrics = {}
            
            # Processing metrics
            self.prometheus_metrics['wallets_processed_total'] = Counter(
                'xorj_wallets_processed_total',
                'Total number of wallets processed',
                ['status'],  # success, failed
                registry=self.registry
            )
            
            self.prometheus_metrics['wallet_processing_duration_seconds'] = Histogram(
                'xorj_wallet_processing_duration_seconds',
                'Time spent processing individual wallets',
                buckets=[0.1, 0.5, 1.0, 2.0, 5.0, 10.0, 30.0, 60.0, 120.0],
                registry=self.registry
            )
            
            self.prometheus_metrics['batch_processing_duration_seconds'] = Histogram(
                'xorj_batch_processing_duration_seconds',
                'Time spent processing wallet batches',
                buckets=[1.0, 5.0, 10.0, 30.0, 60.0, 300.0, 600.0, 1800.0],
                registry=self.registry
            )
            
            # Scoring metrics
            self.prometheus_metrics['trust_scores_calculated_total'] = Counter(
                'xorj_trust_scores_calculated_total',
                'Total number of trust scores calculated',
                registry=self.registry
            )
            
            self.prometheus_metrics['trust_score_distribution'] = Histogram(
                'xorj_trust_score_distribution',
                'Distribution of trust scores',
                buckets=[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
                registry=self.registry
            )
            
            self.prometheus_metrics['wallet_eligibility_total'] = Counter(
                'xorj_wallet_eligibility_total',
                'Wallet eligibility outcomes',
                ['status'],  # eligible, insufficient_trades, insufficient_data, etc.
                registry=self.registry
            )
            
            # Error metrics
            self.prometheus_metrics['errors_total'] = Counter(
                'xorj_errors_total',
                'Total number of errors by type',
                ['error_type', 'component'],
                registry=self.registry
            )
            
            # API metrics
            self.prometheus_metrics['api_requests_total'] = Counter(
                'xorj_api_requests_total',
                'Total number of API requests',
                ['method', 'endpoint', 'status_code'],
                registry=self.registry
            )
            
            self.prometheus_metrics['api_request_duration_seconds'] = Histogram(
                'xorj_api_request_duration_seconds',
                'API request duration',
                ['method', 'endpoint'],
                buckets=[0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0],
                registry=self.registry
            )
            
            # System metrics
            self.prometheus_metrics['memory_usage_bytes'] = Gauge(
                'xorj_memory_usage_bytes',
                'Current memory usage in bytes',
                registry=self.registry
            )
            
            self.prometheus_metrics['cpu_usage_percent'] = Gauge(
                'xorj_cpu_usage_percent',
                'Current CPU usage percentage',
                registry=self.registry
            )
            
            # Business metrics
            self.prometheus_metrics['total_volume_usd'] = Gauge(
                'xorj_total_volume_usd',
                'Total trading volume in USD',
                registry=self.registry
            )
            
            self.prometheus_metrics['total_profit_usd'] = Gauge(
                'xorj_total_profit_usd',
                'Total profit in USD',
                registry=self.registry
            )
            
            self.prometheus_metrics['trades_analyzed_total'] = Counter(
                'xorj_trades_analyzed_total',
                'Total number of trades analyzed',
                registry=self.registry
            )
            
            # Service health
            self.prometheus_metrics['service_health'] = Gauge(
                'xorj_service_health',
                'Service health status (1=healthy, 0=unhealthy)',
                ['service'],
                registry=self.registry
            )
            
            # Information metrics
            self.prometheus_metrics['build_info'] = Info(
                'xorj_build_info',
                'Build information',
                registry=self.registry
            )
            
            # Set build info
            self.prometheus_metrics['build_info'].info({
                'version': settings.version,
                'environment': settings.environment
            })
            
            logger.info("Prometheus metrics initialized", metric_count=len(self.prometheus_metrics))
            
        except Exception as e:
            logger.error("Failed to initialize Prometheus metrics", error=str(e))
            self.enable_prometheus = False
    
    def _init_datadog(self):
        """Initialize Datadog metrics"""
        try:
            if hasattr(settings, 'datadog_api_key') and settings.datadog_api_key:
                initialize(
                    api_key=settings.datadog_api_key,
                    app_key=getattr(settings, 'datadog_app_key', None),
                    statsd_host=getattr(settings, 'datadog_statsd_host', 'localhost'),
                    statsd_port=getattr(settings, 'datadog_statsd_port', 8125)
                )
                logger.info("Datadog metrics initialized")
            else:
                logger.warning("Datadog API key not configured, disabling Datadog metrics")
                self.enable_datadog = False
        except Exception as e:
            logger.error("Failed to initialize Datadog metrics", error=str(e))
            self.enable_datadog = False
    
    def record_wallet_processing(self, processing_time_seconds: float, success: bool):
        """Record wallet processing metrics"""
        status = "success" if success else "failed"
        
        # Prometheus
        if self.enable_prometheus:
            self.prometheus_metrics['wallets_processed_total'].labels(status=status).inc()
            self.prometheus_metrics['wallet_processing_duration_seconds'].observe(processing_time_seconds)
        
        # Datadog
        if self.enable_datadog:
            statsd.increment('xorj.wallets.processed', tags=[f'status:{status}'])
            statsd.histogram('xorj.wallets.processing_duration', processing_time_seconds)
        
        # Update current metrics
        with self._lock:
            self._current_metrics.total_wallets_processed += 1
            if success:
                self._current_metrics.successful_wallets += 1
            else:
                self._current_metrics.failed_wallets += 1
    
    def record_batch_processing(self, processing_time_seconds: float, wallet_count: int, success_count: int):
        """Record batch processing metrics"""
        # Prometheus
        if self.enable_prometheus:
            self.prometheus_metrics['batch_processing_duration_seconds'].observe(processing_time_seconds)
        
        # Datadog
        if self.enable_datadog:
            statsd.histogram('xorj.batch.processing_duration', processing_time_seconds)
            statsd.gauge('xorj.batch.wallet_count', wallet_count)
            statsd.gauge('xorj.batch.success_rate', success_count / wallet_count if wallet_count > 0 else 0)
        
        # Update current metrics
        with self._lock:
            self._current_metrics.processing_time_seconds += processing_time_seconds
    
    def record_trust_score(self, trust_score: float, eligibility_status: str):
        """Record trust score calculation metrics"""
        # Prometheus
        if self.enable_prometheus:
            self.prometheus_metrics['trust_scores_calculated_total'].inc()
            self.prometheus_metrics['trust_score_distribution'].observe(trust_score)
            self.prometheus_metrics['wallet_eligibility_total'].labels(status=eligibility_status).inc()
        
        # Datadog
        if self.enable_datadog:
            statsd.increment('xorj.trust_scores.calculated')
            statsd.histogram('xorj.trust_scores.distribution', trust_score)
            statsd.increment('xorj.eligibility.outcome', tags=[f'status:{eligibility_status}'])
        
        # Update current metrics
        with self._lock:
            self._current_metrics.trust_scores_calculated += 1
            if eligibility_status == "eligible":
                self._current_metrics.eligible_wallets += 1
                # Update running average
                total_scores = self._current_metrics.trust_scores_calculated
                if total_scores > 0:
                    self._current_metrics.average_trust_score = (
                        (self._current_metrics.average_trust_score * (total_scores - 1) + trust_score) / total_scores
                    )
    
    def record_error(self, error_type: str, component: str):
        """Record error metrics"""
        # Prometheus
        if self.enable_prometheus:
            self.prometheus_metrics['errors_total'].labels(error_type=error_type, component=component).inc()
        
        # Datadog
        if self.enable_datadog:
            statsd.increment('xorj.errors.total', tags=[f'error_type:{error_type}', f'component:{component}'])
        
        # Update current metrics
        with self._lock:
            if error_type == "calculation":
                self._current_metrics.calculation_errors += 1
            elif error_type == "network":
                self._current_metrics.network_errors += 1
            elif error_type == "timeout":
                self._current_metrics.timeout_errors += 1
    
    def record_api_request(self, method: str, endpoint: str, status_code: int, duration_seconds: float):
        """Record API request metrics"""
        # Prometheus
        if self.enable_prometheus:
            self.prometheus_metrics['api_requests_total'].labels(
                method=method, endpoint=endpoint, status_code=str(status_code)
            ).inc()
            self.prometheus_metrics['api_request_duration_seconds'].labels(
                method=method, endpoint=endpoint
            ).observe(duration_seconds)
        
        # Datadog
        if self.enable_datadog:
            tags = [f'method:{method}', f'endpoint:{endpoint}', f'status_code:{status_code}']
            statsd.increment('xorj.api.requests', tags=tags)
            statsd.histogram('xorj.api.request_duration', duration_seconds, tags=tags)
        
        # Update current metrics
        with self._lock:
            self._current_metrics.api_response_time_ms = duration_seconds * 1000
    
    def record_business_metrics(self, volume_usd: float, profit_usd: float, trades_count: int):
        """Record business metrics"""
        # Prometheus
        if self.enable_prometheus:
            self.prometheus_metrics['total_volume_usd'].set(volume_usd)
            self.prometheus_metrics['total_profit_usd'].set(profit_usd)
            self.prometheus_metrics['trades_analyzed_total'].inc(trades_count)
        
        # Datadog
        if self.enable_datadog:
            statsd.gauge('xorj.business.volume_usd', volume_usd)
            statsd.gauge('xorj.business.profit_usd', profit_usd)
            statsd.increment('xorj.business.trades_analyzed', trades_count)
        
        # Update current metrics
        with self._lock:
            self._current_metrics.total_volume_usd += volume_usd
            self._current_metrics.total_profit_usd += profit_usd
            self._current_metrics.total_trades_analyzed += trades_count
    
    def record_system_metrics(self, memory_usage_mb: float, cpu_usage_percent: float):
        """Record system resource metrics"""
        # Prometheus
        if self.enable_prometheus:
            self.prometheus_metrics['memory_usage_bytes'].set(memory_usage_mb * 1024 * 1024)
            self.prometheus_metrics['cpu_usage_percent'].set(cpu_usage_percent)
        
        # Datadog
        if self.enable_datadog:
            statsd.gauge('xorj.system.memory_usage_mb', memory_usage_mb)
            statsd.gauge('xorj.system.cpu_usage_percent', cpu_usage_percent)
        
        # Update current metrics
        with self._lock:
            self._current_metrics.memory_usage_mb = memory_usage_mb
            self._current_metrics.cpu_usage_percent = cpu_usage_percent
    
    def record_service_health(self, service_name: str, healthy: bool):
        """Record service health metrics"""
        health_value = 1.0 if healthy else 0.0
        
        # Prometheus
        if self.enable_prometheus:
            self.prometheus_metrics['service_health'].labels(service=service_name).set(health_value)
        
        # Datadog
        if self.enable_datadog:
            statsd.gauge('xorj.service.health', health_value, tags=[f'service:{service_name}'])
    
    def get_current_metrics(self) -> OperationalMetrics:
        """Get current metrics snapshot"""
        with self._lock:
            # Create a copy to avoid race conditions
            return OperationalMetrics(
                total_wallets_processed=self._current_metrics.total_wallets_processed,
                successful_wallets=self._current_metrics.successful_wallets,
                failed_wallets=self._current_metrics.failed_wallets,
                processing_time_seconds=self._current_metrics.processing_time_seconds,
                trust_scores_calculated=self._current_metrics.trust_scores_calculated,
                eligible_wallets=self._current_metrics.eligible_wallets,
                average_trust_score=self._current_metrics.average_trust_score,
                calculation_errors=self._current_metrics.calculation_errors,
                network_errors=self._current_metrics.network_errors,
                timeout_errors=self._current_metrics.timeout_errors,
                api_response_time_ms=self._current_metrics.api_response_time_ms,
                memory_usage_mb=self._current_metrics.memory_usage_mb,
                cpu_usage_percent=self._current_metrics.cpu_usage_percent,
                total_volume_usd=self._current_metrics.total_volume_usd,
                total_profit_usd=self._current_metrics.total_profit_usd,
                total_trades_analyzed=self._current_metrics.total_trades_analyzed,
                timestamp=datetime.now(timezone.utc)
            )
    
    def get_prometheus_metrics(self) -> bytes:
        """Get Prometheus metrics for scraping"""
        if not self.enable_prometheus:
            return b"# Prometheus not available\n"
        
        return generate_latest(self.registry)
    
    def get_metrics_summary(self) -> Dict[str, Any]:
        """Get comprehensive metrics summary"""
        current = self.get_current_metrics()
        
        summary = {
            "timestamp": current.timestamp.isoformat(),
            "processing": {
                "total_wallets_processed": current.total_wallets_processed,
                "successful_wallets": current.successful_wallets,
                "failed_wallets": current.failed_wallets,
                "success_rate": (
                    current.successful_wallets / current.total_wallets_processed 
                    if current.total_wallets_processed > 0 else 0
                ),
                "total_processing_time_seconds": current.processing_time_seconds
            },
            "scoring": {
                "trust_scores_calculated": current.trust_scores_calculated,
                "eligible_wallets": current.eligible_wallets,
                "average_trust_score": current.average_trust_score,
                "eligibility_rate": (
                    current.eligible_wallets / current.trust_scores_calculated
                    if current.trust_scores_calculated > 0 else 0
                )
            },
            "errors": {
                "calculation_errors": current.calculation_errors,
                "network_errors": current.network_errors,
                "timeout_errors": current.timeout_errors,
                "total_errors": (
                    current.calculation_errors + current.network_errors + current.timeout_errors
                )
            },
            "performance": {
                "api_response_time_ms": current.api_response_time_ms,
                "memory_usage_mb": current.memory_usage_mb,
                "cpu_usage_percent": current.cpu_usage_percent
            },
            "business": {
                "total_volume_usd": current.total_volume_usd,
                "total_profit_usd": current.total_profit_usd,
                "total_trades_analyzed": current.total_trades_analyzed,
                "average_profit_per_trade": (
                    current.total_profit_usd / current.total_trades_analyzed
                    if current.total_trades_analyzed > 0 else 0
                )
            },
            "monitoring": {
                "prometheus_enabled": self.enable_prometheus,
                "datadog_enabled": self.enable_datadog,
                "metrics_buffer_size": len(self._metrics_buffer)
            }
        }
        
        return summary
    
    def reset_metrics(self):
        """Reset all metrics (for testing or periodic resets)"""
        with self._lock:
            self._current_metrics = OperationalMetrics()
            self._metrics_buffer.clear()
        
        logger.info("Metrics reset")


@contextmanager
def observe_operation(metrics_collector: MetricsCollector, operation_name: str, **labels):
    """Context manager for timing operations and recording metrics"""
    start_time = time.time()
    success = True
    error_type = None
    
    try:
        yield
    except Exception as e:
        success = False
        error_type = type(e).__name__
        raise
    finally:
        duration = time.time() - start_time
        
        # Record the operation
        if operation_name == "wallet_processing":
            metrics_collector.record_wallet_processing(duration, success)
        elif operation_name == "api_request":
            method = labels.get('method', 'unknown')
            endpoint = labels.get('endpoint', 'unknown')
            status_code = labels.get('status_code', 500 if not success else 200)
            metrics_collector.record_api_request(method, endpoint, status_code, duration)
        
        if not success and error_type:
            component = labels.get('component', 'unknown')
            metrics_collector.record_error(error_type.lower(), component)


class MetricsServer:
    """
    HTTP server for exposing Prometheus metrics endpoint
    """
    
    def __init__(self, metrics_collector: MetricsCollector, port: int = 8001):
        self.metrics_collector = metrics_collector
        self.port = port
        self.server_thread = None
    
    def start(self):
        """Start the metrics server"""
        if not self.metrics_collector.enable_prometheus:
            logger.warning("Prometheus disabled, metrics server not started")
            return
        
        try:
            start_http_server(self.port, registry=self.metrics_collector.registry)
            logger.info(f"Metrics server started on port {self.port}")
        except Exception as e:
            logger.error(f"Failed to start metrics server: {e}")
    
    def get_health(self) -> Dict[str, Any]:
        """Get metrics server health"""
        return {
            "metrics_server": "healthy" if self.metrics_collector.enable_prometheus else "disabled",
            "prometheus_port": self.port,
            "metrics_count": len(self.metrics_collector.prometheus_metrics) if self.metrics_collector.enable_prometheus else 0
        }


# Global metrics collector instance
_global_metrics_collector: Optional[MetricsCollector] = None
_global_metrics_server: Optional[MetricsServer] = None


def get_metrics_collector() -> MetricsCollector:
    """Get global metrics collector instance"""
    global _global_metrics_collector
    
    if _global_metrics_collector is None:
        _global_metrics_collector = MetricsCollector(
            enable_prometheus=getattr(settings, 'enable_prometheus_metrics', True),
            enable_datadog=getattr(settings, 'enable_datadog_metrics', True)
        )
    
    return _global_metrics_collector


def start_metrics_server(port: int = 8001) -> MetricsServer:
    """Start global metrics server"""
    global _global_metrics_server
    
    if _global_metrics_server is None:
        collector = get_metrics_collector()
        _global_metrics_server = MetricsServer(collector, port)
        _global_metrics_server.start()
    
    return _global_metrics_server


def get_metrics_server() -> Optional[MetricsServer]:
    """Get global metrics server instance"""
    return _global_metrics_server