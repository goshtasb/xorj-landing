"""
Portfolio data models for XORJ Trade Execution Bot.

This module contains data structures for portfolio management,
reconciliation, and trade generation (FR-2, FR-3).
"""

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any
from decimal import Decimal
from datetime import datetime, timezone
from enum import Enum

import structlog

logger = structlog.get_logger(__name__)


@dataclass
class TokenHolding:
    """
    Represents a token holding in a user's vault.
    
    This is the fundamental unit for portfolio reconciliation (FR-2).
    """
    mint_address: str  # Solana token mint address
    symbol: str  # Token symbol (e.g., "USDC", "JUP", "SOL")
    balance: Decimal  # Token balance (raw amount)
    decimals: int  # Token decimals for proper scaling
    usd_value: Optional[Decimal] = None  # USD value of holding
    last_updated: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    
    @property
    def scaled_balance(self) -> Decimal:
        """Get balance scaled by token decimals."""
        return self.balance / (Decimal(10) ** self.decimals)
    
    @property
    def is_significant(self) -> bool:
        """Check if holding is significant (> 0.01 tokens or $0.01 USD)."""
        scaled = self.scaled_balance
        return scaled > Decimal("0.01") or (self.usd_value and self.usd_value > Decimal("0.01"))
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for logging and serialization."""
        return {
            "mint_address": self.mint_address,
            "symbol": self.symbol,
            "balance": str(self.balance),
            "scaled_balance": str(self.scaled_balance),
            "decimals": self.decimals,
            "usd_value": str(self.usd_value) if self.usd_value else None,
            "last_updated": self.last_updated.isoformat()
        }


@dataclass
class UserPortfolio:
    """
    Complete portfolio state for a user's vault.
    
    Implements FR-2: Portfolio Reconciliation
    Represents current token holdings read from Solana blockchain.
    """
    user_id: str
    vault_address: str
    holdings: List[TokenHolding] = field(default_factory=list)
    total_usd_value: Optional[Decimal] = None
    last_updated: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    
    @property
    def holding_symbols(self) -> List[str]:
        """Get list of token symbols held in portfolio."""
        return [h.symbol for h in self.holdings if h.is_significant]
    
    @property
    def is_empty(self) -> bool:
        """Check if portfolio has no significant holdings."""
        return not any(h.is_significant for h in self.holdings)
    
    @property
    def primary_holding(self) -> Optional[TokenHolding]:
        """Get the largest holding by USD value."""
        if not self.holdings:
            return None
        
        significant_holdings = [h for h in self.holdings if h.is_significant and h.usd_value]
        if not significant_holdings:
            # Fall back to largest by token amount
            return max(self.holdings, key=lambda h: h.scaled_balance) if self.holdings else None
        
        return max(significant_holdings, key=lambda h: h.usd_value)
    
    def get_holding(self, symbol: str) -> Optional[TokenHolding]:
        """Get holding by token symbol."""
        return next((h for h in self.holdings if h.symbol.upper() == symbol.upper()), None)
    
    def get_allocation_percentages(self) -> Dict[str, Decimal]:
        """
        Get portfolio allocation as percentages.
        
        Returns:
            Dict mapping token symbols to percentage allocations
        """
        if not self.total_usd_value or self.total_usd_value <= 0:
            return {}
        
        allocations = {}
        for holding in self.holdings:
            if holding.is_significant and holding.usd_value:
                percentage = (holding.usd_value / self.total_usd_value) * Decimal("100")
                allocations[holding.symbol] = percentage
        
        return allocations
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for logging and serialization."""
        return {
            "user_id": self.user_id,
            "vault_address": self.vault_address,
            "holdings": [h.to_dict() for h in self.holdings],
            "total_usd_value": str(self.total_usd_value) if self.total_usd_value else None,
            "holding_symbols": self.holding_symbols,
            "is_empty": self.is_empty,
            "last_updated": self.last_updated.isoformat()
        }


@dataclass
class TargetAllocation:
    """
    Target allocation for a specific token in target portfolio.
    
    Used in conjunction with TargetPortfolio from strategy_selector.py
    to define the desired end state for portfolio reconciliation.
    """
    symbol: str  # Token symbol (e.g., "JUP", "USDC")
    mint_address: str  # Solana token mint address
    target_percentage: Decimal  # Target allocation percentage (0-100)
    target_usd_value: Optional[Decimal] = None  # Target USD value
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for logging."""
        return {
            "symbol": self.symbol,
            "mint_address": self.mint_address,
            "target_percentage": str(self.target_percentage),
            "target_usd_value": str(self.target_usd_value) if self.target_usd_value else None
        }


@dataclass
class PortfolioComparison:
    """
    Result of comparing current portfolio against target portfolio.
    
    Implements FR-2: Portfolio Reconciliation
    Contains the discrepancies that need to be resolved via trades.
    """
    user_id: str
    vault_address: str
    current_portfolio: UserPortfolio
    target_allocations: List[TargetAllocation]
    comparison_timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    
    # Calculated discrepancies
    discrepancies: Dict[str, Decimal] = field(default_factory=dict)
    rebalance_required: bool = False
    total_rebalance_amount: Decimal = Decimal("0")
    
    def __post_init__(self):
        """Calculate discrepancies after initialization."""
        self._calculate_discrepancies()
    
    def _calculate_discrepancies(self):
        """
        Calculate portfolio discrepancies between current and target.
        
        This is the core FR-2 logic: compare current vs target allocations
        and identify what needs to be rebalanced.
        """
        if not self.current_portfolio.total_usd_value or self.current_portfolio.total_usd_value <= 0:
            logger.warning(
                "Cannot calculate discrepancies - portfolio has no USD value",
                user_id=self.user_id,
                vault_address=self.vault_address
            )
            return
        
        current_allocations = self.current_portfolio.get_allocation_percentages()
        portfolio_value = self.current_portfolio.total_usd_value
        
        logger.info(
            "Calculating portfolio discrepancies",
            user_id=self.user_id,
            current_allocations=current_allocations,
            target_count=len(self.target_allocations),
            portfolio_value=str(portfolio_value)
        )
        
        # Calculate discrepancy for each target allocation
        for target_allocation in self.target_allocations:
            symbol = target_allocation.symbol
            target_percentage = target_allocation.target_percentage
            current_percentage = current_allocations.get(symbol, Decimal("0"))
            
            # Calculate percentage discrepancy
            percentage_diff = target_percentage - current_percentage
            
            # Convert to USD amount
            usd_discrepancy = (percentage_diff / Decimal("100")) * portfolio_value
            
            # Store significant discrepancies (> $1 or > 1%)
            if abs(percentage_diff) > Decimal("1") or abs(usd_discrepancy) > Decimal("1"):
                self.discrepancies[symbol] = usd_discrepancy
                self.rebalance_required = True
                self.total_rebalance_amount += abs(usd_discrepancy)
            
            logger.debug(
                "Discrepancy calculated",
                symbol=symbol,
                target_percentage=str(target_percentage),
                current_percentage=str(current_percentage),
                percentage_diff=str(percentage_diff),
                usd_discrepancy=str(usd_discrepancy)
            )
        
        # Check for holdings that should be reduced/eliminated
        for symbol, current_percentage in current_allocations.items():
            # If we have a holding that's not in target allocations
            target_exists = any(ta.symbol.upper() == symbol.upper() for ta in self.target_allocations)
            
            if not target_exists and current_percentage > Decimal("1"):  # > 1% allocation
                # This holding should be eliminated
                usd_to_reduce = (current_percentage / Decimal("100")) * portfolio_value
                self.discrepancies[symbol] = -usd_to_reduce  # Negative = reduce holding
                self.rebalance_required = True
                self.total_rebalance_amount += usd_to_reduce
                
                logger.info(
                    "Found holding to eliminate",
                    symbol=symbol,
                    current_percentage=str(current_percentage),
                    usd_to_reduce=str(usd_to_reduce)
                )
        
        logger.info(
            "Portfolio discrepancy calculation completed",
            user_id=self.user_id,
            rebalance_required=self.rebalance_required,
            total_rebalance_amount=str(self.total_rebalance_amount),
            discrepancies_count=len(self.discrepancies)
        )
    
    def get_tokens_to_buy(self) -> Dict[str, Decimal]:
        """Get tokens that need to be bought (positive discrepancies)."""
        return {symbol: amount for symbol, amount in self.discrepancies.items() if amount > 0}
    
    def get_tokens_to_sell(self) -> Dict[str, Decimal]:
        """Get tokens that need to be sold (negative discrepancies)."""
        return {symbol: abs(amount) for symbol, amount in self.discrepancies.items() if amount < 0}
    
    def get_largest_discrepancy(self) -> Optional[tuple[str, Decimal]]:
        """Get the largest discrepancy by absolute USD amount."""
        if not self.discrepancies:
            return None
        
        return max(self.discrepancies.items(), key=lambda x: abs(x[1]))
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for logging and serialization."""
        return {
            "user_id": self.user_id,
            "vault_address": self.vault_address,
            "current_portfolio": self.current_portfolio.to_dict(),
            "target_allocations": [ta.to_dict() for ta in self.target_allocations],
            "comparison_timestamp": self.comparison_timestamp.isoformat(),
            "discrepancies": {k: str(v) for k, v in self.discrepancies.items()},
            "rebalance_required": self.rebalance_required,
            "total_rebalance_amount": str(self.total_rebalance_amount),
            "tokens_to_buy": {k: str(v) for k, v in self.get_tokens_to_buy().items()},
            "tokens_to_sell": {k: str(v) for k, v in self.get_tokens_to_sell().items()}
        }