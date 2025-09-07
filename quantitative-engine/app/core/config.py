"""
XORJ Quantitative Engine - Configuration Management
Centralized configuration using Pydantic Settings for type safety and validation
"""

from typing import List, Optional
from pydantic import validator
from pydantic_settings import BaseSettings
import os


class Settings(BaseSettings):
    """Application settings with environment variable support and validation"""
    
    # Application Configuration
    app_name: str = "XORJ Quantitative Engine"
    version: str = "1.0.0"
    environment: str = "production"
    debug: bool = False
    secret_key: str = "change-this-in-production"
    api_key: str = "your-internal-api-key"
    xorj_internal_api_key: str = "your-internal-api-key"
    
    # Database Configuration
    database_url: str = "postgresql://xorj:xorj_password@localhost:5432/xorj_quant"
    
    # Redis Configuration
    redis_url: str = "redis://localhost:6379"
    
    # Solana RPC Configuration
    solana_rpc_url: str = "https://mainnet.helius-rpc.com/?api-key=e5fdf1c6-20b1-48b6-b33c-4be56e8e219c"
    helius_api_key: Optional[str] = "e5fdf1c6-20b1-48b6-b33c-4be56e8e219c"
    solana_commitment_level: str = "confirmed"
    
    # Rate Limiting Configuration - Premium Helius API
    rpc_requests_per_second: float = 50.0  # Premium API allows higher rates
    rpc_burst_limit: int = 100  # Allow larger bursts for premium
    rpc_cache_ttl_seconds: int = 15  # Shorter cache for fresher data
    rpc_retry_delay_seconds: float = 0.5  # Shorter retry delay
    
    # Price Data APIs
    coingecko_api_key: Optional[str] = None
    jupiter_api_url: str = "https://price.jup.ag/v6"
    
    # Logging Configuration
    log_level: str = "INFO"
    log_format: str = "json"
    
    # Worker Configuration
    workers: int = 4
    max_concurrent_workers: int = 2
    task_timeout_seconds: int = 3600
    
    # Scheduling Configuration  
    ingestion_schedule_hours: int = 4  # Run every 4 hours for active monitoring
    
    # Data Validation Configuration
    max_transactions_per_wallet: int = 100000  # Increased for high-frequency traders
    transaction_threshold: int = 50000  # Increased threshold - only sample for VERY high volume
    num_samples_per_day: int = 100  # Increased samples - capture more transactions per day
    min_trade_value_usd: float = 1.0
    supported_tokens: str = "SOL,USDC,USDT,RAY,BONK,JUP,WIF,POPCAT,PEPE,MOODENG,GOAT,PNUT,ACT,FIDA,SRM,ORCA,SAMO,COPE,STEP,MEDIA,ROPE,ATLAS,STAR,GRAPE,SLIM,GME,WOOF,SLRS,POLIS,SHDW,MNGO,TULIP,PORT,LIQ,BSKT,CRWNY,KING,BASIS,MAPS,UXD,SUNNY,SBR,AURY,MEAN,SOCN,NINJA,JSOL,MSOL,STSOL,DXBL,REAL,PRT,DIP,LIKE,GST,GMT,CHEEMS,DOGE,SHIB,APT,BTC,ETH,BNB,ADA,AVAX,DOT,MATIC,LINK,UNI,ICP,NEAR,ALGO,FTM,XLM,VET,ETC,FIL,HBAR,EGLD,XTZ,THETA,MANA,SAND,CAKE,KLAY,MIOTA,BTT,ENJ,CHZ,BAT,SUSHI,YFI,COMP,MKR,AAVE,SNX,CRV,1INCH,ZRX,REN,LRC,KNC,BAL,UMA"
    
    # Monitoring Configuration
    prometheus_port: int = 9090
    health_check_interval: int = 30
    
    # Rate Limiting Configuration
    rpc_requests_per_second: int = 10
    api_requests_per_minute: int = 100
    
    # Retry Configuration
    max_retries: int = 3
    retry_backoff_multiplier: float = 2.0
    max_retry_delay_seconds: int = 300
    
    # DEX Program Configuration
    raydium_program_id: str = "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8"
    jupiter_program_id: str = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4K"
    orca_program_id: str = "9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP"
    serum_program_id: str = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin"
    
    # All supported DEX program IDs
    def get_supported_dex_programs(self) -> List[str]:
        """Get list of all supported DEX program IDs"""
        return [
            self.raydium_program_id,
            self.jupiter_program_id,
            self.orca_program_id,
            self.serum_program_id,
        ]
    
    # Performance Metrics Configuration
    metrics_rolling_period_days: int = 90
    risk_free_rate_annual: float = 0.02  # 2% annual risk-free rate
    metrics_precision_places: int = 28
    
    @validator('supported_tokens')
    def parse_supported_tokens(cls, v):
        """Parse comma-separated token list into a list"""
        if isinstance(v, str):
            return [token.strip().upper() for token in v.split(',')]
        return v
    
    @validator('environment')
    def validate_environment(cls, v):
        """Validate environment setting"""
        valid_envs = ['development', 'staging', 'production']
        if v not in valid_envs:
            raise ValueError(f'Environment must be one of: {valid_envs}')
        return v
    
    @validator('log_level')
    def validate_log_level(cls, v):
        """Validate log level"""
        valid_levels = ['DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL']
        if v.upper() not in valid_levels:
            raise ValueError(f'Log level must be one of: {valid_levels}')
        return v.upper()
    
    @property
    def is_development(self) -> bool:
        """Check if running in development mode"""
        return self.environment == "development"
    
    @property
    def is_production(self) -> bool:
        """Check if running in production mode"""
        return self.environment == "production"
    
    @property
    def supported_token_list(self) -> List[str]:
        """Get supported tokens as a list"""
        if isinstance(self.supported_tokens, list):
            return self.supported_tokens
        return [token.strip().upper() for token in self.supported_tokens.split(',')]
    
    @property
    def database_config(self) -> dict:
        """Get database configuration for SQLAlchemy"""
        return {
            "url": self.database_url,
            "echo": self.debug,
            "pool_size": 5,
            "max_overflow": 10,
            "pool_pre_ping": True,
            "pool_recycle": 3600,
        }
    
    @property
    def celery_config(self) -> dict:
        """Get Celery configuration"""
        return {
            "broker_url": self.redis_url,
            "result_backend": self.redis_url,
            "task_serializer": "json",
            "accept_content": ["json"],
            "result_serializer": "json",
            "timezone": "UTC",
            "enable_utc": True,
            "task_track_started": True,
            "task_time_limit": self.task_timeout_seconds,
            "task_soft_time_limit": self.task_timeout_seconds - 60,
            "worker_prefetch_multiplier": 1,
            "worker_max_tasks_per_child": 50,
        }
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False


# Global settings instance
settings = Settings()


def get_settings() -> Settings:
    """Get application settings instance"""
    return settings


# Token mint addresses for supported tokens
TOKEN_MINTS = {
    "SOL": "So11111111111111111111111111111111111111112",  # Wrapped SOL
    "USDC": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    "USDT": "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", 
    "RAY": "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R",
    "BONK": "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
    "JUP": "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
}


def get_token_mint(symbol: str) -> Optional[str]:
    """Get token mint address by symbol"""
    return TOKEN_MINTS.get(symbol.upper())


def get_supported_token_mints() -> dict:
    """Get all supported token mint addresses"""
    supported = settings.supported_token_list
    return {symbol: mint for symbol, mint in TOKEN_MINTS.items() if symbol in supported}