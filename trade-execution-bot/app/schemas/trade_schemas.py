"""
Trade Schema Definitions
"""

from typing import Dict, Any, Optional, List
from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict
from enum import Enum

class TradeStatus(str, Enum):
    """Trade execution status"""
    PENDING = "pending"
    EXECUTING = "executing"
    CONFIRMED = "confirmed"
    FAILED = "failed"
    CANCELLED = "cancelled"

class TradeType(str, Enum):
    """Type of trade operation"""
    BUY = "buy"
    SELL = "sell"
    SWAP = "swap"
    REBALANCE = "rebalance"

class GeneratedTrade(BaseModel):
    """AI-generated trade recommendation"""
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "trade_id": "trade_123456789",
                "user_id": "user_abc",
                "trade_type": "swap",
                "from_token": "USDC",
                "to_token": "SOL",
                "from_amount": 1000.0,
                "to_amount_expected": 10.2,
                "slippage_tolerance": 0.5,
                "rationale": "Favorable SOL price movement detected with strong liquidity",
                "confidence_score": 0.85,
                "risk_score": 25,
                "priority": 3
            }
        }
    )
    
    trade_id: str = Field(..., description="Unique trade identifier")
    user_id: str = Field(..., description="User identifier")
    trade_type: TradeType = Field(..., description="Type of trade")
    from_token: str = Field(..., description="Source token symbol")
    to_token: str = Field(..., description="Target token symbol")
    from_amount: float = Field(..., gt=0, description="Amount to trade from")
    to_amount_expected: float = Field(..., gt=0, description="Expected amount to receive")
    slippage_tolerance: float = Field(..., ge=0, le=10, description="Allowed slippage %")
    rationale: str = Field(..., description="AI reasoning for this trade")
    confidence_score: float = Field(..., ge=0, le=1, description="AI confidence level")
    risk_score: int = Field(..., ge=1, le=100, description="Risk assessment score")
    priority: int = Field(default=1, ge=1, le=10, description="Execution priority")
    expires_at: Optional[datetime] = Field(None, description="Trade expiration time")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Additional trade metadata")

class TradeExecutionRequest(BaseModel):
    """Request to execute a trade"""
    trade: GeneratedTrade = Field(..., description="Trade to execute")
    force_execution: bool = Field(default=False, description="Force execution despite warnings")
    dry_run: bool = Field(default=False, description="Test execution without actual trade")
    
class TradeExecutionResult(BaseModel):
    """Result of trade execution"""
    trade_id: str = Field(..., description="Trade identifier")
    status: TradeStatus = Field(..., description="Execution status")
    transaction_signature: Optional[str] = Field(None, description="Blockchain transaction hash")
    actual_from_amount: Optional[float] = Field(None, description="Actual amount traded from")
    actual_to_amount: Optional[float] = Field(None, description="Actual amount received")
    actual_slippage: Optional[float] = Field(None, description="Realized slippage %")
    execution_time_ms: Optional[int] = Field(None, description="Execution time in milliseconds")
    gas_used: Optional[float] = Field(None, description="Transaction fees paid")
    error_message: Optional[str] = Field(None, description="Error message if failed")
    executed_at: datetime = Field(default_factory=datetime.now, description="Execution timestamp")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Execution metadata")
    
class TradeHistoryItem(BaseModel):
    """Historical trade record"""
    trade_id: str
    user_id: str
    timestamp: datetime
    trade_type: TradeType
    from_token: str
    to_token: str
    from_amount: float
    to_amount: float
    status: TradeStatus
    transaction_signature: Optional[str] = None
    slippage_realized: float
    execution_time_ms: int
    rationale: str
    risk_score: int
    confidence_score: float
    
class PortfolioSnapshot(BaseModel):
    """Portfolio state snapshot"""
    user_id: str = Field(..., description="User identifier")
    timestamp: datetime = Field(default_factory=datetime.now, description="Snapshot timestamp")
    total_value_usd: float = Field(..., description="Total portfolio value in USD")
    positions: Dict[str, float] = Field(..., description="Token positions by symbol")
    allocation_percentages: Dict[str, float] = Field(..., description="Allocation by token %")
    performance_24h: float = Field(default=0.0, description="24h performance %")
    
class RebalanceRequest(BaseModel):
    """Portfolio rebalancing request"""
    user_id: str = Field(..., description="User identifier")
    target_allocation: Dict[str, float] = Field(..., description="Target allocation percentages")
    max_trades: int = Field(default=10, description="Maximum trades for rebalancing")
    min_trade_value: float = Field(default=10.0, description="Minimum trade value in USD")
    
class StrategyRecommendation(BaseModel):
    """AI strategy recommendation"""
    strategy_id: str = Field(..., description="Strategy identifier")
    user_id: str = Field(..., description="User identifier")
    strategy_type: str = Field(..., description="Strategy type")
    recommended_trades: List[GeneratedTrade] = Field(..., description="Recommended trades")
    expected_return: float = Field(..., description="Expected return %")
    risk_assessment: str = Field(..., description="Risk level assessment")
    reasoning: str = Field(..., description="Strategy reasoning")
    valid_until: datetime = Field(..., description="Strategy validity period")