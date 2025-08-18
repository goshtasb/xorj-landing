"""
Trade data models for XORJ Trade Execution Bot.

This module contains data structures for trade generation and execution
(FR-3: Trade Generation Logic, FR-4: Smart Contract Interaction).
"""

from dataclasses import dataclass, field
from typing import List, Dict, Optional, Any
from decimal import Decimal
from datetime import datetime, timezone
from enum import Enum

import structlog

logger = structlog.get_logger(__name__)


class TradeType(Enum):
    """Types of trades that can be executed."""
    SWAP = "swap"  # Token-to-token swap
    BUY = "buy"    # Buy token (sell something else)
    SELL = "sell"  # Sell token (buy something else)


class TradeStatus(Enum):
    """Status of trade execution."""
    PENDING = "pending"          # Trade generated but not executed
    SIMULATED = "simulated"      # Transaction simulated successfully
    SUBMITTED = "submitted"      # Transaction submitted to network
    CONFIRMED = "confirmed"      # Transaction confirmed on-chain
    FAILED = "failed"           # Trade execution failed
    REJECTED = "rejected"       # Trade rejected by risk management


@dataclass
class SwapInstruction:
    """
    Instruction for a token swap on Raydium/Jupiter.
    
    Implements FR-3: Trade Generation Logic
    """
    from_token_symbol: str  # Token to sell (e.g., "USDC")
    to_token_symbol: str    # Token to buy (e.g., "JUP")
    from_mint: str          # From token mint address
    to_mint: str            # To token mint address
    
    # Swap amounts
    from_amount: Decimal    # Amount to swap from (in token units)
    expected_to_amount: Optional[Decimal] = None  # Expected amount to receive
    minimum_to_amount: Optional[Decimal] = None   # Minimum acceptable amount (slippage protection)
    
    # Slippage and fees
    max_slippage_percent: Decimal = Decimal("1.0")  # 1% default slippage
    estimated_fee: Optional[Decimal] = None
    
    def __post_init__(self):
        """Validate swap instruction after creation."""
        if self.from_amount <= 0:
            raise ValueError("Swap amount must be positive")
        
        if self.max_slippage_percent < 0 or self.max_slippage_percent > 50:
            raise ValueError("Max slippage must be between 0% and 50%")
        
        if self.from_token_symbol == self.to_token_symbol:
            raise ValueError("Cannot swap token to itself")
    
    @property
    def swap_description(self) -> str:
        """Get human-readable swap description."""
        return f"Swap {self.from_amount} {self.from_token_symbol} for {self.to_token_symbol}"
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for logging."""
        return {
            "from_token": self.from_token_symbol,
            "to_token": self.to_token_symbol,
            "from_mint": self.from_mint,
            "to_mint": self.to_mint,
            "from_amount": str(self.from_amount),
            "expected_to_amount": str(self.expected_to_amount) if self.expected_to_amount else None,
            "minimum_to_amount": str(self.minimum_to_amount) if self.minimum_to_amount else None,
            "max_slippage_percent": str(self.max_slippage_percent),
            "estimated_fee": str(self.estimated_fee) if self.estimated_fee else None,
            "description": self.swap_description
        }


@dataclass
class GeneratedTrade:
    """
    A trade generated to rebalance a portfolio.
    
    Implements FR-3: Trade Generation Logic
    "calculate the necessary swaps to rebalance the user's vault"
    """
    trade_id: str  # Unique identifier for this trade
    user_id: str
    vault_address: str
    trade_type: TradeType
    
    # Trade instruction (swap details)
    swap_instruction: SwapInstruction
    
    # Trade rationale and context
    rationale: str  # Why this trade was generated
    priority: int = 1  # Execution priority (1 = highest)
    
    # Execution details
    status: TradeStatus = TradeStatus.PENDING
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    executed_at: Optional[datetime] = None
    
    # Transaction details (populated after execution)
    transaction_signature: Optional[str] = None
    block_height: Optional[int] = None
    execution_error: Optional[str] = None
    
    # Risk assessment
    risk_score: Optional[Decimal] = None
    risk_factors: Dict[str, Any] = field(default_factory=dict)
    
    @property
    def is_executable(self) -> bool:
        """Check if trade is ready for execution."""
        return self.status == TradeStatus.PENDING and self.risk_score is not None
    
    @property
    def age_minutes(self) -> float:
        """Get age of trade in minutes."""
        now = datetime.now(timezone.utc)
        return (now - self.created_at).total_seconds() / 60.0
    
    def mark_executed(self, signature: str, block_height: Optional[int] = None):
        """Mark trade as executed with transaction details."""
        self.status = TradeStatus.CONFIRMED
        self.executed_at = datetime.now(timezone.utc)
        self.transaction_signature = signature
        self.block_height = block_height
    
    def mark_failed(self, error_message: str):
        """Mark trade as failed with error details."""
        self.status = TradeStatus.FAILED
        self.execution_error = error_message
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for logging and serialization."""
        return {
            "trade_id": self.trade_id,
            "user_id": self.user_id,
            "vault_address": self.vault_address,
            "trade_type": self.trade_type.value,
            "swap_instruction": self.swap_instruction.to_dict(),
            "rationale": self.rationale,
            "priority": self.priority,
            "status": self.status.value,
            "created_at": self.created_at.isoformat(),
            "executed_at": self.executed_at.isoformat() if self.executed_at else None,
            "transaction_signature": self.transaction_signature,
            "block_height": self.block_height,
            "execution_error": self.execution_error,
            "risk_score": str(self.risk_score) if self.risk_score else None,
            "risk_factors": self.risk_factors,
            "age_minutes": self.age_minutes,
            "is_executable": self.is_executable
        }


@dataclass
class TradeGenerationResult:
    """Result of trade generation process."""
    success: bool
    user_id: str
    vault_address: str
    
    # Generated trades
    trades: List[GeneratedTrade] = field(default_factory=list)
    
    # Analysis details
    rebalance_required: bool = False
    total_rebalance_amount_usd: Decimal = Decimal("0")
    generation_timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    
    # Error information
    error_message: Optional[str] = None
    warnings: List[str] = field(default_factory=list)
    
    @property
    def executable_trades_count(self) -> int:
        """Count of trades ready for execution."""
        return sum(1 for trade in self.trades if trade.is_executable)
    
    @property
    def has_trades(self) -> bool:
        """Check if any trades were generated."""
        return len(self.trades) > 0
    
    def add_warning(self, warning: str):
        """Add a warning to the result."""
        self.warnings.append(warning)
        logger.warning("Trade generation warning", warning=warning, user_id=self.user_id)
    
    def get_trades_by_priority(self) -> List[GeneratedTrade]:
        """Get trades sorted by priority (highest first)."""
        return sorted(self.trades, key=lambda t: (t.priority, t.created_at))
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for logging."""
        return {
            "success": self.success,
            "user_id": self.user_id,
            "vault_address": self.vault_address,
            "trades": [t.to_dict() for t in self.trades],
            "trades_count": len(self.trades),
            "executable_trades_count": self.executable_trades_count,
            "rebalance_required": self.rebalance_required,
            "total_rebalance_amount_usd": str(self.total_rebalance_amount_usd),
            "generation_timestamp": self.generation_timestamp.isoformat(),
            "error_message": self.error_message,
            "warnings": self.warnings,
            "has_trades": self.has_trades
        }