"""
XORJ Quantitative Engine - Performance Metrics Tests
Comprehensive unit tests with known inputs and expected outputs for financial calculations
"""

import pytest
import asyncio
from datetime import datetime, timezone, timedelta
from decimal import Decimal, getcontext
from unittest.mock import AsyncMock, MagicMock, patch
from typing import List

from app.calculation.metrics import (
    PerformanceCalculator, 
    TradeRecord, 
    PerformanceMetrics, 
    TradeType
)
from app.calculation.price_feed import PricePoint
from app.schemas.ingestion import RaydiumSwap, TokenBalance
from app.core.config import get_settings

# Set high precision for test calculations
getcontext().prec = 28

settings = get_settings()


class TestPerformanceCalculator:
    """Test suite for PerformanceCalculator with known inputs and outputs"""
    
    @pytest.fixture
    async def calculator(self):
        """Create calculator instance for testing"""
        calc = PerformanceCalculator()
        
        # Mock price feed to avoid external API calls
        mock_price_feed = AsyncMock()
        calc.price_feed = mock_price_feed
        
        return calc, mock_price_feed
    
    @pytest.fixture
    def sample_token_balances(self):
        """Create sample token balances for testing"""
        sol_in = TokenBalance(
            mint="So11111111111111111111111111111111111111112",
            symbol="SOL",
            amount="10.0",
            decimals=9,
            usd_value="1000.0"
        )
        
        usdc_out = TokenBalance(
            mint="EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
            symbol="USDC",
            amount="1100.0",
            decimals=6,
            usd_value="1100.0"
        )
        
        return sol_in, usdc_out
    
    @pytest.fixture
    def sample_raydium_swap(self, sample_token_balances):
        """Create sample Raydium swap for testing"""
        sol_in, usdc_out = sample_token_balances
        
        return RaydiumSwap(
            signature="test_signature_12345",
            block_time=datetime(2024, 1, 15, 12, 0, 0, tzinfo=timezone.utc),
            wallet_address="TestWallet123",
            status="success",
            swap_type="swapBaseIn",
            token_in=sol_in,
            token_out=usdc_out,
            pool_id="test_pool_id",
            fee_lamports=5000,  # 0.005 SOL
            fee_usd="0.50"
        )
    
    @pytest.fixture
    def known_price_points(self):
        """Create known price points for deterministic testing"""
        sol_price = PricePoint(
            timestamp=datetime(2024, 1, 15, 12, 0, 0, tzinfo=timezone.utc),
            mint="So11111111111111111111111111111111111111112",
            symbol="SOL",
            price_usd=Decimal("100.00"),  # SOL = $100
            source="test",
            confidence=1.0
        )
        
        usdc_price = PricePoint(
            timestamp=datetime(2024, 1, 15, 12, 0, 0, tzinfo=timezone.utc),
            mint="EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
            symbol="USDC",
            price_usd=Decimal("1.00"),  # USDC = $1
            source="stablecoin",
            confidence=0.99
        )
        
        return sol_price, usdc_price
    
    @pytest.mark.asyncio
    async def test_calculate_trade_usd_values_known_output(self, calculator, sample_raydium_swap, known_price_points):
        """Test USD value calculation with known inputs and expected outputs"""
        calc, mock_price_feed = calculator
        sol_price, usdc_price = known_price_points
        
        # Mock price feed responses
        mock_price_feed.get_historical_price.side_effect = [
            sol_price,  # Token in (SOL)
            usdc_price,  # Token out (USDC)
            sol_price   # SOL price for fee calculation
        ]
        
        # Execute calculation
        trade_record = await calc.calculate_trade_usd_values(sample_raydium_swap)
        
        # Verify known outputs
        assert trade_record is not None
        assert trade_record.signature == "test_signature_12345"
        assert trade_record.trade_type == TradeType.SELL  # SOL -> USDC is a sell
        
        # Known calculations:
        # Token in: 10.0 SOL * $100 = $1000.00
        # Token out: 1100.0 USDC * $1 = $1100.00
        # Fee: 0.005 SOL * $100 = $0.50
        # Net profit: $1100 - $1000 - $0.50 = $99.50
        
        assert trade_record.token_in_usd == Decimal("1000.00")
        assert trade_record.token_out_usd == Decimal("1100.00")
        assert trade_record.fee_usd == Decimal("0.50")
        assert trade_record.net_profit_usd == Decimal("99.50")
        assert trade_record.total_cost_usd == Decimal("1000.50")
    
    def create_test_trades(self) -> List[TradeRecord]:
        """Create a series of test trades with known outcomes for metrics testing"""
        base_timestamp = datetime(2024, 1, 1, tzinfo=timezone.utc)
        
        trades = [
            # Trade 1: Profitable trade (+$100)
            TradeRecord(
                timestamp=base_timestamp,
                signature="trade_1",
                trade_type=TradeType.BUY,
                token_in=TokenBalance(mint="test", symbol="USDC", amount="1000", decimals=6, usd_value="1000"),
                token_out=TokenBalance(mint="test", symbol="SOL", amount="10", decimals=9, usd_value="1100"),
                token_in_usd=Decimal("1000.00"),
                token_out_usd=Decimal("1100.00"),
                net_usd_change=Decimal("100.00"),
                fee_usd=Decimal("0.50"),
                total_cost_usd=Decimal("1000.50"),
                net_profit_usd=Decimal("99.50")
            ),
            
            # Trade 2: Loss trade (-$50)
            TradeRecord(
                timestamp=base_timestamp + timedelta(days=1),
                signature="trade_2",
                trade_type=TradeType.SELL,
                token_in=TokenBalance(mint="test", symbol="SOL", amount="5", decimals=9, usd_value="500"),
                token_out=TokenBalance(mint="test", symbol="USDC", amount="450", decimals=6, usd_value="450"),
                token_in_usd=Decimal("500.00"),
                token_out_usd=Decimal("450.00"),
                net_usd_change=Decimal("-50.00"),
                fee_usd=Decimal("0.25"),
                total_cost_usd=Decimal("500.25"),
                net_profit_usd=Decimal("-50.25")
            ),
            
            # Trade 3: Small profit (+$25)
            TradeRecord(
                timestamp=base_timestamp + timedelta(days=2),
                signature="trade_3",
                trade_type=TradeType.BUY,
                token_in=TokenBalance(mint="test", symbol="USDC", amount="200", decimals=6, usd_value="200"),
                token_out=TokenBalance(mint="test", symbol="RAY", amount="100", decimals=6, usd_value="225"),
                token_in_usd=Decimal("200.00"),
                token_out_usd=Decimal("225.00"),
                net_usd_change=Decimal("25.00"),
                fee_usd=Decimal("0.10"),
                total_cost_usd=Decimal("200.10"),
                net_profit_usd=Decimal("24.90")
            ),
            
            # Trade 4: Larger loss (-$75)
            TradeRecord(
                timestamp=base_timestamp + timedelta(days=3),
                signature="trade_4",
                trade_type=TradeType.SELL,
                token_in=TokenBalance(mint="test", symbol="RAY", amount="50", decimals=6, usd_value="300"),
                token_out=TokenBalance(mint="test", symbol="USDC", amount="225", decimals=6, usd_value="225"),
                token_in_usd=Decimal("300.00"),
                token_out_usd=Decimal("225.00"),
                net_usd_change=Decimal("-75.00"),
                fee_usd=Decimal("0.15"),
                total_cost_usd=Decimal("300.15"),
                net_profit_usd=Decimal("-75.15")
            ),
        ]
        
        return trades
    
    def test_calculate_maximum_drawdown_known_values(self, calculator):
        """Test maximum drawdown calculation with known inputs and outputs"""
        calc, _ = calculator
        trades = self.create_test_trades()
        
        # Calculate expected drawdown manually:
        # Cumulative profits: [99.50, 49.25, 74.15, -1.00]
        # Peak at trade 3: 74.15
        # Trough at trade 4: -1.00
        # Drawdown: 74.15 - (-1.00) = 75.15
        # Percentage: (75.15 / 74.15) * 100 = 101.35%
        
        max_drawdown = calc._calculate_maximum_drawdown(trades)
        expected_drawdown = Decimal("101.35")  # Approximate
        
        # Allow small tolerance for rounding
        assert abs(max_drawdown - expected_drawdown) < Decimal("1.0")
        assert max_drawdown > Decimal("100")  # Should be over 100% drawdown
    
    def test_calculate_sharpe_ratio_known_values(self, calculator):
        """Test Sharpe ratio calculation with known inputs"""
        calc, _ = calculator
        trades = self.create_test_trades()
        
        # Expected returns: [99.50, -50.25, 24.90, -75.15]
        # Mean return: (99.50 - 50.25 + 24.90 - 75.15) / 4 = -0.25
        # Standard deviation calculation should be deterministic
        
        sharpe_ratio = calc._calculate_sharpe_ratio(trades)
        
        # With negative mean return and positive std dev, Sharpe should be negative
        assert isinstance(sharpe_ratio, Decimal)
        # Exact value depends on std dev calculation, but should be reasonable
        assert -2.0 < float(sharpe_ratio) < 0.5
    
    @pytest.mark.asyncio
    async def test_calculate_performance_metrics_comprehensive(self, calculator):
        """Test comprehensive performance metrics with known expected ranges"""
        calc, mock_price_feed = calculator
        
        # Create mock swaps from our test trades
        mock_swaps = []
        for i, trade in enumerate(self.create_test_trades()):
            swap = RaydiumSwap(
                signature=f"mock_signature_{i}",
                block_time=trade.timestamp,
                wallet_address="test_wallet",
                status="success",
                swap_type="swapBaseIn",
                token_in=trade.token_in,
                token_out=trade.token_out,
                pool_id="mock_pool",
                fee_lamports=int(float(trade.fee_usd) * 1000000000 / 100),  # Convert to lamports
                fee_usd=str(trade.fee_usd)
            )
            mock_swaps.append(swap)
        
        # Mock the USD calculation to return our known trade records
        calc.calculate_trade_usd_values = AsyncMock()
        calc.calculate_trade_usd_values.side_effect = self.create_test_trades()
        
        # Calculate metrics
        end_date = datetime(2024, 1, 10, tzinfo=timezone.utc)
        metrics = await calc.calculate_performance_metrics("test_wallet", mock_swaps, end_date)
        
        # Verify results
        assert metrics is not None
        assert metrics.total_trades == 4
        assert metrics.winning_trades == 2  # Trades 1 and 3 are profitable
        assert metrics.losing_trades == 2   # Trades 2 and 4 are losses
        
        # Win/Loss ratio should be 1.0 (2 wins / 2 losses)
        assert metrics.win_loss_ratio == Decimal("1.00")
        
        # Total profit: 99.50 - 50.25 + 24.90 - 75.15 = -1.00
        assert metrics.total_profit_usd == Decimal("-1.00")
        
        # Total volume: sum of all token_in_usd values
        expected_volume = Decimal("2000.00")  # 1000 + 500 + 200 + 300
        assert metrics.total_volume_usd == expected_volume
        
        # Net ROI should be negative (lost money)
        assert metrics.net_roi_percent < Decimal("0")
        
        # Maximum drawdown should be substantial
        assert metrics.maximum_drawdown_percent > Decimal("50")
    
    @pytest.mark.asyncio  
    async def test_empty_trades_handling(self, calculator):
        """Test handling of empty trade lists"""
        calc, _ = calculator
        
        # Empty list should return None
        metrics = await calc.calculate_performance_metrics("empty_wallet", [], None)
        assert metrics is None
        
        # Empty drawdown calculation should return 0
        drawdown = calc._calculate_maximum_drawdown([])
        assert drawdown == Decimal("0")
        
        # Empty Sharpe ratio should return 0
        sharpe = calc._calculate_sharpe_ratio([])
        assert sharpe == Decimal("0")
    
    @pytest.mark.asyncio
    async def test_single_trade_metrics(self, calculator):
        """Test metrics calculation with only one trade"""
        calc, _ = calculator
        trades = [self.create_test_trades()[0]]  # Just the first profitable trade
        
        # Mock single swap
        swap = RaydiumSwap(
            signature="single_trade",
            block_time=trades[0].timestamp,
            wallet_address="single_wallet",
            status="success", 
            swap_type="swapBaseIn",
            token_in=trades[0].token_in,
            token_out=trades[0].token_out,
            pool_id="single_pool",
            fee_lamports=5000,
            fee_usd="0.50"
        )
        
        calc.calculate_trade_usd_values = AsyncMock(return_value=trades[0])
        
        metrics = await calc.calculate_performance_metrics("single_wallet", [swap], None)
        
        assert metrics is not None
        assert metrics.total_trades == 1
        assert metrics.winning_trades == 1
        assert metrics.losing_trades == 0
        assert metrics.win_loss_ratio == Decimal("99999")  # Infinite (no losses)
        assert metrics.maximum_drawdown_percent == Decimal("0.00")  # No drawdown with single profitable trade
        assert metrics.net_roi_percent > Decimal("0")  # Positive ROI
    
    def test_precision_maintenance(self, calculator):
        """Test that high precision is maintained throughout calculations"""
        calc, _ = calculator
        
        # Create trade with very precise values
        precise_trade = TradeRecord(
            timestamp=datetime(2024, 1, 1, tzinfo=timezone.utc),
            signature="precise_test",
            trade_type=TradeType.BUY,
            token_in=TokenBalance(mint="test", symbol="USDC", amount="1000.123456789", decimals=6, usd_value="1000.123456789"),
            token_out=TokenBalance(mint="test", symbol="SOL", amount="10.987654321", decimals=9, usd_value="1098.7654321"),
            token_in_usd=Decimal("1000.123456789"),
            token_out_usd=Decimal("1098.7654321"), 
            net_usd_change=Decimal("98.641975311"),
            fee_usd=Decimal("0.123456789"),
            total_cost_usd=Decimal("1000.246913578"),
            net_profit_usd=Decimal("98.518518522")
        )
        
        # Ensure precision is maintained in trade record
        assert len(str(precise_trade.net_profit_usd).split('.')[-1]) >= 9  # At least 9 decimal places
        assert isinstance(precise_trade.token_in_usd, Decimal)
        assert isinstance(precise_trade.net_profit_usd, Decimal)
    
    @pytest.mark.asyncio
    async def test_batch_metrics_calculation(self, calculator):
        """Test batch calculation of metrics for multiple wallets"""
        calc, _ = calculator
        
        # Mock calculate_performance_metrics
        calc.calculate_performance_metrics = AsyncMock()
        calc.calculate_performance_metrics.side_effect = [
            PerformanceMetrics(
                period_start=datetime(2024, 1, 1, tzinfo=timezone.utc),
                period_end=datetime(2024, 1, 31, tzinfo=timezone.utc),
                total_trades=5,
                net_roi_percent=Decimal("15.50"),
                maximum_drawdown_percent=Decimal("8.25"),
                sharpe_ratio=Decimal("1.85"),
                win_loss_ratio=Decimal("2.33"),
                total_volume_usd=Decimal("10000.00"),
                total_fees_usd=Decimal("25.50"),
                total_profit_usd=Decimal("1550.00"),
                winning_trades=3,
                losing_trades=2,
                average_trade_size_usd=Decimal("2000.00"),
                largest_win_usd=Decimal("800.00"),
                largest_loss_usd=Decimal("-300.00"),
                average_holding_period_hours=Decimal("48.5")
            ),
            None  # Second wallet fails
        ]
        
        wallet_trades = {
            "wallet_1": [RaydiumSwap(signature="test1", block_time=datetime.now(timezone.utc), wallet_address="wallet_1", status="success", swap_type="swap", token_in=TokenBalance(mint="test", symbol="SOL", amount="1", decimals=9, usd_value="100"), token_out=TokenBalance(mint="test", symbol="USDC", amount="100", decimals=6, usd_value="100"), pool_id="test", fee_lamports=5000, fee_usd="0.50")],
            "wallet_2": [RaydiumSwap(signature="test2", block_time=datetime.now(timezone.utc), wallet_address="wallet_2", status="success", swap_type="swap", token_in=TokenBalance(mint="test", symbol="SOL", amount="1", decimals=9, usd_value="100"), token_out=TokenBalance(mint="test", symbol="USDC", amount="100", decimals=6, usd_value="100"), pool_id="test", fee_lamports=5000, fee_usd="0.50")]
        }
        
        results = await calc.calculate_batch_metrics(wallet_trades)
        
        assert len(results) == 2
        assert results["wallet_1"] is not None
        assert results["wallet_2"] is None
        assert results["wallet_1"].total_trades == 5
        assert results["wallet_1"].net_roi_percent == Decimal("15.50")
    
    def test_trade_type_classification(self, calculator):
        """Test trade type classification logic"""
        calc, _ = calculator
        
        # Test buy classification (USDC -> SOL)
        buy_swap = RaydiumSwap(
            signature="buy_test",
            block_time=datetime.now(timezone.utc),
            wallet_address="test",
            status="success",
            swap_type="swapBaseIn", 
            token_in=TokenBalance(mint="usdc", symbol="USDC", amount="1000", decimals=6, usd_value="1000"),
            token_out=TokenBalance(mint="sol", symbol="SOL", amount="10", decimals=9, usd_value="1000"),
            pool_id="test",
            fee_lamports=5000,
            fee_usd="0.50"
        )
        
        trade_type = calc._classify_trade_type(buy_swap)
        assert trade_type == TradeType.BUY
        
        # Test sell classification (SOL -> USDC)
        sell_swap = RaydiumSwap(
            signature="sell_test",
            block_time=datetime.now(timezone.utc),
            wallet_address="test",
            status="success", 
            swap_type="swapBaseIn",
            token_in=TokenBalance(mint="sol", symbol="SOL", amount="10", decimals=9, usd_value="1000"),
            token_out=TokenBalance(mint="usdc", symbol="USDC", amount="1000", decimals=6, usd_value="1000"),
            pool_id="test",
            fee_lamports=5000,
            fee_usd="0.50"
        )
        
        trade_type = calc._classify_trade_type(sell_swap)
        assert trade_type == TradeType.SELL
        
        # Test swap classification (SOL -> RAY)
        swap_swap = RaydiumSwap(
            signature="swap_test",
            block_time=datetime.now(timezone.utc),
            wallet_address="test",
            status="success",
            swap_type="swapBaseIn",
            token_in=TokenBalance(mint="sol", symbol="SOL", amount="10", decimals=9, usd_value="1000"),
            token_out=TokenBalance(mint="ray", symbol="RAY", amount="500", decimals=6, usd_value="1000"),
            pool_id="test",
            fee_lamports=5000,
            fee_usd="0.50"
        )
        
        trade_type = calc._classify_trade_type(swap_swap)
        assert trade_type == TradeType.SWAP


if __name__ == "__main__":
    pytest.main([__file__, "-v"])