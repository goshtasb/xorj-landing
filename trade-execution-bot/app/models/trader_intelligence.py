"""
Data models for trader intelligence and scoring.

These models represent the intelligence received from the XORJ Quantitative Engine
and ensure type safety and validation throughout the trade execution process.
"""

from dataclasses import dataclass
from typing import Dict, List, Optional, Any
from decimal import Decimal
from datetime import datetime
from enum import Enum

import structlog

logger = structlog.get_logger(__name__)


class RiskProfile(Enum):
    """User risk profile levels as stored in user settings database."""
    CONSERVATIVE = "conservative"
    MODERATE = "moderate" 
    AGGRESSIVE = "aggressive"


@dataclass
class TrustScoreData:
    """
    XORJTrustScore data from the Quantitative Engine.
    
    Represents the comprehensive scoring metrics for a trader,
    including all factors that contribute to the trust score.
    """
    score: Decimal  # Trust score (0-100)
    confidence_level: Decimal  # Confidence in the score (0-100)
    risk_assessment: str  # Risk category (low, medium, high)
    consistency_rating: Decimal  # Consistency score (0-100)
    win_rate: Decimal  # Win rate percentage (0-100)
    sharpe_ratio: Optional[Decimal] = None  # Sharpe ratio if available
    max_drawdown: Optional[Decimal] = None  # Maximum drawdown if available
    
    def __post_init__(self):
        """Validate trust score data after initialization."""
        self._validate_score_ranges()
    
    def _validate_score_ranges(self):
        """Validate that all score values are within expected ranges."""
        if not (0 <= self.score <= 100):
            raise ValueError(f"Trust score must be 0-100, got {self.score}")
        
        if not (0 <= self.confidence_level <= 100):
            raise ValueError(f"Confidence level must be 0-100, got {self.confidence_level}")
        
        if not (0 <= self.consistency_rating <= 100):
            raise ValueError(f"Consistency rating must be 0-100, got {self.consistency_rating}")
        
        if not (0 <= self.win_rate <= 100):
            raise ValueError(f"Win rate must be 0-100, got {self.win_rate}")
        
        valid_risk_levels = ["low", "medium", "high"]
        if self.risk_assessment.lower() not in valid_risk_levels:
            raise ValueError(f"Risk assessment must be one of {valid_risk_levels}")
    
    @property
    def is_high_confidence(self) -> bool:
        """Check if this is a high-confidence trust score."""
        return self.confidence_level >= 80
    
    @property
    def is_reliable_trader(self) -> bool:
        """Check if this trader meets reliability criteria."""
        return (
            self.score >= 70 and
            self.confidence_level >= 70 and
            self.win_rate >= 60
        )


@dataclass  
class RankedTrader:
    """
    Ranked trader from XORJ Quantitative Engine.
    
    Represents a single trader in the ranked list, with complete
    intelligence and scoring data needed for trade replication decisions.
    """
    wallet_address: str  # Solana wallet address
    rank: int  # Position in ranked list (1-based)
    trust_score: TrustScoreData  # XORJTrustScore details
    recent_performance: Dict[str, Any]  # Recent trading performance data
    trade_patterns: Optional[Dict[str, Any]] = None  # Trading patterns if available
    last_updated: Optional[datetime] = None  # When data was last updated
    
    def __post_init__(self):
        """Validate ranked trader data after initialization."""
        self._validate_wallet_address()
        self._validate_rank()
    
    def _validate_wallet_address(self):
        """Validate Solana wallet address format."""
        if not isinstance(self.wallet_address, str):
            raise ValueError("Wallet address must be a string")
        
        if len(self.wallet_address) < 32 or len(self.wallet_address) > 44:
            raise ValueError(f"Invalid wallet address length: {len(self.wallet_address)}")
        
        # Basic validation - should contain only valid base58 characters
        import string
        valid_chars = string.ascii_letters + string.digits
        if not all(c in valid_chars for c in self.wallet_address):
            logger.warning(
                "Wallet address contains invalid characters",
                wallet_address=self.wallet_address[:10] + "..."  # Log only prefix for security
            )
    
    def _validate_rank(self):
        """Validate trader rank."""
        if not isinstance(self.rank, int) or self.rank < 1:
            raise ValueError(f"Rank must be a positive integer, got {self.rank}")
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'RankedTrader':
        """
        Create RankedTrader from dictionary data.
        
        Args:
            data: Dictionary containing trader data from API response
            
        Returns:
            RankedTrader instance
            
        Raises:
            ValueError: If required fields are missing or invalid
        """
        try:
            # Extract required fields
            wallet_address = data.get("wallet_address")
            if not wallet_address:
                raise ValueError("wallet_address is required")
            
            rank = data.get("rank")
            if rank is None:
                raise ValueError("rank is required")
            
            # Extract trust score data
            trust_score_data = data.get("trust_score")
            if not trust_score_data:
                raise ValueError("trust_score is required")
            
            trust_score = TrustScoreData(
                score=Decimal(str(trust_score_data.get("score", 0))),
                confidence_level=Decimal(str(trust_score_data.get("confidence_level", 0))),
                risk_assessment=trust_score_data.get("risk_assessment", "medium"),
                consistency_rating=Decimal(str(trust_score_data.get("consistency_rating", 0))),
                win_rate=Decimal(str(trust_score_data.get("win_rate", 0))),
                sharpe_ratio=Decimal(str(trust_score_data["sharpe_ratio"])) if trust_score_data.get("sharpe_ratio") is not None else None,
                max_drawdown=Decimal(str(trust_score_data["max_drawdown"])) if trust_score_data.get("max_drawdown") is not None else None
            )
            
            # Extract performance data
            recent_performance = data.get("recent_performance", {})
            
            # Optional fields
            trade_patterns = data.get("trade_patterns")
            last_updated_str = data.get("last_updated")
            last_updated = None
            if last_updated_str:
                try:
                    last_updated = datetime.fromisoformat(last_updated_str.replace('Z', '+00:00'))
                except ValueError:
                    logger.warning(
                        "Invalid last_updated timestamp format",
                        timestamp=last_updated_str
                    )
            
            return cls(
                wallet_address=wallet_address,
                rank=rank,
                trust_score=trust_score,
                recent_performance=recent_performance,
                trade_patterns=trade_patterns,
                last_updated=last_updated
            )
            
        except Exception as e:
            logger.error(
                "Failed to create RankedTrader from dictionary",
                data_keys=list(data.keys()) if isinstance(data, dict) else None,
                error=str(e)
            )
            raise ValueError(f"Invalid trader data: {str(e)}")
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert RankedTrader to dictionary for serialization."""
        return {
            "wallet_address": self.wallet_address,
            "rank": self.rank,
            "trust_score": {
                "score": float(self.trust_score.score),
                "confidence_level": float(self.trust_score.confidence_level),
                "risk_assessment": self.trust_score.risk_assessment,
                "consistency_rating": float(self.trust_score.consistency_rating),
                "win_rate": float(self.trust_score.win_rate),
                "sharpe_ratio": float(self.trust_score.sharpe_ratio) if self.trust_score.sharpe_ratio else None,
                "max_drawdown": float(self.trust_score.max_drawdown) if self.trust_score.max_drawdown else None
            },
            "recent_performance": self.recent_performance,
            "trade_patterns": self.trade_patterns,
            "last_updated": self.last_updated.isoformat() if self.last_updated else None
        }
    
    @property
    def is_eligible_for_replication(self) -> bool:
        """
        Check if this trader is eligible for trade replication.
        
        Returns:
            bool: True if trader meets minimum criteria for replication
        """
        return (
            self.trust_score.is_reliable_trader and
            self.trust_score.is_high_confidence and
            self.rank <= 50  # Only replicate top 50 traders
        )
    
    def get_replication_weight(self, risk_profile: RiskProfile) -> Decimal:
        """
        Calculate replication weight based on trust score and risk profile.
        
        Args:
            risk_profile: User's risk profile
            
        Returns:
            Decimal: Weight for this trader (0.0 to 1.0)
        """
        if not self.is_eligible_for_replication:
            return Decimal("0.0")
        
        # Base weight from trust score and rank
        base_weight = self.trust_score.score / Decimal("100")
        rank_adjustment = Decimal("1.0") - (Decimal(str(self.rank)) - Decimal("1")) / Decimal("50")
        
        # Adjust based on risk profile
        risk_multiplier = {
            RiskProfile.CONSERVATIVE: Decimal("0.7"),
            RiskProfile.MODERATE: Decimal("1.0"), 
            RiskProfile.AGGRESSIVE: Decimal("1.3")
        }.get(risk_profile, Decimal("1.0"))
        
        # Consider risk assessment
        risk_assessment_multiplier = {
            "low": Decimal("1.1"),
            "medium": Decimal("1.0"),
            "high": Decimal("0.8")
        }.get(self.trust_score.risk_assessment.lower(), Decimal("1.0"))
        
        final_weight = base_weight * rank_adjustment * risk_multiplier * risk_assessment_multiplier
        
        # Ensure weight is between 0 and 1
        return max(Decimal("0.0"), min(Decimal("1.0"), final_weight))