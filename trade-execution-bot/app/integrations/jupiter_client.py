import asyncio
import json
from typing import Optional, Dict, Any
from decimal import Decimal

import httpx
import structlog

from app.core.config import get_config

logger = structlog.get_logger(__name__)

class JupiterClient:
    def __init__(self):
        self.config = get_config()
        self.base_url = "https://quote-api.jup.ag/v6"
        self.client = httpx.AsyncClient(base_url=self.base_url, timeout=30)

    async def get_quote(
        self, 
        input_mint: str, 
        output_mint: str, 
        amount: int, 
        slippage_bps: int = 50
    ) -> Optional[Dict[str, Any]]:
        try:
            response = await self.client.get(
                "/quote",
                params={
                    "inputMint": input_mint,
                    "outputMint": output_mint,
                    "amount": amount,
                    "slippageBps": slippage_bps
                }
            )
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as e:
            logger.error("Failed to get quote from Jupiter API", error=str(e), response=e.response.text)
            return None
        except Exception as e:
            logger.error("Error getting quote from Jupiter API", error=str(e))
            return None

    async def get_swap_transaction(
        self, 
        user_public_key: str, 
        quote_response: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        try:
            response = await self.client.post(
                "/swap",
                json={
                    "userPublicKey": user_public_key,
                    "quoteResponse": quote_response,
                    "wrapAndUnwrapSol": True,
                }
            )
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as e:
            logger.error("Failed to get swap transaction from Jupiter API", error=str(e), response=e.response.text)
            return None
        except Exception as e:
            logger.error("Error getting swap transaction from Jupiter API", error=str(e))
            return None

jupiter_client: Optional[JupiterClient] = None

def get_jupiter_client() -> JupiterClient:
    global jupiter_client
    if jupiter_client is None:
        jupiter_client = JupiterClient()
    return jupiter_client
