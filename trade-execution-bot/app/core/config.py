"""
Configuration management for XORJ Trade Execution Bot.

Security-first configuration with environment-based settings
and comprehensive validation.
"""

import os
from typing import Optional
from pydantic_settings import BaseSettings
from pydantic import Field, validator


class TradeExecutionConfig(BaseSettings):
    """
    Configuration for the XORJ Trade Execution Bot.
    
    All sensitive values must be provided via environment variables
    or secure configuration management systems.
    """
    
    # Service Configuration
    service_name: str = "xorj-trade-execution-bot"
    environment: str = Field(default="development", env="ENVIRONMENT")
    log_level: str = Field(default="INFO", env="LOG_LEVEL")
    
    # Integration: XORJ Quantitative Engine
    quantitative_engine_base_url: str = Field(
        default="http://localhost:8000",
        env="QUANTITATIVE_ENGINE_URL",
        description="Base URL for XORJ Quantitative Engine API"
    )
    quantitative_engine_api_key: Optional[str] = Field(
        default=None,
        env="QUANTITATIVE_ENGINE_API_KEY",
        description="API key for secure communication with Quantitative Engine"
    )
    ranked_traders_endpoint: str = "/internal/ranked-traders"
    
    # Integration: User Settings Database
    user_settings_database_url: str = Field(
        env="USER_SETTINGS_DATABASE_URL",
        description="Connection string for user settings database"
    )
    user_settings_table: str = Field(
        default="user_risk_profiles",
        env="USER_SETTINGS_TABLE"
    )
    
    # Integration: Solana Network
    solana_network: str = Field(
        default="devnet",
        env="SOLANA_NETWORK",
        description="Solana network (mainnet-beta, testnet, devnet)"
    )
    solana_rpc_url: str = Field(
        env="SOLANA_RPC_URL",
        description="Solana RPC endpoint URL"
    )
    
    # XORJ Vault Smart Contract
    vault_program_id: str = Field(
        env="XORJ_VAULT_PROGRAM_ID",
        description="Program ID of deployed XORJ Vault Smart Contract"
    )
    
    # Security Configuration - HSM Integration (SR-1)
    hsm_provider: str = Field(
        default="aws_kms",
        env="HSM_PROVIDER",
        description="HSM provider (aws_kms, azure_keyvault, google_kms, hardware_hsm)"
    )
    
    # AWS KMS Configuration
    aws_kms_key_id: Optional[str] = Field(
        default=None,
        env="AWS_KMS_KEY_ID",
        description="AWS KMS key ID for delegated authority signing"
    )
    aws_region: Optional[str] = Field(
        default=None,
        env="AWS_REGION",
        description="AWS region for KMS operations"
    )
    aws_access_key_id: Optional[str] = Field(
        default=None,
        env="AWS_ACCESS_KEY_ID",
        description="AWS access key ID for KMS access"
    )
    aws_secret_access_key: Optional[str] = Field(
        default=None,
        env="AWS_SECRET_ACCESS_KEY",
        description="AWS secret access key for KMS access"
    )
    
    # Azure Key Vault Configuration
    azure_key_vault_url: Optional[str] = Field(
        default=None,
        env="AZURE_KEY_VAULT_URL",
        description="Azure Key Vault URL"
    )
    azure_key_name: Optional[str] = Field(
        default=None,
        env="AZURE_KEY_NAME",
        description="Azure Key Vault key name"
    )
    azure_tenant_id: Optional[str] = Field(
        default=None,
        env="AZURE_TENANT_ID",
        description="Azure tenant ID"
    )
    azure_client_id: Optional[str] = Field(
        default=None,
        env="AZURE_CLIENT_ID",
        description="Azure client ID"
    )
    azure_client_secret: Optional[str] = Field(
        default=None,
        env="AZURE_CLIENT_SECRET",
        description="Azure client secret"
    )
    
    # Google Cloud KMS Configuration
    google_kms_project_id: Optional[str] = Field(
        default=None,
        env="GOOGLE_KMS_PROJECT_ID",
        description="Google Cloud project ID"
    )
    google_kms_location: Optional[str] = Field(
        default=None,
        env="GOOGLE_KMS_LOCATION",
        description="Google Cloud KMS location"
    )
    google_kms_key_ring: Optional[str] = Field(
        default=None,
        env="GOOGLE_KMS_KEY_RING",
        description="Google Cloud KMS key ring"
    )
    google_kms_key_name: Optional[str] = Field(
        default=None,
        env="GOOGLE_KMS_KEY_NAME",
        description="Google Cloud KMS key name"
    )
    google_service_account_path: Optional[str] = Field(
        default=None,
        env="GOOGLE_SERVICE_ACCOUNT_PATH",
        description="Path to Google service account key file"
    )
    
    # Hardware HSM Configuration
    hardware_hsm_library_path: Optional[str] = Field(
        default=None,
        env="HARDWARE_HSM_LIBRARY_PATH",
        description="Path to hardware HSM PKCS#11 library"
    )
    hardware_hsm_slot_id: Optional[int] = Field(
        default=None,
        env="HARDWARE_HSM_SLOT_ID",
        description="Hardware HSM slot ID"
    )
    hardware_hsm_pin: Optional[str] = Field(
        default=None,
        env="HARDWARE_HSM_PIN",
        description="Hardware HSM PIN"
    )
    hardware_hsm_key_label: Optional[str] = Field(
        default=None,
        env="HARDWARE_HSM_KEY_LABEL",
        description="Hardware HSM key label"
    )
    
    # Legacy key configuration (deprecated - for development only)
    execution_key_path: Optional[str] = Field(
        default=None,
        env="EXECUTION_KEY_PATH",
        description="[DEPRECATED] Path to encrypted execution keypair file - use HSM instead"
    )
    execution_key_passphrase: Optional[str] = Field(
        default=None,
        env="EXECUTION_KEY_PASSPHRASE", 
        description="[DEPRECATED] Passphrase for execution keypair decryption - use HSM instead"
    )
    
    # Audit Logging Configuration
    audit_log_database_url: str = Field(
        env="AUDIT_LOG_DATABASE_URL",
        description="Connection string for immutable audit logging database"
    )
    audit_log_table: str = Field(
        default="trade_execution_audit_log",
        env="AUDIT_LOG_TABLE"
    )
    
    # Scheduling Configuration
    execution_interval_seconds: int = Field(
        default=300,  # 5 minutes
        env="EXECUTION_INTERVAL_SECONDS",
        description="Interval between trade execution cycles"
    )
    max_execution_time_seconds: int = Field(
        default=240,  # 4 minutes (1 minute buffer)
        env="MAX_EXECUTION_TIME_SECONDS"
    )
    
    # Risk Management Limits
    max_concurrent_trades: int = Field(
        default=10,
        env="MAX_CONCURRENT_TRADES",
        description="Maximum number of concurrent trade executions"
    )
    max_trade_amount_sol: float = Field(
        default=100.0,
        env="MAX_TRADE_AMOUNT_SOL",
        description="Maximum trade amount in SOL per transaction"
    )
    emergency_stop_enabled: bool = Field(
        default=True,
        env="EMERGENCY_STOP_ENABLED"
    )
    
    # Monitoring & Observability
    enable_prometheus_metrics: bool = Field(
        default=True,
        env="ENABLE_PROMETHEUS_METRICS"
    )
    prometheus_port: int = Field(
        default=8001,
        env="PROMETHEUS_PORT"
    )
    
    @validator("environment")
    def validate_environment(cls, v):
        valid_envs = ["development", "staging", "production"]
        if v not in valid_envs:
            raise ValueError(f"Environment must be one of {valid_envs}")
        return v
    
    @validator("solana_network")
    def validate_solana_network(cls, v):
        valid_networks = ["mainnet-beta", "testnet", "devnet"]
        if v not in valid_networks:
            raise ValueError(f"Solana network must be one of {valid_networks}")
        return v
    
    @validator("log_level")
    def validate_log_level(cls, v):
        valid_levels = ["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]
        if v.upper() not in valid_levels:
            raise ValueError(f"Log level must be one of {valid_levels}")
        return v.upper()
    
    @validator("hsm_provider")
    def validate_hsm_provider(cls, v):
        valid_providers = ["aws_kms", "azure_keyvault", "google_kms", "hardware_hsm"]
        if v not in valid_providers:
            raise ValueError(f"HSM provider must be one of {valid_providers}")
        return v
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False


# Global configuration instance
config = TradeExecutionConfig()


def get_config() -> TradeExecutionConfig:
    """Get the global configuration instance."""
    return config


def validate_production_config() -> bool:
    """
    Validate that all required production configuration is present.
    
    Returns:
        bool: True if configuration is valid for production use
    """
    # Base required configuration
    required_for_production = [
        "quantitative_engine_api_key",
        "user_settings_database_url", 
        "solana_rpc_url",
        "vault_program_id",
        "audit_log_database_url"
    ]
    
    missing_configs = []
    for field in required_for_production:
        value = getattr(config, field)
        if value is None or (isinstance(value, str) and not value.strip()):
            missing_configs.append(field)
    
    # Validate HSM configuration based on provider (SR-1)
    hsm_provider = config.hsm_provider
    if hsm_provider == "aws_kms":
        hsm_required = ["aws_kms_key_id", "aws_region", "aws_access_key_id", "aws_secret_access_key"]
    elif hsm_provider == "azure_keyvault":
        hsm_required = ["azure_key_vault_url", "azure_key_name", "azure_tenant_id", "azure_client_id", "azure_client_secret"]
    elif hsm_provider == "google_kms":
        hsm_required = ["google_kms_project_id", "google_kms_location", "google_kms_key_ring", "google_kms_key_name", "google_service_account_path"]
    elif hsm_provider == "hardware_hsm":
        hsm_required = ["hardware_hsm_library_path", "hardware_hsm_slot_id", "hardware_hsm_pin", "hardware_hsm_key_label"]
    else:
        raise ValueError(f"Unsupported HSM provider: {hsm_provider}")
    
    for field in hsm_required:
        value = getattr(config, field)
        if value is None or (isinstance(value, str) and not value.strip()):
            missing_configs.append(field)
    
    # Warn about legacy key configuration in production
    if config.execution_key_path or config.execution_key_passphrase:
        import structlog
        logger = structlog.get_logger(__name__)
        logger.warning(
            "Legacy key configuration detected in production - migrate to HSM immediately",
            hsm_provider=hsm_provider,
            environment=config.environment
        )
    
    if missing_configs:
        raise ValueError(
            f"Missing required production configuration: {missing_configs}. "
            f"HSM provider '{hsm_provider}' requires: {hsm_required}"
        )
    
    return True


def is_production() -> bool:
    """Check if running in production environment."""
    return config.environment == "production"