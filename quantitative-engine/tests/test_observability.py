"""
XORJ Quantitative Engine - Observability Tests
NFR-3: Tests for metrics collection and monitoring system
"""

import pytest
import time
import asyncio
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch, AsyncMock
from typing import Dict, Any

from app.core.observability import (
    MetricsCollector,
    OperationalMetrics,
    MetricType,
    MetricDefinition,
    observe_operation,
    get_metrics_collector
)
from app.core.metrics_middleware import (
    MetricsMiddleware,
    HealthMetricsCollector,
    create_metrics_endpoints,
    setup_observability,
    observe_async_operation
)


class TestOperationalMetrics:
    """Test OperationalMetrics data class"""
    
    def test_operational_metrics_initialization(self):
        """Test default initialization"""
        metrics = OperationalMetrics()
        
        assert metrics.total_wallets_processed == 0
        assert metrics.successful_wallets == 0
        assert metrics.failed_wallets == 0
        assert metrics.processing_time_seconds == 0.0
        assert metrics.trust_scores_calculated == 0
        assert metrics.eligible_wallets == 0
        assert metrics.average_trust_score == 0.0
        assert isinstance(metrics.timestamp, datetime)
    
    def test_operational_metrics_with_values(self):
        """Test initialization with specific values"""
        timestamp = datetime.now(timezone.utc)
        metrics = OperationalMetrics(
            total_wallets_processed=100,
            successful_wallets=85,
            failed_wallets=15,
            processing_time_seconds=120.5,
            trust_scores_calculated=75,
            eligible_wallets=60,
            average_trust_score=72.5,
            timestamp=timestamp
        )
        
        assert metrics.total_wallets_processed == 100
        assert metrics.successful_wallets == 85
        assert metrics.failed_wallets == 15
        assert metrics.processing_time_seconds == 120.5
        assert metrics.trust_scores_calculated == 75
        assert metrics.eligible_wallets == 60
        assert metrics.average_trust_score == 72.5
        assert metrics.timestamp == timestamp


class TestMetricsCollector:
    """Test MetricsCollector class"""
    
    @pytest.fixture
    def collector(self):
        """Create metrics collector for testing"""
        # Mock external dependencies
        with patch('app.core.observability.PROMETHEUS_AVAILABLE', False), \
             patch('app.core.observability.DATADOG_AVAILABLE', False):
            return MetricsCollector(enable_prometheus=False, enable_datadog=False)
    
    def test_collector_initialization_disabled(self, collector):
        """Test collector initialization with disabled backends"""
        assert not collector.enable_prometheus
        assert not collector.enable_datadog
        assert len(collector._metrics_buffer) == 0
        assert isinstance(collector._current_metrics, OperationalMetrics)
    
    def test_record_wallet_processing(self, collector):
        """Test wallet processing metrics recording"""
        # Record successful processing
        collector.record_wallet_processing(1.5, True)
        collector.record_wallet_processing(2.0, False)
        collector.record_wallet_processing(0.8, True)
        
        metrics = collector.get_current_metrics()
        assert metrics.total_wallets_processed == 3
        assert metrics.successful_wallets == 2
        assert metrics.failed_wallets == 1
    
    def test_record_batch_processing(self, collector):
        """Test batch processing metrics recording"""
        collector.record_batch_processing(60.0, 10, 8)
        collector.record_batch_processing(45.0, 5, 5)
        
        metrics = collector.get_current_metrics()
        assert metrics.processing_time_seconds == 105.0  # 60 + 45
    
    def test_record_trust_score(self, collector):
        """Test trust score metrics recording"""
        # Record some trust scores
        collector.record_trust_score(85.5, "eligible")
        collector.record_trust_score(72.3, "eligible")
        collector.record_trust_score(45.0, "insufficient_trades")
        collector.record_trust_score(90.1, "eligible")
        
        metrics = collector.get_current_metrics()
        assert metrics.trust_scores_calculated == 4
        assert metrics.eligible_wallets == 3
        
        # Check average calculation: (85.5 + 72.3 + 45.0 + 90.1) / 4 = 73.225
        expected_avg = (85.5 + 72.3 + 45.0 + 90.1) / 4
        assert abs(metrics.average_trust_score - expected_avg) < 0.01
    
    def test_record_error(self, collector):
        """Test error metrics recording"""
        collector.record_error("timeout", "ingestion")
        collector.record_error("network", "api")
        collector.record_error("calculation", "scoring")
        collector.record_error("timeout", "ingestion")
        
        metrics = collector.get_current_metrics()
        assert metrics.timeout_errors == 2
        assert metrics.network_errors == 1
        assert metrics.calculation_errors == 1
    
    def test_record_api_request(self, collector):
        """Test API request metrics recording"""
        collector.record_api_request("GET", "/health", 200, 0.05)
        collector.record_api_request("POST", "/internal/ranked-traders", 200, 1.25)
        
        metrics = collector.get_current_metrics()
        assert metrics.api_response_time_ms == 1250.0  # Last recorded value
    
    def test_record_business_metrics(self, collector):
        """Test business metrics recording"""
        collector.record_business_metrics(10000.0, 500.0, 25)
        collector.record_business_metrics(5000.0, 250.0, 15)
        
        metrics = collector.get_current_metrics()
        assert metrics.total_volume_usd == 15000.0
        assert metrics.total_profit_usd == 750.0
        assert metrics.total_trades_analyzed == 40
    
    def test_record_system_metrics(self, collector):
        """Test system metrics recording"""
        collector.record_system_metrics(512.0, 45.5)
        
        metrics = collector.get_current_metrics()
        assert metrics.memory_usage_mb == 512.0
        assert metrics.cpu_usage_percent == 45.5
    
    def test_get_current_metrics_thread_safe(self, collector):
        """Test that get_current_metrics returns a copy"""
        original = collector.get_current_metrics()
        
        # Modify original shouldn't affect internal state
        original.total_wallets_processed = 999
        
        current = collector.get_current_metrics()
        assert current.total_wallets_processed == 0
    
    def test_get_metrics_summary(self, collector):
        """Test comprehensive metrics summary generation"""
        # Add some test data
        collector.record_wallet_processing(1.0, True)
        collector.record_wallet_processing(1.5, False)
        collector.record_trust_score(80.0, "eligible")
        collector.record_error("timeout", "ingestion")
        collector.record_business_metrics(1000.0, 100.0, 10)
        
        summary = collector.get_metrics_summary()
        
        assert "timestamp" in summary
        assert "processing" in summary
        assert "scoring" in summary
        assert "errors" in summary
        assert "performance" in summary
        assert "business" in summary
        assert "monitoring" in summary
        
        # Verify calculated values
        processing = summary["processing"]
        assert processing["total_wallets_processed"] == 2
        assert processing["successful_wallets"] == 1
        assert processing["failed_wallets"] == 1
        assert processing["success_rate"] == 0.5
        
        scoring = summary["scoring"]
        assert scoring["trust_scores_calculated"] == 1
        assert scoring["eligible_wallets"] == 1
        assert scoring["eligibility_rate"] == 1.0
    
    def test_reset_metrics(self, collector):
        """Test metrics reset functionality"""
        # Add some data
        collector.record_wallet_processing(1.0, True)
        collector.record_trust_score(80.0, "eligible")
        
        # Verify data exists
        metrics = collector.get_current_metrics()
        assert metrics.total_wallets_processed == 1
        assert metrics.trust_scores_calculated == 1
        
        # Reset and verify clean state
        collector.reset_metrics()
        
        metrics = collector.get_current_metrics()
        assert metrics.total_wallets_processed == 0
        assert metrics.trust_scores_calculated == 0
    
    @pytest.mark.skipif(True, reason="Requires Prometheus library")
    def test_prometheus_integration(self):
        """Test Prometheus integration when available"""
        # This would test Prometheus integration if the library is available
        pass
    
    @pytest.mark.skipif(True, reason="Requires Datadog library")
    def test_datadog_integration(self):
        """Test Datadog integration when available"""
        # This would test Datadog integration if the library is available
        pass


class TestObserveOperation:
    """Test observe_operation context manager"""
    
    @pytest.fixture
    def collector(self):
        """Create collector for testing"""
        with patch('app.core.observability.PROMETHEUS_AVAILABLE', False), \
             patch('app.core.observability.DATADOG_AVAILABLE', False):
            return MetricsCollector(enable_prometheus=False, enable_datadog=False)
    
    def test_observe_wallet_processing_success(self, collector):
        """Test observing successful wallet processing"""
        with observe_operation(collector, "wallet_processing"):
            time.sleep(0.01)  # Simulate work
        
        metrics = collector.get_current_metrics()
        assert metrics.total_wallets_processed == 1
        assert metrics.successful_wallets == 1
        assert metrics.failed_wallets == 0
    
    def test_observe_wallet_processing_failure(self, collector):
        """Test observing failed wallet processing"""
        with pytest.raises(ValueError):
            with observe_operation(collector, "wallet_processing"):
                raise ValueError("Test error")
        
        metrics = collector.get_current_metrics()
        assert metrics.total_wallets_processed == 1
        assert metrics.successful_wallets == 0
        assert metrics.failed_wallets == 1
        assert metrics.calculation_errors == 1  # ValueError categorized as calculation error
    
    def test_observe_api_request(self, collector):
        """Test observing API requests"""
        with observe_operation(
            collector, 
            "api_request",
            method="GET",
            endpoint="/health",
            status_code=200
        ):
            time.sleep(0.01)
        
        # Verify API metrics were recorded
        metrics = collector.get_current_metrics()
        assert metrics.api_response_time_ms > 0


class TestMetricsMiddleware:
    """Test MetricsMiddleware for FastAPI"""
    
    @pytest.fixture
    def mock_app(self):
        """Create mock FastAPI app"""
        return MagicMock()
    
    @pytest.fixture
    def collector(self):
        """Create collector for testing"""
        with patch('app.core.observability.PROMETHEUS_AVAILABLE', False), \
             patch('app.core.observability.DATADOG_AVAILABLE', False):
            return MetricsCollector(enable_prometheus=False, enable_datadog=False)
    
    @pytest.fixture
    def middleware(self, mock_app, collector):
        """Create metrics middleware"""
        with patch('asyncio.get_event_loop'), \
             patch('psutil.virtual_memory'), \
             patch('psutil.cpu_percent'):
            return MetricsMiddleware(mock_app, collector)
    
    def test_middleware_initialization(self, middleware, collector):
        """Test middleware initialization"""
        assert middleware.metrics_collector is collector
        assert isinstance(middleware.start_time, datetime)
    
    def test_normalize_path(self, middleware):
        """Test path normalization for metrics"""
        assert middleware._normalize_path("/health") == "/health"
        assert middleware._normalize_path("/api/v1/wallets/ABC123DEF456GHI789JKL012MNO345PQR678") == "/api/v1/wallets/{wallet_address}"
        assert middleware._normalize_path("/api/users/123") == "/api/users/{id}"
        assert middleware._normalize_path("/api/items/550e8400-e29b-41d4-a716-446655440000") == "/api/items/{id}"
        assert middleware._normalize_path("/static/css/style.css?v=1.0") == "/static/css/style.css"
    
    @pytest.mark.asyncio
    async def test_middleware_successful_request(self, middleware, collector):
        """Test middleware handling successful requests"""
        mock_request = MagicMock()
        mock_request.method = "GET"
        mock_request.url.path = "/health"
        
        mock_response = MagicMock()
        mock_response.status_code = 200
        
        async def mock_call_next(request):
            return mock_response
        
        result = await middleware.dispatch(mock_request, mock_call_next)
        
        assert result is mock_response
        
        # Check metrics were recorded
        metrics = collector.get_current_metrics()
        assert metrics.api_response_time_ms > 0
    
    @pytest.mark.asyncio
    async def test_middleware_failed_request(self, middleware, collector):
        """Test middleware handling failed requests"""
        mock_request = MagicMock()
        mock_request.method = "POST"
        mock_request.url.path = "/api/test"
        
        async def mock_call_next(request):
            raise ValueError("Test API error")
        
        with pytest.raises(ValueError):
            await middleware.dispatch(mock_request, mock_call_next)
        
        # Check error metrics were recorded
        metrics = collector.get_current_metrics()
        assert metrics.calculation_errors > 0


class TestHealthMetricsCollector:
    """Test HealthMetricsCollector"""
    
    @pytest.fixture
    def collector(self):
        """Create collector for testing"""
        with patch('app.core.observability.PROMETHEUS_AVAILABLE', False), \
             patch('app.core.observability.DATADOG_AVAILABLE', False):
            return MetricsCollector(enable_prometheus=False, enable_datadog=False)
    
    @pytest.fixture
    def health_collector(self, collector):
        """Create health metrics collector"""
        return HealthMetricsCollector(collector)
    
    @pytest.mark.asyncio
    async def test_collect_component_health_all_healthy(self, health_collector, collector):
        """Test collecting health when all components are healthy"""
        mock_app = MagicMock()
        
        # Mock all services as healthy
        with patch('app.core.metrics_middleware.get_calculation_service') as mock_calc, \
             patch('app.core.metrics_middleware.get_scoring_service') as mock_scoring, \
             patch('app.core.metrics_middleware.get_helius_client') as mock_solana:
            
            # Setup mocks
            mock_calc_service = AsyncMock()
            mock_calc_service.get_calculation_health.return_value = {"calculation_service": "healthy"}
            mock_calc.return_value = mock_calc_service
            
            mock_scoring_service = AsyncMock()
            mock_scoring_service.get_scoring_health.return_value = {"scoring_service": "healthy"}
            mock_scoring.return_value = mock_scoring_service
            
            mock_solana_client = AsyncMock()
            mock_solana_client.get_health_status.return_value = {"healthy": True}
            mock_solana.return_value = mock_solana_client
            
            await health_collector.collect_component_health(mock_app)
            
            assert health_collector.component_health["calculation"] is True
            assert health_collector.component_health["scoring"] is True
            assert health_collector.component_health["solana"] is True
    
    @pytest.mark.asyncio
    async def test_collect_component_health_some_unhealthy(self, health_collector, collector):
        """Test collecting health when some components are unhealthy"""
        mock_app = MagicMock()
        
        with patch('app.core.metrics_middleware.get_calculation_service') as mock_calc, \
             patch('app.core.metrics_middleware.get_scoring_service') as mock_scoring, \
             patch('app.core.metrics_middleware.get_helius_client') as mock_solana:
            
            # Calculation service healthy
            mock_calc_service = AsyncMock()
            mock_calc_service.get_calculation_health.return_value = {"calculation_service": "healthy"}
            mock_calc.return_value = mock_calc_service
            
            # Scoring service fails
            mock_scoring.side_effect = Exception("Scoring service down")
            
            # Solana client unhealthy
            mock_solana_client = AsyncMock()
            mock_solana_client.get_health_status.return_value = {"healthy": False}
            mock_solana.return_value = mock_solana_client
            
            await health_collector.collect_component_health(mock_app)
            
            assert health_collector.component_health["calculation"] is True
            assert health_collector.component_health["scoring"] is False
            assert health_collector.component_health["solana"] is False
    
    def test_get_overall_health_majority_healthy(self, health_collector):
        """Test overall health when majority of components are healthy"""
        health_collector.component_health = {
            "service_1": True,
            "service_2": True,
            "service_3": False
        }
        
        assert health_collector.get_overall_health() is True
    
    def test_get_overall_health_majority_unhealthy(self, health_collector):
        """Test overall health when majority of components are unhealthy"""
        health_collector.component_health = {
            "service_1": False,
            "service_2": False,
            "service_3": True
        }
        
        assert health_collector.get_overall_health() is False
    
    def test_get_overall_health_no_components(self, health_collector):
        """Test overall health when no components are tracked"""
        assert health_collector.get_overall_health() is False


class TestAsyncOperationDecorator:
    """Test observe_async_operation decorator"""
    
    @pytest.fixture
    def collector(self):
        """Create collector for testing"""
        with patch('app.core.observability.PROMETHEUS_AVAILABLE', False), \
             patch('app.core.observability.DATADOG_AVAILABLE', False):
            return MetricsCollector(enable_prometheus=False, enable_datadog=False)
    
    @pytest.mark.asyncio
    async def test_decorator_successful_operation(self, collector):
        """Test decorator on successful async operation"""
        
        @observe_async_operation("test_operation", component="test")
        async def test_func():
            await asyncio.sleep(0.01)
            return "success"
        
        with patch('app.core.metrics_middleware.get_metrics_collector', return_value=collector):
            result = await test_func()
        
        assert result == "success"
    
    @pytest.mark.asyncio
    async def test_decorator_failed_operation(self, collector):
        """Test decorator on failed async operation"""
        
        @observe_async_operation("test_operation", component="test")
        async def test_func():
            await asyncio.sleep(0.01)
            raise ValueError("Test error")
        
        with patch('app.core.metrics_middleware.get_metrics_collector', return_value=collector):
            with pytest.raises(ValueError):
                await test_func()


class TestGlobalFunctions:
    """Test global utility functions"""
    
    def test_get_metrics_collector_singleton(self):
        """Test global metrics collector singleton"""
        with patch('app.core.observability._global_metrics_collector', None):
            collector1 = get_metrics_collector()
            collector2 = get_metrics_collector()
            
            assert collector1 is collector2
    
    @pytest.mark.asyncio
    async def test_setup_observability_integration(self):
        """Test complete observability setup"""
        mock_app = MagicMock()
        
        with patch('app.core.metrics_middleware.start_metrics_server') as mock_start_server:
            collector = setup_observability(mock_app)
            
            assert isinstance(collector, MetricsCollector)
            mock_app.add_middleware.assert_called()


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])