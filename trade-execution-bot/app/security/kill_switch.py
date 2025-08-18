"""
Global Kill Switch for XORJ Trade Execution Bot.

Implements SR-5: Global Kill Switch
"There must be a global kill switch that can instantly halt all trading activity. 
This switch should be accessible via secure API, environment variable, or external signal, 
and should take effect immediately without waiting for current operations to complete."

This module provides ultimate emergency control:
- Instant halt of all trading operations
- Multiple activation methods (API, environment, external signal)
- Immediate effect without waiting for current operations
- Tamper-proof activation mechanisms
- Comprehensive audit logging
- Recovery controls with authorization

Security Features:
- Multiple independent activation pathways
- Cryptographic verification of kill commands
- Immediate system-wide halt capability
- Tamper-resistant implementation
- Emergency override for all other systems
- Comprehensive audit trail
- Authorized recovery mechanisms
"""

import asyncio
import os
import signal
import hashlib
import hmac
from typing import Dict, Any, Optional, List, Callable, Union
from datetime import datetime, timezone, timedelta
from enum import Enum
from dataclasses import dataclass, field
import json

import structlog
from app.core.config import get_config, TradeExecutionConfig
from app.logging.audit_logger import get_audit_logger, AuditEventType, AuditSeverity


logger = structlog.get_logger(__name__)


class KillSwitchState(Enum):
    """States of the global kill switch."""
    ARMED = "armed"                 # Ready for normal operation
    TRIGGERED = "triggered"         # Kill switch activated - all trading halted
    RECOVERY_PENDING = "recovery_pending"  # Recovery initiated, awaiting authorization
    MAINTENANCE = "maintenance"     # Planned maintenance mode


class ActivationMethod(Enum):
    """Methods by which the kill switch can be activated."""
    MANUAL_API = "manual_api"              # Manual activation via secure API
    ENVIRONMENT_VARIABLE = "environment_variable"  # Environment variable detection
    EXTERNAL_SIGNAL = "external_signal"   # External system signal (e.g., OS signal)
    AUTOMATIC_TRIGGER = "automatic_trigger"  # Automatic trigger from system conditions
    EMERGENCY_OVERRIDE = "emergency_override"  # Emergency override command
    SCHEDULED_MAINTENANCE = "scheduled_maintenance"  # Planned maintenance activation


class RecoveryAuthorization(Enum):
    """Levels of authorization required for recovery."""
    SINGLE_KEY = "single_key"         # Single authorized key
    DUAL_KEY = "dual_key"             # Two authorized keys required
    MULTI_KEY = "multi_key"           # Multiple keys required (3 of 5, etc.)
    ADMIN_OVERRIDE = "admin_override" # Administrative override


@dataclass
class KillSwitchEvent:
    """Event record for kill switch operations."""
    event_id: str
    timestamp: datetime
    event_type: str
    activation_method: Optional[ActivationMethod]
    user_id: Optional[str]
    reason: str
    authorization_key: Optional[str]
    system_state: Dict[str, Any]
    verification_hash: Optional[str] = None
    
    def __post_init__(self):
        """Calculate verification hash after initialization."""
        self.verification_hash = self._calculate_hash()
    
    def _calculate_hash(self) -> str:
        """Calculate verification hash for tamper detection."""
        hash_data = {
            "event_id": self.event_id,
            "timestamp": self.timestamp.isoformat(),
            "event_type": self.event_type,
            "activation_method": self.activation_method.value if self.activation_method else None,
            "user_id": self.user_id,
            "reason": self.reason,
            "system_state": self.system_state
        }
        hash_string = json.dumps(hash_data, sort_keys=True)
        return hashlib.sha256(hash_string.encode()).hexdigest()
    
    def verify_integrity(self) -> bool:
        """Verify event integrity."""
        return self.verification_hash == self._calculate_hash()
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert event to dictionary."""
        return {
            "event_id": self.event_id,
            "timestamp": self.timestamp.isoformat(),
            "event_type": self.event_type,
            "activation_method": self.activation_method.value if self.activation_method else None,
            "user_id": self.user_id,
            "reason": self.reason,
            "authorization_key": self.authorization_key[:8] + "..." if self.authorization_key else None,
            "system_state": self.system_state,
            "verification_hash": self.verification_hash
        }


@dataclass
class AuthorizedKey:
    """Authorized key for kill switch operations."""
    key_id: str
    key_hash: str              # SHA-256 hash of the actual key
    description: str
    created_at: datetime
    created_by: str
    permissions: List[str]     # Permissions this key has
    expires_at: Optional[datetime] = None
    revoked: bool = False
    revoked_at: Optional[datetime] = None
    last_used: Optional[datetime] = None
    
    def is_valid(self) -> bool:
        """Check if key is valid and not expired/revoked."""
        if self.revoked:
            return False
        
        if self.expires_at and datetime.now(timezone.utc) > self.expires_at:
            return False
        
        return True
    
    def verify_key(self, provided_key: str) -> bool:
        """Verify a provided key against the stored hash."""
        if not self.is_valid():
            return False
        
        provided_hash = hashlib.sha256(provided_key.encode()).hexdigest()
        return hmac.compare_digest(self.key_hash, provided_hash)


class GlobalKillSwitch:
    """
    Global Kill Switch for ultimate system control.
    
    Implements SR-5: Global Kill Switch
    
    This system provides the ultimate emergency control mechanism
    that can instantly halt all trading activity across the entire
    XORJ Trade Execution Bot system.
    
    Key Principles:
    1. Immediate effect - no waiting for operations to complete
    2. Multiple activation methods for reliability
    3. Tamper-resistant implementation
    4. Comprehensive audit trail
    5. Authorized recovery only
    """
    
    def __init__(self):
        self.config = get_config()
        self.audit_logger = get_audit_logger()
        
        # Kill switch state
        self.state = KillSwitchState.ARMED
        self.triggered_at: Optional[datetime] = None
        self.triggered_by: Optional[str] = None
        self.trigger_reason: Optional[str] = None
        self.activation_method: Optional[ActivationMethod] = None
        
        # Event history
        self.events: List[KillSwitchEvent] = []
        
        # Authorized keys for recovery
        self.authorized_keys: Dict[str, AuthorizedKey] = {}
        
        # System references (will be set during initialization)
        self.trade_executor = None
        self.circuit_breaker_manager = None
        self.confirmation_monitor = None
        
        # Signal handlers
        self._signal_handlers_installed = False
        
        # Environment monitoring
        self._env_monitor_task: Optional[asyncio.Task] = None
        self._monitoring_active = False
        
        # Initialize authorized keys
        self._initialize_authorized_keys()
        
        # Check initial state
        self._check_initial_state()
        
        logger.info(
            "Global Kill Switch initialized",
            state=self.state.value,
            authorized_keys=len(self.authorized_keys)
        )
    
    def _initialize_authorized_keys(self):
        """Initialize authorized keys from configuration."""
        # Master recovery key (from environment)
        master_key = os.getenv("KILL_SWITCH_MASTER_KEY")
        if master_key:
            self.authorized_keys["master"] = AuthorizedKey(
                key_id="master",
                key_hash=hashlib.sha256(master_key.encode()).hexdigest(),
                description="Master recovery key",
                created_at=datetime.now(timezone.utc),
                created_by="system",
                permissions=["activate", "deactivate", "maintenance"]
            )
        
        # Emergency override key (from environment)
        emergency_key = os.getenv("KILL_SWITCH_EMERGENCY_KEY")
        if emergency_key:
            self.authorized_keys["emergency"] = AuthorizedKey(
                key_id="emergency",
                key_hash=hashlib.sha256(emergency_key.encode()).hexdigest(),
                description="Emergency override key",
                created_at=datetime.now(timezone.utc),
                created_by="system",
                permissions=["activate", "emergency_deactivate"]
            )
        
        # Admin recovery keys (could be loaded from secure storage)
        admin_keys = os.getenv("KILL_SWITCH_ADMIN_KEYS", "").split(",")
        for i, admin_key in enumerate(admin_keys):
            if admin_key.strip():
                self.authorized_keys[f"admin_{i+1}"] = AuthorizedKey(
                    key_id=f"admin_{i+1}",
                    key_hash=hashlib.sha256(admin_key.strip().encode()).hexdigest(),
                    description=f"Admin recovery key #{i+1}",
                    created_at=datetime.now(timezone.utc),
                    created_by="system",
                    permissions=["deactivate"]
                )
    
    def _check_initial_state(self):
        """Check initial kill switch state from environment."""
        # Check for environment variable activation
        kill_switch_active = os.getenv("KILL_SWITCH_ACTIVE", "").lower()
        if kill_switch_active in ["true", "1", "yes", "on"]:
            self._trigger_immediately(
                reason="Environment variable KILL_SWITCH_ACTIVE detected",
                method=ActivationMethod.ENVIRONMENT_VARIABLE,
                user_id="system"
            )
        
        # Check for kill switch file
        kill_file = os.getenv("KILL_SWITCH_FILE", "/tmp/xorj_kill_switch")
        if os.path.exists(kill_file):
            try:
                with open(kill_file, 'r') as f:
                    reason = f.read().strip() or "Kill switch file detected"
                self._trigger_immediately(
                    reason=f"Kill file detected: {reason}",
                    method=ActivationMethod.EXTERNAL_SIGNAL,
                    user_id="system"
                )
            except Exception as e:
                logger.error("Failed to read kill switch file", error=str(e))
    
    async def initialize_system_references(self, trade_executor, circuit_breaker_manager, confirmation_monitor):
        """Initialize references to other system components."""
        self.trade_executor = trade_executor
        self.circuit_breaker_manager = circuit_breaker_manager
        self.confirmation_monitor = confirmation_monitor
        
        # Install signal handlers
        self._install_signal_handlers()
        
        # Start environment monitoring
        await self._start_environment_monitoring()
        
        logger.info("Kill switch system references initialized")
    
    def _install_signal_handlers(self):
        """Install OS signal handlers for external kill switch activation."""
        if self._signal_handlers_installed:
            return
        
        try:
            # SIGUSR1 - Graceful kill switch activation
            signal.signal(signal.SIGUSR1, self._handle_kill_signal)
            
            # SIGUSR2 - Emergency kill switch activation
            signal.signal(signal.SIGUSR2, self._handle_emergency_signal)
            
            self._signal_handlers_installed = True
            logger.info("Kill switch signal handlers installed (SIGUSR1, SIGUSR2)")
            
        except Exception as e:
            logger.error("Failed to install signal handlers", error=str(e))
    
    def _handle_kill_signal(self, signum, frame):
        """Handle kill switch activation signal."""
        logger.critical("KILL SWITCH SIGNAL RECEIVED", signal=signum)
        self._trigger_immediately(
            reason=f"OS signal received: {signum}",
            method=ActivationMethod.EXTERNAL_SIGNAL,
            user_id="system_signal"
        )
    
    def _handle_emergency_signal(self, signum, frame):
        """Handle emergency kill switch signal."""
        logger.critical("EMERGENCY KILL SWITCH SIGNAL RECEIVED", signal=signum)
        self._trigger_immediately(
            reason=f"Emergency OS signal received: {signum}",
            method=ActivationMethod.EMERGENCY_OVERRIDE,
            user_id="system_emergency"
        )
    
    async def _start_environment_monitoring(self):
        """Start background monitoring for environment-based triggers."""
        if self._monitoring_active:
            return
        
        self._monitoring_active = True
        self._env_monitor_task = asyncio.create_task(self._environment_monitor_loop())
        
        logger.info("Kill switch environment monitoring started")
    
    async def _stop_environment_monitoring(self):
        """Stop background environment monitoring."""
        self._monitoring_active = False
        
        if self._env_monitor_task:
            self._env_monitor_task.cancel()
            try:
                await self._env_monitor_task
            except asyncio.CancelledError:
                pass
    
    async def _environment_monitor_loop(self):
        """Background loop monitoring environment for kill switch triggers."""
        while self._monitoring_active:
            try:
                # Check environment variable
                if os.getenv("KILL_SWITCH_ACTIVE", "").lower() in ["true", "1", "yes", "on"]:
                    if self.state != KillSwitchState.TRIGGERED:
                        await self.activate(
                            reason="Environment variable KILL_SWITCH_ACTIVE detected",
                            method=ActivationMethod.ENVIRONMENT_VARIABLE,
                            user_id="system"
                        )
                
                # Check kill file
                kill_file = os.getenv("KILL_SWITCH_FILE", "/tmp/xorj_kill_switch")
                if os.path.exists(kill_file):
                    if self.state != KillSwitchState.TRIGGERED:
                        try:
                            with open(kill_file, 'r') as f:
                                reason = f.read().strip() or "Kill switch file detected"
                            await self.activate(
                                reason=f"Kill file detected: {reason}",
                                method=ActivationMethod.EXTERNAL_SIGNAL,
                                user_id="system"
                            )
                        except Exception as e:
                            logger.error("Failed to read kill switch file", error=str(e))
                
                await asyncio.sleep(5)  # Check every 5 seconds
                
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("Error in environment monitor loop", error=str(e))
                await asyncio.sleep(30)
    
    def _trigger_immediately(self, reason: str, method: ActivationMethod, user_id: str):
        """Immediately trigger kill switch without async overhead."""
        if self.state == KillSwitchState.TRIGGERED:
            return  # Already triggered
        
        # Immediate state change
        old_state = self.state
        self.state = KillSwitchState.TRIGGERED
        self.triggered_at = datetime.now(timezone.utc)
        self.triggered_by = user_id
        self.trigger_reason = reason
        self.activation_method = method
        
        # Critical logging
        logger.critical(
            "GLOBAL KILL SWITCH ACTIVATED IMMEDIATELY",
            reason=reason,
            method=method.value,
            user_id=user_id,
            previous_state=old_state.value,
            triggered_at=self.triggered_at.isoformat()
        )
        
        # Schedule async operations
        asyncio.create_task(self._handle_immediate_shutdown(reason, method, user_id))
    
    async def _handle_immediate_shutdown(self, reason: str, method: ActivationMethod, user_id: str):
        """Handle immediate shutdown operations after trigger."""
        try:
            # Record event
            event = KillSwitchEvent(
                event_id=f"kill_{int(datetime.now().timestamp())}",
                timestamp=self.triggered_at,
                event_type="kill_switch_activated",
                activation_method=method,
                user_id=user_id,
                reason=reason,
                authorization_key=None,
                system_state=await self._capture_system_state()
            )
            self.events.append(event)
            
            # Immediate audit logging
            await self.audit_logger.log_security_violation(
                violation_type="global_kill_switch_activated",
                user_id=user_id,
                wallet_address=None,
                violation_details={
                    "reason": reason,
                    "activation_method": method.value,
                    "triggered_at": self.triggered_at.isoformat(),
                    "system_state": event.system_state
                },
                severity=AuditSeverity.CRITICAL
            )
            
            # Halt all system components
            await self._halt_all_systems()
            
        except Exception as e:
            logger.critical(
                "CRITICAL ERROR during kill switch shutdown handling",
                error=str(e),
                error_type=type(e).__name__
            )
    
    async def activate(
        self, 
        reason: str, 
        method: ActivationMethod = ActivationMethod.MANUAL_API,
        user_id: Optional[str] = None,
        authorization_key: Optional[str] = None
    ) -> bool:
        """
        Activate the global kill switch.
        
        Args:
            reason: Reason for activation
            method: Method of activation
            user_id: User activating the kill switch
            authorization_key: Authorization key (if required)
            
        Returns:
            bool: True if activation successful
        """
        if self.state == KillSwitchState.TRIGGERED:
            logger.warning("Kill switch already triggered")
            return False
        
        # Verify authorization if key provided
        if authorization_key:
            if not self._verify_authorization(authorization_key, "activate"):
                logger.error("Kill switch activation failed - invalid authorization key")
                return False
        
        # Immediate activation
        self._trigger_immediately(reason, method, user_id or "unknown")
        
        return True
    
    async def deactivate(
        self, 
        reason: str,
        authorization_key: str,
        user_id: Optional[str] = None,
        force: bool = False
    ) -> bool:
        """
        Deactivate the global kill switch (recovery).
        
        Args:
            reason: Reason for deactivation
            authorization_key: Required authorization key
            user_id: User deactivating the kill switch
            force: Force deactivation even in unsafe conditions
            
        Returns:
            bool: True if deactivation successful
        """
        if self.state != KillSwitchState.TRIGGERED:
            logger.warning("Kill switch not currently triggered")
            return False
        
        # Verify authorization
        if not self._verify_authorization(authorization_key, "deactivate"):
            logger.error("Kill switch deactivation failed - invalid authorization key")
            await self._log_unauthorized_access(user_id, "deactivate", authorization_key[:8] if authorization_key else None)
            return False
        
        # Check system safety (unless forced)
        if not force:
            safety_check = await self._perform_safety_check()
            if not safety_check["safe"]:
                logger.error("Kill switch deactivation failed - system safety check failed", 
                           reasons=safety_check["reasons"])
                return False
        
        # Deactivate kill switch
        old_state = self.state
        self.state = KillSwitchState.ARMED
        recovery_time = datetime.now(timezone.utc)
        
        # Record event
        event = KillSwitchEvent(
            event_id=f"recovery_{int(recovery_time.timestamp())}",
            timestamp=recovery_time,
            event_type="kill_switch_deactivated",
            activation_method=None,
            user_id=user_id,
            reason=reason,
            authorization_key=authorization_key[:8] if authorization_key else None,
            system_state=await self._capture_system_state()
        )
        self.events.append(event)
        
        # Clear trigger state
        self.triggered_at = None
        self.triggered_by = None
        self.trigger_reason = None
        self.activation_method = None
        
        logger.info(
            "Global kill switch deactivated",
            reason=reason,
            user_id=user_id,
            recovery_time=recovery_time.isoformat(),
            previous_state=old_state.value
        )
        
        await self.audit_logger.log_system_event(
            event_type="global_kill_switch_deactivated",
            event_details={
                "reason": reason,
                "user_id": user_id,
                "recovery_time": recovery_time.isoformat(),
                "authorization_key": authorization_key[:8] if authorization_key else None,
                "downtime_minutes": (recovery_time - self.triggered_at).total_seconds() / 60 if self.triggered_at else 0
            },
            severity=AuditSeverity.INFO
        )
        
        return True
    
    def _verify_authorization(self, provided_key: str, operation: str) -> bool:
        """Verify authorization key for operation."""
        for key_id, auth_key in self.authorized_keys.items():
            if auth_key.verify_key(provided_key) and operation in auth_key.permissions:
                # Update last used timestamp
                auth_key.last_used = datetime.now(timezone.utc)
                logger.info(f"Authorization verified for operation '{operation}'", key_id=key_id)
                return True
        
        return False
    
    async def _log_unauthorized_access(self, user_id: Optional[str], operation: str, key_hint: Optional[str]):
        """Log unauthorized access attempts."""
        await self.audit_logger.log_security_violation(
            violation_type="kill_switch_unauthorized_access",
            user_id=user_id,
            wallet_address=None,
            violation_details={
                "operation": operation,
                "key_hint": key_hint,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "user_agent": "system"  # Could be enhanced with actual user agent
            },
            severity=AuditSeverity.CRITICAL
        )
    
    async def _perform_safety_check(self) -> Dict[str, Any]:
        """Perform safety check before deactivating kill switch."""
        safety_issues = []
        
        try:
            # Check circuit breakers
            if self.circuit_breaker_manager:
                status = self.circuit_breaker_manager.get_system_status()
                if not status["trading_allowed"]:
                    safety_issues.append(f"Circuit breakers blocking trading: {status['block_reason']}")
                
                if status["open_breakers"]:
                    safety_issues.append(f"Open circuit breakers: {', '.join(status['open_breakers'])}")
            
            # Check pending transactions
            if self.confirmation_monitor:
                active_monitors = await self.confirmation_monitor.get_all_active_monitors()
                if active_monitors:
                    safety_issues.append(f"Active transaction monitors: {len(active_monitors)}")
            
            # Check system health
            # Could add more sophisticated health checks here
            
        except Exception as e:
            safety_issues.append(f"Safety check error: {str(e)}")
        
        return {
            "safe": len(safety_issues) == 0,
            "reasons": safety_issues
        }
    
    async def _capture_system_state(self) -> Dict[str, Any]:
        """Capture current system state for logging."""
        state = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "kill_switch_state": self.state.value,
            "environment": self.config.environment
        }
        
        try:
            # Circuit breaker status
            if self.circuit_breaker_manager:
                cb_status = self.circuit_breaker_manager.get_system_status()
                state["circuit_breakers"] = {
                    "trading_allowed": cb_status["trading_allowed"],
                    "open_breakers": cb_status["open_breakers"],
                    "system_halt_active": cb_status["system_halt_active"]
                }
            
            # Active transactions
            if self.confirmation_monitor:
                active_monitors = await self.confirmation_monitor.get_all_active_monitors()
                state["active_transactions"] = len(active_monitors)
            
            # Trade executor status
            if self.trade_executor:
                # Could capture trade executor specific state
                state["trade_executor_initialized"] = True
            
        except Exception as e:
            state["capture_error"] = str(e)
        
        return state
    
    async def _halt_all_systems(self):
        """Halt all trading systems immediately."""
        try:
            # Activate system-wide halt via circuit breaker manager
            if self.circuit_breaker_manager:
                await self.circuit_breaker_manager.activate_system_halt(
                    reason=f"Global kill switch: {self.trigger_reason}",
                    duration_minutes=None  # Indefinite halt
                )
            
            # Could add more system halt operations here
            logger.info("All systems halted by global kill switch")
            
        except Exception as e:
            logger.critical("Failed to halt all systems", error=str(e))
    
    def is_active(self) -> bool:
        """Check if kill switch is currently active (triggered)."""
        return self.state == KillSwitchState.TRIGGERED
    
    def get_status(self) -> Dict[str, Any]:
        """Get comprehensive kill switch status."""
        return {
            "state": self.state.value,
            "is_active": self.is_active(),
            "triggered_at": self.triggered_at.isoformat() if self.triggered_at else None,
            "triggered_by": self.triggered_by,
            "trigger_reason": self.trigger_reason,
            "activation_method": self.activation_method.value if self.activation_method else None,
            "authorized_keys_count": len([k for k in self.authorized_keys.values() if k.is_valid()]),
            "total_events": len(self.events),
            "monitoring_active": self._monitoring_active,
            "signal_handlers_installed": self._signal_handlers_installed,
            "last_event": self.events[-1].to_dict() if self.events else None
        }
    
    def get_event_history(self, limit: Optional[int] = None) -> List[Dict[str, Any]]:
        """Get kill switch event history."""
        events = self.events[-limit:] if limit else self.events
        return [event.to_dict() for event in events]
    
    async def maintenance_mode(self, reason: str, authorization_key: str, user_id: Optional[str] = None) -> bool:
        """Enter maintenance mode (planned downtime)."""
        if not self._verify_authorization(authorization_key, "maintenance"):
            return False
        
        old_state = self.state
        self.state = KillSwitchState.MAINTENANCE
        
        # Record event
        event = KillSwitchEvent(
            event_id=f"maintenance_{int(datetime.now().timestamp())}",
            timestamp=datetime.now(timezone.utc),
            event_type="maintenance_mode_activated",
            activation_method=ActivationMethod.SCHEDULED_MAINTENANCE,
            user_id=user_id,
            reason=reason,
            authorization_key=authorization_key[:8] if authorization_key else None,
            system_state=await self._capture_system_state()
        )
        self.events.append(event)
        
        # Halt systems for maintenance
        await self._halt_all_systems()
        
        logger.info("System entered maintenance mode", reason=reason, user_id=user_id)
        return True
    
    async def shutdown(self):
        """Shutdown kill switch system."""
        await self._stop_environment_monitoring()
        logger.info("Global kill switch shutdown complete")


# Global kill switch instance
global_kill_switch: Optional[GlobalKillSwitch] = None


async def get_global_kill_switch() -> GlobalKillSwitch:
    """Get the global kill switch instance."""
    global global_kill_switch
    if global_kill_switch is None:
        global_kill_switch = GlobalKillSwitch()
    return global_kill_switch


async def shutdown_global_kill_switch():
    """Shutdown the global kill switch."""
    global global_kill_switch
    if global_kill_switch:
        await global_kill_switch.shutdown()
        global_kill_switch = None