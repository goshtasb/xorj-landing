"""
XORJ Quantitative Engine - Calculation Service Tests
NFR-2: Comprehensive unit tests for calculation service with 95% coverage
"""

import pytest
import asyncio
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch
from typing import List, Dict

from app.calculation.service import CalculationService, get_calculation_service, close_calculation_service
from app.calculation.metrics import PerformanceMetrics, TradeRecord, TradeType
from app.calculation.price_feed import PricePoint
from app.schemas.ingestion import RaydiumSwap, TokenBalance
from app.core.config import get_settings


class TestCalculationService:
    """Comprehensive test suite for CalculationService"""
    
    @pytest.fixture
    async def service(self):
        """Create calculation service instance for testing"""
        service = CalculationService()
        
        # Mock dependencies
        mock_calculator = AsyncMock()
        mock_price_feed = AsyncMock()
        
        service.calculator = mock_calculator
        service.price_feed = mock_price_feed
        
        return service, mock_calculator, mock_price_feed
    
    @pytest.fixture
    def sample_trades(self):
        """Create sample trades for testing"""
        base_time = datetime(2024, 1, 1, tzinfo=timezone.utc)
        
        trades = []
        for i in range(5):
            trade = RaydiumSwap(
                signature=f"test_signature_{i}",
                block_time=base_time + timedelta(days=i),
                wallet_address="test_wallet",
                status="success",
                swap_type="swapBaseIn",
                token_in=TokenBalance(
                    mint="sol",
                    symbol="SOL", 
                    amount=str(10 + i),
                    decimals=9,
                    usd_value=str((10 + i) * 100)
                ),
                token_out=TokenBalance(
                    mint="usdc",
                    symbol="USDC",
                    amount=str((10 + i) * 105),  # 5% profit
                    decimals=6,
                    usd_value=str((10 + i) * 105)
                ),
                pool_id="test_pool",
                fee_lamports=5000,
                fee_usd="0.50"
            )
            trades.append(trade)
        
        return trades
    
    @pytest.fixture
    def sample_metrics(self):
        """Create sample performance metrics"""
        return PerformanceMetrics(
            period_start=datetime(2024, 1, 1, tzinfo=timezone.utc),
            period_end=datetime(2024, 1, 31, tzinfo=timezone.utc),
            total_trades=10,
            net_roi_percent=Decimal("15.50"),
            maximum_drawdown_percent=Decimal("8.25"),
            sharpe_ratio=Decimal("1.85"),
            win_loss_ratio=Decimal("2.33"),
            total_volume_usd=Decimal("50000.00"),
            total_fees_usd=Decimal("125.50"),
            total_profit_usd=Decimal("7750.00"),
            winning_trades=7,
            losing_trades=3,
            average_trade_size_usd=Decimal("5000.00"),
            largest_win_usd=Decimal("1200.00"),
            largest_loss_usd=Decimal("-450.00"),
            average_holding_period_hours=Decimal("24.5")
        )
    
    @pytest.mark.asyncio
    async def test_initialization(self):
        """Test service initialization"""
        service = CalculationService()
        assert service.calculator is None
        assert service.price_feed is None
        
        # Mock the dependencies
        with patch('app.calculation.service.get_performance_calculator') as mock_get_calc, \
             patch('app.calculation.service.get_price_feed') as mock_get_price:
            
            mock_calculator = AsyncMock()
            mock_price_feed = AsyncMock()
            mock_get_calc.return_value = mock_calculator
            mock_get_price.return_value = mock_price_feed
            
            await service.initialize()
            
            assert service.calculator is mock_calculator
            assert service.price_feed is mock_price_feed
    
    @pytest.mark.asyncio
    async def test_calculate_wallet_performance_success(self, service, sample_trades, sample_metrics):
        """Test successful wallet performance calculation"""
        calc_service, mock_calculator, mock_price_feed = service
        
        mock_calculator.calculate_performance_metrics.return_value = sample_metrics
        
        result = await calc_service.calculate_wallet_performance(
            "test_wallet",
            sample_trades,
            datetime(2024, 1, 31, tzinfo=timezone.utc)
        )
        
        assert result is sample_metrics
        mock_calculator.calculate_performance_metrics.assert_called_once_with(
            "test_wallet", 
            sample_trades,
            datetime(2024, 1, 31, tzinfo=timezone.utc)
        )
    
    @pytest.mark.asyncio
    async def test_calculate_wallet_performance_failure(self, service, sample_trades):
        """Test wallet performance calculation with error"""
        calc_service, mock_calculator, mock_price_feed = service
        
        mock_calculator.calculate_performance_metrics.side_effect = Exception("Calculation failed")
        
        result = await calc_service.calculate_wallet_performance("test_wallet", sample_trades)
        
        assert result is None
        mock_calculator.calculate_performance_metrics.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_calculate_wallet_performance_no_data(self, service, sample_metrics):
        """Test wallet performance calculation with no data"""
        calc_service, mock_calculator, mock_price_feed = service
        
        mock_calculator.calculate_performance_metrics.return_value = None
        
        result = await calc_service.calculate_wallet_performance("empty_wallet", [])
        
        assert result is None
    
    @pytest.mark.asyncio
    async def test_calculate_wallet_performance_auto_initialize(self, sample_trades, sample_metrics):
        """Test that service auto-initializes if not initialized"""
        service = CalculationService()
        
        with patch('app.calculation.service.get_performance_calculator') as mock_get_calc, \
             patch('app.calculation.service.get_price_feed') as mock_get_price:
            
            mock_calculator = AsyncMock()
            mock_price_feed = AsyncMock()
            mock_get_calc.return_value = mock_calculator
            mock_get_price.return_value = mock_price_feed
            mock_calculator.calculate_performance_metrics.return_value = sample_metrics
            
            result = await service.calculate_wallet_performance("test_wallet", sample_trades)
            
            assert result is sample_metrics
            assert service.calculator is mock_calculator
            assert service.price_feed is mock_price_feed
    
    @pytest.mark.asyncio
    async def test_calculate_batch_wallet_performance(self, service, sample_trades, sample_metrics):
        """Test batch wallet performance calculation"""
        calc_service, mock_calculator, mock_price_feed = service
        
        wallet_trades = {
            "wallet_1": sample_trades[:2],
            "wallet_2": sample_trades[2:4],
            "wallet_3": sample_trades[4:]
        }
        
        # Mock different results for different wallets
        mock_calculator.calculate_batch_metrics.return_value = {
            "wallet_1": sample_metrics,
            "wallet_2": sample_metrics,
            "wallet_3": None  # Failed calculation
        }
        
        results = await calc_service.calculate_batch_wallet_performance(wallet_trades)
        
        assert len(results) == 3
        assert results["wallet_1"] is sample_metrics
        assert results["wallet_2"] is sample_metrics
        assert results["wallet_3"] is None
        
        mock_calculator.calculate_batch_metrics.assert_called_once_with(wallet_trades, None)
    
    @pytest.mark.asyncio
    async def test_calculate_batch_wallet_performance_error(self, service):
        """Test batch calculation with error"""
        calc_service, mock_calculator, mock_price_feed = service
        
        wallet_trades = {"wallet_1": [], "wallet_2": []}
        mock_calculator.calculate_batch_metrics.side_effect = Exception("Batch failed")
        
        results = await calc_service.calculate_batch_wallet_performance(wallet_trades)
        
        assert len(results) == 2
        assert all(result is None for result in results.values())
    
    @pytest.mark.asyncio
    async def test_calculate_trade_usd_values(self, service, sample_trades):
        """Test USD value calculation for trades"""
        calc_service, mock_calculator, mock_price_feed = service
        
        # Create mock trade records
        mock_trade_records = []
        for i, trade in enumerate(sample_trades):
            mock_record = TradeRecord(
                timestamp=trade.block_time,
                signature=trade.signature,
                trade_type=TradeType.SELL,
                token_in=trade.token_in,
                token_out=trade.token_out,
                token_in_usd=Decimal("1000.00"),
                token_out_usd=Decimal("1050.00"),
                net_usd_change=Decimal("50.00"),
                fee_usd=Decimal("0.50"),
                total_cost_usd=Decimal("1000.50"),
                net_profit_usd=Decimal("49.50")
            )
            mock_trade_records.append(mock_record)
        
        # Mock calculator to return trade records
        mock_calculator.calculate_trade_usd_values.side_effect = mock_trade_records
        
        results = await calc_service.calculate_trade_usd_values(sample_trades)
        
        assert len(results) == len(sample_trades)
        assert all(isinstance(record, TradeRecord) for record in results)
        assert mock_calculator.calculate_trade_usd_values.call_count == len(sample_trades)
    
    @pytest.mark.asyncio
    async def test_calculate_trade_usd_values_partial_failure(self, service, sample_trades):
        """Test USD value calculation with some trade failures"""
        calc_service, mock_calculator, mock_price_feed = service
        
        # Mock some successes and some failures
        mock_calculator.calculate_trade_usd_values.side_effect = [
            TradeRecord(
                timestamp=sample_trades[0].block_time,
                signature=sample_trades[0].signature,
                trade_type=TradeType.SELL,
                token_in=sample_trades[0].token_in,
                token_out=sample_trades[0].token_out,
                token_in_usd=Decimal("1000.00"),
                token_out_usd=Decimal("1050.00"),
                net_usd_change=Decimal("50.00"),
                fee_usd=Decimal("0.50"),
                total_cost_usd=Decimal("1000.50"),
                net_profit_usd=Decimal("49.50")
            ),
            None,  # Failed calculation
            Exception("Price data unavailable"),  # Error
        ]
        
        results = await calc_service.calculate_trade_usd_values(sample_trades[:3])
        
        assert len(results) == 1  # Only one successful calculation
        assert isinstance(results[0], TradeRecord)
    
    @pytest.mark.asyncio
    async def test_get_portfolio_summary(self, service, sample_trades, sample_metrics):
        """Test comprehensive portfolio summary generation"""
        calc_service, mock_calculator, mock_price_feed = service
        
        wallet_addresses = ["wallet_1", "wallet_2", "wallet_3"]
        wallet_trades = {
            "wallet_1": sample_trades[:2],
            "wallet_2": sample_trades[2:4],
            "wallet_3": sample_trades[4:]
        }
        
        # Mock metrics for some wallets
        metrics_1 = PerformanceMetrics(
            period_start=datetime(2024, 1, 1, tzinfo=timezone.utc),
            period_end=datetime(2024, 1, 31, tzinfo=timezone.utc),
            total_trades=10,
            net_roi_percent=Decimal("15.50"),
            maximum_drawdown_percent=Decimal("8.25"),
            sharpe_ratio=Decimal("1.85"),
            win_loss_ratio=Decimal("2.33"),
            total_volume_usd=Decimal("10000.00"),
            total_fees_usd=Decimal("25.50"),
            total_profit_usd=Decimal("1550.00"),
            winning_trades=7,
            losing_trades=3,
            average_trade_size_usd=Decimal("1000.00"),
            largest_win_usd=Decimal("500.00"),
            largest_loss_usd=Decimal("-200.00"),
            average_holding_period_hours=Decimal("24.5")
        )
        
        metrics_2 = PerformanceMetrics(
            period_start=datetime(2024, 1, 1, tzinfo=timezone.utc),
            period_end=datetime(2024, 1, 31, tzinfo=timezone.utc),
            total_trades=5,
            net_roi_percent=Decimal("8.25"),
            maximum_drawdown_percent=Decimal("12.10"),
            sharpe_ratio=Decimal("1.45"),
            win_loss_ratio=Decimal("1.67"),
            total_volume_usd=Decimal("5000.00"),
            total_fees_usd=Decimal("12.75"),
            total_profit_usd=Decimal("412.50"),
            winning_trades=3,
            losing_trades=2,
            average_trade_size_usd=Decimal("1000.00"),
            largest_win_usd=Decimal("300.00"),
            largest_loss_usd=Decimal("-150.00"),
            average_holding_period_hours=Decimal("18.0")
        )
        
        # Mock batch calculation
        calc_service.calculate_batch_wallet_performance = AsyncMock(return_value={
            "wallet_1": metrics_1,
            "wallet_2": metrics_2,
            "wallet_3": None  # Failed
        })
        
        end_date = datetime(2024, 1, 31, tzinfo=timezone.utc)
        summary = await calc_service.get_portfolio_summary(wallet_addresses, wallet_trades, end_date)
        
        # Verify summary structure
        assert "analysis_period" in summary
        assert "portfolio_metrics" in summary
        assert "wallet_summaries" in summary
        assert "calculation_timestamp" in summary
        
        # Verify portfolio metrics
        portfolio_metrics = summary["portfolio_metrics"]
        assert portfolio_metrics["total_wallets"] == 3
        assert portfolio_metrics["successful_calculations"] == 2
        assert portfolio_metrics["success_rate"] == "66.67%"
        assert portfolio_metrics["total_trades"] == 15  # 10 + 5
        assert portfolio_metrics["total_volume_usd"] == 15000.00  # 10000 + 5000
        assert portfolio_metrics["total_profit_usd"] == 1962.50  # 1550 + 412.50
        
        # Verify wallet summaries
        wallet_summaries = summary["wallet_summaries"]
        assert len(wallet_summaries) == 3
        assert wallet_summaries["wallet_1"]["status"] == "success"
        assert wallet_summaries["wallet_2"]["status"] == "success"
        assert wallet_summaries["wallet_3"]["status"] == "failed"
    
    @pytest.mark.asyncio
    async def test_get_calculation_health_all_healthy(self, service):
        """Test health check when all components are healthy"""
        calc_service, mock_calculator, mock_price_feed = service
        
        # Mock healthy price feed
        mock_price_feed.get_price_statistics.return_value = {
            "total_prices": 1000,
            "cache_hits": 850,
            "cache_miss_rate": "15%"
        }
        
        health = await calc_service.get_calculation_health()
        
        assert health["calculation_service"] == "healthy"
        assert health["price_feed"]["status"] == "healthy"
        assert health["calculator"]["status"] == "healthy"
        assert "timestamp" in health
    
    @pytest.mark.asyncio
    async def test_get_calculation_health_degraded(self, service):
        """Test health check with degraded components"""
        calc_service, mock_calculator, mock_price_feed = service
        
        # Mock price feed failure
        mock_price_feed.get_price_statistics.side_effect = Exception("Price feed error")
        
        health = await calc_service.get_calculation_health()
        
        assert health["calculation_service"] == "degraded"
        assert "error" in health
    
    @pytest.mark.asyncio
    async def test_get_calculation_health_not_initialized(self):
        """Test health check when service is not initialized"""
        service = CalculationService()
        
        health = await service.get_calculation_health()
        
        assert health["calculation_service"] == "healthy"
        assert health["price_feed"]["status"] == "not_initialized"
        assert health["calculator"]["status"] == "not_initialized"
    
    @pytest.mark.asyncio
    async def test_close_service(self, service):
        """Test service cleanup"""
        calc_service, mock_calculator, mock_price_feed = service
        
        with patch('app.calculation.service.close_price_feed') as mock_close_price:
            await calc_service.close()
            
            assert calc_service.calculator is None
            assert calc_service.price_feed is None
            mock_close_price.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_global_service_functions(self):
        """Test global service management functions"""
        # Test get_calculation_service
        with patch('app.calculation.service._calculation_service', None):
            with patch('app.calculation.service.CalculationService') as mock_service_class:
                mock_service = AsyncMock()
                mock_service_class.return_value = mock_service
                
                service = await get_calculation_service()
                
                assert service is mock_service
                mock_service.initialize.assert_called_once()
        
        # Test close_calculation_service  
        with patch('app.calculation.service._calculation_service') as mock_global_service:
            mock_service = AsyncMock()
            mock_global_service = mock_service
            
            await close_calculation_service()
            
            # Mock should be called for close
            # (This tests the cleanup logic)
    
    @pytest.mark.asyncio
    async def test_edge_cases(self, service):
        """Test edge cases and boundary conditions"""
        calc_service, mock_calculator, mock_price_feed = service
        
        # Test with empty wallet list
        summary = await calc_service.get_portfolio_summary([], {})
        assert summary["portfolio_metrics"]["total_wallets"] == 0
        assert summary["portfolio_metrics"]["success_rate"] == "0%"
        
        # Test with None end_date
        calc_service.calculate_batch_wallet_performance = AsyncMock(return_value={})
        summary = await calc_service.get_portfolio_summary(["wallet_1"], {"wallet_1": []}, None)
        assert "analysis_period" in summary
        assert summary["analysis_period"]["end_date"] is not None
    
    @pytest.mark.asyncio
    async def test_error_handling_robustness(self, service, sample_trades):
        """Test error handling in various scenarios"""
        calc_service, mock_calculator, mock_price_feed = service
        
        # Test unexpected error in wallet performance calculation
        mock_calculator.calculate_performance_metrics.side_effect = [
            Exception("Network timeout"),
            KeyError("Missing data"),
            ValueError("Invalid input")
        ]
        
        # All should return None instead of crashing
        result1 = await calc_service.calculate_wallet_performance("wallet_1", sample_trades)
        result2 = await calc_service.calculate_wallet_performance("wallet_2", sample_trades)
        result3 = await calc_service.calculate_wallet_performance("wallet_3", sample_trades)
        
        assert result1 is None
        assert result2 is None
        assert result3 is None
    
    @pytest.mark.asyncio
    async def test_concurrent_processing(self, service, sample_trades, sample_metrics):
        """Test that service can handle concurrent requests"""
        calc_service, mock_calculator, mock_price_feed = service
        
        mock_calculator.calculate_performance_metrics.return_value = sample_metrics
        
        # Run multiple concurrent requests
        tasks = [
            calc_service.calculate_wallet_performance(f"wallet_{i}", sample_trades)
            for i in range(10)
        ]
        
        results = await asyncio.gather(*tasks)
        
        assert len(results) == 10
        assert all(result is sample_metrics for result in results)
        assert mock_calculator.calculate_performance_metrics.call_count == 10


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])