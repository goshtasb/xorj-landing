"""
XORJ Quantitative Engine - Trust Score Algorithm
Implements the proprietary XORJ Trust Score calculation with wallet eligibility filtering
"""

import asyncio
from datetime import datetime, timezone, timedelta
from decimal import Decimal, getcontext
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass
from enum import Enum
import statistics

from ..calculation.metrics import PerformanceMetrics, TradeRecord
from ..calculation.service import get_calculation_service
from ..schemas.ingestion import RaydiumSwap
from ..core.config import get_settings
from ..core.logging import get_calculation_logger

# Set high precision for all decimal calculations
getcontext().prec = 28

settings = get_settings()
logger = get_calculation_logger()

# --- XORJ Trust Score Algorithm ---
# Core IP: Implement exactly as specified in FR-3

# Weights are biased towards safety and risk-adjusted returns
SHARPE_WEIGHT = Decimal('0.40')
ROI_WEIGHT = Decimal('0.25')
DRAWDOWN_PENALTY_WEIGHT = Decimal('0.35')

# Eligibility criteria constants
MIN_TRADING_DAYS = 90
MIN_TOTAL_TRADES = 50
MAX_SINGLE_DAY_ROI_SPIKE = Decimal('0.50')  # 50% single-day ROI spike threshold


class EligibilityStatus(Enum):
    """Wallet eligibility status for XORJ Trust Score"""
    ELIGIBLE = "eligible"
    INSUFFICIENT_HISTORY = "insufficient_history"
    INSUFFICIENT_TRADES = "insufficient_trades"
    EXTREME_ROI_SPIKE = "extreme_roi_spike"
    NO_DATA = "no_data"
    CALCULATION_ERROR = "calculation_error"


@dataclass
class NormalizedMetrics:
    """Normalized metrics for XORJ Trust Score calculation (0.0 to 1.0 scale)"""
    normalized_sharpe: Decimal
    normalized_roi: Decimal
    normalized_max_drawdown: Decimal
    
    # Original values for reference
    original_sharpe: Decimal
    original_roi: Decimal
    original_max_drawdown: Decimal
    
    # Normalization context
    sharpe_min: Decimal
    sharpe_max: Decimal
    roi_min: Decimal
    roi_max: Decimal
    drawdown_min: Decimal
    drawdown_max: Decimal


@dataclass
class TrustScoreResult:
    """Complete XORJ Trust Score result with breakdown"""
    wallet_address: str
    trust_score: Decimal  # 0-100 scale
    eligibility_status: EligibilityStatus
    eligibility_reason: Optional[str] = None
    
    # Score breakdown (only if eligible)
    normalized_metrics: Optional[NormalizedMetrics] = None
    performance_score: Optional[Decimal] = None
    risk_penalty: Optional[Decimal] = None
    
    # Supporting data
    original_metrics: Optional[PerformanceMetrics] = None
    calculation_timestamp: Optional[datetime] = None
    
    def __post_init__(self):
        """Ensure trust_score is high-precision Decimal"""
        if not isinstance(self.trust_score, Decimal):
            self.trust_score = Decimal(str(self.trust_score))


class XORJTrustScoreEngine:
    """
    XORJ Trust Score calculation engine
    Implements wallet eligibility filtering, metric normalization, and scoring algorithm
    """
    
    def __init__(self):
        self.calculation_service = None
        self.min_history_days = MIN_TRADING_DAYS
        self.min_trades = MIN_TOTAL_TRADES
        self.max_single_day_roi_spike = MAX_SINGLE_DAY_ROI_SPIKE
        
        logger.info(
            "Initialized XORJ Trust Score Engine",
            min_history_days=self.min_history_days,
            min_trades=self.min_trades,
            max_roi_spike=str(self.max_single_day_roi_spike),
            sharpe_weight=str(SHARPE_WEIGHT),
            roi_weight=str(ROI_WEIGHT),
            drawdown_weight=str(DRAWDOWN_PENALTY_WEIGHT)
        )
    
    async def initialize(self):
        """Initialize async dependencies"""
        self.calculation_service = await get_calculation_service()
        logger.debug("Trust Score Engine initialized with calculation service")
    
    async def check_wallet_eligibility(
        self,
        wallet_address: str,
        trades: List[RaydiumSwap],
        metrics: Optional[PerformanceMetrics] = None
    ) -> Tuple[EligibilityStatus, Optional[str]]:
        """
        Check if wallet meets eligibility criteria for XORJ Trust Score
        
        Args:
            wallet_address: Wallet address to check
            trades: List of wallet's trades
            metrics: Pre-calculated performance metrics (optional)
            
        Returns:
            Tuple of (eligibility_status, reason)
        """
        if not trades:
            return EligibilityStatus.NO_DATA, "No trading data available"
        
        logger.debug(
            "Checking wallet eligibility",
            wallet=wallet_address,
            trade_count=len(trades)
        )
        
        # Check 1: Minimum 90-day trading history
        if not trades:
            return EligibilityStatus.NO_DATA, "No trades found"
        
        earliest_trade = min(trade.block_time for trade in trades)
        latest_trade = max(trade.block_time for trade in trades)
        trading_period = (latest_trade - earliest_trade).days
        
        if trading_period < self.min_history_days:
            reason = f"Trading history only {trading_period} days, minimum {self.min_history_days} required"
            return EligibilityStatus.INSUFFICIENT_HISTORY, reason
        
        # Check 2: Minimum 50 trades
        if len(trades) < self.min_trades:
            reason = f"Only {len(trades)} trades, minimum {self.min_trades} required"
            return EligibilityStatus.INSUFFICIENT_TRADES, reason
        
        # Check 3: No extreme single-day ROI spikes
        try:
            if await self._has_extreme_roi_spikes(trades):
                reason = f"Detected single-day ROI spike exceeding {self.max_single_day_roi_spike * 100}%"
                return EligibilityStatus.EXTREME_ROI_SPIKE, reason
        except Exception as e:
            logger.error(
                "Error checking ROI spikes",
                wallet=wallet_address,
                error=str(e)
            )
            return EligibilityStatus.CALCULATION_ERROR, f"ROI spike analysis failed: {str(e)}"
        
        logger.info(
            "Wallet eligible for XORJ Trust Score",
            wallet=wallet_address,
            trading_days=trading_period,
            total_trades=len(trades)
        )
        
        return EligibilityStatus.ELIGIBLE, None
    
    async def _has_extreme_roi_spikes(self, trades: List[RaydiumSwap]) -> bool:
        """
        Check for extreme single-day ROI spikes that indicate wash trading or manipulation
        
        Args:
            trades: List of trades to analyze
            
        Returns:
            True if extreme spikes detected, False otherwise
        """
        if not self.calculation_service:
            await self.initialize()
        
        # Group trades by day and calculate daily P&L
        daily_pnl = {}
        
        for trade in trades:
            try:
                # Calculate USD values for this trade
                trade_record = await self.calculation_service.calculate_trade_usd_values(trade)
                if not trade_record:
                    continue
                
                trade_date = trade.block_time.date()
                if trade_date not in daily_pnl:
                    daily_pnl[trade_date] = {
                        'profit': Decimal('0'),
                        'volume': Decimal('0')
                    }
                
                daily_pnl[trade_date]['profit'] += trade_record.net_profit_usd
                daily_pnl[trade_date]['volume'] += trade_record.token_in_usd
                
            except Exception as e:
                logger.warning(
                    "Failed to process trade for ROI spike analysis",
                    signature=trade.signature,
                    error=str(e)
                )
                continue
        
        # Check each day for extreme ROI spikes
        for date, data in daily_pnl.items():
            if data['volume'] > 0:
                daily_roi = data['profit'] / data['volume']
                if abs(daily_roi) > self.max_single_day_roi_spike:
                    logger.warning(
                        "Extreme single-day ROI spike detected",
                        date=date.isoformat(),
                        daily_roi=str(daily_roi),
                        threshold=str(self.max_single_day_roi_spike)
                    )
                    return True
        
        return False
    
    def normalize_metrics(
        self,
        metrics_list: List[PerformanceMetrics]
    ) -> Dict[str, NormalizedMetrics]:
        """
        Normalize performance metrics to 0.0-1.0 scale for Trust Score calculation
        
        Args:
            metrics_list: List of performance metrics from multiple wallets
            
        Returns:
            Dict mapping wallet addresses to normalized metrics
        """
        if not metrics_list:
            return {}
        
        logger.info(
            "Normalizing metrics for Trust Score calculation",
            wallet_count=len(metrics_list)
        )
        
        # Extract values for normalization
        sharpe_values = [m.sharpe_ratio for m in metrics_list]
        roi_values = [m.net_roi_percent for m in metrics_list]
        drawdown_values = [m.maximum_drawdown_percent for m in metrics_list]
        
        # Calculate min/max for normalization
        sharpe_min, sharpe_max = min(sharpe_values), max(sharpe_values)
        roi_min, roi_max = min(roi_values), max(roi_values)
        drawdown_min, drawdown_max = min(drawdown_values), max(drawdown_values)
        
        # Avoid division by zero
        sharpe_range = max(sharpe_max - sharpe_min, Decimal('0.001'))
        roi_range = max(roi_max - roi_min, Decimal('0.001'))
        drawdown_range = max(drawdown_max - drawdown_min, Decimal('0.001'))
        
        normalized_results = {}
        
        for metrics in metrics_list:
            # Normalize to 0.0-1.0 scale
            normalized_sharpe = (metrics.sharpe_ratio - sharpe_min) / sharpe_range
            normalized_roi = (metrics.net_roi_percent - roi_min) / roi_range
            
            # For drawdown, invert so lower drawdown = higher score
            normalized_max_drawdown = Decimal('1.0') - ((metrics.maximum_drawdown_percent - drawdown_min) / drawdown_range)
            
            # Ensure bounds
            normalized_sharpe = max(Decimal('0.0'), min(Decimal('1.0'), normalized_sharpe))
            normalized_roi = max(Decimal('0.0'), min(Decimal('1.0'), normalized_roi))
            normalized_max_drawdown = max(Decimal('0.0'), min(Decimal('1.0'), normalized_max_drawdown))
            
            wallet_key = f"wallet_{len(normalized_results)}"  # Will be replaced with actual address
            
            normalized_results[wallet_key] = NormalizedMetrics(
                normalized_sharpe=normalized_sharpe,
                normalized_roi=normalized_roi,
                normalized_max_drawdown=normalized_max_drawdown,
                original_sharpe=metrics.sharpe_ratio,
                original_roi=metrics.net_roi_percent,
                original_max_drawdown=metrics.maximum_drawdown_percent,
                sharpe_min=sharpe_min,
                sharpe_max=sharpe_max,
                roi_min=roi_min,
                roi_max=roi_max,
                drawdown_min=drawdown_min,
                drawdown_max=drawdown_max
            )
        
        logger.debug(
            "Metrics normalization completed",
            sharpe_range=(str(sharpe_min), str(sharpe_max)),
            roi_range=(str(roi_min), str(roi_max)),
            drawdown_range=(str(drawdown_min), str(drawdown_max))
        )
        
        return normalized_results
    
    def calculate_xorj_trust_score(self, normalized_metrics: NormalizedMetrics) -> Tuple[Decimal, Decimal, Decimal]:
        """
        Calculate XORJ Trust Score using the exact weighted formula
        
        Args:
            normalized_metrics: Normalized metrics (0.0 to 1.0 scale)
            
        Returns:
            Tuple of (trust_score, performance_score, risk_penalty)
        """
        # Extract normalized values
        normalized_sharpe = normalized_metrics.normalized_sharpe
        normalized_roi = normalized_metrics.normalized_roi
        normalized_max_drawdown = normalized_metrics.normalized_max_drawdown
        
        # Calculate performance score (positive contribution)
        performance_score = (normalized_sharpe * SHARPE_WEIGHT) + (normalized_roi * ROI_WEIGHT)
        
        # Calculate risk penalty (negative contribution)
        # Note: normalized_max_drawdown is inverted, so higher value = lower drawdown = lower penalty
        risk_penalty = (Decimal('1.0') - normalized_max_drawdown) * DRAWDOWN_PENALTY_WEIGHT
        
        # The final score heavily penalizes high drawdowns
        final_score = performance_score - risk_penalty
        
        # Scale to 0-100 and prevent negative scores
        trust_score = max(Decimal('0'), final_score) * Decimal('100')
        
        logger.debug(
            "XORJ Trust Score calculated",
            performance_score=str(performance_score),
            risk_penalty=str(risk_penalty),
            final_score=str(final_score),
            trust_score=str(trust_score)
        )
        
        return trust_score, performance_score, risk_penalty
    
    async def calculate_single_wallet_trust_score(
        self,
        wallet_address: str,
        trades: List[RaydiumSwap],
        benchmark_metrics: Optional[List[PerformanceMetrics]] = None,
        end_date: Optional[datetime] = None
    ) -> TrustScoreResult:
        """
        Calculate XORJ Trust Score for a single wallet
        
        Args:
            wallet_address: Target wallet address
            trades: Wallet's trading history
            benchmark_metrics: Metrics from other wallets for normalization
            end_date: End date for analysis period
            
        Returns:
            Complete TrustScoreResult with score and breakdown
        """
        if not self.calculation_service:
            await self.initialize()
        
        logger.info(
            "Calculating XORJ Trust Score for wallet",
            wallet=wallet_address,
            trade_count=len(trades)
        )
        
        try:
            # Step 1: Check eligibility
            eligibility_status, eligibility_reason = await self.check_wallet_eligibility(
                wallet_address, trades
            )
            
            if eligibility_status != EligibilityStatus.ELIGIBLE:
                return TrustScoreResult(
                    wallet_address=wallet_address,
                    trust_score=Decimal('0'),
                    eligibility_status=eligibility_status,
                    eligibility_reason=eligibility_reason,
                    calculation_timestamp=datetime.now(timezone.utc)
                )
            
            # Step 2: Calculate performance metrics
            metrics = await self.calculation_service.calculate_wallet_performance(
                wallet_address, trades, end_date
            )
            
            if not metrics:
                return TrustScoreResult(
                    wallet_address=wallet_address,
                    trust_score=Decimal('0'),
                    eligibility_status=EligibilityStatus.CALCULATION_ERROR,
                    eligibility_reason="Failed to calculate performance metrics",
                    calculation_timestamp=datetime.now(timezone.utc)
                )
            
            # Step 3: Normalize metrics (need benchmark data)
            if not benchmark_metrics:
                # If no benchmark provided, create single-wallet normalization
                benchmark_metrics = [metrics]
            
            normalized_results = self.normalize_metrics(benchmark_metrics)
            
            # Find our wallet's normalized metrics
            wallet_normalized_metrics = None
            for norm_metrics in normalized_results.values():
                if (norm_metrics.original_sharpe == metrics.sharpe_ratio and 
                    norm_metrics.original_roi == metrics.net_roi_percent):
                    wallet_normalized_metrics = norm_metrics
                    break
            
            if not wallet_normalized_metrics:
                return TrustScoreResult(
                    wallet_address=wallet_address,
                    trust_score=Decimal('0'),
                    eligibility_status=EligibilityStatus.CALCULATION_ERROR,
                    eligibility_reason="Failed to normalize metrics",
                    calculation_timestamp=datetime.now(timezone.utc)
                )
            
            # Step 4: Calculate XORJ Trust Score
            trust_score, performance_score, risk_penalty = self.calculate_xorj_trust_score(
                wallet_normalized_metrics
            )
            
            result = TrustScoreResult(
                wallet_address=wallet_address,
                trust_score=trust_score,
                eligibility_status=EligibilityStatus.ELIGIBLE,
                normalized_metrics=wallet_normalized_metrics,
                performance_score=performance_score,
                risk_penalty=risk_penalty,
                original_metrics=metrics,
                calculation_timestamp=datetime.now(timezone.utc)
            )
            
            logger.info(
                "XORJ Trust Score calculation completed",
                wallet=wallet_address,
                trust_score=str(trust_score),
                performance_score=str(performance_score),
                risk_penalty=str(risk_penalty),
                eligibility="eligible"
            )
            
            return result
            
        except Exception as e:
            logger.error(
                "Failed to calculate XORJ Trust Score",
                wallet=wallet_address,
                error=str(e),
                error_type=type(e).__name__
            )
            
            return TrustScoreResult(
                wallet_address=wallet_address,
                trust_score=Decimal('0'),
                eligibility_status=EligibilityStatus.CALCULATION_ERROR,
                eligibility_reason=f"Calculation failed: {str(e)}",
                calculation_timestamp=datetime.now(timezone.utc)
            )
    
    async def calculate_batch_trust_scores(
        self,
        wallet_trades: Dict[str, List[RaydiumSwap]],
        end_date: Optional[datetime] = None
    ) -> Dict[str, TrustScoreResult]:
        """
        Calculate XORJ Trust Scores for multiple wallets with proper normalization
        
        Args:
            wallet_trades: Dict mapping wallet addresses to their trades
            end_date: End date for analysis period
            
        Returns:
            Dict mapping wallet addresses to TrustScoreResult
        """
        if not self.calculation_service:
            await self.initialize()
        
        logger.info(
            "Calculating batch XORJ Trust Scores",
            wallet_count=len(wallet_trades)
        )
        
        results = {}
        eligible_wallets = []
        benchmark_metrics = []
        
        # Step 1: Check eligibility for all wallets and gather eligible ones
        for wallet_address, trades in wallet_trades.items():
            eligibility_status, eligibility_reason = await self.check_wallet_eligibility(
                wallet_address, trades
            )
            
            if eligibility_status == EligibilityStatus.ELIGIBLE:
                eligible_wallets.append(wallet_address)
            else:
                results[wallet_address] = TrustScoreResult(
                    wallet_address=wallet_address,
                    trust_score=Decimal('0'),
                    eligibility_status=eligibility_status,
                    eligibility_reason=eligibility_reason,
                    calculation_timestamp=datetime.now(timezone.utc)
                )
        
        if not eligible_wallets:
            logger.warning("No eligible wallets found for Trust Score calculation")
            return results
        
        # Step 2: Calculate performance metrics for eligible wallets
        logger.info(f"Calculating metrics for {len(eligible_wallets)} eligible wallets")
        
        eligible_wallet_trades = {
            wallet: wallet_trades[wallet] for wallet in eligible_wallets
        }
        
        wallet_metrics = await self.calculation_service.calculate_batch_wallet_performance(
            eligible_wallet_trades, end_date
        )
        
        # Step 3: Gather metrics for normalization benchmark
        for wallet_address in eligible_wallets:
            metrics = wallet_metrics.get(wallet_address)
            if metrics:
                benchmark_metrics.append(metrics)
        
        if not benchmark_metrics:
            logger.error("No metrics calculated for eligible wallets")
            for wallet_address in eligible_wallets:
                results[wallet_address] = TrustScoreResult(
                    wallet_address=wallet_address,
                    trust_score=Decimal('0'),
                    eligibility_status=EligibilityStatus.CALCULATION_ERROR,
                    eligibility_reason="Failed to calculate performance metrics",
                    calculation_timestamp=datetime.now(timezone.utc)
                )
            return results
        
        # Step 4: Normalize metrics across all eligible wallets
        normalized_metrics_dict = self.normalize_metrics(benchmark_metrics)
        
        # Step 5: Calculate Trust Scores for eligible wallets
        metric_index = 0
        for wallet_address in eligible_wallets:
            metrics = wallet_metrics.get(wallet_address)
            if not metrics:
                results[wallet_address] = TrustScoreResult(
                    wallet_address=wallet_address,
                    trust_score=Decimal('0'),
                    eligibility_status=EligibilityStatus.CALCULATION_ERROR,
                    eligibility_reason="Performance metrics not available",
                    calculation_timestamp=datetime.now(timezone.utc)
                )
                continue
            
            # Get normalized metrics for this wallet
            wallet_key = f"wallet_{metric_index}"
            wallet_normalized_metrics = normalized_metrics_dict.get(wallet_key)
            
            if not wallet_normalized_metrics:
                results[wallet_address] = TrustScoreResult(
                    wallet_address=wallet_address,
                    trust_score=Decimal('0'),
                    eligibility_status=EligibilityStatus.CALCULATION_ERROR,
                    eligibility_reason="Failed to normalize metrics",
                    calculation_timestamp=datetime.now(timezone.utc)
                )
                continue
            
            # Calculate XORJ Trust Score
            trust_score, performance_score, risk_penalty = self.calculate_xorj_trust_score(
                wallet_normalized_metrics
            )
            
            results[wallet_address] = TrustScoreResult(
                wallet_address=wallet_address,
                trust_score=trust_score,
                eligibility_status=EligibilityStatus.ELIGIBLE,
                normalized_metrics=wallet_normalized_metrics,
                performance_score=performance_score,
                risk_penalty=risk_penalty,
                original_metrics=metrics,
                calculation_timestamp=datetime.now(timezone.utc)
            )
            
            metric_index += 1
        
        successful_scores = sum(1 for result in results.values() 
                               if result.eligibility_status == EligibilityStatus.ELIGIBLE)
        
        logger.info(
            "Batch XORJ Trust Score calculation completed",
            total_wallets=len(wallet_trades),
            eligible_wallets=len(eligible_wallets),
            successful_scores=successful_scores
        )
        
        return results


# Global scoring engine instance
_scoring_engine: Optional[XORJTrustScoreEngine] = None


async def get_trust_score_engine() -> XORJTrustScoreEngine:
    """Get global Trust Score engine instance"""
    global _scoring_engine
    
    if _scoring_engine is None:
        _scoring_engine = XORJTrustScoreEngine()
        await _scoring_engine.initialize()
    
    return _scoring_engine