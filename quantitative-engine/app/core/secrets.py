"""
XORJ Quantitative Engine - Secrets Management (SR-2)
Secure management of credentials via AWS Secrets Manager and HashiCorp Vault
"""

import json
import os
from abc import ABC, abstractmethod
from typing import Dict, Optional, Any
from dataclasses import dataclass
from enum import Enum
import asyncio
import logging

# Optional imports - will fallback gracefully if not available
try:
    import boto3
    from botocore.exceptions import ClientError
    HAS_AWS = True
except ImportError:
    HAS_AWS = False

try:
    import hvac
    HAS_VAULT = True
except ImportError:
    HAS_VAULT = False

logger = logging.getLogger(__name__)


class SecretProvider(Enum):
    """Supported secret providers"""
    AWS_SECRETS_MANAGER = "aws_secrets_manager"
    HASHICORP_VAULT = "hashicorp_vault"
    ENVIRONMENT = "environment"  # Fallback for development


@dataclass
class SecretConfig:
    """Configuration for secret management"""
    provider: SecretProvider
    region: Optional[str] = None
    vault_url: Optional[str] = None
    vault_token: Optional[str] = None
    vault_mount_point: str = "secret"


class SecretManagerInterface(ABC):
    """Abstract interface for secret management providers"""
    
    @abstractmethod
    async def get_secret(self, secret_name: str, key: Optional[str] = None) -> str:
        """Retrieve a secret value"""
        pass
    
    @abstractmethod
    async def get_secrets(self, secret_name: str) -> Dict[str, str]:
        """Retrieve all key-value pairs from a secret"""
        pass
    
    @abstractmethod
    async def health_check(self) -> bool:
        """Check if the secret provider is healthy"""
        pass


class AWSSecretsManager(SecretManagerInterface):
    """AWS Secrets Manager implementation"""
    
    def __init__(self, region: str = "us-east-1"):
        if not HAS_AWS:
            raise ImportError("boto3 is required for AWS Secrets Manager")
        
        self.region = region
        self.client = boto3.client('secretsmanager', region_name=region)
        logger.info(f"Initialized AWS Secrets Manager client for region: {region}")
    
    async def get_secret(self, secret_name: str, key: Optional[str] = None) -> str:
        """
        Retrieve a secret from AWS Secrets Manager
        
        Args:
            secret_name: Name of the secret in AWS
            key: Optional key within the secret (for JSON secrets)
            
        Returns:
            Secret value as string
        """
        try:
            response = self.client.get_secret_value(SecretId=secret_name)
            
            if 'SecretString' in response:
                secret_value = response['SecretString']
                
                # If it's JSON and we want a specific key
                if key:
                    try:
                        secret_dict = json.loads(secret_value)
                        return secret_dict.get(key, "")
                    except json.JSONDecodeError:
                        logger.error(f"Secret {secret_name} is not valid JSON")
                        return ""
                
                return secret_value
            
            logger.error(f"Secret {secret_name} does not contain SecretString")
            return ""
            
        except ClientError as e:
            error_code = e.response['Error']['Code']
            if error_code == 'DecryptionFailureException':
                logger.error(f"Failed to decrypt secret {secret_name}")
            elif error_code == 'InternalServiceErrorException':
                logger.error(f"AWS internal error retrieving {secret_name}")
            elif error_code == 'InvalidParameterException':
                logger.error(f"Invalid parameter for secret {secret_name}")
            elif error_code == 'InvalidRequestException':
                logger.error(f"Invalid request for secret {secret_name}")
            elif error_code == 'ResourceNotFoundException':
                logger.error(f"Secret {secret_name} not found")
            else:
                logger.error(f"Unknown error retrieving secret {secret_name}: {e}")
            
            return ""
        
        except Exception as e:
            logger.error(f"Unexpected error retrieving secret {secret_name}: {e}")
            return ""
    
    async def get_secrets(self, secret_name: str) -> Dict[str, str]:
        """Retrieve all key-value pairs from a JSON secret"""
        try:
            secret_value = await self.get_secret(secret_name)
            if secret_value:
                return json.loads(secret_value)
            return {}
        except json.JSONDecodeError:
            logger.error(f"Secret {secret_name} is not valid JSON")
            return {}
    
    async def health_check(self) -> bool:
        """Check AWS Secrets Manager connectivity"""
        try:
            # List secrets with limit 1 to test connectivity
            response = self.client.list_secrets(MaxResults=1)
            return True
        except Exception as e:
            logger.error(f"AWS Secrets Manager health check failed: {e}")
            return False


class HashiCorpVault(SecretManagerInterface):
    """HashiCorp Vault implementation"""
    
    def __init__(self, url: str, token: str, mount_point: str = "secret"):
        if not HAS_VAULT:
            raise ImportError("hvac is required for HashiCorp Vault")
        
        self.url = url
        self.mount_point = mount_point
        self.client = hvac.Client(url=url, token=token)
        
        if not self.client.is_authenticated():
            raise ValueError("Failed to authenticate with HashiCorp Vault")
        
        logger.info(f"Initialized HashiCorp Vault client for: {url}")
    
    async def get_secret(self, secret_name: str, key: Optional[str] = None) -> str:
        """Retrieve a secret from HashiCorp Vault"""
        try:
            response = self.client.secrets.kv.v2.read_secret_version(
                mount_point=self.mount_point,
                path=secret_name
            )
            
            secret_data = response['data']['data']
            
            if key:
                return secret_data.get(key, "")
            
            # If no key specified, return first value or JSON dump
            if len(secret_data) == 1:
                return list(secret_data.values())[0]
            
            return json.dumps(secret_data)
            
        except Exception as e:
            logger.error(f"Error retrieving secret {secret_name} from Vault: {e}")
            return ""
    
    async def get_secrets(self, secret_name: str) -> Dict[str, str]:
        """Retrieve all key-value pairs from a Vault secret"""
        try:
            response = self.client.secrets.kv.v2.read_secret_version(
                mount_point=self.mount_point,
                path=secret_name
            )
            return response['data']['data']
        except Exception as e:
            logger.error(f"Error retrieving secrets {secret_name} from Vault: {e}")
            return {}
    
    async def health_check(self) -> bool:
        """Check HashiCorp Vault connectivity"""
        try:
            return self.client.is_authenticated() and self.client.sys.is_initialized()
        except Exception as e:
            logger.error(f"HashiCorp Vault health check failed: {e}")
            return False


class EnvironmentSecrets(SecretManagerInterface):
    """Fallback environment variable implementation for development"""
    
    def __init__(self):
        logger.warning("Using environment variables for secrets - NOT for production!")
    
    async def get_secret(self, secret_name: str, key: Optional[str] = None) -> str:
        """Get secret from environment variables"""
        env_var = f"{secret_name.upper()}"
        if key:
            env_var = f"{secret_name.upper()}_{key.upper()}"
        
        return os.getenv(env_var, "")
    
    async def get_secrets(self, secret_name: str) -> Dict[str, str]:
        """Get multiple secrets from environment (limited implementation)"""
        # Simple implementation - look for common patterns
        secrets = {}
        prefix = f"{secret_name.upper()}_"
        
        for env_var, value in os.environ.items():
            if env_var.startswith(prefix):
                key = env_var[len(prefix):].lower()
                secrets[key] = value
        
        return secrets
    
    async def health_check(self) -> bool:
        """Environment variables are always available"""
        return True


class SecretsManager:
    """
    SR-2: Centralized secrets management for the XORJ Quantitative Engine
    Supports AWS Secrets Manager, HashiCorp Vault, and environment fallback
    """
    
    def __init__(self, config: SecretConfig):
        self.config = config
        self.provider = self._create_provider()
        logger.info(f"Initialized secrets manager with provider: {config.provider.value}")
    
    def _create_provider(self) -> SecretManagerInterface:
        """Create the appropriate secret provider based on configuration"""
        if self.config.provider == SecretProvider.AWS_SECRETS_MANAGER:
            if not HAS_AWS:
                logger.error("boto3 not available, falling back to environment variables")
                return EnvironmentSecrets()
            return AWSSecretsManager(region=self.config.region or "us-east-1")
        
        elif self.config.provider == SecretProvider.HASHICORP_VAULT:
            if not HAS_VAULT:
                logger.error("hvac not available, falling back to environment variables")
                return EnvironmentSecrets()
            return HashiCorpVault(
                url=self.config.vault_url,
                token=self.config.vault_token,
                mount_point=self.config.vault_mount_point
            )
        
        else:  # Environment fallback
            return EnvironmentSecrets()
    
    async def get_database_url(self) -> str:
        """Get database connection URL"""
        if self.config.provider == SecretProvider.ENVIRONMENT:
            return await self.provider.get_secret("DATABASE_URL")
        
        # For production, get from structured secret
        db_secrets = await self.provider.get_secrets("xorj/database")
        if db_secrets:
            host = db_secrets.get("host", "localhost")
            port = db_secrets.get("port", "5432") 
            database = db_secrets.get("database", "xorj_quant")
            username = db_secrets.get("username", "xorj")
            password = db_secrets.get("password", "")
            
            return f"postgresql://{username}:{password}@{host}:{port}/{database}"
        
        return ""
    
    async def get_redis_url(self) -> str:
        """Get Redis connection URL"""
        if self.config.provider == SecretProvider.ENVIRONMENT:
            return await self.provider.get_secret("REDIS_URL")
        
        redis_secrets = await self.provider.get_secrets("xorj/redis")
        if redis_secrets:
            host = redis_secrets.get("host", "localhost")
            port = redis_secrets.get("port", "6379")
            password = redis_secrets.get("password", "")
            
            if password:
                return f"redis://:{password}@{host}:{port}"
            return f"redis://{host}:{port}"
        
        return ""
    
    async def get_api_key(self, service: str) -> str:
        """Get API key for external services"""
        if self.config.provider == SecretProvider.ENVIRONMENT:
            return await self.provider.get_secret(f"{service.upper()}_API_KEY")
        
        return await self.provider.get_secret("xorj/api-keys", service)
    
    async def get_internal_api_key(self) -> str:
        """Get internal API key for FR-4 authentication"""
        if self.config.provider == SecretProvider.ENVIRONMENT:
            return await self.provider.get_secret("XORJ_INTERNAL_API_KEY")
        
        return await self.provider.get_secret("xorj/internal", "api_key")
    
    async def health_check(self) -> bool:
        """Check if secrets provider is healthy"""
        return await self.provider.health_check()


# Global secrets manager instance
_secrets_manager: Optional[SecretsManager] = None


def get_secrets_config() -> SecretConfig:
    """Get secrets configuration from environment"""
    provider_name = os.getenv("SECRETS_PROVIDER", "environment").lower()
    
    try:
        provider = SecretProvider(provider_name)
    except ValueError:
        logger.warning(f"Unknown secrets provider: {provider_name}, using environment")
        provider = SecretProvider.ENVIRONMENT
    
    return SecretConfig(
        provider=provider,
        region=os.getenv("AWS_REGION"),
        vault_url=os.getenv("VAULT_URL"),
        vault_token=os.getenv("VAULT_TOKEN"),
        vault_mount_point=os.getenv("VAULT_MOUNT_POINT", "secret")
    )


async def get_secrets_manager() -> SecretsManager:
    """Get global secrets manager instance"""
    global _secrets_manager
    
    if _secrets_manager is None:
        config = get_secrets_config()
        _secrets_manager = SecretsManager(config)
    
    return _secrets_manager


async def init_secrets_manager() -> SecretsManager:
    """Initialize secrets manager and verify connectivity"""
    secrets_manager = await get_secrets_manager()
    
    # Verify connectivity
    if not await secrets_manager.health_check():
        logger.error("Secrets manager health check failed")
        raise RuntimeError("Failed to initialize secrets manager")
    
    logger.info("Secrets manager initialized successfully")
    return secrets_manager