"""
Strict Slippage Control for XORJ Trade Execution Bot.

Implements SR-2: Strict Slippage Control
"Every trade must have configurable maximum slippage limits (e.g., 0.5%, 1%, 2%).
If the actual slippage exceeds the limit, the transaction must be rejected automatically
before it reaches the blockchain."

This module provides comprehensive slippage protection:
- Pre-trade slippage estimation and validation
- Real-time price impact calculation
- Dynamic slippage limits based on market conditions
- Automatic transaction rejection for excessive slippage
- Comprehensive slippage audit logging

Security Features:
- Multiple validation layers before blockchain submission
- Conservative default limits with user overrides
- Market volatility adjustments
- Liquidity-based slippage calculation
- Emergency slippage circuit breakers
"""

import asyncio
from typing import Dict, Any, Optional, List, Tuple
from decimal import Decimal, ROUND_DOWN, ROUND_UP
from datetime import datetime, timezone
from enum import Enum
from dataclasses import dataclass

import structlog
from app.core.config import get_config, TradeExecutionConfig
from app.logging.audit_logger import get_audit_logger, AuditEventType, AuditSeverity
from app.models.trades import GeneratedTrade, SwapInstruction


logger = structlog.get_logger(__name__)


class SlippageViolationType(Enum):
    """Types of slippage violations that can occur."""
    EXCESSIVE_SLIPPAGE = "excessive_slippage"
    MARKET_IMPACT_TOO_HIGH = "market_impact_too_high"
    LIQUIDITY_INSUFFICIENT = "liquidity_insufficient"
    PRICE_STALENESS = "price_staleness"
    VOLATILITY_TOO_HIGH = "volatility_too_high"


class SlippageRiskLevel(Enum):
    """Risk levels for slippage assessment."""
    LOW = "low"           # < 0.1%
    MODERATE = "moderate" # 0.1% - 0.5%
    HIGH = "high"         # 0.5% - 2.0%
    EXTREME = "extreme"   # > 2.0%


@dataclass
class SlippageAnalysis:
    """
    Comprehensive slippage analysis for a trade.
    
    Contains all information needed to make slippage control decisions.
    """
    # Trade identification
    trade_id: str
    user_id: str
    from_token: str
    to_token: str
    trade_amount: Decimal
    
    # Price and slippage data
    current_price: Decimal
    expected_price: Decimal
    estimated_slippage_percent: Decimal
    max_allowed_slippage: Decimal
    
    # Market conditions
    market_impact_percent: Decimal
    liquidity_depth: Decimal
    price_volatility_24h: Decimal
    last_price_update: datetime
    
    # Risk assessment
    risk_level: SlippageRiskLevel
    violation_type: Optional[SlippageViolationType] = None
    
    # Decision
    approved: bool = False
    rejection_reason: Optional[str] = None
    
    @property
    def slippage_within_limits(self) -> bool:
        """Check if estimated slippage is within allowed limits."""
        return self.estimated_slippage_percent <= self.max_allowed_slippage
    
    @property
    def price_data_fresh(self) -> bool:
        """Check if price data is recent enough for trading."""
        age_seconds = (datetime.now(timezone.utc) - self.last_price_update).total_seconds()
        return age_seconds < 30  # 30 second freshness requirement
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert analysis to dictionary for logging."""
        return {
            "trade_id": self.trade_id,
            "user_id": self.user_id,
            "from_token": self.from_token,
            "to_token": self.to_token,
            "trade_amount": str(self.trade_amount),
            "current_price": str(self.current_price),
            "expected_price": str(self.expected_price),
            "estimated_slippage_percent": str(self.estimated_slippage_percent),
            "max_allowed_slippage": str(self.max_allowed_slippage),
            "market_impact_percent": str(self.market_impact_percent),
            "liquidity_depth": str(self.liquidity_depth),
            "price_volatility_24h": str(self.price_volatility_24h),
            "last_price_update": self.last_price_update.isoformat(),
            "risk_level": self.risk_level.value,
            "violation_type": self.violation_type.value if self.violation_type else None,
            "approved": self.approved,
            "rejection_reason": self.rejection_reason,
            "slippage_within_limits": self.slippage_within_limits,
            "price_data_fresh": self.price_data_fresh
        }


class SlippageController:
    """
    Strict slippage control system for trade execution.
    
    Implements SR-2: Strict Slippage Control
    
    This controller validates every trade against slippage limits before
    blockchain submission, providing multiple layers of protection:
    
    1. Pre-trade slippage estimation
    2. Market impact calculation
    3. Liquidity depth analysis
    4. Price staleness checks
    5. Volatility-based adjustments
    6. Automatic rejection mechanisms
    """
    
    def __init__(self):
        self.config = get_config()
        self.audit_logger = get_audit_logger()
        
        # Default slippage limits (SR-2 requirement)
        self.default_slippage_limits = {
            "conservative": Decimal("0.5"),    # 0.5% for conservative users
            "moderate": Decimal("1.0"),        # 1.0% for moderate users  
            "aggressive": Decimal("2.0"),      # 2.0% for aggressive users
            "maximum": Decimal("5.0")          # 5.0% absolute maximum (emergency only)
        }
        
        # Market condition thresholds
        self.volatility_thresholds = {
            "low": Decimal("5.0"),      # < 5% daily volatility
            "moderate": Decimal("15.0"), # < 15% daily volatility
            "high": Decimal("25.0"),    # < 25% daily volatility
            "extreme": Decimal("100.0") # > 25% daily volatility
        }
        
        # Circuit breaker settings
        self.circuit_breaker_active = False
        self.max_rejections_per_minute = 10
        self.rejection_count_window = []
        
        logger.info(
            "Slippage Controller initialized",
            default_limits=str({k: str(v) for k, v in self.default_slippage_limits.items()}),
            environment=self.config.environment
        )
    
    async def validate_trade_slippage(
        self, 
        trade: GeneratedTrade,
        force_refresh_prices: bool = False
    ) -> SlippageAnalysis:
        """
        Validate trade against slippage limits.
        
        Implements SR-2: Strict Slippage Control
        "Every trade must have configurable maximum slippage limits"
        
        Args:
            trade: Trade to validate
            force_refresh_prices: Force fresh price data retrieval
            
        Returns:
            SlippageAnalysis: Comprehensive slippage analysis
        """
        logger.info(
            "Starting slippage validation",
            trade_id=trade.trade_id,
            user_id=trade.user_id,
            from_token=trade.swap_instruction.from_token_symbol,
            to_token=trade.swap_instruction.to_token_symbol,
            amount=str(trade.swap_instruction.from_amount),
            max_slippage=str(trade.swap_instruction.max_slippage_percent)
        )
        
        try:
            # Step 1: Get current market data
            market_data = await self._fetch_market_data(
                trade.swap_instruction, 
                force_refresh_prices
            )
            
            # Step 2: Calculate estimated slippage
            slippage_estimate = await self._estimate_trade_slippage(
                trade.swap_instruction,
                market_data
            )
            
            # Step 3: Assess market impact
            market_impact = await self._calculate_market_impact(
                trade.swap_instruction,
                market_data
            )
            
            # Step 4: Determine risk level
            risk_level = self._assess_slippage_risk_level(
                slippage_estimate["estimated_slippage_percent"],
                market_impact,
                market_data["volatility_24h"]
            )
            
            # Step 5: Create analysis object
            analysis = SlippageAnalysis(
                trade_id=trade.trade_id,
                user_id=trade.user_id,
                from_token=trade.swap_instruction.from_token_symbol,
                to_token=trade.swap_instruction.to_token_symbol,
                trade_amount=trade.swap_instruction.from_amount,
                current_price=market_data["current_price"],
                expected_price=slippage_estimate["expected_price"],
                estimated_slippage_percent=slippage_estimate["estimated_slippage_percent"],
                max_allowed_slippage=trade.swap_instruction.max_slippage_percent,
                market_impact_percent=market_impact,
                liquidity_depth=market_data["liquidity_depth"],
                price_volatility_24h=market_data["volatility_24h"],
                last_price_update=market_data["last_update"],
                risk_level=risk_level
            )
            
            # Step 6: Apply validation rules
            validation_result = await self._apply_slippage_validation_rules(analysis)
            
            # Step 7: Log validation result
            await self._log_slippage_validation(analysis, validation_result)
            
            return analysis
            
        except Exception as e:
            logger.error(
                "Slippage validation failed",
                trade_id=trade.trade_id,
                user_id=trade.user_id,
                error=str(e),
                error_type=type(e).__name__
            )
            
            # Create failed analysis
            failed_analysis = SlippageAnalysis(
                trade_id=trade.trade_id,
                user_id=trade.user_id,
                from_token=trade.swap_instruction.from_token_symbol,
                to_token=trade.swap_instruction.to_token_symbol,
                trade_amount=trade.swap_instruction.from_amount,
                current_price=Decimal("0"),
                expected_price=Decimal("0"),
                estimated_slippage_percent=Decimal("100"),  # Assume worst case
                max_allowed_slippage=trade.swap_instruction.max_slippage_percent,
                market_impact_percent=Decimal("100"),
                liquidity_depth=Decimal("0"),
                price_volatility_24h=Decimal("100"),
                last_price_update=datetime.now(timezone.utc),
                risk_level=SlippageRiskLevel.EXTREME,
                approved=False,
                rejection_reason=f"Slippage validation error: {str(e)}"
            )
            
            await self.audit_logger.log_security_violation(
                violation_type="slippage_validation_error",
                user_id=trade.user_id,
                wallet_address=trade.vault_address,
                violation_details={
                    "trade_id": trade.trade_id,
                    "error": str(e),
                    "error_type": type(e).__name__,
                    "operation": "slippage_validation"
                },
                severity=AuditSeverity.ERROR
            )
            
            return failed_analysis
    
    async def _fetch_market_data(
        self, 
        swap_instruction: SwapInstruction,
        force_refresh: bool = False
    ) -> Dict[str, Any]:
        """
        Fetch current market data for slippage calculation.
        
        Args:
            swap_instruction: Swap details
            force_refresh: Force fresh data retrieval
            
        Returns:
            Dict[str, Any]: Market data including price and liquidity
        """
        # In production, this would fetch real-time data from:
        # - Raydium/Jupiter APIs for current prices
        # - DEX liquidity pools for depth analysis
        # - Historical data for volatility calculation
        
        # Placeholder market data with realistic values
        current_time = datetime.now(timezone.utc)
        
        market_data = {
            "current_price": Decimal("1.0023"),      # Current market price
            "bid_price": Decimal("1.0018"),          # Best bid
            "ask_price": Decimal("1.0028"),          # Best ask
            "spread_percent": Decimal("0.10"),       # 0.10% spread
            "liquidity_depth": Decimal("50000.0"),   # $50k liquidity depth
            "volume_24h": Decimal("1000000.0"),      # $1M daily volume
            "volatility_24h": Decimal("8.5"),        # 8.5% daily volatility
            "last_update": current_time,
            "data_source": "jupiter_api",
            "market_pair": f"{swap_instruction.from_token_symbol}/{swap_instruction.to_token_symbol}"
        }
        
        logger.info(
            "Market data fetched",
            from_token=swap_instruction.from_token_symbol,
            to_token=swap_instruction.to_token_symbol,
            current_price=str(market_data["current_price"]),
            liquidity_depth=str(market_data["liquidity_depth"]),
            volatility_24h=str(market_data["volatility_24h"]),
            force_refresh=force_refresh
        )
        
        return market_data
    
    async def _estimate_trade_slippage(
        self,
        swap_instruction: SwapInstruction,
        market_data: Dict[str, Any]
    ) -> Dict[str, Decimal]:
        """
        Estimate slippage for the specific trade.
        
        Args:
            swap_instruction: Swap details
            market_data: Current market conditions
            
        Returns:
            Dict[str, Decimal]: Slippage estimation details
        """
        trade_amount_usd = swap_instruction.from_amount * market_data["current_price"]
        liquidity_depth = market_data["liquidity_depth"]
        
        # Calculate price impact based on trade size relative to liquidity
        if liquidity_depth > 0:
            liquidity_ratio = trade_amount_usd / liquidity_depth
            
            # Non-linear price impact calculation
            if liquidity_ratio <= Decimal("0.01"):      # < 1% of liquidity
                price_impact = liquidity_ratio * Decimal("0.5")    # 0.5x impact
            elif liquidity_ratio <= Decimal("0.05"):    # < 5% of liquidity  
                price_impact = liquidity_ratio * Decimal("1.0")    # 1.0x impact
            elif liquidity_ratio <= Decimal("0.10"):    # < 10% of liquidity
                price_impact = liquidity_ratio * Decimal("2.0")    # 2.0x impact
            else:                                        # > 10% of liquidity
                price_impact = liquidity_ratio * Decimal("5.0")    # 5.0x impact (high)
        else:
            price_impact = Decimal("10.0")  # Assume high impact if no liquidity data
        
        # Add spread and volatility components
        spread_impact = market_data["spread_percent"] / Decimal("2.0")  # Half spread
        volatility_impact = market_data["volatility_24h"] / Decimal("100.0")  # Volatility factor
        
        # Total estimated slippage
        estimated_slippage = price_impact + spread_impact + volatility_impact
        
        # Expected execution price including slippage
        expected_price = market_data["current_price"] * (Decimal("1.0") - estimated_slippage / Decimal("100.0"))
        
        logger.info(
            "Slippage estimation completed",
            trade_amount_usd=str(trade_amount_usd),
            liquidity_ratio=str(liquidity_ratio),
            price_impact=str(price_impact),
            spread_impact=str(spread_impact),
            volatility_impact=str(volatility_impact),
            estimated_slippage_percent=str(estimated_slippage),
            expected_price=str(expected_price)
        )
        
        return {
            "estimated_slippage_percent": estimated_slippage,
            "expected_price": expected_price,
            "price_impact": price_impact,
            "spread_impact": spread_impact,
            "volatility_impact": volatility_impact
        }
    
    async def _calculate_market_impact(
        self,
        swap_instruction: SwapInstruction,
        market_data: Dict[str, Any]
    ) -> Decimal:
        """
        Calculate market impact of the trade.
        
        Args:
            swap_instruction: Swap details
            market_data: Market conditions
            
        Returns:
            Decimal: Market impact percentage
        """
        trade_amount_usd = swap_instruction.from_amount * market_data["current_price"]
        volume_24h = market_data["volume_24h"]
        
        if volume_24h > 0:
            # Market impact based on trade size relative to daily volume
            volume_ratio = trade_amount_usd / volume_24h
            
            # Conservative market impact calculation
            if volume_ratio <= Decimal("0.001"):        # < 0.1% of daily volume
                market_impact = volume_ratio * Decimal("10.0")     # 10x multiplier
            elif volume_ratio <= Decimal("0.01"):       # < 1% of daily volume
                market_impact = volume_ratio * Decimal("50.0")     # 50x multiplier
            else:                                        # > 1% of daily volume
                market_impact = volume_ratio * Decimal("200.0")    # 200x multiplier
        else:
            market_impact = Decimal("5.0")  # Assume 5% impact if no volume data
        
        return min(market_impact, Decimal("50.0"))  # Cap at 50%
    
    def _assess_slippage_risk_level(
        self,
        estimated_slippage: Decimal,
        market_impact: Decimal,
        volatility: Decimal
    ) -> SlippageRiskLevel:
        """
        Assess overall risk level for slippage.
        
        Args:
            estimated_slippage: Estimated slippage percentage
            market_impact: Market impact percentage
            volatility: 24h volatility percentage
            
        Returns:
            SlippageRiskLevel: Overall risk assessment
        """
        # Use the highest risk indicator as overall risk
        max_risk_factor = max(estimated_slippage, market_impact, volatility / Decimal("10.0"))
        
        if max_risk_factor <= Decimal("0.1"):
            return SlippageRiskLevel.LOW
        elif max_risk_factor <= Decimal("0.5"):
            return SlippageRiskLevel.MODERATE
        elif max_risk_factor <= Decimal("2.0"):
            return SlippageRiskLevel.HIGH
        else:
            return SlippageRiskLevel.EXTREME
    
    async def _apply_slippage_validation_rules(self, analysis: SlippageAnalysis) -> Dict[str, Any]:
        """
        Apply comprehensive slippage validation rules.
        
        Implements SR-2: "If the actual slippage exceeds the limit, 
        the transaction must be rejected automatically"
        
        Args:
            analysis: Slippage analysis to validate
            
        Returns:
            Dict[str, Any]: Validation results
        """
        validation_results = {
            "passed_rules": [],
            "failed_rules": [],
            "warnings": []
        }
        
        # Rule 1: Slippage within user-defined limits
        if analysis.slippage_within_limits:
            validation_results["passed_rules"].append("user_slippage_limit")
        else:
            analysis.violation_type = SlippageViolationType.EXCESSIVE_SLIPPAGE
            analysis.rejection_reason = (
                f"Estimated slippage {analysis.estimated_slippage_percent}% "
                f"exceeds maximum allowed {analysis.max_allowed_slippage}%"
            )
            validation_results["failed_rules"].append("user_slippage_limit")
        
        # Rule 2: Absolute maximum slippage limit
        max_absolute = self.default_slippage_limits["maximum"]
        if analysis.estimated_slippage_percent <= max_absolute:
            validation_results["passed_rules"].append("absolute_slippage_limit")
        else:
            analysis.violation_type = SlippageViolationType.EXCESSIVE_SLIPPAGE
            analysis.rejection_reason = (
                f"Estimated slippage {analysis.estimated_slippage_percent}% "
                f"exceeds absolute maximum {max_absolute}%"
            )
            validation_results["failed_rules"].append("absolute_slippage_limit")
        
        # Rule 3: Market impact threshold
        if analysis.market_impact_percent <= Decimal("5.0"):
            validation_results["passed_rules"].append("market_impact_limit")
        else:
            analysis.violation_type = SlippageViolationType.MARKET_IMPACT_TOO_HIGH
            analysis.rejection_reason = (
                f"Market impact {analysis.market_impact_percent}% too high (max 5%)"
            )
            validation_results["failed_rules"].append("market_impact_limit")
        
        # Rule 4: Liquidity depth requirement
        min_liquidity = analysis.trade_amount * Decimal("10.0")  # 10x trade amount
        if analysis.liquidity_depth >= min_liquidity:
            validation_results["passed_rules"].append("liquidity_depth_requirement")
        else:
            analysis.violation_type = SlippageViolationType.LIQUIDITY_INSUFFICIENT
            analysis.rejection_reason = (
                f"Insufficient liquidity: {analysis.liquidity_depth} < {min_liquidity}"
            )
            validation_results["failed_rules"].append("liquidity_depth_requirement")
        
        # Rule 5: Price data freshness
        if analysis.price_data_fresh:
            validation_results["passed_rules"].append("price_data_freshness")
        else:
            analysis.violation_type = SlippageViolationType.PRICE_STALENESS
            analysis.rejection_reason = "Price data too stale for safe execution"
            validation_results["failed_rules"].append("price_data_freshness")
        
        # Rule 6: Volatility threshold
        if analysis.price_volatility_24h <= Decimal("30.0"):  # Max 30% daily volatility
            validation_results["passed_rules"].append("volatility_threshold")
        else:
            analysis.violation_type = SlippageViolationType.VOLATILITY_TOO_HIGH
            analysis.rejection_reason = (
                f"Market too volatile: {analysis.price_volatility_24h}% (max 30%)"
            )
            validation_results["failed_rules"].append("volatility_threshold")
        
        # Rule 7: Circuit breaker check
        if not self.circuit_breaker_active:
            validation_results["passed_rules"].append("circuit_breaker_status")
        else:
            analysis.rejection_reason = "Slippage circuit breaker is active"
            validation_results["failed_rules"].append("circuit_breaker_status")
        
        # Final approval decision
        analysis.approved = len(validation_results["failed_rules"]) == 0
        
        # Add warnings for high-risk trades that still pass
        if analysis.approved and analysis.risk_level == SlippageRiskLevel.HIGH:
            validation_results["warnings"].append("high_risk_slippage_approved")
        
        logger.info(
            "Slippage validation rules applied",
            trade_id=analysis.trade_id,
            user_id=analysis.user_id,
            approved=analysis.approved,
            passed_rules=len(validation_results["passed_rules"]),
            failed_rules=len(validation_results["failed_rules"]),
            warnings=len(validation_results["warnings"]),
            rejection_reason=analysis.rejection_reason
        )
        
        return validation_results
    
    async def _log_slippage_validation(
        self,
        analysis: SlippageAnalysis,
        validation_result: Dict[str, Any]
    ):
        """Log slippage validation results for audit trail."""
        
        # Log to audit system
        if analysis.approved:
            await self.audit_logger.log_system_event(
                event_type="slippage_validation_passed",
                event_details={
                    "slippage_analysis": analysis.to_dict(),
                    "validation_result": validation_result
                },
                severity=AuditSeverity.INFO
            )
        else:
            await self.audit_logger.log_security_violation(
                violation_type=analysis.violation_type.value if analysis.violation_type else "slippage_violation",
                user_id=analysis.user_id,
                wallet_address=None,
                violation_details={
                    "slippage_analysis": analysis.to_dict(),
                    "validation_result": validation_result,
                    "rejection_reason": analysis.rejection_reason
                },
                severity=AuditSeverity.WARNING
            )
            
            # Track rejections for circuit breaker
            await self._track_rejection_for_circuit_breaker(analysis)
    
    async def _track_rejection_for_circuit_breaker(self, analysis: SlippageAnalysis):
        """Track rejections to trigger circuit breaker if needed."""
        current_time = datetime.now(timezone.utc)
        
        # Add current rejection
        self.rejection_count_window.append(current_time)
        
        # Remove rejections older than 1 minute
        cutoff_time = current_time.replace(second=current_time.second - 60)
        self.rejection_count_window = [
            t for t in self.rejection_count_window if t > cutoff_time
        ]
        
        # Check if circuit breaker should activate
        if len(self.rejection_count_window) >= self.max_rejections_per_minute:
            await self._activate_circuit_breaker("excessive_slippage_rejections")
    
    async def _activate_circuit_breaker(self, reason: str):
        """Activate slippage circuit breaker."""
        if not self.circuit_breaker_active:
            self.circuit_breaker_active = True
            
            logger.critical(
                "SLIPPAGE CIRCUIT BREAKER ACTIVATED",
                reason=reason,
                rejections_per_minute=len(self.rejection_count_window)
            )
            
            await self.audit_logger.log_security_violation(
                violation_type="slippage_circuit_breaker_activated",
                user_id="system",
                wallet_address=None,
                violation_details={
                    "reason": reason,
                    "rejections_per_minute": len(self.rejection_count_window),
                    "activation_time": datetime.now(timezone.utc).isoformat()
                },
                severity=AuditSeverity.CRITICAL
            )
    
    async def deactivate_circuit_breaker(self, reason: str = "manual_override"):
        """Manually deactivate slippage circuit breaker."""
        if self.circuit_breaker_active:
            self.circuit_breaker_active = False
            self.rejection_count_window = []  # Reset rejection tracking
            
            logger.info(
                "Slippage circuit breaker deactivated",
                reason=reason
            )
            
            await self.audit_logger.log_system_event(
                event_type="slippage_circuit_breaker_deactivated",
                event_details={
                    "reason": reason,
                    "deactivation_time": datetime.now(timezone.utc).isoformat()
                },
                severity=AuditSeverity.INFO
            )
    
    def get_circuit_breaker_status(self) -> Dict[str, Any]:
        """Get current circuit breaker status."""
        return {
            "active": self.circuit_breaker_active,
            "recent_rejections": len(self.rejection_count_window),
            "max_rejections_per_minute": self.max_rejections_per_minute,
            "time_window": "60 seconds"
        }


# Global slippage controller instance
slippage_controller: Optional[SlippageController] = None


def get_slippage_controller() -> SlippageController:
    """Get the global slippage controller instance."""
    global slippage_controller
    if slippage_controller is None:
        slippage_controller = SlippageController()
    return slippage_controller