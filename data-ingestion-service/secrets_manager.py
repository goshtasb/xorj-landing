"""
Secrets Manager for XORJ On-Chain Data Ingestion Service
SR-1: Secrets Management - Secure API key loading without hardcoding
"""

import os
import json
from typing import Optional, Dict, Any
import structlog

logger = structlog.get_logger(__name__)

class SecretsManager:
    """
    Secure secrets management for sensitive configuration
    SR-1: No hardcoded secrets, proper secret loading from secure sources
    """
    
    def __init__(self):
        self._secrets_cache: Dict[str, str] = {}
        logger.info("Secrets Manager initialized")
    
    async def get_helius_api_key(self) -> str:
        """
        SR-1: Get Helius API key from secure sources
        Priority order: AWS Secrets Manager > Secure file > Environment (dev only)
        """
        
        # Check cache first
        if "helius_api_key" in self._secrets_cache:
            return self._secrets_cache["helius_api_key"]
        
        # Try AWS Secrets Manager first (production)
        api_key = await self._get_from_aws_secrets_manager("xorj/helius-api-key")
        if api_key:
            logger.info("Helius API key loaded from AWS Secrets Manager")
            self._secrets_cache["helius_api_key"] = api_key
            return api_key
        
        # Try secure file system (staging/dev)
        api_key = await self._get_from_secure_file("/etc/secrets/helius_api_key")
        if api_key:
            logger.info("Helius API key loaded from secure file system")
            self._secrets_cache["helius_api_key"] = api_key
            return api_key
        
        # Fallback to environment variable (development only)
        api_key = os.getenv("HELIUS_API_KEY")
        if api_key and api_key != "placeholder-helius-api-key":
            logger.warning("Helius API key loaded from environment variable (development mode)")
            self._secrets_cache["helius_api_key"] = api_key
            return api_key
        
        # Development/testing fallback
        logger.warning("Using placeholder API key for development/testing")
        return "placeholder-helius-api-key"
    
    async def _get_from_aws_secrets_manager(self, secret_name: str) -> Optional[str]:
        """Get secret from AWS Secrets Manager"""
        try:
            # This would use boto3 in production
            # For now, simulating unavailable AWS Secrets Manager
            logger.debug("Attempting to load from AWS Secrets Manager", secret_name=secret_name)
            return None
        except Exception as e:
            logger.warning("AWS Secrets Manager unavailable", error=str(e))
            return None
    
    async def _get_from_secure_file(self, file_path: str) -> Optional[str]:
        """Get secret from secure file system"""
        try:
            if os.path.exists(file_path) and os.access(file_path, os.R_OK):
                with open(file_path, 'r') as f:
                    secret = f.read().strip()
                if secret and len(secret) > 10:  # Basic validation
                    logger.debug("Secret loaded from secure file", file_path=file_path)
                    return secret
            return None
        except Exception as e:
            logger.debug("Secure file not available", file_path=file_path, error=str(e))
            return None
    
    async def get_database_connection_string(self) -> str:
        """Get database connection string securely"""
        # Check cache first
        if "db_connection" in self._secrets_cache:
            return self._secrets_cache["db_connection"]
        
        # Try secure sources
        db_conn = await self._get_from_aws_secrets_manager("xorj/database-connection")
        if db_conn:
            self._secrets_cache["db_connection"] = db_conn
            return db_conn
        
        # Fallback to environment for development
        db_conn = os.getenv("DATABASE_URL", "postgresql://xorj:@localhost:5432/xorj_quant")
        self._secrets_cache["db_connection"] = db_conn
        return db_conn
    
    def clear_cache(self):
        """Clear secrets cache for security"""
        self._secrets_cache.clear()
        logger.info("Secrets cache cleared")


# Global secrets manager instance
_secrets_manager: Optional[SecretsManager] = None

async def get_secrets_manager() -> SecretsManager:
    """Get or create the global secrets manager instance"""
    global _secrets_manager
    if _secrets_manager is None:
        _secrets_manager = SecretsManager()
    return _secrets_manager