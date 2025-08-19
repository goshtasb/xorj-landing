"""
XORJ Quantitative Engine - Historical Price Feed
Fetches historical price data for accurate USD valuation at trade execution time
"""

import asyncio
from datetime import datetime, timezone, timedelta
from decimal import Decimal, getcontext
from typing import Dict, List, Optional, Tuple, Union
import httpx
from dataclasses import dataclass
import time

from ..core.config import get_settings, get_supported_token_mints, get_token_mint
from ..core.logging import get_calculation_logger
from ..core.retry import retry_with_backoff, RetrySession, RateLimitError, TransientError

# Set high precision for all decimal calculations
getcontext().prec = 28

settings = get_settings()
logger = get_calculation_logger()


@dataclass
class PricePoint:
    """Single price data point with high precision"""
    timestamp: datetime
    mint: str
    symbol: str
    price_usd: Decimal
    source: str
    confidence: float = 1.0  # 0.0 to 1.0 confidence in price accuracy
    
    def __post_init__(self):
        """Ensure price is stored as high-precision Decimal"""
        if not isinstance(self.price_usd, Decimal):
            self.price_usd = Decimal(str(self.price_usd))


class HistoricalPriceFeed:
    """
    High-precision historical price feed with multiple data sources
    Provides accurate USD valuations at trade execution time
    """
    
    def __init__(self):
        self.supported_tokens = get_supported_token_mints()
        self.client = httpx.AsyncClient(timeout=30.0)
        
        # Price caching to reduce API calls
        self.price_cache: Dict[str, PricePoint] = {}  # key: "mint_timestamp"
        self.cache_ttl_seconds = 3600  # 1 hour cache for historical prices
        
        # Rate limiting
        self.last_request_times: Dict[str, float] = {}  # source -> last_request_time
        self.rate_limits = {
            'coingecko': 0.5,  # 2 requests per second with free tier
            'jupiter': 0.1,    # 10 requests per second
            'fallback': 1.0    # Conservative fallback
        }
        
        # Retry session for robust error handling
        self.retry_session = RetrySession(
            max_attempts=3,
            base_delay=1.0,
            max_delay=60.0
        )
        
        logger.info(
            "Initialized historical price feed",
            supported_tokens=list(self.supported_tokens.keys()),
            cache_ttl_hours=self.cache_ttl_seconds / 3600
        )
    
    async def close(self):
        """Close the HTTP client"""
        await self.client.aclose()
    
    def _get_cache_key(self, mint: str, timestamp: datetime) -> str:
        """Generate cache key for price data"""
        # Round timestamp to nearest minute for caching efficiency
        rounded_timestamp = timestamp.replace(second=0, microsecond=0)
        return f"{mint}_{rounded_timestamp.isoformat()}"
    
    def _is_cache_valid(self, price_point: PricePoint) -> bool:
        """Check if cached price point is still valid"""
        age_seconds = (datetime.now(timezone.utc) - price_point.timestamp).total_seconds()
        return age_seconds < self.cache_ttl_seconds
    
    async def _rate_limit_wait(self, source: str):
        """Implement rate limiting for API sources"""
        rate_limit = self.rate_limits.get(source, self.rate_limits['fallback'])
        last_request = self.last_request_times.get(source, 0)
        
        time_since_last = time.time() - last_request
        if time_since_last < rate_limit:
            wait_time = rate_limit - time_since_last
            await asyncio.sleep(wait_time)
        
        self.last_request_times[source] = time.time()
    
    @retry_with_backoff(max_attempts=3, base_delay=1.0)
    async def _fetch_coingecko_price(
        self, 
        symbol: str, 
        timestamp: datetime
    ) -> Optional[Decimal]:
        """
        Fetch historical price from CoinGecko API
        
        Args:
            symbol: Token symbol (e.g., 'solana', 'usd-coin')
            timestamp: Target timestamp for price
            
        Returns:
            Price in USD as high-precision Decimal
        """
        await self._rate_limit_wait('coingecko')
        
        # Map token symbols to CoinGecko IDs
        coingecko_ids = {
            'SOL': 'solana',
            'USDC': 'usd-coin',
            'USDT': 'tether',
            'RAY': 'raydium',
            'BONK': 'bonk',
            'JUP': 'jupiter-exchange-solana'
        }
        
        coingecko_id = coingecko_ids.get(symbol.upper())
        if not coingecko_id:
            logger.warning(f"No CoinGecko ID mapping for symbol: {symbol}")
            return None
        
        # Format date for CoinGecko API (DD-MM-YYYY)
        date_str = timestamp.strftime("%d-%m-%Y")
        
        url = f"https://api.coingecko.com/api/v3/coins/{coingecko_id}/history"
        params = {
            'date': date_str,
            'localization': 'false'
        }
        
        # Add API key if available
        if settings.coingecko_api_key:
            headers = {'X-CG-Demo-API-Key': settings.coingecko_api_key}
        else:
            headers = {}
        
        try:
            logger.debug(
                "Fetching CoinGecko historical price",
                symbol=symbol,
                coingecko_id=coingecko_id,
                date=date_str
            )
            
            response = await self.client.get(url, params=params, headers=headers)
            
            if response.status_code == 429:
                raise RateLimitError("CoinGecko rate limit exceeded")
            elif response.status_code >= 400:
                raise TransientError(f"CoinGecko API error: {response.status_code}")
            
            data = response.json()
            
            if 'market_data' in data and 'current_price' in data['market_data']:
                price_data = data['market_data']['current_price']
                if 'usd' in price_data:
                    price = Decimal(str(price_data['usd']))
                    logger.debug(
                        "Retrieved CoinGecko price",
                        symbol=symbol,
                        price_usd=str(price),
                        date=date_str
                    )
                    return price
            
            logger.warning(
                "No price data in CoinGecko response",
                symbol=symbol,
                response_keys=list(data.keys()) if isinstance(data, dict) else "non-dict"
            )
            return None
            
        except httpx.RequestError as e:
            raise TransientError(f"CoinGecko request failed: {str(e)}")
        except Exception as e:
            logger.error(
                "CoinGecko price fetch error",
                symbol=symbol,
                error=str(e),
                error_type=type(e).__name__
            )
            return None
    
    @retry_with_backoff(max_attempts=2, base_delay=0.5)
    async def _fetch_jupiter_current_price(self, mint: str) -> Optional[Decimal]:
        """
        Fetch current price from Jupiter API (for recent timestamps)
        
        Args:
            mint: Token mint address
            
        Returns:
            Current price in USD as high-precision Decimal
        """
        await self._rate_limit_wait('jupiter')
        
        url = f"{settings.jupiter_api_url}/price"
        params = {'ids': mint}
        
        try:
            logger.debug("Fetching Jupiter current price", mint=mint)
            
            response = await self.client.get(url, params=params)
            
            if response.status_code == 429:
                raise RateLimitError("Jupiter rate limit exceeded")
            elif response.status_code >= 400:
                raise TransientError(f"Jupiter API error: {response.status_code}")
            
            data = response.json()
            
            if 'data' in data and mint in data['data']:
                price_info = data['data'][mint]
                if 'price' in price_info:
                    price = Decimal(str(price_info['price']))
                    logger.debug("Retrieved Jupiter price", mint=mint, price_usd=str(price))
                    return price
            
            logger.warning("No price data in Jupiter response", mint=mint)
            return None
            
        except httpx.RequestError as e:
            raise TransientError(f"Jupiter request failed: {str(e)}")
        except Exception as e:
            logger.error(
                "Jupiter price fetch error",
                mint=mint,
                error=str(e),
                error_type=type(e).__name__
            )
            return None
    
    async def get_historical_price(
        self, 
        mint: str, 
        timestamp: datetime,
        symbol: Optional[str] = None
    ) -> Optional[PricePoint]:
        """
        Get historical price for a token at specific timestamp
        
        Args:
            mint: Token mint address
            timestamp: Target timestamp for price
            symbol: Token symbol (auto-detected if not provided)
            
        Returns:
            PricePoint with high-precision price data
        """
        # Check cache first
        cache_key = self._get_cache_key(mint, timestamp)
        if cache_key in self.price_cache:
            cached_price = self.price_cache[cache_key]
            if self._is_cache_valid(cached_price):
                logger.debug("Price cache hit", mint=mint, timestamp=timestamp.isoformat())
                return cached_price
        
        # Determine symbol if not provided
        if not symbol:
            symbol = None
            for token_symbol, token_mint in self.supported_tokens.items():
                if token_mint == mint:
                    symbol = token_symbol
                    break
            
            if not symbol:
                logger.warning("Unknown token mint", mint=mint)
                return None
        
        logger.info(
            "Fetching historical price",
            mint=mint,
            symbol=symbol,
            timestamp=timestamp.isoformat()
        )
        
        price_point = None
        
        # Special case for stablecoins
        if symbol.upper() in ['USDC', 'USDT']:
            price_point = PricePoint(
                timestamp=timestamp,
                mint=mint,
                symbol=symbol,
                price_usd=Decimal('1.0'),
                source='stablecoin',
                confidence=0.99
            )
            logger.debug("Using stablecoin price", symbol=symbol)
        
        else:
            # Try CoinGecko for historical data (primary source)
            try:
                coingecko_price = await self.retry_session.execute_with_retry(
                    self._fetch_coingecko_price,
                    symbol,
                    timestamp
                )
                
                if coingecko_price is not None:
                    price_point = PricePoint(
                        timestamp=timestamp,
                        mint=mint,
                        symbol=symbol,
                        price_usd=coingecko_price,
                        source='coingecko',
                        confidence=0.95
                    )
                    logger.info(
                        "Retrieved historical price from CoinGecko",
                        symbol=symbol,
                        price_usd=str(coingecko_price),
                        timestamp=timestamp.isoformat()
                    )
                
            except Exception as e:
                logger.warning(
                    "CoinGecko historical price failed",
                    symbol=symbol,
                    error=str(e)
                )
            
            # Fallback to Jupiter for recent data (last 24 hours)
            if price_point is None:
                time_diff = datetime.now(timezone.utc) - timestamp
                if time_diff.total_seconds() < 86400:  # 24 hours
                    try:
                        jupiter_price = await self.retry_session.execute_with_retry(
                            self._fetch_jupiter_current_price,
                            mint
                        )
                        
                        if jupiter_price is not None:
                            price_point = PricePoint(
                                timestamp=timestamp,
                                mint=mint,
                                symbol=symbol,
                                price_usd=jupiter_price,
                                source='jupiter',
                                confidence=0.90  # Lower confidence for current vs historical
                            )
                            logger.info(
                                "Retrieved recent price from Jupiter",
                                symbol=symbol,
                                price_usd=str(jupiter_price),
                                timestamp=timestamp.isoformat()
                            )
                            
                    except Exception as e:
                        logger.warning(
                            "Jupiter current price failed",
                            mint=mint,
                            error=str(e)
                        )
        
        # Cache the result if we got one
        if price_point:
            self.price_cache[cache_key] = price_point
            
            # Clean old cache entries periodically
            if len(self.price_cache) > 1000:
                await self._clean_price_cache()
        else:
            logger.error(
                "Failed to retrieve historical price",
                mint=mint,
                symbol=symbol,
                timestamp=timestamp.isoformat()
            )
        
        return price_point
    
    async def get_multiple_historical_prices(
        self,
        price_requests: List[Tuple[str, datetime, Optional[str]]]  # (mint, timestamp, symbol)
    ) -> Dict[str, Optional[PricePoint]]:
        """
        Get historical prices for multiple tokens efficiently
        
        Args:
            price_requests: List of (mint, timestamp, symbol) tuples
            
        Returns:
            Dict mapping cache_key to PricePoint
        """
        logger.info(
            "Fetching multiple historical prices",
            request_count=len(price_requests)
        )
        
        results = {}
        
        # Process requests with controlled concurrency
        semaphore = asyncio.Semaphore(5)  # Max 5 concurrent requests
        
        async def fetch_single_price(mint: str, timestamp: datetime, symbol: Optional[str]):
            async with semaphore:
                cache_key = self._get_cache_key(mint, timestamp)
                try:
                    price_point = await self.get_historical_price(mint, timestamp, symbol)
                    return cache_key, price_point
                except Exception as e:
                    logger.error(
                        "Failed to fetch price in batch",
                        mint=mint,
                        timestamp=timestamp.isoformat(),
                        error=str(e)
                    )
                    return cache_key, None
        
        # Execute all requests
        tasks = [
            fetch_single_price(mint, timestamp, symbol)
            for mint, timestamp, symbol in price_requests
        ]
        
        batch_results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Process results
        for result in batch_results:
            if isinstance(result, Exception):
                logger.error("Batch price request exception", error=str(result))
                continue
            
            cache_key, price_point = result
            results[cache_key] = price_point
        
        success_count = sum(1 for p in results.values() if p is not None)
        
        logger.info(
            "Completed batch price fetching",
            requested=len(price_requests),
            successful=success_count,
            success_rate=f"{success_count/len(price_requests):.2%}" if price_requests else "0%"
        )
        
        return results
    
    async def _clean_price_cache(self):
        """Clean expired entries from price cache"""
        current_time = datetime.now(timezone.utc)
        expired_keys = []
        
        for cache_key, price_point in self.price_cache.items():
            if not self._is_cache_valid(price_point):
                expired_keys.append(cache_key)
        
        for key in expired_keys:
            del self.price_cache[key]
        
        logger.debug(
            "Cleaned price cache",
            removed_entries=len(expired_keys),
            remaining_entries=len(self.price_cache)
        )
    
    async def get_price_statistics(self) -> Dict[str, any]:
        """Get statistics about price feed usage"""
        valid_cache_entries = sum(
            1 for price in self.price_cache.values() 
            if self._is_cache_valid(price)
        )
        
        return {
            "total_cache_entries": len(self.price_cache),
            "valid_cache_entries": valid_cache_entries,
            "cache_hit_rate": "calculated_per_request",
            "supported_tokens": list(self.supported_tokens.keys()),
            "rate_limits": self.rate_limits,
            "last_request_times": self.last_request_times
        }


# Global price feed instance
_price_feed_instance: Optional[HistoricalPriceFeed] = None


async def get_price_feed() -> HistoricalPriceFeed:
    """Get global price feed instance"""
    global _price_feed_instance
    
    if _price_feed_instance is None:
        _price_feed_instance = HistoricalPriceFeed()
    
    return _price_feed_instance


async def close_price_feed():
    """Close global price feed instance"""
    global _price_feed_instance
    
    if _price_feed_instance:
        await _price_feed_instance.close()
        _price_feed_instance = None