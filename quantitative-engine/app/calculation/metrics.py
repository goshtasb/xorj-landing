"""
XORJ Quantitative Engine - Performance Metrics Calculation
Calculates key financial metrics using high-precision decimal arithmetic
"""

import asyncio
from datetime import datetime, timezone, timedelta
from decimal import Decimal, getcontext, ROUND_HALF_UP
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass
from enum import Enum
import statistics

from ..schemas.ingestion import RaydiumSwap, TokenBalance
from ..core.config import get_settings
from ..core.logging import get_calculation_logger
from .price_feed import get_price_feed, PricePoint

# Set high precision for all decimal calculations
getcontext().prec = 28

settings = get_settings()
logger = get_calculation_logger()


class TradeType(Enum):
    """Trade type classification"""
    BUY = "buy"
    SELL = "sell"
    SWAP = "swap"


@dataclass
class TradeRecord:
    """High-precision trade record with USD valuations"""
    timestamp: datetime
    signature: str
    trade_type: TradeType
    token_in: TokenBalance
    token_out: TokenBalance
    token_in_usd: Decimal
    token_out_usd: Decimal
    net_usd_change: Decimal  # token_out_usd - token_in_usd (excluding fees)
    fee_usd: Decimal
    total_cost_usd: Decimal  # token_in_usd + fee_usd
    net_profit_usd: Decimal  # net_usd_change - fee_usd
    
    def __post_init__(self):
        """Ensure all USD values are high-precision Decimals"""
        for field_name in ['token_in_usd', 'token_out_usd', 'net_usd_change', 'fee_usd', 'total_cost_usd', 'net_profit_usd']:
            value = getattr(self, field_name)
            if not isinstance(value, Decimal):
                setattr(self, field_name, Decimal(str(value)))


@dataclass
class PerformanceMetrics:
    """Comprehensive performance metrics over rolling period"""
    period_start: datetime
    period_end: datetime
    total_trades: int
    
    # Core metrics as required by FR-2
    net_roi_percent: Decimal
    maximum_drawdown_percent: Decimal
    sharpe_ratio: Decimal
    win_loss_ratio: Decimal
    
    # Supporting metrics for analysis
    total_volume_usd: Decimal
    total_fees_usd: Decimal
    total_profit_usd: Decimal
    winning_trades: int
    losing_trades: int
    average_trade_size_usd: Decimal
    largest_win_usd: Decimal
    largest_loss_usd: Decimal
    average_holding_period_hours: Decimal
    
    def __post_init__(self):
        """Ensure all Decimal fields are properly typed"""
        decimal_fields = [
            'net_roi_percent', 'maximum_drawdown_percent', 'sharpe_ratio', 'win_loss_ratio',
            'total_volume_usd', 'total_fees_usd', 'total_profit_usd', 'average_trade_size_usd',
            'largest_win_usd', 'largest_loss_usd', 'average_holding_period_hours'
        ]
        
        for field_name in decimal_fields:
            value = getattr(self, field_name)
            if not isinstance(value, Decimal):
                setattr(self, field_name, Decimal(str(value)))


class PerformanceCalculator:
    """
    High-precision performance metrics calculator
    Implements the five required metrics over rolling 90-day periods
    """
    
    def __init__(self):
        self.price_feed = None
        self.rolling_period_days = settings.metrics_rolling_period_days
        
        logger.info(
            "Initialized performance calculator",
            rolling_period_days=self.rolling_period_days,
            precision_digits=getcontext().prec
        )
    
    async def initialize(self):
        """Initialize async dependencies"""
        self.price_feed = await get_price_feed()
        logger.debug("Performance calculator initialized with price feed")
    
    async def calculate_trade_usd_values(
        self, 
        swap: RaydiumSwap
    ) -> Optional[TradeRecord]:
        """
        Calculate USD values for a trade at execution time
        
        Args:
            swap: Validated Raydium swap transaction
            
        Returns:
            TradeRecord with accurate USD valuations
        """
        if not self.price_feed:
            await self.initialize()
        
        logger.debug(
            "Calculating USD values for trade",
            signature=swap.signature,
            timestamp=swap.block_time.isoformat()
        )
        
        # Get historical prices at execution time
        token_in_price = await self.price_feed.get_historical_price(
            swap.token_in.mint,
            swap.block_time,
            swap.token_in.symbol
        )
        
        token_out_price = await self.price_feed.get_historical_price(
            swap.token_out.mint,
            swap.block_time,
            swap.token_out.symbol
        )
        
        if not token_in_price or not token_out_price:
            logger.warning(
                "Missing price data for trade",
                signature=swap.signature,
                token_in_missing=token_in_price is None,
                token_out_missing=token_out_price is None
            )
            return None
        
        # Calculate USD values with high precision
        token_in_amount = Decimal(str(swap.token_in.amount))
        token_out_amount = Decimal(str(swap.token_out.amount))
        
        token_in_usd = token_in_amount * token_in_price.price_usd
        token_out_usd = token_out_amount * token_out_price.price_usd
        
        # Calculate fee in USD (assuming fee is in SOL)
        fee_lamports = Decimal(str(swap.fee_lamports or 0))
        fee_sol = fee_lamports / Decimal('1000000000')  # Convert lamports to SOL
        
        # Get SOL price for fee calculation
        sol_mint = settings.supported_tokens.get('SOL', 'So11111111111111111111111111111111111111112')
        sol_price = await self.price_feed.get_historical_price(
            sol_mint,
            swap.block_time,
            'SOL'
        )
        
        fee_usd = fee_sol * (sol_price.price_usd if sol_price else Decimal('0'))
        
        # Determine trade type
        trade_type = self._classify_trade_type(swap)
        
        # Calculate metrics
        net_usd_change = token_out_usd - token_in_usd
        total_cost_usd = token_in_usd + fee_usd
        net_profit_usd = net_usd_change - fee_usd
        
        trade_record = TradeRecord(
            timestamp=swap.block_time,
            signature=swap.signature,
            trade_type=trade_type,
            token_in=swap.token_in,
            token_out=swap.token_out,
            token_in_usd=token_in_usd,
            token_out_usd=token_out_usd,
            net_usd_change=net_usd_change,
            fee_usd=fee_usd,
            total_cost_usd=total_cost_usd,
            net_profit_usd=net_profit_usd
        )
        
        logger.debug(
            "Calculated trade USD values",
            signature=swap.signature,
            token_in_usd=str(token_in_usd),
            token_out_usd=str(token_out_usd),
            net_profit_usd=str(net_profit_usd),
            fee_usd=str(fee_usd)
        )
        
        return trade_record
    
    def _classify_trade_type(self, swap: RaydiumSwap) -> TradeType:
        """Classify trade type based on token symbols"""
        # Simple classification logic - can be enhanced
        if swap.token_in.symbol in ['USDC', 'USDT']:
            return TradeType.BUY
        elif swap.token_out.symbol in ['USDC', 'USDT']:
            return TradeType.SELL
        else:
            return TradeType.SWAP
    
    async def calculate_performance_metrics(
        self,
        wallet_address: str,
        trades: List[RaydiumSwap],
        end_date: Optional[datetime] = None
    ) -> Optional[PerformanceMetrics]:
        """
        Calculate comprehensive performance metrics over rolling 90-day period
        
        Args:
            wallet_address: Wallet address being analyzed
            trades: List of Raydium swaps for the wallet
            end_date: End date for calculation period (defaults to now)
            
        Returns:
            PerformanceMetrics with the five required metrics
        """
        if not trades:
            logger.warning("No trades provided for metrics calculation", wallet=wallet_address)
            return None
        
        # Determine calculation period
        if not end_date:
            end_date = datetime.now(timezone.utc)
        
        start_date = end_date - timedelta(days=self.rolling_period_days)
        
        # Filter trades to rolling period
        period_trades = [
            trade for trade in trades
            if start_date <= trade.block_time <= end_date
        ]
        
        if not period_trades:
            logger.warning(
                "No trades in rolling period",
                wallet=wallet_address,
                start_date=start_date.isoformat(),
                end_date=end_date.isoformat()
            )
            return None
        
        logger.info(
            "Calculating performance metrics",
            wallet=wallet_address,
            total_trades=len(period_trades),
            period_start=start_date.isoformat(),
            period_end=end_date.isoformat()
        )
        
        # Convert swaps to trade records with USD values
        trade_records = []
        for swap in period_trades:
            trade_record = await self.calculate_trade_usd_values(swap)
            if trade_record:
                trade_records.append(trade_record)
        
        if not trade_records:
            logger.error("Failed to calculate USD values for any trades", wallet=wallet_address)
            return None
        
        # Calculate the five required metrics
        metrics = await self._calculate_core_metrics(trade_records, start_date, end_date)
        
        logger.info(
            "Completed performance metrics calculation",
            wallet=wallet_address,
            processed_trades=len(trade_records),
            net_roi_percent=str(metrics.net_roi_percent),
            sharpe_ratio=str(metrics.sharpe_ratio),
            max_drawdown_percent=str(metrics.maximum_drawdown_percent)
        )
        
        return metrics
    
    async def _calculate_core_metrics(
        self,
        trades: List[TradeRecord],
        start_date: datetime,
        end_date: datetime
    ) -> PerformanceMetrics:
        """Calculate the five core metrics with high precision"""
        
        # Sort trades by timestamp
        trades.sort(key=lambda t: t.timestamp)
        
        # Basic trade statistics
        total_trades = len(trades)
        total_volume_usd = sum(trade.token_in_usd for trade in trades)
        total_fees_usd = sum(trade.fee_usd for trade in trades)
        total_profit_usd = sum(trade.net_profit_usd for trade in trades)
        
        # Win/Loss analysis
        winning_trades = [t for t in trades if t.net_profit_usd > 0]
        losing_trades = [t for t in trades if t.net_profit_usd < 0]
        
        # 1. Net ROI (%) = (Total Profit / Total Investment) * 100
        initial_capital = total_volume_usd  # Simplified assumption
        net_roi_percent = (total_profit_usd / initial_capital * 100) if initial_capital > 0 else Decimal('0')
        
        # 2. Maximum Drawdown (%) - Peak-to-trough decline
        maximum_drawdown_percent = self._calculate_maximum_drawdown(trades)
        
        # 3. Sharpe Ratio = (Return - Risk-free rate) / Standard deviation of returns
        sharpe_ratio = self._calculate_sharpe_ratio(trades)
        
        # 4. Win/Loss Ratio = Number of winning trades / Number of losing trades
        win_loss_ratio = (
            Decimal(str(len(winning_trades))) / Decimal(str(len(losing_trades)))
            if losing_trades else Decimal('99999')  # Infinite if no losses
        )
        
        # Supporting metrics
        average_trade_size_usd = total_volume_usd / Decimal(str(total_trades))
        largest_win_usd = max((t.net_profit_usd for t in winning_trades), default=Decimal('0'))
        largest_loss_usd = min((t.net_profit_usd for t in losing_trades), default=Decimal('0'))
        
        # Average holding period (simplified - time between consecutive trades)
        if len(trades) > 1:
            time_diffs = [
                (trades[i+1].timestamp - trades[i].timestamp).total_seconds() / 3600
                for i in range(len(trades) - 1)
            ]
            average_holding_period_hours = Decimal(str(statistics.mean(time_diffs))) if time_diffs else Decimal('0')
        else:
            average_holding_period_hours = Decimal('0')
        
        return PerformanceMetrics(
            period_start=start_date,
            period_end=end_date,
            total_trades=total_trades,
            net_roi_percent=net_roi_percent.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP),
            maximum_drawdown_percent=maximum_drawdown_percent.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP),
            sharpe_ratio=sharpe_ratio.quantize(Decimal('0.001'), rounding=ROUND_HALF_UP),
            win_loss_ratio=win_loss_ratio.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP),
            total_trades=total_trades,
            total_volume_usd=total_volume_usd.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP),
            total_fees_usd=total_fees_usd.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP),
            total_profit_usd=total_profit_usd.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP),
            winning_trades=len(winning_trades),
            losing_trades=len(losing_trades),
            average_trade_size_usd=average_trade_size_usd.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP),
            largest_win_usd=largest_win_usd.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP),
            largest_loss_usd=largest_loss_usd.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP),
            average_holding_period_hours=average_holding_period_hours.quantize(Decimal('0.1'), rounding=ROUND_HALF_UP)
        )
    
    def _calculate_maximum_drawdown(self, trades: List[TradeRecord]) -> Decimal:
        """
        Calculate maximum drawdown as peak-to-trough decline
        
        Returns:
            Maximum drawdown as percentage (positive number)
        """
        if not trades:
            return Decimal('0')
        
        # Calculate cumulative profit curve
        cumulative_profits = []
        running_total = Decimal('0')
        
        for trade in trades:
            running_total += trade.net_profit_usd
            cumulative_profits.append(running_total)
        
        # Find maximum drawdown
        peak = cumulative_profits[0]
        max_drawdown = Decimal('0')
        
        for profit in cumulative_profits:
            if profit > peak:
                peak = profit
            
            drawdown = peak - profit
            if drawdown > max_drawdown:
                max_drawdown = drawdown
        
        # Convert to percentage of peak (avoid division by zero)
        if peak > 0:
            max_drawdown_percent = (max_drawdown / peak) * 100
        else:
            max_drawdown_percent = Decimal('0')
        
        return max_drawdown_percent
    
    def _calculate_sharpe_ratio(self, trades: List[TradeRecord]) -> Decimal:
        """
        Calculate Sharpe ratio using trade returns
        
        Returns:
            Sharpe ratio (higher is better)
        """
        if len(trades) < 2:
            return Decimal('0')
        
        # Calculate daily returns based on trade profits
        returns = [float(trade.net_profit_usd) for trade in trades]
        
        if not returns:
            return Decimal('0')
        
        # Calculate average return and standard deviation
        mean_return = statistics.mean(returns)
        
        if len(returns) < 2:
            return Decimal('0')
        
        try:
            std_dev = statistics.stdev(returns)
        except statistics.StatisticsError:
            return Decimal('0')
        
        # Risk-free rate (assume 0 for simplicity)
        risk_free_rate = 0.0
        
        # Calculate Sharpe ratio
        if std_dev > 0:
            sharpe_ratio = (mean_return - risk_free_rate) / std_dev
        else:
            sharpe_ratio = 0.0
        
        return Decimal(str(sharpe_ratio))
    
    async def calculate_batch_metrics(
        self,
        wallet_trades: Dict[str, List[RaydiumSwap]],
        end_date: Optional[datetime] = None
    ) -> Dict[str, Optional[PerformanceMetrics]]:
        """
        Calculate performance metrics for multiple wallets efficiently
        
        Args:
            wallet_trades: Dict mapping wallet addresses to their trades
            end_date: End date for calculation period
            
        Returns:
            Dict mapping wallet addresses to their performance metrics
        """
        logger.info(
            "Calculating batch performance metrics",
            wallet_count=len(wallet_trades),
            end_date=end_date.isoformat() if end_date else "current"
        )
        
        results = {}
        
        # Process wallets with controlled concurrency
        semaphore = asyncio.Semaphore(3)  # Max 3 concurrent calculations
        
        async def calculate_wallet_metrics(wallet_address: str, trades: List[RaydiumSwap]):
            async with semaphore:
                try:
                    metrics = await self.calculate_performance_metrics(
                        wallet_address, trades, end_date
                    )
                    return wallet_address, metrics
                except Exception as e:
                    logger.error(
                        "Failed to calculate metrics for wallet",
                        wallet=wallet_address,
                        error=str(e),
                        error_type=type(e).__name__
                    )
                    return wallet_address, None
        
        # Execute all calculations
        tasks = [
            calculate_wallet_metrics(wallet, trades)
            for wallet, trades in wallet_trades.items()
        ]
        
        batch_results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Process results
        successful_calculations = 0
        for result in batch_results:
            if isinstance(result, Exception):
                logger.error("Batch metrics calculation exception", error=str(result))
                continue
            
            wallet_address, metrics = result
            results[wallet_address] = metrics
            
            if metrics is not None:
                successful_calculations += 1
        
        logger.info(
            "Completed batch metrics calculation",
            total_wallets=len(wallet_trades),
            successful=successful_calculations,
            success_rate=f"{successful_calculations/len(wallet_trades):.2%}" if wallet_trades else "0%"
        )
        
        return results


# Global calculator instance
_calculator_instance: Optional[PerformanceCalculator] = None


async def get_performance_calculator() -> PerformanceCalculator:
    """Get global performance calculator instance"""
    global _calculator_instance
    
    if _calculator_instance is None:
        _calculator_instance = PerformanceCalculator()
        await _calculator_instance.initialize()
    
    return _calculator_instance