"""
Rate-limited RPC client with caching and retry logic
Handles rate limiting (429 errors) gracefully with exponential backoff
"""

import asyncio
import time
import httpx
import json
import hashlib
import logging
from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta
from dataclasses import dataclass
from contextlib import asynccontextmanager

from .config import get_settings

logger = logging.getLogger(__name__)


@dataclass
class CacheEntry:
    """Cache entry with expiration"""
    data: Any
    expires_at: datetime


class RateLimitedRPCClient:
    """
    Rate-limited RPC client with Redis caching and retry logic
    Handles Helius API rate limits gracefully
    """
    
    def __init__(self):
        self.settings = get_settings()
        self.http_client: Optional[httpx.AsyncClient] = None
        self._last_request_time = 0.0
        self._request_count = 0
        self._burst_window_start = 0.0
        self._memory_cache: Dict[str, CacheEntry] = {}
        
    async def initialize(self):
        """Initialize HTTP client"""
        if not self.http_client:
            self.http_client = httpx.AsyncClient(
                timeout=30.0,
                limits=httpx.Limits(max_keepalive_connections=5, max_connections=10)
            )
            logger.info("Rate-limited RPC client initialized")
    
    async def close(self):
        """Close HTTP client"""
        if self.http_client:
            await self.http_client.aclose()
            self.http_client = None
    
    @asynccontextmanager
    async def client_context(self):
        """Context manager for HTTP client"""
        await self.initialize()
        try:
            yield self.http_client
        finally:
            pass  # Keep client alive for connection reuse
    
    def _get_cache_key(self, payload: Dict[str, Any]) -> str:
        """Generate cache key from RPC payload"""
        cache_data = json.dumps(payload, sort_keys=True)
        return hashlib.md5(cache_data.encode()).hexdigest()
    
    def _is_cacheable_method(self, method: str) -> bool:
        """Check if RPC method should be cached"""
        cacheable_methods = {
            'getProgramAccounts',
            'getTransaction', 
            'getSignaturesForAddress',
            'getAccountInfo',
            'getBlock'
        }
        return method in cacheable_methods
    
    def _get_from_cache(self, cache_key: str) -> Optional[Any]:
        """Get data from memory cache"""
        if cache_key in self._memory_cache:
            entry = self._memory_cache[cache_key]
            if entry.expires_at > datetime.utcnow():
                return entry.data
            else:
                # Remove expired entry
                del self._memory_cache[cache_key]
        return None
    
    def _store_in_cache(self, cache_key: str, data: Any):
        """Store data in memory cache"""
        expires_at = datetime.utcnow() + timedelta(seconds=self.settings.rpc_cache_ttl_seconds)
        self._memory_cache[cache_key] = CacheEntry(data=data, expires_at=expires_at)
        
        # Simple cache cleanup - remove expired entries occasionally
        if len(self._memory_cache) > 1000:
            now = datetime.utcnow()
            expired_keys = [
                key for key, entry in self._memory_cache.items() 
                if entry.expires_at <= now
            ]
            for key in expired_keys:
                del self._memory_cache[key]
    
    async def _enforce_rate_limit(self):
        """Enforce rate limiting before making requests"""
        now = time.time()
        
        # Reset burst window if needed (every second)
        if now - self._burst_window_start >= 1.0:
            self._request_count = 0
            self._burst_window_start = now
        
        # Check if we're within burst limit
        if self._request_count >= self.settings.rpc_burst_limit:
            # Wait until next window
            wait_time = 1.0 - (now - self._burst_window_start)
            if wait_time > 0:
                await asyncio.sleep(wait_time)
                self._request_count = 0
                self._burst_window_start = time.time()
        
        # Enforce minimum time between requests
        time_since_last = now - self._last_request_time
        min_interval = 1.0 / self.settings.rpc_requests_per_second
        
        if time_since_last < min_interval:
            wait_time = min_interval - time_since_last
            await asyncio.sleep(wait_time)
        
        self._last_request_time = time.time()
        self._request_count += 1
    
    async def make_rpc_request(
        self, 
        method: str, 
        params: List[Any] = None,
        max_retries: int = 3
    ) -> Optional[Dict[str, Any]]:
        """
        Make rate-limited RPC request with caching and retry logic
        """
        if params is None:
            params = []
            
        payload = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": method,
            "params": params
        }
        
        # Check cache first for cacheable methods
        cache_key = None
        if self._is_cacheable_method(method):
            cache_key = self._get_cache_key(payload)
            cached_result = self._get_from_cache(cache_key)
            if cached_result:
                logger.debug(f"Cache hit for {method}")
                return cached_result
        
        # Make request with retries
        last_exception = None
        
        for attempt in range(max_retries + 1):
            try:
                await self._enforce_rate_limit()
                
                async with self.client_context() as client:
                    response = await client.post(
                        self.settings.solana_rpc_url,
                        json=payload,
                        headers={"Content-Type": "application/json"}
                    )
                    
                    if response.status_code == 200:
                        result = response.json()
                        
                        # Cache successful responses
                        if cache_key and "result" in result:
                            self._store_in_cache(cache_key, result)
                        
                        return result
                    
                    elif response.status_code == 429:  # Rate limited
                        retry_delay = self.settings.rpc_retry_delay_seconds * (2 ** attempt)
                        logger.warning(
                            f"Rate limited (429) for {method}, attempt {attempt + 1}, "
                            f"retrying in {retry_delay:.1f}s"
                        )
                        
                        if attempt < max_retries:
                            await asyncio.sleep(retry_delay)
                            continue
                        else:
                            logger.error(f"Rate limit exceeded for {method} after {max_retries} retries")
                            return None
                    
                    else:
                        logger.error(f"RPC request failed with status {response.status_code}: {response.text}")
                        return None
                        
            except Exception as e:
                last_exception = e
                if attempt < max_retries:
                    retry_delay = self.settings.rpc_retry_delay_seconds * (2 ** attempt)
                    logger.warning(f"RPC request error: {e}, retrying in {retry_delay:.1f}s")
                    await asyncio.sleep(retry_delay)
                else:
                    logger.error(f"RPC request failed after {max_retries} retries: {e}")
                    return None
        
        return None
    
    async def get_program_accounts(
        self, 
        program_id: str, 
        filters: List[Dict] = None,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """Get program accounts with rate limiting"""
        if filters is None:
            filters = []
            
        params = [
            program_id,
            {
                "encoding": "jsonParsed",
                "filters": filters,
                "dataSlice": {"offset": 0, "length": 0}  # Only get account info
            }
        ]
        
        result = await self.make_rpc_request("getProgramAccounts", params)
        
        if result and "result" in result:
            accounts = result["result"]
            return accounts[:limit]  # Limit results to prevent overwhelming
        
        return []
    
    async def get_signatures_for_address(
        self, 
        address: str, 
        limit: int = 100
    ) -> List[str]:
        """Get recent signatures for address"""
        params = [address, {"limit": limit}]
        
        result = await self.make_rpc_request("getSignaturesForAddress", params)
        
        if result and "result" in result and result["result"]:
            return [tx["signature"] for tx in result["result"]]
        
        return []
    
    async def get_transaction(self, signature: str) -> Optional[Dict[str, Any]]:
        """Get transaction details"""
        params = [signature, {"encoding": "jsonParsed"}]
        
        result = await self.make_rpc_request("getTransaction", params)
        
        if result and "result" in result:
            return result["result"]
        
        return None


# Global RPC client instance
_rpc_client: Optional[RateLimitedRPCClient] = None


async def get_rpc_client() -> RateLimitedRPCClient:
    """Get global rate-limited RPC client"""
    global _rpc_client
    
    if _rpc_client is None:
        _rpc_client = RateLimitedRPCClient()
        await _rpc_client.initialize()
    
    return _rpc_client