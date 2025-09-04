"""
Trade Generation Logic for XORJ Trade Execution Bot.

Implements FR-3: Trade Generation Logic
"If a discrepancy exists between the user's portfolio and the Target Portfolio,
the bot must calculate the necessary swaps to rebalance the user's vault."

This module analyzes portfolio discrepancies and generates the minimal set of
trades needed to achieve the target allocation.

Key Features:
- Portfolio rebalancing calculation
- Optimal trade sequencing
- Slippage and fee estimation
- Risk assessment for each trade
- Comprehensive audit logging
"""

import uuid
from typing import List, Dict, Optional, Tuple
from decimal import Decimal
from datetime import datetime, timezone

import structlog
from app.models.portfolio import PortfolioComparison, TargetAllocation, TokenHolding
from app.models.trades import (
    GeneratedTrade, SwapInstruction, TradeType, TradeStatus, 
    TradeGenerationResult
)
from app.logging.audit_logger import get_audit_logger, AuditEventType, AuditSeverity
from app.core.config import get_config
from app.core.idempotency import get_idempotency_manager


logger = structlog.get_logger(__name__)


class TradeGenerator:
    """
    Trade generation system for portfolio rebalancing.
    
    Implements FR-3: Trade Generation Logic
    
    Core Algorithm:
    1. Analyze portfolio discrepancies from FR-2
    2. Identify tokens to sell (reduce) and buy (increase)
    3. Generate optimal swap sequence to minimize trades
    4. Apply risk management and slippage protection
    5. Create executable trade instructions
    
    Example from FR-3:
    "If the Target Portfolio is 100% JUP and the user's vault is 100% USDC,
    the bot generates a single trade: 'Swap 100% of USDC for JUP.'"
    """
    
    def __init__(self):
        self.config = get_config()
        self.audit_logger = get_audit_logger()
        self.idempotency_manager = None  # Will be initialized async
        
        # Trade generation settings
        self.max_slippage_percent = Decimal("1.0")  # 1% default slippage
        self.min_trade_amount_usd = Decimal("1.0")  # Minimum $1 trade
        self.max_trades_per_rebalance = 10  # Maximum trades in one rebalance
        
        logger.info("Trade Generator initialized")
    
    async def initialize(self):
        """Initialize async components."""
        if self.idempotency_manager is None:
            self.idempotency_manager = get_idempotency_manager()
            logger.info("Trade Generator idempotency manager initialized")
    
    async def generate_trades(
        self,
        portfolio_comparison: PortfolioComparison
    ) -> TradeGenerationResult:
        """
        Generate trades to rebalance portfolio to match target allocation.
        
        Implements FR-3: Trade Generation Logic
        "calculate the necessary swaps to rebalance the user's vault"
        
        Args:
            portfolio_comparison: Portfolio discrepancies from FR-2
            
        Returns:
            TradeGenerationResult: Generated trades and analysis
        """
        logger.info(
            "Generating trades for portfolio rebalancing",
            user_id=portfolio_comparison.user_id,
            vault_address=portfolio_comparison.vault_address,
            rebalance_required=portfolio_comparison.rebalance_required,
            discrepancies_count=len(portfolio_comparison.discrepancies)
        )
        
        # Ensure idempotency manager is initialized
        await self.initialize()
        
        # Check idempotency for trade generation (NFR-1)
        if self.idempotency_manager:
            strategy_data = {
                "target_allocations": [alloc.to_dict() for alloc in portfolio_comparison.target_allocations],
                "rebalance_required": portfolio_comparison.rebalance_required,
                "total_rebalance_amount": str(portfolio_comparison.total_rebalance_amount),
                "discrepancies": {k: str(v) for k, v in portfolio_comparison.discrepancies.items()}
            }
            
            portfolio_state = {
                "current_holdings": [holding.to_dict() for holding in portfolio_comparison.current_portfolio.holdings],
                "total_value_usd": str(portfolio_comparison.current_portfolio.total_usd_value),
                "vault_address": portfolio_comparison.vault_address
            }
            
            should_generate, existing_trades = await self.idempotency_manager.ensure_trade_generation_idempotency(
                user_id=portfolio_comparison.user_id,
                strategy_data=strategy_data,
                portfolio_state=portfolio_state
            )
            
            if not should_generate:
                if existing_trades:
                    logger.info(
                        "Returning existing trades from idempotency cache",
                        user_id=portfolio_comparison.user_id,
                        existing_trades_count=len(existing_trades)
                    )
                    result.success = True
                    result.generated_trades = existing_trades
                    result.trades_count = len(existing_trades)
                    return result
                else:
                    logger.info(
                        "Trade generation in progress, returning without duplicate generation",
                        user_id=portfolio_comparison.user_id
                    )
                    result.add_warning("Trade generation already in progress")
                    result.success = True
                    return result
        
        result = TradeGenerationResult(
            success=False,
            user_id=portfolio_comparison.user_id,
            vault_address=portfolio_comparison.vault_address,
            rebalance_required=portfolio_comparison.rebalance_required,
            total_rebalance_amount_usd=portfolio_comparison.total_rebalance_amount
        )
        
        try:
            # Check if rebalancing is needed
            if not portfolio_comparison.rebalance_required:
                logger.info(
                    "No rebalancing required for portfolio",
                    user_id=portfolio_comparison.user_id,
                    vault_address=portfolio_comparison.vault_address
                )
                result.success = True
                return result
            
            # Generate trade sequence
            trades = await self._generate_trade_sequence(portfolio_comparison)
            
            if not trades:
                result.add_warning("No executable trades generated despite portfolio discrepancies")
                result.success = True  # Not an error, just no actionable trades
                return result
            
            # Apply risk assessment to each trade with enhanced tracking (NFR-2)
            correlation_id = f"tradegen_{portfolio_comparison.user_id}_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}"
            for i, trade in enumerate(trades):
                await self._assess_trade_risk(trade, portfolio_comparison, correlation_id)
            
            result.trades = trades
            result.success = True
            
            # Record generated trades for idempotency (NFR-1)
            if self.idempotency_manager and trades:
                # Create idempotency key for this generation
                from app.core.idempotency import IdempotencyKey
                idem_key = IdempotencyKey.for_trade_generation(
                    user_id=portfolio_comparison.user_id,
                    strategy_data=strategy_data,
                    portfolio_state=portfolio_state
                )
                await self.idempotency_manager.record_generated_trades(
                    idempotency_key=idem_key.key,
                    trades=trades
                )
            
            # Log successful trade generation
            await self.audit_logger.log_trade_decision(
                user_id=portfolio_comparison.user_id,
                wallet_address=portfolio_comparison.vault_address,
                trader_address="rebalancing_bot",
                decision_data={
                    "trades_generated": len(trades),
                    "total_rebalance_amount": str(portfolio_comparison.total_rebalance_amount),
                    "trade_types": [t.trade_type.value for t in trades],
                    "generation_method": "fr3_portfolio_rebalancing"
                },
                decision_rationale=f"Generated {len(trades)} trades to rebalance portfolio based on target allocation",
                risk_assessment={
                    "total_trades": len(trades),
                    "executable_trades": result.executable_trades_count,
                    "total_amount_usd": str(portfolio_comparison.total_rebalance_amount)
                }
            )
            
            logger.info(
                "Trade generation completed successfully",
                user_id=portfolio_comparison.user_id,
                trades_generated=len(trades),
                executable_trades=result.executable_trades_count,
                total_rebalance_amount=str(portfolio_comparison.total_rebalance_amount)
            )
            
            return result
            
        except Exception as e:
            error_msg = f"Trade generation failed: {str(e)}"
            result.error_message = error_msg
            
            logger.error(
                error_msg,
                user_id=portfolio_comparison.user_id,
                vault_address=portfolio_comparison.vault_address,
                error_type=type(e).__name__
            )
            
            await self.audit_logger.log_error_event(
                error_message=error_msg,
                error_type=type(e).__name__,
                severity=AuditSeverity.ERROR,
                user_id=portfolio_comparison.user_id,
                wallet_address=portfolio_comparison.vault_address
            )
            
            return result
    
    async def _generate_trade_sequence(
        self, 
        portfolio_comparison: PortfolioComparison
    ) -> List[GeneratedTrade]:
        """
        Generate the optimal sequence of trades for rebalancing.
        
        This implements the core FR-3 algorithm:
        1. Identify tokens to sell (negative discrepancies)
        2. Identify tokens to buy (positive discrepancies)
        3. Create direct swaps where possible
        4. Use USDC as intermediate token for complex rebalancing
        
        Args:
            portfolio_comparison: Portfolio discrepancies
            
        Returns:
            List[GeneratedTrade]: Ordered list of trades to execute
        """
        trades = []
        
        tokens_to_sell = portfolio_comparison.get_tokens_to_sell()
        tokens_to_buy = portfolio_comparison.get_tokens_to_buy()
        
        logger.info(
            "Analyzing trade sequence",
            user_id=portfolio_comparison.user_id,
            tokens_to_sell=list(tokens_to_sell.keys()),
            tokens_to_buy=list(tokens_to_buy.keys()),
            sell_amounts={k: str(v) for k, v in tokens_to_sell.items()},
            buy_amounts={k: str(v) for k, v in tokens_to_buy.items()}
        )
        
        # Case 1: Simple direct swaps (FR-3 example case)
        # "If Target Portfolio is 100% JUP and user's vault is 100% USDC,
        # generate: Swap 100% of USDC for JUP"
        if len(tokens_to_sell) == 1 and len(tokens_to_buy) == 1:
            sell_token = list(tokens_to_sell.keys())[0]
            buy_token = list(tokens_to_buy.keys())[0]
            
            trade = await self._create_direct_swap(
                portfolio_comparison, sell_token, buy_token, 1  # Priority 1 (highest)
            )
            
            if trade:
                trades.append(trade)
                logger.info(
                    "Generated direct swap trade",
                    user_id=portfolio_comparison.user_id,
                    from_token=sell_token,
                    to_token=buy_token,
                    trade_description=trade.swap_instruction.swap_description
                )
        
        # Case 2: Multiple rebalancing trades
        else:
            # Create trades for each sell -> buy pair
            trade_priority = 1
            
            for sell_token, sell_amount in tokens_to_sell.items():
                # Find the best target token to buy
                buy_token = self._select_best_buy_target(sell_token, tokens_to_buy)
                
                if buy_token:
                    trade = await self._create_direct_swap(
                        portfolio_comparison, sell_token, buy_token, trade_priority
                    )
                    
                    if trade:
                        trades.append(trade)
                        trade_priority += 1
                        
                        logger.info(
                            "Generated rebalancing swap",
                            user_id=portfolio_comparison.user_id,
                            from_token=sell_token,
                            to_token=buy_token,
                            priority=trade.priority
                        )
                else:
                    logger.warning(
                        "No suitable buy target found for sell token",
                        user_id=portfolio_comparison.user_id,
                        sell_token=sell_token,
                        sell_amount=str(sell_amount)
                    )
        
        # Limit total number of trades
        if len(trades) > self.max_trades_per_rebalance:
            logger.warning(
                "Generated trades exceed maximum limit - keeping highest priority",
                user_id=portfolio_comparison.user_id,
                total_trades=len(trades),
                max_allowed=self.max_trades_per_rebalance
            )
            trades = trades[:self.max_trades_per_rebalance]
        
        return trades
    
    def _select_best_buy_target(
        self, 
        sell_token: str, 
        tokens_to_buy: Dict[str, Decimal]
    ) -> Optional[str]:
        """
        Select the best token to buy when selling a specific token.
        
        Args:
            sell_token: Token being sold
            tokens_to_buy: Available tokens to buy with amounts
            
        Returns:
            str: Best token to buy or None if no good match
        """
        if not tokens_to_buy:
            return None
        
        # Preference order:
        # 1. Largest buy amount (most significant rebalancing)
        # 2. USDC (most liquid)
        # 3. Any other token
        
        # Find token with largest buy amount
        largest_buy = max(tokens_to_buy.items(), key=lambda x: x[1])
        
        # Prefer USDC if it's a buy target and amount is significant
        if "USDC" in tokens_to_buy and tokens_to_buy["USDC"] > Decimal("10"):
            return "USDC"
        
        return largest_buy[0]
    
    async def _create_direct_swap(
        self,
        portfolio_comparison: PortfolioComparison,
        from_token: str,
        to_token: str,
        priority: int
    ) -> Optional[GeneratedTrade]:
        """
        Create a direct swap trade between two tokens.
        
        Args:
            portfolio_comparison: Portfolio comparison data
            from_token: Token to sell
            to_token: Token to buy
            priority: Trade execution priority
            
        Returns:
            GeneratedTrade: Created trade or None if not viable
        """
        user_portfolio = portfolio_comparison.current_portfolio
        
        # Get current holding for the token to sell
        from_holding = user_portfolio.get_holding(from_token)
        if not from_holding or not from_holding.is_significant:
            logger.warning(
                "Cannot create swap - insufficient holding",
                user_id=portfolio_comparison.user_id,
                from_token=from_token,
                holding_balance=str(from_holding.scaled_balance) if from_holding else "0"
            )
            return None
        
        # Calculate swap amount based on discrepancy
        discrepancy = portfolio_comparison.discrepancies.get(from_token, Decimal("0"))
        if discrepancy >= 0:  # This token should be bought, not sold
            logger.warning(
                "Cannot create swap - token has positive discrepancy",
                user_id=portfolio_comparison.user_id,
                from_token=from_token,
                discrepancy=str(discrepancy)
            )
            return None
        
        # Calculate swap amount (negative discrepancy = amount to sell)
        sell_amount_usd = abs(discrepancy)
        
        # Convert USD amount to token amount
        if not from_holding.usd_value or from_holding.usd_value <= 0:
            logger.warning(
                "Cannot calculate swap amount - no USD value for token",
                user_id=portfolio_comparison.user_id,
                from_token=from_token
            )
            return None
        
        # Calculate token amount to swap
        token_price = from_holding.usd_value / from_holding.scaled_balance
        swap_amount = sell_amount_usd / token_price
        
        # Ensure we don't swap more than we have
        available_balance = from_holding.scaled_balance
        swap_amount = min(swap_amount, available_balance)
        
        # Check minimum trade size
        if sell_amount_usd < self.min_trade_amount_usd:
            logger.info(
                "Skipping small trade below minimum threshold",
                user_id=portfolio_comparison.user_id,
                from_token=from_token,
                to_token=to_token,
                trade_amount_usd=str(sell_amount_usd),
                minimum_usd=str(self.min_trade_amount_usd)
            )
            return None
        
        # Get token mint addresses (placeholder - would query from metadata)
        from_mint = await self._get_token_mint_address(from_token)
        to_mint = await self._get_token_mint_address(to_token)
        
        if not from_mint or not to_mint:
            logger.error(
                "Cannot create swap - missing mint addresses",
                user_id=portfolio_comparison.user_id,
                from_token=from_token,
                to_token=to_token,
                from_mint=from_mint,
                to_mint=to_mint
            )
            return None
        
        # Create swap instruction
        swap_instruction = SwapInstruction(
            from_token_symbol=from_token,
            to_token_symbol=to_token,
            from_mint=from_mint,
            to_mint=to_mint,
            from_amount=swap_amount,
            max_slippage_percent=self.max_slippage_percent
        )
        
        # Create trade rationale
        percentage_to_swap = (swap_amount / available_balance) * Decimal("100")
        rationale = (
            f"Rebalance portfolio: Swap {percentage_to_swap:.1f}% of {from_token} "
            f"({swap_amount:.6f} tokens, ~${sell_amount_usd:.2f}) for {to_token} "
            f"to achieve target allocation"
        )
        
        # Create trade
        trade = GeneratedTrade(
            trade_id=str(uuid.uuid4()),
            user_id=portfolio_comparison.user_id,
            vault_address=portfolio_comparison.vault_address,
            trade_type=TradeType.SWAP,
            swap_instruction=swap_instruction,
            rationale=rationale,
            priority=priority
        )
        
        logger.info(
            "Created direct swap trade",
            user_id=portfolio_comparison.user_id,
            trade_id=trade.trade_id,
            from_token=from_token,
            to_token=to_token,
            swap_amount=str(swap_amount),
            usd_value=str(sell_amount_usd),
            priority=priority
        )
        
        return trade
    
    async def _get_token_mint_address(self, symbol: str) -> Optional[str]:
        """
        Get mint address for a token symbol.
        
        Args:
            symbol: Token symbol (e.g., "USDC", "JUP")
            
        Returns:
            str: Mint address or None if not found
        """
        # Common token mint addresses
        known_mints = {
            "SOL": "So11111111111111111111111111111111111111112",
            "USDC": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
            "JUP": "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN"
        }
        
        mint = known_mints.get(symbol.upper())
        
        if not mint:
            logger.warning(f"Unknown mint address for token symbol: {symbol}")
        
        return mint
    
    async def _assess_trade_risk(
        self,
        trade: GeneratedTrade,
        portfolio_comparison: PortfolioComparison,
        correlation_id: Optional[str] = None
    ):
        """
        Assess risk for a generated trade.
        
        Args:
            trade: Trade to assess
            portfolio_comparison: Portfolio context
        """
        risk_factors = {}
        risk_score = Decimal("0")
        
        # Factor 1: Trade size relative to portfolio
        if portfolio_comparison.current_portfolio.total_usd_value:
            trade_percentage = (abs(portfolio_comparison.discrepancies.get(
                trade.swap_instruction.from_token_symbol, Decimal("0")
            )) / portfolio_comparison.current_portfolio.total_usd_value) * Decimal("100")
            
            risk_factors["trade_size_percentage"] = float(trade_percentage)
            
            # Higher risk for larger trades
            if trade_percentage > 50:  # >50% of portfolio
                risk_score += Decimal("30")
            elif trade_percentage > 25:  # >25% of portfolio
                risk_score += Decimal("15")
            elif trade_percentage > 10:  # >10% of portfolio
                risk_score += Decimal("5")
        
        # Factor 2: Slippage risk
        slippage = trade.swap_instruction.max_slippage_percent
        risk_factors["max_slippage"] = float(slippage)
        
        if slippage > 2:  # >2% slippage
            risk_score += Decimal("20")
        elif slippage > 1:  # >1% slippage
            risk_score += Decimal("10")
        
        # Factor 3: Token pair liquidity risk (placeholder)
        from_token = trade.swap_instruction.from_token_symbol
        to_token = trade.swap_instruction.to_token_symbol
        
        # Higher risk for non-major token pairs
        major_tokens = {"SOL", "USDC", "USDT"}
        if from_token not in major_tokens or to_token not in major_tokens:
            risk_score += Decimal("15")
            risk_factors["non_major_tokens"] = True
        
        # Factor 4: Market conditions (placeholder)
        # In production, this would consider:
        # - Recent volatility
        # - Market hours
        # - Network congestion
        risk_factors["market_conditions"] = "normal"
        
        # Finalize risk assessment
        trade.risk_score = min(Decimal("100"), risk_score)
        trade.risk_factors = risk_factors
        
        # Log risk calculation using NFR-2 enhanced tracking
        calculation_inputs = {
            "trade_id": trade.trade_id,
            "from_token": trade.swap_instruction.from_token_symbol,
            "to_token": trade.swap_instruction.to_token_symbol,
            "portfolio_total_usd": str(portfolio_comparison.current_portfolio.total_usd_value),
            "trade_percentage": float(trade_percentage) if 'trade_percentage' in locals() else 0,
            "slippage_percent": float(trade.swap_instruction.max_slippage_percent),
            "risk_factors_input": risk_factors
        }
        
        calculation_outputs = {
            "final_risk_score": float(trade.risk_score),
            "risk_factors": risk_factors,
            "risk_category": "high" if trade.risk_score > 50 else "medium" if trade.risk_score > 20 else "low"
        }
        
        await self.audit_logger.log_calculation(
            calculation_type="trade_risk_assessment",
            inputs=calculation_inputs,
            outputs=calculation_outputs,
            user_id=trade.user_id,
            wallet_address=portfolio_comparison.vault_address,
            performance_metrics={"calculation_time_ms": 1.0},  # Placeholder - would measure actual time
            correlation_id=correlation_id
        )
        
        logger.info(
            "Trade risk assessment completed",
            trade_id=trade.trade_id,
            user_id=trade.user_id,
            risk_score=str(trade.risk_score),
            risk_factors=risk_factors
        )


# Global trade generator instance
trade_generator: Optional[TradeGenerator] = None


def get_trade_generator() -> TradeGenerator:
    """Get the global trade generator instance."""
    global trade_generator
    if trade_generator is None:
        trade_generator = TradeGenerator()
    return trade_generator