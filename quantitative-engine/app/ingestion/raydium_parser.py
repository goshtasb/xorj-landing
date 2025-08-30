"""
XORJ Quantitative Engine - Raydium Transaction Parser
Parse Raydium AMM swap transactions from Solana transaction data
"""

from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional, Set, Tuple
import json
import base64

from ..core.config import get_settings, get_supported_token_mints
from ..core.logging import get_ingestion_logger
from ..schemas.ingestion import RaydiumSwap, TokenBalance, SwapType, TransactionStatus

settings = get_settings()
logger = get_ingestion_logger()


class RaydiumTransactionParser:
    """Parser for Raydium AMM swap transactions"""
    
    def __init__(self):
        self.supported_tokens = get_supported_token_mints()
        self.raydium_program_id = settings.raydium_program_id
        
        # Token symbol reverse mapping
        self.mint_to_symbol = {mint: symbol for symbol, mint in self.supported_tokens.items()}
        
        # Common instruction types we look for
        self.swap_instruction_types = {
            "swapBaseIn",
            "swapBaseOut", 
            "swap"
        }
        
        logger.info(
            "Initialized Raydium parser",
            supported_tokens=list(self.supported_tokens.keys()),
            raydium_program_id=self.raydium_program_id
        )
    
    def is_raydium_transaction(self, transaction: Dict[str, Any]) -> bool:
        """
        Check if transaction involves Raydium program
        
        Args:
            transaction: Parsed transaction data from Solana RPC
            
        Returns:
            True if transaction involves Raydium program
        """
        if not transaction or 'transaction' not in transaction:
            return False
        
        tx_data = transaction['transaction']
        if 'message' not in tx_data:
            return False
        
        message = tx_data['message']
        
        # Check account keys for Raydium program
        if 'accountKeys' in message:
            for account in message['accountKeys']:
                if isinstance(account, dict) and account.get('pubkey') == self.raydium_program_id:
                    return True
                elif isinstance(account, str) and account == self.raydium_program_id:
                    return True
        
        # Check instructions for Raydium program
        if 'instructions' in message:
            for instruction in message['instructions']:
                if instruction.get('programId') == self.raydium_program_id:
                    return True
        
        return False
    
    def extract_token_balances(self, transaction: Dict[str, Any]) -> Dict[str, Dict[str, Decimal]]:
        """
        Extract token balance changes from transaction
        
        Args:
            transaction: Parsed transaction data
            
        Returns:
            Dict mapping account addresses to token balance changes
        """
        balance_changes = {}
        
        if not transaction or 'meta' not in transaction:
            return balance_changes
        
        meta = transaction['meta']
        
        # Extract from preTokenBalances and postTokenBalances
        pre_balances = meta.get('preTokenBalances', [])
        post_balances = meta.get('postTokenBalances', [])
        
        # Create lookup for pre-balances
        pre_lookup = {}
        for balance in pre_balances:
            account = balance.get('owner')
            mint = balance.get('mint')
            amount = balance.get('uiTokenAmount', {}).get('uiAmount', 0)
            
            if account and mint:
                if account not in pre_lookup:
                    pre_lookup[account] = {}
                pre_lookup[account][mint] = Decimal(str(amount or 0))
        
        # Calculate changes using post-balances
        for balance in post_balances:
            account = balance.get('owner')
            mint = balance.get('mint')
            post_amount = balance.get('uiTokenAmount', {}).get('uiAmount', 0)
            decimals = balance.get('uiTokenAmount', {}).get('decimals', 0)
            
            if not account or not mint:
                continue
            
            post_amount = Decimal(str(post_amount or 0))
            pre_amount = pre_lookup.get(account, {}).get(mint, Decimal('0'))
            
            change = post_amount - pre_amount
            
            if change != 0:
                if account not in balance_changes:
                    balance_changes[account] = {}
                
                balance_changes[account][mint] = {
                    'amount': change,
                    'decimals': decimals,
                    'pre_balance': pre_amount,
                    'post_balance': post_amount
                }
        
        return balance_changes
    
    def identify_swap_type(self, transaction: Dict[str, Any]) -> SwapType:
        """
        Identify the type of swap from transaction instructions
        
        Args:
            transaction: Parsed transaction data
            
        Returns:
            SwapType enum value
        """
        if not transaction or 'transaction' not in transaction:
            return SwapType.UNKNOWN
        
        tx_data = transaction['transaction']
        message = tx_data.get('message', {})
        instructions = message.get('instructions', [])
        
        for instruction in instructions:
            if instruction.get('programId') != self.raydium_program_id:
                continue
            
            # Try to extract instruction type from parsed data
            if 'parsed' in instruction:
                parsed = instruction['parsed']
                if isinstance(parsed, dict):
                    instruction_type = parsed.get('type', '').lower()
                    if 'swapbasein' in instruction_type:
                        return SwapType.SWAP_BASE_IN
                    elif 'swapbaseout' in instruction_type:
                        return SwapType.SWAP_BASE_OUT
                    elif 'swap' in instruction_type:
                        return SwapType.SWAP
            
            # Try to identify from instruction data
            if 'data' in instruction:
                # This would require decoding the instruction data
                # For now, we'll default to generic swap
                return SwapType.SWAP
        
        return SwapType.UNKNOWN
    
    def extract_pool_info(self, transaction: Dict[str, Any]) -> Tuple[Optional[str], Optional[str]]:
        """
        Extract pool ID and program ID from transaction
        
        Args:
            transaction: Parsed transaction data
            
        Returns:
            Tuple of (pool_id, program_id)
        """
        pool_id = None
        program_id = self.raydium_program_id
        
        if not transaction or 'transaction' not in transaction:
            return pool_id, program_id
        
        tx_data = transaction['transaction']
        message = tx_data.get('message', {})
        
        # Look for pool-related accounts in instructions
        instructions = message.get('instructions', [])
        for instruction in instructions:
            if instruction.get('programId') == self.raydium_program_id:
                # The first account after program ID is often the pool
                accounts = instruction.get('accounts', [])
                if accounts:
                    # Heuristic: pool ID is often the first or second account
                    pool_id = accounts[0] if accounts else None
                break
        
        return pool_id, program_id
    
    def parse_raydium_swap(
        self, 
        transaction: Dict[str, Any], 
        signature: str,
        wallet_address: str
    ) -> Optional[RaydiumSwap]:
        """
        Parse a Raydium swap transaction into structured data
        
        Args:
            transaction: Raw transaction data from Solana RPC
            signature: Transaction signature
            wallet_address: Wallet address that performed the swap
            
        Returns:
            RaydiumSwap object or None if parsing fails
        """
        try:
            # Basic validation
            if not transaction or not self.is_raydium_transaction(transaction):
                return None
            
            # Extract basic transaction info
            block_time = transaction.get('blockTime')
            if not block_time:
                logger.warning("Transaction missing block time", signature=signature)
                return None
            
            block_time_dt = datetime.fromtimestamp(block_time, timezone.utc)
            slot = transaction.get('slot', 0)
            
            # Determine transaction status
            meta = transaction.get('meta', {})
            err = meta.get('err')
            status = TransactionStatus.FAILED if err else TransactionStatus.SUCCESS
            
            # Extract token balance changes
            balance_changes = self.extract_token_balances(transaction)
            
            if wallet_address not in balance_changes:
                logger.warning(
                    "No balance changes for wallet",
                    signature=signature,
                    wallet=wallet_address
                )
                return None
            
            wallet_changes = balance_changes[wallet_address]
            
            # Need at least 2 token changes for a swap
            if len(wallet_changes) < 2:
                logger.warning(
                    "Insufficient token changes for swap",
                    signature=signature,
                    changes=len(wallet_changes)
                )
                return None
            
            # Identify input and output tokens
            token_in = None
            token_out = None
            
            for mint, change_info in wallet_changes.items():
                amount = change_info['amount']
                decimals = change_info['decimals']
                
                # Skip if not supported token
                if mint not in self.mint_to_symbol:
                    continue
                
                symbol = self.mint_to_symbol[mint]
                
                if amount < 0:  # Token decreased = input token
                    token_in = TokenBalance(
                        mint=mint,
                        symbol=symbol,
                        decimals=decimals,
                        amount=abs(amount)  # Store as positive amount
                    )
                elif amount > 0:  # Token increased = output token
                    token_out = TokenBalance(
                        mint=mint,
                        symbol=symbol,
                        decimals=decimals,
                        amount=amount
                    )
            
            if not token_in or not token_out:
                logger.warning(
                    "Could not identify input/output tokens",
                    signature=signature,
                    wallet=wallet_address,
                    changes=list(wallet_changes.keys())
                )
                return None
            
            # Extract additional info
            swap_type = self.identify_swap_type(transaction)
            pool_id, program_id = self.extract_pool_info(transaction)
            
            if not pool_id:
                logger.warning("Could not identify pool ID", signature=signature)
                # Use a placeholder or derive from other data
                pool_id = "unknown_pool"
            
            # Extract transaction fee
            fee_lamports = meta.get('fee', 0)
            
            # Create the swap object
            raydium_swap = RaydiumSwap(
                signature=signature,
                block_time=block_time_dt,
                slot=slot,
                wallet_address=wallet_address,
                status=status,
                swap_type=swap_type,
                token_in=token_in,
                token_out=token_out,
                pool_id=pool_id,
                program_id=program_id,
                fee_lamports=fee_lamports
            )
            
            logger.debug(
                "Successfully parsed Raydium swap",
                signature=signature,
                wallet=wallet_address,
                token_in=token_in.symbol,
                token_out=token_out.symbol,
                swap_type=swap_type.value
            )
            
            return raydium_swap
            
        except Exception as e:
            logger.error(
                "Failed to parse Raydium swap",
                signature=signature,
                wallet=wallet_address,
                error=str(e),
                error_type=type(e).__name__
            )
            return None
    
    def parse_multiple_swaps(
        self, 
        transactions: List[Tuple[Dict[str, Any], str, str]]
    ) -> List[RaydiumSwap]:
        """
        Parse multiple transactions in batch
        
        Args:
            transactions: List of (transaction_data, signature, wallet_address) tuples
            
        Returns:
            List of successfully parsed RaydiumSwap objects
        """
        parsed_swaps = []
        
        logger.info(
            "Parsing multiple Raydium transactions",
            count=len(transactions)
        )
        
        for transaction_data, signature, wallet_address in transactions:
            try:
                swap = self.parse_raydium_swap(transaction_data, signature, wallet_address)
                if swap:
                    parsed_swaps.append(swap)
            except Exception as e:
                logger.error(
                    "Error parsing transaction in batch",
                    signature=signature,
                    error=str(e)
                )
                continue
        
        success_rate = len(parsed_swaps) / len(transactions) if transactions else 0
        
        logger.info(
            "Completed batch parsing",
            total_transactions=len(transactions),
            successful_parses=len(parsed_swaps),
            success_rate=f"{success_rate:.2%}"
        )
        
        return parsed_swaps
    
    def validate_swap_data(self, swap: RaydiumSwap) -> List[str]:
        """
        Validate parsed swap data for consistency
        
        Args:
            swap: Parsed swap data
            
        Returns:
            List of validation errors (empty if valid)
        """
        errors = []
        
        # Check token support
        if swap.token_in.mint not in self.supported_tokens.values():
            errors.append(f"Unsupported input token: {swap.token_in.mint}")
        
        if swap.token_out.mint not in self.supported_tokens.values():
            errors.append(f"Unsupported output token: {swap.token_out.mint}")
        
        # Check minimum trade value (if USD values are available)
        if swap.token_in.usd_value and swap.token_in.usd_value < settings.min_trade_value_usd:
            errors.append(f"Trade value too small: ${swap.token_in.usd_value}")
        
        # Check reasonable amounts
        if swap.token_in.amount <= 0:
            errors.append("Input amount must be positive")
        
        if swap.token_out.amount <= 0:
            errors.append("Output amount must be positive")
        
        # Check for extremely large amounts (potential data errors)
        max_reasonable_amount = Decimal('1000000000')  # 1 billion tokens
        if swap.token_in.amount > max_reasonable_amount:
            errors.append("Input amount suspiciously large")
        
        if swap.token_out.amount > max_reasonable_amount:
            errors.append("Output amount suspiciously large")
        
        return errors


# Global parser instance
_parser_instance: Optional[RaydiumTransactionParser] = None


def get_raydium_parser() -> RaydiumTransactionParser:
    """Get global Raydium parser instance"""
    global _parser_instance
    
    if _parser_instance is None:
        _parser_instance = RaydiumTransactionParser()
    
    return _parser_instance