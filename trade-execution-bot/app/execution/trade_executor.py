"""
Trade Execution Engine for XORJ Trade Execution Bot.

Implements FR-4: Smart Contract Interaction & Execution
- Construct valid Solana transactions for swaps
- Sign transactions using delegated authority private key
- Send signed transactions to Solana network
- Monitor execution and handle results

This is the core execution engine that translates generated trades
into actual on-chain transactions via the XORJ Vault Smart Contract
and Raydium/Jupiter DEX protocols.

Security Features:
- Transaction simulation before execution
- Slippage protection and validation
- Comprehensive error handling
- Audit logging of all execution attempts
- Emergency stop functionality
"""

import asyncio
import json
from typing import List, Dict, Optional, Any
from decimal import Decimal
from datetime import datetime, timezone

import structlog
from solana.transaction import Transaction
from solana.system_program import SYS_PROGRAM_ID
from solana.publickey import PublicKey
from solders.instruction import Instruction
from solders.pubkey import Pubkey

from app.core.config import get_config
from app.models.trades import GeneratedTrade, TradeStatus
from app.integrations.solana_client import get_solana_client, SolanaTransactionResult
from app.logging.audit_logger import get_audit_logger, AuditEventType, AuditSeverity
from app.security.hsm_manager import get_hsm_manager, HSMSigningError, HSMConnectionError
from app.security.slippage_controller import get_slippage_controller, SlippageViolationType
from app.security.confirmation_monitor import get_confirmation_monitor, TransactionState
from app.security.circuit_breakers import get_circuit_breaker_manager, CircuitBreakerType
from app.security.kill_switch import get_global_kill_switch
from app.core.idempotency import get_idempotency_manager


logger = structlog.get_logger(__name__)


class TradeExecutionResult:
    """Result of trade execution attempt."""
    
    def __init__(self, trade: GeneratedTrade):
        self.trade = trade
        self.success = False
        self.transaction_signature: Optional[str] = None
        self.error_message: Optional[str] = None
        self.execution_time_seconds: Optional[float] = None
        self.gas_used: Optional[int] = None
        self.final_status: TradeStatus = TradeStatus.FAILED
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for logging."""
        return {
            "trade_id": self.trade.trade_id,
            "success": self.success,
            "transaction_signature": self.transaction_signature,
            "error_message": self.error_message,
            "execution_time_seconds": self.execution_time_seconds,
            "gas_used": self.gas_used,
            "final_status": self.final_status.value,
            "trade_details": self.trade.to_dict()
        }


class TradeExecutor:
    """
    Core trade execution engine for XORJ Trade Execution Bot.
    
    Implements FR-4: Smart Contract Interaction & Execution
    
    Execution Process:
    0. Global kill switch validation (SR-5) - Ultimate override
    1. Circuit breaker validation (SR-4) 
    2. Pre-execution validation
    3. Strict slippage validation (SR-2)
    4. Construct Solana transaction for swap via vault contract
    5. Sign transaction using HSM-managed delegated authority (SR-1)
    6. Simulate transaction to verify it will succeed
    7. Send transaction to Solana network
    8. Monitor confirmation and handle results (SR-3)
    
    Integration Points:
    - XORJ Vault Smart Contract: User fund management
    - Raydium DEX: Token swap execution
    - Jupiter Aggregator: Best price routing
    - Solana Network: Transaction broadcasting
    """
    
    def __init__(self):
        self.config = get_config()
        self.solana_client = get_solana_client()
        self.audit_logger = get_audit_logger()
        self.hsm_manager = None  # Will be initialized async
        self.slippage_controller = get_slippage_controller()
        self.confirmation_monitor = None  # Will be initialized async
        self.circuit_breaker_manager = None  # Will be initialized async
        self.kill_switch = None  # Will be initialized async
        self.idempotency_manager = None  # Will be initialized async
        
        # Execution settings
        self.max_execution_time_seconds = 120  # 2 minutes max per trade
        self.simulation_required = True
        self.emergency_stop_active = False
        
        # Contract addresses
        self.vault_program_id = self.config.vault_program_id
        
        logger.info(
            "Trade Executor initialized",
            vault_program_id=self.vault_program_id,
            simulation_required=self.simulation_required,
            hsm_provider=self.config.hsm_provider
        )
    
    async def initialize(self) -> bool:
        """
        Initialize TradeExecutor with HSM manager.
        
        Returns:
            bool: True if initialization successful
        """
        try:
            # Initialize HSM manager for secure key operations (SR-1)
            self.hsm_manager = await get_hsm_manager()
            
            # Verify HSM health
            hsm_health = await self.hsm_manager.health_check()
            if hsm_health["status"] != "healthy":
                raise HSMConnectionError(f"HSM unhealthy: {hsm_health}")
            
            # Get public key for logging (but private key stays in HSM)
            public_key = await self.hsm_manager.get_public_key()
            
            # Initialize confirmation monitor for transaction tracking (SR-3)
            self.confirmation_monitor = await get_confirmation_monitor()
            
            # Initialize circuit breaker manager for automated protection (SR-4)
            self.circuit_breaker_manager = await get_circuit_breaker_manager()
            
            # Initialize global kill switch for ultimate system control (SR-5)
            self.kill_switch = await get_global_kill_switch()
            
            # Initialize kill switch system references
            await self.kill_switch.initialize_system_references(
                trade_executor=self,
                circuit_breaker_manager=self.circuit_breaker_manager,
                confirmation_monitor=self.confirmation_monitor
            )
            
            # Initialize idempotency manager for NFR-1 compliance (NFR-1)
            self.idempotency_manager = await get_idempotency_manager()
            
            logger.info(
                "Trade Executor initialized with HSM",
                hsm_provider=self.config.hsm_provider,
                delegated_authority_pubkey=str(public_key),
                hsm_status=hsm_health["status"]
            )
            
            await self.audit_logger.log_system_event(
                event_type="trade_executor_initialized",
                event_details={
                    "hsm_provider": self.config.hsm_provider,
                    "delegated_authority_pubkey": str(public_key),
                    "vault_program_id": self.vault_program_id
                },
                severity=AuditSeverity.INFO
            )
            
            return True
            
        except Exception as e:
            logger.error(
                "Failed to initialize Trade Executor with HSM",
                error=str(e),
                error_type=type(e).__name__
            )
            
            await self.audit_logger.log_error_event(
                error_message=f"Trade Executor HSM initialization failed: {str(e)}",
                error_type=type(e).__name__,
                severity=AuditSeverity.CRITICAL,
                user_id="system"
            )
            
            return False
    
    async def validate_production_readiness(self) -> Dict[str, Any]:
        """
        Validate that Trade Executor is ready for production use.
        
        Implements SR-1: Secure Key Management validation
        
        Returns:
            Dict[str, Any]: Validation results
        """
        validation_results = {
            "production_ready": True,
            "checks": [],
            "warnings": [],
            "errors": []
        }
        
        # Check 1: HSM Manager initialization
        if not self.hsm_manager:
            validation_results["production_ready"] = False
            validation_results["errors"].append("HSM Manager not initialized")
        else:
            validation_results["checks"].append("HSM Manager initialized")
            
            # Check HSM health
            try:
                hsm_health = await self.hsm_manager.health_check()
                if hsm_health["status"] == "healthy":
                    validation_results["checks"].append(f"HSM health check passed ({hsm_health['provider']})")
                else:
                    validation_results["production_ready"] = False
                    validation_results["errors"].append(f"HSM health check failed: {hsm_health}")
            except Exception as e:
                validation_results["production_ready"] = False
                validation_results["errors"].append(f"HSM health check error: {str(e)}")
        
        # Check 2: Slippage Controller validation (SR-2)
        if self.slippage_controller:
            validation_results["checks"].append("Slippage Controller initialized")
            
            # Check circuit breaker status
            cb_status = self.slippage_controller.get_circuit_breaker_status()
            if cb_status["active"]:
                validation_results["warnings"].append(f"Slippage circuit breaker is active")
            else:
                validation_results["checks"].append("Slippage circuit breaker ready")
        else:
            validation_results["production_ready"] = False
            validation_results["errors"].append("Slippage Controller not initialized")
        
        # Check 3: Confirmation Monitor validation (SR-3)
        if self.confirmation_monitor:
            validation_results["checks"].append("Confirmation Monitor initialized")
            
            # Check active monitors
            try:
                active_monitors = await self.confirmation_monitor.get_all_active_monitors()
                validation_results["checks"].append(f"Active transaction monitors: {len(active_monitors)}")
            except Exception as e:
                validation_results["warnings"].append(f"Could not check active monitors: {str(e)}")
        else:
            validation_results["production_ready"] = False
            validation_results["errors"].append("Confirmation Monitor not initialized")
        
        # Check 4: Circuit Breaker Manager validation (SR-4)
        if self.circuit_breaker_manager:
            validation_results["checks"].append("Circuit Breaker Manager initialized")
            
            # Check system status
            try:
                system_status = self.circuit_breaker_manager.get_system_status()
                if system_status["trading_allowed"]:
                    validation_results["checks"].append("All circuit breakers closed - trading allowed")
                else:
                    validation_results["warnings"].append(f"Trading blocked: {system_status['block_reason']}")
                
                # Report open breakers
                if system_status["open_breakers"]:
                    validation_results["warnings"].append(f"Open breakers: {', '.join(system_status['open_breakers'])}")
                
                # Report half-open breakers
                if system_status["half_open_breakers"]:
                    validation_results["checks"].append(f"Recovering breakers: {', '.join(system_status['half_open_breakers'])}")
                    
            except Exception as e:
                validation_results["warnings"].append(f"Could not check circuit breaker status: {str(e)}")
        else:
            validation_results["production_ready"] = False
            validation_results["errors"].append("Circuit Breaker Manager not initialized")
        
        # Check 4.5: Global Kill Switch validation (SR-5)
        if self.kill_switch:
            validation_results["checks"].append("Global Kill Switch initialized")
            
            # Check kill switch status
            try:
                kill_switch_status = self.kill_switch.get_status()
                if kill_switch_status["is_active"]:
                    validation_results["production_ready"] = False
                    validation_results["errors"].append(f"CRITICAL: Kill switch is active - {kill_switch_status['trigger_reason']}")
                else:
                    validation_results["checks"].append("Kill switch armed and ready")
                
                # Report authorized keys count
                auth_keys_count = kill_switch_status["authorized_keys_count"]
                if auth_keys_count > 0:
                    validation_results["checks"].append(f"Kill switch has {auth_keys_count} authorized recovery keys")
                else:
                    validation_results["warnings"].append("Kill switch has no authorized recovery keys")
                
                # Check monitoring status
                if kill_switch_status["monitoring_active"]:
                    validation_results["checks"].append("Kill switch environment monitoring active")
                else:
                    validation_results["warnings"].append("Kill switch environment monitoring inactive")
                    
            except Exception as e:
                validation_results["warnings"].append(f"Could not check kill switch status: {str(e)}")
        else:
            validation_results["production_ready"] = False
            validation_results["errors"].append("Global Kill Switch not initialized")
        
        # Check 4.6: Idempotency Manager validation (NFR-1)
        if self.idempotency_manager:
            validation_results["checks"].append("Idempotency Manager initialized")
            
            # Check idempotency manager statistics
            try:
                idem_stats = await self.idempotency_manager.get_statistics()
                validation_results["checks"].append(f"Idempotency records: {idem_stats['total_records']}")
                validation_results["checks"].append(f"Cache size: {idem_stats['cache_size']}")
                
                # Check for any integrity issues
                if "integrity_violations" in idem_stats and idem_stats["integrity_violations"] > 0:
                    validation_results["warnings"].append(f"Idempotency integrity violations: {idem_stats['integrity_violations']}")
                    
            except Exception as e:
                validation_results["warnings"].append(f"Could not check idempotency manager stats: {str(e)}")
        else:
            validation_results["production_ready"] = False
            validation_results["errors"].append("Idempotency Manager not initialized")
        
        # Check 5: Production environment validation
        try:
            from app.core.config import validate_production_config
            validate_production_config()
            validation_results["checks"].append("Production configuration validated")
        except Exception as e:
            validation_results["production_ready"] = False
            validation_results["errors"].append(f"Production config validation failed: {str(e)}")
        
        # Check 6: Development provider warning
        if self.config.environment == "production" and self.config.hsm_provider not in ["aws_kms", "azure_keyvault", "google_kms", "hardware_hsm"]:
            validation_results["production_ready"] = False
            validation_results["errors"].append(f"Invalid HSM provider for production: {self.config.hsm_provider}")
        
        # Check 7: Legacy key configuration warning
        if self.config.execution_key_path or self.config.execution_key_passphrase:
            if self.config.environment == "production":
                validation_results["production_ready"] = False
                validation_results["errors"].append("Legacy key configuration detected in production - HSM required")
            else:
                validation_results["warnings"].append("Legacy key configuration detected - migrate to HSM")
        
        logger.info(
            "Production readiness validation completed",
            production_ready=validation_results["production_ready"],
            checks_passed=len(validation_results["checks"]),
            warnings=len(validation_results["warnings"]),
            errors=len(validation_results["errors"])
        )
        
        return validation_results
    
    async def execute_trade(self, trade: GeneratedTrade) -> TradeExecutionResult:
        """
        Execute a single trade on-chain.
        
        Implements FR-4: Smart Contract Interaction & Execution
        "construct a valid Solana transaction to perform the required swap
        on Raydium via the user's vault contract"
        
        Args:
            trade: Generated trade to execute
            
        Returns:
            TradeExecutionResult: Execution result with transaction details
        """
        result = TradeExecutionResult(trade)
        execution_start = datetime.now(timezone.utc)
        
        logger.info(
            "Starting trade execution",
            trade_id=trade.trade_id,
            user_id=trade.user_id,
            vault_address=trade.vault_address,
            swap_description=trade.swap_instruction.swap_description
        )
        
        try:
            # Step 0: Global kill switch validation (SR-5) - Ultimate override
            if self.kill_switch and self.kill_switch.is_active():
                result.error_message = f"Trade blocked by GLOBAL KILL SWITCH: {self.kill_switch.trigger_reason}"
                await self._update_trade_status(trade, TradeStatus.REJECTED, result.error_message)
                
                logger.critical(
                    "TRADE BLOCKED BY GLOBAL KILL SWITCH",
                    trade_id=trade.trade_id,
                    user_id=trade.user_id,
                    kill_switch_reason=self.kill_switch.trigger_reason,
                    triggered_at=self.kill_switch.triggered_at.isoformat() if self.kill_switch.triggered_at else None,
                    triggered_by=self.kill_switch.triggered_by
                )
                
                # Log critical security event
                await self.audit_logger.log_security_violation(
                    violation_type="trade_blocked_by_kill_switch",
                    user_id=trade.user_id,
                    wallet_address=trade.vault_address,
                    violation_details={
                        "trade_id": trade.trade_id,
                        "kill_switch_reason": self.kill_switch.trigger_reason,
                        "kill_switch_state": self.kill_switch.state.value,
                        "triggered_at": self.kill_switch.triggered_at.isoformat() if self.kill_switch.triggered_at else None,
                        "triggered_by": self.kill_switch.triggered_by,
                        "activation_method": self.kill_switch.activation_method.value if self.kill_switch.activation_method else None
                    },
                    severity=AuditSeverity.CRITICAL
                )
                
                return result
            
            # Step 0.5: Idempotency validation (NFR-1) - Prevent duplicate execution
            if self.idempotency_manager:
                should_execute, existing_signature = await self.idempotency_manager.ensure_trade_execution_idempotency(trade)
                if not should_execute:
                    if existing_signature:
                        result.success = True
                        result.transaction_signature = existing_signature
                        result.final_status = TradeStatus.CONFIRMED
                        result.error_message = None
                        
                        logger.info(
                            "Trade execution prevented by idempotency - returning existing result",
                            trade_id=trade.trade_id,
                            user_id=trade.user_id,
                            existing_signature=existing_signature
                        )
                        
                        await self.audit_logger.log_system_event(
                            event_type="trade_execution_idempotent_duplicate",
                            event_details={
                                "trade_id": trade.trade_id,
                                "user_id": trade.user_id,
                                "existing_signature": existing_signature,
                                "idempotency_decision": "return_existing_result"
                            },
                            severity=AuditSeverity.INFO
                        )
                    else:
                        result.error_message = "Trade execution prevented by idempotency - operation in progress"
                        result.final_status = TradeStatus.REJECTED
                        
                        logger.warning(
                            "Trade execution prevented by idempotency - operation in progress",
                            trade_id=trade.trade_id,
                            user_id=trade.user_id
                        )
                    
                    return result
            
            # Step 1: Circuit breaker validation (SR-4)
            if self.circuit_breaker_manager:
                trading_allowed, block_reason = self.circuit_breaker_manager.is_trading_allowed()
                if not trading_allowed:
                    result.error_message = f"Trade blocked by circuit breakers: {block_reason}"
                    await self._update_trade_status(trade, TradeStatus.REJECTED, result.error_message)
                    
                    logger.warning(
                        "Trade blocked by circuit breakers",
                        trade_id=trade.trade_id,
                        user_id=trade.user_id,
                        block_reason=block_reason
                    )
                    
                    return result
            
            # Step 2: Pre-execution validation
            if not await self._validate_trade_for_execution(trade):
                result.error_message = "Trade failed pre-execution validation"
                await self._update_trade_status(trade, TradeStatus.REJECTED, result.error_message)
                return result
            
            # Step 3: Strict slippage validation (SR-2)
            slippage_analysis = await self.slippage_controller.validate_trade_slippage(trade)
            if not slippage_analysis.approved:
                result.error_message = f"Trade rejected due to slippage violation: {slippage_analysis.rejection_reason}"
                await self._update_trade_status(trade, TradeStatus.REJECTED, result.error_message)
                
                logger.warning(
                    "Trade rejected by slippage controller",
                    trade_id=trade.trade_id,
                    user_id=trade.user_id,
                    violation_type=slippage_analysis.violation_type.value if slippage_analysis.violation_type else "unknown",
                    estimated_slippage=str(slippage_analysis.estimated_slippage_percent),
                    max_allowed=str(slippage_analysis.max_allowed_slippage),
                    rejection_reason=slippage_analysis.rejection_reason
                )
                
                return result
            
            logger.info(
                "Slippage validation passed",
                trade_id=trade.trade_id,
                user_id=trade.user_id,
                estimated_slippage=str(slippage_analysis.estimated_slippage_percent),
                max_allowed=str(slippage_analysis.max_allowed_slippage),
                risk_level=slippage_analysis.risk_level.value
            )
            
            # Step 4: Construct transaction
            transaction = await self._construct_swap_transaction(trade)
            if not transaction:
                result.error_message = "Failed to construct swap transaction"
                await self._update_trade_status(trade, TradeStatus.FAILED, result.error_message)
                return result
            
            # Step 5: Sign transaction with delegated authority
            signed_transaction = await self._sign_transaction(transaction, trade)
            if not signed_transaction:
                result.error_message = "Failed to sign transaction"
                await self._update_trade_status(trade, TradeStatus.FAILED, result.error_message)
                return result
            
            # Step 6: Simulate transaction (if enabled)
            if self.simulation_required:
                if not await self.solana_client.simulate_transaction(signed_transaction, trade.user_id):
                    result.error_message = "Transaction simulation failed"
                    await self._update_trade_status(trade, TradeStatus.FAILED, result.error_message)
                    return result
                
                await self._update_trade_status(trade, TradeStatus.SIMULATED)
            
            # Step 7: Send transaction to network
            tx_result = await self.solana_client.send_transaction(
                signed_transaction,
                trade.user_id,
                f"Swap {trade.swap_instruction.from_token_symbol} to {trade.swap_instruction.to_token_symbol}"
            )
            
            await self._update_trade_status(trade, TradeStatus.SUBMITTED)
            
            # Step 8: Handle execution result and start confirmation monitoring (SR-3)
            if tx_result.success:
                # Transaction submitted successfully - start monitoring for confirmation
                if self.confirmation_monitor and tx_result.signature:
                    # Calculate approximate trade value for confirmation requirements
                    trade_value_usd = trade.swap_instruction.from_amount * Decimal("1.0")  # Simplified
                    
                    # Start monitoring transaction confirmation
                    monitor_id = await self.confirmation_monitor.monitor_transaction(
                        trade=trade,
                        transaction_signature=tx_result.signature,
                        trade_value_usd=trade_value_usd
                    )
                    
                    logger.info(
                        "Transaction confirmation monitoring started",
                        trade_id=trade.trade_id,
                        user_id=trade.user_id,
                        transaction_signature=tx_result.signature,
                        monitor_id=monitor_id,
                        trade_value_usd=str(trade_value_usd)
                    )
                    
                    # Wait for initial confirmation or timeout
                    confirmation_result = await self._wait_for_confirmation(
                        monitor_id, 
                        trade, 
                        max_wait_seconds=60  # Initial wait for first confirmation
                    )
                    
                    if confirmation_result["confirmed"]:
                        result.success = True
                        result.transaction_signature = tx_result.signature
                        result.final_status = TradeStatus.CONFIRMED
                        
                        # Update trade with execution details
                        trade.mark_executed(tx_result.signature, confirmation_result.get("block_height"))
                        
                        logger.info(
                            "Trade confirmed successfully",
                            trade_id=trade.trade_id,
                            user_id=trade.user_id,
                            transaction_signature=tx_result.signature,
                            confirmations=confirmation_result.get("confirmations", 0),
                            block_height=confirmation_result.get("block_height")
                        )
                    else:
                        # Transaction submitted but not yet confirmed
                        result.success = True  # Partial success - submitted but pending confirmation
                        result.transaction_signature = tx_result.signature
                        result.final_status = TradeStatus.SUBMITTED
                        
                        logger.info(
                            "Trade submitted successfully, confirmation pending",
                            trade_id=trade.trade_id,
                            user_id=trade.user_id,
                            transaction_signature=tx_result.signature,
                            confirmation_status=confirmation_result.get("status", "pending")
                        )
                else:
                    # Fallback if confirmation monitor not available
                    result.success = True
                    result.transaction_signature = tx_result.signature
                    result.final_status = TradeStatus.CONFIRMED
                    trade.mark_executed(tx_result.signature, tx_result.block_height)
                    
                    logger.warning(
                        "Trade executed without confirmation monitoring",
                        trade_id=trade.trade_id,
                        user_id=trade.user_id,
                        transaction_signature=tx_result.signature
                    )
                
            else:
                result.error_message = tx_result.error_message or "Transaction execution failed"
                result.final_status = TradeStatus.FAILED
                trade.mark_failed(result.error_message)
                
                logger.error(
                    "Trade execution failed",
                    trade_id=trade.trade_id,
                    user_id=trade.user_id,
                    error=result.error_message
                )
        
        except asyncio.TimeoutError:
            result.error_message = f"Trade execution timed out after {self.max_execution_time_seconds} seconds"
            result.final_status = TradeStatus.FAILED
            trade.mark_failed(result.error_message)
            
        except Exception as e:
            result.error_message = f"Trade execution error: {str(e)}"
            result.final_status = TradeStatus.FAILED
            trade.mark_failed(result.error_message)
            
            logger.error(
                "Trade execution exception",
                trade_id=trade.trade_id,
                user_id=trade.user_id,
                error=str(e),
                error_type=type(e).__name__
            )
        
        finally:
            # Calculate execution time
            execution_end = datetime.now(timezone.utc)
            result.execution_time_seconds = (execution_end - execution_start).total_seconds()
            
            # Record trade execution event for circuit breakers (SR-4)
            if self.circuit_breaker_manager:
                await self.circuit_breaker_manager.record_trade_event(
                    success=result.success,
                    metadata={
                        "trade_id": trade.trade_id,
                        "user_id": trade.user_id,
                        "execution_time_seconds": result.execution_time_seconds,
                        "final_status": result.final_status.value,
                        "error_message": result.error_message
                    }
                )
            
            # Record execution result for idempotency (NFR-1)
            if self.idempotency_manager:
                await self.idempotency_manager.record_trade_execution_result(
                    trade=trade,
                    success=result.success,
                    transaction_signature=result.transaction_signature,
                    error_message=result.error_message
                )
            
            # Log execution result for audit trail
            await self.audit_logger.log_trade_execution(
                user_id=trade.user_id,
                wallet_address=trade.vault_address,
                trader_address="trade_executor",
                trade_details={
                    "trade_id": trade.trade_id,
                    "swap_instruction": trade.swap_instruction.to_dict(),
                    "execution_time_seconds": result.execution_time_seconds,
                    "final_status": result.final_status.value
                },
                transaction_signature=result.transaction_signature,
                success=result.success,
                error_message=result.error_message
            )
        
        return result
    
    async def execute_trade_batch(
        self, 
        trades: List[GeneratedTrade],
        max_concurrent: int = 3
    ) -> List[TradeExecutionResult]:
        """
        Execute multiple trades with concurrency control.
        
        Args:
            trades: List of trades to execute
            max_concurrent: Maximum concurrent executions
            
        Returns:
            List[TradeExecutionResult]: Results for each trade
        """
        logger.info(
            "Executing trade batch",
            trades_count=len(trades),
            max_concurrent=max_concurrent
        )
        
        # Check global kill switch before batch execution
        if self.kill_switch and self.kill_switch.is_active():
            logger.critical(
                "TRADE BATCH BLOCKED BY GLOBAL KILL SWITCH",
                trades_count=len(trades),
                kill_switch_reason=self.kill_switch.trigger_reason,
                triggered_by=self.kill_switch.triggered_by
            )
            
            # Return failed results for all trades
            failed_results = []
            for trade in trades:
                result = TradeExecutionResult(trade)
                result.error_message = f"Trade batch blocked by GLOBAL KILL SWITCH: {self.kill_switch.trigger_reason}"
                result.final_status = TradeStatus.REJECTED
                await self._update_trade_status(trade, TradeStatus.REJECTED, result.error_message)
                failed_results.append(result)
            
            return failed_results
        
        # Sort trades by priority
        sorted_trades = sorted(trades, key=lambda t: (t.priority, t.created_at))
        
        # Execute trades with concurrency limit
        semaphore = asyncio.Semaphore(max_concurrent)
        
        async def execute_with_semaphore(trade: GeneratedTrade) -> TradeExecutionResult:
            async with semaphore:
                return await self.execute_trade(trade)
        
        # Execute all trades
        tasks = [execute_with_semaphore(trade) for trade in sorted_trades]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Handle any exceptions
        final_results = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                error_result = TradeExecutionResult(sorted_trades[i])
                error_result.error_message = f"Execution exception: {str(result)}"
                error_result.final_status = TradeStatus.FAILED
                final_results.append(error_result)
            else:
                final_results.append(result)
        
        # Log batch execution summary
        successful_trades = sum(1 for r in final_results if r.success)
        failed_trades = len(final_results) - successful_trades
        
        logger.info(
            "Trade batch execution completed",
            total_trades=len(trades),
            successful_trades=successful_trades,
            failed_trades=failed_trades,
            success_rate=f"{(successful_trades/len(trades)*100):.1f}%" if trades else "0%"
        )
        
        return final_results
    
    async def _validate_trade_for_execution(self, trade: GeneratedTrade) -> bool:
        """
        Validate that trade is ready for execution.
        
        Args:
            trade: Trade to validate
            
        Returns:
            bool: True if trade can be executed
        """
        # Check emergency stop
        if self.emergency_stop_active:
            logger.warning("Trade execution blocked by emergency stop", trade_id=trade.trade_id)
            return False
        
        # Check trade status
        if trade.status != TradeStatus.PENDING:
            logger.warning(
                "Trade not in pending status",
                trade_id=trade.trade_id,
                current_status=trade.status.value
            )
            return False
        
        # Check trade age (don't execute very old trades)
        if trade.age_minutes > 60:  # 1 hour old
            logger.warning(
                "Trade too old for execution",
                trade_id=trade.trade_id,
                age_minutes=trade.age_minutes
            )
            return False
        
        # Validate swap instruction
        swap = trade.swap_instruction
        if swap.from_amount <= 0:
            logger.warning(
                "Invalid swap amount",
                trade_id=trade.trade_id,
                from_amount=str(swap.from_amount)
            )
            return False
        
        # Check risk score if available
        if trade.risk_score and trade.risk_score > Decimal("80"):  # High risk threshold
            logger.warning(
                "Trade risk score too high",
                trade_id=trade.trade_id,
                risk_score=str(trade.risk_score)
            )
            return False
        
        return True
    
    async def _construct_swap_transaction(self, trade: GeneratedTrade) -> Optional[Transaction]:
        """
        Construct Solana transaction for swap execution.
        
        Implements FR-4: Smart Contract Interaction & Execution
        "construct a valid Solana transaction to perform the required swap
        on Raydium via the user's vault contract"
        
        Args:
            trade: Trade containing swap details
            
        Returns:
            Transaction: Constructed transaction or None if failed
        """
        logger.info(
            "Constructing swap transaction",
            trade_id=trade.trade_id,
            vault_address=trade.vault_address,
            swap_description=trade.swap_instruction.swap_description
        )
        
        try:
            # Get recent blockhash
            recent_blockhash = await self.solana_client.get_recent_block_hash()
            if not recent_blockhash:
                logger.error("Failed to get recent blockhash", trade_id=trade.trade_id)
                return None
            
            # Create transaction
            transaction = Transaction()
            transaction.recent_blockhash = recent_blockhash
            
            # Add swap instruction via XORJ Vault contract
            swap_instruction = await self._create_vault_swap_instruction(trade)
            if not swap_instruction:
                logger.error("Failed to create vault swap instruction", trade_id=trade.trade_id)
                return None
            
            transaction.add(swap_instruction)
            
            logger.info(
                "Swap transaction constructed successfully",
                trade_id=trade.trade_id,
                instruction_count=len(transaction.instructions)
            )
            
            return transaction
            
        except Exception as e:
            logger.error(
                "Failed to construct swap transaction",
                trade_id=trade.trade_id,
                error=str(e),
                error_type=type(e).__name__
            )
            return None
    
    async def _create_vault_swap_instruction(self, trade: GeneratedTrade) -> Optional[Instruction]:
        """
        Create swap instruction that calls the XORJ Vault smart contract.
        
        This instruction will:
        1. Call the vault contract to authorize the swap
        2. Route the swap through Raydium/Jupiter for best execution
        3. Update the vault's token balances
        
        Args:
            trade: Trade with swap details
            
        Returns:
            Instruction: Vault swap instruction or None if failed
        """
        try:
            # Vault and token addresses
            vault_pubkey = PublicKey(trade.vault_address)
            from_mint = PublicKey(trade.swap_instruction.from_mint)
            to_mint = PublicKey(trade.swap_instruction.to_mint)
            
            # In a real implementation, this would:
            # 1. Create the proper instruction data for the vault contract
            # 2. Include all necessary accounts (vault, token accounts, DEX accounts)
            # 3. Set proper instruction parameters for the swap
            
            # Placeholder instruction structure
            instruction_data = self._encode_swap_instruction_data(trade)
            
            # Account metas (placeholder - real implementation would include all required accounts)
            accounts = [
                {"pubkey": vault_pubkey, "is_signer": False, "is_writable": True},
                {"pubkey": from_mint, "is_signer": False, "is_writable": False},
                {"pubkey": to_mint, "is_signer": False, "is_writable": False},
                # Additional accounts for DEX interaction would be added here
            ]
            
            # Create instruction
            instruction = Instruction(
                program_id=Pubkey.from_string(self.vault_program_id),
                data=instruction_data,
                accounts=accounts
            )
            
            logger.info(
                "Vault swap instruction created",
                trade_id=trade.trade_id,
                program_id=self.vault_program_id,
                accounts_count=len(accounts)
            )
            
            return instruction
            
        except Exception as e:
            logger.error(
                "Failed to create vault swap instruction",
                trade_id=trade.trade_id,
                error=str(e),
                error_type=type(e).__name__
            )
            return None
    
    def _encode_swap_instruction_data(self, trade: GeneratedTrade) -> bytes:
        """
        Encode swap parameters into instruction data for the vault contract.
        
        Args:
            trade: Trade with swap parameters
            
        Returns:
            bytes: Encoded instruction data
        """
        # In a real implementation, this would properly encode:
        # - Swap method selector
        # - From/to token mints
        # - Swap amount
        # - Minimum output amount (slippage protection)
        # - DEX routing parameters
        
        # Placeholder encoding
        swap_data = {
            "instruction": "swap",
            "from_mint": trade.swap_instruction.from_mint,
            "to_mint": trade.swap_instruction.to_mint,
            "amount": str(trade.swap_instruction.from_amount),
            "max_slippage": str(trade.swap_instruction.max_slippage_percent)
        }
        
        # Convert to bytes (in production, would use proper serialization)
        return json.dumps(swap_data).encode('utf-8')
    
    async def _sign_transaction(
        self, 
        transaction: Transaction, 
        trade: GeneratedTrade
    ) -> Optional[Transaction]:
        """
        Sign transaction using HSM-managed delegated authority keypair.
        
        Implements SR-1: Secure Key Management (HSM)
        "All signing operations must happen within the HSM"
        
        Implements FR-4: Smart Contract Interaction & Execution  
        "sign this transaction using its own delegated authority private key"
        
        CRITICAL SECURITY GUARANTEE: The private key never leaves the HSM.
        All signing operations are performed within the HSM boundary.
        
        Args:
            transaction: Transaction to sign
            trade: Trade context for logging
            
        Returns:
            Transaction: Signed transaction or None if failed
        """
        if not self.hsm_manager:
            logger.error(
                "HSM Manager not initialized - cannot sign transaction",
                trade_id=trade.trade_id
            )
            return None
        
        try:
            logger.info(
                "Signing transaction with HSM-managed delegated authority",
                trade_id=trade.trade_id,
                vault_address=trade.vault_address,
                hsm_provider=self.config.hsm_provider
            )
            
            # Sign transaction using HSM - private key never leaves HSM
            signed_transaction = await self.hsm_manager.sign_transaction(
                transaction=transaction,
                user_id=trade.user_id,
                trade_context={
                    "trade_id": trade.trade_id,
                    "vault_address": trade.vault_address,
                    "swap_description": trade.swap_instruction.swap_description,
                    "from_token": trade.swap_instruction.from_token_symbol,
                    "to_token": trade.swap_instruction.to_token_symbol,
                    "amount": str(trade.swap_instruction.from_amount)
                }
            )
            
            logger.info(
                "Transaction signed successfully with HSM",
                trade_id=trade.trade_id,
                user_id=trade.user_id,
                hsm_provider=self.config.hsm_provider
            )
            
            # Record successful HSM operation for circuit breakers (SR-4)
            if self.circuit_breaker_manager:
                await self.circuit_breaker_manager.record_hsm_event(
                    success=True,
                    metadata={
                        "trade_id": trade.trade_id,
                        "user_id": trade.user_id,
                        "operation": "transaction_signing",
                        "hsm_provider": self.config.hsm_provider
                    }
                )
            
            return signed_transaction
            
        except HSMSigningError as e:
            logger.error(
                "HSM signing failed",
                trade_id=trade.trade_id,
                user_id=trade.user_id,
                error=str(e),
                hsm_provider=self.config.hsm_provider
            )
            
            # Log security-critical HSM failure
            await self.audit_logger.log_security_violation(
                violation_type="hsm_signing_failure",
                user_id=trade.user_id,
                wallet_address=trade.vault_address,
                violation_details={
                    "trade_id": trade.trade_id,
                    "hsm_provider": self.config.hsm_provider,
                    "error": str(e),
                    "operation": "transaction_signing"
                },
                severity=AuditSeverity.CRITICAL
            )
            
            # Record failed HSM operation for circuit breakers (SR-4)
            if self.circuit_breaker_manager:
                await self.circuit_breaker_manager.record_hsm_event(
                    success=False,
                    metadata={
                        "trade_id": trade.trade_id,
                        "user_id": trade.user_id,
                        "operation": "transaction_signing",
                        "hsm_provider": self.config.hsm_provider,
                        "error": str(e),
                        "error_type": "HSMSigningError"
                    }
                )
            
            return None
            
        except HSMConnectionError as e:
            logger.error(
                "HSM connection error during signing",
                trade_id=trade.trade_id,
                user_id=trade.user_id,
                error=str(e),
                hsm_provider=self.config.hsm_provider
            )
            
            # Log HSM connection failure
            await self.audit_logger.log_security_violation(
                violation_type="hsm_connection_failure",
                user_id=trade.user_id,
                wallet_address=trade.vault_address,
                violation_details={
                    "trade_id": trade.trade_id,
                    "hsm_provider": self.config.hsm_provider,
                    "error": str(e),
                    "operation": "transaction_signing"
                },
                severity=AuditSeverity.CRITICAL
            )
            
            # Record failed HSM operation for circuit breakers (SR-4)
            if self.circuit_breaker_manager:
                await self.circuit_breaker_manager.record_hsm_event(
                    success=False,
                    metadata={
                        "trade_id": trade.trade_id,
                        "user_id": trade.user_id,
                        "operation": "transaction_signing",
                        "hsm_provider": self.config.hsm_provider,
                        "error": str(e),
                        "error_type": "HSMConnectionError"
                    }
                )
            
            return None
            
        except Exception as e:
            logger.error(
                "Unexpected error during HSM transaction signing",
                trade_id=trade.trade_id,
                user_id=trade.user_id,
                error=str(e),
                error_type=type(e).__name__,
                hsm_provider=self.config.hsm_provider
            )
            
            # Log unexpected signing error
            await self.audit_logger.log_security_violation(
                violation_type="hsm_unexpected_error",
                user_id=trade.user_id,
                wallet_address=trade.vault_address,
                violation_details={
                    "trade_id": trade.trade_id,
                    "hsm_provider": self.config.hsm_provider,
                    "error": str(e),
                    "error_type": type(e).__name__,
                    "operation": "transaction_signing"
                },
                severity=AuditSeverity.CRITICAL
            )
            
            return None
    
    async def _wait_for_confirmation(
        self,
        monitor_id: str,
        trade: GeneratedTrade,
        max_wait_seconds: int = 60
    ) -> Dict[str, Any]:
        """
        Wait for transaction confirmation with timeout.
        
        Implements SR-3: Transaction Confirmation & Error Handling
        "The bot must wait for blockchain confirmation before marking a trade as complete"
        
        Args:
            monitor_id: Transaction monitor ID
            trade: Trade being confirmed
            max_wait_seconds: Maximum time to wait for confirmation
            
        Returns:
            Dict[str, Any]: Confirmation result
        """
        start_time = datetime.now(timezone.utc)
        check_interval = 5  # Check every 5 seconds
        
        logger.info(
            "Waiting for transaction confirmation",
            monitor_id=monitor_id,
            trade_id=trade.trade_id,
            max_wait_seconds=max_wait_seconds
        )
        
        while True:
            try:
                # Check current transaction status
                monitor_status = await self.confirmation_monitor.get_transaction_status(monitor_id)
                
                if not monitor_status:
                    return {
                        "confirmed": False,
                        "status": "monitor_not_found",
                        "error": "Transaction monitor not found"
                    }
                
                current_state = monitor_status.get("current_state")
                confirmations = monitor_status.get("confirmations", 0)
                is_confirmed = monitor_status.get("is_confirmed", False)
                
                # Check if transaction is confirmed
                if is_confirmed and current_state in ["confirmed", "finalized"]:
                    return {
                        "confirmed": True,
                        "status": current_state,
                        "confirmations": confirmations,
                        "block_height": monitor_status.get("block_height"),
                        "finalized": monitor_status.get("finalized", False)
                    }
                
                # Check if transaction failed
                if current_state == "failed":
                    return {
                        "confirmed": False,
                        "status": "failed",
                        "error": monitor_status.get("last_error_message", "Transaction failed"),
                        "error_type": monitor_status.get("last_error")
                    }
                
                # Check if transaction timed out or stuck
                if current_state in ["timeout", "stuck", "dropped"]:
                    return {
                        "confirmed": False,
                        "status": current_state,
                        "error": f"Transaction {current_state}",
                        "confirmations": confirmations
                    }
                
                # Check if we've exceeded our wait time
                elapsed = (datetime.now(timezone.utc) - start_time).total_seconds()
                if elapsed >= max_wait_seconds:
                    return {
                        "confirmed": False,
                        "status": "wait_timeout",
                        "error": f"Confirmation wait timeout after {max_wait_seconds} seconds",
                        "confirmations": confirmations,
                        "elapsed_seconds": elapsed
                    }
                
                # Log progress periodically
                if int(elapsed) % 15 == 0:  # Every 15 seconds
                    logger.info(
                        "Waiting for confirmation",
                        monitor_id=monitor_id,
                        trade_id=trade.trade_id,
                        current_state=current_state,
                        confirmations=confirmations,
                        elapsed_seconds=int(elapsed),
                        max_wait_seconds=max_wait_seconds
                    )
                
                # Wait before next check
                await asyncio.sleep(check_interval)
                
            except Exception as e:
                logger.error(
                    "Error checking confirmation status",
                    monitor_id=monitor_id,
                    trade_id=trade.trade_id,
                    error=str(e),
                    error_type=type(e).__name__
                )
                
                return {
                    "confirmed": False,
                    "status": "check_error",
                    "error": f"Error checking confirmation: {str(e)}"
                }
    
    async def _update_trade_status(
        self, 
        trade: GeneratedTrade, 
        status: TradeStatus, 
        error_message: Optional[str] = None
    ):
        """Update trade status and log the change."""
        old_status = trade.status
        trade.status = status
        
        if error_message:
            trade.execution_error = error_message
        
        logger.info(
            "Trade status updated",
            trade_id=trade.trade_id,
            user_id=trade.user_id,
            old_status=old_status.value,
            new_status=status.value,
            error_message=error_message
        )
    
    def enable_emergency_stop(self, reason: str):
        """
        Enable emergency stop to halt all trade execution.
        
        Note: The Global Kill Switch (SR-5) provides ultimate system control.
        For maximum security, use the kill switch instead of this emergency stop.
        """
        self.emergency_stop_active = True
        logger.critical(
            "EMERGENCY STOP ACTIVATED - All trade execution halted",
            reason=reason
        )
        
        # Log recommendation to use kill switch for ultimate control
        logger.info(
            "For ultimate system control, consider using Global Kill Switch (SR-5) instead",
            kill_switch_available=self.kill_switch is not None
        )
    
    def disable_emergency_stop(self):
        """Disable emergency stop to resume trade execution."""
        self.emergency_stop_active = False
        logger.info("Emergency stop deactivated - Trade execution resumed")


# Global trade executor instance
trade_executor: Optional[TradeExecutor] = None


async def get_trade_executor() -> TradeExecutor:
    """Get the global trade executor instance."""
    global trade_executor
    if trade_executor is None:
        trade_executor = TradeExecutor()
        # Initialize with HSM manager
        initialized = await trade_executor.initialize()
        if not initialized:
            raise RuntimeError("Failed to initialize Trade Executor with HSM")
    return trade_executor