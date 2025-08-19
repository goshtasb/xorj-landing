"""
XORJ Quantitative Engine - Calculation Service
Integrated calculation service that orchestrates USD valuation and performance metrics
"""

import asyncio
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional, Tuple
from dataclasses import asdict

from ..schemas.ingestion import RaydiumSwap
from ..core.config import get_settings
from ..core.logging import get_calculation_logger
from .metrics import get_performance_calculator, PerformanceMetrics, TradeRecord
from .price_feed import get_price_feed, close_price_feed

settings = get_settings()
logger = get_calculation_logger()


class CalculationService:
    """
    Integrated calculation service for FR-2: Calculation Module
    Orchestrates USD valuation and performance metrics calculation
    """
    
    def __init__(self):
        self.calculator = None
        self.price_feed = None
        logger.info("Initialized calculation service")
    
    async def initialize(self):
        """Initialize async dependencies"""
        self.calculator = await get_performance_calculator()
        self.price_feed = await get_price_feed()
        logger.info("Calculation service fully initialized")
    
    async def calculate_wallet_performance(
        self,
        wallet_address: str,
        trades: List[RaydiumSwap],
        end_date: Optional[datetime] = None
    ) -> Optional[PerformanceMetrics]:
        """
        Calculate comprehensive performance metrics for a wallet
        
        Args:
            wallet_address: Wallet address to analyze
            trades: List of Raydium swap transactions
            end_date: End date for rolling period (defaults to now)
            
        Returns:
            Complete performance metrics or None if calculation fails
        """
        if not self.calculator:
            await self.initialize()
        
        logger.info(
            "Starting wallet performance calculation",
            wallet=wallet_address,
            trade_count=len(trades),
            end_date=end_date.isoformat() if end_date else "current"
        )
        
        try:
            metrics = await self.calculator.calculate_performance_metrics(
                wallet_address,
                trades,
                end_date
            )
            
            if metrics:
                logger.info(
                    "Successfully calculated wallet performance",
                    wallet=wallet_address,
                    total_trades=metrics.total_trades,
                    net_roi_percent=str(metrics.net_roi_percent),
                    sharpe_ratio=str(metrics.sharpe_ratio),
                    max_drawdown_percent=str(metrics.maximum_drawdown_percent)
                )
            else:
                logger.warning(
                    "Failed to calculate wallet performance",
                    wallet=wallet_address,
                    reason="insufficient_data_or_calculation_error"
                )
            
            return metrics
            
        except Exception as e:
            logger.error(
                "Error calculating wallet performance",
                wallet=wallet_address,
                error=str(e),
                error_type=type(e).__name__
            )
            return None
    
    async def calculate_batch_wallet_performance(
        self,
        wallet_trades: Dict[str, List[RaydiumSwap]],
        end_date: Optional[datetime] = None
    ) -> Dict[str, Optional[PerformanceMetrics]]:
        """
        Calculate performance metrics for multiple wallets efficiently
        
        Args:
            wallet_trades: Dict mapping wallet addresses to their trades
            end_date: End date for rolling period
            
        Returns:
            Dict mapping wallet addresses to their performance metrics
        """
        if not self.calculator:
            await self.initialize()
        
        logger.info(
            "Starting batch wallet performance calculation",
            wallet_count=len(wallet_trades),
            total_trades=sum(len(trades) for trades in wallet_trades.values())
        )
        
        try:
            results = await self.calculator.calculate_batch_metrics(
                wallet_trades,
                end_date
            )
            
            successful_count = sum(1 for metrics in results.values() if metrics is not None)
            
            logger.info(
                "Completed batch wallet performance calculation",
                total_wallets=len(wallet_trades),
                successful_calculations=successful_count,
                success_rate=f"{successful_count/len(wallet_trades):.2%}" if wallet_trades else "0%"
            )
            
            return results
            
        except Exception as e:
            logger.error(
                "Error in batch wallet performance calculation",
                error=str(e),
                error_type=type(e).__name__
            )
            return {wallet: None for wallet in wallet_trades.keys()}
    
    async def calculate_trade_usd_values(
        self,
        trades: List[RaydiumSwap]
    ) -> List[TradeRecord]:
        """
        Calculate USD values for a list of trades at their execution times
        
        Args:
            trades: List of Raydium swap transactions
            
        Returns:
            List of TradeRecord objects with USD valuations
        """
        if not self.calculator:
            await self.initialize()
        
        logger.info(
            "Calculating USD values for trades",
            trade_count=len(trades)
        )
        
        trade_records = []
        
        for trade in trades:
            try:
                trade_record = await self.calculator.calculate_trade_usd_values(trade)
                if trade_record:
                    trade_records.append(trade_record)
                else:
                    logger.warning(
                        "Failed to calculate USD values for trade",
                        signature=trade.signature,
                        timestamp=trade.block_time.isoformat()
                    )
            except Exception as e:
                logger.error(
                    "Error calculating trade USD values",
                    signature=trade.signature,
                    error=str(e)
                )
        
        success_rate = len(trade_records) / len(trades) if trades else 0
        
        logger.info(
            "Completed USD value calculations",
            input_trades=len(trades),
            successful_calculations=len(trade_records),
            success_rate=f"{success_rate:.2%}"
        )
        
        return trade_records
    
    async def get_portfolio_summary(
        self,
        wallet_addresses: List[str],
        wallet_trades: Dict[str, List[RaydiumSwap]],
        end_date: Optional[datetime] = None
    ) -> Dict[str, any]:
        """
        Generate comprehensive portfolio summary across multiple wallets
        
        Args:
            wallet_addresses: List of wallet addresses to analyze
            wallet_trades: Dict mapping wallet addresses to their trades
            end_date: End date for analysis period
            
        Returns:
            Comprehensive portfolio summary
        """
        logger.info(
            "Generating portfolio summary",
            wallet_count=len(wallet_addresses),
            end_date=end_date.isoformat() if end_date else "current"
        )
        
        # Calculate metrics for all wallets
        wallet_metrics = await self.calculate_batch_wallet_performance(
            wallet_trades,
            end_date
        )
        
        # Aggregate portfolio statistics
        total_trades = 0
        total_volume = 0
        total_profit = 0
        total_fees = 0
        successful_wallets = 0
        
        wallet_summaries = {}
        
        for wallet_address in wallet_addresses:
            metrics = wallet_metrics.get(wallet_address)
            
            if metrics:
                successful_wallets += 1
                total_trades += metrics.total_trades
                total_volume += float(metrics.total_volume_usd)
                total_profit += float(metrics.total_profit_usd)
                total_fees += float(metrics.total_fees_usd)
                
                wallet_summaries[wallet_address] = {
                    "metrics": asdict(metrics),
                    "status": "success"
                }
            else:
                wallet_summaries[wallet_address] = {
                    "metrics": None,
                    "status": "failed"
                }
        
        # Calculate portfolio-level metrics
        portfolio_roi = (total_profit / total_volume * 100) if total_volume > 0 else 0
        average_trade_size = total_volume / total_trades if total_trades > 0 else 0
        
        portfolio_summary = {
            "analysis_period": {
                "start_date": (end_date - timedelta(days=settings.metrics_rolling_period_days)).isoformat() if end_date else None,
                "end_date": end_date.isoformat() if end_date else datetime.now(timezone.utc).isoformat(),
                "period_days": settings.metrics_rolling_period_days
            },
            "portfolio_metrics": {
                "total_wallets": len(wallet_addresses),
                "successful_calculations": successful_wallets,
                "success_rate": f"{successful_wallets/len(wallet_addresses):.2%}" if wallet_addresses else "0%",
                "total_trades": total_trades,
                "total_volume_usd": round(total_volume, 2),
                "total_profit_usd": round(total_profit, 2),
                "total_fees_usd": round(total_fees, 2),
                "portfolio_roi_percent": round(portfolio_roi, 2),
                "average_trade_size_usd": round(average_trade_size, 2)
            },
            "wallet_summaries": wallet_summaries,
            "calculation_timestamp": datetime.now(timezone.utc).isoformat()
        }
        
        logger.info(
            "Generated portfolio summary",
            total_wallets=len(wallet_addresses),
            successful_wallets=successful_wallets,
            total_trades=total_trades,
            portfolio_roi_percent=round(portfolio_roi, 2)
        )
        
        return portfolio_summary
    
    async def get_calculation_health(self) -> Dict[str, any]:
        """
        Get health status of calculation components
        
        Returns:
            Health status of price feed and calculator components
        """
        health_status = {
            "calculation_service": "healthy",
            "price_feed": "unknown",
            "calculator": "unknown",
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        
        try:
            # Check price feed
            if self.price_feed:
                stats = await self.price_feed.get_price_statistics()
                health_status["price_feed"] = {
                    "status": "healthy",
                    "statistics": stats
                }
            else:
                health_status["price_feed"] = {"status": "not_initialized"}
            
            # Check calculator
            if self.calculator:
                health_status["calculator"] = {"status": "healthy"}
            else:
                health_status["calculator"] = {"status": "not_initialized"}
                
        except Exception as e:
            logger.error(
                "Error checking calculation health",
                error=str(e)
            )
            health_status["calculation_service"] = "degraded"
            health_status["error"] = str(e)
        
        return health_status
    
    async def close(self):
        """Close calculation service and cleanup resources"""
        logger.info("Closing calculation service")
        
        if self.price_feed:
            await close_price_feed()
        
        self.calculator = None
        self.price_feed = None
        
        logger.info("Calculation service closed")


# Global service instance
_calculation_service: Optional[CalculationService] = None


async def get_calculation_service() -> CalculationService:
    """Get global calculation service instance"""
    global _calculation_service
    
    if _calculation_service is None:
        _calculation_service = CalculationService()
        await _calculation_service.initialize()
    
    return _calculation_service


async def close_calculation_service():
    """Close global calculation service"""
    global _calculation_service
    
    if _calculation_service:
        await _calculation_service.close()
        _calculation_service = None