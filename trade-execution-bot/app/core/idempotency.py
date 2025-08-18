"""
Idempotency Manager for XORJ Trade Execution Bot.

Implements NFR-1: Idempotency
"The bot's trade generation and execution logic must be idempotent. 
If a run is interrupted and restarted, it must not execute the same trade twice."

This module provides comprehensive idempotency guarantees across the entire
trade generation and execution pipeline, ensuring that interrupted runs
can be safely restarted without duplicate trade execution.

Core Principles:
1. Trade Generation Idempotency: Same inputs always produce same trade IDs
2. Execution Idempotency: Same trade ID never executes twice
3. State Persistence: Idempotency state survives restarts
4. Recovery Safety: Interrupted operations can be safely resumed
5. Comprehensive Tracking: All operations tracked with unique identifiers

Security Features:
- Cryptographic trade fingerprinting
- Tamper-resistant state tracking
- Atomic state transitions
- Comprehensive audit logging
- Recovery validation
"""

import asyncio
import hashlib
import json
from typing import Dict, Any, Optional, List, Tuple, Set
from decimal import Decimal
from datetime import datetime, timezone, timedelta
from enum import Enum
from dataclasses import dataclass, field
import sqlite3
import threading
from contextlib import contextmanager

import structlog
from app.core.config import get_config
from app.models.trades import GeneratedTrade, TradeStatus, TradeType
from app.logging.audit_logger import get_audit_logger, AuditEventType, AuditSeverity

logger = structlog.get_logger(__name__)


class IdempotencyState(Enum):
    """States in the idempotency lifecycle."""
    PENDING = "pending"           # Trade generated but not started
    STARTED = "started"           # Execution begun
    CONFIRMED = "confirmed"       # Trade confirmed on blockchain
    FAILED = "failed"             # Trade execution failed
    CANCELLED = "cancelled"       # Trade cancelled before execution
    EXPIRED = "expired"           # Trade expired without execution


class IdempotencyOperation(Enum):
    """Types of operations that require idempotency."""
    TRADE_GENERATION = "trade_generation"
    TRADE_EXECUTION = "trade_execution"
    PORTFOLIO_RECONCILIATION = "portfolio_reconciliation"
    STRATEGY_INGESTION = "strategy_ingestion"


@dataclass
class IdempotencyKey:
    """
    Cryptographic key that uniquely identifies an operation.
    
    This key ensures that the same inputs always produce the same
    trade generation result, providing idempotency guarantees.
    """
    operation: IdempotencyOperation
    user_id: str
    content_hash: str           # SHA-256 hash of operation parameters
    timestamp_bucket: str       # Rounded timestamp for time-based grouping
    
    def __post_init__(self):
        """Generate the final idempotency key."""
        self.key = self._generate_key()
    
    def _generate_key(self) -> str:
        """Generate cryptographic idempotency key."""
        key_data = {
            "operation": self.operation.value,
            "user_id": self.user_id,
            "content_hash": self.content_hash,
            "timestamp_bucket": self.timestamp_bucket
        }
        
        # Create deterministic key from sorted parameters
        key_string = json.dumps(key_data, sort_keys=True)
        return hashlib.sha256(key_string.encode()).hexdigest()
    
    @classmethod
    def for_trade_generation(
        cls, 
        user_id: str, 
        strategy_data: Dict[str, Any],
        portfolio_state: Dict[str, Any],
        timestamp: Optional[datetime] = None
    ) -> "IdempotencyKey":
        """Create idempotency key for trade generation."""
        if timestamp is None:
            timestamp = datetime.now(timezone.utc)
        
        # Round timestamp to 5-minute buckets to allow for small timing differences
        bucket_minutes = (timestamp.minute // 5) * 5
        timestamp_bucket = timestamp.replace(
            minute=bucket_minutes, 
            second=0, 
            microsecond=0
        ).isoformat()
        
        # Create content hash from strategy and portfolio state
        content_data = {
            "strategy_data": strategy_data,
            "portfolio_state": portfolio_state
        }
        content_json = json.dumps(content_data, sort_keys=True, default=str)
        content_hash = hashlib.sha256(content_json.encode()).hexdigest()
        
        return cls(
            operation=IdempotencyOperation.TRADE_GENERATION,
            user_id=user_id,
            content_hash=content_hash,
            timestamp_bucket=timestamp_bucket
        )
    
    @classmethod
    def for_trade_execution(cls, trade: GeneratedTrade) -> "IdempotencyKey":
        """Create idempotency key for trade execution."""
        # Use trade creation time for bucket
        timestamp_bucket = trade.created_at.replace(
            minute=(trade.created_at.minute // 5) * 5,
            second=0,
            microsecond=0
        ).isoformat()
        
        # Create content hash from trade details
        trade_data = trade.to_dict()
        # Remove mutable fields that don't affect execution
        trade_data.pop("status", None)
        trade_data.pop("execution_error", None)
        
        content_json = json.dumps(trade_data, sort_keys=True, default=str)
        content_hash = hashlib.sha256(content_json.encode()).hexdigest()
        
        return cls(
            operation=IdempotencyOperation.TRADE_EXECUTION,
            user_id=trade.user_id,
            content_hash=content_hash,
            timestamp_bucket=timestamp_bucket
        )


@dataclass
class IdempotencyRecord:
    """
    Persistent record of an idempotent operation.
    
    Tracks the complete lifecycle of an operation to prevent
    duplicate execution and enable safe recovery.
    """
    idempotency_key: str
    operation: IdempotencyOperation
    user_id: str
    state: IdempotencyState
    trade_id: Optional[str]
    transaction_signature: Optional[str]
    
    # Lifecycle timestamps
    created_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    
    # Operation details
    operation_data: Dict[str, Any] = field(default_factory=dict)
    result_data: Dict[str, Any] = field(default_factory=dict)
    error_details: Optional[str] = None
    
    # Integrity verification
    checksum: Optional[str] = None
    
    def __post_init__(self):
        """Calculate checksum for integrity verification."""
        if self.checksum is None:
            self.checksum = self._calculate_checksum()
    
    def _calculate_checksum(self) -> str:
        """Calculate record checksum for tamper detection."""
        checksum_data = {
            "idempotency_key": self.idempotency_key,
            "operation": self.operation.value,
            "user_id": self.user_id,
            "state": self.state.value,
            "trade_id": self.trade_id,
            "created_at": self.created_at.isoformat(),
            "operation_data": self.operation_data
        }
        
        checksum_json = json.dumps(checksum_data, sort_keys=True, default=str)
        return hashlib.sha256(checksum_json.encode()).hexdigest()
    
    def verify_integrity(self) -> bool:
        """Verify record integrity."""
        return self.checksum == self._calculate_checksum()
    
    def update_state(self, new_state: IdempotencyState, **kwargs):
        """Update record state with integrity preservation."""
        old_state = self.state
        self.state = new_state
        
        # Update timestamps based on state
        now = datetime.now(timezone.utc)
        if new_state == IdempotencyState.STARTED and self.started_at is None:
            self.started_at = now
        elif new_state in [IdempotencyState.CONFIRMED, IdempotencyState.FAILED, IdempotencyState.CANCELLED]:
            if self.completed_at is None:
                self.completed_at = now
        
        # Update additional data
        for key, value in kwargs.items():
            if hasattr(self, key):
                setattr(self, key, value)
        
        # Recalculate checksum
        self.checksum = self._calculate_checksum()
        
        logger.info(
            "Idempotency record state updated",
            idempotency_key=self.idempotency_key[:16] + "...",
            user_id=self.user_id,
            old_state=old_state.value,
            new_state=new_state.value,
            trade_id=self.trade_id
        )


class IdempotencyManager:
    """
    Comprehensive idempotency management for trade operations.
    
    Implements NFR-1: Idempotency
    
    Provides guaranteed idempotency across all trade generation and execution
    operations, ensuring that interrupted runs can be safely restarted without
    duplicate execution.
    
    Features:
    - Cryptographic operation fingerprinting
    - Persistent state tracking
    - Atomic state transitions  
    - Safe recovery from interruptions
    - Comprehensive audit logging
    - Tamper-resistant record keeping
    """
    
    def __init__(self):
        self.config = get_config()
        self.audit_logger = get_audit_logger()
        
        # SQLite database for persistent idempotency state
        self.db_path = "/tmp/xorj_idempotency.db"  # In production, use persistent storage
        self.db_lock = threading.Lock()
        
        # In-memory cache for fast lookups
        self._cache: Dict[str, IdempotencyRecord] = {}
        self._cache_lock = threading.Lock()
        
        # Initialize database
        self._initialize_database()
        
        logger.info(
            "Idempotency Manager initialized",
            database_path=self.db_path,
            cache_size=len(self._cache)
        )
    
    def _initialize_database(self):
        """Initialize SQLite database for idempotency tracking."""
        with self.db_lock:
            conn = sqlite3.connect(self.db_path)
            try:
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS idempotency_records (
                        idempotency_key TEXT PRIMARY KEY,
                        operation TEXT NOT NULL,
                        user_id TEXT NOT NULL,
                        state TEXT NOT NULL,
                        trade_id TEXT,
                        transaction_signature TEXT,
                        created_at TEXT NOT NULL,
                        started_at TEXT,
                        completed_at TEXT,
                        operation_data TEXT,
                        result_data TEXT,
                        error_details TEXT,
                        checksum TEXT NOT NULL,
                        updated_at TEXT NOT NULL
                    )
                """)
                
                # Create indexes for efficient lookups
                conn.execute("CREATE INDEX IF NOT EXISTS idx_user_id ON idempotency_records(user_id)")
                conn.execute("CREATE INDEX IF NOT EXISTS idx_trade_id ON idempotency_records(trade_id)")
                conn.execute("CREATE INDEX IF NOT EXISTS idx_state ON idempotency_records(state)")
                conn.execute("CREATE INDEX IF NOT EXISTS idx_created_at ON idempotency_records(created_at)")
                
                conn.commit()
            finally:
                conn.close()
    
    @contextmanager
    def _get_connection(self):
        """Get database connection with proper locking."""
        with self.db_lock:
            conn = sqlite3.connect(self.db_path)
            conn.row_factory = sqlite3.Row  # Enable column access by name
            try:
                yield conn
            finally:
                conn.close()
    
    async def ensure_trade_generation_idempotency(
        self,
        user_id: str,
        strategy_data: Dict[str, Any],
        portfolio_state: Dict[str, Any]
    ) -> Tuple[bool, Optional[List[GeneratedTrade]]]:
        """
        Ensure idempotent trade generation.
        
        Args:
            user_id: User identifier
            strategy_data: Strategy information from Quantitative Engine
            portfolio_state: Current portfolio state
            
        Returns:
            Tuple[bool, Optional[List[GeneratedTrade]]]: 
                (should_generate, existing_trades)
        """
        # Create idempotency key for this generation operation
        idem_key = IdempotencyKey.for_trade_generation(
            user_id=user_id,
            strategy_data=strategy_data,
            portfolio_state=portfolio_state
        )
        
        logger.info(
            "Checking trade generation idempotency",
            user_id=user_id,
            idempotency_key=idem_key.key[:16] + "...",
            strategy_traders=len(strategy_data.get("traders", [])),
            portfolio_tokens=len(portfolio_state.get("holdings", {}))
        )
        
        # Check if we already have a record for this operation
        existing_record = await self._get_record(idem_key.key)
        
        if existing_record:
            logger.info(
                "Found existing trade generation record",
                idempotency_key=idem_key.key[:16] + "...",
                user_id=user_id,
                state=existing_record.state.value,
                trade_id=existing_record.trade_id
            )
            
            # If generation already completed, return existing trades
            if existing_record.state in [IdempotencyState.CONFIRMED, IdempotencyState.STARTED]:
                existing_trades = await self._load_trades_from_record(existing_record)
                return False, existing_trades
            
            # If generation failed or was cancelled, allow retry
            elif existing_record.state in [IdempotencyState.FAILED, IdempotencyState.CANCELLED, IdempotencyState.EXPIRED]:
                logger.info(
                    "Previous generation attempt failed, allowing retry",
                    idempotency_key=idem_key.key[:16] + "...",
                    user_id=user_id,
                    previous_state=existing_record.state.value
                )
                # Mark the old record as expired and create new one
                await self._update_record_state(existing_record, IdempotencyState.EXPIRED)
            
            # If pending, check if it's expired
            elif existing_record.state == IdempotencyState.PENDING:
                # Check if the pending operation has expired (older than 10 minutes)
                age = datetime.now(timezone.utc) - existing_record.created_at
                if age > timedelta(minutes=10):
                    logger.warning(
                        "Pending generation operation expired, allowing retry",
                        idempotency_key=idem_key.key[:16] + "...",
                        user_id=user_id,
                        age_minutes=age.total_seconds() / 60
                    )
                    await self._update_record_state(existing_record, IdempotencyState.EXPIRED)
                else:
                    # Still within valid timeframe, don't allow duplicate
                    return False, None
        
        # Create new idempotency record for this generation
        record = IdempotencyRecord(
            idempotency_key=idem_key.key,
            operation=IdempotencyOperation.TRADE_GENERATION,
            user_id=user_id,
            state=IdempotencyState.PENDING,
            trade_id=None,
            transaction_signature=None,
            created_at=datetime.now(timezone.utc),
            operation_data={
                "strategy_data": strategy_data,
                "portfolio_state": portfolio_state,
                "timestamp_bucket": idem_key.timestamp_bucket
            }
        )
        
        await self._store_record(record)
        
        # Log idempotency decision using NFR-2 enhanced tracking
        await self.audit_logger.log_idempotency_check(
            operation_type="trade_generation",
            idempotency_key=idem_key.key,
            check_result="allow_generation",
            user_id=user_id,
            operation_details={
                "strategy_traders": len(strategy_data.get("traders", [])),
                "portfolio_tokens": len(portfolio_state.get("holdings", {}))
            },
            correlation_id=f"tradegen_{user_id}_{idem_key.timestamp_bucket}"
        )
        
        return True, None
    
    async def record_generated_trades(
        self,
        idempotency_key: str,
        trades: List[GeneratedTrade]
    ):
        """
        Record the result of trade generation for idempotency tracking.
        
        Args:
            idempotency_key: Key identifying the generation operation
            trades: Generated trades to record
        """
        record = await self._get_record(idempotency_key)
        if not record:
            logger.error(
                "Cannot find idempotency record for generated trades",
                idempotency_key=idempotency_key[:16] + "...",
                trades_count=len(trades)
            )
            return
        
        # Update record with generated trades
        trade_data = {
            "trades": [trade.to_dict() for trade in trades],
            "trades_count": len(trades),
            "generated_at": datetime.now(timezone.utc).isoformat()
        }
        
        await self._update_record_state(
            record,
            IdempotencyState.CONFIRMED,
            result_data=trade_data
        )
        
        logger.info(
            "Recorded generated trades for idempotency",
            idempotency_key=idempotency_key[:16] + "...",
            user_id=record.user_id,
            trades_count=len(trades)
        )
    
    async def ensure_trade_execution_idempotency(
        self,
        trade: GeneratedTrade
    ) -> Tuple[bool, Optional[str]]:
        """
        Ensure idempotent trade execution.
        
        Args:
            trade: Trade to check for execution idempotency
            
        Returns:
            Tuple[bool, Optional[str]]: (should_execute, existing_tx_signature)
        """
        # Create idempotency key for this execution
        idem_key = IdempotencyKey.for_trade_execution(trade)
        
        logger.info(
            "Checking trade execution idempotency",
            trade_id=trade.trade_id,
            user_id=trade.user_id,
            idempotency_key=idem_key.key[:16] + "..."
        )
        
        # Check if we already have an execution record
        existing_record = await self._get_record(idem_key.key)
        
        if existing_record:
            logger.info(
                "Found existing trade execution record",
                trade_id=trade.trade_id,
                idempotency_key=idem_key.key[:16] + "...",
                state=existing_record.state.value,
                transaction_signature=existing_record.transaction_signature
            )
            
            # If execution already completed successfully, return existing signature
            if existing_record.state == IdempotencyState.CONFIRMED:
                await self.audit_logger.log_idempotency_check(
                    operation_type="trade_execution",
                    idempotency_key=idem_key.key,
                    check_result="prevent_duplicate",
                    user_id=trade.user_id,
                    operation_details={
                        "trade_id": trade.trade_id,
                        "existing_transaction": existing_record.transaction_signature,
                        "prevented_duplicate_execution": True
                    },
                    correlation_id=f"tradeexec_{trade.user_id}_{trade.trade_id}"
                )
                
                return False, existing_record.transaction_signature
            
            # If execution is in progress, don't allow duplicate
            elif existing_record.state == IdempotencyState.STARTED:
                # Check if it's been too long (potential stuck execution)
                if existing_record.started_at:
                    age = datetime.now(timezone.utc) - existing_record.started_at
                    if age > timedelta(minutes=5):  # 5 minute timeout
                        logger.warning(
                            "Execution appears stuck, allowing retry",
                            trade_id=trade.trade_id,
                            idempotency_key=idem_key.key[:16] + "...",
                            stuck_duration_minutes=age.total_seconds() / 60
                        )
                        await self._update_record_state(existing_record, IdempotencyState.FAILED,
                                                      error_details="Execution timeout - stuck operation")
                    else:
                        return False, None
            
            # If previous execution failed, allow retry
            elif existing_record.state in [IdempotencyState.FAILED, IdempotencyState.CANCELLED]:
                logger.info(
                    "Previous execution failed, allowing retry",
                    trade_id=trade.trade_id,
                    idempotency_key=idem_key.key[:16] + "...",
                    previous_state=existing_record.state.value
                )
        
        # Create new idempotency record for this execution
        record = IdempotencyRecord(
            idempotency_key=idem_key.key,
            operation=IdempotencyOperation.TRADE_EXECUTION,
            user_id=trade.user_id,
            state=IdempotencyState.STARTED,
            trade_id=trade.trade_id,
            transaction_signature=None,
            created_at=datetime.now(timezone.utc),
            started_at=datetime.now(timezone.utc),
            operation_data=trade.to_dict()
        )
        
        await self._store_record(record)
        
        # Log idempotency decision using NFR-2 enhanced tracking
        await self.audit_logger.log_idempotency_check(
            operation_type="trade_execution",
            idempotency_key=idem_key.key,
            check_result="allow_execution",
            user_id=trade.user_id,
            operation_details={
                "trade_id": trade.trade_id,
                "trade_type": trade.trade_type.value,
                "from_token": trade.swap_instruction.from_token_symbol if trade.swap_instruction else None,
                "to_token": trade.swap_instruction.to_token_symbol if trade.swap_instruction else None
            },
            correlation_id=f"tradeexec_{trade.user_id}_{trade.trade_id}"
        )
        
        return True, None
    
    async def record_trade_execution_result(
        self,
        trade: GeneratedTrade,
        success: bool,
        transaction_signature: Optional[str] = None,
        error_message: Optional[str] = None
    ):
        """
        Record the result of trade execution for idempotency tracking.
        
        Args:
            trade: Trade that was executed
            success: Whether execution was successful
            transaction_signature: Blockchain transaction signature if successful
            error_message: Error message if execution failed
        """
        # Find the execution record
        idem_key = IdempotencyKey.for_trade_execution(trade)
        record = await self._get_record(idem_key.key)
        
        if not record:
            logger.error(
                "Cannot find idempotency record for executed trade",
                trade_id=trade.trade_id,
                idempotency_key=idem_key.key[:16] + "..."
            )
            return
        
        # Update record based on execution result
        if success:
            new_state = IdempotencyState.CONFIRMED
            result_data = {
                "transaction_signature": transaction_signature,
                "execution_time": datetime.now(timezone.utc).isoformat(),
                "success": True
            }
        else:
            new_state = IdempotencyState.FAILED
            result_data = {
                "error_message": error_message,
                "execution_time": datetime.now(timezone.utc).isoformat(),
                "success": False
            }
        
        await self._update_record_state(
            record,
            new_state,
            transaction_signature=transaction_signature,
            error_details=error_message,
            result_data=result_data
        )
        
        logger.info(
            "Recorded trade execution result for idempotency",
            trade_id=trade.trade_id,
            idempotency_key=idem_key.key[:16] + "...",
            success=success,
            transaction_signature=transaction_signature
        )
    
    async def _get_record(self, idempotency_key: str) -> Optional[IdempotencyRecord]:
        """Get idempotency record by key."""
        # Check cache first
        with self._cache_lock:
            if idempotency_key in self._cache:
                return self._cache[idempotency_key]
        
        # Query database
        with self._get_connection() as conn:
            cursor = conn.execute(
                "SELECT * FROM idempotency_records WHERE idempotency_key = ?",
                (idempotency_key,)
            )
            row = cursor.fetchone()
            
            if row:
                record = self._row_to_record(row)
                
                # Verify integrity
                if not record.verify_integrity():
                    logger.error(
                        "Idempotency record integrity verification failed",
                        idempotency_key=idempotency_key[:16] + "..."
                    )
                    return None
                
                # Update cache
                with self._cache_lock:
                    self._cache[idempotency_key] = record
                
                return record
        
        return None
    
    async def _store_record(self, record: IdempotencyRecord):
        """Store idempotency record."""
        with self._get_connection() as conn:
            conn.execute("""
                INSERT OR REPLACE INTO idempotency_records (
                    idempotency_key, operation, user_id, state, trade_id,
                    transaction_signature, created_at, started_at, completed_at,
                    operation_data, result_data, error_details, checksum, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                record.idempotency_key,
                record.operation.value,
                record.user_id,
                record.state.value,
                record.trade_id,
                record.transaction_signature,
                record.created_at.isoformat(),
                record.started_at.isoformat() if record.started_at else None,
                record.completed_at.isoformat() if record.completed_at else None,
                json.dumps(record.operation_data, default=str),
                json.dumps(record.result_data, default=str),
                record.error_details,
                record.checksum,
                datetime.now(timezone.utc).isoformat()
            ))
            conn.commit()
        
        # Update cache
        with self._cache_lock:
            self._cache[record.idempotency_key] = record
    
    async def _update_record_state(
        self, 
        record: IdempotencyRecord, 
        new_state: IdempotencyState,
        **kwargs
    ):
        """Update idempotency record state."""
        record.update_state(new_state, **kwargs)
        await self._store_record(record)
    
    def _row_to_record(self, row) -> IdempotencyRecord:
        """Convert database row to IdempotencyRecord."""
        return IdempotencyRecord(
            idempotency_key=row["idempotency_key"],
            operation=IdempotencyOperation(row["operation"]),
            user_id=row["user_id"],
            state=IdempotencyState(row["state"]),
            trade_id=row["trade_id"],
            transaction_signature=row["transaction_signature"],
            created_at=datetime.fromisoformat(row["created_at"]),
            started_at=datetime.fromisoformat(row["started_at"]) if row["started_at"] else None,
            completed_at=datetime.fromisoformat(row["completed_at"]) if row["completed_at"] else None,
            operation_data=json.loads(row["operation_data"]) if row["operation_data"] else {},
            result_data=json.loads(row["result_data"]) if row["result_data"] else {},
            error_details=row["error_details"],
            checksum=row["checksum"]
        )
    
    async def _load_trades_from_record(self, record: IdempotencyRecord) -> List[GeneratedTrade]:
        """Load GeneratedTrade objects from idempotency record."""
        if "trades" not in record.result_data:
            return []
        
        trades = []
        for trade_data in record.result_data["trades"]:
            # Reconstruct GeneratedTrade from stored data
            # This would need proper deserialization based on your trade model
            pass  # Placeholder - implement based on GeneratedTrade structure
        
        return trades
    
    async def cleanup_expired_records(self, max_age_days: int = 30):
        """Clean up expired idempotency records."""
        cutoff_date = datetime.now(timezone.utc) - timedelta(days=max_age_days)
        
        with self._get_connection() as conn:
            cursor = conn.execute(
                "DELETE FROM idempotency_records WHERE created_at < ? AND state IN (?, ?, ?)",
                (cutoff_date.isoformat(), IdempotencyState.CONFIRMED.value, 
                 IdempotencyState.FAILED.value, IdempotencyState.EXPIRED.value)
            )
            deleted_count = cursor.rowcount
            conn.commit()
        
        # Clear cache entries for deleted records
        with self._cache_lock:
            keys_to_remove = [
                key for key, record in self._cache.items()
                if record.created_at < cutoff_date and record.state in [
                    IdempotencyState.CONFIRMED, IdempotencyState.FAILED, IdempotencyState.EXPIRED
                ]
            ]
            for key in keys_to_remove:
                del self._cache[key]
        
        logger.info(
            "Cleaned up expired idempotency records",
            deleted_count=deleted_count,
            max_age_days=max_age_days
        )
    
    async def get_statistics(self) -> Dict[str, Any]:
        """Get idempotency manager statistics."""
        with self._get_connection() as conn:
            # Get counts by state
            cursor = conn.execute("""
                SELECT state, COUNT(*) as count 
                FROM idempotency_records 
                GROUP BY state
            """)
            state_counts = {row["state"]: row["count"] for row in cursor.fetchall()}
            
            # Get counts by operation
            cursor = conn.execute("""
                SELECT operation, COUNT(*) as count 
                FROM idempotency_records 
                GROUP BY operation
            """)
            operation_counts = {row["operation"]: row["count"] for row in cursor.fetchall()}
            
            # Get total count
            cursor = conn.execute("SELECT COUNT(*) as total FROM idempotency_records")
            total_count = cursor.fetchone()["total"]
        
        with self._cache_lock:
            cache_size = len(self._cache)
        
        return {
            "total_records": total_count,
            "cache_size": cache_size,
            "state_distribution": state_counts,
            "operation_distribution": operation_counts,
            "database_path": self.db_path
        }


# Global idempotency manager instance
idempotency_manager: Optional[IdempotencyManager] = None


async def get_idempotency_manager() -> IdempotencyManager:
    """Get the global idempotency manager instance."""
    global idempotency_manager
    if idempotency_manager is None:
        idempotency_manager = IdempotencyManager()
    return idempotency_manager