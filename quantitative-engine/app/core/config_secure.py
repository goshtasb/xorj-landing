"""
XORJ Quantitative Engine - Secure Configuration Management (SR-2)
Configuration management with secrets manager integration
"""

import asyncio
from typing import List, Optional
from pydantic_settings import BaseSettings
import os
import logging

from .secrets import SecretsManager, get_secrets_manager

logger = logging.getLogger(__name__)


class SecureSettings(BaseSettings):
    """
    SR-2: Secure application settings with secrets manager integration
    NO sensitive data in environment variables or source code
    """
    
    # Application Configuration (non-sensitive)
    app_name: str = "XORJ Quantitative Engine"
    version: str = "1.0.0"
    environment: str = "production"
    debug: bool = False
    
    # Network Configuration
    host: str = "0.0.0.0"
    port: int = 8000
    
    # Logging Configuration (non-sensitive)
    log_level: str = "WARNING"
    log_format: str = "json"
    
    # Worker Configuration (non-sensitive)
    workers: int = 2
    max_concurrent_workers: int = 2
    task_timeout_seconds: int = 3600
    
    # Scheduling Configuration (non-sensitive)
    ingestion_schedule_hours: int = 4
    
    # Data Validation Configuration (non-sensitive)
    max_transactions_per_wallet: int = 10000
    supported_token_list: List[str] = [
        "So11111111111111111111111111111111111111112",  # SOL
        "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",  # USDC
        "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"   # USDT
    ]
    
    # Performance Configuration (non-sensitive)
    metrics_rolling_period_days: int = 90
    max_price_cache_age_hours: int = 24
    
    # Security Configuration (non-sensitive flags)
    cors_allowed_origins: List[str] = ["https://xorj.io"]
    rate_limit_per_minute: int = 60
    require_api_key: bool = True
    
    # SR-2: Sensitive configuration - loaded from secrets manager
    _database_url: Optional[str] = None
    _redis_url: Optional[str] = None
    _internal_api_key: Optional[str] = None
    _jwt_secret_key: Optional[str] = None
    _internal_bot_service_url: Optional[str] = None
    _internal_bot_api_key: Optional[str] = None
    _helius_api_key: Optional[str] = None
    _coingecko_api_key: Optional[str] = None
    _secrets_manager: Optional[SecretsManager] = None
    
    class Config:
        env_prefix = "XORJ_"
        case_sensitive = False
    
    async def initialize_secrets(self):
        """SR-2: Initialize secrets from secure storage"""
        try:
            self._secrets_manager = await get_secrets_manager()
            
            # Load all sensitive configuration from secrets manager
            await self._load_secrets()
            
            logger.info("Secure configuration initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize secure configuration: {e}")
            raise RuntimeError("Cannot start application without secure configuration")
    
    async def _load_secrets(self):
        """Load all secrets from the secrets manager"""
        if not self._secrets_manager:
            raise RuntimeError("Secrets manager not initialized")
        
        # Load database configuration
        self._database_url = await self._secrets_manager.get_database_url()
        if not self._database_url:
            raise RuntimeError("Database URL not available from secrets manager")
        
        # Load Redis configuration
        self._redis_url = await self._secrets_manager.get_redis_url()
        if not self._redis_url:
            raise RuntimeError("Redis URL not available from secrets manager")
        
        # Load internal API key for FR-4
        self._internal_api_key = await self._secrets_manager.get_internal_api_key()
        if not self._internal_api_key:
            raise RuntimeError("Internal API key not available from secrets manager")
        
        # Load JWT secret key for user session validation
        self._jwt_secret_key = await self._secrets_manager.get_api_key("jwt_secret")
        if not self._jwt_secret_key:
            # Generate a secure default for development
            import secrets
            self._jwt_secret_key = secrets.token_urlsafe(32)
            logger.warning("JWT secret key not found in secrets manager - using generated key")
        
        # Load internal bot service configuration
        self._internal_bot_service_url = await self._secrets_manager.get_api_key("internal_bot_service_url")
        self._internal_bot_api_key = await self._secrets_manager.get_api_key("internal_bot_api_key")
        
        # Set defaults for development
        if not self._internal_bot_service_url:
            self._internal_bot_service_url = "http://localhost:8000"
        if not self._internal_bot_api_key:
            self._internal_bot_api_key = "development-key"
        
        # Load external API keys
        self._helius_api_key = await self._secrets_manager.get_api_key("helius")
        self._coingecko_api_key = await self._secrets_manager.get_api_key("coingecko")
        
        logger.info("All secrets loaded successfully")
    
    # SR-2: Secure property accessors - no direct access to sensitive data
    @property
    def database_url(self) -> str:
        """Get database URL from secrets manager"""
        if self._database_url is None:
            raise RuntimeError("Database URL not loaded - call initialize_secrets() first")
        return self._database_url
    
    @property
    def redis_url(self) -> str:
        """Get Redis URL from secrets manager"""
        if self._redis_url is None:
            raise RuntimeError("Redis URL not loaded - call initialize_secrets() first")
        return self._redis_url
    
    @property
    def api_key(self) -> str:
        """Get internal API key for FR-4 authentication"""
        if self._internal_api_key is None:
            raise RuntimeError("Internal API key not loaded - call initialize_secrets() first")
        return self._internal_api_key
    
    @property
    def jwt_secret_key(self) -> str:
        """Get JWT secret key for user session validation"""
        if self._jwt_secret_key is None:
            raise RuntimeError("JWT secret key not loaded - call initialize_secrets() first")
        return self._jwt_secret_key
    
    @property
    def internal_bot_service_url(self) -> str:
        """Get internal bot service URL"""
        return self._internal_bot_service_url or "http://localhost:8000"
    
    @property
    def internal_bot_api_key(self) -> str:
        """Get internal bot service API key"""
        return self._internal_bot_api_key or "development-key"
    
    @property
    def helius_api_key(self) -> Optional[str]:
        """Get Helius API key"""
        return self._helius_api_key
    
    @property
    def coingecko_api_key(self) -> Optional[str]:
        """Get CoinGecko API key"""
        return self._coingecko_api_key
    
    # Computed properties (non-sensitive)
    @property
    def solana_rpc_url(self) -> str:
        """Get Solana RPC URL - uses Helius if key available"""
        if self._helius_api_key:
            # Always use mainnet for trader discovery - we need real trading data
            env_suffix = "mainnet-beta"
            return f"https://{env_suffix}.helius-rpc.com/?api-key={self._helius_api_key}"
        return "https://api.mainnet-beta.solana.com"
    
    @property
    def jupiter_api_url(self) -> str:
        """Get Jupiter API URL"""
        return "https://price.jup.ag/v6"
    
    @property
    def solana_commitment_level(self) -> str:
        """Get Solana commitment level"""
        return "confirmed"
    
    @property
    def is_production(self) -> bool:
        """Check if running in production"""
        return self.environment.lower() == "production"
    
    @property
    def is_development(self) -> bool:
        """Check if running in development"""
        return self.environment.lower() == "development"
    
    async def health_check(self) -> dict:
        """SR-2: Health check including secrets manager connectivity"""
        health = {
            "application": "healthy",
            "secrets_manager": "unknown",
            "configuration": "loaded"
        }
        
        if self._secrets_manager:
            secrets_healthy = await self._secrets_manager.health_check()
            health["secrets_manager"] = "healthy" if secrets_healthy else "unhealthy"
        
        return health
    
    def get_safe_config(self) -> dict:
        """Get configuration with sensitive data masked for logging"""
        return {
            "app_name": self.app_name,
            "version": self.version,
            "environment": self.environment,
            "debug": self.debug,
            "log_level": self.log_level,
            "workers": self.workers,
            "database_url": "***MASKED***" if self._database_url else "NOT_LOADED",
            "redis_url": "***MASKED***" if self._redis_url else "NOT_LOADED",
            "api_key": "***MASKED***" if self._internal_api_key else "NOT_LOADED",
            "jwt_secret_key": "***MASKED***" if self._jwt_secret_key else "NOT_LOADED",
            "internal_bot_service_url": "***MASKED***" if self._internal_bot_service_url else "NOT_SET",
            "internal_bot_api_key": "***MASKED***" if self._internal_bot_api_key else "NOT_SET",
            "helius_api_key": "***MASKED***" if self._helius_api_key else "NOT_SET",
            "supported_tokens": len(self.supported_token_list),
            "cors_origins": self.cors_allowed_origins
        }


# Global secure settings instance
_secure_settings: Optional[SecureSettings] = None


async def get_secure_settings() -> SecureSettings:
    """Get global secure settings instance"""
    global _secure_settings
    
    if _secure_settings is None:
        _secure_settings = SecureSettings()
        await _secure_settings.initialize_secrets()
    
    return _secure_settings


def get_settings_sync() -> SecureSettings:
    """
    Synchronous settings getter for compatibility
    WARNING: Only use after async initialization
    """
    global _secure_settings
    
    if _secure_settings is None:
        raise RuntimeError("Settings not initialized - call get_secure_settings() first")
    
    return _secure_settings


async def init_secure_settings() -> SecureSettings:
    """Initialize secure settings and verify all secrets are loaded"""
    settings = await get_secure_settings()
    
    # Verify all required secrets are loaded
    try:
        _ = settings.database_url
        _ = settings.redis_url
        _ = settings.api_key
        
        logger.info("Secure settings initialized and validated")
        logger.info(f"Configuration: {settings.get_safe_config()}")
        
        return settings
        
    except RuntimeError as e:
        logger.error(f"Secure settings validation failed: {e}")
        raise


# Legacy compatibility - gradually migrate to secure settings
def get_settings():
    """Legacy settings getter - migrating to secure settings"""
    try:
        return get_settings_sync()
    except RuntimeError:
        # Fallback to old settings during migration
        from .config import Settings
        logger.warning("Using legacy settings - migrate to secure settings")
        return Settings()