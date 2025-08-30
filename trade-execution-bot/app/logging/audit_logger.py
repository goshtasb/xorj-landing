"""
Immutable audit logging system for XORJ Trade Execution Bot.

This module implements comprehensive, tamper-proof logging of all
trade execution decisions and actions for regulatory compliance,
security auditing, and operational monitoring.

Security Features:
- Immutable log entries (append-only)
- Cryptographic integrity verification
- Comprehensive decision trail logging
- Secure database storage
- Audit log retention policies
"""

import asyncio
import json
import hashlib
import uuid
from typing import Dict, Any, Optional, List
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from decimal import Decimal
from enum import Enum

import asyncpg
import structlog
from app.core.config import get_config


logger = structlog.get_logger(__name__)


class AuditEventType(Enum):
    """Types of audit events to log."""
    SYSTEM_START = "system_start"
    SYSTEM_STOP = "system_stop"
    SYSTEM_EVENT = "system_event"
    INTELLIGENCE_FETCH = "intelligence_fetch"
    USER_SETTINGS_FETCH = "user_settings_fetch"
    TRADE_DECISION = "trade_decision"
    TRADE_EXECUTION = "trade_execution"
    TRADE_SUCCESS = "trade_success"
    TRADE_FAILURE = "trade_failure"
    RISK_CHECK = "risk_check"
    EMERGENCY_STOP = "emergency_stop"
    ERROR_EVENT = "error_event"
    # HSM and security-related events (SR-1)
    KEY_OPERATION = "key_operation"
    HSM_CONNECTION = "hsm_connection"
    SECURITY_VIOLATION = "security_violation"
    # NFR-2: Enhanced detailed tracking events
    CALCULATION_PERFORMED = "calculation_performed"
    DECISION_POINT = "decision_point"  
    VALIDATION_CHECK = "validation_check"
    STATE_CHANGE = "state_change"
    IDEMPOTENCY_CHECK = "idempotency_check"
    PORTFOLIO_ANALYSIS = "portfolio_analysis"
    SLIPPAGE_CALCULATION = "slippage_calculation"
    RISK_CALCULATION = "risk_calculation"
    PRICE_FETCH = "price_fetch"
    BALANCE_CHECK = "balance_check"


class AuditSeverity(Enum):
    """Severity levels for audit events."""
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"


@dataclass
class AuditLogEntry:
    """
    Immutable audit log entry structure.
    
    Each entry represents a single decision or action taken by the bot,
    with complete context and cryptographic integrity verification.
    """
    # Core identification
    entry_id: str  # Unique UUID for this entry
    timestamp: datetime  # UTC timestamp
    event_type: AuditEventType  # Type of event being logged
    severity: AuditSeverity  # Severity level
    
    # Context information
    user_id: Optional[str] = None  # User affected by this action
    wallet_address: Optional[str] = None  # Wallet involved
    trader_address: Optional[str] = None  # Trader being replicated
    
    # Event details
    event_data: Dict[str, Any] = None  # Specific event data
    decision_rationale: Optional[str] = None  # Why this decision was made
    risk_assessment: Optional[Dict[str, Any]] = None  # Risk evaluation details
    
    # Trade execution details (if applicable)
    trade_details: Optional[Dict[str, Any]] = None
    transaction_signature: Optional[str] = None  # On-chain transaction hash
    
    # Error information (if applicable)
    error_message: Optional[str] = None
    error_type: Optional[str] = None
    stack_trace: Optional[str] = None
    
    # System state
    bot_version: str = "1.0.0"
    system_state: Optional[Dict[str, Any]] = None
    
    # NFR-2: Enhanced detailed tracking fields
    calculation_inputs: Optional[Dict[str, Any]] = None  # Inputs to calculations
    calculation_outputs: Optional[Dict[str, Any]] = None  # Results of calculations
    decision_factors: Optional[List[str]] = None  # Factors that influenced decisions
    validation_results: Optional[Dict[str, bool]] = None  # Validation check results
    performance_metrics: Optional[Dict[str, float]] = None  # Timing and performance data
    context_snapshot: Optional[Dict[str, Any]] = None  # System context at time of event
    correlation_id: Optional[str] = None  # For tracing related events
    
    # Integrity verification
    entry_hash: Optional[str] = None  # SHA-256 hash of entry content
    previous_entry_hash: Optional[str] = None  # Hash of previous entry (blockchain-style)
    
    def __post_init__(self):
        """Initialize entry with defaults and calculate hash."""
        if self.event_data is None:
            self.event_data = {}
        
        # Ensure timestamp is UTC
        if self.timestamp.tzinfo is None:
            self.timestamp = self.timestamp.replace(tzinfo=timezone.utc)
        
        # Calculate entry hash for integrity
        self._calculate_entry_hash()
    
    def _calculate_entry_hash(self):
        """Calculate SHA-256 hash of entry content for integrity verification."""
        # Create hashable content (exclude the hash field itself)
        hashable_content = {
            "entry_id": self.entry_id,
            "timestamp": self.timestamp.isoformat(),
            "event_type": self.event_type.value,
            "severity": self.severity.value,
            "user_id": self.user_id,
            "wallet_address": self.wallet_address,
            "trader_address": self.trader_address,
            "event_data": self.event_data,
            "decision_rationale": self.decision_rationale,
            "risk_assessment": self.risk_assessment,
            "trade_details": self.trade_details,
            "transaction_signature": self.transaction_signature,
            "error_message": self.error_message,
            "error_type": self.error_type,
            "bot_version": self.bot_version,
            "system_state": self.system_state,
            # NFR-2: Include enhanced tracking fields in hash
            "calculation_inputs": self.calculation_inputs,
            "calculation_outputs": self.calculation_outputs,
            "decision_factors": self.decision_factors,
            "validation_results": self.validation_results,
            "performance_metrics": self.performance_metrics,
            "context_snapshot": self.context_snapshot,
            "correlation_id": self.correlation_id,
            "previous_entry_hash": self.previous_entry_hash
        }
        
        # Convert to JSON and hash
        content_json = json.dumps(hashable_content, sort_keys=True, default=str)
        self.entry_hash = hashlib.sha256(content_json.encode()).hexdigest()
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert audit entry to dictionary for database storage."""
        return {
            "entry_id": self.entry_id,
            "timestamp": self.timestamp,
            "event_type": self.event_type.value,
            "severity": self.severity.value,
            "user_id": self.user_id,
            "wallet_address": self.wallet_address,
            "trader_address": self.trader_address,
            "event_data": json.dumps(self.event_data) if self.event_data else None,
            "decision_rationale": self.decision_rationale,
            "risk_assessment": json.dumps(self.risk_assessment) if self.risk_assessment else None,
            "trade_details": json.dumps(self.trade_details) if self.trade_details else None,
            "transaction_signature": self.transaction_signature,
            "error_message": self.error_message,
            "error_type": self.error_type,
            "stack_trace": self.stack_trace,
            "bot_version": self.bot_version,
            "system_state": json.dumps(self.system_state) if self.system_state else None,
            # NFR-2: Enhanced detailed tracking fields
            "calculation_inputs": json.dumps(self.calculation_inputs) if self.calculation_inputs else None,
            "calculation_outputs": json.dumps(self.calculation_outputs) if self.calculation_outputs else None,
            "decision_factors": json.dumps(self.decision_factors) if self.decision_factors else None,
            "validation_results": json.dumps(self.validation_results) if self.validation_results else None,
            "performance_metrics": json.dumps(self.performance_metrics) if self.performance_metrics else None,
            "context_snapshot": json.dumps(self.context_snapshot) if self.context_snapshot else None,
            "correlation_id": self.correlation_id,
            "entry_hash": self.entry_hash,
            "previous_entry_hash": self.previous_entry_hash
        }


class ImmutableAuditLogger:
    """
    Immutable audit logging system for XORJ Trade Execution Bot.
    
    This implements the Output (Logging) requirement from System Architecture:
    Write detailed logs of every decision and action to a dedicated,
    immutable logging database for auditing and monitoring.
    
    Features:
    - Immutable, append-only logging
    - Cryptographic integrity verification
    - Comprehensive decision trail capture
    - Blockchain-style entry chaining
    - Async, high-performance logging
    """
    
    def __init__(self):
        self.config = get_config()
        self.database_url = self.config.audit_log_database_url
        self.table_name = self.config.audit_log_table
        self.pool: Optional[asyncpg.Pool] = None
        self.last_entry_hash: Optional[str] = None
        
        self._validate_config()
    
    def _validate_config(self):
        """Validate audit logging configuration."""
        if not self.database_url:
            raise ValueError("Audit log database URL is required")
        
        if not self.table_name:
            raise ValueError("Audit log table name is required")
    
    async def initialize(self) -> bool:
        """
        Initialize audit logging system.
        
        Returns:
            bool: True if initialization successful
        """
        try:
            logger.info("Initializing immutable audit logging system")
            
            # Create connection pool
            self.pool = await asyncpg.create_pool(
                self.database_url,
                min_size=2,
                max_size=5,
                command_timeout=30.0,
                server_settings={
                    'application_name': f"{self.config.service_name}-audit",
                    'timezone': 'UTC'
                }
            )
            
            # Create audit table if it doesn't exist
            await self._create_audit_table()
            
            # Load last entry hash for blockchain-style chaining
            await self._load_last_entry_hash()
            
            # Log system start
            await self.log_system_event(
                event_type=AuditEventType.SYSTEM_START,
                severity=AuditSeverity.INFO,
                event_data={
                    "bot_version": "1.0.0",
                    "environment": self.config.environment,
                    "initialized_at": datetime.now(timezone.utc).isoformat()
                },
                decision_rationale="Trade execution bot starting up"
            )
            
            logger.info("Immutable audit logging system initialized successfully")
            return True
            
        except Exception as e:
            logger.error(
                "Failed to initialize audit logging system",
                error=str(e),
                error_type=type(e).__name__
            )
            return False
    
    async def _create_audit_table(self):
        """Create audit log table if it doesn't exist."""
        create_table_sql = f"""
            CREATE TABLE IF NOT EXISTS {self.table_name} (
                entry_id UUID PRIMARY KEY,
                timestamp TIMESTAMPTZ NOT NULL,
                event_type VARCHAR(50) NOT NULL,
                severity VARCHAR(20) NOT NULL,
                user_id VARCHAR(100),
                wallet_address VARCHAR(44),
                trader_address VARCHAR(44),
                event_data JSONB,
                decision_rationale TEXT,
                risk_assessment JSONB,
                trade_details JSONB,
                transaction_signature VARCHAR(128),
                error_message TEXT,
                error_type VARCHAR(100),
                stack_trace TEXT,
                bot_version VARCHAR(20) NOT NULL,
                system_state JSONB,
                -- NFR-2: Enhanced detailed tracking fields
                calculation_inputs JSONB,
                calculation_outputs JSONB,
                decision_factors JSONB,
                validation_results JSONB,
                performance_metrics JSONB,
                context_snapshot JSONB,
                correlation_id VARCHAR(64),
                entry_hash VARCHAR(64) NOT NULL,
                previous_entry_hash VARCHAR(64),
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        """
        
        # Create indices for performance
        create_indices_sql = [
            f"CREATE INDEX IF NOT EXISTS idx_{self.table_name}_timestamp ON {self.table_name} (timestamp DESC);",
            f"CREATE INDEX IF NOT EXISTS idx_{self.table_name}_event_type ON {self.table_name} (event_type);",
            f"CREATE INDEX IF NOT EXISTS idx_{self.table_name}_user_id ON {self.table_name} (user_id) WHERE user_id IS NOT NULL;",
            f"CREATE INDEX IF NOT EXISTS idx_{self.table_name}_wallet ON {self.table_name} (wallet_address) WHERE wallet_address IS NOT NULL;",
            f"CREATE INDEX IF NOT EXISTS idx_{self.table_name}_severity ON {self.table_name} (severity);",
            f"CREATE INDEX IF NOT EXISTS idx_{self.table_name}_tx_sig ON {self.table_name} (transaction_signature) WHERE transaction_signature IS NOT NULL;",
            # NFR-2: Enhanced tracking field indices
            f"CREATE INDEX IF NOT EXISTS idx_{self.table_name}_correlation_id ON {self.table_name} (correlation_id) WHERE correlation_id IS NOT NULL;",
            f"CREATE INDEX IF NOT EXISTS idx_{self.table_name}_event_correlation ON {self.table_name} (event_type, correlation_id) WHERE correlation_id IS NOT NULL;"
        ]
        
        async with self.pool.acquire() as conn:
            await conn.execute(create_table_sql)
            for index_sql in create_indices_sql:
                await conn.execute(index_sql)
    
    async def _load_last_entry_hash(self):
        """Load hash of the last audit entry for blockchain-style chaining."""
        try:
            async with self.pool.acquire() as conn:
                result = await conn.fetchval(
                    f"SELECT entry_hash FROM {self.table_name} ORDER BY timestamp DESC LIMIT 1"
                )
                self.last_entry_hash = result
                
                if self.last_entry_hash:
                    logger.info(
                        "Loaded last entry hash for audit chain continuity",
                        last_hash=self.last_entry_hash[:16] + "..."
                    )
                else:
                    logger.info("No previous audit entries found - starting new chain")
                    
        except Exception as e:
            logger.warning(
                "Could not load last entry hash",
                error=str(e)
            )
            self.last_entry_hash = None
    
    async def log_system_event(
        self,
        event_type: AuditEventType,
        severity: AuditSeverity,
        event_data: Dict[str, Any],
        decision_rationale: Optional[str] = None,
        system_state: Optional[Dict[str, Any]] = None
    ) -> bool:
        """
        Log a system-level event (startup, shutdown, errors).
        
        Args:
            event_type: Type of system event
            severity: Event severity level
            event_data: Details about the event
            decision_rationale: Reason for any decisions made
            system_state: Current system state
            
        Returns:
            bool: True if logged successfully
        """
        entry = AuditLogEntry(
            entry_id=str(uuid.uuid4()),
            timestamp=datetime.now(timezone.utc),
            event_type=event_type,
            severity=severity,
            event_data=event_data,
            decision_rationale=decision_rationale,
            system_state=system_state,
            previous_entry_hash=self.last_entry_hash
        )
        
        return await self._write_audit_entry(entry)
    
    async def log_trade_decision(
        self,
        user_id: str,
        wallet_address: str,
        trader_address: str,
        decision_data: Dict[str, Any],
        decision_rationale: str,
        risk_assessment: Dict[str, Any]
    ) -> bool:
        """
        Log a trade decision made by the bot.
        
        Args:
            user_id: ID of user whose trade is being executed
            wallet_address: User's wallet address
            trader_address: Trader being replicated
            decision_data: Details of the trading decision
            decision_rationale: Explanation of why this decision was made
            risk_assessment: Risk evaluation that informed the decision
            
        Returns:
            bool: True if logged successfully
        """
        entry = AuditLogEntry(
            entry_id=str(uuid.uuid4()),
            timestamp=datetime.now(timezone.utc),
            event_type=AuditEventType.TRADE_DECISION,
            severity=AuditSeverity.INFO,
            user_id=user_id,
            wallet_address=wallet_address,
            trader_address=trader_address,
            event_data=decision_data,
            decision_rationale=decision_rationale,
            risk_assessment=risk_assessment,
            previous_entry_hash=self.last_entry_hash
        )
        
        return await self._write_audit_entry(entry)
    
    async def log_trade_execution(
        self,
        user_id: str,
        wallet_address: str,
        trader_address: str,
        trade_details: Dict[str, Any],
        transaction_signature: Optional[str] = None,
        success: bool = True,
        error_message: Optional[str] = None
    ) -> bool:
        """
        Log trade execution attempt.
        
        Args:
            user_id: ID of user whose trade was executed
            wallet_address: User's wallet address
            trader_address: Trader being replicated
            trade_details: Complete trade execution details
            transaction_signature: On-chain transaction hash if successful
            success: Whether execution was successful
            error_message: Error message if execution failed
            
        Returns:
            bool: True if logged successfully
        """
        event_type = AuditEventType.TRADE_SUCCESS if success else AuditEventType.TRADE_FAILURE
        severity = AuditSeverity.INFO if success else AuditSeverity.ERROR
        
        entry = AuditLogEntry(
            entry_id=str(uuid.uuid4()),
            timestamp=datetime.now(timezone.utc),
            event_type=event_type,
            severity=severity,
            user_id=user_id,
            wallet_address=wallet_address,
            trader_address=trader_address,
            trade_details=trade_details,
            transaction_signature=transaction_signature,
            error_message=error_message,
            previous_entry_hash=self.last_entry_hash
        )
        
        return await self._write_audit_entry(entry)
    
    async def log_error_event(
        self,
        error_message: str,
        error_type: str,
        severity: AuditSeverity = AuditSeverity.ERROR,
        user_id: Optional[str] = None,
        wallet_address: Optional[str] = None,
        stack_trace: Optional[str] = None,
        context_data: Optional[Dict[str, Any]] = None
    ) -> bool:
        """
        Log error events for debugging and monitoring.
        
        Args:
            error_message: Description of the error
            error_type: Type/category of error
            severity: Severity level of the error
            user_id: User affected by error (if applicable)
            wallet_address: Wallet involved in error (if applicable)
            stack_trace: Full stack trace for debugging
            context_data: Additional context about the error
            
        Returns:
            bool: True if logged successfully
        """
        entry = AuditLogEntry(
            entry_id=str(uuid.uuid4()),
            timestamp=datetime.now(timezone.utc),
            event_type=AuditEventType.ERROR_EVENT,
            severity=severity,
            user_id=user_id,
            wallet_address=wallet_address,
            error_message=error_message,
            error_type=error_type,
            stack_trace=stack_trace,
            event_data=context_data or {},
            previous_entry_hash=self.last_entry_hash
        )
        
        return await self._write_audit_entry(entry)
    
    async def _write_audit_entry(self, entry: AuditLogEntry) -> bool:
        """
        Write audit entry to immutable database.
        
        Args:
            entry: Audit log entry to write
            
        Returns:
            bool: True if written successfully
        """
        if not self.pool:
            logger.error("Audit logging pool not initialized")
            return False
        
        try:
            # Convert entry to database format
            entry_dict = entry.to_dict()
            
            # Insert into database (append-only)
            insert_sql = f"""
                INSERT INTO {self.table_name} (
                    entry_id, timestamp, event_type, severity,
                    user_id, wallet_address, trader_address,
                    event_data, decision_rationale, risk_assessment,
                    trade_details, transaction_signature,
                    error_message, error_type, stack_trace,
                    bot_version, system_state,
                    calculation_inputs, calculation_outputs, decision_factors,
                    validation_results, performance_metrics, context_snapshot,
                    correlation_id, entry_hash, previous_entry_hash
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                    $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
                    $21, $22, $23, $24, $25, $26
                )
            """
            
            async with self.pool.acquire() as conn:
                await conn.execute(
                    insert_sql,
                    entry_dict["entry_id"],
                    entry_dict["timestamp"],
                    entry_dict["event_type"],
                    entry_dict["severity"],
                    entry_dict["user_id"],
                    entry_dict["wallet_address"],
                    entry_dict["trader_address"],
                    entry_dict["event_data"],
                    entry_dict["decision_rationale"],
                    entry_dict["risk_assessment"],
                    entry_dict["trade_details"],
                    entry_dict["transaction_signature"],
                    entry_dict["error_message"],
                    entry_dict["error_type"],
                    entry_dict["stack_trace"],
                    entry_dict["bot_version"],
                    entry_dict["system_state"],
                    entry_dict["calculation_inputs"],
                    entry_dict["calculation_outputs"],
                    entry_dict["decision_factors"],
                    entry_dict["validation_results"],
                    entry_dict["performance_metrics"],
                    entry_dict["context_snapshot"],
                    entry_dict["correlation_id"],
                    entry_dict["entry_hash"],
                    entry_dict["previous_entry_hash"]
                )
            
            # Update last entry hash for chaining
            self.last_entry_hash = entry.entry_hash
            
            # Log to structured logger as well
            logger.info(
                "Audit entry logged",
                entry_id=entry.entry_id,
                event_type=entry.event_type.value,
                severity=entry.severity.value,
                user_id=entry.user_id
            )
            
            return True
            
        except Exception as e:
            # Critical: audit logging must never fail
            logger.critical(
                "CRITICAL: Failed to write audit entry",
                entry_id=entry.entry_id,
                error=str(e),
                error_type=type(e).__name__
            )
            return False
    
    async def verify_entry_integrity(self, entry_id: str) -> bool:
        """
        Verify the cryptographic integrity of an audit entry.
        
        Args:
            entry_id: UUID of entry to verify
            
        Returns:
            bool: True if entry integrity is valid
        """
        try:
            async with self.pool.acquire() as conn:
                row = await conn.fetchrow(
                    f"SELECT * FROM {self.table_name} WHERE entry_id = $1",
                    entry_id
                )
                
                if not row:
                    return False
                
                # Reconstruct entry and verify hash
                stored_hash = row['entry_hash']
                
                # Create entry object from stored data
                entry_data = dict(row)
                entry_data.pop('entry_hash')  # Remove hash for recalculation
                entry_data.pop('created_at')  # Remove auto-generated field
                
                # Parse JSON fields
                for json_field in ['event_data', 'risk_assessment', 'trade_details', 'system_state', 
                                 'calculation_inputs', 'calculation_outputs', 'decision_factors',
                                 'validation_results', 'performance_metrics', 'context_snapshot']:
                    if entry_data[json_field]:
                        entry_data[json_field] = json.loads(entry_data[json_field])
                
                # Create temporary entry to calculate hash
                temp_entry = AuditLogEntry(
                    entry_id=entry_data['entry_id'],
                    timestamp=entry_data['timestamp'],
                    event_type=AuditEventType(entry_data['event_type']),
                    severity=AuditSeverity(entry_data['severity']),
                    user_id=entry_data['user_id'],
                    wallet_address=entry_data['wallet_address'],
                    trader_address=entry_data['trader_address'],
                    event_data=entry_data['event_data'] or {},
                    decision_rationale=entry_data['decision_rationale'],
                    risk_assessment=entry_data['risk_assessment'],
                    trade_details=entry_data['trade_details'],
                    transaction_signature=entry_data['transaction_signature'],
                    error_message=entry_data['error_message'],
                    error_type=entry_data['error_type'],
                    stack_trace=entry_data['stack_trace'],
                    bot_version=entry_data['bot_version'],
                    system_state=entry_data['system_state'],
                    # NFR-2: Enhanced tracking fields
                    calculation_inputs=entry_data.get('calculation_inputs'),
                    calculation_outputs=entry_data.get('calculation_outputs'),
                    decision_factors=entry_data.get('decision_factors'),
                    validation_results=entry_data.get('validation_results'),
                    performance_metrics=entry_data.get('performance_metrics'),
                    context_snapshot=entry_data.get('context_snapshot'),
                    correlation_id=entry_data.get('correlation_id'),
                    previous_entry_hash=entry_data['previous_entry_hash']
                )
                
                # Compare hashes
                calculated_hash = temp_entry.entry_hash
                is_valid = calculated_hash == stored_hash
                
                logger.info(
                    "Entry integrity verification",
                    entry_id=entry_id,
                    is_valid=is_valid
                )
                
                return is_valid
                
        except Exception as e:
            logger.error(
                "Failed to verify entry integrity",
                entry_id=entry_id,
                error=str(e)
            )
            return False
    
    async def log_key_operation(
        self,
        operation_type: str,
        user_id: str,
        key_identifier: str,
        operation_details: Dict[str, Any],
        success: bool,
        error_message: Optional[str] = None
    ) -> bool:
        """
        Log HSM key operations for SR-1 compliance.
        
        Args:
            operation_type: Type of key operation (sign_transaction, sign_message, etc.)
            user_id: User ID associated with the operation
            key_identifier: HSM key identifier or provider name
            operation_details: Detailed operation context
            success: Whether the operation succeeded
            error_message: Error message if operation failed
            
        Returns:
            bool: True if logged successfully
        """
        severity = AuditSeverity.INFO if success else AuditSeverity.ERROR
        
        entry = AuditLogEntry(
            entry_id=str(uuid.uuid4()),
            timestamp=datetime.now(timezone.utc),
            event_type=AuditEventType.KEY_OPERATION,
            severity=severity,
            user_id=user_id,
            event_data={
                "operation_type": operation_type,
                "key_identifier": key_identifier,
                "success": success,
                "operation_details": operation_details
            },
            decision_rationale=f"HSM key operation: {operation_type}",
            error_message=error_message,
            previous_entry_hash=self.last_entry_hash
        )
        
        return await self._write_audit_entry(entry)
    
    async def log_security_violation(
        self,
        violation_type: str,
        user_id: Optional[str],
        wallet_address: Optional[str],
        violation_details: Dict[str, Any],
        severity: AuditSeverity = AuditSeverity.CRITICAL
    ) -> bool:
        """
        Log security violations for immediate alerting.
        
        Args:
            violation_type: Type of security violation detected
            user_id: User ID if applicable
            wallet_address: Wallet address if applicable
            violation_details: Detailed violation information
            severity: Severity level of the violation
            
        Returns:
            bool: True if logged successfully
        """
        entry = AuditLogEntry(
            entry_id=str(uuid.uuid4()),
            timestamp=datetime.now(timezone.utc),
            event_type=AuditEventType.SECURITY_VIOLATION,
            severity=severity,
            user_id=user_id,
            wallet_address=wallet_address,
            event_data={
                "violation_type": violation_type,
                "violation_details": violation_details,
                "timestamp": datetime.now(timezone.utc).isoformat()
            },
            decision_rationale=f"Security violation detected: {violation_type}",
            previous_entry_hash=self.last_entry_hash
        )
        
        return await self._write_audit_entry(entry)
    
    # NFR-2: Enhanced detailed tracking methods
    
    async def log_calculation(
        self,
        calculation_type: str,
        inputs: Dict[str, Any],
        outputs: Dict[str, Any],
        user_id: Optional[str] = None,
        wallet_address: Optional[str] = None,
        performance_metrics: Optional[Dict[str, float]] = None,
        correlation_id: Optional[str] = None
    ) -> bool:
        """
        Log detailed calculation tracking for NFR-2.
        
        Args:
            calculation_type: Type of calculation performed
            inputs: Input parameters used in calculation
            outputs: Results produced by calculation
            user_id: User ID if calculation is user-specific
            wallet_address: Wallet address if applicable
            performance_metrics: Timing and performance data
            correlation_id: ID to correlate related events
            
        Returns:
            bool: True if logged successfully
        """
        entry = AuditLogEntry(
            entry_id=str(uuid.uuid4()),
            timestamp=datetime.now(timezone.utc),
            event_type=AuditEventType.CALCULATION_PERFORMED,
            severity=AuditSeverity.INFO,
            user_id=user_id,
            wallet_address=wallet_address,
            event_data={
                "calculation_type": calculation_type,
                "calculation_timestamp": datetime.now(timezone.utc).isoformat()
            },
            decision_rationale=f"Performed calculation: {calculation_type}",
            calculation_inputs=inputs,
            calculation_outputs=outputs,
            performance_metrics=performance_metrics,
            correlation_id=correlation_id,
            previous_entry_hash=self.last_entry_hash
        )
        
        return await self._write_audit_entry(entry)
    
    async def log_decision_point(
        self,
        decision_type: str,
        decision_factors: List[str],
        decision_outcome: str,
        user_id: Optional[str] = None,
        wallet_address: Optional[str] = None,
        context_snapshot: Optional[Dict[str, Any]] = None,
        correlation_id: Optional[str] = None
    ) -> bool:
        """
        Log detailed decision point tracking for NFR-2.
        
        Args:
            decision_type: Type of decision being made
            decision_factors: List of factors that influenced the decision
            decision_outcome: The decision that was made
            user_id: User ID if decision is user-specific
            wallet_address: Wallet address if applicable
            context_snapshot: System context at time of decision
            correlation_id: ID to correlate related events
            
        Returns:
            bool: True if logged successfully
        """
        entry = AuditLogEntry(
            entry_id=str(uuid.uuid4()),
            timestamp=datetime.now(timezone.utc),
            event_type=AuditEventType.DECISION_POINT,
            severity=AuditSeverity.INFO,
            user_id=user_id,
            wallet_address=wallet_address,
            event_data={
                "decision_type": decision_type,
                "decision_outcome": decision_outcome,
                "decision_timestamp": datetime.now(timezone.utc).isoformat()
            },
            decision_rationale=f"Decision made: {decision_outcome}",
            decision_factors=decision_factors,
            context_snapshot=context_snapshot,
            correlation_id=correlation_id,
            previous_entry_hash=self.last_entry_hash
        )
        
        return await self._write_audit_entry(entry)
    
    async def log_validation_check(
        self,
        validation_type: str,
        validation_results: Dict[str, bool],
        overall_result: bool,
        user_id: Optional[str] = None,
        wallet_address: Optional[str] = None,
        validation_details: Optional[Dict[str, Any]] = None,
        correlation_id: Optional[str] = None
    ) -> bool:
        """
        Log detailed validation check tracking for NFR-2.
        
        Args:
            validation_type: Type of validation performed
            validation_results: Results of individual validation checks
            overall_result: Overall validation result (pass/fail)
            user_id: User ID if validation is user-specific
            wallet_address: Wallet address if applicable
            validation_details: Additional validation context
            correlation_id: ID to correlate related events
            
        Returns:
            bool: True if logged successfully
        """
        entry = AuditLogEntry(
            entry_id=str(uuid.uuid4()),
            timestamp=datetime.now(timezone.utc),
            event_type=AuditEventType.VALIDATION_CHECK,
            severity=AuditSeverity.WARNING if not overall_result else AuditSeverity.INFO,
            user_id=user_id,
            wallet_address=wallet_address,
            event_data={
                "validation_type": validation_type,
                "overall_result": overall_result,
                "validation_timestamp": datetime.now(timezone.utc).isoformat(),
                **(validation_details or {})
            },
            decision_rationale=f"Validation {validation_type}: {'PASSED' if overall_result else 'FAILED'}",
            validation_results=validation_results,
            correlation_id=correlation_id,
            previous_entry_hash=self.last_entry_hash
        )
        
        return await self._write_audit_entry(entry)
    
    async def log_state_change(
        self,
        component: str,
        old_state: str,
        new_state: str,
        change_reason: str,
        user_id: Optional[str] = None,
        wallet_address: Optional[str] = None,
        state_context: Optional[Dict[str, Any]] = None,
        correlation_id: Optional[str] = None
    ) -> bool:
        """
        Log detailed state change tracking for NFR-2.
        
        Args:
            component: System component that changed state
            old_state: Previous state
            new_state: New state after change
            change_reason: Reason for the state change
            user_id: User ID if change is user-specific
            wallet_address: Wallet address if applicable
            state_context: Additional context about the state change
            correlation_id: ID to correlate related events
            
        Returns:
            bool: True if logged successfully
        """
        entry = AuditLogEntry(
            entry_id=str(uuid.uuid4()),
            timestamp=datetime.now(timezone.utc),
            event_type=AuditEventType.STATE_CHANGE,
            severity=AuditSeverity.INFO,
            user_id=user_id,
            wallet_address=wallet_address,
            event_data={
                "component": component,
                "old_state": old_state,
                "new_state": new_state,
                "change_reason": change_reason,
                "state_change_timestamp": datetime.now(timezone.utc).isoformat(),
                **(state_context or {})
            },
            decision_rationale=f"State change in {component}: {old_state} → {new_state}",
            context_snapshot={
                "component": component,
                "transition": f"{old_state} → {new_state}",
                **(state_context or {})
            },
            correlation_id=correlation_id,
            previous_entry_hash=self.last_entry_hash
        )
        
        return await self._write_audit_entry(entry)
    
    async def log_idempotency_check(
        self,
        operation_type: str,
        idempotency_key: str,
        check_result: str,
        user_id: Optional[str] = None,
        operation_details: Optional[Dict[str, Any]] = None,
        correlation_id: Optional[str] = None
    ) -> bool:
        """
        Log idempotency check tracking for NFR-2.
        
        Args:
            operation_type: Type of operation being checked
            idempotency_key: Idempotency key used for the check
            check_result: Result of idempotency check (allow/prevent/retry)
            user_id: User ID if operation is user-specific
            operation_details: Details about the operation
            correlation_id: ID to correlate related events
            
        Returns:
            bool: True if logged successfully
        """
        entry = AuditLogEntry(
            entry_id=str(uuid.uuid4()),
            timestamp=datetime.now(timezone.utc),
            event_type=AuditEventType.IDEMPOTENCY_CHECK,
            severity=AuditSeverity.INFO,
            user_id=user_id,
            event_data={
                "operation_type": operation_type,
                "idempotency_key": idempotency_key[:16] + "..." if len(idempotency_key) > 16 else idempotency_key,
                "check_result": check_result,
                "check_timestamp": datetime.now(timezone.utc).isoformat(),
                **(operation_details or {})
            },
            decision_rationale=f"Idempotency check for {operation_type}: {check_result}",
            correlation_id=correlation_id,
            previous_entry_hash=self.last_entry_hash
        )
        
        return await self._write_audit_entry(entry)
    
    async def close(self):
        """Close audit logging system and connection pool."""
        if self.pool:
            # Log system shutdown
            await self.log_system_event(
                event_type=AuditEventType.SYSTEM_STOP,
                severity=AuditSeverity.INFO,
                event_data={
                    "shutdown_at": datetime.now(timezone.utc).isoformat()
                },
                decision_rationale="Trade execution bot shutting down"
            )
            
            await self.pool.close()
            logger.info("Audit logging system closed")


# Global audit logger instance
audit_logger: Optional[ImmutableAuditLogger] = None


def get_audit_logger() -> ImmutableAuditLogger:
    """Get the global audit logger instance."""
    global audit_logger
    if audit_logger is None:
        audit_logger = ImmutableAuditLogger()
    return audit_logger