"""
System Orchestrator for XORJ Trade Execution Bot.

This module implements the core stateless, scheduled service architecture
as specified in the System Architecture. It coordinates all four integration
points: Intelligence Input, User Settings Input, On-Chain Action, and Audit Logging.

The orchestrator ensures:
- Stateless operation (no persistent state between runs)
- Secure integration with all external systems
- Comprehensive audit logging of all decisions
- Risk management on every operation
"""

import asyncio
import time
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime, timezone
from decimal import Decimal

import structlog
from app.core.config import get_config
from app.integrations.quantitative_engine import QuantitativeEngineClient, QuantitativeEngineResponse
from app.integrations.user_settings import UserSettingsClient, UserSettingsResponse, UserRiskProfile
from app.logging.audit_logger import get_audit_logger, AuditEventType, AuditSeverity
from app.models.trader_intelligence import RankedTrader, RiskProfile
from app.core.strategy_selector import get_strategy_selector, TargetPortfolio, StrategySelectionResult
from app.integrations.solana_client import get_solana_client
from app.models.portfolio import PortfolioComparison, TargetAllocation
from app.core.trade_generator import get_trade_generator
from app.execution.trade_executor import get_trade_executor


logger = structlog.get_logger(__name__)


class ExecutionCycleResult:
    """Result of a complete trade execution cycle."""
    
    def __init__(self):
        self.start_time = datetime.now(timezone.utc)
        self.end_time: Optional[datetime] = None
        
        # Intelligence gathering
        self.intelligence_success = False
        self.traders_retrieved = 0
        self.intelligence_error: Optional[str] = None
        
        # User settings
        self.user_settings_success = False
        self.active_users_found = 0
        self.user_settings_error: Optional[str] = None
        
        # Strategy selection and trade decisions  
        self.target_portfolios_created = 0
        self.strategy_selection_failures = 0
        
        # Portfolio reconciliation (FR-2)
        self.portfolios_read = 0
        self.portfolio_reconciliations = 0
        
        # Trade generation (FR-3)
        self.trade_decisions_made = 0
        self.trades_generated = 0
        
        # Trade execution (FR-4)
        self.trades_executed = 0
        self.trades_successful = 0
        self.trades_failed = 0
        
        # Risk management
        self.risk_checks_passed = 0
        self.risk_checks_failed = 0
        
        # Errors and warnings
        self.errors: List[str] = []
        self.warnings: List[str] = []
    
    @property
    def duration_seconds(self) -> float:
        """Get cycle duration in seconds."""
        end = self.end_time or datetime.now(timezone.utc)
        return (end - self.start_time).total_seconds()
    
    @property
    def success_rate(self) -> float:
        """Calculate overall success rate of the cycle."""
        if self.trades_executed == 0:
            return 1.0 if len(self.errors) == 0 else 0.0
        return self.trades_successful / self.trades_executed
    
    def add_error(self, error: str):
        """Add an error to the cycle result."""
        self.errors.append(error)
        logger.error("Execution cycle error", error=error)
    
    def add_warning(self, warning: str):
        """Add a warning to the cycle result."""
        self.warnings.append(warning)
        logger.warning("Execution cycle warning", warning=warning)
    
    def finalize(self):
        """Finalize the cycle result."""
        self.end_time = datetime.now(timezone.utc)


class SystemOrchestrator:
    """
    Core system orchestrator for XORJ Trade Execution Bot.
    
    This implements the stateless, scheduled service architecture with
    four key integration points as specified in the System Architecture:
    
    1. Input 1 (Intelligence): Poll XORJ Quantitative Engine
    2. Input 2 (User Settings): Read user risk profiles from database  
    3. Action (On-Chain): Execute trades via XORJ Vault Smart Contract
    4. Output (Logging): Write detailed audit logs
    
    Security Features:
    - Zero persistent state between execution cycles
    - Comprehensive input validation and sanitization
    - Risk management checks on every decision
    - Complete audit trail of all actions
    - Graceful error handling and recovery
    """
    
    def __init__(self):
        self.config = get_config()
        
        # Initialize integration clients
        self.quantitative_engine = QuantitativeEngineClient()
        self.user_settings = UserSettingsClient()
        self.audit_logger = get_audit_logger()
        
        # Initialize core components (FR-1 through FR-4) - will be properly initialized in async initialize()
        self.strategy_selector = get_strategy_selector()  # FR-1: Strategy Ingestion (sync)
        self.solana_client = None                         # FR-2: Portfolio Reading (async - initialized later)
        self.trade_generator = None                       # FR-3: Trade Generation (async - initialized later)
        self.trade_executor = None                        # FR-4: Trade Execution (async - initialized later)
        
        # System state (reset on each cycle)
        self.current_cycle_id: Optional[str] = None
        self.is_running = False
        self.emergency_stop_triggered = False
        
        logger.info("System Orchestrator initialized")
    
    async def initialize(self) -> bool:
        """
        Initialize all system components.
        
        Returns:
            bool: True if all components initialized successfully
        """
        logger.info("Initializing XORJ Trade Execution Bot system components")
        
        try:
            # Initialize audit logging first (required for all operations)
            if not await self.audit_logger.initialize():
                logger.critical("Failed to initialize audit logging - cannot proceed")
                return False
            
            # Initialize user settings database
            if not await self.user_settings.initialize():
                await self.audit_logger.log_error_event(
                    error_message="Failed to initialize user settings database",
                    error_type="initialization_error",
                    severity=AuditSeverity.CRITICAL
                )
                return False
            
            # Initialize async components that weren't initialized in constructor
            self.solana_client = await get_solana_client()  # Now properly await the async getter
            self.trade_executor = await get_trade_executor()  # Now properly await the async getter
            self.trade_generator = await get_trade_generator()  # Initialize trade generator properly
            
            # Initialize Solana client for blockchain interactions
            if not await self.solana_client.initialize():
                await self.audit_logger.log_error_event(
                    error_message="Failed to initialize Solana client",
                    error_type="initialization_error", 
                    severity=AuditSeverity.CRITICAL
                )
                return False
            
            
            # Validate production configuration if in production
            if self.config.is_production:
                try:
                    self.config.validate_production_config()
                    logger.info("Production configuration validated successfully")
                except Exception as e:
                    await self.audit_logger.log_error_event(
                        error_message=f"Production configuration validation failed: {str(e)}",
                        error_type="configuration_error",
                        severity=AuditSeverity.CRITICAL
                    )
                    return False
            
            # Perform health checks
            health_checks = await self._perform_health_checks()
            if not health_checks["overall_healthy"]:
                await self.audit_logger.log_error_event(
                    error_message="Health checks failed",
                    error_type="health_check_error",
                    severity=AuditSeverity.CRITICAL,
                    context_data=health_checks
                )
                return False
            
            logger.info("All system components initialized successfully")
            return True
            
        except Exception as e:
            logger.critical(
                "Critical error during system initialization",
                error=str(e),
                error_type=type(e).__name__
            )
            return False
    
    async def _perform_health_checks(self) -> Dict[str, Any]:
        """Perform comprehensive health checks on all integrations."""
        logger.info("Performing system health checks")
        
        health_status = {
            "quantitative_engine": False,
            "user_settings_database": False,
            "solana_client": False,
            "audit_logging": True,  # Already initialized if we're here
            "overall_healthy": False
        }
        
        try:
            # Check Quantitative Engine connectivity
            health_status["quantitative_engine"] = await self.quantitative_engine.health_check()
            
            # Check User Settings Database connectivity
            health_status["user_settings_database"] = await self.user_settings.health_check()
            
            # Check Solana Client connectivity
            health_status["solana_client"] = await self.solana_client.health_check()
            
            # Overall health determination
            required_healthy = ["quantitative_engine", "user_settings_database", "solana_client", "audit_logging"]
            health_status["overall_healthy"] = all(
                health_status.get(component, False) for component in required_healthy
            )
            
            logger.info(
                "Health check completed",
                **health_status
            )
            
            return health_status
            
        except Exception as e:
            logger.error("Health check failed with exception", error=str(e))
            health_status["overall_healthy"] = False
            return health_status
    
    async def execute_trading_cycle(self) -> ExecutionCycleResult:
        """
        Execute a complete trading cycle.
        
        This implements the core stateless operation:
        1. Fetch intelligence from Quantitative Engine
        2. Fetch user settings and risk profiles
        3. Make trade decisions based on intelligence and risk profiles
        4. Execute approved trades (placeholder for now)
        5. Log all decisions and actions
        
        Returns:
            ExecutionCycleResult: Complete result of the trading cycle
        """
        cycle_result = ExecutionCycleResult()
        self.current_cycle_id = f"cycle_{int(time.time())}"
        
        logger.info(
            "Starting trade execution cycle",
            cycle_id=self.current_cycle_id,
            environment=self.config.environment
        )
        
        # Log cycle start for audit trail
        await self.audit_logger.log_system_event(
            event_type=AuditEventType.SYSTEM_START,
            severity=AuditSeverity.INFO,
            event_data={
                "cycle_id": self.current_cycle_id,
                "cycle_start_time": cycle_result.start_time.isoformat(),
                "environment": self.config.environment
            },
            decision_rationale="Starting scheduled trade execution cycle"
        )
        
        try:
            # Step 1: Fetch Intelligence from Quantitative Engine
            logger.info("Step 1: Fetching intelligence from Quantitative Engine")
            intelligence_response = await self._fetch_trader_intelligence(cycle_result)
            
            if not intelligence_response.success:
                cycle_result.add_error(f"Intelligence fetch failed: {intelligence_response.error_message}")
                cycle_result.finalize()
                return cycle_result
            
            ranked_traders = intelligence_response.data or []
            cycle_result.intelligence_success = True
            cycle_result.traders_retrieved = len(ranked_traders)
            
            # Step 2: Fetch User Settings and Risk Profiles  
            logger.info("Step 2: Fetching user settings and risk profiles")
            user_settings_response = await self._fetch_user_settings(cycle_result)
            
            if not user_settings_response.success:
                cycle_result.add_error(f"User settings fetch failed: {user_settings_response.error_message}")
                cycle_result.finalize()
                return cycle_result
            
            active_users = user_settings_response.user_profiles or []
            cycle_result.user_settings_success = True
            cycle_result.active_users_found = len(active_users)
            
            # Step 3: Select Target Portfolios (FR-1: Strategy Ingestion)
            logger.info("Step 3: Selecting target portfolios for each user based on ranked traders")
            target_portfolios = await self._select_target_portfolios(ranked_traders, active_users, cycle_result)
            
            # Step 4: Portfolio Reconciliation (FR-2)
            logger.info("Step 4: Reading current vault holdings and performing portfolio reconciliation")
            portfolio_comparisons = await self._perform_portfolio_reconciliation(target_portfolios, cycle_result)
            
            # Step 5: Trade Generation (FR-3)
            logger.info("Step 5: Generating trades based on portfolio discrepancies")
            generated_trades = await self._generate_rebalancing_trades(portfolio_comparisons, cycle_result)
            
            # Step 6: Trade Execution (FR-4)
            logger.info("Step 6: Executing generated trades on-chain")
            await self._execute_trades_onchain(generated_trades, cycle_result)
            
            logger.info(
                "Trade execution cycle completed successfully",
                cycle_id=self.current_cycle_id,
                duration_seconds=cycle_result.duration_seconds,
                traders_retrieved=cycle_result.traders_retrieved,
                active_users=cycle_result.active_users_found,
                target_portfolios_created=cycle_result.target_portfolios_created,
                trades_executed=cycle_result.trades_executed,
                success_rate=cycle_result.success_rate
            )
            
        except Exception as e:
            error_msg = f"Critical error in trade execution cycle: {str(e)}"
            cycle_result.add_error(error_msg)
            
            await self.audit_logger.log_error_event(
                error_message=error_msg,
                error_type=type(e).__name__,
                severity=AuditSeverity.CRITICAL,
                context_data={
                    "cycle_id": self.current_cycle_id,
                    "cycle_duration": cycle_result.duration_seconds
                }
            )
            
            logger.critical(
                "Critical error in trade execution cycle",
                cycle_id=self.current_cycle_id,
                error=str(e),
                error_type=type(e).__name__
            )
        
        finally:
            cycle_result.finalize()
            
            # Log cycle completion
            await self.audit_logger.log_system_event(
                event_type=AuditEventType.SYSTEM_STOP,
                severity=AuditSeverity.INFO,
                event_data={
                    "cycle_id": self.current_cycle_id,
                    "cycle_end_time": cycle_result.end_time.isoformat(),
                    "duration_seconds": cycle_result.duration_seconds,
                    "success_rate": cycle_result.success_rate,
                    "trades_executed": cycle_result.trades_executed,
                    "errors_count": len(cycle_result.errors)
                },
                decision_rationale="Trade execution cycle completed"
            )
        
        return cycle_result
    
    async def _fetch_trader_intelligence(self, cycle_result: ExecutionCycleResult) -> QuantitativeEngineResponse:
        """Fetch ranked trader intelligence from Quantitative Engine."""
        try:
            response = await self.quantitative_engine.get_ranked_traders()
            
            # Log intelligence fetch for audit trail
            await self.audit_logger.log_system_event(
                event_type=AuditEventType.INTELLIGENCE_FETCH,
                severity=AuditSeverity.INFO if response.success else AuditSeverity.WARNING,
                event_data={
                    "success": response.success,
                    "traders_count": len(response.data) if response.data else 0,
                    "response_time_ms": response.response_time_ms,
                    "error_message": response.error_message
                },
                decision_rationale="Fetching latest ranked trader intelligence for trade decisions"
            )
            
            return response
            
        except Exception as e:
            error_msg = f"Exception during intelligence fetch: {str(e)}"
            cycle_result.intelligence_error = error_msg
            
            await self.audit_logger.log_error_event(
                error_message=error_msg,
                error_type=type(e).__name__,
                severity=AuditSeverity.ERROR
            )
            
            return QuantitativeEngineResponse(
                success=False,
                data=None,
                error_message=error_msg
            )
    
    async def _fetch_user_settings(self, cycle_result: ExecutionCycleResult) -> UserSettingsResponse:
        """Fetch user settings and risk profiles from database."""
        try:
            response = await self.user_settings.get_active_user_profiles()
            
            # Log user settings fetch for audit trail
            await self.audit_logger.log_system_event(
                event_type=AuditEventType.USER_SETTINGS_FETCH,
                severity=AuditSeverity.INFO if response.success else AuditSeverity.WARNING,
                event_data={
                    "success": response.success,
                    "active_users_count": len(response.user_profiles) if response.user_profiles else 0,
                    "query_time_ms": response.query_time_ms,
                    "error_message": response.error_message
                },
                decision_rationale="Fetching active user risk profiles for trade personalization"
            )
            
            return response
            
        except Exception as e:
            error_msg = f"Exception during user settings fetch: {str(e)}"
            cycle_result.user_settings_error = error_msg
            
            await self.audit_logger.log_error_event(
                error_message=error_msg,
                error_type=type(e).__name__,
                severity=AuditSeverity.ERROR
            )
            
            return UserSettingsResponse(
                success=False,
                error_message=error_msg
            )
    
    async def _make_trade_decisions(
        self, 
        ranked_traders: List[RankedTrader], 
        active_users: List[UserRiskProfile],
        cycle_result: ExecutionCycleResult
    ):
        """
        Make trade decisions based on ranked traders and user risk profiles.
        
        This is the core intelligence-to-action translation logic.
        """
        logger.info(
            "Making trade decisions",
            ranked_traders_count=len(ranked_traders),
            active_users_count=len(active_users)
        )
        
        if not ranked_traders:
            cycle_result.add_warning("No ranked traders available for replication")
            return
        
        if not active_users:
            cycle_result.add_warning("No active users found for trade execution")
            return
        
        # Filter traders eligible for replication
        eligible_traders = [
            trader for trader in ranked_traders 
            if trader.is_eligible_for_replication
        ]
        
        logger.info(
            "Filtered eligible traders",
            total_traders=len(ranked_traders),
            eligible_traders=len(eligible_traders)
        )
        
        # Make decisions for each active user
        for user in active_users:
            try:
                await self._make_user_trade_decisions(user, eligible_traders, cycle_result)
            except Exception as e:
                error_msg = f"Error making trade decisions for user {user.user_id}: {str(e)}"
                cycle_result.add_error(error_msg)
                
                await self.audit_logger.log_error_event(
                    error_message=error_msg,
                    error_type=type(e).__name__,
                    severity=AuditSeverity.ERROR,
                    user_id=user.user_id,
                    wallet_address=user.wallet_address
                )
    
    async def _make_user_trade_decisions(
        self,
        user: UserRiskProfile,
        eligible_traders: List[RankedTrader],
        cycle_result: ExecutionCycleResult
    ):
        """Make trade decisions for a specific user based on their risk profile."""
        if not eligible_traders:
            logger.info(
                "No eligible traders for user",
                user_id=user.user_id,
                risk_profile=user.risk_profile.value
            )
            return
        
        # Calculate replication weights based on user's risk profile
        trader_weights = {}
        for trader in eligible_traders:
            weight = trader.get_replication_weight(user.risk_profile)
            if weight > 0:
                trader_weights[trader.wallet_address] = weight
        
        if not trader_weights:
            logger.info(
                "No traders meet replication criteria for user",
                user_id=user.user_id,
                risk_profile=user.risk_profile.value
            )
            return
        
        # Select top traders for replication (limit to top 5)
        sorted_traders = sorted(
            trader_weights.items(),
            key=lambda x: x[1],
            reverse=True
        )[:5]
        
        # Create trade decisions for selected traders
        for trader_address, weight in sorted_traders:
            trader = next(t for t in eligible_traders if t.wallet_address == trader_address)
            
            # Perform risk assessment
            risk_assessment = await self._assess_trade_risk(user, trader, weight)
            
            if risk_assessment["approved"]:
                decision_data = {
                    "trader_rank": trader.rank,
                    "trust_score": float(trader.trust_score.score),
                    "replication_weight": float(weight),
                    "position_size_sol": float(risk_assessment["position_size_sol"]),
                    "risk_level": trader.trust_score.risk_assessment
                }
                
                decision_rationale = (
                    f"Approved replication of trader rank #{trader.rank} "
                    f"(trust score: {trader.trust_score.score}) "
                    f"for {user.risk_profile.value} risk profile user"
                )
                
                # Log trade decision
                await self.audit_logger.log_trade_decision(
                    user_id=user.user_id,
                    wallet_address=user.wallet_address,
                    trader_address=trader.wallet_address,
                    decision_data=decision_data,
                    decision_rationale=decision_rationale,
                    risk_assessment=risk_assessment
                )
                
                cycle_result.trade_decisions_made += 1
                cycle_result.risk_checks_passed += 1
                
                logger.info(
                    "Trade decision approved",
                    user_id=user.user_id,
                    trader_address=trader.wallet_address[:10] + "...",
                    trader_rank=trader.rank,
                    position_size=risk_assessment["position_size_sol"]
                )
            else:
                cycle_result.risk_checks_failed += 1
                
                logger.info(
                    "Trade decision rejected by risk assessment",
                    user_id=user.user_id,
                    trader_address=trader.wallet_address[:10] + "...",
                    rejection_reason=risk_assessment["rejection_reason"]
                )
    
    async def _assess_trade_risk(
        self,
        user: UserRiskProfile,
        trader: RankedTrader,
        weight: Decimal
    ) -> Dict[str, Any]:
        """
        Perform comprehensive risk assessment for a trade decision.
        
        Returns:
            Dict containing risk assessment results and approval decision
        """
        risk_assessment = {
            "approved": False,
            "rejection_reason": None,
            "position_size_sol": Decimal("0"),
            "risk_score": 0.0,
            "confidence_level": float(trader.trust_score.confidence_level)
        }
        
        # Calculate position size based on weight and user limits
        base_position_size = user.max_position_size_sol * weight
        
        # Apply additional risk constraints
        if trader.trust_score.risk_assessment == "high":
            base_position_size *= Decimal("0.5")  # Reduce position for high-risk traders
        
        # Ensure position size doesn't exceed user limits
        position_size_sol = min(base_position_size, user.max_position_size_sol)
        
        # Risk checks
        if position_size_sol < Decimal("0.01"):  # Minimum viable position
            risk_assessment["rejection_reason"] = "Position size too small (< 0.01 SOL)"
            return risk_assessment
        
        if trader.trust_score.score < 70:  # Minimum trust score
            risk_assessment["rejection_reason"] = f"Trust score too low: {trader.trust_score.score}"
            return risk_assessment
        
        if trader.trust_score.confidence_level < 60:  # Minimum confidence
            risk_assessment["rejection_reason"] = f"Confidence level too low: {trader.trust_score.confidence_level}"
            return risk_assessment
        
        # Emergency stop check
        if self.emergency_stop_triggered:
            risk_assessment["rejection_reason"] = "Emergency stop is active"
            return risk_assessment
        
        # Approve trade
        risk_assessment.update({
            "approved": True,
            "position_size_sol": position_size_sol,
            "risk_score": self._calculate_risk_score(trader),
            "risk_factors": {
                "trader_risk_level": trader.trust_score.risk_assessment,
                "user_risk_profile": user.risk_profile.value,
                "position_size_ratio": float(position_size_sol / user.max_position_size_sol),
                "trust_score": float(trader.trust_score.score)
            }
        })
        
        return risk_assessment
    
    def _calculate_risk_score(self, trader: RankedTrader) -> float:
        """Calculate overall risk score for a trader (0-100, lower is better)."""
        base_risk = 100 - float(trader.trust_score.score)  # Inverse of trust score
        
        # Adjust based on risk assessment
        risk_multipliers = {
            "low": 0.8,
            "medium": 1.0,
            "high": 1.3
        }
        
        multiplier = risk_multipliers.get(trader.trust_score.risk_assessment.lower(), 1.0)
        return min(100, base_risk * multiplier)
    
    async def _select_target_portfolios(
        self,
        ranked_traders: List[RankedTrader],
        active_users: List[UserRiskProfile],
        cycle_result: ExecutionCycleResult
    ) -> List[TargetPortfolio]:
        """
        Select target portfolios for each active user based on ranked traders.
        
        This implements FR-1: Strategy Ingestion
        "select the single, top-ranked trader whose XORJTrustScore meets 
        the threshold defined by the user's selected riskProfile"
        
        Args:
            ranked_traders: List of ranked traders from Quantitative Engine
            active_users: List of active users with risk profiles
            cycle_result: Execution cycle result to update
            
        Returns:
            List[TargetPortfolio]: Target portfolios for users who have eligible traders
        """
        logger.info(
            "Selecting target portfolios using FR-1 strategy ingestion logic",
            ranked_traders_count=len(ranked_traders),
            active_users_count=len(active_users)
        )
        
        target_portfolios = []
        
        if not ranked_traders:
            cycle_result.add_warning("No ranked traders available for target portfolio selection")
            return target_portfolios
        
        if not active_users:
            cycle_result.add_warning("No active users found for target portfolio selection")
            return target_portfolios
        
        # Select target portfolio for each active user
        for user in active_users:
            try:
                logger.info(
                    "Selecting target portfolio for user",
                    user_id=user.user_id,
                    risk_profile=user.risk_profile.value,
                    max_position_size=float(user.max_position_size_sol)
                )
                
                # Use strategy selector to find target portfolio
                selection_result = await self.strategy_selector.select_target_portfolio(
                    ranked_traders=ranked_traders,
                    user_profile=user
                )
                
                if selection_result.success and selection_result.target_portfolio:
                    target_portfolios.append(selection_result.target_portfolio)
                    cycle_result.target_portfolios_created += 1
                    
                    logger.info(
                        "Target portfolio selected for user",
                        user_id=user.user_id,
                        selected_trader_rank=selection_result.target_portfolio.trader_rank,
                        trust_score=float(selection_result.target_portfolio.trust_score),
                        threshold_met=True
                    )
                else:
                    cycle_result.strategy_selection_failures += 1
                    
                    logger.warning(
                        "No suitable target portfolio found for user",
                        user_id=user.user_id,
                        risk_profile=user.risk_profile.value,
                        error_message=selection_result.error_message,
                        traders_evaluated=selection_result.total_traders_evaluated,
                        eligible_traders=selection_result.eligible_traders_found
                    )
                    
            except Exception as e:
                error_msg = f"Error selecting target portfolio for user {user.user_id}: {str(e)}"
                cycle_result.add_error(error_msg)
                cycle_result.strategy_selection_failures += 1
                
                await self.audit_logger.log_error_event(
                    error_message=error_msg,
                    error_type=type(e).__name__,
                    severity=AuditSeverity.ERROR,
                    user_id=user.user_id,
                    wallet_address=user.wallet_address
                )
        
        logger.info(
            "Target portfolio selection completed",
            target_portfolios_created=len(target_portfolios),
            selection_failures=cycle_result.strategy_selection_failures,
            success_rate=len(target_portfolios) / len(active_users) if active_users else 0
        )
        
        return target_portfolios
    
    async def _make_trade_decisions_from_portfolios(
        self,
        target_portfolios: List[TargetPortfolio],
        cycle_result: ExecutionCycleResult
    ):
        """
        Make specific trade decisions based on target portfolios.
        
        Args:
            target_portfolios: List of target portfolios selected for users
            cycle_result: Execution cycle result to update
        """
        logger.info(
            "Making trade decisions from target portfolios",
            target_portfolios_count=len(target_portfolios)
        )
        
        if not target_portfolios:
            cycle_result.add_warning("No target portfolios available for trade decisions")
            return
        
        # Process each target portfolio
        for portfolio in target_portfolios:
            try:
                await self._make_trade_decisions_for_portfolio(portfolio, cycle_result)
            except Exception as e:
                error_msg = f"Error making trade decisions for portfolio {portfolio.trader_wallet_address[:10]}: {str(e)}"
                cycle_result.add_error(error_msg)
                
                await self.audit_logger.log_error_event(
                    error_message=error_msg,
                    error_type=type(e).__name__,
                    severity=AuditSeverity.ERROR,
                    trader_address=portfolio.trader_wallet_address
                )
    
    async def _make_trade_decisions_for_portfolio(
        self,
        target_portfolio: TargetPortfolio,
        cycle_result: ExecutionCycleResult
    ):
        """
        Make trade decisions for a specific target portfolio.
        
        Args:
            target_portfolio: Target portfolio to process
            cycle_result: Execution cycle result to update
        """
        logger.info(
            "Processing target portfolio for trade decisions",
            trader_rank=target_portfolio.trader_rank,
            trust_score=float(target_portfolio.trust_score),
            risk_profile=target_portfolio.user_risk_profile.value
        )
        
        # Perform comprehensive risk assessment
        risk_assessment = await self._assess_portfolio_risk(target_portfolio)
        
        if risk_assessment["approved"]:
            # Create trade decision based on target portfolio
            decision_data = {
                "target_portfolio": target_portfolio.to_dict(),
                "risk_assessment": risk_assessment,
                "decision_type": "target_portfolio_replication",
                "trader_selection_method": "fr1_threshold_based"
            }
            
            decision_rationale = (
                f"Approved trade execution for target portfolio: "
                f"Rank #{target_portfolio.trader_rank} trader "
                f"(trust score: {target_portfolio.trust_score}) "
                f"selected via FR-1 threshold-based selection "
                f"for {target_portfolio.user_risk_profile.value} risk profile"
            )
            
            # Log trade decision with comprehensive details
            await self.audit_logger.log_trade_decision(
                user_id="portfolio_based",  # Portfolio-based decision
                wallet_address=target_portfolio.trader_wallet_address,
                trader_address=target_portfolio.trader_wallet_address,
                decision_data=decision_data,
                decision_rationale=decision_rationale,
                risk_assessment=risk_assessment
            )
            
            cycle_result.trade_decisions_made += 1
            cycle_result.risk_checks_passed += 1
            
            logger.info(
                "Trade decision approved for target portfolio",
                trader_address=target_portfolio.trader_wallet_address[:10] + "...",
                trader_rank=target_portfolio.trader_rank,
                risk_score=risk_assessment.get("risk_score", 0)
            )
        else:
            cycle_result.risk_checks_failed += 1
            
            logger.info(
                "Trade decision rejected by risk assessment",
                trader_address=target_portfolio.trader_wallet_address[:10] + "...",
                trader_rank=target_portfolio.trader_rank,
                rejection_reason=risk_assessment["rejection_reason"]
            )
    
    async def _assess_portfolio_risk(self, target_portfolio: TargetPortfolio) -> Dict[str, Any]:
        """
        Perform comprehensive risk assessment for a target portfolio.
        
        Args:
            target_portfolio: Target portfolio to assess
            
        Returns:
            Dict containing risk assessment results and approval decision
        """
        risk_assessment = {
            "approved": False,
            "rejection_reason": None,
            "risk_score": 0.0,
            "confidence_level": float(target_portfolio.selected_trader.trust_score.confidence_level),
            "portfolio_risk_metrics": target_portfolio.risk_metrics
        }
        
        trader = target_portfolio.selected_trader
        
        # Portfolio-level risk checks
        if target_portfolio.trust_score < target_portfolio.trust_score_threshold:
            risk_assessment["rejection_reason"] = f"Trust score {target_portfolio.trust_score} below threshold {target_portfolio.trust_score_threshold}"
            return risk_assessment
        
        if trader.trust_score.confidence_level < 60:
            risk_assessment["rejection_reason"] = f"Confidence level too low: {trader.trust_score.confidence_level}"
            return risk_assessment
        
        # Emergency stop check
        if self.emergency_stop_triggered:
            risk_assessment["rejection_reason"] = "Emergency stop is active"
            return risk_assessment
        
        # Calculate portfolio risk score
        portfolio_risk_score = self._calculate_portfolio_risk_score(target_portfolio)
        
        # Check if portfolio risk is acceptable
        max_acceptable_risk = {
            RiskProfile.CONSERVATIVE: 20.0,  # Very low risk tolerance
            RiskProfile.MODERATE: 40.0,      # Moderate risk tolerance
            RiskProfile.AGGRESSIVE: 70.0     # High risk tolerance
        }.get(target_portfolio.user_risk_profile, 40.0)
        
        if portfolio_risk_score > max_acceptable_risk:
            risk_assessment["rejection_reason"] = f"Portfolio risk score {portfolio_risk_score} exceeds limit {max_acceptable_risk}"
            return risk_assessment
        
        # Approve portfolio
        risk_assessment.update({
            "approved": True,
            "risk_score": portfolio_risk_score,
            "max_acceptable_risk": max_acceptable_risk,
            "risk_factors": {
                "trust_score": float(target_portfolio.trust_score),
                "confidence_level": float(trader.trust_score.confidence_level),
                "trader_risk_level": trader.trust_score.risk_assessment,
                "user_risk_profile": target_portfolio.user_risk_profile.value,
                "portfolio_selection_method": "fr1_threshold_based"
            }
        })
        
        return risk_assessment
    
    def _calculate_portfolio_risk_score(self, target_portfolio: TargetPortfolio) -> float:
        """Calculate overall risk score for a target portfolio (0-100, lower is better)."""
        trader = target_portfolio.selected_trader
        
        # Base risk from trust score (inverse relationship)
        base_risk = 100 - float(trader.trust_score.score)
        
        # Adjust based on trader's risk assessment
        risk_multipliers = {
            "low": 0.7,
            "medium": 1.0,
            "high": 1.4
        }
        
        trader_risk_multiplier = risk_multipliers.get(trader.trust_score.risk_assessment.lower(), 1.0)
        
        # Adjust based on user risk profile (conservative users get lower risk scores)
        user_risk_multipliers = {
            RiskProfile.CONSERVATIVE: 0.8,
            RiskProfile.MODERATE: 1.0,
            RiskProfile.AGGRESSIVE: 1.2
        }
        
        user_risk_multiplier = user_risk_multipliers.get(target_portfolio.user_risk_profile, 1.0)
        
        # Calculate final risk score
        final_risk_score = base_risk * trader_risk_multiplier * user_risk_multiplier
        
        return min(100.0, max(0.0, final_risk_score))
    
    async def _perform_portfolio_reconciliation(
        self,
        target_portfolios: List[TargetPortfolio],
        cycle_result: ExecutionCycleResult
    ) -> List[PortfolioComparison]:
        """
        Perform portfolio reconciliation for each target portfolio.
        
        Implements FR-2: Portfolio Reconciliation
        "read the vault's current token holdings from the Solana blockchain
        and compare the user's current portfolio against the Target Portfolio"
        
        Args:
            target_portfolios: Target portfolios from FR-1 strategy selection
            cycle_result: Execution cycle result to update
            
        Returns:
            List[PortfolioComparison]: Portfolio comparisons showing discrepancies
        """
        logger.info(
            "Performing portfolio reconciliation (FR-2)",
            target_portfolios_count=len(target_portfolios)
        )
        
        portfolio_comparisons = []
        
        for target_portfolio in target_portfolios:
            try:
                # Step 1: Read current vault holdings from Solana blockchain
                logger.info(
                    "Reading vault holdings from blockchain",
                    trader_wallet=target_portfolio.trader_wallet_address[:10] + "...",
                    user_risk_profile=target_portfolio.user_risk_profile.value
                )
                
                # Use the actual user's vault address and user ID instead of trader's wallet
                vault_address = target_portfolio.user_vault_address
                user_id = target_portfolio.user_id
                
                current_portfolio = await self.solana_client.read_vault_holdings(
                    vault_address=vault_address,
                    user_id=user_id
                )
                
                if not current_portfolio:
                    cycle_result.add_error(f"Failed to read vault holdings for {vault_address}")
                    continue
                
                cycle_result.portfolios_read += 1
                
                # Step 2: Convert target portfolio to target allocations
                target_allocations = self._convert_target_portfolio_to_allocations(target_portfolio)
                
                # Step 3: Compare current vs target portfolio
                comparison = PortfolioComparison(
                    user_id=user_id,
                    vault_address=vault_address,
                    current_portfolio=current_portfolio,
                    target_allocations=target_allocations
                )
                
                portfolio_comparisons.append(comparison)
                cycle_result.portfolio_reconciliations += 1
                
                logger.info(
                    "Portfolio reconciliation completed",
                    user_id=user_id,
                    vault_address=vault_address[:10] + "...",
                    rebalance_required=comparison.rebalance_required,
                    total_rebalance_amount=str(comparison.total_rebalance_amount),
                    discrepancies_count=len(comparison.discrepancies)
                )
                
            except Exception as e:
                error_msg = f"Portfolio reconciliation failed for target portfolio: {str(e)}"
                cycle_result.add_error(error_msg)
                
                logger.error(
                    error_msg,
                    trader_address=target_portfolio.trader_wallet_address[:10] + "...",
                    error_type=type(e).__name__
                )
        
        logger.info(
            "Portfolio reconciliation phase completed",
            successful_reconciliations=len(portfolio_comparisons),
            total_portfolios=len(target_portfolios)
        )
        
        return portfolio_comparisons
    
    def _convert_target_portfolio_to_allocations(self, target_portfolio: TargetPortfolio) -> List[TargetAllocation]:
        """
        Convert target portfolio to target allocation list.
        
        Args:
            target_portfolio: Target portfolio from strategy selection
            
        Returns:
            List[TargetAllocation]: Target allocations for comparison
        """
        # For the FR-3 example: "100% JUP target portfolio"
        # In production, this would parse the actual target portfolio allocations
        
        # Create target allocation based on the selected trader's strategy
        # For now, create a simple allocation based on the example in FR-3
        
        target_allocations = []
        
        # Example: If target is 100% JUP (as per FR-3 example)
        if "JUP" in str(target_portfolio.target_allocation):
            target_allocation = TargetAllocation(
                symbol="JUP",
                mint_address="JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
                target_percentage=Decimal("100.0")
            )
            target_allocations.append(target_allocation)
        else:
            # Default allocation based on risk profile
            if target_portfolio.user_risk_profile == RiskProfile.CONSERVATIVE:
                # Conservative: 70% USDC, 30% SOL
                target_allocations.extend([
                    TargetAllocation("USDC", "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", Decimal("70.0")),
                    TargetAllocation("SOL", "So11111111111111111111111111111111111111112", Decimal("30.0"))
                ])
            elif target_portfolio.user_risk_profile == RiskProfile.AGGRESSIVE:
                # Aggressive: 100% of selected trader's top token
                target_allocations.append(
                    TargetAllocation("JUP", "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN", Decimal("100.0"))
                )
            else:  # MODERATE
                # Moderate: 50% USDC, 50% of selected token
                target_allocations.extend([
                    TargetAllocation("USDC", "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", Decimal("50.0")),
                    TargetAllocation("JUP", "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN", Decimal("50.0"))
                ])
        
        logger.debug(
            "Target allocations created",
            allocations_count=len(target_allocations),
            allocations=[ta.to_dict() for ta in target_allocations]
        )
        
        return target_allocations
    
    async def _generate_rebalancing_trades(
        self,
        portfolio_comparisons: List[PortfolioComparison],
        cycle_result: ExecutionCycleResult
    ) -> List:
        """
        Generate trades to rebalance portfolios based on discrepancies.
        
        Implements FR-3: Trade Generation Logic
        "calculate the necessary swaps to rebalance the user's vault"
        
        Args:
            portfolio_comparisons: Portfolio discrepancies from FR-2
            cycle_result: Execution cycle result to update
            
        Returns:
            List: All generated trades ready for execution
        """
        logger.info(
            "Generating rebalancing trades (FR-3)",
            portfolio_comparisons_count=len(portfolio_comparisons)
        )
        
        all_generated_trades = []
        
        for comparison in portfolio_comparisons:
            try:
                # Generate trades for this portfolio comparison
                trade_result = await self.trade_generator.generate_trades(comparison)
                
                if trade_result.success:
                    all_generated_trades.extend(trade_result.trades)
                    cycle_result.trades_generated += len(trade_result.trades)
                    
                    logger.info(
                        "Trades generated for portfolio",
                        user_id=comparison.user_id,
                        vault_address=comparison.vault_address[:10] + "...",
                        trades_generated=len(trade_result.trades),
                        executable_trades=trade_result.executable_trades_count
                    )
                    
                    # Log trade generation for audit
                    await self.audit_logger.log_trade_decision(
                        user_id=comparison.user_id,
                        wallet_address=comparison.vault_address,
                        trader_address="rebalancing_system",
                        decision_data={
                            "trades_generated": len(trade_result.trades),
                            "rebalance_required": trade_result.rebalance_required,
                            "total_rebalance_amount": str(trade_result.total_rebalance_amount_usd),
                            "fr3_implementation": True
                        },
                        decision_rationale=f"Generated {len(trade_result.trades)} trades via FR-3 logic to rebalance portfolio",
                        risk_assessment={
                            "total_trades": len(trade_result.trades),
                            "executable_trades": trade_result.executable_trades_count
                        }
                    )
                else:
                    cycle_result.add_error(f"Trade generation failed for {comparison.user_id}: {trade_result.error_message}")
                    
            except Exception as e:
                error_msg = f"Trade generation failed for {comparison.user_id}: {str(e)}"
                cycle_result.add_error(error_msg)
                
                logger.error(
                    error_msg,
                    user_id=comparison.user_id,
                    error_type=type(e).__name__
                )
        
        logger.info(
            "Trade generation phase completed",
            total_trades_generated=len(all_generated_trades),
            unique_users=len(portfolio_comparisons)
        )
        
        return all_generated_trades
    
    async def _execute_trades_onchain(
        self,
        generated_trades: List,
        cycle_result: ExecutionCycleResult
    ):
        """
        Execute generated trades on-chain via smart contracts.
        
        Implements FR-4: Smart Contract Interaction & Execution
        "construct a valid Solana transaction, sign with delegated authority,
        and send to Solana network for execution"
        
        Args:
            generated_trades: Generated trades from FR-3
            cycle_result: Execution cycle result to update
        """
        logger.info(
            "Executing trades on-chain (FR-4)", 
            trades_to_execute=len(generated_trades)
        )
        
        if not generated_trades:
            logger.info("No trades to execute")
            return
        
        # Filter to executable trades only
        executable_trades = [t for t in generated_trades if t.is_executable]
        
        logger.info(
            "Filtered executable trades",
            total_trades=len(generated_trades),
            executable_trades=len(executable_trades)
        )
        
        if not executable_trades:
            cycle_result.add_warning("No executable trades found despite trade generation")
            return
        
        # Execute trades using the trade executor
        try:
            execution_results = await self.trade_executor.execute_trade_batch(
                executable_trades,
                max_concurrent=3  # Limit concurrent executions
            )
            
            # Process execution results
            for result in execution_results:
                cycle_result.trades_executed += 1
                
                if result.success:
                    cycle_result.trades_successful += 1
                    
                    logger.info(
                        "Trade executed successfully",
                        trade_id=result.trade.trade_id,
                        user_id=result.trade.user_id,
                        transaction_signature=result.transaction_signature,
                        swap_description=result.trade.swap_instruction.swap_description
                    )
                else:
                    cycle_result.trades_failed += 1
                    
                    logger.error(
                        "Trade execution failed",
                        trade_id=result.trade.trade_id,
                        user_id=result.trade.user_id,
                        error=result.error_message
                    )
            
            logger.info(
                "Trade execution phase completed",
                trades_executed=cycle_result.trades_executed,
                successful_trades=cycle_result.trades_successful,
                failed_trades=cycle_result.trades_failed,
                success_rate=f"{(cycle_result.trades_successful/cycle_result.trades_executed*100):.1f}%" if cycle_result.trades_executed > 0 else "0%"
            )
            
        except Exception as e:
            error_msg = f"Trade execution batch failed: {str(e)}"
            cycle_result.add_error(error_msg)
            
            logger.error(
                error_msg,
                trades_count=len(executable_trades),
                error_type=type(e).__name__
            )
    
    async def _execute_trades(self, cycle_result: ExecutionCycleResult):
        """
        Execute approved trades via XORJ Vault Smart Contract.
        
        NOTE: This is a placeholder implementation. The actual trade execution
        will be implemented when we receive the next section of the PRD.
        """
        logger.info("Trade execution placeholder - awaiting implementation details")
        
        # For now, we simulate successful trade execution
        if cycle_result.trade_decisions_made > 0:
            # Simulate trade execution
            cycle_result.trades_executed = cycle_result.trade_decisions_made
            cycle_result.trades_successful = cycle_result.trade_decisions_made
            
            logger.info(
                "Simulated trade execution",
                trades_executed=cycle_result.trades_executed,
                trades_successful=cycle_result.trades_successful
            )
    
    async def shutdown(self):
        """Shutdown the system orchestrator and all components."""
        logger.info("Shutting down System Orchestrator")
        
        self.is_running = False
        
        # Close all integrations
        await self.user_settings.close()
        await self.audit_logger.close()
        
        logger.info("System Orchestrator shutdown complete")


# Global orchestrator instance
orchestrator: Optional[SystemOrchestrator] = None


def get_orchestrator() -> SystemOrchestrator:
    """Get the global system orchestrator instance."""
    global orchestrator
    if orchestrator is None:
        orchestrator = SystemOrchestrator()
    return orchestrator