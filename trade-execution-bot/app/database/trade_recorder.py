"""
Trade Recorder Module
Records executed trades directly to the main trades database table for UI display
"""

import asyncio
import asyncpg
from typing import Optional, Dict, Any, TYPE_CHECKING
from datetime import datetime, timezone
import uuid
import structlog

from ..core.config import get_config
from ..models.trades import GeneratedTrade

if TYPE_CHECKING:
    from ..execution.trade_executor import TradeExecutionResult

logger = structlog.get_logger(__name__)

class TradeRecorder:
    """
    Records executed trades to the main database for Transaction History display
    """
    
    def __init__(self):
        self.config = get_config()
        self._pool: Optional[asyncpg.Pool] = None
        
    async def initialize(self):
        """Initialize database connection pool"""
        try:
            database_url = self.config.database_url
            if not database_url:
                raise ValueError("DATABASE_URL not configured")
                
            self._pool = await asyncpg.create_pool(
                database_url,
                min_size=2,
                max_size=10,
                command_timeout=30
            )
            
            logger.info("Trade recorder initialized with database connection")
            return True
            
        except Exception as e:
            logger.error("Failed to initialize trade recorder", error=str(e))
            return False
    
    async def record_trade_execution(
        self,
        trade: GeneratedTrade,
        result: "TradeExecutionResult"
    ) -> bool:
        """
        Record a completed trade execution to the trades table
        
        Args:
            trade: The original trade that was executed
            result: The execution result with transaction details
            
        Returns:
            bool: True if recorded successfully
        """
        if not self._pool:
            logger.error("Trade recorder not initialized")
            return False
            
        try:
            async with self._pool.acquire() as conn:
                # Insert trade record
                trade_id = str(uuid.uuid4())
                
                await conn.execute("""
                    INSERT INTO trades (
                        id,
                        user_id,
                        user_vault_address,
                        symbol,
                        side,
                        quantity,
                        price,
                        status,
                        transaction_hash,
                        from_token_address,
                        to_token_address,
                        amount_in,
                        expected_amount_out,
                        slippage,
                        fees,
                        executed_at,
                        created_at,
                        updated_at,
                        metadata
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
                """,
                    trade_id,
                    trade.user_id,
                    trade.vault_address,
                    f"{trade.swap_instruction.from_token_symbol}/{trade.swap_instruction.to_token_symbol}",
                    "buy" if trade.swap_instruction.from_token_symbol == "USDC" else "sell",
                    float(trade.swap_instruction.from_amount),
                    result.execution_price or 0.0,
                    self._map_status(result.final_status),
                    result.transaction_signature,
                    trade.swap_instruction.from_token_address,
                    trade.swap_instruction.to_token_address,
                    float(trade.swap_instruction.from_amount),
                    float(trade.swap_instruction.expected_amount_out or 0),
                    result.slippage_realized or 0.0,
                    result.gas_fee_sol or 0.0,
                    result.execution_timestamp or datetime.now(timezone.utc),
                    datetime.now(timezone.utc),
                    datetime.now(timezone.utc),
                    {
                        "trade_id": trade.trade_id,
                        "strategy": trade.strategy_name,
                        "source": "automated_trading_bot",
                        "execution_time_seconds": result.execution_time_seconds
                    }
                )
                
                logger.info(
                    "Trade recorded successfully",
                    trade_id=trade_id,
                    user_id=trade.user_id,
                    symbol=f"{trade.swap_instruction.from_token_symbol}/{trade.swap_instruction.to_token_symbol}",
                    amount=trade.swap_instruction.from_amount,
                    status=result.final_status,
                    tx_signature=result.transaction_signature
                )
                
                return True
                
        except Exception as e:
            logger.error(
                "Failed to record trade execution",
                trade_id=trade.trade_id,
                user_id=trade.user_id,
                error=str(e)
            )
            return False
    
    def _map_status(self, execution_status) -> str:
        """Map execution status to database status"""
        status_mapping = {
            "CONFIRMED": "completed",
            "FAILED": "failed",
            "PENDING": "pending",
            "SUBMITTED": "pending"
        }
        return status_mapping.get(str(execution_status), "pending")
    
    async def record_trade_attempt(
        self,
        trade: GeneratedTrade,
        error_message: Optional[str] = None
    ) -> bool:
        """
        Record a failed trade attempt
        
        Args:
            trade: The trade that failed to execute
            error_message: Error description
            
        Returns:
            bool: True if recorded successfully
        """
        if not self._pool:
            logger.error("Trade recorder not initialized")
            return False
            
        try:
            async with self._pool.acquire() as conn:
                trade_id = str(uuid.uuid4())
                
                await conn.execute("""
                    INSERT INTO trades (
                        id,
                        user_id,
                        user_vault_address,
                        symbol,
                        side,
                        quantity,
                        price,
                        status,
                        from_token_address,
                        to_token_address,
                        amount_in,
                        expected_amount_out,
                        created_at,
                        updated_at,
                        metadata
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
                """,
                    trade_id,
                    trade.user_id,
                    trade.vault_address,
                    f"{trade.swap_instruction.from_token_symbol}/{trade.swap_instruction.to_token_symbol}",
                    "buy" if trade.swap_instruction.from_token_symbol == "USDC" else "sell",
                    float(trade.swap_instruction.from_amount),
                    0.0,
                    "failed",
                    trade.swap_instruction.from_token_address,
                    trade.swap_instruction.to_token_address,
                    float(trade.swap_instruction.from_amount),
                    float(trade.swap_instruction.expected_amount_out or 0),
                    datetime.now(timezone.utc),
                    datetime.now(timezone.utc),
                    {
                        "trade_id": trade.trade_id,
                        "strategy": trade.strategy_name,
                        "source": "automated_trading_bot",
                        "error_message": error_message,
                        "failed_at": datetime.now(timezone.utc).isoformat()
                    }
                )
                
                logger.info(
                    "Failed trade attempt recorded",
                    trade_id=trade_id,
                    user_id=trade.user_id,
                    error=error_message
                )
                
                return True
                
        except Exception as e:
            logger.error(
                "Failed to record trade attempt",
                trade_id=trade.trade_id,
                user_id=trade.user_id,
                error=str(e)
            )
            return False
    
    async def cleanup(self):
        """Close database connections"""
        if self._pool:
            await self._pool.close()
            logger.info("Trade recorder database connections closed")

# Global instance
trade_recorder = TradeRecorder()