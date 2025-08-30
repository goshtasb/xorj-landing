"""
Test Suite for Slippage Controller (SR-2: Strict Slippage Control).

Tests comprehensive slippage validation including:
- Slippage limit enforcement
- Market impact calculation  
- Liquidity depth requirements
- Price staleness detection
- Circuit breaker functionality
- Security violation logging
"""

import pytest
import asyncio
from decimal import Decimal
from datetime import datetime, timezone, timedelta
from unittest.mock import Mock, patch, AsyncMock

from app.security.slippage_controller import (
    SlippageController, 
    SlippageAnalysis,
    SlippageViolationType,
    SlippageRiskLevel
)
from app.models.trades import GeneratedTrade, SwapInstruction, TradeType, TradeStatus


@pytest.fixture
def slippage_controller():
    """Create SlippageController instance for testing."""
    return SlippageController()


@pytest.fixture 
def sample_trade():
    """Create sample trade for testing."""
    swap_instruction = SwapInstruction(
        from_token_symbol="USDC",
        to_token_symbol="JUP", 
        from_mint="EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        to_mint="JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
        from_amount=Decimal("100.0"),
        max_slippage_percent=Decimal("1.0")  # 1% max slippage
    )
    
    return GeneratedTrade(
        trade_id="test_trade_001",
        user_id="test_user_001", 
        vault_address="test_vault_address",
        trade_type=TradeType.SWAP,
        swap_instruction=swap_instruction,
        rationale="Test trade for slippage validation"
    )


class TestSlippageValidation:
    """Test slippage validation core functionality."""
    
    @pytest.mark.asyncio
    async def test_valid_trade_passes_validation(self, slippage_controller, sample_trade):
        """Test that trades within slippage limits pass validation."""
        
        # Mock market data with good conditions
        mock_market_data = {
            "current_price": Decimal("1.0020"),
            "bid_price": Decimal("1.0015"),
            "ask_price": Decimal("1.0025"), 
            "spread_percent": Decimal("0.10"),
            "liquidity_depth": Decimal("10000.0"),  # Good liquidity
            "volume_24h": Decimal("500000.0"),
            "volatility_24h": Decimal("5.0"),        # Low volatility
            "last_update": datetime.now(timezone.utc),
            "data_source": "test_api",
            "market_pair": "USDC/JUP"
        }
        
        with patch.object(slippage_controller, '_fetch_market_data', return_value=mock_market_data):
            analysis = await slippage_controller.validate_trade_slippage(sample_trade)
            
            assert analysis.approved == True
            assert analysis.violation_type is None
            assert analysis.rejection_reason is None
            assert analysis.estimated_slippage_percent <= sample_trade.swap_instruction.max_slippage_percent
            assert analysis.risk_level in [SlippageRiskLevel.LOW, SlippageRiskLevel.MODERATE]
    
    @pytest.mark.asyncio
    async def test_excessive_slippage_rejected(self, slippage_controller, sample_trade):
        """Test that trades exceeding slippage limits are rejected."""
        
        # Mock market data with poor liquidity causing high slippage
        mock_market_data = {
            "current_price": Decimal("1.0020"),
            "bid_price": Decimal("1.0000"),
            "ask_price": Decimal("1.0040"),
            "spread_percent": Decimal("4.0"),         # High spread
            "liquidity_depth": Decimal("50.0"),       # Very low liquidity
            "volume_24h": Decimal("1000.0"),          # Low volume
            "volatility_24h": Decimal("15.0"),        # High volatility
            "last_update": datetime.now(timezone.utc),
            "data_source": "test_api", 
            "market_pair": "USDC/JUP"
        }
        
        with patch.object(slippage_controller, '_fetch_market_data', return_value=mock_market_data):
            analysis = await slippage_controller.validate_trade_slippage(sample_trade)
            
            assert analysis.approved == False
            assert analysis.violation_type == SlippageViolationType.EXCESSIVE_SLIPPAGE
            assert "slippage" in analysis.rejection_reason.lower()
            assert analysis.estimated_slippage_percent > sample_trade.swap_instruction.max_slippage_percent
    
    @pytest.mark.asyncio
    async def test_insufficient_liquidity_rejected(self, slippage_controller, sample_trade):
        """Test that trades with insufficient liquidity are rejected."""
        
        # Mock market data with extremely low liquidity
        mock_market_data = {
            "current_price": Decimal("1.0020"),
            "bid_price": Decimal("1.0018"),
            "ask_price": Decimal("1.0022"),
            "spread_percent": Decimal("0.40"),
            "liquidity_depth": Decimal("10.0"),       # Extremely low liquidity (< 10x trade)
            "volume_24h": Decimal("100.0"),
            "volatility_24h": Decimal("8.0"),
            "last_update": datetime.now(timezone.utc),
            "data_source": "test_api",
            "market_pair": "USDC/JUP"
        }
        
        with patch.object(slippage_controller, '_fetch_market_data', return_value=mock_market_data):
            analysis = await slippage_controller.validate_trade_slippage(sample_trade)
            
            assert analysis.approved == False
            assert analysis.violation_type == SlippageViolationType.LIQUIDITY_INSUFFICIENT
            assert "liquidity" in analysis.rejection_reason.lower()
    
    @pytest.mark.asyncio
    async def test_stale_price_data_rejected(self, slippage_controller, sample_trade):
        """Test that trades with stale price data are rejected."""
        
        # Mock market data with stale timestamp
        stale_time = datetime.now(timezone.utc) - timedelta(minutes=2)  # 2 minutes old
        mock_market_data = {
            "current_price": Decimal("1.0020"),
            "bid_price": Decimal("1.0018"), 
            "ask_price": Decimal("1.0022"),
            "spread_percent": Decimal("0.40"),
            "liquidity_depth": Decimal("5000.0"),
            "volume_24h": Decimal("100000.0"),
            "volatility_24h": Decimal("8.0"),
            "last_update": stale_time,               # Stale data
            "data_source": "test_api",
            "market_pair": "USDC/JUP"
        }
        
        with patch.object(slippage_controller, '_fetch_market_data', return_value=mock_market_data):
            analysis = await slippage_controller.validate_trade_slippage(sample_trade)
            
            assert analysis.approved == False
            assert analysis.violation_type == SlippageViolationType.PRICE_STALENESS
            assert "stale" in analysis.rejection_reason.lower()
    
    @pytest.mark.asyncio
    async def test_high_volatility_rejected(self, slippage_controller, sample_trade):
        """Test that trades during high volatility are rejected."""
        
        # Mock market data with extreme volatility
        mock_market_data = {
            "current_price": Decimal("1.0020"),
            "bid_price": Decimal("1.0018"),
            "ask_price": Decimal("1.0022"),
            "spread_percent": Decimal("0.40"),
            "liquidity_depth": Decimal("5000.0"),
            "volume_24h": Decimal("100000.0"),
            "volatility_24h": Decimal("35.0"),        # Very high volatility (>30%)
            "last_update": datetime.now(timezone.utc),
            "data_source": "test_api",
            "market_pair": "USDC/JUP"
        }
        
        with patch.object(slippage_controller, '_fetch_market_data', return_value=mock_market_data):
            analysis = await slippage_controller.validate_trade_slippage(sample_trade)
            
            assert analysis.approved == False
            assert analysis.violation_type == SlippageViolationType.VOLATILITY_TOO_HIGH
            assert "volatile" in analysis.rejection_reason.lower()


class TestCircuitBreaker:
    """Test circuit breaker functionality."""
    
    @pytest.mark.asyncio
    async def test_circuit_breaker_activation(self, slippage_controller):
        """Test that circuit breaker activates after excessive rejections."""
        
        # Create multiple failing trades
        failing_trades = []
        for i in range(12):  # More than max_rejections_per_minute (10)
            swap_instruction = SwapInstruction(
                from_token_symbol="USDC",
                to_token_symbol="JUP",
                from_mint="test_mint",
                to_mint="test_mint", 
                from_amount=Decimal("100.0"),
                max_slippage_percent=Decimal("0.1")  # Very tight limit
            )
            
            trade = GeneratedTrade(
                trade_id=f"failing_trade_{i}",
                user_id="test_user",
                vault_address="test_vault", 
                trade_type=TradeType.SWAP,
                swap_instruction=swap_instruction,
                rationale="Failing trade for circuit breaker test"
            )
            failing_trades.append(trade)
        
        # Mock market data that will cause rejections
        mock_market_data = {
            "current_price": Decimal("1.0020"),
            "spread_percent": Decimal("5.0"),         # High spread causes rejection
            "liquidity_depth": Decimal("10.0"),       # Low liquidity
            "volume_24h": Decimal("100.0"),
            "volatility_24h": Decimal("20.0"),
            "last_update": datetime.now(timezone.utc),
            "data_source": "test_api",
            "market_pair": "USDC/JUP"
        }
        
        with patch.object(slippage_controller, '_fetch_market_data', return_value=mock_market_data):
            # Process failing trades to trigger circuit breaker
            for trade in failing_trades:
                analysis = await slippage_controller.validate_trade_slippage(trade)
                assert analysis.approved == False
            
            # Circuit breaker should be active now
            cb_status = slippage_controller.get_circuit_breaker_status()
            assert cb_status["active"] == True
            assert cb_status["recent_rejections"] >= slippage_controller.max_rejections_per_minute
    
    @pytest.mark.asyncio
    async def test_circuit_breaker_blocks_trades(self, slippage_controller, sample_trade):
        """Test that active circuit breaker blocks all trades."""
        
        # Manually activate circuit breaker
        await slippage_controller._activate_circuit_breaker("test_activation")
        
        # Mock good market data that would normally pass
        mock_market_data = {
            "current_price": Decimal("1.0020"),
            "spread_percent": Decimal("0.10"),
            "liquidity_depth": Decimal("10000.0"), 
            "volume_24h": Decimal("500000.0"),
            "volatility_24h": Decimal("5.0"),
            "last_update": datetime.now(timezone.utc),
            "data_source": "test_api",
            "market_pair": "USDC/JUP"
        }
        
        with patch.object(slippage_controller, '_fetch_market_data', return_value=mock_market_data):
            analysis = await slippage_controller.validate_trade_slippage(sample_trade)
            
            # Should be rejected due to circuit breaker
            assert analysis.approved == False
            assert "circuit breaker" in analysis.rejection_reason.lower()
    
    @pytest.mark.asyncio
    async def test_circuit_breaker_deactivation(self, slippage_controller):
        """Test manual circuit breaker deactivation."""
        
        # Activate circuit breaker
        await slippage_controller._activate_circuit_breaker("test_activation")
        assert slippage_controller.circuit_breaker_active == True
        
        # Deactivate circuit breaker
        await slippage_controller.deactivate_circuit_breaker("manual_test")
        assert slippage_controller.circuit_breaker_active == False
        
        # Status should show inactive
        cb_status = slippage_controller.get_circuit_breaker_status()
        assert cb_status["active"] == False
        assert cb_status["recent_rejections"] == 0


class TestRiskLevels:
    """Test risk level assessment."""
    
    def test_low_risk_assessment(self, slippage_controller):
        """Test low risk level assessment."""
        risk_level = slippage_controller._assess_slippage_risk_level(
            estimated_slippage=Decimal("0.05"),  # 0.05%
            market_impact=Decimal("0.02"),       # 0.02% 
            volatility=Decimal("3.0")            # 3% volatility
        )
        assert risk_level == SlippageRiskLevel.LOW
    
    def test_moderate_risk_assessment(self, slippage_controller):
        """Test moderate risk level assessment."""
        risk_level = slippage_controller._assess_slippage_risk_level(
            estimated_slippage=Decimal("0.3"),   # 0.3%
            market_impact=Decimal("0.2"),        # 0.2%
            volatility=Decimal("8.0")            # 8% volatility
        )
        assert risk_level == SlippageRiskLevel.MODERATE
    
    def test_high_risk_assessment(self, slippage_controller):
        """Test high risk level assessment.""" 
        risk_level = slippage_controller._assess_slippage_risk_level(
            estimated_slippage=Decimal("1.5"),   # 1.5%
            market_impact=Decimal("1.0"),        # 1.0%
            volatility=Decimal("15.0")           # 15% volatility
        )
        assert risk_level == SlippageRiskLevel.HIGH
    
    def test_extreme_risk_assessment(self, slippage_controller):
        """Test extreme risk level assessment."""
        risk_level = slippage_controller._assess_slippage_risk_level(
            estimated_slippage=Decimal("5.0"),   # 5.0%
            market_impact=Decimal("3.0"),        # 3.0%
            volatility=Decimal("25.0")           # 25% volatility
        )
        assert risk_level == SlippageRiskLevel.EXTREME


class TestSlippageAnalysis:
    """Test SlippageAnalysis data structure."""
    
    def test_slippage_analysis_creation(self):
        """Test SlippageAnalysis object creation and properties."""
        analysis = SlippageAnalysis(
            trade_id="test_001",
            user_id="user_001", 
            from_token="USDC",
            to_token="JUP",
            trade_amount=Decimal("100.0"),
            current_price=Decimal("1.0020"),
            expected_price=Decimal("1.0000"),
            estimated_slippage_percent=Decimal("0.5"),
            max_allowed_slippage=Decimal("1.0"),
            market_impact_percent=Decimal("0.2"),
            liquidity_depth=Decimal("5000.0"),
            price_volatility_24h=Decimal("8.0"),
            last_price_update=datetime.now(timezone.utc),
            risk_level=SlippageRiskLevel.MODERATE
        )
        
        assert analysis.slippage_within_limits == True
        assert analysis.price_data_fresh == True
        
        # Test dictionary conversion
        analysis_dict = analysis.to_dict()
        assert analysis_dict["trade_id"] == "test_001"
        assert analysis_dict["approved"] == False  # Default is False
        assert "estimated_slippage_percent" in analysis_dict
        assert "risk_level" in analysis_dict
    
    def test_slippage_analysis_limits_check(self):
        """Test slippage limits checking."""
        # Test slippage exceeding limits
        analysis = SlippageAnalysis(
            trade_id="test_001",
            user_id="user_001",
            from_token="USDC", 
            to_token="JUP",
            trade_amount=Decimal("100.0"),
            current_price=Decimal("1.0020"),
            expected_price=Decimal("1.0000"),
            estimated_slippage_percent=Decimal("2.0"),  # 2% estimated
            max_allowed_slippage=Decimal("1.0"),        # 1% max allowed
            market_impact_percent=Decimal("0.5"),
            liquidity_depth=Decimal("5000.0"),
            price_volatility_24h=Decimal("8.0"),
            last_price_update=datetime.now(timezone.utc),
            risk_level=SlippageRiskLevel.HIGH
        )
        
        assert analysis.slippage_within_limits == False
    
    def test_price_data_freshness_check(self):
        """Test price data freshness checking."""
        # Test stale price data
        stale_time = datetime.now(timezone.utc) - timedelta(seconds=45)  # 45 seconds old
        analysis = SlippageAnalysis(
            trade_id="test_001",
            user_id="user_001",
            from_token="USDC",
            to_token="JUP", 
            trade_amount=Decimal("100.0"),
            current_price=Decimal("1.0020"),
            expected_price=Decimal("1.0000"),
            estimated_slippage_percent=Decimal("0.5"),
            max_allowed_slippage=Decimal("1.0"),
            market_impact_percent=Decimal("0.2"),
            liquidity_depth=Decimal("5000.0"),
            price_volatility_24h=Decimal("8.0"),
            last_price_update=stale_time,               # Stale timestamp
            risk_level=SlippageRiskLevel.MODERATE
        )
        
        assert analysis.price_data_fresh == False


if __name__ == "__main__":
    # Run basic test to verify imports work
    print("Testing SlippageController imports...")
    controller = SlippageController()
    print(f"✅ SlippageController initialized with default limits: {controller.default_slippage_limits}")
    print("✅ All imports successful!")