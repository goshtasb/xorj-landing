"""
Integration with User Settings Database.

This module handles secure access to user configuration data,
specifically risk profiles and trading preferences.

Security Features:
- Secure database connection with connection pooling
- Input sanitization and validation
- Comprehensive audit logging
- Error handling and graceful degradation
"""

import asyncio
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass
from decimal import Decimal
from datetime import datetime

import asyncpg
import structlog
from app.core.config import get_config
from app.models.trader_intelligence import RiskProfile


logger = structlog.get_logger(__name__)


@dataclass
class UserRiskProfile:
    """User risk profile and trading settings from database."""
    user_id: str
    wallet_address: str
    risk_profile: RiskProfile
    max_position_size_sol: Decimal
    max_daily_trades: int
    auto_trading_enabled: bool
    last_updated: datetime
    vault_address: Optional[str] = None
    
    def __post_init__(self):
        """Validate user risk profile data."""
        self._validate_position_limits()
    
    def _validate_position_limits(self):
        """Validate position size and trade limits."""
        if self.max_position_size_sol <= 0:
            raise ValueError("Max position size must be positive")
        
        if self.max_daily_trades <= 0:
            raise ValueError("Max daily trades must be positive")
        
        # Reasonable upper limits for safety
        if self.max_position_size_sol > 1000:  # 1000 SOL max
            raise ValueError("Max position size exceeds safety limit")
        
        if self.max_daily_trades > 100:  # 100 trades per day max
            raise ValueError("Max daily trades exceeds safety limit")


@dataclass
class UserSettingsResponse:
    """Response from user settings database query."""
    success: bool
    user_profiles: Optional[List[UserRiskProfile]] = None
    error_message: Optional[str] = None
    query_time_ms: Optional[int] = None


class UserSettingsClient:
    """
    Secure client for user settings database integration.
    
    This handles Input 2 as specified in the System Architecture:
    Read from user settings database to fetch selected riskProfile
    for each active user.
    
    Features:
    - Connection pooling for performance
    - Prepared statements for security
    - Comprehensive error handling
    - Audit logging of all database access
    """
    
    def __init__(self):
        self.config = get_config()
        self.database_url = self.config.user_settings_database_url
        self.table_name = self.config.user_settings_table
        self.pool: Optional[asyncpg.Pool] = None
        
        self._validate_config()
    
    def _validate_config(self):
        """Validate database configuration."""
        if not self.database_url:
            raise ValueError("User settings database URL is required")
        
        if not self.table_name:
            raise ValueError("User settings table name is required")
    
    async def initialize(self) -> bool:
        """
        Initialize database connection pool.
        
        Returns:
            bool: True if initialization successful
        """
        try:
            logger.info("Initializing user settings database connection pool")
            
            self.pool = await asyncpg.create_pool(
                self.database_url,
                min_size=5,
                max_size=50,  # Increased for high-traffic API requests
                command_timeout=30.0,
                max_inactive_connection_lifetime=300.0,  # 5 minutes
                server_settings={
                    'application_name': self.config.service_name,
                    'timezone': 'UTC'
                }
            )
            
            # Test connection
            async with self.pool.acquire() as conn:
                await conn.execute('SELECT 1')
            
            logger.info("User settings database connection pool initialized successfully")
            return True
            
        except Exception as e:
            logger.error(
                "Failed to initialize user settings database connection pool",
                error=str(e),
                error_type=type(e).__name__
            )
            return False
    
    async def close(self):
        """Close database connection pool."""
        if self.pool:
            await self.pool.close()
            logger.info("User settings database connection pool closed")
    
    async def get_active_user_profiles(
        self,
        max_retries: int = 3
    ) -> UserSettingsResponse:
        """
        Retrieve risk profiles for all active users.
        
        Returns all users who have:
        - auto_trading_enabled = true
        - valid wallet_address
        - valid vault_address (if required)
        
        Args:
            max_retries: Maximum number of retry attempts
            
        Returns:
            UserSettingsResponse with user profiles or error information
        """
        if not self.pool:
            return UserSettingsResponse(
                success=False,
                error_message="Database connection pool not initialized"
            )
        
        start_time = asyncio.get_event_loop().time()
        
        # Prepared query with security considerations
        query = f"""
            SELECT 
                user_id,
                wallet_address,
                risk_profile,
                max_position_size_sol,
                max_daily_trades,
                auto_trading_enabled,
                vault_address,
                last_updated
            FROM {self.table_name}
            WHERE auto_trading_enabled = TRUE
                AND wallet_address IS NOT NULL
                AND wallet_address != ''
                AND max_position_size_sol > 0
                AND max_daily_trades > 0
            ORDER BY last_updated DESC
        """
        
        logger.info("Querying active user profiles", table_name=self.table_name)
        
        last_exception = None
        
        for attempt in range(max_retries + 1):
            try:
                async with self.pool.acquire() as conn:
                    rows = await conn.fetch(query)
                    
                    query_time_ms = int((asyncio.get_event_loop().time() - start_time) * 1000)
                    
                    # Parse and validate user profiles
                    user_profiles = []
                    for row in rows:
                        try:
                            user_profile = self._parse_user_profile_row(row)
                            user_profiles.append(user_profile)
                        except Exception as e:
                            logger.warning(
                                "Invalid user profile data in database",
                                user_id=row.get('user_id', 'unknown'),
                                error=str(e)
                            )
                            # Continue processing other users
                    
                    logger.info(
                        "Successfully retrieved user profiles",
                        profile_count=len(user_profiles),
                        query_time_ms=query_time_ms,
                        attempt=attempt + 1
                    )
                    
                    return UserSettingsResponse(
                        success=True,
                        user_profiles=user_profiles,
                        query_time_ms=query_time_ms
                    )
                    
            except Exception as e:
                last_exception = e
                logger.warning(
                    "User settings database query failed",
                    attempt=attempt + 1,
                    max_retries=max_retries,
                    error=str(e),
                    error_type=type(e).__name__
                )
                
                if attempt < max_retries:
                    await asyncio.sleep(1.0 * (2 ** attempt))  # Exponential backoff
        
        # All retries exhausted
        error_msg = f"Failed to query user settings after {max_retries + 1} attempts"
        if last_exception:
            error_msg += f": {str(last_exception)}"
        
        logger.error("User settings database integration failed", error=error_msg)
        
        return UserSettingsResponse(
            success=False,
            error_message=error_msg,
            query_time_ms=int((asyncio.get_event_loop().time() - start_time) * 1000)
        )
    
    def _parse_user_profile_row(self, row) -> UserRiskProfile:
        """Parse database row into UserRiskProfile object."""
        try:
            # Parse risk profile enum
            risk_profile_str = row['risk_profile'].lower()
            risk_profile = RiskProfile(risk_profile_str)
            
            return UserRiskProfile(
                user_id=str(row['user_id']),
                wallet_address=str(row['wallet_address']),
                risk_profile=risk_profile,
                max_position_size_sol=Decimal(str(row['max_position_size_sol'])),
                max_daily_trades=int(row['max_daily_trades']),
                auto_trading_enabled=bool(row['auto_trading_enabled']),
                vault_address=str(row['vault_address']) if row['vault_address'] else None,
                last_updated=row['last_updated']
            )
            
        except Exception as e:
            raise ValueError(f"Failed to parse user profile row: {str(e)}")
    
    async def get_user_profile_by_wallet(
        self, 
        wallet_address: str
    ) -> Optional[UserRiskProfile]:
        """
        Get specific user profile by wallet address.
        
        Args:
            wallet_address: Solana wallet address
            
        Returns:
            UserRiskProfile if found, None otherwise
        """
        if not self.pool:
            logger.error("Database connection pool not initialized")
            return None
        
        if not wallet_address or len(wallet_address) < 32:
            logger.warning("Invalid wallet address provided", wallet_address=wallet_address[:10])
            return None
        
        query = f"""
            SELECT 
                user_id,
                wallet_address,
                risk_profile,
                max_position_size_sol,
                max_daily_trades,
                auto_trading_enabled,
                vault_address,
                last_updated
            FROM {self.table_name}
            WHERE wallet_address = $1
                AND auto_trading_enabled = TRUE
        """
        
        try:
            async with self.pool.acquire() as conn:
                row = await conn.fetchrow(query, wallet_address)
                
                if row:
                    return self._parse_user_profile_row(row)
                else:
                    logger.info(
                        "No active user profile found for wallet",
                        wallet_address=wallet_address[:10] + "..."
                    )
                    return None
                    
        except Exception as e:
            logger.error(
                "Failed to query user profile by wallet",
                wallet_address=wallet_address[:10] + "...",
                error=str(e)
            )
            return None
    
    async def health_check(self) -> bool:
        """
        Perform health check on user settings database connection.
        
        Returns:
            bool: True if database is accessible
        """
        if not self.pool:
            return False
        
        try:
            async with self.pool.acquire() as conn:
                result = await conn.fetchval('SELECT 1')
                
                is_healthy = result == 1
                logger.info("User settings database health check", healthy=is_healthy)
                return is_healthy
                
        except Exception as e:
            logger.warning(
                "User settings database health check failed",
                error=str(e)
            )
            return False