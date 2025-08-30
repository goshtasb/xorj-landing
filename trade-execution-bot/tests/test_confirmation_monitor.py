"""
Test Suite for Confirmation Monitor (SR-3: Transaction Confirmation & Error Handling).

Tests comprehensive transaction confirmation monitoring including:
- Confirmation depth requirements
- Stuck transaction detection
- Retry mechanisms with exponential backoff
- Error classification and handling
- Transaction replacement for failed transactions
- Comprehensive audit logging
"""

import pytest
import asyncio
from decimal import Decimal
from datetime import datetime, timezone, timedelta
from unittest.mock import Mock, patch, AsyncMock

from app.security.confirmation_monitor import (
    ConfirmationMonitor,
    TransactionMonitor,
    ConfirmationRequirement,
    TransactionState,
    ErrorType,
    RetryStrategy
)
from app.models.trades import GeneratedTrade, SwapInstruction, TradeType, TradeStatus


@pytest.fixture
def confirmation_monitor():
    """Create ConfirmationMonitor instance for testing."""
    return ConfirmationMonitor()


@pytest.fixture
def sample_trade():
    """Create sample trade for testing."""
    swap_instruction = SwapInstruction(
        from_token_symbol="USDC",
        to_token_symbol="JUP",
        from_mint="EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        to_mint="JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
        from_amount=Decimal("1000.0"),
        max_slippage_percent=Decimal("1.0")
    )
    
    return GeneratedTrade(
        trade_id="test_trade_001",
        user_id="test_user_001",
        vault_address="test_vault_address",
        trade_type=TradeType.SWAP,
        swap_instruction=swap_instruction,
        rationale="Test trade for confirmation monitoring"
    )


class TestConfirmationRequirements:
    """Test confirmation requirement logic based on trade value."""
    
    def test_high_value_trade_requirements(self):
        """Test confirmation requirements for high-value trades."""
        req = ConfirmationRequirement.for_trade_value(Decimal("15000"))  # $15k
        
        assert req.min_confirmations == 3
        assert req.max_wait_time_seconds == 300  # 5 minutes
        assert req.require_finalization == True
    
    def test_medium_value_trade_requirements(self):
        """Test confirmation requirements for medium-value trades."""
        req = ConfirmationRequirement.for_trade_value(Decimal("2500"))  # $2.5k
        
        assert req.min_confirmations == 2
        assert req.max_wait_time_seconds == 180  # 3 minutes
        assert req.require_finalization == False
    
    def test_low_value_trade_requirements(self):
        """Test confirmation requirements for low-value trades.""" 
        req = ConfirmationRequirement.for_trade_value(Decimal("500"))  # $500
        
        assert req.min_confirmations == 1
        assert req.max_wait_time_seconds == 120  # 2 minutes
        assert req.require_finalization == False
    
    def test_small_value_trade_requirements(self):
        """Test confirmation requirements for small trades."""
        req = ConfirmationRequirement.for_trade_value(Decimal("50"))  # $50
        
        assert req.min_confirmations == 1
        assert req.max_wait_time_seconds == 60  # 1 minute
        assert req.require_finalization == False


class TestTransactionMonitor:
    """Test TransactionMonitor data structure and logic."""
    
    def test_transaction_monitor_creation(self):
        """Test TransactionMonitor creation and default values."""
        monitor = TransactionMonitor(
            trade_id="test_001",
            user_id="user_001",
            transaction_signature="test_sig_001",
            submitted_at=datetime.now(timezone.utc)
        )
        
        assert monitor.current_state == TransactionState.SUBMITTED
        assert monitor.confirmations == 0
        assert monitor.finalized == False
        assert monitor.error_count == 0
        assert monitor.retry_count == 0
    
    def test_confirmation_check_logic(self):
        """Test is_confirmed property logic."""
        # Create monitor with requirement for 2 confirmations
        monitor = TransactionMonitor(
            trade_id="test_001",
            user_id="user_001", 
            transaction_signature="test_sig_001",
            submitted_at=datetime.now(timezone.utc),
            confirmation_requirement=ConfirmationRequirement(
                min_confirmations=2,
                max_wait_time_seconds=120,
                require_finalization=False
            )
        )
        
        # Not confirmed with 0 confirmations
        assert monitor.is_confirmed == False
        
        # Not confirmed with 1 confirmation
        monitor.confirmations = 1
        assert monitor.is_confirmed == False
        
        # Confirmed with 2 confirmations
        monitor.confirmations = 2
        assert monitor.is_confirmed == True
    
    def test_finalization_requirement(self):
        """Test finalization requirement logic."""
        monitor = TransactionMonitor(
            trade_id="test_001",
            user_id="user_001",
            transaction_signature="test_sig_001",
            submitted_at=datetime.now(timezone.utc),
            confirmation_requirement=ConfirmationRequirement(
                min_confirmations=1,
                max_wait_time_seconds=120,
                require_finalization=True
            )
        )
        
        # Not confirmed without finalization
        monitor.confirmations = 3
        monitor.finalized = False
        assert monitor.is_confirmed == False
        
        # Confirmed with finalization
        monitor.finalized = True
        assert monitor.is_confirmed == True
    
    def test_expiration_check(self):
        """Test transaction expiration logic."""
        old_time = datetime.now(timezone.utc) - timedelta(minutes=5)
        monitor = TransactionMonitor(
            trade_id="test_001",
            user_id="user_001",
            transaction_signature="test_sig_001", 
            submitted_at=old_time,
            confirmation_requirement=ConfirmationRequirement(
                min_confirmations=1,
                max_wait_time_seconds=60,  # 1 minute max
                require_finalization=False
            )
        )
        
        assert monitor.is_expired == True
    
    def test_stuck_transaction_detection(self):
        """Test stuck transaction detection."""
        old_time = datetime.now(timezone.utc) - timedelta(minutes=3)
        monitor = TransactionMonitor(
            trade_id="test_001",
            user_id="user_001",
            transaction_signature="test_sig_001",
            submitted_at=old_time,
            current_state=TransactionState.PENDING,
            confirmations=0  # No confirmations after 3 minutes
        )
        
        assert monitor.is_stuck == True
    
    def test_retry_logic(self):
        """Test retry decision logic."""
        monitor = TransactionMonitor(
            trade_id="test_001",
            user_id="user_001",
            transaction_signature="test_sig_001",
            submitted_at=datetime.now(timezone.utc),
            current_state=TransactionState.FAILED,
            retry_count=2,
            max_retries=5
        )
        
        # Should retry failed transaction
        assert monitor.should_retry == True
        
        # Should not retry after max retries
        monitor.retry_count = 5
        assert monitor.should_retry == False
        
        # Should not retry confirmed transaction
        monitor.retry_count = 2
        monitor.current_state = TransactionState.CONFIRMED
        assert monitor.should_retry == False


class TestConfirmationMonitoring:
    """Test confirmation monitoring core functionality."""
    
    @pytest.mark.asyncio
    async def test_monitor_transaction_creation(self, confirmation_monitor, sample_trade):
        """Test starting transaction monitoring."""
        transaction_sig = "test_signature_12345"
        trade_value = Decimal("1000.0")
        
        # Mock audit logger to avoid database calls
        with patch.object(confirmation_monitor.audit_logger, 'log_system_event', new_callable=AsyncMock):
            monitor_id = await confirmation_monitor.monitor_transaction(
                trade=sample_trade,
                transaction_signature=transaction_sig,
                trade_value_usd=trade_value
            )
            
            assert monitor_id.startswith(sample_trade.trade_id)
            assert monitor_id.endswith(transaction_sig[:8])
            
            # Check monitor was created
            assert monitor_id in confirmation_monitor.active_monitors
            monitor = confirmation_monitor.active_monitors[monitor_id]
            assert monitor.trade_id == sample_trade.trade_id
            assert monitor.transaction_signature == transaction_sig
    
    @pytest.mark.asyncio
    async def test_transaction_status_checking(self, confirmation_monitor):
        """Test transaction status checking and updates."""
        # Create a test monitor
        monitor = TransactionMonitor(
            trade_id="test_001",
            user_id="user_001",
            transaction_signature="test_sig_001",
            submitted_at=datetime.now(timezone.utc)
        )
        
        # Mock successful transaction status
        mock_status = {
            "confirmations": 2,
            "block_height": 150000500,
            "finalized": False,
            "pending": False,
            "failed": False
        }
        
        with patch.object(confirmation_monitor, '_query_transaction_status', return_value=mock_status):
            status_changed = await confirmation_monitor._check_transaction_status(monitor)
            
            assert status_changed == True
            assert monitor.confirmations == 2
            assert monitor.block_height == 150000500
            assert monitor.current_state == TransactionState.CONFIRMED
    
    @pytest.mark.asyncio 
    async def test_failed_transaction_handling(self, confirmation_monitor):
        """Test handling of failed transactions."""
        monitor = TransactionMonitor(
            trade_id="test_001",
            user_id="user_001",
            transaction_signature="test_sig_001",
            submitted_at=datetime.now(timezone.utc)
        )
        
        # Mock failed transaction status
        mock_status = {
            "confirmations": 0,
            "block_height": None,
            "finalized": False,
            "pending": False,
            "failed": True,
            "error": {
                "type": "InsufficientFunds",
                "message": "Transaction failed: Insufficient funds"
            }
        }
        
        with patch.object(confirmation_monitor, '_query_transaction_status', return_value=mock_status):
            with patch.object(confirmation_monitor, '_handle_failed_transaction', new_callable=AsyncMock) as mock_handler:
                await confirmation_monitor._check_transaction_status(monitor)
                
                assert monitor.current_state == TransactionState.FAILED
                assert monitor.last_error == ErrorType.INSUFFICIENT_FUNDS
                assert monitor.error_count == 1


class TestErrorHandling:
    """Test error classification and handling."""
    
    def test_error_classification(self, confirmation_monitor):
        """Test error type classification from error messages."""
        test_cases = [
            ({"message": "insufficient funds"}, ErrorType.INSUFFICIENT_FUNDS),
            ({"message": "slippage tolerance exceeded"}, ErrorType.SLIPPAGE_EXCEEDED),
            ({"message": "program error occurred"}, ErrorType.PROGRAM_ERROR),
            ({"message": "compute budget exceeded"}, ErrorType.COMPUTE_BUDGET_EXCEEDED),
            ({"message": "blockhash expired"}, ErrorType.BLOCKHASH_EXPIRED),
            ({"message": "network connection failed"}, ErrorType.NETWORK_ERROR),
            ({"message": "rate limited"}, ErrorType.RATE_LIMITED),
            ({"message": "timeout occurred"}, ErrorType.TIMEOUT_ERROR),
            ({"message": "unknown error"}, ErrorType.UNKNOWN_ERROR)
        ]
        
        for error_info, expected_type in test_cases:
            result = confirmation_monitor._classify_error(error_info)
            assert result == expected_type
    
    def test_retry_strategy_mapping(self, confirmation_monitor):
        """Test retry strategies for different error types."""
        strategy_map = confirmation_monitor.error_retry_strategies
        
        # No retry errors
        assert strategy_map[ErrorType.INSUFFICIENT_FUNDS] == RetryStrategy.NO_RETRY
        assert strategy_map[ErrorType.SLIPPAGE_EXCEEDED] == RetryStrategy.NO_RETRY
        
        # Exponential backoff errors
        assert strategy_map[ErrorType.NETWORK_ERROR] == RetryStrategy.EXPONENTIAL_BACKOFF
        assert strategy_map[ErrorType.RATE_LIMITED] == RetryStrategy.EXPONENTIAL_BACKOFF
        
        # Transaction replacement errors
        assert strategy_map[ErrorType.BLOCKHASH_EXPIRED] == RetryStrategy.REPLACE_TRANSACTION
        assert strategy_map[ErrorType.COMPUTE_BUDGET_EXCEEDED] == RetryStrategy.REPLACE_TRANSACTION


class TestRetryMechanisms:
    """Test retry mechanisms with different backoff strategies."""
    
    @pytest.mark.asyncio
    async def test_exponential_backoff_scheduling(self, confirmation_monitor):
        """Test exponential backoff retry scheduling."""
        monitor = TransactionMonitor(
            trade_id="test_001",
            user_id="user_001",
            transaction_signature="test_sig_001",
            submitted_at=datetime.now(timezone.utc),
            last_error=ErrorType.NETWORK_ERROR
        )
        
        with patch.object(confirmation_monitor.audit_logger, 'log_system_event', new_callable=AsyncMock):
            # First retry
            await confirmation_monitor._schedule_retry(monitor, RetryStrategy.EXPONENTIAL_BACKOFF)
            assert monitor.retry_count == 1
            
            first_delay = (monitor.next_retry_at - datetime.now(timezone.utc)).total_seconds()
            expected_first = confirmation_monitor.initial_retry_delay * 2  # 5 * 2 = 10
            assert abs(first_delay - expected_first) < 2  # Allow 2 second tolerance
            
            # Second retry should have longer delay
            await confirmation_monitor._schedule_retry(monitor, RetryStrategy.EXPONENTIAL_BACKOFF)
            assert monitor.retry_count == 2
            
            second_delay = (monitor.next_retry_at - datetime.now(timezone.utc)).total_seconds()
            expected_second = confirmation_monitor.initial_retry_delay * 4  # 5 * 4 = 20
            assert abs(second_delay - expected_second) < 2
    
    @pytest.mark.asyncio
    async def test_max_retry_limit(self, confirmation_monitor):
        """Test maximum retry limit enforcement."""
        monitor = TransactionMonitor(
            trade_id="test_001",
            user_id="user_001",
            transaction_signature="test_sig_001",
            submitted_at=datetime.now(timezone.utc),
            current_state=TransactionState.FAILED,
            retry_count=5,  # At max retries
            max_retries=5
        )
        
        # Should not retry after max attempts
        assert monitor.should_retry == False
    
    @pytest.mark.asyncio
    async def test_linear_backoff_scheduling(self, confirmation_monitor):
        """Test linear backoff retry scheduling."""
        monitor = TransactionMonitor(
            trade_id="test_001",
            user_id="user_001",
            transaction_signature="test_sig_001",
            submitted_at=datetime.now(timezone.utc),
            last_error=ErrorType.PROGRAM_ERROR
        )
        
        with patch.object(confirmation_monitor.audit_logger, 'log_system_event', new_callable=AsyncMock):
            # First retry
            await confirmation_monitor._schedule_retry(monitor, RetryStrategy.LINEAR_BACKOFF)
            assert monitor.retry_count == 1
            
            first_delay = (monitor.next_retry_at - datetime.now(timezone.utc)).total_seconds()
            expected = confirmation_monitor.initial_retry_delay * 1  # 5 * 1 = 5
            assert abs(first_delay - expected) < 2
            
            # Second retry
            await confirmation_monitor._schedule_retry(monitor, RetryStrategy.LINEAR_BACKOFF)
            assert monitor.retry_count == 2
            
            second_delay = (monitor.next_retry_at - datetime.now(timezone.utc)).total_seconds()
            expected = confirmation_monitor.initial_retry_delay * 2  # 5 * 2 = 10
            assert abs(second_delay - expected) < 2


class TestMonitoringLifecycle:
    """Test monitoring lifecycle management."""
    
    @pytest.mark.asyncio
    async def test_monitoring_start_stop(self, confirmation_monitor):
        """Test starting and stopping monitoring loop."""
        # Start monitoring
        await confirmation_monitor.start_monitoring()
        assert confirmation_monitor.monitoring_active == True
        assert confirmation_monitor.monitoring_task is not None
        
        # Stop monitoring
        await confirmation_monitor.stop_monitoring()
        assert confirmation_monitor.monitoring_active == False
    
    @pytest.mark.asyncio
    async def test_get_transaction_status(self, confirmation_monitor, sample_trade):
        """Test retrieving transaction status."""
        # Create a monitor
        monitor = TransactionMonitor(
            trade_id=sample_trade.trade_id,
            user_id=sample_trade.user_id,
            transaction_signature="test_sig_001",
            submitted_at=datetime.now(timezone.utc)
        )
        
        monitor_id = f"{sample_trade.trade_id}_test_sig"
        confirmation_monitor.active_monitors[monitor_id] = monitor
        
        # Get status
        status = await confirmation_monitor.get_transaction_status(monitor_id)
        assert status is not None
        assert status["trade_id"] == sample_trade.trade_id
        assert status["current_state"] == TransactionState.SUBMITTED.value
    
    @pytest.mark.asyncio
    async def test_force_complete_monitoring(self, confirmation_monitor, sample_trade):
        """Test force completing transaction monitoring."""
        monitor = TransactionMonitor(
            trade_id=sample_trade.trade_id,
            user_id=sample_trade.user_id,
            transaction_signature="test_sig_001",
            submitted_at=datetime.now(timezone.utc)
        )
        
        monitor_id = f"{sample_trade.trade_id}_test_sig"
        confirmation_monitor.active_monitors[monitor_id] = monitor
        
        with patch.object(confirmation_monitor.audit_logger, 'log_system_event', new_callable=AsyncMock):
            # Force complete
            result = await confirmation_monitor.force_complete_monitoring(monitor_id, "test_override")
            
            assert result == True
            assert monitor_id not in confirmation_monitor.active_monitors
            assert monitor.completed_at is not None


if __name__ == "__main__":
    # Run basic test to verify imports work
    print("Testing ConfirmationMonitor imports...")
    monitor = ConfirmationMonitor()
    print(f"✅ ConfirmationMonitor initialized with {len(monitor.error_retry_strategies)} error strategies")
    print("✅ All imports successful!")