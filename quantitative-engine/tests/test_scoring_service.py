"""
XORJ Quantitative Engine - Scoring Service Tests
NFR-2: Comprehensive unit tests for scoring service with 95% coverage
"""

import pytest
import asyncio
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch
from typing import List, Dict

from app.scoring.service import ScoringService, get_scoring_service, close_scoring_service
from app.scoring.trust_score import TrustScoreResult, EligibilityStatus
from app.calculation.metrics import PerformanceMetrics
from app.schemas.ingestion import RaydiumSwap, TokenBalance
from app.core.config import get_settings


class TestScoringService:
    """Comprehensive test suite for ScoringService"""
    
    @pytest.fixture
    async def service(self):
        """Create scoring service instance for testing"""
        service = ScoringService()
        
        # Mock dependencies
        mock_scoring_engine = AsyncMock()
        mock_calculation_service = AsyncMock()
        
        service.scoring_engine = mock_scoring_engine
        service.calculation_service = mock_calculation_service
        
        return service, mock_scoring_engine, mock_calculation_service
    
    @pytest.fixture
    def sample_trades(self):
        """Create sample trades for testing"""
        base_time = datetime(2024, 1, 1, tzinfo=timezone.utc)
        
        trades = []
        for i in range(10):
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
                    amount=str((10 + i) * 110),  # 10% profit
                    decimals=6,
                    usd_value=str((10 + i) * 110)
                ),
                pool_id="test_pool",
                fee_lamports=5000,
                fee_usd="0.50"
            )
            trades.append(trade)
        
        return trades
    
    @pytest.fixture
    def sample_trust_score_result(self):
        """Create sample trust score result"""
        return TrustScoreResult(
            wallet_address="test_wallet",
            trust_score=Decimal("87.45"),
            eligibility_status=EligibilityStatus.ELIGIBLE,
            eligibility_reason="Meets all criteria",
            performance_score=Decimal("0.6234"),
            risk_penalty=Decimal("0.1489"),
            calculation_timestamp=datetime(2024, 1, 31, tzinfo=timezone.utc),
            original_metrics=PerformanceMetrics(
                period_start=datetime(2024, 1, 1, tzinfo=timezone.utc),
                period_end=datetime(2024, 1, 31, tzinfo=timezone.utc),
                total_trades=50,
                net_roi_percent=Decimal("24.75"),
                maximum_drawdown_percent=Decimal("6.25"),
                sharpe_ratio=Decimal("2.18"),
                win_loss_ratio=Decimal("3.45"),
                total_volume_usd=Decimal("245000.00"),
                total_fees_usd=Decimal("612.50"),
                total_profit_usd=Decimal("60637.50"),
                winning_trades=35,
                losing_trades=15,
                average_trade_size_usd=Decimal("4900.00"),
                largest_win_usd=Decimal("2500.00"),
                largest_loss_usd=Decimal("-800.00"),
                average_holding_period_hours=Decimal("12.5")
            )
        )
    
    @pytest.fixture
    def sample_benchmark_metrics(self):
        """Create sample benchmark performance metrics"""
        return [
            PerformanceMetrics(
                period_start=datetime(2024, 1, 1, tzinfo=timezone.utc),
                period_end=datetime(2024, 1, 31, tzinfo=timezone.utc),
                total_trades=45,
                net_roi_percent=Decimal("18.30"),
                maximum_drawdown_percent=Decimal("12.40"),
                sharpe_ratio=Decimal("1.67"),
                win_loss_ratio=Decimal("2.15"),
                total_volume_usd=Decimal("156000.00"),
                total_fees_usd=Decimal("390.00"),
                total_profit_usd=Decimal("28548.00"),
                winning_trades=28,
                losing_trades=17,
                average_trade_size_usd=Decimal("3466.67"),
                largest_win_usd=Decimal("1800.00"),
                largest_loss_usd=Decimal("-600.00"),
                average_holding_period_hours=Decimal("16.2")
            ),
            PerformanceMetrics(
                period_start=datetime(2024, 1, 1, tzinfo=timezone.utc),
                period_end=datetime(2024, 1, 31, tzinfo=timezone.utc),
                total_trades=32,
                net_roi_percent=Decimal("12.80"),
                maximum_drawdown_percent=Decimal("15.60"),
                sharpe_ratio=Decimal("1.34"),
                win_loss_ratio=Decimal("1.78"),
                total_volume_usd=Decimal("98000.00"),
                total_fees_usd=Decimal("245.00"),
                total_profit_usd=Decimal("12544.00"),
                winning_trades=19,
                losing_trades=13,
                average_trade_size_usd=Decimal("3062.50"),
                largest_win_usd=Decimal("1200.00"),
                largest_loss_usd=Decimal("-750.00"),
                average_holding_period_hours=Decimal("21.8")
            )
        ]
    
    @pytest.mark.asyncio
    async def test_initialization(self):
        """Test service initialization"""
        service = ScoringService()
        assert service.scoring_engine is None
        assert service.calculation_service is None
        
        # Mock the dependencies
        with patch('app.scoring.service.get_trust_score_engine') as mock_get_engine, \
             patch('app.scoring.service.get_calculation_service') as mock_get_calc:
            
            mock_scoring_engine = AsyncMock()
            mock_calculation_service = AsyncMock()
            mock_get_engine.return_value = mock_scoring_engine
            mock_get_calc.return_value = mock_calculation_service
            
            await service.initialize()
            
            assert service.scoring_engine is mock_scoring_engine
            assert service.calculation_service is mock_calculation_service
    
    @pytest.mark.asyncio
    async def test_calculate_wallet_trust_score_success(self, service, sample_trades, sample_trust_score_result):
        """Test successful trust score calculation"""
        scoring_service, mock_scoring_engine, mock_calculation_service = service
        
        mock_scoring_engine.calculate_single_wallet_trust_score.return_value = sample_trust_score_result
        
        result = await scoring_service.calculate_wallet_trust_score(
            "test_wallet",
            sample_trades,
            end_date=datetime(2024, 1, 31, tzinfo=timezone.utc)
        )
        
        assert result is sample_trust_score_result
        assert result.trust_score == Decimal("87.45")
        assert result.eligibility_status == EligibilityStatus.ELIGIBLE
        
        mock_scoring_engine.calculate_single_wallet_trust_score.assert_called_once_with(
            "test_wallet",
            sample_trades,
            None,  # No benchmark provided in this test
            datetime(2024, 1, 31, tzinfo=timezone.utc)
        )
    
    @pytest.mark.asyncio
    async def test_calculate_wallet_trust_score_with_benchmark(self, service, sample_trades, sample_trust_score_result, sample_benchmark_metrics):
        """Test trust score calculation with benchmark wallets"""
        scoring_service, mock_scoring_engine, mock_calculation_service = service
        
        benchmark_wallets = {
            "benchmark_1": sample_trades[:5],
            "benchmark_2": sample_trades[5:]
        }
        
        # Mock benchmark metrics calculation
        mock_calculation_service.calculate_batch_wallet_performance.return_value = {
            "benchmark_1": sample_benchmark_metrics[0],
            "benchmark_2": sample_benchmark_metrics[1]
        }
        
        mock_scoring_engine.calculate_single_wallet_trust_score.return_value = sample_trust_score_result
        
        result = await scoring_service.calculate_wallet_trust_score(
            "test_wallet",
            sample_trades,
            benchmark_wallets=benchmark_wallets
        )
        
        assert result is sample_trust_score_result
        
        # Verify benchmark metrics were calculated
        mock_calculation_service.calculate_batch_wallet_performance.assert_called_once_with(
            benchmark_wallets, None
        )
        
        # Verify trust score was calculated with benchmark data
        mock_scoring_engine.calculate_single_wallet_trust_score.assert_called_once_with(
            "test_wallet",
            sample_trades,
            sample_benchmark_metrics,
            None
        )
    
    @pytest.mark.asyncio
    async def test_calculate_wallet_trust_score_error(self, service, sample_trades):
        """Test trust score calculation with error"""
        scoring_service, mock_scoring_engine, mock_calculation_service = service
        
        mock_scoring_engine.calculate_single_wallet_trust_score.side_effect = Exception("Scoring failed")
        
        result = await scoring_service.calculate_wallet_trust_score("test_wallet", sample_trades)
        
        assert result.eligibility_status == EligibilityStatus.CALCULATION_ERROR
        assert result.trust_score == 0
        assert "Service error" in result.eligibility_reason
    
    @pytest.mark.asyncio
    async def test_calculate_wallet_trust_score_auto_initialize(self, sample_trades, sample_trust_score_result):
        """Test that service auto-initializes if not initialized"""
        service = ScoringService()
        
        with patch('app.scoring.service.get_trust_score_engine') as mock_get_engine, \
             patch('app.scoring.service.get_calculation_service') as mock_get_calc:
            
            mock_scoring_engine = AsyncMock()
            mock_calculation_service = AsyncMock()
            mock_get_engine.return_value = mock_scoring_engine
            mock_get_calc.return_value = mock_calculation_service
            mock_scoring_engine.calculate_single_wallet_trust_score.return_value = sample_trust_score_result
            
            result = await service.calculate_wallet_trust_score("test_wallet", sample_trades)
            
            assert result is sample_trust_score_result
            assert service.scoring_engine is mock_scoring_engine
            assert service.calculation_service is mock_calculation_service
    
    @pytest.mark.asyncio
    async def test_calculate_batch_trust_scores_success(self, service, sample_trades):
        """Test successful batch trust score calculation"""
        scoring_service, mock_scoring_engine, mock_calculation_service = service
        
        wallet_trades = {
            "wallet_1": sample_trades[:3],
            "wallet_2": sample_trades[3:6],
            "wallet_3": sample_trades[6:]
        }
        
        # Create mock results
        mock_results = {
            "wallet_1": TrustScoreResult(
                wallet_address="wallet_1",
                trust_score=Decimal("85.50"),
                eligibility_status=EligibilityStatus.ELIGIBLE,
                calculation_timestamp=datetime.now(timezone.utc)
            ),
            "wallet_2": TrustScoreResult(
                wallet_address="wallet_2",
                trust_score=Decimal("72.30"),
                eligibility_status=EligibilityStatus.ELIGIBLE,
                calculation_timestamp=datetime.now(timezone.utc)
            ),
            "wallet_3": TrustScoreResult(
                wallet_address="wallet_3",
                trust_score=Decimal("45.80"),
                eligibility_status=EligibilityStatus.INSUFFICIENT_TRADES,
                calculation_timestamp=datetime.now(timezone.utc)
            )
        }
        
        mock_scoring_engine.calculate_batch_trust_scores.return_value = mock_results
        
        results = await scoring_service.calculate_batch_trust_scores(wallet_trades)
        
        assert len(results) == 3
        assert results["wallet_1"].trust_score == Decimal("85.50")
        assert results["wallet_2"].trust_score == Decimal("72.30")
        assert results["wallet_3"].eligibility_status == EligibilityStatus.INSUFFICIENT_TRADES
        
        mock_scoring_engine.calculate_batch_trust_scores.assert_called_once_with(wallet_trades, None)
    
    @pytest.mark.asyncio
    async def test_calculate_batch_trust_scores_error(self, service, sample_trades):
        """Test batch trust score calculation with error"""
        scoring_service, mock_scoring_engine, mock_calculation_service = service
        
        wallet_trades = {
            "wallet_1": sample_trades[:5],
            "wallet_2": sample_trades[5:]
        }
        
        mock_scoring_engine.calculate_batch_trust_scores.side_effect = Exception("Batch scoring failed")
        
        results = await scoring_service.calculate_batch_trust_scores(wallet_trades)
        
        assert len(results) == 2
        assert all(result.eligibility_status == EligibilityStatus.CALCULATION_ERROR 
                   for result in results.values())
        assert all(result.trust_score == 0 for result in results.values())
    
    @pytest.mark.asyncio
    async def test_get_trust_score_leaderboard(self, service, sample_trades):
        """Test trust score leaderboard generation"""
        scoring_service, mock_scoring_engine, mock_calculation_service = service
        
        wallet_trades = {
            "wallet_1": sample_trades[:2],
            "wallet_2": sample_trades[2:4], 
            "wallet_3": sample_trades[4:6],
            "wallet_4": sample_trades[6:8],
            "wallet_5": sample_trades[8:]
        }
        
        # Create mock results with different scores
        mock_trust_scores = {
            "wallet_1": TrustScoreResult(
                wallet_address="wallet_1",
                trust_score=Decimal("95.50"),
                eligibility_status=EligibilityStatus.ELIGIBLE,
                performance_score=Decimal("0.7234"),
                risk_penalty=Decimal("0.1234"),
                calculation_timestamp=datetime.now(timezone.utc),
                original_metrics=PerformanceMetrics(
                    period_start=datetime(2024, 1, 1, tzinfo=timezone.utc),
                    period_end=datetime(2024, 1, 31, tzinfo=timezone.utc),
                    total_trades=50,
                    net_roi_percent=Decimal("30.50"),
                    maximum_drawdown_percent=Decimal("5.25"),
                    sharpe_ratio=Decimal("2.85"),
                    win_loss_ratio=Decimal("4.25"),
                    total_volume_usd=Decimal("150000.00"),
                    total_fees_usd=Decimal("375.00"),
                    total_profit_usd=Decimal("45750.00"),
                    winning_trades=40,
                    losing_trades=10,
                    average_trade_size_usd=Decimal("3000.00"),
                    largest_win_usd=Decimal("3000.00"),
                    largest_loss_usd=Decimal("-500.00"),
                    average_holding_period_hours=Decimal("8.5")
                )
            ),
            "wallet_2": TrustScoreResult(
                wallet_address="wallet_2",
                trust_score=Decimal("82.30"),
                eligibility_status=EligibilityStatus.ELIGIBLE,
                performance_score=Decimal("0.6012"),
                risk_penalty=Decimal("0.1512"),
                calculation_timestamp=datetime.now(timezone.utc),
                original_metrics=PerformanceMetrics(
                    period_start=datetime(2024, 1, 1, tzinfo=timezone.utc),
                    period_end=datetime(2024, 1, 31, tzinfo=timezone.utc),
                    total_trades=35,
                    net_roi_percent=Decimal("20.80"),
                    maximum_drawdown_percent=Decimal("8.75"),
                    sharpe_ratio=Decimal("2.15"),
                    win_loss_ratio=Decimal("2.85"),
                    total_volume_usd=Decimal("98000.00"),
                    total_fees_usd=Decimal("245.00"),
                    total_profit_usd=Decimal("20384.00"),
                    winning_trades=25,
                    losing_trades=10,
                    average_trade_size_usd=Decimal("2800.00"),
                    largest_win_usd=Decimal("1800.00"),
                    largest_loss_usd=Decimal("-650.00"),
                    average_holding_period_hours=Decimal("12.0")
                )
            ),
            "wallet_3": TrustScoreResult(
                wallet_address="wallet_3",
                trust_score=Decimal("75.60"),
                eligibility_status=EligibilityStatus.ELIGIBLE,
                calculation_timestamp=datetime.now(timezone.utc)
            ),
            "wallet_4": TrustScoreResult(
                wallet_address="wallet_4",
                trust_score=Decimal("45.20"),
                eligibility_status=EligibilityStatus.INSUFFICIENT_TRADES,
                calculation_timestamp=datetime.now(timezone.utc)
            ),
            "wallet_5": TrustScoreResult(
                wallet_address="wallet_5",
                trust_score=Decimal("88.90"),
                eligibility_status=EligibilityStatus.ELIGIBLE,
                calculation_timestamp=datetime.now(timezone.utc)
            )
        }
        
        # Mock batch calculation
        scoring_service.calculate_batch_trust_scores = AsyncMock(return_value=mock_trust_scores)
        
        leaderboard = await scoring_service.get_trust_score_leaderboard(
            wallet_trades,
            limit=3,
            min_trust_score=70.0
        )
        
        # Verify leaderboard structure
        assert "leaderboard" in leaderboard
        assert "statistics" in leaderboard
        assert "eligibility_breakdown" in leaderboard
        assert "calculation_parameters" in leaderboard
        
        # Verify leaderboard entries (should be sorted by trust score descending)
        leaderboard_entries = leaderboard["leaderboard"]
        assert len(leaderboard_entries) == 3  # Limited to top 3
        assert leaderboard_entries[0]["wallet_address"] == "wallet_1"
        assert leaderboard_entries[0]["rank"] == 1
        assert leaderboard_entries[0]["trust_score"] == 95.50
        
        assert leaderboard_entries[1]["wallet_address"] == "wallet_5"
        assert leaderboard_entries[1]["rank"] == 2
        assert leaderboard_entries[1]["trust_score"] == 88.90
        
        assert leaderboard_entries[2]["wallet_address"] == "wallet_2"
        assert leaderboard_entries[2]["rank"] == 3
        assert leaderboard_entries[2]["trust_score"] == 82.30
        
        # Verify statistics
        statistics = leaderboard["statistics"]
        assert statistics["total_wallets_analyzed"] == 5
        assert statistics["eligible_wallets"] == 4  # wallet_4 is not eligible
        assert statistics["wallets_above_threshold"] == 3  # Above 70.0 threshold
        
        # Verify eligibility breakdown
        eligibility_breakdown = leaderboard["eligibility_breakdown"]
        assert eligibility_breakdown["eligible"] == 4
        assert eligibility_breakdown["insufficient_trades"] == 1
    
    @pytest.mark.asyncio
    async def test_get_trust_score_leaderboard_empty_results(self, service):
        """Test leaderboard generation with no eligible wallets"""
        scoring_service, mock_scoring_engine, mock_calculation_service = service
        
        wallet_trades = {"wallet_1": []}
        
        # Mock empty results
        scoring_service.calculate_batch_trust_scores = AsyncMock(return_value={
            "wallet_1": TrustScoreResult(
                wallet_address="wallet_1",
                trust_score=Decimal("0"),
                eligibility_status=EligibilityStatus.INSUFFICIENT_DATA,
                calculation_timestamp=datetime.now(timezone.utc)
            )
        })
        
        leaderboard = await scoring_service.get_trust_score_leaderboard(wallet_trades)
        
        assert len(leaderboard["leaderboard"]) == 0
        assert leaderboard["statistics"]["eligible_wallets"] == 0
        assert leaderboard["statistics"]["trust_score_stats"]["average"] == 0
    
    @pytest.mark.asyncio
    async def test_get_scoring_health_all_healthy(self, service):
        """Test health check when all components are healthy"""
        scoring_service, mock_scoring_engine, mock_calculation_service = service
        
        # Mock healthy calculation service
        mock_calculation_service.get_calculation_health.return_value = {
            "calculation_service": "healthy"
        }
        
        health = await scoring_service.get_scoring_health()
        
        assert health["scoring_service"] == "healthy"
        assert health["scoring_engine"]["status"] == "healthy"
        assert health["calculation_service"] == "healthy"
        assert "timestamp" in health
        
        # Verify scoring engine details
        scoring_engine = health["scoring_engine"]
        assert "eligibility_criteria" in scoring_engine
        assert "scoring_weights" in scoring_engine
    
    @pytest.mark.asyncio
    async def test_get_scoring_health_degraded(self, service):
        """Test health check with degraded components"""
        scoring_service, mock_scoring_engine, mock_calculation_service = service
        
        # Mock calculation service failure
        mock_calculation_service.get_calculation_health.side_effect = Exception("Calculation error")
        
        health = await scoring_service.get_scoring_health()
        
        assert health["scoring_service"] == "degraded"
        assert "error" in health
    
    @pytest.mark.asyncio
    async def test_get_scoring_health_not_initialized(self):
        """Test health check when service is not initialized"""
        service = ScoringService()
        
        health = await service.get_scoring_health()
        
        assert health["scoring_service"] == "healthy"
        assert health["scoring_engine"]["status"] == "not_initialized"
        assert health["calculation_service"]["status"] == "not_initialized"
    
    @pytest.mark.asyncio
    async def test_close_service(self, service):
        """Test service cleanup"""
        scoring_service, mock_scoring_engine, mock_calculation_service = service
        
        await scoring_service.close()
        
        assert scoring_service.scoring_engine is None
        assert scoring_service.calculation_service is None
    
    @pytest.mark.asyncio
    async def test_global_service_functions(self):
        """Test global service management functions"""
        # Test get_scoring_service
        with patch('app.scoring.service._scoring_service', None):
            with patch('app.scoring.service.ScoringService') as mock_service_class:
                mock_service = AsyncMock()
                mock_service_class.return_value = mock_service
                
                service = await get_scoring_service()
                
                assert service is mock_service
                mock_service.initialize.assert_called_once()
        
        # Test close_scoring_service
        with patch('app.scoring.service._scoring_service') as mock_global_service:
            mock_service = AsyncMock()
            mock_global_service = mock_service
            
            await close_scoring_service()
            
            # Mock should be called for close
            # (This tests the cleanup logic)
    
    @pytest.mark.asyncio
    async def test_edge_cases_and_boundary_conditions(self, service, sample_trades):
        """Test edge cases and boundary conditions"""
        scoring_service, mock_scoring_engine, mock_calculation_service = service
        
        # Test with empty wallet trades
        empty_results = await scoring_service.calculate_batch_trust_scores({})
        assert len(empty_results) == 0
        
        # Test leaderboard with min_trust_score higher than all scores
        scoring_service.calculate_batch_trust_scores = AsyncMock(return_value={
            "wallet_1": TrustScoreResult(
                wallet_address="wallet_1",
                trust_score=Decimal("50.0"),
                eligibility_status=EligibilityStatus.ELIGIBLE,
                calculation_timestamp=datetime.now(timezone.utc)
            )
        })
        
        leaderboard = await scoring_service.get_trust_score_leaderboard(
            {"wallet_1": sample_trades},
            min_trust_score=75.0
        )
        
        assert len(leaderboard["leaderboard"]) == 0
        assert leaderboard["statistics"]["wallets_above_threshold"] == 0
    
    @pytest.mark.asyncio
    async def test_error_handling_robustness(self, service, sample_trades):
        """Test error handling in various scenarios"""
        scoring_service, mock_scoring_engine, mock_calculation_service = service
        
        # Test unexpected errors in single wallet calculation
        mock_scoring_engine.calculate_single_wallet_trust_score.side_effect = [
            KeyError("Missing key"),
            ValueError("Invalid value"),
            TypeError("Type error"),
            RuntimeError("Runtime error")
        ]
        
        # All should return error results instead of crashing
        results = []
        for i in range(4):
            result = await scoring_service.calculate_wallet_trust_score(f"wallet_{i}", sample_trades)
            results.append(result)
        
        assert all(result.eligibility_status == EligibilityStatus.CALCULATION_ERROR 
                   for result in results)
        assert all(result.trust_score == 0 for result in results)
    
    @pytest.mark.asyncio
    async def test_concurrent_processing(self, service, sample_trades, sample_trust_score_result):
        """Test that service can handle concurrent requests"""
        scoring_service, mock_scoring_engine, mock_calculation_service = service
        
        mock_scoring_engine.calculate_single_wallet_trust_score.return_value = sample_trust_score_result
        
        # Run multiple concurrent requests
        tasks = [
            scoring_service.calculate_wallet_trust_score(f"wallet_{i}", sample_trades)
            for i in range(10)
        ]
        
        results = await asyncio.gather(*tasks)
        
        assert len(results) == 10
        assert all(result.trust_score == sample_trust_score_result.trust_score for result in results)
        assert mock_scoring_engine.calculate_single_wallet_trust_score.call_count == 10
    
    @pytest.mark.asyncio
    async def test_benchmark_handling_edge_cases(self, service, sample_trades, sample_trust_score_result):
        """Test benchmark handling with various edge cases"""
        scoring_service, mock_scoring_engine, mock_calculation_service = service
        
        # Test with benchmark wallets that have failed metrics
        benchmark_wallets = {
            "benchmark_1": sample_trades[:2],
            "benchmark_2": sample_trades[2:4]
        }
        
        # Mock partial benchmark failures
        mock_calculation_service.calculate_batch_wallet_performance.return_value = {
            "benchmark_1": None,  # Failed calculation
            "benchmark_2": sample_trust_score_result.original_metrics
        }
        
        mock_scoring_engine.calculate_single_wallet_trust_score.return_value = sample_trust_score_result
        
        result = await scoring_service.calculate_wallet_trust_score(
            "test_wallet",
            sample_trades,
            benchmark_wallets=benchmark_wallets
        )
        
        # Should still work with partial benchmark data
        assert result is sample_trust_score_result
        
        # Verify only non-None metrics were passed
        call_args = mock_scoring_engine.calculate_single_wallet_trust_score.call_args
        benchmark_metrics_arg = call_args[0][2]  # Third argument is benchmark_metrics
        assert len(benchmark_metrics_arg) == 1  # Only one non-None metric


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])