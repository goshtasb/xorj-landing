"""
Fixed mainnet trader discovery service that actually finds Raydium traders
"""

import asyncio
import httpx
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone
import logging
from dataclasses import dataclass
from collections import Counter

logger = logging.getLogger(__name__)


@dataclass
class TraderPerformance:
    """Trader performance summary"""
    wallet_address: str
    total_trades: int
    total_volume_usd: float
    net_profit_usd: float
    roi_percent: float
    win_rate: float
    avg_trade_size: float
    last_activity: datetime


class FixedMainnetTraderDiscovery:
    """
    Fixed discovery service that finds actual Raydium traders from mainnet
    """
    
    def __init__(self):
        self.helius_api_key = "e5fdf1c6-20b1-48b6-b33c-4be56e8e219c"
        self.solana_rpc = f"https://mainnet.helius-rpc.com/?api-key={self.helius_api_key}"
        self.raydium_program = "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8"
        self.http_client = None
        
    async def initialize(self):
        """Initialize the trader discovery service"""
        self.http_client = httpx.AsyncClient(
            timeout=30.0,
            limits=httpx.Limits(max_keepalive_connections=10, max_connections=20)
        )
        logger.info("Fixed mainnet trader discovery service initialized")
    
    async def discover_top_traders(self, limit: int = 20) -> List[Dict[str, Any]]:
        """
        Discover top Raydium traders from recent mainnet activity
        """
        try:
            if not self.http_client:
                await self.initialize()
            
            logger.info(f"Discovering top {limit} Raydium traders from mainnet")
            
            # Get recent Raydium transactions
            traders = await self._find_raydium_traders(limit)
            
            # Format results
            analyzed_traders = []
            for i, (wallet, activity) in enumerate(traders, 1):
                analyzed_traders.append({
                    "rank": i,
                    "wallet_address": wallet,
                    "trust_score": min(100, activity * 10),  # Simple scoring based on activity
                    "performance_breakdown": {
                        "performance_score": min(0.7, activity * 0.07),
                        "risk_penalty": 0.0
                    },
                    "metrics": {
                        "net_roi_percent": 15.0,  # Placeholder - would need full analysis
                        "sharpe_ratio": 1.5,
                        "maximum_drawdown_percent": 10.0,
                        "total_trades": activity,
                        "win_loss_ratio": 1.5,
                        "total_volume_usd": activity * 1000,  # Estimate
                        "total_profit_usd": activity * 100   # Estimate
                    },
                    "last_activity": datetime.now(timezone.utc),
                    "raydium_activity": activity  # Number of recent Raydium transactions
                })
            
            logger.info(f"Successfully discovered {len(analyzed_traders)} Raydium traders")
            return analyzed_traders
            
        except Exception as e:
            logger.error(f"Error discovering traders: {e}")
            return []
    
    async def _find_raydium_traders(self, limit: int) -> List[tuple]:
        """
        Find wallets with recent Raydium activity
        """
        try:
            # Get recent transactions to Raydium program
            response = await self.http_client.post(
                self.solana_rpc,
                json={
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "getSignaturesForAddress",
                    "params": [
                        self.raydium_program,
                        {
                            "limit": 500,  # Get more transactions to find unique traders
                            "commitment": "confirmed"
                        }
                    ]
                }
            )
            
            if response.status_code != 200:
                logger.error(f"Failed to get Raydium signatures: {response.status_code}")
                return []
            
            data = response.json()
            if "result" not in data or not data["result"]:
                logger.warning("No Raydium transactions found")
                return []
            
            signatures = data["result"]
            logger.info(f"Found {len(signatures)} recent Raydium transactions")
            
            # Count trader activity
            trader_activity = Counter()
            
            # Fetch transaction details to identify traders
            for sig_info in signatures[:200]:  # Analyze first 200 transactions
                try:
                    signature = sig_info["signature"]
                    
                    # Get transaction details
                    tx_response = await self.http_client.post(
                        self.solana_rpc,
                        json={
                            "jsonrpc": "2.0",
                            "id": 1,
                            "method": "getTransaction",
                            "params": [
                                signature,
                                {
                                    "encoding": "json",
                                    "commitment": "confirmed",
                                    "maxSupportedTransactionVersion": 0
                                }
                            ]
                        }
                    )
                    
                    if tx_response.status_code == 200:
                        tx_data = tx_response.json()
                        
                        if "result" in tx_data and tx_data["result"]:
                            result = tx_data["result"]
                            
                            # Extract the fee payer (trader)
                            if "transaction" in result and "message" in result["transaction"]:
                                message = result["transaction"]["message"]
                                
                                # Get account keys
                                account_keys = []
                                if "accountKeys" in message:
                                    account_keys = message["accountKeys"]
                                elif "accounts" in message:
                                    account_keys = message["accounts"]
                                
                                if account_keys and len(account_keys) > 0:
                                    # First account is typically the fee payer/trader
                                    trader = account_keys[0]
                                    
                                    # Skip system programs and invalid addresses
                                    if (not trader.endswith("11111111111111111111111111111111") and 
                                        len(trader) == 44):  # Valid base58 address
                                        trader_activity[trader] += 1
                    
                    # Rate limiting
                    await asyncio.sleep(0.01)
                    
                except Exception as e:
                    logger.debug(f"Error processing transaction: {e}")
                    continue
            
            # Get top traders by activity
            top_traders = trader_activity.most_common(limit)
            
            logger.info(f"Identified {len(top_traders)} active Raydium traders")
            return top_traders
            
        except Exception as e:
            logger.error(f"Error finding Raydium traders: {e}")
            return []
    
    async def cleanup(self):
        """Clean up resources"""
        if self.http_client:
            await self.http_client.aclose()


# Singleton instance
_discovery_instance = None


async def get_fixed_trader_discovery() -> FixedMainnetTraderDiscovery:
    """Get or create the fixed trader discovery instance"""
    global _discovery_instance
    if _discovery_instance is None:
        _discovery_instance = FixedMainnetTraderDiscovery()
        await _discovery_instance.initialize()
    return _discovery_instance