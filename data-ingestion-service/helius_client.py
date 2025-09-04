"""
Helius API Client for XORJ On-Chain Data Ingestion Service
Handles Helius API integration with rate limiting and pagination support
FR-1: Helius API Integration
FR-2: Comprehensive Pagination Handling
FR-3: Robust Rate Limit Handling
"""

import asyncio
import time
from typing import Dict, Any, List, Optional
import httpx
import structlog

logger = structlog.get_logger(__name__)

class HeliusClient:
    """
    Helius API client with rate limiting and pagination support
    """
    
    def __init__(self, api_key: str, base_url: str = "https://api.helius.xyz"):
        self.api_key = api_key
        self.base_url = base_url
        self.client = httpx.AsyncClient(timeout=30.0)
        
    async def close(self):
        """Close the HTTP client"""
        await self.client.aclose()
    
    async def get_transaction_history(self, wallet_address: str) -> List[Dict[str, Any]]:
        """
        FR-1 & FR-2: Fetch complete transaction history for a wallet with pagination
        
        Args:
            wallet_address: Solana wallet address to fetch transactions for
            
        Returns:
            List of all transactions for the wallet
        """
        # Production mainnet data fetching via Helius API
        all_transactions = []
        before = None
        total_fetched = 0
        
        logger.info("Starting complete transaction history fetch from Helius API",
                   wallet_address=wallet_address[:10] + "...")
        
        while True:
            try:
                # FR-2: Pagination handling with 'before' parameter
                batch_transactions = await self._fetch_transaction_batch(
                    wallet_address, before
                )
                
                if not batch_transactions:
                    logger.info("No more transactions found, pagination complete",
                              total_fetched=total_fetched)
                    break
                
                all_transactions.extend(batch_transactions)
                total_fetched += len(batch_transactions)
                
                # Get the last transaction's signature for next pagination call
                before = batch_transactions[-1].get('signature')
                
                logger.info("Fetched transaction batch",
                           batch_size=len(batch_transactions),
                           total_fetched=total_fetched,
                           next_before=before[:10] + "..." if before else None)
                
                # Small delay between requests to be respectful to API
                await asyncio.sleep(0.1)
                
            except Exception as e:
                logger.error("Error in transaction history pagination",
                           error=str(e),
                           total_fetched=total_fetched)
                raise
        
        logger.info("Complete transaction history fetch completed",
                   wallet_address=wallet_address[:10] + "...",
                   total_transactions=len(all_transactions))
        
        return all_transactions
    
    async def _fetch_transaction_batch(self, wallet_address: str, before: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Fetch a single batch of transactions with rate limiting
        FR-3: Robust Rate Limit Handling
        """
        url = f"{self.base_url}/v0/addresses/{wallet_address}/transactions"
        
        params = {
            "api-key": self.api_key,
            "limit": 100  # Helius typical batch size
        }
        
        if before:
            params["before"] = before
        
        # FR-3: Retry logic with exponential backoff for rate limiting
        max_retries = 5
        base_delay = 1
        
        for attempt in range(max_retries):
            try:
                logger.debug("Fetching transaction batch",
                           attempt=attempt + 1,
                           before=before[:10] + "..." if before else None)
                
                response = await self.client.get(url, params=params)
                
                # FR-3: Handle 429 Too Many Requests
                if response.status_code == 429:
                    retry_after = response.headers.get('retry-after')
                    
                    if retry_after:
                        # Respect Retry-After header if present
                        wait_time = int(retry_after)
                        logger.warning("Rate limited, respecting Retry-After header",
                                     retry_after=wait_time)
                    else:
                        # Exponential backoff if no Retry-After header
                        wait_time = base_delay * (2 ** attempt)
                        logger.warning("Rate limited, using exponential backoff",
                                     wait_time=wait_time,
                                     attempt=attempt + 1)
                    
                    await asyncio.sleep(wait_time)
                    continue
                
                # Handle other HTTP errors
                if response.status_code != 200:
                    logger.error("Helius API error",
                               status_code=response.status_code,
                               response_text=response.text)
                    response.raise_for_status()
                
                data = response.json()
                
                # Extract transactions from Helius response format
                transactions = data.get('result', []) if isinstance(data, dict) else data
                
                logger.debug("Successfully fetched transaction batch",
                           transaction_count=len(transactions))
                
                return transactions
                
            except httpx.HTTPStatusError as e:
                if e.response.status_code == 429:
                    continue  # This will be handled by the 429 logic above
                logger.error("HTTP error fetching transactions",
                           status_code=e.response.status_code,
                           error=str(e))
                raise
                
            except Exception as e:
                logger.error("Unexpected error fetching transactions",
                           attempt=attempt + 1,
                           error=str(e),
                           error_type=type(e).__name__)
                
                if attempt == max_retries - 1:
                    raise
                
                # Wait before retry for unexpected errors
                await asyncio.sleep(base_delay * (2 ** attempt))
        
        raise Exception(f"Failed to fetch transactions after {max_retries} attempts")


# Global client instance
_helius_client: Optional[HeliusClient] = None

async def get_helius_client() -> HeliusClient:
    """Get or create the global Helius client instance"""
    global _helius_client
    
    if _helius_client is None:
        # Load from environment - requires valid Helius API key for production
        import os
        api_key = os.environ.get('HELIUS_API_KEY', '')
        if not api_key:
            raise ValueError("HELIUS_API_KEY environment variable is required for production")
        
        _helius_client = HeliusClient(api_key)
        
        logger.info("Helius client initialized")
    
    return _helius_client

async def close_helius_client():
    """Close the global Helius client"""
    global _helius_client
    if _helius_client:
        await _helius_client.close()
        _helius_client = None