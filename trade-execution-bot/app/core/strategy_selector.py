"""
Strategy Ingestion and Target Portfolio Selection for XORJ Trade Execution Bot.

Implements FR-1: Scheduled Polling & Strategy Ingestion
- Fetches latest ranked traders from Quantitative Engine
- Applies user risk profile thresholds to select target portfolio
- Selects single top-ranked trader that meets threshold criteria
- Creates actionable target portfolio from trader's strategy

Risk Profile Thresholds (as specified in FR-1):
- Conservative: XORJTrustScore > 95
- Balanced: XORJTrustScore > 90  
- Aggressive: XORJTrustScore > 85 (assumed)

Security Features:
- Comprehensive validation of trader data
- Risk threshold enforcement
- Detailed audit logging of selection decisions
- Error handling for edge cases
"""

from typing import List, Optional, Dict, Any, Tuple
from dataclasses import dataclass
from decimal import Decimal
from datetime import datetime, timezone

import structlog
from app.models.trader_intelligence import RankedTrader, RiskProfile, TrustScoreData
from app.integrations.user_settings import UserRiskProfile
from app.logging.audit_logger import get_audit_logger, AuditEventType, AuditSeverity


logger = structlog.get_logger(__name__)


@dataclass
class TargetPortfolio:
    """
    Target portfolio derived from selected top-ranked trader.
    
    This represents the "Target Portfolio" as specified in FR-1:
    The single, top-ranked trader whose XORJTrustScore meets
    the user's risk profile threshold.
    """
    selected_trader: RankedTrader
    user_risk_profile: RiskProfile
    selection_timestamp: datetime
    trust_score_threshold: Decimal
    selection_rationale: str
    
    # Portfolio allocation details
    target_allocation: Dict[str, Decimal]  # Token allocations
    risk_metrics: Dict[str, Any]  # Risk assessment metrics
    
    @property
    def trader_wallet_address(self) -> str:
        """Get the wallet address of the selected trader."""
        return self.selected_trader.wallet_address
    
    @property
    def trust_score(self) -> Decimal:
        """Get the trust score of the selected trader."""
        return self.selected_trader.trust_score.score
    
    @property
    def trader_rank(self) -> int:
        """Get the rank of the selected trader."""
        return self.selected_trader.rank
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert target portfolio to dictionary for logging."""
        return {
            "trader_wallet_address": self.trader_wallet_address,
            "trader_rank": self.trader_rank,
            "trust_score": float(self.trust_score),
            "trust_score_threshold": float(self.trust_score_threshold),
            "user_risk_profile": self.user_risk_profile.value,
            "selection_timestamp": self.selection_timestamp.isoformat(),
            "selection_rationale": self.selection_rationale,
            "risk_metrics": self.risk_metrics,
            "target_allocation": {k: float(v) for k, v in self.target_allocation.items()}
        }


class TrustScoreThresholds:
    """
    Trust score thresholds for different risk profiles.
    
    As specified in FR-1:
    - Conservative: >95
    - Balanced: >90
    - Aggressive: >85 (inferred from pattern)
    """
    
    CONSERVATIVE = Decimal("95")
    MODERATE = Decimal("90")  # "Balanced" in FR-1, but using "moderate" to match enum
    AGGRESSIVE = Decimal("85")
    
    @classmethod
    def get_threshold(cls, risk_profile: RiskProfile) -> Decimal:
        """Get trust score threshold for given risk profile."""
        thresholds = {
            RiskProfile.CONSERVATIVE: cls.CONSERVATIVE,
            RiskProfile.MODERATE: cls.MODERATE,
            RiskProfile.AGGRESSIVE: cls.AGGRESSIVE
        }
        return thresholds.get(risk_profile, cls.MODERATE)
    
    @classmethod
    def get_all_thresholds(cls) -> Dict[RiskProfile, Decimal]:
        """Get all thresholds as a dictionary."""
        return {
            RiskProfile.CONSERVATIVE: cls.CONSERVATIVE,
            RiskProfile.MODERATE: cls.MODERATE,
            RiskProfile.AGGRESSIVE: cls.AGGRESSIVE
        }


@dataclass
class StrategySelectionResult:
    """Result of strategy selection process."""
    success: bool
    target_portfolio: Optional[TargetPortfolio] = None
    error_message: Optional[str] = None
    selection_details: Optional[Dict[str, Any]] = None
    
    # Statistics about the selection process
    total_traders_evaluated: int = 0
    eligible_traders_found: int = 0
    selection_timestamp: Optional[datetime] = None


class StrategySelector:
    """
    Strategy ingestion and target portfolio selection system.
    
    Implements FR-1 functionality:
    1. Fetch latest ranked traders from Quantitative Engine
    2. Apply user risk profile thresholds
    3. Select single top-ranked trader meeting criteria
    4. Create target portfolio from selected trader
    
    Selection Logic:
    - Evaluate traders in rank order (1, 2, 3, ...)
    - For each trader, check if trust score meets user's threshold
    - Select first trader that meets criteria
    - If no traders meet criteria, report selection failure
    """
    
    def __init__(self):
        self.audit_logger = get_audit_logger()
        self.trust_score_thresholds = TrustScoreThresholds()
        
        logger.info(
            "Strategy Selector initialized",
            thresholds=TrustScoreThresholds.get_all_thresholds()
        )
    
    async def select_target_portfolio(
        self,
        ranked_traders: List[RankedTrader],
        user_profile: UserRiskProfile
    ) -> StrategySelectionResult:
        """
        Select target portfolio based on ranked traders and user risk profile.
        
        This implements the core FR-1 logic:
        "select the single, top-ranked trader whose XORJTrustScore meets 
        the threshold defined by the user's selected riskProfile"
        
        Args:
            ranked_traders: List of ranked traders from Quantitative Engine
            user_profile: User's risk profile and settings
            
        Returns:
            StrategySelectionResult with selected target portfolio or error
        """
        selection_timestamp = datetime.now(timezone.utc)
        
        logger.info(
            "Starting target portfolio selection",
            user_id=user_profile.user_id,
            risk_profile=user_profile.risk_profile.value,
            traders_to_evaluate=len(ranked_traders)
        )
        
        # Get trust score threshold for user's risk profile
        trust_score_threshold = self.trust_score_thresholds.get_threshold(user_profile.risk_profile)
        
        logger.info(
            "Trust score threshold determined",
            risk_profile=user_profile.risk_profile.value,
            threshold=trust_score_threshold
        )
        
        # Validate input data
        if not ranked_traders:
            error_msg = "No ranked traders available for selection"
            logger.warning(error_msg)
            
            await self._log_selection_failure(
                user_profile=user_profile,
                error_message=error_msg,
                selection_details={
                    "traders_available": 0,
                    "threshold": float(trust_score_threshold)
                }
            )
            
            return StrategySelectionResult(
                success=False,
                error_message=error_msg,
                total_traders_evaluated=0,
                selection_timestamp=selection_timestamp
            )
        
        # Sort traders by rank to ensure we evaluate in correct order
        sorted_traders = sorted(ranked_traders, key=lambda t: t.rank)
        
        # Selection process: find first trader meeting threshold
        selected_trader: Optional[RankedTrader] = None
        eligible_traders_count = 0
        
        for trader in sorted_traders:
            try:
                # Validate trader data
                if not self._validate_trader_data(trader):
                    logger.warning(
                        "Skipping trader with invalid data",
                        trader_rank=trader.rank,
                        wallet_address=trader.wallet_address[:10] + "..."
                    )
                    continue
                
                # Check if trader meets trust score threshold
                if trader.trust_score.score >= trust_score_threshold:
                    eligible_traders_count += 1
                    
                    # Select first (top-ranked) eligible trader
                    if selected_trader is None:
                        selected_trader = trader
                        
                        logger.info(
                            "Target trader selected",
                            trader_rank=trader.rank,
                            trust_score=float(trader.trust_score.score),
                            threshold=float(trust_score_threshold),
                            wallet_address=trader.wallet_address[:10] + "..."
                        )
                        
                        # We found our target - break the loop as per FR-1 specification
                        # (select the SINGLE, top-ranked trader)
                        break
                else:
                    logger.debug(
                        "Trader does not meet trust score threshold",
                        trader_rank=trader.rank,
                        trust_score=float(trader.trust_score.score),
                        threshold=float(trust_score_threshold)
                    )
                    
            except Exception as e:
                logger.warning(
                    "Error evaluating trader",
                    trader_rank=trader.rank if hasattr(trader, 'rank') else 'unknown',
                    error=str(e)
                )
                continue
        
        # Check selection result
        if selected_trader is None:
            error_msg = f"No traders meet trust score threshold {trust_score_threshold} for {user_profile.risk_profile.value} risk profile"
            
            logger.warning(
                error_msg,
                threshold=trust_score_threshold,
                total_traders=len(sorted_traders),
                eligible_traders=eligible_traders_count
            )
            
            await self._log_selection_failure(
                user_profile=user_profile,
                error_message=error_msg,
                selection_details={
                    "traders_evaluated": len(sorted_traders),
                    "eligible_traders_found": eligible_traders_count,
                    "threshold": float(trust_score_threshold),
                    "highest_trust_score": float(max(t.trust_score.score for t in sorted_traders)) if sorted_traders else 0
                }
            )
            
            return StrategySelectionResult(
                success=False,
                error_message=error_msg,
                total_traders_evaluated=len(sorted_traders),
                eligible_traders_found=eligible_traders_count,
                selection_timestamp=selection_timestamp
            )
        
        # Create target portfolio from selected trader
        try:
            target_portfolio = await self._create_target_portfolio(
                selected_trader=selected_trader,
                user_profile=user_profile,
                trust_score_threshold=trust_score_threshold,
                selection_timestamp=selection_timestamp
            )
            
            await self._log_successful_selection(
                target_portfolio=target_portfolio,
                selection_details={
                    "traders_evaluated": len(sorted_traders),
                    "eligible_traders_found": eligible_traders_count,
                    "selection_method": "first_eligible_by_rank"
                }
            )
            
            logger.info(
                "Target portfolio created successfully",
                trader_rank=target_portfolio.trader_rank,
                trust_score=float(target_portfolio.trust_score),
                user_id=user_profile.user_id
            )
            
            return StrategySelectionResult(
                success=True,
                target_portfolio=target_portfolio,
                total_traders_evaluated=len(sorted_traders),
                eligible_traders_found=eligible_traders_count,
                selection_timestamp=selection_timestamp,
                selection_details={
                    "selection_method": "threshold_based_ranking",
                    "threshold_applied": float(trust_score_threshold),
                    "selected_trader_rank": selected_trader.rank
                }
            )
            
        except Exception as e:
            error_msg = f"Failed to create target portfolio: {str(e)}"
            logger.error(
                error_msg,
                selected_trader_rank=selected_trader.rank,
                error_type=type(e).__name__
            )
            
            await self._log_selection_failure(
                user_profile=user_profile,
                error_message=error_msg,
                selection_details={
                    "selected_trader_rank": selected_trader.rank,
                    "error_in_portfolio_creation": True
                }
            )
            
            return StrategySelectionResult(
                success=False,
                error_message=error_msg,
                total_traders_evaluated=len(sorted_traders),
                selection_timestamp=selection_timestamp
            )
    
    def _validate_trader_data(self, trader: RankedTrader) -> bool:
        """
        Validate trader data for selection eligibility.
        
        Args:
            trader: Trader to validate
            
        Returns:
            bool: True if trader data is valid for selection
        """
        try:
            # Check required fields
            if not trader.wallet_address or len(trader.wallet_address) < 32:
                return False
            
            if trader.rank <= 0:
                return False
            
            if not trader.trust_score:
                return False
            
            # Validate trust score data
            if trader.trust_score.score < 0 or trader.trust_score.score > 100:
                return False
            
            if trader.trust_score.confidence_level < 0 or trader.trust_score.confidence_level > 100:
                return False
            
            # Check for reasonable data freshness (if available)
            if trader.last_updated:
                hours_since_update = (datetime.now(timezone.utc) - trader.last_updated).total_seconds() / 3600
                if hours_since_update > 24:  # Data older than 24 hours
                    logger.warning(
                        "Trader data is potentially stale",
                        trader_rank=trader.rank,
                        hours_since_update=hours_since_update
                    )
                    # Don't reject, but log warning
            
            return True
            
        except Exception as e:
            logger.warning(
                "Error validating trader data",
                trader_rank=trader.rank if hasattr(trader, 'rank') else 'unknown',
                error=str(e)
            )
            return False
    
    async def _create_target_portfolio(
        self,
        selected_trader: RankedTrader,
        user_profile: UserRiskProfile,
        trust_score_threshold: Decimal,
        selection_timestamp: datetime
    ) -> TargetPortfolio:
        """
        Create target portfolio from selected trader.
        
        Args:
            selected_trader: The trader selected for replication
            user_profile: User's risk profile and settings
            trust_score_threshold: Trust score threshold used for selection
            selection_timestamp: When the selection was made
            
        Returns:
            TargetPortfolio: Complete target portfolio specification
        """
        # Create selection rationale
        selection_rationale = (
            f"Selected rank #{selected_trader.rank} trader "
            f"(trust score: {selected_trader.trust_score.score}) "
            f"as first trader meeting {user_profile.risk_profile.value} "
            f"threshold of {trust_score_threshold}"
        )
        
        # Create risk metrics assessment
        risk_metrics = {
            "trust_score": float(selected_trader.trust_score.score),
            "confidence_level": float(selected_trader.trust_score.confidence_level),
            "win_rate": float(selected_trader.trust_score.win_rate),
            "consistency_rating": float(selected_trader.trust_score.consistency_rating),
            "risk_assessment": selected_trader.trust_score.risk_assessment,
            "sharpe_ratio": float(selected_trader.trust_score.sharpe_ratio) if selected_trader.trust_score.sharpe_ratio else None,
            "max_drawdown": float(selected_trader.trust_score.max_drawdown) if selected_trader.trust_score.max_drawdown else None,
            "user_risk_profile": user_profile.risk_profile.value,
            "position_size_limit": float(user_profile.max_position_size_sol)
        }
        
        # Create target allocation (placeholder - will be enhanced with actual strategy data)
        # For now, we create a simple allocation based on the trader's recent performance
        target_allocation = self._create_allocation_from_trader(selected_trader, user_profile)
        
        return TargetPortfolio(
            selected_trader=selected_trader,
            user_risk_profile=user_profile.risk_profile,
            selection_timestamp=selection_timestamp,
            trust_score_threshold=trust_score_threshold,
            selection_rationale=selection_rationale,
            target_allocation=target_allocation,
            risk_metrics=risk_metrics
        )
    
    def _create_allocation_from_trader(
        self,
        trader: RankedTrader,
        user_profile: UserRiskProfile
    ) -> Dict[str, Decimal]:
        """
        Create target allocation based on trader's strategy.
        
        This is a placeholder implementation that will be enhanced
        when we have more details about the trader's actual positions.
        
        Args:
            trader: Selected trader
            user_profile: User's profile and limits
            
        Returns:
            Dict mapping token symbols to allocation percentages
        """
        # For now, create a basic allocation based on risk profile
        # This will be replaced with actual trader position replication
        
        base_allocation = user_profile.max_position_size_sol
        
        # Apply risk-based scaling
        risk_multipliers = {
            RiskProfile.CONSERVATIVE: Decimal("0.6"),  # 60% of max position
            RiskProfile.MODERATE: Decimal("0.8"),      # 80% of max position  
            RiskProfile.AGGRESSIVE: Decimal("1.0")     # 100% of max position
        }
        
        risk_multiplier = risk_multipliers.get(user_profile.risk_profile, Decimal("0.8"))
        target_position_size = base_allocation * risk_multiplier
        
        # Create placeholder allocation
        # In real implementation, this would be based on trader's actual positions
        return {
            "SOL": target_position_size,  # Base position in SOL
            "allocation_method": "risk_adjusted_replication",
            "trader_influence": float(trader.trust_score.score / 100),
            "max_position": float(user_profile.max_position_size_sol)
        }
    
    async def _log_successful_selection(
        self,
        target_portfolio: TargetPortfolio,
        selection_details: Dict[str, Any]
    ):
        """Log successful target portfolio selection."""
        await self.audit_logger.log_system_event(
            event_type=AuditEventType.TRADE_DECISION,
            severity=AuditSeverity.INFO,
            event_data={
                "target_portfolio_selected": True,
                "trader_rank": target_portfolio.trader_rank,
                "trust_score": float(target_portfolio.trust_score),
                "threshold": float(target_portfolio.trust_score_threshold),
                "risk_profile": target_portfolio.user_risk_profile.value,
                **selection_details
            },
            decision_rationale=target_portfolio.selection_rationale
        )
    
    async def _log_selection_failure(
        self,
        user_profile: UserRiskProfile,
        error_message: str,
        selection_details: Dict[str, Any]
    ):
        """Log failed target portfolio selection."""
        await self.audit_logger.log_error_event(
            error_message=f"Target portfolio selection failed: {error_message}",
            error_type="strategy_selection_failure",
            severity=AuditSeverity.WARNING,
            user_id=user_profile.user_id,
            wallet_address=user_profile.wallet_address,
            context_data={
                "risk_profile": user_profile.risk_profile.value,
                **selection_details
            }
        )


# Global strategy selector instance
strategy_selector: Optional[StrategySelector] = None


def get_strategy_selector() -> StrategySelector:
    """Get the global strategy selector instance."""
    global strategy_selector
    if strategy_selector is None:
        strategy_selector = StrategySelector()
    return strategy_selector