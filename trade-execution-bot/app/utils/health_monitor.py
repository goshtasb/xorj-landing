"""
Health Monitoring System
Tracks system health metrics and provides health scores
"""

import asyncio
import logging
from datetime import datetime, timedelta
from typing import Dict, Any, Optional
from dataclasses import dataclass
import psutil

@dataclass
class HealthMetric:
    """Health metric data point"""
    name: str
    value: float
    status: str  # "healthy", "warning", "critical"
    timestamp: datetime
    threshold_warning: float
    threshold_critical: float

class HealthMonitor:
    """System health monitoring and scoring"""
    
    def __init__(self):
        self.logger = logging.getLogger(__name__)
        self.metrics: Dict[str, HealthMetric] = {}
        self.monitoring_active = False
        self.monitoring_task: Optional[asyncio.Task] = None
        
        # Health thresholds
        self.thresholds = {
            "cpu_usage": {"warning": 80.0, "critical": 95.0},
            "memory_usage": {"warning": 85.0, "critical": 95.0},
            "disk_usage": {"warning": 90.0, "critical": 98.0},
            "response_time": {"warning": 1000.0, "critical": 5000.0},  # milliseconds
            "error_rate": {"warning": 5.0, "critical": 10.0},  # percentage
        }
    
    async def initialize(self):
        """Initialize health monitoring"""
        self.logger.info("🏥 Initializing Health Monitor")
        await self.update_system_metrics()
        self.start_monitoring()
    
    async def shutdown(self):
        """Shutdown health monitoring"""
        self.logger.info("🛑 Shutting down Health Monitor")
        self.stop_monitoring()
    
    def start_monitoring(self):
        """Start continuous health monitoring"""
        if not self.monitoring_active:
            self.monitoring_active = True
            self.monitoring_task = asyncio.create_task(self._monitoring_loop())
            self.logger.info("📊 Health monitoring started")
    
    def stop_monitoring(self):
        """Stop health monitoring"""
        self.monitoring_active = False
        if self.monitoring_task:
            self.monitoring_task.cancel()
            self.logger.info("🛑 Health monitoring stopped")
    
    async def _monitoring_loop(self):
        """Continuous monitoring loop"""
        while self.monitoring_active:
            try:
                await self.update_system_metrics()
                await asyncio.sleep(30)  # Update every 30 seconds
            except asyncio.CancelledError:
                break
            except Exception as e:
                self.logger.error(f"Health monitoring error: {e}")
                await asyncio.sleep(60)  # Back off on error
    
    async def update_system_metrics(self):
        """Update system health metrics"""
        try:
            # CPU Usage
            cpu_percent = psutil.cpu_percent(interval=1)
            self._update_metric("cpu_usage", cpu_percent, "%")
            
            # Memory Usage
            memory = psutil.virtual_memory()
            self._update_metric("memory_usage", memory.percent, "%")
            
            # Disk Usage
            disk = psutil.disk_usage("/")
            disk_percent = (disk.used / disk.total) * 100
            self._update_metric("disk_usage", disk_percent, "%")
            
            # Network connectivity (simplified)
            self._update_metric("network_connectivity", 100.0, "%")
            
        except Exception as e:
            self.logger.error(f"Failed to update system metrics: {e}")
    
    def _update_metric(self, name: str, value: float, unit: str):
        """Update a health metric"""
        threshold_config = self.thresholds.get(name, {"warning": 80.0, "critical": 90.0})
        
        # Determine status
        if value >= threshold_config["critical"]:
            status = "critical"
        elif value >= threshold_config["warning"]:
            status = "warning"
        else:
            status = "healthy"
        
        # Store metric
        self.metrics[name] = HealthMetric(
            name=name,
            value=value,
            status=status,
            timestamp=datetime.now(),
            threshold_warning=threshold_config["warning"],
            threshold_critical=threshold_config["critical"]
        )
    
    async def get_health_score(self) -> float:
        """Calculate overall health score (0-100)"""
        if not self.metrics:
            return 50.0  # Default score when no metrics
        
        total_score = 0.0
        metric_count = 0
        
        # Weight different metrics
        weights = {
            "cpu_usage": 0.25,
            "memory_usage": 0.25,
            "disk_usage": 0.15,
            "network_connectivity": 0.20,
            "response_time": 0.10,
            "error_rate": 0.05
        }
        
        for name, metric in self.metrics.items():
            weight = weights.get(name, 0.1)
            
            if metric.status == "healthy":
                score = 100.0
            elif metric.status == "warning":
                score = 70.0
            else:  # critical
                score = 30.0
            
            total_score += score * weight
            metric_count += weight
        
        # Normalize score
        if metric_count > 0:
            return min(100.0, max(0.0, total_score / metric_count))
        
        return 50.0
    
    async def get_health_status(self) -> Dict[str, Any]:
        """Get comprehensive health status"""
        health_score = await self.get_health_score()
        
        # Determine overall status
        if health_score >= 90:
            overall_status = "excellent"
        elif health_score >= 75:
            overall_status = "good"
        elif health_score >= 50:
            overall_status = "fair"
        else:
            overall_status = "poor"
        
        # Get issues
        issues = []
        warnings = []
        
        for name, metric in self.metrics.items():
            if metric.status == "critical":
                issues.append(f"{name}: {metric.value:.1f} (critical threshold: {metric.threshold_critical})")
            elif metric.status == "warning":
                warnings.append(f"{name}: {metric.value:.1f} (warning threshold: {metric.threshold_warning})")
        
        return {
            "health_score": health_score,
            "overall_status": overall_status,
            "metrics": {name: {
                "value": metric.value,
                "status": metric.status,
                "timestamp": metric.timestamp.isoformat()
            } for name, metric in self.metrics.items()},
            "issues": issues,
            "warnings": warnings,
            "last_updated": datetime.now().isoformat()
        }
    
    def record_response_time(self, response_time_ms: float):
        """Record API response time"""
        self._update_metric("response_time", response_time_ms, "ms")
    
    def record_error(self):
        """Record an error occurrence"""
        # Simple error rate tracking (could be more sophisticated)
        current_error_rate = self.metrics.get("error_rate", HealthMetric(
            "error_rate", 0.0, "healthy", datetime.now(), 5.0, 10.0
        )).value
        
        # Increment error rate (simplified)
        new_error_rate = min(100.0, current_error_rate + 1.0)
        self._update_metric("error_rate", new_error_rate, "%")
    
    async def check_circuit_breaker_health(self, circuit_states: Dict[str, Dict]) -> float:
        """Check circuit breaker health contribution"""
        if not circuit_states:
            return 100.0
        
        healthy_breakers = sum(1 for state in circuit_states.values() 
                             if state.get("status") == "closed")
        total_breakers = len(circuit_states)
        
        if total_breakers == 0:
            return 100.0
        
        health_percentage = (healthy_breakers / total_breakers) * 100
        self._update_metric("circuit_breaker_health", health_percentage, "%")
        
        return health_percentage