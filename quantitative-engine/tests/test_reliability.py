"""
XORJ Quantitative Engine - Reliability Module Tests
NFR-1 & NFR-2: Tests for fault-tolerant processing and high test coverage
"""

import pytest
import asyncio
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from typing import List

from app.core.reliability import (
    FaultTolerantProcessor,
    ReliabilityConfig,
    ProcessingStatus,
    ProcessingResult,
    BatchProcessingResult,
    CircuitBreakerError,
    get_fault_tolerant_processor,
    process_wallets_safely,
    reliable_operation
)


class TestReliabilityConfig:
    """Test ReliabilityConfig data class"""
    
    def test_default_config(self):
        """Test default configuration values"""
        config = ReliabilityConfig()
        
        assert config.max_retries == 3
        assert config.retry_delay_seconds == 1.0
        assert config.retry_backoff_multiplier == 2.0
        assert config.max_concurrent_wallets == 10
        assert config.timeout_seconds == 60.0
        assert config.circuit_breaker_threshold == 0.5
        assert config.circuit_breaker_window == 20
        assert config.continue_on_failure is True
        assert config.log_individual_errors is True
        assert config.collect_detailed_metrics is True
    
    def test_custom_config(self):
        """Test custom configuration values"""
        config = ReliabilityConfig(
            max_retries=5,
            retry_delay_seconds=2.0,
            max_concurrent_wallets=15,
            timeout_seconds=120.0,
            circuit_breaker_threshold=0.7,
            continue_on_failure=False
        )
        
        assert config.max_retries == 5
        assert config.retry_delay_seconds == 2.0
        assert config.max_concurrent_wallets == 15
        assert config.timeout_seconds == 120.0
        assert config.circuit_breaker_threshold == 0.7
        assert config.continue_on_failure is False


class TestProcessingResult:
    """Test ProcessingResult data class"""
    
    def test_processing_result_initialization(self):
        """Test ProcessingResult initialization"""
        result = ProcessingResult("test_wallet", ProcessingStatus.PENDING)
        
        assert result.wallet_address == "test_wallet"
        assert result.status == ProcessingStatus.PENDING
        assert result.result is None
        assert result.error is None
        assert result.retry_count == 0
        assert result.start_time is not None
        assert result.end_time is None
    
    def test_processing_result_success(self):
        """Test successful processing result"""
        result = ProcessingResult(
            wallet_address="test_wallet",
            status=ProcessingStatus.SUCCESS,
            result={"data": "success"},
            processing_time_ms=150.5
        )
        
        assert result.status == ProcessingStatus.SUCCESS
        assert result.result == {"data": "success"}
        assert result.processing_time_ms == 150.5


class TestBatchProcessingResult:
    """Test BatchProcessingResult data class"""
    
    def test_batch_result_initialization(self):
        """Test BatchProcessingResult initialization"""
        result = BatchProcessingResult(
            total_wallets=10,
            successful_wallets=7,
            failed_wallets=2,
            skipped_wallets=1,
            total_retries=5,
            processing_time_ms=5000.0
        )
        
        assert result.total_wallets == 10
        assert result.successful_wallets == 7
        assert result.failed_wallets == 2
        assert result.skipped_wallets == 1
        assert result.total_retries == 5
        assert result.processing_time_ms == 5000.0
    
    def test_success_rate_calculation(self):
        """Test success rate calculation"""
        result = BatchProcessingResult(
            total_wallets=10,
            successful_wallets=8,
            failed_wallets=2,
            skipped_wallets=0,
            total_retries=3,
            processing_time_ms=2000.0
        )
        
        assert result.success_rate == 80.0
    
    def test_success_rate_zero_wallets(self):
        """Test success rate with zero wallets"""
        result = BatchProcessingResult(
            total_wallets=0,
            successful_wallets=0,
            failed_wallets=0,
            skipped_wallets=0,
            total_retries=0,
            processing_time_ms=0.0
        )
        
        assert result.success_rate == 0.0
    
    def test_errors_grouping(self):
        """Test error grouping functionality"""
        result = BatchProcessingResult(
            total_wallets=5,
            successful_wallets=2,
            failed_wallets=3,
            skipped_wallets=0,
            total_retries=6,
            processing_time_ms=3000.0
        )
        
        # Add some results with different error types
        result.results = {
            "wallet_1": ProcessingResult("wallet_1", ProcessingStatus.SUCCESS),
            "wallet_2": ProcessingResult("wallet_2", ProcessingStatus.SUCCESS), 
            "wallet_3": ProcessingResult("wallet_3", ProcessingStatus.FAILED, error="Timeout", error_type="TimeoutError"),
            "wallet_4": ProcessingResult("wallet_4", ProcessingStatus.FAILED, error="Network", error_type="NetworkError"),
            "wallet_5": ProcessingResult("wallet_5", ProcessingStatus.FAILED, error="Timeout2", error_type="TimeoutError")
        }
        
        errors = result.errors
        assert "TimeoutError" in errors
        assert "NetworkError" in errors
        assert len(errors["TimeoutError"]) == 2
        assert len(errors["NetworkError"]) == 1
        assert "wallet_3" in errors["TimeoutError"]
        assert "wallet_5" in errors["TimeoutError"]
        assert "wallet_4" in errors["NetworkError"]


class TestFaultTolerantProcessor:
    """Test FaultTolerantProcessor class"""
    
    @pytest.fixture
    def processor(self):
        """Create processor instance for testing"""
        config = ReliabilityConfig(
            max_retries=2,
            retry_delay_seconds=0.1,  # Fast retries for testing
            max_concurrent_wallets=3,
            timeout_seconds=1.0,
            circuit_breaker_threshold=0.6,
            circuit_breaker_window=5
        )
        return FaultTolerantProcessor(config)
    
    @pytest.fixture
    def successful_processor_func(self):
        """Mock processor function that always succeeds"""
        async def mock_func(wallet_address: str):
            return f"success_{wallet_address}"
        return mock_func
    
    @pytest.fixture
    def failing_processor_func(self):
        """Mock processor function that always fails"""
        async def mock_func(wallet_address: str):
            raise Exception(f"Failed processing {wallet_address}")
        return mock_func
    
    @pytest.fixture
    def intermittent_processor_func(self):
        """Mock processor function that fails first time, succeeds second time"""
        call_count = {}
        
        async def mock_func(wallet_address: str):
            if wallet_address not in call_count:
                call_count[wallet_address] = 0
            call_count[wallet_address] += 1
            
            if call_count[wallet_address] == 1:
                raise Exception(f"First attempt failed for {wallet_address}")
            return f"success_after_retry_{wallet_address}"
        
        return mock_func
    
    @pytest.mark.asyncio
    async def test_process_single_wallet_success(self, processor, successful_processor_func):
        """Test successful single wallet processing"""
        result = await processor.process_single_wallet("test_wallet", successful_processor_func)
        
        assert result.status == ProcessingStatus.SUCCESS
        assert result.result == "success_test_wallet"
        assert result.retry_count == 0
        assert result.error is None
        assert result.processing_time_ms > 0
    
    @pytest.mark.asyncio
    async def test_process_single_wallet_failure(self, processor, failing_processor_func):
        """Test single wallet processing that fails all retries"""
        result = await processor.process_single_wallet("test_wallet", failing_processor_func)
        
        assert result.status == ProcessingStatus.FAILED
        assert result.result is None
        assert result.retry_count == 2  # max_retries
        assert "Failed processing test_wallet" in result.error
        assert result.error_type == "Exception"
        assert result.processing_time_ms > 0
    
    @pytest.mark.asyncio
    async def test_process_single_wallet_retry_success(self, processor, intermittent_processor_func):
        """Test single wallet processing that succeeds after retry"""
        result = await processor.process_single_wallet("test_wallet", intermittent_processor_func)
        
        assert result.status == ProcessingStatus.RETRIED
        assert result.result == "success_after_retry_test_wallet"
        assert result.retry_count == 1
        assert result.error is None
        assert result.processing_time_ms > 0
    
    @pytest.mark.asyncio
    async def test_process_single_wallet_timeout(self, processor):
        """Test single wallet processing with timeout"""
        async def slow_func(wallet_address: str):
            await asyncio.sleep(2.0)  # Longer than timeout
            return f"slow_success_{wallet_address}"
        
        result = await processor.process_single_wallet("test_wallet", slow_func)
        
        assert result.status == ProcessingStatus.FAILED
        assert result.error_type == "TimeoutError"
        assert "timed out" in result.error
        assert result.retry_count == 2  # Should retry on timeout
    
    @pytest.mark.asyncio
    async def test_process_wallet_batch_all_success(self, processor, successful_processor_func):
        """Test batch processing where all wallets succeed"""
        wallets = ["wallet_1", "wallet_2", "wallet_3"]
        
        batch_result = await processor.process_wallet_batch(wallets, successful_processor_func)
        
        assert batch_result.total_wallets == 3
        assert batch_result.successful_wallets == 3
        assert batch_result.failed_wallets == 0
        assert batch_result.skipped_wallets == 0
        assert batch_result.success_rate == 100.0
        assert len(batch_result.results) == 3
        
        for wallet in wallets:
            assert wallet in batch_result.results
            assert batch_result.results[wallet].status == ProcessingStatus.SUCCESS
    
    @pytest.mark.asyncio
    async def test_process_wallet_batch_mixed_results(self, processor):
        """Test batch processing with mixed success/failure results"""
        wallets = ["wallet_1", "wallet_2", "wallet_3", "wallet_4"]
        
        async def mixed_func(wallet_address: str):
            if wallet_address in ["wallet_2", "wallet_4"]:
                raise Exception(f"Failed {wallet_address}")
            return f"success_{wallet_address}"
        
        batch_result = await processor.process_wallet_batch(wallets, mixed_func)
        
        assert batch_result.total_wallets == 4
        assert batch_result.successful_wallets == 2
        assert batch_result.failed_wallets == 2
        assert batch_result.success_rate == 50.0
        
        assert batch_result.results["wallet_1"].status == ProcessingStatus.SUCCESS
        assert batch_result.results["wallet_2"].status == ProcessingStatus.FAILED
        assert batch_result.results["wallet_3"].status == ProcessingStatus.SUCCESS
        assert batch_result.results["wallet_4"].status == ProcessingStatus.FAILED
    
    @pytest.mark.asyncio
    async def test_circuit_breaker_functionality(self, processor, failing_processor_func):
        """Test circuit breaker trips on high failure rate"""
        # Configure processor for aggressive circuit breaking
        processor.config.circuit_breaker_threshold = 0.4  # 40% failure rate
        processor.config.circuit_breaker_window = 3
        processor.config.continue_on_failure = False
        
        wallets = ["wallet_1", "wallet_2", "wallet_3", "wallet_4", "wallet_5"]
        
        batch_result = await processor.process_wallet_batch(wallets, failing_processor_func)
        
        # Some wallets should be skipped due to circuit breaker
        assert batch_result.skipped_wallets > 0
        
        # Check that some results are marked as skipped
        skipped_count = sum(1 for result in batch_result.results.values() 
                           if result.status == ProcessingStatus.SKIPPED)
        assert skipped_count > 0
    
    @pytest.mark.asyncio
    async def test_circuit_breaker_continue_on_failure(self, processor, failing_processor_func):
        """Test circuit breaker with continue_on_failure=True"""
        # Configure processor to continue despite circuit breaker
        processor.config.circuit_breaker_threshold = 0.1  # Very low threshold
        processor.config.circuit_breaker_window = 2
        processor.config.continue_on_failure = True
        
        wallets = ["wallet_1", "wallet_2", "wallet_3", "wallet_4"]
        
        batch_result = await processor.process_wallet_batch(wallets, failing_processor_func)
        
        # Should still process all wallets despite circuit breaker
        assert batch_result.skipped_wallets == 0
        assert batch_result.failed_wallets == 4
    
    @pytest.mark.asyncio
    async def test_concurrent_processing_limit(self, processor):
        """Test concurrent processing respects limits"""
        processor.config.max_concurrent_wallets = 2
        concurrent_count = 0
        max_concurrent = 0
        
        async def tracking_func(wallet_address: str):
            nonlocal concurrent_count, max_concurrent
            concurrent_count += 1
            max_concurrent = max(max_concurrent, concurrent_count)
            await asyncio.sleep(0.1)  # Simulate work
            concurrent_count -= 1
            return f"success_{wallet_address}"
        
        wallets = ["wallet_1", "wallet_2", "wallet_3", "wallet_4", "wallet_5"]
        
        batch_result = await processor.process_wallet_batch(wallets, tracking_func)
        
        assert max_concurrent <= 2  # Should not exceed concurrent limit
        assert batch_result.successful_wallets == 5
    
    @pytest.mark.asyncio
    async def test_retry_backoff(self, processor):
        """Test retry backoff timing"""
        processor.config.retry_delay_seconds = 0.1
        processor.config.retry_backoff_multiplier = 2.0
        
        call_times = []
        
        async def timing_func(wallet_address: str):
            call_times.append(datetime.now(timezone.utc))
            raise Exception("Always fails")
        
        start_time = datetime.now(timezone.utc)
        result = await processor.process_single_wallet("test_wallet", timing_func)
        
        # Should have 3 calls (initial + 2 retries)
        assert len(call_times) == 3
        assert result.retry_count == 2
        
        # Check backoff timing (approximately)
        time_deltas = [
            (call_times[i] - call_times[i-1]).total_seconds() 
            for i in range(1, len(call_times))
        ]
        
        # First retry should be ~0.1s, second retry should be ~0.2s
        assert 0.05 < time_deltas[0] < 0.15
        assert 0.15 < time_deltas[1] < 0.25
    
    def test_get_health_metrics(self, processor):
        """Test health metrics generation"""
        # Add some fake recent results
        processor.recent_results = [True, True, False, True, False]
        
        metrics = processor.get_health_metrics()
        
        assert metrics["processor_status"] == "healthy"
        assert "config" in metrics
        assert "recent_performance" in metrics
        assert "timestamp" in metrics
        
        # Check recent performance
        recent_perf = metrics["recent_performance"]
        assert recent_perf["recent_operations"] == 5
        assert recent_perf["recent_success_rate"] == "60.00%"  # 3 out of 5
        assert isinstance(recent_perf["circuit_breaker_active"], bool)
    
    def test_reset_circuit_breaker(self, processor):
        """Test circuit breaker reset functionality"""
        # Add some fake results
        processor.recent_results = [False, False, False, False, False]
        
        assert not processor._check_circuit_breaker()  # Should be tripped
        
        processor.reset_circuit_breaker()
        
        assert len(processor.recent_results) == 0
        assert processor._check_circuit_breaker()  # Should be reset
    
    def test_check_circuit_breaker_logic(self, processor):
        """Test circuit breaker logic with various scenarios"""
        processor.config.circuit_breaker_threshold = 0.5  # 50%
        processor.config.circuit_breaker_window = 4
        
        # Not enough data - should allow
        processor.recent_results = [False, False]
        assert processor._check_circuit_breaker()
        
        # Exactly at threshold - should allow
        processor.recent_results = [True, True, False, False]
        assert processor._check_circuit_breaker()
        
        # Above threshold - should trip
        processor.recent_results = [True, False, False, False]
        assert not processor._check_circuit_breaker()
        
        # All success - should allow
        processor.recent_results = [True, True, True, True]
        assert processor._check_circuit_breaker()


class TestUtilityFunctions:
    """Test utility functions"""
    
    @pytest.mark.asyncio
    async def test_process_wallets_safely(self):
        """Test convenience function for safe wallet processing"""
        async def test_func(wallet_address: str):
            return f"processed_{wallet_address}"
        
        wallets = ["wallet_1", "wallet_2", "wallet_3"]
        config = ReliabilityConfig(max_retries=1, timeout_seconds=5.0)
        
        result = await process_wallets_safely(wallets, test_func, config)
        
        assert isinstance(result, BatchProcessingResult)
        assert result.successful_wallets == 3
        assert result.failed_wallets == 0
    
    @pytest.mark.asyncio
    async def test_reliable_operation_context_manager(self):
        """Test reliable operation context manager"""
        async with reliable_operation("test_operation"):
            # Should log start and end
            await asyncio.sleep(0.01)
        
        # Test with exception
        with pytest.raises(ValueError):
            async with reliable_operation("failing_operation"):
                raise ValueError("Test error")
    
    def test_get_fault_tolerant_processor_singleton(self):
        """Test global processor singleton functionality"""
        # First call should create processor
        processor1 = get_fault_tolerant_processor()
        
        # Second call should return same instance
        processor2 = get_fault_tolerant_processor()
        assert processor1 is processor2
        
        # Call with config should create new instance
        config = ReliabilityConfig(max_retries=5)
        processor3 = get_fault_tolerant_processor(config)
        assert processor3 is not processor1
        assert processor3.config.max_retries == 5


class TestErrorScenarios:
    """Test various error scenarios and edge cases"""
    
    @pytest.fixture
    def processor(self):
        """Create processor for error testing"""
        config = ReliabilityConfig(
            max_retries=1,
            retry_delay_seconds=0.01,
            timeout_seconds=0.5,
            max_concurrent_wallets=2
        )
        return FaultTolerantProcessor(config)
    
    @pytest.mark.asyncio
    async def test_empty_wallet_list(self, processor):
        """Test processing empty wallet list"""
        async def dummy_func(wallet_address: str):
            return "success"
        
        result = await processor.process_wallet_batch([], dummy_func)
        
        assert result.total_wallets == 0
        assert result.successful_wallets == 0
        assert result.failed_wallets == 0
        assert result.success_rate == 0.0
        assert len(result.results) == 0
    
    @pytest.mark.asyncio
    async def test_processor_function_returns_none(self, processor):
        """Test handling when processor function returns None"""
        async def none_func(wallet_address: str):
            return None
        
        result = await processor.process_single_wallet("test_wallet", none_func)
        
        assert result.status == ProcessingStatus.SUCCESS
        assert result.result is None
        assert result.error is None
    
    @pytest.mark.asyncio
    async def test_various_exception_types(self, processor):
        """Test handling of various exception types"""
        exceptions_to_test = [
            KeyError("Missing key"),
            ValueError("Invalid value"), 
            TypeError("Type mismatch"),
            RuntimeError("Runtime error"),
            ConnectionError("Connection failed"),
            asyncio.CancelledError("Task cancelled")
        ]
        
        for i, exception in enumerate(exceptions_to_test):
            async def error_func(wallet_address: str):
                raise exception
            
            result = await processor.process_single_wallet(f"wallet_{i}", error_func)
            
            assert result.status == ProcessingStatus.FAILED
            assert result.error_type == type(exception).__name__
            assert str(exception) in result.error
    
    @pytest.mark.asyncio
    async def test_critical_batch_error(self, processor):
        """Test handling of critical errors during batch processing"""
        async def normal_func(wallet_address: str):
            return f"success_{wallet_address}"
        
        wallets = ["wallet_1", "wallet_2", "wallet_3"]
        
        # Mock asyncio.gather to raise exception
        with patch('asyncio.gather') as mock_gather:
            mock_gather.side_effect = RuntimeError("Critical batch error")
            
            result = await processor.process_wallet_batch(wallets, normal_func)
            
            # All wallets should be marked as failed
            assert result.failed_wallets == 3
            assert result.successful_wallets == 0
            assert all(res.status == ProcessingStatus.FAILED 
                      for res in result.results.values())
    
    @pytest.mark.asyncio
    async def test_partial_gather_exceptions(self, processor):
        """Test handling when gather returns some exceptions"""
        wallets = ["wallet_1", "wallet_2", "wallet_3"]
        
        # Create a function that will be mocked to return mixed results
        async def mixed_func(wallet_address: str):
            if wallet_address == "wallet_2":
                raise ValueError("Wallet 2 error")
            return f"success_{wallet_address}"
        
        # Mock gather to return mixed results including exceptions
        with patch('asyncio.gather') as mock_gather:
            mock_gather.return_value = [
                ProcessingResult("wallet_1", ProcessingStatus.SUCCESS, result="success_wallet_1"),
                ValueError("Injected exception"),  # Exception in gather results
                ProcessingResult("wallet_3", ProcessingStatus.SUCCESS, result="success_wallet_3")
            ]
            
            result = await processor.process_wallet_batch(wallets, mixed_func)
            
            # Exception should be converted to failed result
            assert result.successful_wallets == 2
            assert result.failed_wallets == 1
            assert result.results["wallet_2"].status == ProcessingStatus.FAILED


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])