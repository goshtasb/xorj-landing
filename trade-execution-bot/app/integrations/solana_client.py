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
            
            # Get token accounts owned by the vault - use V2 directly for mega-wallets
            known_mega_wallets = [
                "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1",  # The mega-wallet causing issues
            ]
            
            # Use V2 directly for known mega-wallets to avoid deprioritization
            if vault_address in known_mega_wallets:
                logger.info(
                    "Using V2 method directly for known mega-wallet",
                    vault_address=vault_address
                )
                try:
                    token_accounts_result = await self.resilient_client.get_token_accounts_by_owner_v2(
                        vault_address,
                        "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
                    )
                    token_accounts = token_accounts_result.get("value", []) if token_accounts_result else []
                    logger.info(
                        "Successfully retrieved token accounts using V2 for mega-wallet",
                        vault_address=vault_address,
                        account_count=len(token_accounts)
                    )
                except Exception as v2_error:
                    logger.error(
                        "V2 method failed for known mega-wallet",
                        vault_address=vault_address,
                        v2_error=str(v2_error)
                    )
                    # Return empty portfolio rather than failing completely
                    return UserPortfolio(
                        user_id=user_id,
                        vault_address=vault_address,
                        holdings=[],
                        total_usd_value=Decimal("0.0")
                    )
            else:
                # Use standard method with V2 fallback for regular wallets
                try:
                    token_accounts_result = await self.resilient_client.get_token_accounts_by_owner(
                        vault_address,
                        "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"  # SPL Token program
                    )
                    token_accounts = token_accounts_result.get("value", []) if token_accounts_result else []
                except Exception as e:
                    if "getTokenAccountsByOwnerV2" in str(e) or "Request deprioritized" in str(e):
                        logger.warning(
                            "Mega-wallet detected, switching to getTokenAccountsByOwnerV2",
                            vault_address=vault_address,
                            error=str(e)
                        )
                        # Use V2 method for mega-wallets
                        try:
                            token_accounts_result = await self.resilient_client.get_token_accounts_by_owner_v2(
                                vault_address,
                                "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
                            )
                            token_accounts = token_accounts_result.get("value", []) if token_accounts_result else []
                            logger.info(
                                "Successfully retrieved token accounts using V2",
                                vault_address=vault_address,
                                account_count=len(token_accounts)
                            )
                        except Exception as v2_error:
                            logger.error(
                                "V2 fallback also failed for mega-wallet",
                                vault_address=vault_address,
                                v2_error=str(v2_error)
                            )
                            # Return empty portfolio rather than failing completely
                            return UserPortfolio(
                                user_id=user_id,
                                vault_address=vault_address,
                                holdings=[],
                                total_usd_value=Decimal("0.0")
                            )
                    else:
                        # Re-raise non-mega-wallet errors
                        raise e
            
            # Debug: Log the structure of the token accounts data to understand the V2 format
            logger.info(
                "Debug: Token accounts data structure",
                vault_address=vault_address[:10] + "...",
                account_count=len(token_accounts),
                first_account_type=type(token_accounts[0]).__name__ if token_accounts else "None",
                first_account_keys=list(token_accounts[0].keys()) if token_accounts and isinstance(token_accounts[0], dict) else "N/A"
            )
            
            # Get current token prices for USD valuation
            mint_addresses = []
            for i, account in enumerate(token_accounts):
                try:
                    # Debug: Log each account structure for first few accounts
                    if i < 3:
                        logger.info(
                            f"Debug: Account {i} structure",
                            account_type=type(account).__name__,
                            account_keys=list(account.keys()) if isinstance(account, dict) else "N/A",
                            account_sample=str(account)[:200] + "..." if len(str(account)) > 200 else str(account)
                        )
                    
                    # Handle different possible data structures from V1 vs V2 APIs
                    if isinstance(account, str):
                        # Skip string entries that might be returned by some API versions
                        logger.debug("Skipping string account entry in token accounts list")
                        continue
                    
                    # Try the standard V1 format first
                    if "account" in account and "data" in account["account"]:
                        mint_address = account["account"]["data"]["parsed"]["info"]["mint"]
                    else:
                        # Try alternative V2 format that might have direct access
                        mint_address = account.get("mint") or account.get("parsed", {}).get("info", {}).get("mint")
                    
                    if mint_address:
                        mint_addresses.append(mint_address)
                    else:
                        logger.warning(
                            "Could not extract mint address from account",
                            account_index=i,
                            account_keys=list(account.keys()) if isinstance(account, dict) else type(account).__name__,
                            account_preview=str(account)[:100] + "..." if len(str(account)) > 100 else str(account)
                        )
                except (KeyError, TypeError) as e:
                    logger.warning(
                        "Failed to parse token account for mint address",
                        error=str(e),
                        error_type=type(e).__name__,
                        account_index=i,
                        account_type=type(account).__name__,
                        account_preview=str(account)[:100] + "..." if len(str(account)) > 100 else str(account)
                    )
                    continue
            
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
            # Handle different possible data structures from V1 vs V2 APIs
            if isinstance(token_account_info, str):
                # Skip string entries that might be returned by some API versions
                logger.debug("Skipping string token account entry")
                return None
            
            # Try to extract mint address from different formats
            mint_address = None
            amount = None
            decimals = None
            
            # Try the standard V1 format first
            if "account" in token_account_info and "data" in token_account_info["account"]:
                try:
                    parsed_info = token_account_info["account"]["data"]["parsed"]["info"]
                    mint_address = str(parsed_info["mint"])
                    amount = int(parsed_info["tokenAmount"]["amount"])
                    decimals = int(parsed_info["tokenAmount"]["decimals"])
                except (KeyError, TypeError) as e:
                    logger.debug("V1 format extraction failed", error=str(e))
            
            # Try alternative V2 format if V1 failed
            if not mint_address:
                try:
                    # V2 might have direct access or different structure
                    if "mint" in token_account_info:
                        mint_address = str(token_account_info["mint"])
                    elif "parsed" in token_account_info:
                        parsed_info = token_account_info["parsed"]["info"]
                        mint_address = str(parsed_info["mint"])
                        amount = int(parsed_info["tokenAmount"]["amount"])
                        decimals = int(parsed_info["tokenAmount"]["decimals"])
                    
                    # Try to get amount and decimals if not already extracted
                    if mint_address and (amount is None or decimals is None):
                        token_amount = token_account_info.get("tokenAmount") or token_account_info.get("parsed", {}).get("info", {}).get("tokenAmount", {})
                        if token_amount:
                            amount = int(token_amount["amount"])
                            decimals = int(token_amount["decimals"])
                        
                except (KeyError, TypeError) as e:
                    logger.debug("V2 format extraction failed", error=str(e))
            
            # Final validation
            if not mint_address or amount is None or decimals is None:
                logger.warning(
                    "Could not extract required token account data",
                    account_keys=list(token_account_info.keys()) if isinstance(token_account_info, dict) else type(token_account_info).__name__,
                    user_id=user_id
                )
                return None
            
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
            logger.warning(
                "Failed to process token account",
                error=str(e),
                error_type=type(e).__name__,
                user_id=user_id
            )
            return None

    async def _get_token_metadata(self, mint_address: str) -> Optional[TokenMetadata]:
        if mint_address in self.token_metadata_cache:
            return self.token_metadata_cache[mint_address]
        # In a real app, fetch from an API
        return None

    async def _get_token_prices(self, mint_addresses: List[str]) -> Dict[str, Decimal]:
        """
        Get token prices with batched processing for mega-wallets.
        Handles wallets with 1M+ tokens by chunking requests to avoid URL length limits.
        """
        if not mint_addresses:
            return {}
        
        # Filter out duplicate mint addresses and prioritize important tokens
        unique_mints = list(set(mint_addresses))
        logger.info(f"Getting prices for {len(unique_mints)} unique tokens (from {len(mint_addresses)} total)")
        
        # If we have too many tokens, prioritize by common/important tokens first
        if len(unique_mints) > 500:
            logger.warning(f"Large token count detected: {len(unique_mints)} tokens - implementing smart batching")
            unique_mints = await self._prioritize_tokens_for_pricing(unique_mints)
        
        # Batch size based on URL length limits (Jupiter API has ~8000 char URL limit)
        batch_size = 100  # Conservative batch size to avoid URL length issues
        all_prices = {}
        
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(30.0)) as client:
                # Process tokens in batches
                for i in range(0, len(unique_mints), batch_size):
                    batch = unique_mints[i:i + batch_size]
                    batch_num = (i // batch_size) + 1
                    total_batches = (len(unique_mints) + batch_size - 1) // batch_size
                    
                    logger.info(f"Processing price batch {batch_num}/{total_batches} ({len(batch)} tokens)")
                    
                    try:
                        # Build URL with proper parameter formatting
                        ids_param = "&".join([f"ids={mint}" for mint in batch])
                        url = f"https://quote-api.jup.ag/v6/price?{ids_param}"
                        
                        # Check URL length before making request
                        if len(url) > 7000:  # Conservative limit
                            logger.warning(f"URL length {len(url)} approaching limit, reducing batch size")
                            # Split this batch in half
                            mid = len(batch) // 2
                            batch1 = batch[:mid]
                            batch2 = batch[mid:]
                            
                            # Process first half
                            if batch1:
                                ids_param1 = "&".join([f"ids={mint}" for mint in batch1])
                                url1 = f"https://quote-api.jup.ag/v6/price?{ids_param1}"
                                response1 = await client.get(url1)
                                response1.raise_for_status()
                                data1 = response1.json().get('data', {})
                                for mint in data1:
                                    all_prices[mint] = Decimal(str(data1[mint]['price']))
                                    
                            # Process second half
                            if batch2:
                                ids_param2 = "&".join([f"ids={mint}" for mint in batch2])
                                url2 = f"https://quote-api.jup.ag/v6/price?{ids_param2}"
                                response2 = await client.get(url2)
                                response2.raise_for_status()
                                data2 = response2.json().get('data', {})
                                for mint in data2:
                                    all_prices[mint] = Decimal(str(data2[mint]['price']))
                        else:
                            # Normal processing
                            response = await client.get(url)
                            response.raise_for_status()
                            data = response.json().get('data', {})
                            
                            # Add prices to our collection
                            for mint in data:
                                all_prices[mint] = Decimal(str(data[mint]['price']))
                        
                        # Add small delay between batches to be respectful to Jupiter API
                        if i + batch_size < len(unique_mints):
                            await asyncio.sleep(0.1)
                            
                    except httpx.HTTPStatusError as e:
                        if e.response.status_code == 414:  # URL too long
                            logger.error(f"URL too long error in batch {batch_num}, skipping batch")
                            continue
                        elif e.response.status_code == 429:  # Rate limited
                            logger.warning(f"Rate limited on batch {batch_num}, waiting 2 seconds")
                            await asyncio.sleep(2)
                            continue
                        else:
                            logger.error(f"HTTP error in batch {batch_num}: {e}")
                            continue
                    except Exception as e:
                        logger.error(f"Error processing price batch {batch_num}: {e}")
                        continue
                
                logger.info(f"Successfully retrieved prices for {len(all_prices)} tokens out of {len(unique_mints)} requested")
                return all_prices
                
        except Exception as e:
            logger.error("Failed to get token prices from Jupiter API", error=str(e))
            return {}
    
    async def _prioritize_tokens_for_pricing(self, mint_addresses: List[str]) -> List[str]:
        """
        Prioritize tokens for pricing when dealing with mega-wallets.
        Returns the most important tokens first to ensure we get prices for valuable holdings.
        """
        # Known high-value/common tokens that should be prioritized
        priority_tokens = {
            "So11111111111111111111111111111111111111112",  # SOL
            "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",  # USDC
            "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",  # USDT
            "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",  # JUP
            "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So",   # mSOL
            "7dHbWXmci3dT8UFYWYZweBLXgycu7Y3iL6trKn1Y7ARj",  # stSOL
            "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",  # bonk
            "A1KLoBrKBde8Ty9qtNQUtq3C2ortoC3u7twggz7sEto6"   # dogwifcoin
        }
        
        # Separate priority tokens from others
        priority_mints = [mint for mint in mint_addresses if mint in priority_tokens]
        other_mints = [mint for mint in mint_addresses if mint not in priority_tokens]
        
        # Limit total tokens to process (most important 1000 tokens max for performance)
        max_tokens = 1000
        
        # Take all priority tokens + remaining capacity from others
        remaining_capacity = max_tokens - len(priority_mints)
        if remaining_capacity > 0:
            selected_other_mints = other_mints[:remaining_capacity]
        else:
            selected_other_mints = []
            # If we have too many priority tokens, take the first max_tokens
            priority_mints = priority_mints[:max_tokens]
        
        result = priority_mints + selected_other_mints
        
        logger.info(
            f"Prioritized {len(result)} tokens from {len(mint_addresses)} total "
            f"({len(priority_mints)} priority, {len(selected_other_mints)} others)"
        )
        
        return result

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
