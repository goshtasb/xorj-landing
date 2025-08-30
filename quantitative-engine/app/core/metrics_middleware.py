"""
XORJ Quantitative Engine - NFR-3: Metrics Middleware
FastAPI middleware for automatic metrics collection and observability
"""

import time
import psutil
import asyncio
from typing import Callable, Dict, Any
from datetime import datetime, timezone
from fastapi import FastAPI, Request, Response
from fastapi.middleware.base import BaseHTTPMiddleware
import structlog

from .observability import get_metrics_collector, observe_operation, MetricsCollector
from .logging import get_metrics_logger

logger = get_metrics_logger()


class MetricsMiddleware(BaseHTTPMiddleware):
    """
    NFR-3: FastAPI middleware for automatic observability metrics collection
    """
    
    def __init__(self, app: FastAPI, metrics_collector: MetricsCollector = None):
        super().__init__(app)
        self.metrics_collector = metrics_collector or get_metrics_collector()
        self.start_time = datetime.now(timezone.utc)
        
        # Start system metrics collection
        self._system_metrics_task = None
        self._start_system_monitoring()
        
        logger.info("Metrics middleware initialized")
    
    def _start_system_monitoring(self):
        """Start background task for system metrics collection"""
        async def collect_system_metrics():
            while True:
                try:
                    # Collect system metrics
                    memory_usage_mb = psutil.virtual_memory().used / (1024 * 1024)
                    cpu_usage_percent = psutil.cpu_percent(interval=1)
                    
                    self.metrics_collector.record_system_metrics(memory_usage_mb, cpu_usage_percent)
                    
                    # Sleep for 30 seconds before next collection
                    await asyncio.sleep(30)
                    
                except Exception as e:
                    logger.error("Error collecting system metrics", error=str(e))
                    await asyncio.sleep(60)  # Wait longer on error
        
        # Schedule the system metrics collection
        try:
            loop = asyncio.get_event_loop()
            self._system_metrics_task = loop.create_task(collect_system_metrics())
        except RuntimeError:
            # No event loop running yet, will start later
            pass
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """Process request and collect metrics"""
        start_time = time.time()
        
        # Extract request information
        method = request.method
        path = request.url.path
        
        # Normalize path for metrics (remove dynamic segments)
        normalized_path = self._normalize_path(path)
        
        response = None
        status_code = 500  # Default to error
        
        try:
            # Process the request
            response = await call_next(request)
            status_code = response.status_code
            
        except Exception as e:
            # Record error metrics
            error_type = type(e).__name__
            self.metrics_collector.record_error(error_type.lower(), "api")
            
            logger.error(
                "API request error",
                method=method,
                path=path,
                error=str(e),
                error_type=error_type
            )
            raise
            
        finally:
            # Calculate request duration
            duration_seconds = time.time() - start_time
            
            # Record API metrics
            self.metrics_collector.record_api_request(
                method=method,
                endpoint=normalized_path,
                status_code=status_code,
                duration_seconds=duration_seconds
            )
            
            # Log request details
            logger.info(
                "API request completed",
                method=method,
                path=path,
                status_code=status_code,
                duration_ms=round(duration_seconds * 1000, 2)
            )
        
        return response
    
    def _normalize_path(self, path: str) -> str:
        """Normalize API paths for consistent metrics"""
        # Remove query parameters
        if '?' in path:
            path = path.split('?')[0]
        
        # Replace dynamic segments with placeholders
        # This is a simple implementation - can be enhanced based on routing patterns
        path_parts = path.split('/')
        normalized_parts = []
        
        for part in path_parts:
            # Replace wallet addresses (typically long alphanumeric strings)
            if len(part) > 20 and part.isalnum():
                normalized_parts.append('{wallet_address}')
            # Replace UUIDs
            elif len(part) == 36 and '-' in part:
                normalized_parts.append('{id}')
            # Replace numeric IDs
            elif part.isdigit():
                normalized_parts.append('{id}')
            else:
                normalized_parts.append(part)
        
        return '/'.join(normalized_parts)


class HealthMetricsCollector:
    """
    Collects health metrics from various application components
    """
    
    def __init__(self, metrics_collector: MetricsCollector = None):
        self.metrics_collector = metrics_collector or get_metrics_collector()
        self.component_health = {}
        
    async def collect_component_health(self, app: FastAPI):
        """Collect health status from all application components"""
        try:
            # Import here to avoid circular imports
            from ..calculation.service import get_calculation_service
            from ..scoring.service import get_scoring_service
            from ..ingestion.solana_client import get_helius_client
            
            health_status = {}
            
            # Check calculation service
            try:
                calc_service = await get_calculation_service()
                calc_health = await calc_service.get_calculation_health()
                health_status['calculation'] = calc_health.get('calculation_service') == 'healthy'
            except Exception as e:
                health_status['calculation'] = False
                logger.warning("Calculation service health check failed", error=str(e))
            
            # Check scoring service
            try:
                scoring_service = await get_scoring_service()
                scoring_health = await scoring_service.get_scoring_health()
                health_status['scoring'] = scoring_health.get('scoring_service') == 'healthy'
            except Exception as e:
                health_status['scoring'] = False
                logger.warning("Scoring service health check failed", error=str(e))
            
            # Check Solana client
            try:
                solana_client = await get_helius_client()
                solana_health = await solana_client.get_health_status()
                health_status['solana'] = solana_health.get('healthy', False)
            except Exception as e:
                health_status['solana'] = False
                logger.warning("Solana client health check failed", error=str(e))
            
            # Record health metrics
            for service_name, is_healthy in health_status.items():
                self.metrics_collector.record_service_health(service_name, is_healthy)
                self.component_health[service_name] = is_healthy
            
            logger.debug("Component health metrics updated", health=health_status)
            
        except Exception as e:
            logger.error("Failed to collect component health", error=str(e))
    
    def get_overall_health(self) -> bool:
        """Get overall application health status"""
        if not self.component_health:
            return False
        
        # Application is healthy if majority of components are healthy
        healthy_count = sum(1 for healthy in self.component_health.values() if healthy)
        total_count = len(self.component_health)
        
        return healthy_count >= (total_count * 0.6)  # 60% threshold


def create_metrics_endpoints(app: FastAPI, metrics_collector: MetricsCollector = None):
    """
    Add observability endpoints to FastAPI application
    """
    collector = metrics_collector or get_metrics_collector()
    health_collector = HealthMetricsCollector(collector)
    
    @app.get("/metrics", include_in_schema=False)
    async def prometheus_metrics():
        """Prometheus metrics endpoint"""
        metrics_data = collector.get_prometheus_metrics()
        return Response(
            content=metrics_data,
            media_type="text/plain; version=0.0.4; charset=utf-8"
        )
    
    @app.get("/metrics/summary", include_in_schema=False)
    async def metrics_summary():
        """Human-readable metrics summary"""
        return collector.get_metrics_summary()
    
    @app.get("/health/metrics", include_in_schema=False)
    async def health_with_metrics():
        """Health endpoint that also updates health metrics"""
        await health_collector.collect_component_health(app)
        
        overall_health = health_collector.get_overall_health()
        
        return {
            "healthy": overall_health,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "components": health_collector.component_health,
            "metrics": {
                "total_wallets_processed": collector._current_metrics.total_wallets_processed,
                "trust_scores_calculated": collector._current_metrics.trust_scores_calculated,
                "total_errors": (
                    collector._current_metrics.calculation_errors +
                    collector._current_metrics.network_errors +
                    collector._current_metrics.timeout_errors
                )
            }
        }
    
    @app.get("/debug/metrics", include_in_schema=False)
    async def debug_metrics():
        """Debug endpoint for detailed metrics information"""
        return {
            "current_metrics": collector.get_current_metrics().__dict__,
            "prometheus_enabled": collector.enable_prometheus,
            "datadog_enabled": collector.enable_datadog,
            "system_info": {
                "memory_usage_mb": psutil.virtual_memory().used / (1024 * 1024),
                "cpu_usage_percent": psutil.cpu_percent(),
                "disk_usage_percent": psutil.disk_usage('/').percent
            },
            "uptime_seconds": (datetime.now(timezone.utc) - collector._current_metrics.timestamp).total_seconds()
        }
    
    logger.info("Observability endpoints created", endpoints=["/metrics", "/metrics/summary", "/health/metrics", "/debug/metrics"])


def setup_observability(app: FastAPI) -> MetricsCollector:
    """
    Setup complete observability for FastAPI application
    
    Args:
        app: FastAPI application instance
        
    Returns:
        MetricsCollector instance
    """
    # Get metrics collector
    metrics_collector = get_metrics_collector()
    
    # Add metrics middleware
    app.add_middleware(MetricsMiddleware, metrics_collector=metrics_collector)
    
    # Create metrics endpoints
    create_metrics_endpoints(app, metrics_collector)
    
    # Start metrics server (Prometheus)
    try:
        from .observability import start_metrics_server
        start_metrics_server(port=8001)
        logger.info("Observability setup completed", prometheus_port=8001)
    except Exception as e:
        logger.warning("Failed to start metrics server", error=str(e))
    
    return metrics_collector


# Decorator for observing specific operations
def observe_async_operation(operation_name: str, **labels):
    """Decorator for observing async operations with metrics"""
    def decorator(func):
        async def wrapper(*args, **kwargs):
            collector = get_metrics_collector()
            
            with observe_operation(collector, operation_name, **labels):
                return await func(*args, **kwargs)
        
        return wrapper
    return decorator