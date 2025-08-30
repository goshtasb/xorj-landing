"""
XORJ Quantitative Engine - Trust Score Algorithm Tests
Comprehensive unit tests with known inputs and expected outputs for XORJ Trust Score
"""

import pytest
import asyncio
from datetime import datetime, timezone, timedelta
from decimal import Decimal, getcontext
from unittest.mock import AsyncMock, MagicMock, patch
from typing import List, Dict

from app.scoring.trust_score import (
    XORJTrustScoreEngine,
    TrustScoreResult,
    EligibilityStatus,
    NormalizedMetrics,
    SHARPE_WEIGHT,
    ROI_WEIGHT,
    DRAWDOWN_PENALTY_WEIGHT,
    MIN_TRADING_DAYS,
    MIN_TOTAL_TRADES,
    MAX_SINGLE_DAY_ROI_SPIKE
)
from app.calculation.metrics import PerformanceMetrics, TradeRecord, TradeType
from app.schemas.ingestion import RaydiumSwap, TokenBalance
from app.core.config import get_settings

# Set high precision for test calculations
getcontext().prec = 28

settings = get_settings()


class TestXORJTrustScoreEngine:
    """Test suite for XORJ Trust Score algorithm with known inputs and outputs"""
    
    @pytest.fixture
    async def scoring_engine(self):
        """Create scoring engine instance for testing"""
        engine = XORJTrustScoreEngine()
        
        # Mock calculation service to avoid external dependencies
        mock_calc_service = AsyncMock()
        engine.calculation_service = mock_calc_service
        
        return engine, mock_calc_service
    
    @pytest.fixture
    def sample_trades_eligible(self):
        """Create sample trades that meet eligibility criteria"""
        base_date = datetime(2024, 1, 1, tzinfo=timezone.utc)
        trades = []
        
        # Generate 60 trades over 100 days (meets 90-day and 50-trade requirements)
        for i in range(60):
            trade_date = base_date + timedelta(days=i * 1.67)  # Spread over ~100 days
            
            trade = RaydiumSwap(
                signature=f"eligible_trade_{i:03d}",
                block_time=trade_date,
                wallet_address="EligibleWallet12345",
                status="success",
                swap_type="swapBaseIn",
                token_in=TokenBalance(
                    mint="So11111111111111111111111111111111111111112",
                    symbol="SOL",
                    amount=str(10.0 + i * 0.1),
                    decimals=9,
                    usd_value=str(1000.0 + i * 10)
                ),
                token_out=TokenBalance(
                    mint="EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
                    symbol="USDC",
                    amount=str(1050.0 + i * 10),
                    decimals=6,
                    usd_value=str(1050.0 + i * 10)
                ),
                pool_id="test_pool",
                fee_lamports=5000,
                fee_usd="0.50"
            )
            trades.append(trade)
        
        return trades
    
    @pytest.fixture
    def sample_trades_ineligible_history(self):
        """Create sample trades with insufficient trading history"""
        base_date = datetime.now(timezone.utc) - timedelta(days=30)  # Only 30 days
        trades = []
        
        for i in range(60):  # 60 trades but only 30 days
            trade_date = base_date + timedelta(hours=i * 12)
            
            trade = RaydiumSwap(
                signature=f"short_history_{i:03d}",
                block_time=trade_date,
                wallet_address="ShortHistoryWallet",
                status="success",
                swap_type="swapBaseIn",
                token_in=TokenBalance(mint="test", symbol="SOL", amount="10", decimals=9, usd_value="1000"),
                token_out=TokenBalance(mint="test", symbol="USDC", amount="1050", decimals=6, usd_value="1050"),
                pool_id="test_pool",
                fee_lamports=5000,
                fee_usd="0.50"
            )
            trades.append(trade)
        
        return trades
    
    @pytest.fixture
    def sample_trades_ineligible_count(self):
        """Create sample trades with insufficient trade count"""
        base_date = datetime.now(timezone.utc) - timedelta(days=100)  # 100 days
        trades = []
        
        for i in range(30):  # Only 30 trades
            trade_date = base_date + timedelta(days=i * 3)
            
            trade = RaydiumSwap(
                signature=f"few_trades_{i:03d}",
                block_time=trade_date,
                wallet_address="FewTradesWallet",
                status="success",
                swap_type="swapBaseIn",
                token_in=TokenBalance(mint="test", symbol="SOL", amount="10", decimals=9, usd_value="1000"),
                token_out=TokenBalance(mint="test", symbol="USDC", amount="1050", decimals=6, usd_value="1050"),
                pool_id="test_pool",
                fee_lamports=5000,
                fee_usd="0.50"
            )
            trades.append(trade)
        
        return trades
    
    @pytest.fixture
    def known_performance_metrics(self):
        """Create performance metrics with known values for testing"""
        return [
            # High-performing wallet
            PerformanceMetrics(
                period_start=datetime(2024, 1, 1, tzinfo=timezone.utc),
                period_end=datetime(2024, 3, 31, tzinfo=timezone.utc),
                total_trades=75,
                net_roi_percent=Decimal('25.50'),      # High ROI
                maximum_drawdown_percent=Decimal('5.25'),  # Low drawdown  
                sharpe_ratio=Decimal('2.15'),          # High Sharpe
                win_loss_ratio=Decimal('3.20'),
                total_volume_usd=Decimal('150000.00'),
                total_fees_usd=Decimal('750.00'),
                total_profit_usd=Decimal('38250.00'),
                winning_trades=60,
                losing_trades=15,
                average_trade_size_usd=Decimal('2000.00'),
                largest_win_usd=Decimal('5000.00'),
                largest_loss_usd=Decimal('-1500.00'),
                average_holding_period_hours=Decimal('24.0')
            ),
            
            # Medium-performing wallet
            PerformanceMetrics(
                period_start=datetime(2024, 1, 1, tzinfo=timezone.utc),
                period_end=datetime(2024, 3, 31, tzinfo=timezone.utc),
                total_trades=55,
                net_roi_percent=Decimal('12.75'),      # Medium ROI
                maximum_drawdown_percent=Decimal('15.80'), # Medium drawdown
                sharpe_ratio=Decimal('1.45'),          # Medium Sharpe
                win_loss_ratio=Decimal('1.85'),
                total_volume_usd=Decimal('80000.00'),
                total_fees_usd=Decimal('400.00'),
                total_profit_usd=Decimal('10200.00'),
                winning_trades=35,
                losing_trades=20,
                average_trade_size_usd=Decimal('1454.55'),
                largest_win_usd=Decimal('2500.00'),
                largest_loss_usd=Decimal('-2000.00'),
                average_holding_period_hours=Decimal('36.0')
            ),
            
            # Poor-performing wallet  
            PerformanceMetrics(
                period_start=datetime(2024, 1, 1, tzinfo=timezone.utc),
                period_end=datetime(2024, 3, 31, tzinfo=timezone.utc),
                total_trades=52,
                net_roi_percent=Decimal('-8.25'),      # Negative ROI
                maximum_drawdown_percent=Decimal('35.60'), # High drawdown
                sharpe_ratio=Decimal('0.25'),          # Low Sharpe
                win_loss_ratio=Decimal('0.85'),
                total_volume_usd=Decimal('60000.00'),
                total_fees_usd=Decimal('300.00'),
                total_profit_usd=Decimal('-4950.00'),
                winning_trades=22,
                losing_trades=30,
                average_trade_size_usd=Decimal('1153.85'),
                largest_win_usd=Decimal('1200.00'),
                largest_loss_usd=Decimal('-3500.00'),
                average_holding_period_hours=Decimal('48.0')
            )
        ]
    
    @pytest.mark.asyncio
    async def test_wallet_eligibility_eligible(self, scoring_engine, sample_trades_eligible):
        """Test wallet eligibility check for eligible wallet"""
        engine, mock_calc_service = scoring_engine
        
        # Mock the ROI spike check to avoid USD calculation complexity
        engine._has_extreme_roi_spikes = AsyncMock(return_value=False)
        
        status, reason = await engine.check_wallet_eligibility(
            "EligibleWallet12345", 
            sample_trades_eligible
        )
        
        assert status == EligibilityStatus.ELIGIBLE
        assert reason is None
    
    @pytest.mark.asyncio
    async def test_wallet_eligibility_insufficient_history(self, scoring_engine, sample_trades_ineligible_history):
        """Test wallet eligibility check for insufficient trading history"""
        engine, mock_calc_service = scoring_engine
        
        status, reason = await engine.check_wallet_eligibility(
            "ShortHistoryWallet", 
            sample_trades_ineligible_history
        )
        
        assert status == EligibilityStatus.INSUFFICIENT_HISTORY
        assert "30 days" in reason
        assert "90" in reason
    
    @pytest.mark.asyncio
    async def test_wallet_eligibility_insufficient_trades(self, scoring_engine, sample_trades_ineligible_count):
        """Test wallet eligibility check for insufficient trade count"""
        engine, mock_calc_service = scoring_engine
        
        status, reason = await engine.check_wallet_eligibility(
            "FewTradesWallet", 
            sample_trades_ineligible_count
        )
        
        assert status == EligibilityStatus.INSUFFICIENT_TRADES
        assert "30 trades" in reason
        assert "50" in reason
    
    @pytest.mark.asyncio
    async def test_extreme_roi_spike_detection(self, scoring_engine):
        """Test detection of extreme ROI spikes"""
        engine, mock_calc_service = scoring_engine
        
        # Create trades with an extreme ROI spike
        base_date = datetime.now(timezone.utc) - timedelta(days=100)
        trades = []
        
        # Normal trade
        normal_trade = RaydiumSwap(
            signature="normal_trade",
            block_time=base_date,
            wallet_address="TestWallet",
            status="success",
            swap_type="swapBaseIn",
            token_in=TokenBalance(mint="test", symbol="SOL", amount="10", decimals=9, usd_value="1000"),
            token_out=TokenBalance(mint="test", symbol="USDC", amount="1020", decimals=6, usd_value="1020"),
            pool_id="test_pool",
            fee_lamports=5000,
            fee_usd="0.50"
        )
        
        # Extreme spike trade (same day)
        spike_trade = RaydiumSwap(
            signature="spike_trade",
            block_time=base_date + timedelta(hours=2),  # Same day
            wallet_address="TestWallet",
            status="success", 
            swap_type="swapBaseIn",
            token_in=TokenBalance(mint="test", symbol="SOL", amount="10", decimals=9, usd_value="1000"),
            token_out=TokenBalance(mint="test", symbol="USDC", amount="2000", decimals=6, usd_value="2000"),  # 100% gain
            pool_id="test_pool",
            fee_lamports=5000,
            fee_usd="0.50"
        )
        
        trades = [normal_trade, spike_trade]
        
        # Mock calculation service to return trade records
        def mock_calculate_usd_values(trade):
            if trade.signature == "normal_trade":
                return TradeRecord(
                    timestamp=trade.block_time,
                    signature=trade.signature,
                    trade_type=TradeType.SELL,
                    token_in=trade.token_in,
                    token_out=trade.token_out,
                    token_in_usd=Decimal('1000'),
                    token_out_usd=Decimal('1020'),
                    net_usd_change=Decimal('20'),
                    fee_usd=Decimal('0.50'),
                    total_cost_usd=Decimal('1000.50'),
                    net_profit_usd=Decimal('19.50')
                )
            else:  # spike_trade
                return TradeRecord(
                    timestamp=trade.block_time,
                    signature=trade.signature,
                    trade_type=TradeType.SELL,
                    token_in=trade.token_in,
                    token_out=trade.token_out,
                    token_in_usd=Decimal('1000'),
                    token_out_usd=Decimal('2000'),
                    net_usd_change=Decimal('1000'),
                    fee_usd=Decimal('0.50'),
                    total_cost_usd=Decimal('1000.50'),
                    net_profit_usd=Decimal('999.50')
                )
        
        mock_calc_service.calculate_trade_usd_values.side_effect = mock_calculate_usd_values
        
        has_spikes = await engine._has_extreme_roi_spikes(trades)
        assert has_spikes == True
    
    def test_metric_normalization_known_values(self, scoring_engine, known_performance_metrics):
        """Test metric normalization with known inputs and expected outputs"""
        engine, _ = scoring_engine
        
        normalized_results = engine.normalize_metrics(known_performance_metrics)
        
        assert len(normalized_results) == 3
        
        # Check that all normalized values are between 0 and 1
        for norm_metrics in normalized_results.values():
            assert 0 <= norm_metrics.normalized_sharpe <= 1
            assert 0 <= norm_metrics.normalized_roi <= 1  
            assert 0 <= norm_metrics.normalized_max_drawdown <= 1
        
        # The high-performing wallet should have the highest normalized values
        # (except for drawdown where low is good, so high normalized value)
        high_perf_norm = list(normalized_results.values())[0]  # First in list
        poor_perf_norm = list(normalized_results.values())[2]   # Last in list
        
        assert high_perf_norm.normalized_sharpe > poor_perf_norm.normalized_sharpe
        assert high_perf_norm.normalized_roi > poor_perf_norm.normalized_roi
        assert high_perf_norm.normalized_max_drawdown > poor_perf_norm.normalized_max_drawdown  # Lower drawdown = higher normalized
    
    def test_trust_score_calculation_exact_formula(self, scoring_engine):
        """Test XORJ Trust Score calculation with exact known values"""
        engine, _ = scoring_engine
        
        # Create normalized metrics with known values
        normalized_metrics = NormalizedMetrics(
            normalized_sharpe=Decimal('0.8'),     # High Sharpe
            normalized_roi=Decimal('0.9'),        # High ROI  
            normalized_max_drawdown=Decimal('0.7'), # Good drawdown (low actual drawdown)
            original_sharpe=Decimal('2.0'),
            original_roi=Decimal('20.0'),
            original_max_drawdown=Decimal('8.0'),
            sharpe_min=Decimal('0.0'),
            sharpe_max=Decimal('2.5'),
            roi_min=Decimal('-10.0'),
            roi_max=Decimal('25.0'),
            drawdown_min=Decimal('2.0'),
            drawdown_max=Decimal('40.0')
        )
        
        trust_score, performance_score, risk_penalty = engine.calculate_xorj_trust_score(normalized_metrics)
        
        # Expected calculation:
        # performance_score = (0.8 * 0.40) + (0.9 * 0.25) = 0.32 + 0.225 = 0.545
        # risk_penalty = (1.0 - 0.7) * 0.35 = 0.3 * 0.35 = 0.105  
        # final_score = 0.545 - 0.105 = 0.44
        # trust_score = 0.44 * 100 = 44.0
        
        expected_performance = Decimal('0.8') * SHARPE_WEIGHT + Decimal('0.9') * ROI_WEIGHT
        expected_risk_penalty = (Decimal('1.0') - Decimal('0.7')) * DRAWDOWN_PENALTY_WEIGHT
        expected_final = expected_performance - expected_risk_penalty
        expected_trust_score = expected_final * Decimal('100')
        
        # Allow small tolerance for decimal precision
        assert abs(performance_score - expected_performance) < Decimal('0.001')
        assert abs(risk_penalty - expected_risk_penalty) < Decimal('0.001')
        assert abs(trust_score - expected_trust_score) < Decimal('0.01')
        
        # Trust score should be around 44
        assert 43.0 <= float(trust_score) <= 45.0
    
    def test_trust_score_prevents_negative_scores(self, scoring_engine):
        """Test that Trust Score prevents negative values"""
        engine, _ = scoring_engine
        
        # Create metrics that would result in negative score
        normalized_metrics = NormalizedMetrics(
            normalized_sharpe=Decimal('0.1'),     # Very low Sharpe
            normalized_roi=Decimal('0.0'),        # Zero ROI
            normalized_max_drawdown=Decimal('0.1'), # Very high drawdown (low normalized value)
            original_sharpe=Decimal('-0.5'),
            original_roi=Decimal('-15.0'),
            original_max_drawdown=Decimal('45.0'),
            sharpe_min=Decimal('-1.0'),
            sharpe_max=Decimal('2.0'),
            roi_min=Decimal('-20.0'),
            roi_max=Decimal('20.0'),
            drawdown_min=Decimal('5.0'),
            drawdown_max=Decimal('50.0')
        )
        
        trust_score, performance_score, risk_penalty = engine.calculate_xorj_trust_score(normalized_metrics)
        
        # Trust score should never be negative
        assert trust_score >= Decimal('0')
        
        # The performance score should be low  
        assert performance_score <= Decimal('0.15')
        
        # Risk penalty should be high
        assert risk_penalty >= Decimal('0.30')
    
    def test_algorithm_weights_exact_values(self, scoring_engine):
        """Test that algorithm uses exact weight values specified in FR-3"""
        engine, _ = scoring_engine
        
        # Verify the exact weights from FR-3 specification
        assert SHARPE_WEIGHT == Decimal('0.40')
        assert ROI_WEIGHT == Decimal('0.25') 
        assert DRAWDOWN_PENALTY_WEIGHT == Decimal('0.35')
        
        # Weights should sum to 1.0
        total_weight = SHARPE_WEIGHT + ROI_WEIGHT + DRAWDOWN_PENALTY_WEIGHT
        assert total_weight == Decimal('1.00')
    
    def test_eligibility_criteria_exact_values(self, scoring_engine):
        """Test that eligibility criteria match FR-3 specification"""
        engine, _ = scoring_engine
        
        assert engine.min_history_days == MIN_TRADING_DAYS == 90
        assert engine.min_trades == MIN_TOTAL_TRADES == 50  
        assert engine.max_single_day_roi_spike == MAX_SINGLE_DAY_ROI_SPIKE == Decimal('0.50')
    
    @pytest.mark.asyncio
    async def test_batch_trust_score_calculation(self, scoring_engine, sample_trades_eligible, known_performance_metrics):
        """Test batch Trust Score calculation with cross-wallet normalization"""
        engine, mock_calc_service = scoring_engine
        
        # Mock eligibility checks
        engine.check_wallet_eligibility = AsyncMock()
        engine.check_wallet_eligibility.return_value = (EligibilityStatus.ELIGIBLE, None)
        
        # Mock calculation service
        mock_calc_service.calculate_batch_wallet_performance.return_value = {
            "wallet1": known_performance_metrics[0],  # High performer
            "wallet2": known_performance_metrics[1],  # Medium performer  
            "wallet3": known_performance_metrics[2]   # Poor performer
        }
        
        wallet_trades = {
            "wallet1": sample_trades_eligible,
            "wallet2": sample_trades_eligible,
            "wallet3": sample_trades_eligible
        }
        
        results = await engine.calculate_batch_trust_scores(wallet_trades)
        
        assert len(results) == 3
        
        # All should be eligible in this test
        assert all(r.eligibility_status == EligibilityStatus.ELIGIBLE for r in results.values())
        
        # High performer should have highest Trust Score
        trust_scores = [(wallet, float(result.trust_score)) for wallet, result in results.items()]
        trust_scores.sort(key=lambda x: x[1], reverse=True)
        
        # The wallet with highest metrics should have highest Trust Score
        # (Note: exact ranking depends on normalization, but score should be > 0 for all)
        assert all(score > 0 for _, score in trust_scores)
        assert trust_scores[0][1] > trust_scores[-1][1]  # Best > worst
    
    @pytest.mark.asyncio
    async def test_empty_trades_handling(self, scoring_engine):
        """Test handling of empty trade lists"""
        engine, _ = scoring_engine
        
        # Empty trades should return NO_DATA eligibility
        status, reason = await engine.check_wallet_eligibility("empty_wallet", [])
        assert status == EligibilityStatus.NO_DATA
        assert "No trading data" in reason
    
    def test_precision_maintenance_in_calculations(self, scoring_engine):
        """Test that high precision is maintained throughout Trust Score calculations"""
        engine, _ = scoring_engine
        
        # Use very precise decimal values
        normalized_metrics = NormalizedMetrics(
            normalized_sharpe=Decimal('0.123456789012345678901234567890'),
            normalized_roi=Decimal('0.876543210987654321098765432100'),
            normalized_max_drawdown=Decimal('0.555555555555555555555555555555'),
            original_sharpe=Decimal('1.5'),
            original_roi=Decimal('15.0'),
            original_max_drawdown=Decimal('10.0'),
            sharpe_min=Decimal('0.0'),
            sharpe_max=Decimal('2.0'),
            roi_min=Decimal('0.0'),
            roi_max=Decimal('20.0'),
            drawdown_min=Decimal('0.0'),
            drawdown_max=Decimal('25.0')
        )
        
        trust_score, performance_score, risk_penalty = engine.calculate_xorj_trust_score(normalized_metrics)
        
        # All results should be Decimal types with high precision
        assert isinstance(trust_score, Decimal)
        assert isinstance(performance_score, Decimal)
        assert isinstance(risk_penalty, Decimal)
        
        # Trust score should have reasonable precision (not rounded to int)
        trust_score_str = str(trust_score)
        if '.' in trust_score_str:
            decimal_places = len(trust_score_str.split('.')[1])
            assert decimal_places >= 2  # At least 2 decimal places preserved
    
    def test_metric_normalization_edge_cases(self, scoring_engine):
        """Test metric normalization with edge cases"""
        engine, _ = scoring_engine
        
        # All metrics the same (zero range)
        identical_metrics = [
            PerformanceMetrics(
                period_start=datetime.now(timezone.utc),
                period_end=datetime.now(timezone.utc),
                total_trades=50,
                net_roi_percent=Decimal('10.0'),
                maximum_drawdown_percent=Decimal('15.0'), 
                sharpe_ratio=Decimal('1.5'),
                win_loss_ratio=Decimal('2.0'),
                total_volume_usd=Decimal('100000.0'),
                total_fees_usd=Decimal('500.0'),
                total_profit_usd=Decimal('10000.0'),
                winning_trades=30,
                losing_trades=20,
                average_trade_size_usd=Decimal('2000.0'),
                largest_win_usd=Decimal('1000.0'),
                largest_loss_usd=Decimal('-500.0'),
                average_holding_period_hours=Decimal('24.0')
            )
        ] * 3  # Three identical metrics
        
        normalized_results = engine.normalize_metrics(identical_metrics)
        
        # When all values are the same, normalization should handle gracefully
        # (avoid division by zero)
        assert len(normalized_results) == 3
        for norm_metrics in normalized_results.values():
            # With identical inputs, normalized values should be in valid range
            assert 0 <= norm_metrics.normalized_sharpe <= 1
            assert 0 <= norm_metrics.normalized_roi <= 1
            assert 0 <= norm_metrics.normalized_max_drawdown <= 1


if __name__ == "__main__":
    pytest.main([__file__, "-v"])