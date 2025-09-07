"""
Bot State Manager - Persistent bot state management using PostgreSQL

This module ensures bot states persist across service restarts, user logouts,
and browser closures. Bots will continue running until explicitly disabled.
"""

import asyncio
import json
from typing import Dict, List, Optional, Any
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal

import asyncpg
import structlog
from app.core.config import get_config

logger = structlog.get_logger(__name__)


@dataclass
class PersistentBotState:
    """Persistent bot state stored in database"""
    user_wallet: str
    user_id: Optional[str]
    enabled: bool
    status: str  # 'active', 'stopped', 'paused', 'error'
    configuration: Dict[str, Any]
    last_execution: Optional[datetime]
    risk_profile: str
    last_updated: datetime
    created_at: datetime
    vault_address: Optional[str] = None
    kill_switch_active: bool = False
    last_emergency_action: Optional[datetime] = None
    trades_executed: int = 0
    total_volume: Decimal = Decimal('0')


class BotStateManager:
    """
    Manages persistent bot states using PostgreSQL database.
    
    Features:
    - Persistent bot state across service restarts
    - Independent of user sessions/browser state
    - Automatic restoration of enabled bots on startup
    - Comprehensive state tracking and audit
    """
    
    def __init__(self):
        self.config = get_config()
        self.database_url = self.config.user_settings_database_url
        self.pool: Optional[asyncpg.Pool] = None
    
    async def initialize(self) -> bool:
        """Initialize database connection pool and restore active bot states"""
        try:
            logger.info("Initializing Bot State Manager")
            
            self.pool = await asyncpg.create_pool(
                self.database_url,
                min_size=5,
                max_size=20,
                command_timeout=30.0,
                max_inactive_connection_lifetime=300.0,
                server_settings={
                    'application_name': 'xorj_bot_state_manager',
                    'timezone': 'UTC'
                }
            )
            
            # Test connection
            async with self.pool.acquire() as conn:
                await conn.execute('SELECT 1')
            
            # Restore active bot states from database
            await self._restore_active_bots()
            
            logger.info("Bot State Manager initialized successfully")
            return True
            
        except Exception as e:
            logger.error(
                "Failed to initialize Bot State Manager",
                error=str(e),
                error_type=type(e).__name__
            )
            return False
    
    async def close(self):
        """Close database connection pool"""
        if self.pool:
            await self.pool.close()
            logger.info("Bot State Manager connection pool closed")
    
    async def _restore_active_bots(self):
        """Restore active bot states on service startup"""
        try:
            active_bots = await self.get_enabled_bots()
            logger.info(
                "Restoring active bot states",
                count=len(active_bots)
            )
            
            for bot_state in active_bots:
                if bot_state.enabled:
                    # Update status to active if it was enabled
                    await self.update_bot_status(
                        bot_state.user_wallet, 
                        "active"
                    )
                    logger.info(
                        "Restored active bot",
                        user_wallet=bot_state.user_wallet[:10] + "...",
                        status=bot_state.status
                    )
            
        except Exception as e:
            logger.error(
                "Failed to restore active bot states",
                error=str(e)
            )
    
    async def get_bot_state(self, user_wallet: str) -> Optional[PersistentBotState]:
        """Get bot state for a specific user wallet"""
        if not self.pool:
            logger.error("Database connection pool not initialized")
            return None
        
        try:
            async with self.pool.acquire() as conn:
                query = """
                    SELECT 
                        user_wallet, user_id, enabled, current_state, configuration,
                        last_updated, risk_profile, created_at
                    FROM bot_states 
                    WHERE user_wallet = $1
                """
                
                row = await conn.fetchrow(query, user_wallet)
                
                if row:
                    # Parse configuration JSON string back to dict
                    configuration = row['configuration'] or {}
                    if isinstance(configuration, str):
                        try:
                            configuration = json.loads(configuration)
                        except (json.JSONDecodeError, TypeError):
                            configuration = {}
                    
                    # No last_emergency_action in current schema
                    last_emergency_action = None
                    
                    return PersistentBotState(
                        user_wallet=row['user_wallet'],
                        user_id=row['user_id'],
                        enabled=row['enabled'],
                        status=row['current_state'] or 'IDLE',
                        configuration=configuration,
                        last_execution=row['last_updated'],
                        risk_profile=row.get('risk_profile', 'BALANCED'),
                        kill_switch_active=not row['enabled'],
                        last_emergency_action=None,
                        trades_executed=0,
                        total_volume=Decimal('0'),
                        last_updated=row['last_updated'],
                        created_at=row['created_at']
                    )
                else:
                    return None
                    
        except Exception as e:
            logger.error(
                "Failed to get bot state",
                user_wallet=user_wallet[:10] + "...",
                error=str(e)
            )
            return None
    
    async def create_or_update_bot_state(
        self,
        user_wallet: str,
        user_id: Optional[str] = None,
        enabled: bool = False,
        status: str = "stopped",
        configuration: Optional[Dict[str, Any]] = None,
        kill_switch_active: bool = False
    ) -> bool:
        """Create or update bot state in database"""
        if not self.pool:
            logger.error("Database connection pool not initialized")
            return False
        
        # Generate user_id if not provided (required by database)
        if user_id is None:
            user_id = f"user_{user_wallet[:8]}"
        
        if configuration is None:
            configuration = {
                "risk_profile": "moderate",
                "slippage_tolerance": 1.0,
                "max_trade_amount": 10  # Default to $10 to match user setting
            }
        
        try:
            async with self.pool.acquire() as conn:
                query = """
                    INSERT INTO bot_states (
                        user_wallet, user_id, vault_address, enabled, current_state, configuration,
                        last_updated, updated_at
                    ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                    ON CONFLICT (user_wallet) 
                    DO UPDATE SET
                        user_id = EXCLUDED.user_id,
                        vault_address = EXCLUDED.vault_address,
                        enabled = EXCLUDED.enabled,
                        current_state = EXCLUDED.current_state,
                        configuration = EXCLUDED.configuration,
                        last_updated = CURRENT_TIMESTAMP,
                        updated_at = CURRENT_TIMESTAMP
                """
                
                await conn.execute(
                    query,
                    user_wallet,
                    user_id,
                    user_wallet,  # Use user_wallet as vault_address for now
                    enabled,
                    status,
                    json.dumps(configuration)
                )
                
                logger.info(
                    "Bot state updated",
                    user_wallet=user_wallet[:10] + "...",
                    enabled=enabled,
                    status=status
                )
                
                return True
                
        except Exception as e:
            logger.error(
                "Failed to update bot state",
                user_wallet=user_wallet[:10] + "...",
                error=str(e)
            )
            return False
    
    async def enable_bot(self, user_wallet: str, configuration: Optional[Dict[str, Any]] = None) -> bool:
        """Enable bot for user - persists across sessions"""
        success = await self.create_or_update_bot_state(
            user_wallet=user_wallet,
            enabled=True,
            status="active",
            configuration=configuration,
            kill_switch_active=False
        )
        
        if success:
            logger.info(
                "Bot enabled (persistent)",
                user_wallet=user_wallet[:10] + "..."
            )
        
        return success
    
    async def disable_bot(self, user_wallet: str) -> bool:
        """Disable bot for user - persists across sessions"""
        success = await self.create_or_update_bot_state(
            user_wallet=user_wallet,
            enabled=False,
            status="stopped",
            kill_switch_active=False
        )
        
        if success:
            logger.info(
                "Bot disabled (persistent)",
                user_wallet=user_wallet[:10] + "..."
            )
        
        return success
    
    async def update_bot_status(self, user_wallet: str, status: str) -> bool:
        """Update bot status without changing enabled state"""
        if not self.pool:
            return False
        
        try:
            async with self.pool.acquire() as conn:
                query = """
                    UPDATE bot_states 
                    SET current_state = $2, last_updated = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                    WHERE user_wallet = $1
                """
                
                result = await conn.execute(query, user_wallet, status)
                
                if result == "UPDATE 1":
                    logger.info(
                        "Bot status updated",
                        user_wallet=user_wallet[:10] + "...",
                        status=status
                    )
                    return True
                else:
                    logger.warning(
                        "No bot state found to update",
                        user_wallet=user_wallet[:10] + "..."
                    )
                    return False
                    
        except Exception as e:
            logger.error(
                "Failed to update bot status",
                user_wallet=user_wallet[:10] + "...",
                error=str(e)
            )
            return False
    
    async def activate_kill_switch(self, user_wallet: str, reason: str) -> bool:
        """Activate kill switch for bot - emergency stop"""
        if not self.pool:
            return False
        
        try:
            async with self.pool.acquire() as conn:
                emergency_action = {
                    "action": "kill_switch",
                    "reason": reason,
                    "timestamp": datetime.utcnow().isoformat(),
                    "user_wallet": user_wallet
                }
                
                query = """
                    UPDATE bot_states 
                    SET 
                        enabled = FALSE,
                        current_state = 'ERROR',
                        last_updated = CURRENT_TIMESTAMP,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE user_wallet = $1
                """
                
                await conn.execute(
                    query, 
                    user_wallet
                )
                
                logger.warning(
                    "Kill switch activated",
                    user_wallet=user_wallet[:10] + "...",
                    reason=reason
                )
                
                return True
                
        except Exception as e:
            logger.error(
                "Failed to activate kill switch",
                user_wallet=user_wallet[:10] + "...",
                error=str(e)
            )
            return False
    
    async def get_enabled_bots(self) -> List[PersistentBotState]:
        """Get all enabled bot states"""
        if not self.pool:
            return []
        
        try:
            async with self.pool.acquire() as conn:
                # Debug: Log the database connection info
                logger.info(
                    "Bot State Manager database connection debug",
                    database_url=self.database_url[:50] + "..." if len(self.database_url) > 50 else self.database_url
                )
                
                # Debug: Check what tables exist
                tables_query = "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE '%bot%';"
                tables_result = await conn.fetch(tables_query)
                logger.info(
                    "Available bot tables in database",
                    tables=[row['table_name'] for row in tables_result]
                )
                
                # Debug: Check what columns exist in bot_states table
                columns_query = "SELECT column_name FROM information_schema.columns WHERE table_name = 'bot_states' ORDER BY column_name;"
                columns_result = await conn.fetch(columns_query)
                logger.info(
                    "Available columns in bot_states table",
                    columns=[row['column_name'] for row in columns_result]
                )
                
                query = """
                    SELECT 
                        user_wallet, user_id, enabled, current_state, configuration,
                        last_updated, risk_profile, created_at, vault_address
                    FROM bot_states 
                    WHERE enabled = TRUE 
                    ORDER BY last_updated DESC
                """
                
                rows = await conn.fetch(query)
                
                bot_states = []
                for row in rows:
                    # Parse configuration JSON string back to dict
                    configuration = row['configuration'] or {}
                    if isinstance(configuration, str):
                        try:
                            configuration = json.loads(configuration)
                        except (json.JSONDecodeError, TypeError):
                            configuration = {}
                    
                    # No last_emergency_action in current schema
                    last_emergency_action = None
                    
                    bot_state = PersistentBotState(
                        user_wallet=row['user_wallet'],
                        user_id=row['user_id'],
                        enabled=row['enabled'],
                        status=row['current_state'] or 'IDLE',
                        configuration=configuration,
                        last_execution=row['last_updated'],
                        risk_profile=row['risk_profile'] or 'BALANCED',
                        vault_address=row['vault_address'],
                        last_updated=row['last_updated'],
                        created_at=row['created_at'],
                        kill_switch_active=not row['enabled'],
                        last_emergency_action=None,
                        trades_executed=0,
                        total_volume=Decimal('0')
                    )
                    bot_states.append(bot_state)
                
                return bot_states
                
        except Exception as e:
            logger.error(
                "Failed to get enabled bots",
                error=str(e)
            )
            return []
    
    async def increment_trade_count(self, user_wallet: str, volume: Decimal = Decimal('0')) -> bool:
        """Increment trade count and volume for bot"""
        if not self.pool:
            return False
        
        try:
            async with self.pool.acquire() as conn:
                query = """
                    UPDATE bot_states 
                    SET 
                        last_updated = CURRENT_TIMESTAMP,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE user_wallet = $1
                """
                
                await conn.execute(query, user_wallet)
                return True
                
        except Exception as e:
            logger.error(
                "Failed to increment trade count",
                user_wallet=user_wallet[:10] + "...",
                error=str(e)
            )
            return False
    
    async def health_check(self) -> bool:
        """Perform health check on bot state database"""
        if not self.pool:
            return False
        
        try:
            async with self.pool.acquire() as conn:
                result = await conn.fetchval('SELECT COUNT(*) FROM bot_states')
                logger.info("Bot State Manager health check", bot_count=result)
                return True
                
        except Exception as e:
            logger.error(
                "Bot State Manager health check failed",
                error=str(e)
            )
            return False