"""
XORJ Quantitative Engine - Immutable Audit Logging (SR-3)
Structured, tamper-proof audit logging for all scoring operations
"""

import json
import time
import hashlib
import uuid
from datetime import datetime, timezone
from typing import Dict, Any, Optional, List
from dataclasses import dataclass, asdict
from enum import Enum
import logging
import asyncio
import os
from pathlib import Path

logger = logging.getLogger(__name__)


class AuditEventType(Enum):
    """Types of audit events"""
    SCORING_REQUEST = "scoring_request"
    SCORING_CALCULATION = "scoring_calculation"
    SCORING_RESPONSE = "scoring_response"
    ELIGIBILITY_CHECK = "eligibility_check"
    BATCH_SCORING = "batch_scoring"
    AUTHENTICATION = "authentication"
    API_ACCESS = "api_access"
    SYSTEM_EVENT = "system_event"
    ERROR_EVENT = "error_event"


class AuditLevel(Enum):
    """Audit logging levels"""
    INFO = "INFO"
    WARN = "WARN"
    ERROR = "ERROR"
    CRITICAL = "CRITICAL"


@dataclass
class AuditEvent:
    """
    SR-3: Immutable audit event structure
    Contains all information needed for forensics and debugging
    """
    # Required fields
    event_id: str
    event_type: AuditEventType
    level: AuditLevel
    timestamp: str  # ISO format
    component: str
    
    # Core event data
    message: str
    details: Dict[str, Any]
    
    # Security context
    user_id: Optional[str] = None
    session_id: Optional[str] = None
    client_ip: Optional[str] = None
    user_agent: Optional[str] = None
    
    # System context
    process_id: int = os.getpid()
    thread_id: Optional[str] = None
    correlation_id: Optional[str] = None
    
    # Integrity fields
    version: str = "1.0"
    checksum: Optional[str] = None
    previous_checksum: Optional[str] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization"""
        data = asdict(self)
        data['event_type'] = self.event_type.value
        data['level'] = self.level.value
        return data
    
    def calculate_checksum(self, previous_checksum: str = "") -> str:
        """Calculate SHA-256 checksum for integrity verification"""
        # Create deterministic string from core fields
        checksum_data = {
            'event_id': self.event_id,
            'timestamp': self.timestamp,
            'event_type': self.event_type.value,
            'component': self.component,
            'message': self.message,
            'details': json.dumps(self.details, sort_keys=True),
            'previous_checksum': previous_checksum
        }
        
        data_string = json.dumps(checksum_data, sort_keys=True)
        return hashlib.sha256(data_string.encode()).hexdigest()


class AuditLogger:
    """
    SR-3: Immutable audit logger for XORJ Quantitative Engine
    Provides tamper-evident logging for all scoring operations
    """
    
    def __init__(self, 
                 audit_dir: str = "/app/audit",
                 max_file_size: int = 100 * 1024 * 1024,  # 100MB
                 retention_days: int = 365):
        self.audit_dir = Path(audit_dir)
        self.max_file_size = max_file_size
        self.retention_days = retention_days
        
        # Create audit directory if it doesn't exist
        self.audit_dir.mkdir(parents=True, exist_ok=True)
        
        # Maintain chain of checksums for integrity
        self._last_checksum = ""
        self._current_file: Optional[Path] = None
        self._file_handle = None
        
        # Initialize first audit file
        self._rotate_file()
        
        logger.info(f"Audit logger initialized: {self.audit_dir}")
    
    def _get_audit_filename(self) -> str:
        """Generate audit filename with timestamp"""
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        return f"audit_{timestamp}_{uuid.uuid4().hex[:8]}.jsonl"
    
    def _rotate_file(self):
        """Rotate audit file when size limit reached"""
        if self._file_handle:
            self._file_handle.close()
        
        self._current_file = self.audit_dir / self._get_audit_filename()
        self._file_handle = open(self._current_file, 'a', encoding='utf-8')
        
        logger.info(f"Rotated to new audit file: {self._current_file}")
    
    def _should_rotate(self) -> bool:
        """Check if file rotation is needed"""
        if not self._current_file or not self._current_file.exists():
            return True
        
        return self._current_file.stat().st_size >= self.max_file_size
    
    async def log_event(self, event: AuditEvent) -> bool:
        """
        Log audit event with integrity verification
        Returns True if successfully logged
        """
        try:
            # Calculate checksum with previous event for chain integrity
            event.checksum = event.calculate_checksum(self._last_checksum)
            event.previous_checksum = self._last_checksum
            
            # Check if file rotation needed
            if self._should_rotate():
                self._rotate_file()
            
            # Write event as JSON line
            event_json = json.dumps(event.to_dict(), ensure_ascii=False, separators=(',', ':'))
            self._file_handle.write(event_json + '\n')
            self._file_handle.flush()
            os.fsync(self._file_handle.fileno())  # Force write to disk
            
            # Update checksum chain
            self._last_checksum = event.checksum
            
            return True
            
        except Exception as e:
            logger.error(f"Failed to write audit event: {e}")
            return False
    
    async def log_scoring_request(self, 
                                  wallet_addresses: List[str],
                                  request_params: Dict[str, Any],
                                  correlation_id: str,
                                  client_ip: str = None,
                                  user_agent: str = None) -> str:
        """Log Trust Score calculation request"""
        event_id = str(uuid.uuid4())
        
        event = AuditEvent(
            event_id=event_id,
            event_type=AuditEventType.SCORING_REQUEST,
            level=AuditLevel.INFO,
            timestamp=datetime.now(timezone.utc).isoformat(),
            component="scoring_service",
            message=f"Trust Score calculation requested for {len(wallet_addresses)} wallets",
            details={
                "wallet_count": len(wallet_addresses),
                "wallet_addresses": wallet_addresses[:10],  # First 10 for audit
                "wallet_addresses_hash": hashlib.sha256(
                    json.dumps(sorted(wallet_addresses)).encode()
                ).hexdigest(),
                "request_params": request_params,
                "full_wallet_count": len(wallet_addresses)
            },
            correlation_id=correlation_id,
            client_ip=client_ip,
            user_agent=user_agent
        )
        
        await self.log_event(event)
        return event_id
    
    async def log_scoring_calculation(self,
                                      wallet_address: str,
                                      eligibility_status: str,
                                      trust_score: Optional[float],
                                      score_breakdown: Dict[str, Any],
                                      correlation_id: str) -> str:
        """Log individual wallet scoring calculation"""
        event_id = str(uuid.uuid4())
        
        event = AuditEvent(
            event_id=event_id,
            event_type=AuditEventType.SCORING_CALCULATION,
            level=AuditLevel.INFO,
            timestamp=datetime.now(timezone.utc).isoformat(),
            component="trust_score_engine",
            message=f"Trust Score calculated for wallet {wallet_address[:8]}...{wallet_address[-8:]}",
            details={
                "wallet_address": wallet_address,
                "eligibility_status": eligibility_status,
                "trust_score": trust_score,
                "score_breakdown": score_breakdown,
                "calculation_timestamp": datetime.now(timezone.utc).isoformat()
            },
            correlation_id=correlation_id
        )
        
        await self.log_event(event)
        return event_id
    
    async def log_eligibility_check(self,
                                    wallet_address: str,
                                    eligibility_result: str,
                                    eligibility_reason: str,
                                    criteria_checked: Dict[str, Any],
                                    correlation_id: str) -> str:
        """Log wallet eligibility check"""
        event_id = str(uuid.uuid4())
        
        event = AuditEvent(
            event_id=event_id,
            event_type=AuditEventType.ELIGIBILITY_CHECK,
            level=AuditLevel.INFO,
            timestamp=datetime.now(timezone.utc).isoformat(),
            component="eligibility_filter",
            message=f"Eligibility check: {wallet_address[:8]}...{wallet_address[-8:]} - {eligibility_result}",
            details={
                "wallet_address": wallet_address,
                "eligibility_result": eligibility_result,
                "eligibility_reason": eligibility_reason,
                "criteria_checked": criteria_checked,
                "check_timestamp": datetime.now(timezone.utc).isoformat()
            },
            correlation_id=correlation_id
        )
        
        await self.log_event(event)
        return event_id
    
    async def log_api_access(self,
                             endpoint: str,
                             method: str,
                             status_code: int,
                             response_size: int,
                             processing_time: float,
                             client_ip: str = None,
                             user_agent: str = None,
                             correlation_id: str = None) -> str:
        """Log API access for FR-4 endpoints"""
        event_id = str(uuid.uuid4())
        
        level = AuditLevel.WARN if status_code >= 400 else AuditLevel.INFO
        
        event = AuditEvent(
            event_id=event_id,
            event_type=AuditEventType.API_ACCESS,
            level=level,
            timestamp=datetime.now(timezone.utc).isoformat(),
            component="api_gateway",
            message=f"{method} {endpoint} - {status_code}",
            details={
                "endpoint": endpoint,
                "method": method,
                "status_code": status_code,
                "response_size_bytes": response_size,
                "processing_time_ms": round(processing_time * 1000, 2),
                "access_timestamp": datetime.now(timezone.utc).isoformat()
            },
            client_ip=client_ip,
            user_agent=user_agent,
            correlation_id=correlation_id
        )
        
        await self.log_event(event)
        return event_id
    
    async def log_authentication_event(self,
                                       event_type: str,
                                       result: str,
                                       details: Dict[str, Any],
                                       client_ip: str = None,
                                       user_agent: str = None) -> str:
        """Log authentication events"""
        event_id = str(uuid.uuid4())
        
        level = AuditLevel.WARN if result != "success" else AuditLevel.INFO
        
        event = AuditEvent(
            event_id=event_id,
            event_type=AuditEventType.AUTHENTICATION,
            level=level,
            timestamp=datetime.now(timezone.utc).isoformat(),
            component="authentication",
            message=f"Authentication {event_type}: {result}",
            details={
                "auth_event_type": event_type,
                "result": result,
                "details": details,
                "auth_timestamp": datetime.now(timezone.utc).isoformat()
            },
            client_ip=client_ip,
            user_agent=user_agent
        )
        
        await self.log_event(event)
        return event_id
    
    async def log_error(self,
                        component: str,
                        error_message: str,
                        error_details: Dict[str, Any],
                        correlation_id: str = None) -> str:
        """Log error events"""
        event_id = str(uuid.uuid4())
        
        event = AuditEvent(
            event_id=event_id,
            event_type=AuditEventType.ERROR_EVENT,
            level=AuditLevel.ERROR,
            timestamp=datetime.now(timezone.utc).isoformat(),
            component=component,
            message=f"Error in {component}: {error_message}",
            details={
                "error_message": error_message,
                "error_details": error_details,
                "error_timestamp": datetime.now(timezone.utc).isoformat()
            },
            correlation_id=correlation_id
        )
        
        await self.log_event(event)
        return event_id
    
    def verify_integrity(self, audit_file: Path = None) -> bool:
        """Verify integrity of audit log chain"""
        if audit_file is None:
            audit_file = self._current_file
        
        if not audit_file or not audit_file.exists():
            return False
        
        try:
            previous_checksum = ""
            with open(audit_file, 'r', encoding='utf-8') as f:
                for line_num, line in enumerate(f, 1):
                    if not line.strip():
                        continue
                    
                    event_data = json.loads(line)
                    
                    # Reconstruct event for verification
                    event = AuditEvent(
                        event_id=event_data['event_id'],
                        event_type=AuditEventType(event_data['event_type']),
                        level=AuditLevel(event_data['level']),
                        timestamp=event_data['timestamp'],
                        component=event_data['component'],
                        message=event_data['message'],
                        details=event_data['details'],
                        user_id=event_data.get('user_id'),
                        session_id=event_data.get('session_id'),
                        client_ip=event_data.get('client_ip'),
                        user_agent=event_data.get('user_agent'),
                        process_id=event_data.get('process_id', 0),
                        thread_id=event_data.get('thread_id'),
                        correlation_id=event_data.get('correlation_id'),
                        version=event_data.get('version', '1.0')
                    )
                    
                    # Verify checksum
                    expected_checksum = event.calculate_checksum(previous_checksum)
                    actual_checksum = event_data.get('checksum')
                    
                    if expected_checksum != actual_checksum:
                        logger.error(f"Integrity violation at line {line_num}")
                        return False
                    
                    previous_checksum = actual_checksum
            
            logger.info(f"Audit log integrity verified: {audit_file}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to verify audit log integrity: {e}")
            return False
    
    def close(self):
        """Close audit logger and file handles"""
        if self._file_handle:
            self._file_handle.close()
            self._file_handle = None


# Global audit logger instance
_audit_logger: Optional[AuditLogger] = None


def get_audit_logger() -> AuditLogger:
    """Get global audit logger instance"""
    global _audit_logger
    
    if _audit_logger is None:
        _audit_logger = AuditLogger()
    
    return _audit_logger


async def init_audit_logging() -> AuditLogger:
    """Initialize audit logging system"""
    audit_logger = get_audit_logger()
    
    # Log system startup
    await audit_logger.log_event(AuditEvent(
        event_id=str(uuid.uuid4()),
        event_type=AuditEventType.SYSTEM_EVENT,
        level=AuditLevel.INFO,
        timestamp=datetime.now(timezone.utc).isoformat(),
        component="audit_system",
        message="Audit logging system initialized",
        details={
            "audit_directory": str(audit_logger.audit_dir),
            "max_file_size": audit_logger.max_file_size,
            "retention_days": audit_logger.retention_days,
            "initialization_timestamp": datetime.now(timezone.utc).isoformat()
        }
    ))
    
    logger.info("SR-3: Immutable audit logging system initialized")
    return audit_logger