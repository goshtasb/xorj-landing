"""
Integration with XORJ Quantitative Engine.

This module handles secure communication with the Quantitative Engine
to retrieve ranked trader intelligence and trust scores.

Security Features:
- API key authentication
- Request timeout and retry logic
- Input validation and sanitization
- Comprehensive error handling and logging
"""

import asyncio
import json
import time
from typing import List, Dict, Any, Optional
from dataclasses import dataclass
from decimal import Decimal

import httpx
import structlog
from app.core.config import get_config
from app.models.trader_intelligence import RankedTrader, TrustScoreData


logger = structlog.get_logger(__name__)


@dataclass
class QuantitativeEngineResponse:
    """Response from XORJ Quantitative Engine"""
    success: bool
    data: Optional[List[RankedTrader]]
    error_message: Optional[str] = None
    response_time_ms: Optional[int] = None
    timestamp: Optional[str] = None


class QuantitativeEngineClient:
    """
    Secure client for communicating with XORJ Quantitative Engine.
    
    Features:
    - Stateless operation (no persistent connections)
    - Comprehensive error handling
    - Request/response validation
    - Audit logging of all interactions
    """
    
    def __init__(self):
        self.config = get_config()
        self.base_url = self.config.quantitative_engine_base_url.rstrip('/')
        self.api_key = self.config.quantitative_engine_api_key
        self.timeout = httpx.Timeout(30.0)  # 30 second timeout
        
        # Validate configuration
        self._validate_config()
    
    def _validate_config(self) -> None:
        """Validate required configuration for Quantitative Engine integration."""
        if not self.base_url:
            raise ValueError("Quantitative Engine base URL is required")
        
        if self.config.is_production() and not self.api_key:
            raise ValueError("API key is required for production environment")
    
    async def get_ranked_traders(
        self, 
        max_retries: int = 3,
        retry_delay: float = 1.0
    ) -> QuantitativeEngineResponse:
        """
        Retrieve ranked traders list from XORJ Quantitative Engine.
        
        This is Input 1 as specified in the System Architecture:
        Poll GET /internal/ranked-traders endpoint to receive latest
        top traders and their XORJTrustScore.
        
        Args:
            max_retries: Maximum number of retry attempts
            retry_delay: Delay between retries in seconds
            
        Returns:
            QuantitativeEngineResponse with trader data or error information
        """
        start_time = time.time()
        endpoint = f"{self.base_url}{self.config.ranked_traders_endpoint}"
        
        logger.info(
            "Requesting ranked traders from Quantitative Engine",
            endpoint=endpoint,
            max_retries=max_retries
        )
        
        headers = {
            "Content-Type": "application/json",
            "User-Agent": f"{self.config.service_name}/1.0.0"
        }
        
        # Add API key authentication if configured
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        
        last_exception = None
        
        for attempt in range(max_retries + 1):
            try:
                async with httpx.AsyncClient(timeout=self.timeout) as client:
                    response = await client.get(endpoint, headers=headers)
                    
                    response_time_ms = int((time.time() - start_time) * 1000)
                    
                    # Log request for audit trail
                    logger.info(
                        "Quantitative Engine request completed",
                        status_code=response.status_code,
                        response_time_ms=response_time_ms,
                        attempt=attempt + 1
                    )
                    
                    if response.status_code == 200:
                        return await self._process_successful_response(
                            response, response_time_ms
                        )
                    else:
                        return self._process_error_response(
                            response, response_time_ms
                        )
                        
            except Exception as e:
                last_exception = e
                logger.warning(
                    "Quantitative Engine request failed",
                    attempt=attempt + 1,
                    max_retries=max_retries,
                    error=str(e),
                    error_type=type(e).__name__
                )
                
                if attempt < max_retries:
                    await asyncio.sleep(retry_delay * (2 ** attempt))  # Exponential backoff
        
        # All retries exhausted
        error_msg = f"Failed to connect to Quantitative Engine after {max_retries + 1} attempts"
        if last_exception:
            error_msg += f": {str(last_exception)}"
        
        logger.error(
            "Quantitative Engine integration failed",
            error=error_msg,
            last_exception=str(last_exception) if last_exception else None
        )
        
        return QuantitativeEngineResponse(
            success=False,
            data=None,
            error_message=error_msg,
            response_time_ms=int((time.time() - start_time) * 1000)
        )
    
    async def _process_successful_response(
        self, 
        response: httpx.Response, 
        response_time_ms: int
    ) -> QuantitativeEngineResponse:
        """Process successful response from Quantitative Engine."""
        try:
            response_data = response.json()
            
            # Validate response structure
            if not isinstance(response_data, dict):
                raise ValueError("Invalid response format: expected dictionary")
            
            if "ranked_traders" not in response_data:
                raise ValueError("Invalid response format: missing 'ranked_traders' field")
            
            ranked_traders_data = response_data["ranked_traders"]
            if not isinstance(ranked_traders_data, list):
                raise ValueError("Invalid response format: 'ranked_traders' must be a list")
            
            # Parse and validate trader data
            ranked_traders = []
            for trader_data in ranked_traders_data:
                try:
                    ranked_trader = RankedTrader.from_dict(trader_data)
                    ranked_traders.append(ranked_trader)
                except Exception as e:
                    logger.warning(
                        "Invalid trader data received",
                        trader_data=trader_data,
                        error=str(e)
                    )
                    # Continue processing other traders
            
            logger.info(
                "Successfully retrieved ranked traders",
                trader_count=len(ranked_traders),
                response_time_ms=response_time_ms
            )
            
            return QuantitativeEngineResponse(
                success=True,
                data=ranked_traders,
                response_time_ms=response_time_ms,
                timestamp=response_data.get("timestamp")
            )
            
        except Exception as e:
            error_msg = f"Failed to parse Quantitative Engine response: {str(e)}"
            logger.error(
                "Quantitative Engine response parsing failed",
                error=error_msg,
                response_text=response.text[:500] if hasattr(response, 'text') else None
            )
            
            return QuantitativeEngineResponse(
                success=False,
                data=None,
                error_message=error_msg,
                response_time_ms=response_time_ms
            )
    
    def _process_error_response(
        self, 
        response: httpx.Response, 
        response_time_ms: int
    ) -> QuantitativeEngineResponse:
        """Process error response from Quantitative Engine."""
        try:
            error_data = response.json() if response.text else {}
            error_message = error_data.get("detail", f"HTTP {response.status_code}")
        except:
            error_message = f"HTTP {response.status_code}"
        
        logger.error(
            "Quantitative Engine returned error",
            status_code=response.status_code,
            error_message=error_message,
            response_time_ms=response_time_ms
        )
        
        return QuantitativeEngineResponse(
            success=False,
            data=None,
            error_message=f"Quantitative Engine error: {error_message}",
            response_time_ms=response_time_ms
        )
    
    async def health_check(self) -> bool:
        """
        Perform health check on Quantitative Engine connection.
        
        Returns:
            bool: True if Quantitative Engine is accessible
        """
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(10.0)) as client:
                health_endpoint = f"{self.base_url}/health"
                response = await client.get(health_endpoint)
                
                is_healthy = response.status_code == 200
                logger.info(
                    "Quantitative Engine health check",
                    healthy=is_healthy,
                    status_code=response.status_code
                )
                return is_healthy
                
        except Exception as e:
            logger.warning(
                "Quantitative Engine health check failed",
                error=str(e)
            )
            return False