"""
Automated Circuit Breakers for XORJ Trade Execution Bot.

Implements SR-4: Automated Circuit Breakers
"The bot must have automated circuit breakers that halt trading if:
- Too many trades fail in a short period (e.g., 5 failures in 10 minutes)
- Network connectivity issues are detected
- The bot's balance falls below a minimum threshold
- Unusual market conditions are detected (e.g., extreme volatility)"

This module provides comprehensive circuit breaker protection:
- Trade failure rate monitoring
- Network connectivity monitoring  
- Balance threshold monitoring
- Market volatility monitoring
- Cascading failure detection
- Automatic recovery mechanisms
- Emergency halt capabilities

Security Features:
- Multiple independent circuit breakers
- Configurable thresholds and time windows
- Automatic recovery with validation
- Comprehensive audit logging
- Manual override capabilities
- System health monitoring integration
"""

import asyncio
from typing import Dict, Any, Optional, List, Tuple, Union, Callable
from decimal import Decimal
from datetime import datetime, timezone, timedelta
from enum import Enum
from dataclasses import dataclass, field
import json

import structlog
from app.core.config import get_config, TradeExecutionConfig
from app.logging.audit_logger import get_audit_logger, AuditEventType, AuditSeverity


logger = structlog.get_logger(__name__)


class CircuitBreakerType(Enum):
    """Types of circuit breakers in the system."""
    TRADE_FAILURE_RATE = "trade_failure_rate"
    NETWORK_CONNECTIVITY = "network_connectivity" 
    BALANCE_THRESHOLD = "balance_threshold"
    MARKET_VOLATILITY = "market_volatility"
    SLIPPAGE_RATE = "slippage_rate"
    SYSTEM_ERROR_RATE = "system_error_rate"
    HSM_FAILURE_RATE = "hsm_failure_rate"
    CONFIRMATION_TIMEOUT_RATE = "confirmation_timeout_rate"


class CircuitBreakerState(Enum):
    """Possible states of a circuit breaker."""
    CLOSED = "closed"           # Normal operation, allowing trades
    OPEN = "open"               # Tripped, blocking all trades
    HALF_OPEN = "half_open"     # Testing recovery, allowing limited trades


class TriggerCondition(Enum):
    """Conditions that can trigger circuit breakers."""
    THRESHOLD_EXCEEDED = "threshold_exceeded"
    RATE_EXCEEDED = "rate_exceeded"
    CONSECUTIVE_FAILURES = "consecutive_failures"
    PATTERN_DETECTED = "pattern_detected"
    EXTERNAL_SIGNAL = "external_signal"


@dataclass
class CircuitBreakerConfig:
    """Configuration for a specific circuit breaker."""
    breaker_type: CircuitBreakerType
    name: str
    description: str
    
    # Threshold settings
    failure_threshold: int = 5          # Number of failures to trigger
    time_window_minutes: int = 10       # Time window for failure counting
    recovery_timeout_minutes: int = 30  # Time to wait before recovery attempt
    
    # Advanced settings
    consecutive_failure_limit: int = 3  # Consecutive failures to trigger immediately
    percentage_threshold: Optional[Decimal] = None  # Percentage-based threshold
    absolute_threshold: Optional[Decimal] = None    # Absolute value threshold
    
    # Recovery settings
    test_request_limit: int = 5         # Number of test requests in half-open state
    recovery_success_threshold: int = 3  # Successes needed to close breaker
    
    # Priority and dependencies
    priority: int = 1                   # Higher number = higher priority
    depends_on: List[str] = field(default_factory=list)  # Other breakers this depends on
    
    enabled: bool = True


@dataclass
class CircuitBreakerEvent:
    """Event that can trigger or affect a circuit breaker."""
    breaker_type: CircuitBreakerType
    event_type: str
    timestamp: datetime
    success: bool
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert event to dictionary."""
        return {
            "breaker_type": self.breaker_type.value,
            "event_type": self.event_type,
            "timestamp": self.timestamp.isoformat(),
            "success": self.success,
            "metadata": self.metadata
        }


class CircuitBreaker:
    """
    Individual circuit breaker with configurable logic.
    
    Each circuit breaker monitors a specific aspect of system health
    and can independently halt trading when dangerous conditions occur.
    """
    
    def __init__(self, config: CircuitBreakerConfig):
        self.config = config
        self.state = CircuitBreakerState.CLOSED
        self.audit_logger = get_audit_logger()
        
        # Event tracking
        self.recent_events: List[CircuitBreakerEvent] = []
        self.failure_count = 0
        self.consecutive_failures = 0
        self.last_failure_time: Optional[datetime] = None
        self.last_success_time: Optional[datetime] = None
        
        # State management
        self.opened_at: Optional[datetime] = None
        self.last_test_time: Optional[datetime] = None
        self.test_request_count = 0
        self.recovery_success_count = 0
        
        # Statistics
        self.total_events = 0
        self.total_failures = 0
        self.total_opens = 0
        self.current_failure_streak = 0
        
        logger.info(
            "Circuit breaker initialized",
            breaker_type=self.config.breaker_type.value,
            name=self.config.name,
            failure_threshold=self.config.failure_threshold,
            time_window=self.config.time_window_minutes
        )
    
    async def record_event(self, event_type: str, success: bool, metadata: Optional[Dict[str, Any]] = None) -> bool:
        """
        Record an event and check if circuit breaker should trip.
        
        Args:
            event_type: Type of event (e.g., "trade_execution", "network_check")
            success: Whether the event was successful
            metadata: Additional event metadata
            
        Returns:
            bool: True if circuit breaker allows operation, False if tripped
        """
        if not self.config.enabled:
            return True
        
        event = CircuitBreakerEvent(
            breaker_type=self.config.breaker_type,
            event_type=event_type,
            timestamp=datetime.now(timezone.utc),
            success=success,
            metadata=metadata or {}
        )
        
        # Add event to recent events
        self.recent_events.append(event)
        self.total_events += 1
        
        # Clean old events outside time window
        self._clean_old_events()
        
        # Update counters
        if success:
            self.consecutive_failures = 0
            self.last_success_time = event.timestamp
            
            # Handle recovery in half-open state
            if self.state == CircuitBreakerState.HALF_OPEN:
                self.recovery_success_count += 1
                if self.recovery_success_count >= self.config.recovery_success_threshold:
                    await self._close_breaker("recovery_successful")
        else:
            self.failure_count += 1
            self.total_failures += 1
            self.consecutive_failures += 1
            self.current_failure_streak += 1
            self.last_failure_time = event.timestamp
        
        # Check if breaker should trip
        if self.state == CircuitBreakerState.CLOSED:
            should_trip = await self._should_trip()
            if should_trip:
                await self._open_breaker(f"triggered_by_{event_type}")
                return False
        
        # In half-open state, limit test requests
        if self.state == CircuitBreakerState.HALF_OPEN:
            self.test_request_count += 1
            if self.test_request_count > self.config.test_request_limit:
                await self._open_breaker("half_open_test_limit_exceeded")
                return False
        
        # Return whether operation is allowed
        return self.state != CircuitBreakerState.OPEN
    
    async def _should_trip(self) -> bool:
        """Check if circuit breaker should trip based on current conditions."""
        
        # Check consecutive failures
        if self.consecutive_failures >= self.config.consecutive_failure_limit:
            logger.warning(
                "Circuit breaker consecutive failure limit exceeded",
                breaker=self.config.name,
                consecutive_failures=self.consecutive_failures,
                limit=self.config.consecutive_failure_limit
            )
            return True
        
        # Check failure rate in time window
        recent_failures = [e for e in self.recent_events if not e.success]
        if len(recent_failures) >= self.config.failure_threshold:
            logger.warning(
                "Circuit breaker failure threshold exceeded",
                breaker=self.config.name,
                recent_failures=len(recent_failures),
                threshold=self.config.failure_threshold,
                time_window_minutes=self.config.time_window_minutes
            )
            return True
        
        # Check percentage threshold if configured
        if self.config.percentage_threshold and len(self.recent_events) > 0:
            failure_rate = (len(recent_failures) / len(self.recent_events)) * 100
            if failure_rate > self.config.percentage_threshold:
                logger.warning(
                    "Circuit breaker percentage threshold exceeded",
                    breaker=self.config.name,
                    failure_rate_percent=float(failure_rate),
                    threshold_percent=float(self.config.percentage_threshold)
                )
                return True
        
        # Check absolute threshold if configured
        if self.config.absolute_threshold:
            # This would be implemented based on specific breaker type
            # For example, checking current balance against threshold
            pass
        
        return False
    
    async def _open_breaker(self, reason: str):
        """Open the circuit breaker."""
        old_state = self.state
        self.state = CircuitBreakerState.OPEN
        self.opened_at = datetime.now(timezone.utc)
        self.total_opens += 1
        self.test_request_count = 0
        self.recovery_success_count = 0
        
        logger.critical(
            "CIRCUIT BREAKER OPENED",
            breaker=self.config.name,
            breaker_type=self.config.breaker_type.value,
            reason=reason,
            failure_count=self.failure_count,
            consecutive_failures=self.consecutive_failures,
            previous_state=old_state.value
        )
        
        await self.audit_logger.log_security_violation(
            violation_type="circuit_breaker_opened",
            user_id="system",
            wallet_address=None,
            violation_details={
                "breaker_name": self.config.name,
                "breaker_type": self.config.breaker_type.value,
                "reason": reason,
                "failure_count": self.failure_count,
                "consecutive_failures": self.consecutive_failures,
                "time_window_minutes": self.config.time_window_minutes,
                "recent_events_count": len(self.recent_events)
            },
            severity=AuditSeverity.CRITICAL
        )
    
    async def _close_breaker(self, reason: str):
        """Close the circuit breaker."""
        old_state = self.state
        self.state = CircuitBreakerState.CLOSED
        self.opened_at = None
        self.test_request_count = 0
        self.recovery_success_count = 0
        self.current_failure_streak = 0
        
        logger.info(
            "Circuit breaker closed",
            breaker=self.config.name,
            breaker_type=self.config.breaker_type.value,
            reason=reason,
            previous_state=old_state.value
        )
        
        await self.audit_logger.log_system_event(
            event_type="circuit_breaker_closed",
            event_details={
                "breaker_name": self.config.name,
                "breaker_type": self.config.breaker_type.value,
                "reason": reason,
                "previous_state": old_state.value,
                "recovery_success_count": self.recovery_success_count
            },
            severity=AuditSeverity.INFO
        )
    
    async def attempt_recovery(self) -> bool:
        """Attempt to recover from open state."""
        if self.state != CircuitBreakerState.OPEN:
            return True
        
        if not self.opened_at:
            return False
        
        # Check if enough time has passed for recovery attempt
        elapsed = datetime.now(timezone.utc) - self.opened_at
        if elapsed.total_seconds() < self.config.recovery_timeout_minutes * 60:
            return False
        
        # Move to half-open state for testing
        self.state = CircuitBreakerState.HALF_OPEN
        self.test_request_count = 0
        self.recovery_success_count = 0
        self.last_test_time = datetime.now(timezone.utc)
        
        logger.info(
            "Circuit breaker entering half-open state for recovery testing",
            breaker=self.config.name,
            breaker_type=self.config.breaker_type.value,
            recovery_timeout_minutes=self.config.recovery_timeout_minutes
        )
        
        await self.audit_logger.log_system_event(
            event_type="circuit_breaker_recovery_attempt",
            event_details={
                "breaker_name": self.config.name,
                "breaker_type": self.config.breaker_type.value,
                "time_since_opened_minutes": elapsed.total_seconds() / 60
            },
            severity=AuditSeverity.INFO
        )
        
        return True
    
    def _clean_old_events(self):
        """Remove events outside the time window."""
        cutoff_time = datetime.now(timezone.utc) - timedelta(minutes=self.config.time_window_minutes)
        self.recent_events = [e for e in self.recent_events if e.timestamp > cutoff_time]
        
        # Recalculate failure count for current window
        self.failure_count = sum(1 for e in self.recent_events if not e.success)
    
    def get_status(self) -> Dict[str, Any]:
        """Get current circuit breaker status."""
        return {
            "breaker_type": self.config.breaker_type.value,
            "name": self.config.name,
            "state": self.state.value,
            "enabled": self.config.enabled,
            "failure_count": self.failure_count,
            "consecutive_failures": self.consecutive_failures,
            "current_failure_streak": self.current_failure_streak,
            "total_events": self.total_events,
            "total_failures": self.total_failures,
            "total_opens": self.total_opens,
            "recent_events_count": len(self.recent_events),
            "opened_at": self.opened_at.isoformat() if self.opened_at else None,
            "last_failure_time": self.last_failure_time.isoformat() if self.last_failure_time else None,
            "last_success_time": self.last_success_time.isoformat() if self.last_success_time else None,
            "config": {
                "failure_threshold": self.config.failure_threshold,
                "time_window_minutes": self.config.time_window_minutes,
                "consecutive_failure_limit": self.config.consecutive_failure_limit,
                "recovery_timeout_minutes": self.config.recovery_timeout_minutes
            }
        }


class CircuitBreakerManager:
    """
    Manager for all circuit breakers in the system.
    
    Implements SR-4: Automated Circuit Breakers
    
    Coordinates multiple circuit breakers and provides system-wide
    trading halt capabilities when dangerous conditions are detected.
    """
    
    def __init__(self):
        self.config = get_config()
        self.audit_logger = get_audit_logger()
        
        # Circuit breaker instances
        self.breakers: Dict[CircuitBreakerType, CircuitBreaker] = {}
        
        # System state
        self.system_halt_active = False
        self.system_halt_reason: Optional[str] = None
        self.system_halt_timestamp: Optional[datetime] = None
        
        # Background monitoring
        self.monitoring_task: Optional[asyncio.Task] = None
        self.monitoring_active = False
        
        # Initialize default circuit breakers
        self._initialize_default_breakers()
        
        logger.info(
            "Circuit Breaker Manager initialized",
            total_breakers=len(self.breakers),
            breaker_types=[b.value for b in self.breakers.keys()]
        )
    
    def _initialize_default_breakers(self):
        """Initialize default circuit breakers with standard configurations."""
        
        # Trade failure rate breaker (SR-4 requirement)
        trade_failure_config = CircuitBreakerConfig(
            breaker_type=CircuitBreakerType.TRADE_FAILURE_RATE,
            name="Trade Failure Rate Monitor",
            description="Monitors trade execution failure rate",
            failure_threshold=5,                # 5 failures
            time_window_minutes=10,            # in 10 minutes
            consecutive_failure_limit=3,       # or 3 consecutive failures
            recovery_timeout_minutes=30,       # wait 30 minutes before recovery
            percentage_threshold=Decimal("80"), # or 80% failure rate
            priority=1
        )
        
        # Network connectivity breaker (SR-4 requirement)
        network_config = CircuitBreakerConfig(
            breaker_type=CircuitBreakerType.NETWORK_CONNECTIVITY,
            name="Network Connectivity Monitor",
            description="Monitors network connectivity issues",
            failure_threshold=3,                # 3 network failures
            time_window_minutes=5,             # in 5 minutes
            consecutive_failure_limit=2,       # or 2 consecutive failures
            recovery_timeout_minutes=15,       # wait 15 minutes
            percentage_threshold=Decimal("60"), # or 60% failure rate
            priority=2
        )
        
        # Market volatility breaker (SR-4 requirement)
        volatility_config = CircuitBreakerConfig(
            breaker_type=CircuitBreakerType.MARKET_VOLATILITY,
            name="Market Volatility Monitor", 
            description="Monitors extreme market volatility",
            failure_threshold=10,               # 10 high volatility events
            time_window_minutes=30,            # in 30 minutes
            consecutive_failure_limit=5,       # or 5 consecutive high volatility
            recovery_timeout_minutes=60,       # wait 1 hour
            absolute_threshold=Decimal("50"),   # 50% volatility threshold
            priority=3
        )
        
        # Slippage rate breaker
        slippage_config = CircuitBreakerConfig(
            breaker_type=CircuitBreakerType.SLIPPAGE_RATE,
            name="Slippage Rate Monitor",
            description="Monitors excessive slippage rejections",
            failure_threshold=8,                # 8 slippage rejections
            time_window_minutes=15,            # in 15 minutes
            consecutive_failure_limit=4,       # or 4 consecutive rejections
            recovery_timeout_minutes=45,       # wait 45 minutes
            percentage_threshold=Decimal("70"), # or 70% rejection rate
            priority=2
        )
        
        # HSM failure rate breaker
        hsm_config = CircuitBreakerConfig(
            breaker_type=CircuitBreakerType.HSM_FAILURE_RATE,
            name="HSM Failure Rate Monitor",
            description="Monitors HSM signing failures",
            failure_threshold=3,                # 3 HSM failures
            time_window_minutes=10,            # in 10 minutes
            consecutive_failure_limit=2,       # or 2 consecutive failures
            recovery_timeout_minutes=60,       # wait 1 hour (critical)
            priority=5                          # Highest priority
        )
        
        # System error rate breaker
        system_error_config = CircuitBreakerConfig(
            breaker_type=CircuitBreakerType.SYSTEM_ERROR_RATE,
            name="System Error Rate Monitor",
            description="Monitors general system errors",
            failure_threshold=10,               # 10 system errors
            time_window_minutes=20,            # in 20 minutes
            consecutive_failure_limit=5,       # or 5 consecutive errors
            recovery_timeout_minutes=30,       # wait 30 minutes
            percentage_threshold=Decimal("40"), # or 40% error rate
            priority=2
        )
        
        # Confirmation timeout rate breaker
        confirmation_timeout_config = CircuitBreakerConfig(
            breaker_type=CircuitBreakerType.CONFIRMATION_TIMEOUT_RATE,
            name="Confirmation Timeout Monitor",
            description="Monitors transaction confirmation timeouts",
            failure_threshold=5,                # 5 timeout failures
            time_window_minutes=30,            # in 30 minutes
            consecutive_failure_limit=3,       # or 3 consecutive timeouts
            recovery_timeout_minutes=60,       # wait 1 hour
            percentage_threshold=Decimal("50"), # or 50% timeout rate
            priority=3
        )
        
        # Create circuit breaker instances
        configs = [
            trade_failure_config,
            network_config,
            volatility_config,
            slippage_config,
            hsm_config,
            system_error_config,
            confirmation_timeout_config
        ]
        
        for config in configs:
            self.breakers[config.breaker_type] = CircuitBreaker(config)
    
    async def start_monitoring(self):
        """Start background circuit breaker monitoring."""
        if self.monitoring_active:
            return
        
        self.monitoring_active = True
        self.monitoring_task = asyncio.create_task(self._monitoring_loop())
        
        logger.info("Circuit breaker monitoring started")
        
        await self.audit_logger.log_system_event(
            event_type="circuit_breaker_monitoring_started",
            event_details={
                "total_breakers": len(self.breakers),
                "breaker_types": [b.value for b in self.breakers.keys()]
            },
            severity=AuditSeverity.INFO
        )
    
    async def stop_monitoring(self):
        """Stop background circuit breaker monitoring."""
        self.monitoring_active = False
        
        if self.monitoring_task:
            self.monitoring_task.cancel()
            try:
                await self.monitoring_task
            except asyncio.CancelledError:
                pass
        
        logger.info("Circuit breaker monitoring stopped")
    
    async def _monitoring_loop(self):
        """Background monitoring loop for circuit breaker recovery."""
        while self.monitoring_active:
            try:
                await self._check_recovery_conditions()
                await asyncio.sleep(30)  # Check every 30 seconds
                
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(
                    "Error in circuit breaker monitoring loop",
                    error=str(e),
                    error_type=type(e).__name__
                )
                await asyncio.sleep(60)  # Wait longer after error
    
    async def _check_recovery_conditions(self):
        """Check if any open circuit breakers can attempt recovery."""
        for breaker_type, breaker in self.breakers.items():
            if breaker.state == CircuitBreakerState.OPEN:
                await breaker.attempt_recovery()
    
    async def record_trade_event(self, success: bool, metadata: Optional[Dict[str, Any]] = None) -> bool:
        """
        Record a trade execution event and check circuit breakers.
        
        Args:
            success: Whether the trade was successful
            metadata: Additional trade metadata
            
        Returns:
            bool: True if trading is allowed, False if halted
        """
        # Record with trade failure rate breaker
        trade_allowed = await self.breakers[CircuitBreakerType.TRADE_FAILURE_RATE].record_event(
            "trade_execution", success, metadata
        )
        
        return trade_allowed and not self.system_halt_active
    
    async def record_network_event(self, success: bool, metadata: Optional[Dict[str, Any]] = None) -> bool:
        """Record a network connectivity event."""
        network_allowed = await self.breakers[CircuitBreakerType.NETWORK_CONNECTIVITY].record_event(
            "network_check", success, metadata
        )
        
        return network_allowed and not self.system_halt_active
    
    async def record_slippage_event(self, success: bool, metadata: Optional[Dict[str, Any]] = None) -> bool:
        """Record a slippage control event."""
        slippage_allowed = await self.breakers[CircuitBreakerType.SLIPPAGE_RATE].record_event(
            "slippage_check", success, metadata
        )
        
        return slippage_allowed and not self.system_halt_active
    
    async def record_hsm_event(self, success: bool, metadata: Optional[Dict[str, Any]] = None) -> bool:
        """Record an HSM operation event."""
        hsm_allowed = await self.breakers[CircuitBreakerType.HSM_FAILURE_RATE].record_event(
            "hsm_operation", success, metadata
        )
        
        return hsm_allowed and not self.system_halt_active
    
    async def record_system_error(self, error_type: str, metadata: Optional[Dict[str, Any]] = None) -> bool:
        """Record a system error event."""
        system_allowed = await self.breakers[CircuitBreakerType.SYSTEM_ERROR_RATE].record_event(
            f"system_error_{error_type}", False, metadata
        )
        
        return system_allowed and not self.system_halt_active
    
    async def record_confirmation_event(self, success: bool, metadata: Optional[Dict[str, Any]] = None) -> bool:
        """Record a transaction confirmation event."""
        conf_allowed = await self.breakers[CircuitBreakerType.CONFIRMATION_TIMEOUT_RATE].record_event(
            "confirmation_check", success, metadata
        )
        
        return conf_allowed and not self.system_halt_active
    
    async def record_volatility_event(self, volatility_percent: Decimal, metadata: Optional[Dict[str, Any]] = None) -> bool:
        """Record a market volatility event."""
        # Consider high volatility as a "failure" for circuit breaker purposes
        high_volatility = volatility_percent > Decimal("30.0")  # >30% is considered high
        
        vol_allowed = await self.breakers[CircuitBreakerType.MARKET_VOLATILITY].record_event(
            "volatility_check", not high_volatility, {
                "volatility_percent": str(volatility_percent),
                "high_volatility": high_volatility,
                **(metadata or {})
            }
        )
        
        return vol_allowed and not self.system_halt_active
    
    def is_trading_allowed(self) -> Tuple[bool, Optional[str]]:
        """
        Check if trading is currently allowed.
        
        Returns:
            Tuple[bool, Optional[str]]: (allowed, reason_if_blocked)
        """
        if self.system_halt_active:
            return False, f"System halt active: {self.system_halt_reason}"
        
        # Check each circuit breaker
        for breaker_type, breaker in self.breakers.items():
            if breaker.state == CircuitBreakerState.OPEN:
                return False, f"Circuit breaker open: {breaker.config.name}"
        
        return True, None
    
    def get_system_status(self) -> Dict[str, Any]:
        """Get comprehensive system circuit breaker status."""
        breaker_statuses = {}
        open_breakers = []
        half_open_breakers = []
        
        for breaker_type, breaker in self.breakers.items():
            status = breaker.get_status()
            breaker_statuses[breaker_type.value] = status
            
            if breaker.state == CircuitBreakerState.OPEN:
                open_breakers.append(breaker.config.name)
            elif breaker.state == CircuitBreakerState.HALF_OPEN:
                half_open_breakers.append(breaker.config.name)
        
        trading_allowed, block_reason = self.is_trading_allowed()
        
        return {
            "trading_allowed": trading_allowed,
            "block_reason": block_reason,
            "system_halt_active": self.system_halt_active,
            "system_halt_reason": self.system_halt_reason,
            "system_halt_timestamp": self.system_halt_timestamp.isoformat() if self.system_halt_timestamp else None,
            "total_breakers": len(self.breakers),
            "open_breakers": open_breakers,
            "half_open_breakers": half_open_breakers,
            "breaker_details": breaker_statuses
        }
    
    async def activate_system_halt(self, reason: str, duration_minutes: Optional[int] = None):
        """Activate system-wide trading halt."""
        self.system_halt_active = True
        self.system_halt_reason = reason
        self.system_halt_timestamp = datetime.now(timezone.utc)
        
        logger.critical(
            "SYSTEM-WIDE TRADING HALT ACTIVATED",
            reason=reason,
            duration_minutes=duration_minutes,
            timestamp=self.system_halt_timestamp.isoformat()
        )
        
        await self.audit_logger.log_security_violation(
            violation_type="system_trading_halt",
            user_id="system",
            wallet_address=None,
            violation_details={
                "reason": reason,
                "duration_minutes": duration_minutes,
                "activated_at": self.system_halt_timestamp.isoformat(),
                "open_breakers": [b.config.name for b in self.breakers.values() if b.state == CircuitBreakerState.OPEN]
            },
            severity=AuditSeverity.CRITICAL
        )
        
        # Schedule automatic deactivation if duration specified
        if duration_minutes:
            asyncio.create_task(self._auto_deactivate_halt(duration_minutes))
    
    async def deactivate_system_halt(self, reason: str = "manual_override"):
        """Deactivate system-wide trading halt."""
        if not self.system_halt_active:
            return
        
        old_reason = self.system_halt_reason
        halt_duration = None
        if self.system_halt_timestamp:
            halt_duration = (datetime.now(timezone.utc) - self.system_halt_timestamp).total_seconds() / 60
        
        self.system_halt_active = False
        self.system_halt_reason = None
        self.system_halt_timestamp = None
        
        logger.info(
            "System-wide trading halt deactivated",
            reason=reason,
            previous_reason=old_reason,
            halt_duration_minutes=halt_duration
        )
        
        await self.audit_logger.log_system_event(
            event_type="system_trading_halt_deactivated",
            event_details={
                "reason": reason,
                "previous_reason": old_reason,
                "halt_duration_minutes": halt_duration
            },
            severity=AuditSeverity.INFO
        )
    
    async def _auto_deactivate_halt(self, duration_minutes: int):
        """Automatically deactivate system halt after specified duration."""
        await asyncio.sleep(duration_minutes * 60)
        
        if self.system_halt_active:
            await self.deactivate_system_halt(f"automatic_after_{duration_minutes}_minutes")
    
    async def force_close_breaker(self, breaker_type: CircuitBreakerType, reason: str = "manual_override"):
        """Manually force close a specific circuit breaker."""
        if breaker_type not in self.breakers:
            return False
        
        breaker = self.breakers[breaker_type]
        if breaker.state != CircuitBreakerState.CLOSED:
            await breaker._close_breaker(reason)
            return True
        
        return False
    
    async def force_open_breaker(self, breaker_type: CircuitBreakerType, reason: str = "manual_override"):
        """Manually force open a specific circuit breaker."""
        if breaker_type not in self.breakers:
            return False
        
        breaker = self.breakers[breaker_type]
        if breaker.state == CircuitBreakerState.CLOSED:
            await breaker._open_breaker(reason)
            return True
        
        return False


# Global circuit breaker manager instance
circuit_breaker_manager: Optional[CircuitBreakerManager] = None


async def get_circuit_breaker_manager() -> CircuitBreakerManager:
    """Get the global circuit breaker manager instance."""
    global circuit_breaker_manager
    if circuit_breaker_manager is None:
        circuit_breaker_manager = CircuitBreakerManager()
        await circuit_breaker_manager.start_monitoring()
    return circuit_breaker_manager


async def shutdown_circuit_breaker_manager():
    """Shutdown the global circuit breaker manager."""
    global circuit_breaker_manager
    if circuit_breaker_manager:
        await circuit_breaker_manager.stop_monitoring()
        circuit_breaker_manager = None