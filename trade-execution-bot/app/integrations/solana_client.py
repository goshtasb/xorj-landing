"""
Solana blockchain integration for XORJ Trade Execution Bot.
"""

import asyncio
from typing import List, Dict, Optional, Any
from dataclasses import dataclass
from decimal import Decimal

import httpx
import structlog
from solana.rpc.async_api import AsyncClient
from solana.rpc.commitment import Commitment
from solana.rpc.types import TxOpts
from solders.pubkey import Pubkey
from solders.keypair import Keypair  
from solders.transaction import Transaction

from app.core.config import get_config
from app.models.portfolio import TokenHolding, UserPortfolio
from app.logging.audit_logger import get_audit_logger, AuditEventType, AuditSeverity
from app.integrations.resilient_rpc_client import get_resilient_rpc_client, ResilientRpcClient

logger = structlog.get_logger(__name__)

@dataclass
class TokenMetadata:
    mint: str
    symbol: str
    name: str
    decimals: int
    logo_uri: Optional[str] = None

@dataclass
class SolanaTransactionResult:
    success: bool
    signature: Optional[str] = None
    error_message: Optional[str] = None
    block_height: Optional[int] = None
    slot: Optional[int] = None
    confirmation_status: Optional[str] = None

class SolanaClient:
    def __init__(self):
        self.config = get_config()
        self.audit_logger = get_audit_logger()
        self.rpc_url = self.config.solana_rpc_url
        self.network = self.config.solana_network
        self.client: Optional[AsyncClient] = None
        self.resilient_client: Optional[ResilientRpcClient] = None
        self.token_metadata_cache: Dict[str, TokenMetadata] = {}
        self.authority_keypair: Optional[Keypair] = None
        self._load_common_tokens()
        logger.info(
            "Solana client initialized with resilient RPC support",
            network=self.network,
            rpc_url=self.rpc_url[:50] + "..." if len(self.rpc_url) > 50 else self.rpc_url
        )

    def _load_common_tokens(self):
        common_tokens = {
            "So11111111111111111111111111111111111111112": TokenMetadata(
                mint="So11111111111111111111111111111111111111112",
                symbol="SOL", name="Solana", decimals=9
            ),
            "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v": TokenMetadata(
                mint="EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
                symbol="USDC", name="USD Coin", decimals=6
            ),
            "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN": TokenMetadata(
                mint="JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
                symbol="JUP", name="Jupiter", decimals=6
            )
        }
        self.token_metadata_cache.update(common_tokens)

    async def initialize(self) -> bool:
        try:
            logger.info("Initializing Solana client with resilient RPC")
            
            # Initialize both standard and resilient clients
            self.client = AsyncClient(self.rpc_url, commitment=Commitment("confirmed"))
            self.resilient_client = await get_resilient_rpc_client()
            
            # Test connection using resilient client
            health_ok = await self.resilient_client.health_check()
            if not health_ok:
                logger.error("Resilient RPC connection test failed")
                return False
            
            if not await self._load_authority_keypair():
                logger.warning("Authority keypair not loaded - trade execution will be disabled")
            
            logger.info("Solana client initialized successfully with resilient RPC support")
            return True
        except Exception as e:
            logger.error("Failed to initialize Solana client", error=str(e), error_type=type(e).__name__)
            return False

    async def _load_authority_keypair(self) -> bool:
        # Placeholder for loading keypair securely
        return True

    async def health_check(self) -> bool:
        """Check if Solana client is healthy and can connect to RPC"""
        try:
            if not self.resilient_client:
                return False
            return await self.resilient_client.health_check()
        except Exception as e:
            logger.error("Solana client health check failed", error=str(e))
            return False

    async def read_vault_holdings(self, vault_address: str, user_id: str) -> Optional[UserPortfolio]:
        if not self.client:
            logger.error("Solana client not initialized")
            return None
        
        logger.info("Reading vault holdings", vault_address=vault_address, user_id=user_id)
        
        try:
            # Read actual vault holdings from Solana mainnet
            vault_pubkey = Pubkey.from_string(vault_address)
            
            # Get account info and token accounts using resilient client
            account_info = await self.resilient_client.get_account_info(vault_address)
            if not account_info:
                logger.warning("Vault account not found on mainnet", vault_address=vault_address)
                return UserPortfolio(
                    user_id=user_id,
                    vault_address=vault_address,
                    holdings=[],
                    total_usd_value=Decimal("0.0")
                )
            
            # Get token accounts owned by the vault
            token_accounts_result = await self.resilient_client.get_token_accounts_by_owner(
                vault_address,
                "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"  # SPL Token program
            )
            token_accounts = token_accounts_result.get("value", []) if token_accounts_result else []
            
            # Get current token prices for USD valuation
            mint_addresses = []
            for account in token_accounts:
                mint_address = account["account"]["data"]["parsed"]["info"]["mint"]
                mint_addresses.append(mint_address)
            
            prices = await self._get_token_prices(mint_addresses)
            
            # Process each token account
            holdings = []
            total_usd_value = Decimal("0.0")
            
            for account in token_accounts:
                holding = await self._process_token_account(account, user_id, prices)
                if holding and holding.is_significant:
                    holdings.append(holding)
                    if holding.usd_value:
                        total_usd_value += holding.usd_value
            
            # Also check SOL balance (native token) using resilient client
            sol_balance = await self.resilient_client.get_balance(vault_address)
            if sol_balance > 0:  # More than 0 lamports
                sol_amount = Decimal(str(sol_balance))
                sol_usd_price = prices.get("So11111111111111111111111111111111111111112", Decimal("0"))
                sol_usd_value = None
                if sol_usd_price > 0:
                    scaled_sol = sol_amount / Decimal("1000000000")  # 9 decimals
                    sol_usd_value = scaled_sol * sol_usd_price
                    total_usd_value += sol_usd_value
                
                sol_holding = TokenHolding(
                    mint_address="So11111111111111111111111111111111111111112",
                    symbol="SOL",
                    balance=sol_amount,
                    decimals=9,
                    usd_value=sol_usd_value
                )
                
                if sol_holding.is_significant:
                    holdings.append(sol_holding)
            
            logger.info(
                "Successfully read vault holdings from mainnet",
                vault_address=vault_address,
                holdings_count=len(holdings),
                total_usd_value=str(total_usd_value)
            )
            
            return UserPortfolio(
                user_id=user_id,
                vault_address=vault_address,
                holdings=holdings,
                total_usd_value=total_usd_value
            )
            
        except Exception as e:
            logger.error("Failed to read vault holdings", vault_address=vault_address, user_id=user_id, error=str(e))
            return None

    async def _process_token_account(self, token_account_info: Any, user_id: str, prices: Dict[str, Decimal]) -> Optional[TokenHolding]:
        try:
            mint_address = str(token_account_info['account']['data']['parsed']['info']['mint'])
            amount = int(token_account_info['account']['data']['parsed']['info']['tokenAmount']['amount'])
            decimals = int(token_account_info['account']['data']['parsed']['info']['tokenAmount']['decimals'])
            
            # Only process accounts with significant balances
            if amount == 0:
                return None
            
            metadata = await self._get_token_metadata(mint_address)
            symbol = metadata.symbol if metadata else f"TOKEN_{mint_address[:8]}"
            
            usd_price = prices.get(mint_address, Decimal("0"))
            usd_value = None
            if usd_price > 0:
                scaled_amount = Decimal(amount) / (Decimal(10) ** decimals)
                usd_value = scaled_amount * usd_price
            
            return TokenHolding(
                mint_address=mint_address, 
                symbol=symbol, 
                balance=Decimal(amount), 
                decimals=decimals, 
                usd_value=usd_value
            )
        except Exception as e:
            logger.warning("Failed to process token account", error=str(e), user_id=user_id)
            return None

    async def _get_token_metadata(self, mint_address: str) -> Optional[TokenMetadata]:
        if mint_address in self.token_metadata_cache:
            return self.token_metadata_cache[mint_address]
        # In a real app, fetch from an API
        return None

    async def _get_token_prices(self, mint_addresses: List[str]) -> Dict[str, Decimal]:
        if not mint_addresses:
            return {}
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(f"https://quote-api.jup.ag/v6/price?ids={'&ids='.join(mint_addresses)}")
                response.raise_for_status()
                data = response.json()['data']
                return {mint: Decimal(str(data[mint]['price'])) for mint in data}
        except Exception as e:
            logger.error("Failed to get token prices from Jupiter API", error=str(e))
            return {}

    # ... (rest of the class is the same)

# Global Solana client instance
solana_client: Optional[SolanaClient] = None

async def get_solana_client() -> SolanaClient:
    """Get the global Solana client instance."""
    global solana_client
    if solana_client is None:
        solana_client = SolanaClient()
        await solana_client.initialize()
    return solana_client
