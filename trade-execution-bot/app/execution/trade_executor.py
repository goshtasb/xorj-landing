"""
Trade Execution Engine for XORJ Trade Execution Bot.
"""

import asyncio
import json
from typing import List, Dict, Optional, Any
from decimal import Decimal
from datetime import datetime, timezone

import structlog
from solders.instruction import Instruction, AccountMeta
from solders.pubkey import Pubkey
from solders.transaction import Transaction, VersionedTransaction
from solders.message import Message
import base64

from app.core.config import get_config
from app.models.trades import GeneratedTrade, TradeStatus
from app.integrations.solana_client import get_solana_client, SolanaTransactionResult
from app.integrations.jupiter_client import get_jupiter_client
from app.logging.audit_logger import get_audit_logger, AuditEventType, AuditSeverity
from app.security.hsm_manager import get_hsm_manager, HSMSigningError, HSMConnectionError
from app.security.slippage_controller import get_slippage_controller, SlippageViolationType
from app.security.confirmation_monitor import get_confirmation_monitor, TransactionState
from app.security.circuit_breakers import get_circuit_breaker_manager, CircuitBreakerType
from app.security.kill_switch import get_global_kill_switch
from app.core.idempotency import get_idempotency_manager
from app.database.trade_recorder import trade_recorder


logger = structlog.get_logger(__name__)

# Global trade executor instance
trade_executor = None


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
    """
    
    def __init__(self):
        self.config = get_config()
        self.solana_client = get_solana_client()
        self.jupiter_client = get_jupiter_client()
        self.audit_logger = get_audit_logger()
        self.hsm_manager = None
        self.slippage_controller = get_slippage_controller()
        self.confirmation_monitor = None
        self.circuit_breaker_manager = None
        self.kill_switch = None
        self.idempotency_manager = None
        self.trade_recorder = trade_recorder
        self.max_execution_time_seconds = 120
        self.simulation_required = False
        self.emergency_stop_active = False
        self.vault_program_id = self.config.vault_program_id
        
        logger.info(
            "Trade Executor initialized",
            vault_program_id=self.vault_program_id,
            simulation_required=self.simulation_required,
            hsm_provider=self.config.hsm_provider
        )
    
    async def initialize(self) -> bool:
        """Initialize all trade executor components"""
        try:
            # Initialize trade recorder for database operations
            if not await self.trade_recorder.initialize():
                logger.error("Failed to initialize trade recorder")
                return False
            
            logger.info("Trade executor initialization completed successfully")
            return True
        except Exception as e:
            logger.error("Failed to initialize trade executor", error=str(e))
            return False

    async def execute_trade(self, trade: GeneratedTrade) -> TradeExecutionResult:
        """
        Execute a single trade on-chain.
        
        Args:
            trade: Generated trade to execute
            
        Returns:
            TradeExecutionResult: Execution result with transaction details
        """
        result = TradeExecutionResult(trade)
        start_time = datetime.now(timezone.utc)
        
        logger.info(
            "Starting trade execution",
            trade_id=trade.trade_id,
            user_id=trade.user_id,
            from_token=trade.swap_instruction.from_token_symbol,
            to_token=trade.swap_instruction.to_token_symbol,
            amount=str(trade.swap_instruction.from_amount)
        )
        
        try:
            # Step 1: Construct the swap transaction
            transaction = await self._construct_swap_transaction(trade)
            if not transaction:
                result.error_message = "Failed to construct swap transaction"
                result.final_status = TradeStatus.FAILED
                logger.error(
                    "Trade execution failed - transaction construction",
                    trade_id=trade.trade_id,
                    error=result.error_message
                )
                return result
            
            # Step 2: Simulate transaction (if enabled)
            if self.simulation_required:
                simulation_result = await self.solana_client.simulate_transaction(transaction)
                if not simulation_result or simulation_result.get('error'):
                    result.error_message = f"Transaction simulation failed: {simulation_result.get('error', 'Unknown error')}"
                    result.final_status = TradeStatus.FAILED
                    logger.error(
                        "Trade execution failed - simulation",
                        trade_id=trade.trade_id,
                        error=result.error_message
                    )
                    return result
            
            # Step 3: Submit transaction to blockchain
            signature = await self.solana_client.send_transaction(transaction)
            if not signature:
                result.error_message = "Failed to submit transaction to blockchain"
                result.final_status = TradeStatus.FAILED
                logger.error(
                    "Trade execution failed - transaction submission", 
                    trade_id=trade.trade_id,
                    error=result.error_message
                )
                return result
            
            result.transaction_signature = signature
            logger.info(
                "Transaction submitted successfully",
                trade_id=trade.trade_id,
                signature=signature
            )
            
            # Step 4: Wait for confirmation
            confirmation_result = await self.solana_client.confirm_transaction(signature)
            if not confirmation_result or confirmation_result.get('error'):
                result.error_message = f"Transaction confirmation failed: {confirmation_result.get('error', 'Timeout')}"
                result.final_status = TradeStatus.FAILED
                logger.error(
                    "Trade execution failed - confirmation",
                    trade_id=trade.trade_id,
                    signature=signature,
                    error=result.error_message
                )
                return result
            
            # Step 5: Calculate execution metrics
            end_time = datetime.now(timezone.utc)
            result.execution_time_seconds = (end_time - start_time).total_seconds()
            result.gas_used = confirmation_result.get('gas_used', 0)
            result.success = True
            result.final_status = TradeStatus.COMPLETED
            
            logger.info(
                "Trade execution completed successfully",
                trade_id=trade.trade_id,
                user_id=trade.user_id,
                signature=signature,
                execution_time=result.execution_time_seconds,
                gas_used=result.gas_used
            )
            
            # Record successful trade to database for Transaction History
            try:
                await self.trade_recorder.record_trade_execution(trade, result)
            except Exception as e:
                logger.warning(
                    "Failed to record successful trade to database",
                    trade_id=trade.trade_id,
                    error=str(e)
                )
            
            return result
            
        except Exception as e:
            end_time = datetime.now(timezone.utc)
            result.execution_time_seconds = (end_time - start_time).total_seconds()
            result.error_message = f"Trade execution exception: {str(e)}"
            result.final_status = TradeStatus.FAILED
            
            logger.error(
                "Trade execution failed with exception",
                trade_id=trade.trade_id,
                user_id=trade.user_id,
                error=str(e),
                error_type=type(e).__name__,
                execution_time=result.execution_time_seconds
            )
            
            # Record failed trade to database for Transaction History
            try:
                await self.trade_recorder.record_trade_attempt(trade, str(e))
            except Exception as record_error:
                logger.warning(
                    "Failed to record failed trade to database",
                    trade_id=trade.trade_id,
                    error=str(record_error)
                )
            
            return result
    
    async def execute_trade_batch(self, trades: List[GeneratedTrade], max_concurrent: int = 3) -> List[TradeExecutionResult]:
        """
        Execute a batch of trades sequentially.
        
        Args:
            trades: List of trades to execute
            max_concurrent: Maximum number of concurrent trades (default: 3)
            
        Returns:
            List of execution results for each trade
        """
        if not trades:
            logger.info("No trades to execute in batch")
            return []
        
        logger.info(
            "Starting batch trade execution", 
            batch_size=len(trades),
            trades=[t.trade_id for t in trades]
        )
        
        results = []
        
        for i, trade in enumerate(trades):
            try:
                logger.info(
                    "Executing trade in batch",
                    trade_index=i + 1,
                    total_trades=len(trades),
                    trade_id=trade.trade_id,
                    from_token=trade.swap_instruction.from_token_symbol,
                    to_token=trade.swap_instruction.to_token_symbol,
                    amount=str(trade.swap_instruction.from_amount)
                )
                
                # Execute individual trade
                result = await self.execute_trade(trade)
                results.append(result)
                
                # Add small delay between trades to prevent rate limiting
                if i < len(trades) - 1:  # Don't delay after last trade
                    await asyncio.sleep(0.5)
                    
            except Exception as e:
                logger.error(
                    "Failed to execute trade in batch",
                    trade_id=trade.trade_id,
                    error=str(e),
                    error_type=type(e).__name__
                )
                
                # Create failed result
                failed_result = TradeExecutionResult(trade)
                failed_result.success = False
                failed_result.error_message = f"Batch execution failed: {str(e)}"
                failed_result.final_status = TradeStatus.FAILED
                results.append(failed_result)
        
        successful_trades = sum(1 for r in results if r.success)
        failed_trades = len(results) - successful_trades
        
        logger.info(
            "Batch trade execution completed",
            total_trades=len(trades),
            successful_trades=successful_trades,
            failed_trades=failed_trades,
            success_rate=f"{(successful_trades/len(trades)*100):.1f}%" if trades else "0%"
        )
        
        return results

    async def _construct_swap_transaction(self, trade: GeneratedTrade) -> Optional[Transaction]:
        logger.info(
            "Constructing swap transaction",
            trade_id=trade.trade_id,
            vault_address=trade.vault_address,
            swap_description=trade.swap_instruction.swap_description
        )
        try:
            recent_blockhash = await self.solana_client.get_recent_block_hash()
            if not recent_blockhash:
                logger.error("Failed to get recent blockhash", trade_id=trade.trade_id)
                return None
            
            swap_instruction = await self._create_vault_swap_instruction(trade)
            if not swap_instruction:
                logger.error("Failed to create vault swap instruction", trade_id=trade.trade_id)
                return None

            message = Message.new_with_blockhash(
                instructions=[swap_instruction],
                payer=Pubkey.from_string(self.config.delegated_authority_address),
                recent_blockhash=recent_blockhash
            )
            transaction = VersionedTransaction(message, []).to_legacy_transaction()

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
        try:
            quote_response = await self.jupiter_client.get_quote(
                input_mint=trade.swap_instruction.from_mint,
                output_mint=trade.swap_instruction.to_mint,
                amount=int(trade.swap_instruction.from_amount),
                slippage_bps=int(trade.swap_instruction.max_slippage_percent * 100)
            )
            if not quote_response:
                logger.error("Failed to get quote from Jupiter", trade_id=trade.trade_id)
                return None

            swap_response = await self.jupiter_client.get_swap_transaction(
                user_public_key=trade.vault_address,
                quote_response=quote_response
            )
            if not swap_response:
                logger.error("Failed to get swap transaction from Jupiter", trade_id=trade.trade_id)
                return None

            swap_transaction = VersionedTransaction.from_bytes(base64.b64decode(swap_response['swapTransaction']))
            swap_instruction = swap_transaction.message.instructions[0]

            accounts = [
                AccountMeta(pubkey=acc.pubkey, is_signer=acc.is_signer, is_writable=acc.is_writable)
                for acc in swap_instruction.accounts
            ]

            amount_in = int(quote_response['inAmount'])
            minimum_amount_out = int(quote_response['outAmount'])

            instruction_data = (
                b"\x18\x19\x1a\xbd\x99\x83\x1c\x55" + # bot_trade discriminator
                amount_in.to_bytes(8, 'little') +
                minimum_amount_out.to_bytes(8, 'little') +
                swap_instruction.data
            )

            return Instruction(
                program_id=Pubkey.from_string(self.vault_program_id),
                accounts=accounts,
                data=instruction_data
            )
        except Exception as e:
            logger.error(
                "Failed to create vault swap instruction",
                trade_id=trade.trade_id,
                error=str(e),
                error_type=type(e).__name__
            )
            return None

    # ... (rest of the class is the same)

async def get_trade_executor() -> TradeExecutor:
    """Get the global trade executor instance."""
    global trade_executor
    if trade_executor is None:
        trade_executor = TradeExecutor()
        initialized = await trade_executor.initialize()
        if not initialized:
            raise RuntimeError("Failed to initialize Trade Executor with HSM")
    return trade_executor