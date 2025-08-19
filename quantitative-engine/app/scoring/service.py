"""
XORJ Quantitative Engine - Scoring Service
Integrated scoring service that orchestrates Trust Score calculations
"""

import asyncio
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional, Tuple
from dataclasses import asdict

from ..schemas.ingestion import RaydiumSwap
from ..core.config import get_settings
from ..core.logging import get_calculation_logger
from .trust_score import get_trust_score_engine, TrustScoreResult, EligibilityStatus
from ..calculation.service import get_calculation_service

settings = get_settings()
logger = get_calculation_logger()


class ScoringService:
    """
    Integrated scoring service for FR-3: Scoring Module
    Orchestrates XORJ Trust Score calculation with eligibility filtering and normalization
    """
    
    def __init__(self):
        self.scoring_engine = None
        self.calculation_service = None
        logger.info("Initialized scoring service")
    
    async def initialize(self):
        """Initialize async dependencies"""
        self.scoring_engine = await get_trust_score_engine()
        self.calculation_service = await get_calculation_service()
        logger.info("Scoring service fully initialized")
    
    async def calculate_wallet_trust_score(
        self,
        wallet_address: str,
        trades: List[RaydiumSwap],
        benchmark_wallets: Optional[Dict[str, List[RaydiumSwap]]] = None,
        end_date: Optional[datetime] = None
    ) -> TrustScoreResult:
        """
        Calculate XORJ Trust Score for a single wallet
        
        Args:
            wallet_address: Wallet address to score
            trades: List of wallet's trades
            benchmark_wallets: Other wallets for normalization context (optional)
            end_date: End date for calculation period
            
        Returns:
            Complete TrustScoreResult with score breakdown
        """
        if not self.scoring_engine:
            await self.initialize()
        
        logger.info(
            "Starting wallet Trust Score calculation",
            wallet=wallet_address,
            trade_count=len(trades),
            has_benchmark=benchmark_wallets is not None,
            end_date=end_date.isoformat() if end_date else "current"
        )
        
        try:
            # If benchmark wallets provided, calculate their metrics for normalization
            benchmark_metrics = None
            if benchmark_wallets:
                logger.debug("Calculating benchmark metrics for normalization")
                benchmark_wallet_metrics = await self.calculation_service.calculate_batch_wallet_performance(
                    benchmark_wallets, end_date
                )
                benchmark_metrics = [
                    metrics for metrics in benchmark_wallet_metrics.values() 
                    if metrics is not None
                ]
            
            # Calculate Trust Score
            result = await self.scoring_engine.calculate_single_wallet_trust_score(
                wallet_address, trades, benchmark_metrics, end_date
            )
            
            logger.info(
                "Wallet Trust Score calculation completed",
                wallet=wallet_address,
                trust_score=str(result.trust_score),
                eligibility=result.eligibility_status.value,
                success=result.eligibility_status == EligibilityStatus.ELIGIBLE
            )
            
            return result
            
        except Exception as e:
            logger.error(
                "Error calculating wallet Trust Score",
                wallet=wallet_address,
                error=str(e),
                error_type=type(e).__name__
            )
            return TrustScoreResult(
                wallet_address=wallet_address,
                trust_score=0,
                eligibility_status=EligibilityStatus.CALCULATION_ERROR,
                eligibility_reason=f"Service error: {str(e)}",
                calculation_timestamp=datetime.now(timezone.utc)
            )
    
    async def calculate_batch_trust_scores(
        self,
        wallet_trades: Dict[str, List[RaydiumSwap]],
        end_date: Optional[datetime] = None
    ) -> Dict[str, TrustScoreResult]:
        """
        Calculate XORJ Trust Scores for multiple wallets with proper cross-normalization
        
        Args:
            wallet_trades: Dict mapping wallet addresses to their trades
            end_date: End date for calculation period
            
        Returns:
            Dict mapping wallet addresses to TrustScoreResult
        """
        if not self.scoring_engine:
            await self.initialize()
        
        logger.info(
            "Starting batch Trust Score calculation",
            wallet_count=len(wallet_trades),
            total_trades=sum(len(trades) for trades in wallet_trades.values())
        )
        
        try:
            results = await self.scoring_engine.calculate_batch_trust_scores(
                wallet_trades, end_date
            )
            
            # Calculate summary statistics
            eligible_count = sum(1 for r in results.values() 
                               if r.eligibility_status == EligibilityStatus.ELIGIBLE)
            
            trust_scores = [float(r.trust_score) for r in results.values() 
                          if r.eligibility_status == EligibilityStatus.ELIGIBLE]
            
            avg_trust_score = sum(trust_scores) / len(trust_scores) if trust_scores else 0
            max_trust_score = max(trust_scores) if trust_scores else 0
            min_trust_score = min(trust_scores) if trust_scores else 0
            
            logger.info(
                "Batch Trust Score calculation completed",
                total_wallets=len(wallet_trades),
                eligible_wallets=eligible_count,
                eligibility_rate=f"{eligible_count/len(wallet_trades):.2%}" if wallet_trades else "0%",
                avg_trust_score=round(avg_trust_score, 2),
                max_trust_score=round(max_trust_score, 2),
                min_trust_score=round(min_trust_score, 2)
            )
            
            return results
            
        except Exception as e:
            logger.error(
                "Error in batch Trust Score calculation",
                error=str(e),
                error_type=type(e).__name__
            )
            
            # Return error results for all wallets
            return {
                wallet: TrustScoreResult(
                    wallet_address=wallet,
                    trust_score=0,
                    eligibility_status=EligibilityStatus.CALCULATION_ERROR,
                    eligibility_reason=f"Batch calculation failed: {str(e)}",
                    calculation_timestamp=datetime.now(timezone.utc)
                )
                for wallet in wallet_trades.keys()
            }
    
    async def get_trust_score_leaderboard(
        self,
        wallet_trades: Dict[str, List[RaydiumSwap]],
        limit: int = 100,
        min_trust_score: float = 0.0,
        end_date: Optional[datetime] = None
    ) -> Dict[str, any]:
        """
        Generate XORJ Trust Score leaderboard with rankings and statistics
        
        Args:
            wallet_trades: Dict mapping wallet addresses to their trades
            limit: Maximum number of wallets to return
            min_trust_score: Minimum Trust Score threshold
            end_date: End date for calculation period
            
        Returns:
            Leaderboard data with rankings and statistics
        """
        logger.info(
            "Generating Trust Score leaderboard",
            wallet_count=len(wallet_trades),
            limit=limit,
            min_trust_score=min_trust_score
        )
        
        # Calculate Trust Scores for all wallets
        trust_score_results = await self.calculate_batch_trust_scores(wallet_trades, end_date)
        
        # Filter eligible wallets and apply minimum score threshold
        eligible_results = [
            (wallet, result) for wallet, result in trust_score_results.items()
            if result.eligibility_status == EligibilityStatus.ELIGIBLE 
            and float(result.trust_score) >= min_trust_score
        ]
        
        # Sort by Trust Score (descending)
        eligible_results.sort(key=lambda x: x[1].trust_score, reverse=True)
        
        # Apply limit
        top_results = eligible_results[:limit]
        
        # Build leaderboard entries
        leaderboard_entries = []
        for rank, (wallet, result) in enumerate(top_results, 1):
            entry = {
                "rank": rank,
                "wallet_address": wallet,
                "trust_score": round(float(result.trust_score), 2),
                "performance_breakdown": {
                    "performance_score": round(float(result.performance_score), 4) if result.performance_score else None,
                    "risk_penalty": round(float(result.risk_penalty), 4) if result.risk_penalty else None,
                },
                "original_metrics": {
                    "net_roi_percent": round(float(result.original_metrics.net_roi_percent), 2) if result.original_metrics else None,
                    "sharpe_ratio": round(float(result.original_metrics.sharpe_ratio), 3) if result.original_metrics else None,
                    "maximum_drawdown_percent": round(float(result.original_metrics.maximum_drawdown_percent), 2) if result.original_metrics else None,
                    "total_trades": result.original_metrics.total_trades if result.original_metrics else None,
                    "win_loss_ratio": round(float(result.original_metrics.win_loss_ratio), 2) if result.original_metrics else None
                } if result.original_metrics else None
            }
            leaderboard_entries.append(entry)
        
        # Calculate statistics
        all_trust_scores = [float(result.trust_score) for _, result in eligible_results]
        
        statistics = {
            "total_wallets_analyzed": len(wallet_trades),
            "eligible_wallets": len(eligible_results),
            "wallets_above_threshold": len(all_trust_scores),
            "eligibility_rate": f"{len(eligible_results)/len(wallet_trades):.2%}" if wallet_trades else "0%",
            "trust_score_stats": {
                "average": round(sum(all_trust_scores) / len(all_trust_scores), 2) if all_trust_scores else 0,
                "median": round(sorted(all_trust_scores)[len(all_trust_scores)//2], 2) if all_trust_scores else 0,
                "maximum": round(max(all_trust_scores), 2) if all_trust_scores else 0,
                "minimum": round(min(all_trust_scores), 2) if all_trust_scores else 0,
                "std_deviation": round(
                    (sum((x - sum(all_trust_scores)/len(all_trust_scores))**2 for x in all_trust_scores) / len(all_trust_scores))**0.5, 2
                ) if len(all_trust_scores) > 1 else 0
            }
        }
        
        # Eligibility breakdown
        eligibility_breakdown = {}
        for result in trust_score_results.values():
            status = result.eligibility_status.value
            eligibility_breakdown[status] = eligibility_breakdown.get(status, 0) + 1
        
        leaderboard = {
            "leaderboard": leaderboard_entries,
            "statistics": statistics,
            "eligibility_breakdown": eligibility_breakdown,
            "calculation_parameters": {
                "analysis_period": {
                    "start_date": (end_date - timedelta(days=settings.metrics_rolling_period_days)).isoformat() if end_date else None,
                    "end_date": end_date.isoformat() if end_date else datetime.now(timezone.utc).isoformat(),
                    "period_days": settings.metrics_rolling_period_days
                },
                "eligibility_criteria": {
                    "min_trading_days": 90,
                    "min_total_trades": 50,
                    "max_single_day_roi_spike": "50%"
                },
                "scoring_weights": {
                    "sharpe_weight": "40%",
                    "roi_weight": "25%",
                    "drawdown_penalty_weight": "35%"
                }
            },
            "generation_timestamp": datetime.now(timezone.utc).isoformat()
        }
        
        logger.info(
            "Trust Score leaderboard generated",
            total_analyzed=len(wallet_trades),
            eligible_count=len(eligible_results),
            leaderboard_size=len(leaderboard_entries),
            avg_score=statistics["trust_score_stats"]["average"]
        )
        
        return leaderboard
    
    async def get_scoring_health(self) -> Dict[str, any]:
        """
        Get health status of scoring components
        
        Returns:
            Health status of scoring engine and dependencies
        """
        health_status = {
            "scoring_service": "healthy",
            "scoring_engine": "unknown",
            "calculation_service": "unknown",
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        
        try:
            # Check scoring engine
            if self.scoring_engine:
                health_status["scoring_engine"] = {
                    "status": "healthy",
                    "eligibility_criteria": {
                        "min_trading_days": 90,
                        "min_total_trades": 50,
                        "max_single_day_roi_spike": "50%"
                    },
                    "scoring_weights": {
                        "sharpe_weight": "40%",
                        "roi_weight": "25%",
                        "drawdown_penalty_weight": "35%"
                    }
                }
            else:
                health_status["scoring_engine"] = {"status": "not_initialized"}
            
            # Check calculation service dependency
            if self.calculation_service:
                calc_health = await self.calculation_service.get_calculation_health()
                health_status["calculation_service"] = calc_health["calculation_service"]
            else:
                health_status["calculation_service"] = {"status": "not_initialized"}
                
        except Exception as e:
            logger.error(
                "Error checking scoring service health",
                error=str(e)
            )
            health_status["scoring_service"] = "degraded"
            health_status["error"] = str(e)
        
        return health_status
    
    async def close(self):
        """Close scoring service and cleanup resources"""
        logger.info("Closing scoring service")
        
        # Scoring engine doesn't have persistent connections to close
        self.scoring_engine = None
        self.calculation_service = None
        
        logger.info("Scoring service closed")


# Global service instance
_scoring_service: Optional[ScoringService] = None


async def get_scoring_service() -> ScoringService:
    """Get global scoring service instance"""
    global _scoring_service
    
    if _scoring_service is None:
        _scoring_service = ScoringService()
        await _scoring_service.initialize()
    
    return _scoring_service


async def close_scoring_service():
    """Close global scoring service"""
    global _scoring_service
    
    if _scoring_service:
        await _scoring_service.close()
        _scoring_service = None