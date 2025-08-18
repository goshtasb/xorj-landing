"""
Test Suite for Circuit Breakers (SR-4: Automated Circuit Breakers).

Tests comprehensive circuit breaker functionality including:
- Trade failure rate monitoring
- Network connectivity monitoring  
- Market volatility detection
- HSM failure rate tracking
- System error rate monitoring
- Automatic recovery mechanisms
- System-wide trading halts
"""

import pytest
import asyncio
from decimal import Decimal
from datetime import datetime, timezone, timedelta
from unittest.mock import Mock, patch, AsyncMock

from app.security.circuit_breakers import (
    CircuitBreakerManager,
    CircuitBreaker,
    CircuitBreakerConfig,
    CircuitBreakerType,
    CircuitBreakerState,
    CircuitBreakerEvent
)


@pytest.fixture
def circuit_breaker_manager():
    """Create CircuitBreakerManager instance for testing."""
    return CircuitBreakerManager()


@pytest.fixture
def trade_failure_config():
    """Create trade failure circuit breaker config for testing."""
    return CircuitBreakerConfig(
        breaker_type=CircuitBreakerType.TRADE_FAILURE_RATE,
        name="Test Trade Failure Monitor",
        description="Test trade failure rate monitoring",
        failure_threshold=3,            # 3 failures to trigger
        time_window_minutes=5,          # in 5 minutes
        consecutive_failure_limit=2,    # or 2 consecutive failures
        recovery_timeout_minutes=10     # wait 10 minutes for recovery
    )


@pytest.fixture
def test_circuit_breaker(trade_failure_config):
    """Create CircuitBreaker instance for testing.""" 
    return CircuitBreaker(trade_failure_config)


class TestCircuitBreakerConfig:
    """Test circuit breaker configuration."""
    
    def test_config_creation(self, trade_failure_config):
        """Test circuit breaker config creation."""
        assert trade_failure_config.breaker_type == CircuitBreakerType.TRADE_FAILURE_RATE
        assert trade_failure_config.failure_threshold == 3
        assert trade_failure_config.time_window_minutes == 5
        assert trade_failure_config.consecutive_failure_limit == 2
        assert trade_failure_config.enabled == True
    
    def test_config_with_percentage_threshold(self):
        """Test config with percentage-based threshold."""
        config = CircuitBreakerConfig(
            breaker_type=CircuitBreakerType.SLIPPAGE_RATE,
            name="Test Slippage Monitor",
            description="Test slippage monitoring",
            failure_threshold=10,
            time_window_minutes=15,
            percentage_threshold=Decimal("75.0")  # 75% failure rate
        )
        
        assert config.percentage_threshold == Decimal("75.0")
    
    def test_config_with_absolute_threshold(self):
        """Test config with absolute threshold."""
        config = CircuitBreakerConfig(
            breaker_type=CircuitBreakerType.MARKET_VOLATILITY,
            name="Test Volatility Monitor", 
            description="Test volatility monitoring",
            failure_threshold=5,
            time_window_minutes=30,
            absolute_threshold=Decimal("50.0")  # 50% volatility
        )
        
        assert config.absolute_threshold == Decimal("50.0")


class TestCircuitBreakerBasics:
    """Test basic circuit breaker functionality."""
    
    @pytest.mark.asyncio
    async def test_circuit_breaker_initialization(self, test_circuit_breaker):
        """Test circuit breaker initialization."""
        assert test_circuit_breaker.state == CircuitBreakerState.CLOSED
        assert test_circuit_breaker.failure_count == 0
        assert test_circuit_breaker.consecutive_failures == 0
        assert test_circuit_breaker.total_events == 0
        assert len(test_circuit_breaker.recent_events) == 0
    
    @pytest.mark.asyncio
    async def test_successful_event_recording(self, test_circuit_breaker):
        """Test recording successful events."""
        # Record successful events
        for i in range(5):
            allowed = await test_circuit_breaker.record_event(f"test_event_{i}", True)
            assert allowed == True  # Should allow operation
        
        assert test_circuit_breaker.state == CircuitBreakerState.CLOSED
        assert test_circuit_breaker.total_events == 5
        assert test_circuit_breaker.consecutive_failures == 0
        assert test_circuit_breaker.last_success_time is not None
    
    @pytest.mark.asyncio 
    async def test_failure_event_recording(self, test_circuit_breaker):
        """Test recording failure events."""
        # Record some failures
        for i in range(2):
            allowed = await test_circuit_breaker.record_event(f"test_failure_{i}", False)
            assert allowed == True  # Should still allow (under threshold)
        
        assert test_circuit_breaker.state == CircuitBreakerState.CLOSED
        assert test_circuit_breaker.failure_count == 2
        assert test_circuit_breaker.consecutive_failures == 2
        assert test_circuit_breaker.last_failure_time is not None


class TestCircuitBreakerTripping:
    """Test circuit breaker tripping conditions."""
    
    @pytest.mark.asyncio
    async def test_consecutive_failure_trigger(self, test_circuit_breaker):
        """Test circuit breaker trips on consecutive failures."""
        # Record consecutive failures up to limit
        for i in range(test_circuit_breaker.config.consecutive_failure_limit):
            allowed = await test_circuit_breaker.record_event(f"failure_{i}", False)
            if i < test_circuit_breaker.config.consecutive_failure_limit - 1:
                assert allowed == True  # Should allow before limit
            else:
                assert allowed == False  # Should block at limit
        
        assert test_circuit_breaker.state == CircuitBreakerState.OPEN
        assert test_circuit_breaker.opened_at is not None
        assert test_circuit_breaker.total_opens == 1
    
    @pytest.mark.asyncio
    async def test_failure_threshold_trigger(self, test_circuit_breaker):
        """Test circuit breaker trips on failure threshold."""
        # Record failures with some successes mixed in
        events = [
            ("event_1", False),  # failure
            ("event_2", True),   # success
            ("event_3", False),  # failure
            ("event_4", True),   # success
            ("event_5", False),  # failure (3rd failure triggers)
        ]
        
        for i, (event_name, success) in enumerate(events):
            allowed = await test_circuit_breaker.record_event(event_name, success)
            if i < len(events) - 1:
                assert allowed == True  # Should allow before threshold
            else:
                assert allowed == False  # Should block at threshold
        
        assert test_circuit_breaker.state == CircuitBreakerState.OPEN
        assert test_circuit_breaker.failure_count >= test_circuit_breaker.config.failure_threshold
    
    @pytest.mark.asyncio
    async def test_percentage_threshold_trigger(self):
        """Test circuit breaker trips on percentage threshold."""
        config = CircuitBreakerConfig(
            breaker_type=CircuitBreakerType.SYSTEM_ERROR_RATE,
            name="Test Percentage Monitor",
            description="Test percentage-based triggering",
            failure_threshold=10,           # High threshold so we test percentage
            time_window_minutes=5,
            percentage_threshold=Decimal("60.0")  # 60% failure rate
        )
        
        breaker = CircuitBreaker(config)
        
        # Record events with >60% failure rate
        events = [
            ("event_1", False),  # failure
            ("event_2", False),  # failure  
            ("event_3", False),  # failure
            ("event_4", True),   # success
            ("event_5", False),  # failure (4/5 = 80% failure rate)
        ]
        
        for i, (event_name, success) in enumerate(events):
            allowed = await breaker.record_event(event_name, success)
            if i < len(events) - 1:
                assert allowed == True  # Should allow before percentage threshold
            else:
                assert allowed == False  # Should block at percentage threshold
        
        assert breaker.state == CircuitBreakerState.OPEN


class TestCircuitBreakerRecovery:
    """Test circuit breaker recovery mechanisms."""
    
    @pytest.mark.asyncio
    async def test_recovery_timeout_requirement(self, test_circuit_breaker):
        """Test that recovery requires timeout period."""
        # Trip the circuit breaker
        for i in range(test_circuit_breaker.config.consecutive_failure_limit):
            await test_circuit_breaker.record_event(f"failure_{i}", False)
        
        assert test_circuit_breaker.state == CircuitBreakerState.OPEN
        
        # Try recovery immediately (should fail)
        recovered = await test_circuit_breaker.attempt_recovery()
        assert recovered == False
        assert test_circuit_breaker.state == CircuitBreakerState.OPEN
    
    @pytest.mark.asyncio
    async def test_recovery_to_half_open_state(self, test_circuit_breaker):
        """Test recovery transitions to half-open state."""
        # Trip the circuit breaker
        for i in range(test_circuit_breaker.config.consecutive_failure_limit):
            await test_circuit_breaker.record_event(f"failure_{i}", False)
        
        assert test_circuit_breaker.state == CircuitBreakerState.OPEN
        
        # Simulate time passing beyond recovery timeout
        test_circuit_breaker.opened_at = datetime.now(timezone.utc) - timedelta(
            minutes=test_circuit_breaker.config.recovery_timeout_minutes + 1
        )
        
        # Try recovery (should succeed)
        recovered = await test_circuit_breaker.attempt_recovery()
        assert recovered == True
        assert test_circuit_breaker.state == CircuitBreakerState.HALF_OPEN
        assert test_circuit_breaker.test_request_count == 0
    
    @pytest.mark.asyncio
    async def test_half_open_success_closes_breaker(self, test_circuit_breaker):
        """Test successful operations in half-open state close the breaker."""
        # Get breaker to half-open state
        await self._get_breaker_to_half_open(test_circuit_breaker)
        
        # Record successful operations
        for i in range(test_circuit_breaker.config.recovery_success_threshold):
            allowed = await test_circuit_breaker.record_event(f"recovery_{i}", True)
            if i < test_circuit_breaker.config.recovery_success_threshold - 1:
                assert allowed == True
                assert test_circuit_breaker.state == CircuitBreakerState.HALF_OPEN
            else:
                assert allowed == True
                assert test_circuit_breaker.state == CircuitBreakerState.CLOSED  # Should close
    
    @pytest.mark.asyncio
    async def test_half_open_failure_reopens_breaker(self, test_circuit_breaker):
        """Test failure in half-open state reopens the breaker.""" 
        # Get breaker to half-open state
        await self._get_breaker_to_half_open(test_circuit_breaker)
        
        # Record a failure
        allowed = await test_circuit_breaker.record_event("recovery_failure", False)
        assert allowed == False
        assert test_circuit_breaker.state == CircuitBreakerState.OPEN
    
    @pytest.mark.asyncio
    async def test_half_open_test_limit(self, test_circuit_breaker):
        """Test half-open state limits test requests."""
        # Get breaker to half-open state
        await self._get_breaker_to_half_open(test_circuit_breaker)
        
        # Exceed test request limit with mixed results
        for i in range(test_circuit_breaker.config.test_request_limit + 2):
            allowed = await test_circuit_breaker.record_event(f"test_{i}", True)
            if i <= test_circuit_breaker.config.test_request_limit:
                assert allowed == True
            else:
                assert allowed == False  # Should block after limit
                assert test_circuit_breaker.state == CircuitBreakerState.OPEN
    
    async def _get_breaker_to_half_open(self, breaker):
        """Helper to get breaker to half-open state."""
        # Trip the breaker
        for i in range(breaker.config.consecutive_failure_limit):
            await breaker.record_event(f"failure_{i}", False)
        
        # Simulate timeout passing
        breaker.opened_at = datetime.now(timezone.utc) - timedelta(
            minutes=breaker.config.recovery_timeout_minutes + 1
        )
        
        # Attempt recovery
        await breaker.attempt_recovery()
        assert breaker.state == CircuitBreakerState.HALF_OPEN


class TestCircuitBreakerManager:
    """Test circuit breaker manager functionality."""
    
    def test_manager_initialization(self, circuit_breaker_manager):
        """Test circuit breaker manager initialization.""" 
        assert len(circuit_breaker_manager.breakers) == 7  # All default breakers
        assert CircuitBreakerType.TRADE_FAILURE_RATE in circuit_breaker_manager.breakers
        assert CircuitBreakerType.NETWORK_CONNECTIVITY in circuit_breaker_manager.breakers
        assert CircuitBreakerType.MARKET_VOLATILITY in circuit_breaker_manager.breakers
        assert CircuitBreakerType.HSM_FAILURE_RATE in circuit_breaker_manager.breakers
    
    @pytest.mark.asyncio
    async def test_trade_event_recording(self, circuit_breaker_manager):
        """Test recording trade events."""
        # Record successful trade
        allowed = await circuit_breaker_manager.record_trade_event(
            success=True,
            metadata={"trade_id": "test_001", "amount": "100.0"}
        )
        assert allowed == True
        
        # Check trade failure breaker recorded the event
        trade_breaker = circuit_breaker_manager.breakers[CircuitBreakerType.TRADE_FAILURE_RATE]
        assert trade_breaker.total_events == 1
        assert len(trade_breaker.recent_events) == 1
        assert trade_breaker.recent_events[0].success == True
    
    @pytest.mark.asyncio
    async def test_network_event_recording(self, circuit_breaker_manager):
        """Test recording network events."""
        # Record network failure
        allowed = await circuit_breaker_manager.record_network_event(
            success=False,
            metadata={"error": "connection_timeout", "endpoint": "solana-rpc"}
        )
        assert allowed == True  # Should allow first failure
        
        # Check network breaker recorded the event
        network_breaker = circuit_breaker_manager.breakers[CircuitBreakerType.NETWORK_CONNECTIVITY]
        assert network_breaker.total_events == 1
        assert network_breaker.failure_count == 1
    
    @pytest.mark.asyncio
    async def test_hsm_event_recording(self, circuit_breaker_manager):
        """Test recording HSM events."""
        # Record HSM signing success
        allowed = await circuit_breaker_manager.record_hsm_event(
            success=True,
            metadata={"operation": "transaction_signing", "provider": "aws_kms"}
        )
        assert allowed == True
        
        # Record HSM signing failure
        allowed = await circuit_breaker_manager.record_hsm_event(
            success=False,
            metadata={"operation": "transaction_signing", "error": "key_not_found"}
        )
        assert allowed == True  # Should allow first failure
        
        # Check HSM breaker recorded both events
        hsm_breaker = circuit_breaker_manager.breakers[CircuitBreakerType.HSM_FAILURE_RATE]
        assert hsm_breaker.total_events == 2
        assert hsm_breaker.failure_count == 1
    
    @pytest.mark.asyncio
    async def test_volatility_event_recording(self, circuit_breaker_manager):
        """Test recording market volatility events."""
        # Record low volatility (should be success)
        allowed = await circuit_breaker_manager.record_volatility_event(
            volatility_percent=Decimal("15.0"),
            metadata={"market_pair": "SOL/USDC"}
        )
        assert allowed == True
        
        # Record high volatility (should be failure)
        allowed = await circuit_breaker_manager.record_volatility_event(
            volatility_percent=Decimal("45.0"),
            metadata={"market_pair": "SOL/USDC"}
        )
        assert allowed == True  # Should allow first high volatility
        
        # Check volatility breaker recorded both events
        vol_breaker = circuit_breaker_manager.breakers[CircuitBreakerType.MARKET_VOLATILITY]
        assert vol_breaker.total_events == 2
        assert vol_breaker.failure_count == 1  # High volatility counts as failure
    
    def test_trading_allowed_check(self, circuit_breaker_manager):
        """Test trading allowed status check."""
        # Initially should allow trading
        allowed, reason = circuit_breaker_manager.is_trading_allowed()
        assert allowed == True
        assert reason is None
    
    @pytest.mark.asyncio
    async def test_trading_blocked_by_open_breaker(self, circuit_breaker_manager):
        """Test trading blocked when circuit breaker is open."""
        # Trip the trade failure breaker
        trade_breaker = circuit_breaker_manager.breakers[CircuitBreakerType.TRADE_FAILURE_RATE]
        
        # Record enough failures to trip the breaker
        for i in range(trade_breaker.config.consecutive_failure_limit):
            await circuit_breaker_manager.record_trade_event(
                success=False,
                metadata={"trade_id": f"failing_trade_{i}"}
            )
        
        # Check trading is blocked
        allowed, reason = circuit_breaker_manager.is_trading_allowed()
        assert allowed == False
        assert "Circuit breaker open" in reason
    
    @pytest.mark.asyncio
    async def test_system_halt_functionality(self, circuit_breaker_manager):
        """Test system-wide trading halt."""
        # Activate system halt
        await circuit_breaker_manager.activate_system_halt("emergency_test", duration_minutes=5)
        
        assert circuit_breaker_manager.system_halt_active == True
        assert circuit_breaker_manager.system_halt_reason == "emergency_test"
        
        # Check trading is blocked
        allowed, reason = circuit_breaker_manager.is_trading_allowed()
        assert allowed == False
        assert "System halt active" in reason
        
        # Deactivate system halt
        await circuit_breaker_manager.deactivate_system_halt("test_complete")
        
        assert circuit_breaker_manager.system_halt_active == False
        
        # Check trading is allowed again
        allowed, reason = circuit_breaker_manager.is_trading_allowed()
        assert allowed == True
    
    def test_system_status_reporting(self, circuit_breaker_manager):
        """Test comprehensive system status reporting."""
        status = circuit_breaker_manager.get_system_status()
        
        assert "trading_allowed" in status
        assert "total_breakers" in status
        assert status["total_breakers"] == 7
        assert "breaker_details" in status
        assert len(status["breaker_details"]) == 7
        
        # Check each breaker type is represented
        breaker_types = set(status["breaker_details"].keys())
        expected_types = {
            "trade_failure_rate",
            "network_connectivity", 
            "market_volatility",
            "slippage_rate",
            "hsm_failure_rate",
            "system_error_rate",
            "confirmation_timeout_rate"
        }
        assert breaker_types == expected_types
    
    @pytest.mark.asyncio
    async def test_manual_breaker_control(self, circuit_breaker_manager):
        """Test manual circuit breaker control."""
        # Force open a breaker
        result = await circuit_breaker_manager.force_open_breaker(
            CircuitBreakerType.TRADE_FAILURE_RATE,
            "manual_test"
        )
        assert result == True
        
        # Check it's open
        trade_breaker = circuit_breaker_manager.breakers[CircuitBreakerType.TRADE_FAILURE_RATE]
        assert trade_breaker.state == CircuitBreakerState.OPEN
        
        # Force close the breaker
        result = await circuit_breaker_manager.force_close_breaker(
            CircuitBreakerType.TRADE_FAILURE_RATE,
            "manual_test"
        )
        assert result == True
        
        # Check it's closed
        assert trade_breaker.state == CircuitBreakerState.CLOSED


class TestCircuitBreakerEvent:
    """Test circuit breaker event data structure."""
    
    def test_event_creation(self):
        """Test circuit breaker event creation."""
        event = CircuitBreakerEvent(
            breaker_type=CircuitBreakerType.TRADE_FAILURE_RATE,
            event_type="trade_execution",
            timestamp=datetime.now(timezone.utc),
            success=False,
            metadata={"trade_id": "test_001", "error": "insufficient_funds"}
        )
        
        assert event.breaker_type == CircuitBreakerType.TRADE_FAILURE_RATE
        assert event.event_type == "trade_execution"
        assert event.success == False
        assert event.metadata["trade_id"] == "test_001"
    
    def test_event_to_dict(self):
        """Test event dictionary conversion."""
        event = CircuitBreakerEvent(
            breaker_type=CircuitBreakerType.HSM_FAILURE_RATE,
            event_type="hsm_signing",
            timestamp=datetime.now(timezone.utc),
            success=True,
            metadata={"provider": "aws_kms"}
        )
        
        event_dict = event.to_dict()
        assert event_dict["breaker_type"] == "hsm_failure_rate"
        assert event_dict["event_type"] == "hsm_signing"
        assert event_dict["success"] == True
        assert "timestamp" in event_dict
        assert event_dict["metadata"]["provider"] == "aws_kms"


class TestMonitoringLoop:
    """Test background monitoring functionality."""
    
    @pytest.mark.asyncio
    async def test_monitoring_start_stop(self, circuit_breaker_manager):
        """Test starting and stopping monitoring loop."""
        # Start monitoring
        await circuit_breaker_manager.start_monitoring()
        assert circuit_breaker_manager.monitoring_active == True
        assert circuit_breaker_manager.monitoring_task is not None
        
        # Stop monitoring
        await circuit_breaker_manager.stop_monitoring()
        assert circuit_breaker_manager.monitoring_active == False
    
    @pytest.mark.asyncio
    async def test_recovery_monitoring(self, circuit_breaker_manager):
        """Test automatic recovery monitoring."""
        # Trip a breaker
        trade_breaker = circuit_breaker_manager.breakers[CircuitBreakerType.TRADE_FAILURE_RATE]
        for i in range(trade_breaker.config.consecutive_failure_limit):
            await circuit_breaker_manager.record_trade_event(success=False)
        
        assert trade_breaker.state == CircuitBreakerState.OPEN
        
        # Simulate time passing for recovery
        trade_breaker.opened_at = datetime.now(timezone.utc) - timedelta(
            minutes=trade_breaker.config.recovery_timeout_minutes + 1
        )
        
        # Trigger recovery check
        await circuit_breaker_manager._check_recovery_conditions()
        
        # Should transition to half-open
        assert trade_breaker.state == CircuitBreakerState.HALF_OPEN


if __name__ == "__main__":
    # Run basic test to verify imports work
    print("Testing CircuitBreakerManager imports...")
    manager = CircuitBreakerManager()
    print(f"✅ CircuitBreakerManager initialized with {len(manager.breakers)} breakers")
    print("✅ All imports successful!")