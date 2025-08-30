"""
XORJ Quantitative Engine - Solana RPC Client
High-performance Solana client with rate limiting and retry logic
"""

import asyncio
from typing import Any, Dict, List, Optional, Union
from datetime import datetime, timezone
import httpx
from solana.rpc.async_api import AsyncClient
from solana.rpc.commitment import Commitment
from solana.rpc.types import DataSliceOpts, TokenAccountOpts
from solders.pubkey import Pubkey
from solders.signature import Signature

from ..core.config import get_settings
from ..core.logging import get_ingestion_logger
from ..core.retry import retry_with_backoff, RetrySession, RateLimitError, TransientError

settings = get_settings()
logger = get_ingestion_logger()


class SolanaRateLimiter:
    """Rate limiter for Solana RPC requests"""
    
    def __init__(self, requests_per_second: int = None):
        self.requests_per_second = requests_per_second or settings.rpc_requests_per_second
        self.min_interval = 1.0 / self.requests_per_second
        self.last_request_time = 0.0
    
    async def acquire(self):
        """Wait for rate limit before allowing request"""
        current_time = asyncio.get_event_loop().time()
        time_since_last = current_time - self.last_request_time
        
        if time_since_last < self.min_interval:
            sleep_time = self.min_interval - time_since_last
            await asyncio.sleep(sleep_time)
        
        self.last_request_time = asyncio.get_event_loop().time()


class EnhancedSolanaClient:
    """Enhanced Solana client with retry logic, rate limiting, and monitoring"""
    
    def __init__(
        self,
        rpc_url: str = None,
        commitment: str = None,
        timeout: int = 30,
        rate_limiter: SolanaRateLimiter = None
    ):
        self.rpc_url = rpc_url or settings.solana_rpc_url
        self.commitment = Commitment(commitment or settings.solana_commitment_level)
        self.timeout = timeout
        self.rate_limiter = rate_limiter or SolanaRateLimiter()
        
        # Create async client
        self.client = AsyncClient(
            endpoint=self.rpc_url,
            commitment=self.commitment,
            timeout=timeout
        )
        
        # Statistics tracking
        self.request_count = 0
        self.error_count = 0
        self.retry_count = 0
        
        logger.info(
            "Initialized Solana client",
            rpc_url=self.rpc_url,
            commitment=commitment,
            timeout=timeout
        )
    
    async def __aenter__(self):
        """Async context manager entry"""
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit"""
        await self.close()
    
    async def close(self):
        """Close the client connection"""
        await self.client.close()
    
    async def _make_request(self, method_name: str, *args, **kwargs) -> Any:
        """Make a rate-limited, retried RPC request"""
        await self.rate_limiter.acquire()
        self.request_count += 1
        
        try:
            method = getattr(self.client, method_name)
            result = await method(*args, **kwargs)
            
            # Check for RPC errors
            if hasattr(result, 'value') and result.value is None:
                raise TransientError(f"RPC returned null value for {method_name}")
            
            return result
            
        except Exception as e:
            self.error_count += 1
            
            # Convert specific errors to retryable types
            error_str = str(e).lower()
            if any(pattern in error_str for pattern in ["rate limit", "too many requests"]):
                raise RateLimitError(f"Rate limited: {str(e)}")
            elif any(pattern in error_str for pattern in ["timeout", "connection", "network"]):
                raise TransientError(f"Network error: {str(e)}")
            
            raise
    
    @retry_with_backoff(max_attempts=3, base_delay=1.0)
    async def get_transaction_signatures(
        self,
        wallet_address: Union[str, Pubkey],
        before: Optional[str] = None,
        until: Optional[str] = None,
        limit: int = 1000
    ) -> List[Dict[str, Any]]:
        """
        Get transaction signatures for a wallet with pagination support
        
        Args:
            wallet_address: Wallet public key
            before: Fetch signatures before this signature
            until: Fetch signatures until this signature (inclusive)
            limit: Maximum number of signatures to return (max 1000)
        
        Returns:
            List of transaction signature objects
        """
        if isinstance(wallet_address, str):
            wallet_address = Pubkey.from_string(wallet_address)
        
        logger.debug(
            "Fetching transaction signatures",
            wallet=str(wallet_address),
            limit=limit,
            before=before,
            until=until
        )
        
        result = await self._make_request(
            "get_signatures_for_address",
            wallet_address,
            before=Signature.from_string(before) if before else None,
            until=Signature.from_string(until) if until else None,
            limit=limit
        )
        
        signatures = result.value if hasattr(result, 'value') else result
        
        logger.debug(
            "Retrieved transaction signatures",
            wallet=str(wallet_address),
            count=len(signatures) if signatures else 0
        )
        
        return signatures or []
    
    @retry_with_backoff(max_attempts=3, base_delay=1.0)
    async def get_transaction(
        self,
        signature: Union[str, Signature],
        max_supported_transaction_version: int = 0
    ) -> Optional[Dict[str, Any]]:
        """
        Get transaction details by signature
        
        Args:
            signature: Transaction signature
            max_supported_transaction_version: Maximum transaction version to support
        
        Returns:
            Transaction details or None if not found
        """
        if isinstance(signature, str):
            signature = Signature.from_string(signature)
        
        result = await self._make_request(
            "get_transaction",
            signature,
            encoding="jsonParsed",
            max_supported_transaction_version=max_supported_transaction_version
        )
        
        transaction = result.value if hasattr(result, 'value') else result
        
        if transaction is None:
            logger.warning("Transaction not found", signature=str(signature))
        
        return transaction
    
    @retry_with_backoff(max_attempts=2, base_delay=2.0)
    async def get_multiple_transactions(
        self,
        signatures: List[Union[str, Signature]],
        max_supported_transaction_version: int = 0,
        batch_size: int = 100
    ) -> List[Optional[Dict[str, Any]]]:
        """
        Get multiple transactions in batches
        
        Args:
            signatures: List of transaction signatures
            max_supported_transaction_version: Maximum transaction version to support
            batch_size: Number of transactions per batch
        
        Returns:
            List of transaction details (None for not found)
        """
        if not signatures:
            return []
        
        # Convert to Signature objects
        sig_objects = []
        for sig in signatures:
            if isinstance(sig, str):
                sig_objects.append(Signature.from_string(sig))
            else:
                sig_objects.append(sig)
        
        logger.debug(
            "Fetching multiple transactions",
            count=len(sig_objects),
            batch_size=batch_size
        )
        
        all_transactions = []
        
        # Process in batches to avoid overwhelming the RPC
        for i in range(0, len(sig_objects), batch_size):
            batch = sig_objects[i:i + batch_size]
            
            try:
                # Use parallel requests for better performance
                tasks = [
                    self.get_transaction(sig, max_supported_transaction_version)
                    for sig in batch
                ]
                
                batch_results = await asyncio.gather(*tasks, return_exceptions=True)
                
                # Handle results and exceptions
                for j, result in enumerate(batch_results):
                    if isinstance(result, Exception):
                        logger.warning(
                            "Failed to fetch transaction",
                            signature=str(batch[j]),
                            error=str(result)
                        )
                        all_transactions.append(None)
                    else:
                        all_transactions.append(result)
                        
            except Exception as e:
                logger.error(
                    "Batch transaction fetch failed",
                    batch_start=i,
                    batch_size=len(batch),
                    error=str(e)
                )
                # Add None for all transactions in this batch
                all_transactions.extend([None] * len(batch))
        
        success_count = sum(1 for tx in all_transactions if tx is not None)
        
        logger.info(
            "Completed multiple transaction fetch",
            requested=len(signatures),
            retrieved=success_count,
            failed=len(signatures) - success_count
        )
        
        return all_transactions
    
    @retry_with_backoff(max_attempts=3, base_delay=1.0)
    async def get_account_info(
        self,
        account: Union[str, Pubkey],
        encoding: str = "base64"
    ) -> Optional[Dict[str, Any]]:
        """Get account information"""
        if isinstance(account, str):
            account = Pubkey.from_string(account)
        
        result = await self._make_request(
            "get_account_info",
            account,
            encoding=encoding
        )
        
        return result.value if hasattr(result, 'value') else result
    
    @retry_with_backoff(max_attempts=2, base_delay=1.0)
    async def get_current_slot(self) -> int:
        """Get current slot number"""
        result = await self._make_request("get_slot")
        return result.value if hasattr(result, 'value') else result
    
    async def get_health_status(self) -> Dict[str, Any]:
        """Get client health and statistics"""
        try:
            current_slot = await self.get_current_slot()
            healthy = True
        except Exception as e:
            current_slot = None
            healthy = False
            logger.error("Health check failed", error=str(e))
        
        return {
            "healthy": healthy,
            "rpc_url": self.rpc_url,
            "commitment": str(self.commitment),
            "current_slot": current_slot,
            "request_count": self.request_count,
            "error_count": self.error_count,
            "retry_count": self.retry_count,
            "error_rate": self.error_count / max(self.request_count, 1),
            "last_check": datetime.now(timezone.utc).isoformat()
        }


class HeliusClient(EnhancedSolanaClient):
    """Specialized client for Helius RPC with enhanced features"""
    
    def __init__(self, api_key: str = None, **kwargs):
        self.api_key = api_key or settings.helius_api_key
        
        if self.api_key:
            # Use Helius endpoint with API key
            rpc_url = f"https://mainnet.helius-rpc.com/?api-key={self.api_key}"
        else:
            # Fallback to public endpoint
            rpc_url = settings.solana_rpc_url
            logger.warning("No Helius API key provided, using public RPC")
        
        super().__init__(rpc_url=rpc_url, **kwargs)
        
        logger.info(
            "Initialized Helius client",
            has_api_key=bool(self.api_key),
            endpoint="helius" if self.api_key else "public"
        )
    
    async def get_asset_batch(self, asset_ids: List[str]) -> List[Dict[str, Any]]:
        """Get asset information using Helius DAS API (if available)"""
        if not self.api_key:
            raise Exception("Helius API key required for DAS API access")
        
        # This would use Helius's Digital Asset Standard API
        # Implementation depends on specific Helius API endpoints
        logger.warning("Helius DAS API integration not yet implemented")
        return []


# Singleton instances for reuse
_default_client: Optional[EnhancedSolanaClient] = None
_helius_client: Optional[HeliusClient] = None


async def get_default_solana_client() -> EnhancedSolanaClient:
    """Get the default Solana client instance"""
    global _default_client
    
    if _default_client is None:
        _default_client = EnhancedSolanaClient()
    
    return _default_client


async def get_helius_client() -> HeliusClient:
    """Get the Helius client instance"""
    global _helius_client
    
    if _helius_client is None:
        _helius_client = HeliusClient()
    
    return _helius_client


async def close_all_clients():
    """Close all client instances"""
    global _default_client, _helius_client
    
    if _default_client:
        await _default_client.close()
        _default_client = None
    
    if _helius_client:
        await _helius_client.close()
        _helius_client = None