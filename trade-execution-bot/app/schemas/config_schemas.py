"""
Configuration Schema Definitions
"""

from typing import Dict, Any, Optional
from pydantic import BaseModel, Field, ConfigDict

class SystemConfiguration(BaseModel):
    """System-wide configuration settings"""
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "environment": "production",
                "debug_mode": False,
                "max_concurrent_trades": 5,
                "health_check_interval": 60
            }
        }
    )
    
    environment: str = Field(default="development", description="Runtime environment")
    debug_mode: bool = Field(default=True, description="Enable debug logging")
    max_concurrent_trades: int = Field(default=10, description="Maximum concurrent trades")
    health_check_interval: int = Field(default=30, description="Health check interval in seconds")

class BotConfiguration(BaseModel):
    """User-specific bot configuration"""
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "user_id": "user123",
                "risk_profile": "aggressive",
                "slippage_tolerance": 0.5,
                "enabled": True,
                "max_trade_amount": 50000,
                "trading_pairs": ["SOL/USDC", "JUP/SOL"]
            }
        }
    )
    
    user_id: str = Field(..., description="User identifier")
    risk_profile: str = Field(default="moderate", description="Risk tolerance level (conservative, moderate, aggressive)")
    slippage_tolerance: float = Field(default=1.0, ge=0.1, le=5.0, description="Maximum allowed slippage %")
    enabled: bool = Field(default=True, description="Bot enabled status")
    max_trade_amount: int = Field(default=10000, ge=100, description="Maximum trade amount in USD")
    trading_pairs: list = Field(default_factory=list, description="Allowed trading pairs")

class HSMConfiguration(BaseModel):
    """Hardware Security Module configuration"""
    hsm_type: str = Field(default="aws_cloudhsm", description="HSM provider type")
    key_label: str = Field(..., description="Key identifier in HSM")
    region: Optional[str] = Field(None, description="HSM region")
    credentials: Dict[str, Any] = Field(default_factory=dict, description="HSM authentication credentials")
    
class CircuitBreakerConfiguration(BaseModel):
    """Circuit breaker configuration"""
    failure_threshold: int = Field(default=5, description="Number of failures before opening circuit")
    timeout_duration: int = Field(default=60, description="Circuit timeout in seconds")
    half_open_max_calls: int = Field(default=3, description="Max calls in half-open state")
    
class SlippageConfiguration(BaseModel):
    """Slippage control configuration"""
    max_slippage_percent: float = Field(default=1.0, description="Maximum allowed slippage")
    price_impact_threshold: float = Field(default=2.0, description="Price impact warning threshold")
    min_liquidity_usd: int = Field(default=100000, description="Minimum liquidity requirement")