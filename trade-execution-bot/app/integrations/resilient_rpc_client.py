"""
Resilient RPC Client with Exponential Backoff for Python/Solana Integration
Implements retry logic for Solana RPC calls to handle rate limiting and transient failures.
Follows PRD requirements for External Dependency Remediation - Priority 3 (HIGH)
"""

import asyncio
import json
import logging
from typing import Any, Dict, List, Optional, Union
from dataclasses import dataclass
from datetime import datetime
import os

import httpx
import structlog
from solana.rpc.async_api import AsyncClient
from solana.rpc.commitment import Commitment
from solana.rpc.types import TxOpts
from solders.pubkey import Pubkey

logger = structlog.get_logger(__name__)

@dataclass
class RpcRequest:
    """RPC request wrapper"""
    method: str
    params: List[Any] = None
    id: Optional[Union[str, int]] = None

@dataclass
class RpcResponse:
    """RPC response wrapper"""
    result: Any = None
    error: Optional[Dict[str, Any]] = None
    id: Optional[Union[str, int]] = None
    jsonrpc: str = "2.0"

@dataclass
class RpcMetrics:
    """RPC performance metrics"""
    total_requests: int = 0
    successful_requests: int = 0
    failed_requests: int = 0
    retry_requests: int = 0
    avg_response_time_ms: float = 0.0
    last_error: Optional[str] = None
    last_error_time: Optional[datetime] = None

class ResilientRpcClient:
    """
    Resilient RPC Client for Solana with exponential backoff and fallback support.
    
    Features:
    - Exponential backoff retry mechanism
    - Multiple RPC endpoint support (primary + fallback)
    - Rate limiting protection
    - Comprehensive error handling
    - Request/response logging
    - Performance metrics tracking
    """
    
    def __init__(
        self,
        primary_rpc_url: str,
        fallback_rpc_url: Optional[str] = None,
        commitment: str = "confirmed",
        max_retries: int = 5,
        initial_delay_ms: int = 1000,
        max_delay_ms: int = 30000,
        timeout_seconds: int = 30
    ):
        self.primary_rpc_url = primary_rpc_url
        self.fallback_rpc_url = fallback_rpc_url
        self.commitment = commitment
        self.max_retries = max_retries
        self.initial_delay_ms = initial_delay_ms
        self.max_delay_ms = max_delay_ms
        self.timeout_seconds = timeout_seconds
        
        # Initialize clients
        self.primary_client = AsyncClient(primary_rpc_url, commitment=Commitment(commitment))
        self.fallback_client = None
        if fallback_rpc_url:
            self.fallback_client = AsyncClient(fallback_rpc_url, commitment=Commitment(commitment))
        
        # Metrics and state
        self.metrics = RpcMetrics()
        self.request_id_counter = 0
        
        logger.info(
            "Resilient RPC client initialized",
            primary_url=primary_rpc_url[:50] + "..." if len(primary_rpc_url) > 50 else primary_rpc_url,
            has_fallback=fallback_rpc_url is not None,
            max_retries=max_retries,
            commitment=commitment
        )

    async def send_rpc_request_with_retry(
        self, 
        request: RpcRequest,
        use_fallback: bool = False
    ) -> Any:
        """
        Send RPC request with exponential backoff retry logic.
        
        Args:
            request: RPC request details
            use_fallback: Whether to use fallback endpoint
            
        Returns:
            RPC response result
            
        Raises:
            Exception: After all retries exhausted
        """
        current_delay_ms = self.initial_delay_ms
        last_exception = None
        
        client = self.fallback_client if use_fallback and self.fallback_client else self.primary_client
        endpoint_type = "fallback" if use_fallback else "primary"
        
        self.metrics.total_requests += 1
        
        for attempt in range(1, self.max_retries + 1):
            try:
                start_time = datetime.now()
                
                logger.debug(
                    "RPC request attempt",
                    attempt=attempt,
                    max_attempts=self.max_retries,
                    method=request.method,
                    endpoint=endpoint_type
                )
                
                # Execute the actual RPC call
                result = await self._execute_rpc_request(client, request)
                
                # Calculate response time
                response_time_ms = (datetime.now() - start_time).total_seconds() * 1000
                self._update_success_metrics(response_time_ms)
                
                if attempt > 1:
                    logger.info(
                        "RPC request succeeded after retries",
                        method=request.method,
                        attempt=attempt,
                        endpoint=endpoint_type,
                        response_time_ms=response_time_ms
                    )
                
                return result
                
            except Exception as error:
                last_exception = error
                is_retryable = self._is_retryable_error(error)
                is_last_attempt = attempt == self.max_retries
                
                # Log the error
                logger.warning(
                    "RPC request failed",
                    method=request.method,
                    attempt=attempt,
                    max_attempts=self.max_retries,
                    endpoint=endpoint_type,
                    error=str(error),
                    error_type=type(error).__name__,
                    is_retryable=is_retryable
                )
                
                if is_retryable and not is_last_attempt:
                    # Wait with exponential backoff
                    delay_ms = min(current_delay_ms, self.max_delay_ms)
                    logger.info(
                        "Retrying RPC request",
                        method=request.method,
                        attempt=attempt,
                        next_attempt=attempt + 1,
                        delay_ms=delay_ms
                    )
                    
                    await asyncio.sleep(delay_ms / 1000.0)
                    current_delay_ms *= 2  # Exponential backoff
                    self.metrics.retry_requests += 1
                    
                elif is_last_attempt and not use_fallback and self.fallback_client:
                    # Try fallback on final attempt
                    logger.warning(
                        "Primary endpoint exhausted, trying fallback",
                        method=request.method,
                        primary_error=str(error)
                    )
                    
                    try:
                        return await self.send_rpc_request_with_retry(request, use_fallback=True)
                    except Exception as fallback_error:
                        logger.error(
                            "Fallback endpoint also failed",
                            method=request.method,
                            fallback_error=str(fallback_error)
                        )
                        last_exception = fallback_error
                
                # Update failure metrics
                self._update_failure_metrics(str(error))
        
        # All retries exhausted
        error_message = f"RPC request failed after {self.max_retries} attempts. Last error: {str(last_exception)}"
        logger.error(
            "RPC request completely failed",
            method=request.method,
            total_attempts=self.max_retries,
            final_error=str(last_exception)
        )
        
        raise Exception(error_message) from last_exception

    async def _execute_rpc_request(self, client: AsyncClient, request: RpcRequest) -> Any:
        """
        Execute the actual RPC request using the Solana client.
        
        Args:
            client: AsyncClient instance to use
            request: RPC request details
            
        Returns:
            RPC response result
        """
        method = request.method
        params = request.params or []
        
        # Map common RPC methods to AsyncClient methods
        if method == "getAccountInfo":
            if len(params) >= 1:
                pubkey = Pubkey.from_string(params[0]) if isinstance(params[0], str) else params[0]
                response = await client.get_account_info(pubkey)
                return response.value
            
        elif method == "getBalance":
            if len(params) >= 1:
                pubkey = Pubkey.from_string(params[0]) if isinstance(params[0], str) else params[0]
                response = await client.get_balance(pubkey)
                return {"value": response.value}
            
        elif method == "getTokenAccountsByOwner":
            if len(params) >= 2:
                owner = Pubkey.from_string(params[0]) if isinstance(params[0], str) else params[0]
                mint_filter = params[1] if isinstance(params[1], dict) else {"mint": params[1]}
                encoding = params[2] if len(params) > 2 else {"encoding": "jsonParsed"}
                response = await client.get_token_accounts_by_owner(owner, mint_filter, encoding=encoding.get("encoding", "jsonParsed"))
                return {"value": response.value}
            
        elif method == "getSignaturesForAddress":
            if len(params) >= 1:
                address = Pubkey.from_string(params[0]) if isinstance(params[0], str) else params[0]
                options = params[1] if len(params) > 1 else {}
                response = await client.get_signatures_for_address(address, **options)
                return response.value
            
        elif method == "getTransaction":
            if len(params) >= 1:
                signature = params[0]
                options = params[1] if len(params) > 1 else {"encoding": "jsonParsed", "maxSupportedTransactionVersion": 0}
                response = await client.get_transaction(signature, **options)
                return response.value
            
        elif method == "getSlot":
            response = await client.get_slot()
            return response.value
            
        elif method == "getBlockHeight":
            response = await client.get_block_height()
            return response.value
            
        elif method == "getVersion":
            response = await client.get_version()
            return response.value
            
        elif method == "sendTransaction":
            if len(params) >= 1:
                transaction = params[0]
                options = params[1] if len(params) > 1 else {}
                response = await client.send_transaction(transaction, opts=TxOpts(**options))
                return response.value
                
        else:
            # Fallback to raw HTTP request for unsupported methods
            return await self._send_raw_rpc_request(client.get_rpc_endpoint(), request)

    async def _send_raw_rpc_request(self, rpc_url: str, request: RpcRequest) -> Any:
        """
        Send raw RPC request via HTTP for methods not supported by AsyncClient.
        
        Args:
            rpc_url: RPC endpoint URL
            request: RPC request details
            
        Returns:
            RPC response result
        """
        payload = {
            "jsonrpc": "2.0",
            "id": request.id or self._generate_request_id(),
            "method": request.method,
            "params": request.params or []
        }
        
        async with httpx.AsyncClient(timeout=self.timeout_seconds) as http_client:
            response = await http_client.post(
                rpc_url,
                headers={"Content-Type": "application/json"},
                json=payload
            )
            
            # Check HTTP status
            if not response.is_success:
                raise httpx.HTTPError(f"HTTP {response.status_code}: {response.text}")
            
            rpc_response = response.json()
            
            # Check for RPC error
            if "error" in rpc_response:
                error = rpc_response["error"]
                raise Exception(f"RPC error {error.get('code', 'unknown')}: {error.get('message', 'unknown error')}")
            
            return rpc_response.get("result")

    def _is_retryable_error(self, error: Exception) -> bool:
        """
        Determine if an error is retryable.
        
        Args:
            error: Exception to check
            
        Returns:
            True if error is retryable
        """
        error_str = str(error).lower()
        error_type = type(error).__name__
        
        # HTTP errors that are retryable
        if isinstance(error, httpx.HTTPError):
            # Rate limiting and server errors
            if any(code in error_str for code in ["429", "500", "502", "503", "504"]):
                return True
        
        # Network and timeout errors
        if isinstance(error, (httpx.TimeoutException, httpx.NetworkError)):
            return True
        
        # Solana-specific retryable errors
        retryable_messages = [
            "too many requests",
            "rate limit",
            "service unavailable", 
            "gateway timeout",
            "internal server error",
            "temporary failure",
            "timeout",
            "connection reset",
            "network error",
            "node behind",
            "transaction not found"  # Often temporary
        ]
        
        return any(msg in error_str for msg in retryable_messages)

    def _update_success_metrics(self, response_time_ms: float) -> None:
        """Update metrics for successful request"""
        self.metrics.successful_requests += 1
        
        # Update average response time
        total_successful = self.metrics.successful_requests
        if total_successful == 1:
            self.metrics.avg_response_time_ms = response_time_ms
        else:
            self.metrics.avg_response_time_ms = (
                (self.metrics.avg_response_time_ms * (total_successful - 1) + response_time_ms) 
                / total_successful
            )

    def _update_failure_metrics(self, error_message: str) -> None:
        """Update metrics for failed request"""
        self.metrics.failed_requests += 1
        self.metrics.last_error = error_message
        self.metrics.last_error_time = datetime.now()

    def _generate_request_id(self) -> int:
        """Generate unique request ID"""
        self.request_id_counter += 1
        return self.request_id_counter

    # Convenience methods for common Solana operations
    
    async def get_account_info(self, pubkey: str) -> Any:
        """Get account info with retry logic"""
        request = RpcRequest(method="getAccountInfo", params=[pubkey, {"encoding": "base64"}])
        return await self.send_rpc_request_with_retry(request)

    async def get_balance(self, pubkey: str) -> int:
        """Get balance with retry logic"""
        request = RpcRequest(method="getBalance", params=[pubkey])
        result = await self.send_rpc_request_with_retry(request)
        return result["value"] if isinstance(result, dict) else result

    async def get_token_accounts_by_owner(self, owner: str, mint: str) -> Any:
        """Get token accounts with retry logic"""
        request = RpcRequest(
            method="getTokenAccountsByOwner",
            params=[owner, {"mint": mint}, {"encoding": "jsonParsed"}]
        )
        return await self.send_rpc_request_with_retry(request)

    async def get_signatures_for_address(self, address: str, limit: int = 1000) -> Any:
        """Get transaction signatures with retry logic"""
        request = RpcRequest(
            method="getSignaturesForAddress", 
            params=[address, {"limit": limit}]
        )
        return await self.send_rpc_request_with_retry(request)

    async def get_transaction(self, signature: str) -> Any:
        """Get transaction with retry logic"""
        request = RpcRequest(
            method="getTransaction",
            params=[signature, {
                "encoding": "jsonParsed",
                "maxSupportedTransactionVersion": 0
            }]
        )
        return await self.send_rpc_request_with_retry(request)

    async def health_check(self) -> bool:
        """Perform health check on RPC endpoints"""
        try:
            request = RpcRequest(method="getSlot")
            result = await self.send_rpc_request_with_retry(request)
            return result is not None and result > 0
        except Exception as error:
            logger.error("RPC health check failed", error=str(error))
            return False

    def get_metrics(self) -> RpcMetrics:
        """Get current RPC metrics"""
        return self.metrics

    def reset_metrics(self) -> None:
        """Reset RPC metrics"""
        self.metrics = RpcMetrics()

    async def close(self) -> None:
        """Close RPC clients"""
        await self.primary_client.close()
        if self.fallback_client:
            await self.fallback_client.close()

# Factory function to create resilient RPC client with environment configuration
def create_resilient_rpc_client() -> ResilientRpcClient:
    """
    Create resilient RPC client with environment-based configuration.
    Uses Helius as primary endpoint and public RPC as fallback.
    """
    # Get Helius API key from environment
    helius_api_key = os.getenv("HELIUS_API_KEY")
    
    # Configure primary RPC URL (prefer Helius if available)
    if helius_api_key:
        primary_rpc_url = f"https://mainnet.helius-rpc.com/?api-key={helius_api_key}"
        logger.info("Using Helius as primary RPC endpoint")
    else:
        primary_rpc_url = "https://api.mainnet-beta.solana.com"
        logger.warning("HELIUS_API_KEY not found, using public RPC as primary (may hit rate limits)")
    
    # Configure fallback RPC URL
    fallback_rpc_url = os.getenv("SOLANA_RPC_URL", "https://api.mainnet-beta.solana.com")
    
    # Don't use the same URL for both primary and fallback
    if primary_rpc_url == fallback_rpc_url:
        fallback_rpc_url = None
    
    return ResilientRpcClient(
        primary_rpc_url=primary_rpc_url,
        fallback_rpc_url=fallback_rpc_url,
        commitment="confirmed",
        max_retries=5,
        initial_delay_ms=1000,
        max_delay_ms=30000,
        timeout_seconds=30
    )

# Global instance
_global_resilient_client: Optional[ResilientRpcClient] = None

async def get_resilient_rpc_client() -> ResilientRpcClient:
    """Get or create global resilient RPC client instance"""
    global _global_resilient_client
    
    if _global_resilient_client is None:
        _global_resilient_client = create_resilient_rpc_client()
        
        # Test the client
        try:
            await _global_resilient_client.health_check()
            logger.info("Resilient RPC client initialized and tested successfully")
        except Exception as error:
            logger.error("Failed to initialize resilient RPC client", error=str(error))
            raise
    
    return _global_resilient_client