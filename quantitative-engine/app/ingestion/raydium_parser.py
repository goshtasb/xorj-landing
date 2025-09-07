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
        Check if transaction involves supported DEX programs (Raydium, Jupiter, Orca, Serum)
        
        Args:
            transaction: Parsed transaction data from Solana RPC
            
        Returns:
            True if transaction involves any supported DEX program
        """
        if not transaction:
            return False
        
        # Handle both dict and solders object formats
        if hasattr(transaction, 'transaction'):
            # Solders object - access attributes directly
            tx_data = transaction.transaction
        elif hasattr(transaction, '__dict__'):
            # Convert solders object to dict for consistent access
            transaction = transaction.__dict__
            if 'transaction' not in transaction:
                return False
            tx_data = transaction['transaction']
        elif isinstance(transaction, dict):
            if 'transaction' not in transaction:
                return False
            tx_data = transaction['transaction']
        else:
            return False
        
        # Handle nested solders objects in transaction data
        if hasattr(tx_data, 'message'):
            message = tx_data.message
        elif hasattr(tx_data, '__dict__') and 'message' in tx_data.__dict__:
            message = tx_data.__dict__['message']
        elif isinstance(tx_data, dict) and 'message' in tx_data:
            message = tx_data['message']
        else:
            return False
        
        # Get all supported DEX program IDs
        supported_programs = [
            self.raydium_program_id,
            "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4K",  # Jupiter
            "9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP",  # Orca
            "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin",  # Serum
        ]
        
        # Handle message attributes vs dict access
        if hasattr(message, 'account_keys'):
            account_keys = message.account_keys
        elif hasattr(message, '__dict__') and 'accountKeys' in message.__dict__:
            account_keys = message.__dict__['accountKeys']
        elif isinstance(message, dict) and 'accountKeys' in message:
            account_keys = message['accountKeys']
        else:
            account_keys = []
        
        # Check account keys for any supported DEX program
        for account in account_keys:
            if hasattr(account, 'pubkey'):
                pubkey = str(account.pubkey)
                if pubkey in supported_programs:
                    return True
            elif isinstance(account, dict):
                pubkey = account.get('pubkey')
                if pubkey in supported_programs:
                    return True
            elif isinstance(account, str) and account in supported_programs:
                return True
        
        # Handle instructions attributes vs dict access
        if hasattr(message, 'instructions'):
            instructions = message.instructions
        elif hasattr(message, '__dict__') and 'instructions' in message.__dict__:
            instructions = message.__dict__['instructions']
        elif isinstance(message, dict) and 'instructions' in message:
            instructions = message['instructions']
        else:
            instructions = []
        
        # Check instructions for any supported DEX program
        for instruction in instructions:
            if hasattr(instruction, 'program_id'):
                program_id = str(instruction.program_id)
                if program_id in supported_programs:
                    return True
            elif isinstance(instruction, dict):
                program_id = instruction.get('programId') or instruction.get('program_id')
                if program_id in supported_programs:
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
        
        # Handle both dict and solders object formats for transaction
        if hasattr(transaction, 'meta'):
            # Solders object - access attributes directly
            meta = transaction.meta
        elif hasattr(transaction, '__dict__'):
            transaction = transaction.__dict__
            if not transaction or 'meta' not in transaction:
                return balance_changes
            meta = transaction['meta']
        elif isinstance(transaction, dict):
            if not transaction or 'meta' not in transaction:
                return balance_changes
            meta = transaction['meta']
        else:
            return balance_changes
        
        # Handle meta attributes vs dict access
        if hasattr(meta, 'pre_token_balances'):
            pre_balances = meta.pre_token_balances or []
            post_balances = meta.post_token_balances or []
        elif hasattr(meta, '__dict__'):
            meta_dict = meta.__dict__
            pre_balances = meta_dict.get('preTokenBalances', [])
            post_balances = meta_dict.get('postTokenBalances', [])
        elif isinstance(meta, dict):
            pre_balances = meta.get('preTokenBalances', [])
            post_balances = meta.get('postTokenBalances', [])
        else:
            pre_balances = []
            post_balances = []
        
        # Create lookup for pre-balances
        pre_lookup = {}
        for balance in pre_balances:
            # Handle solders balance objects vs dict
            if hasattr(balance, 'owner'):
                account = str(balance.owner)
                mint = str(balance.mint)
                if hasattr(balance, 'ui_token_amount') and balance.ui_token_amount:
                    amount = balance.ui_token_amount.ui_amount or 0
                else:
                    amount = 0
            elif isinstance(balance, dict):
                account = balance.get('owner')
                mint = balance.get('mint')
                amount = balance.get('uiTokenAmount', {}).get('uiAmount', 0)
            else:
                continue
            
            if account and mint:
                if account not in pre_lookup:
                    pre_lookup[account] = {}
                pre_lookup[account][mint] = Decimal(str(amount or 0))
        
        # Calculate changes using post-balances
        for balance in post_balances:
            # Handle solders balance objects vs dict
            if hasattr(balance, 'owner'):
                account = str(balance.owner)
                mint = str(balance.mint)
                if hasattr(balance, 'ui_token_amount') and balance.ui_token_amount:
                    post_amount = balance.ui_token_amount.ui_amount or 0
                    decimals = balance.ui_token_amount.decimals or 0
                else:
                    post_amount = 0
                    decimals = 0
            elif isinstance(balance, dict):
                account = balance.get('owner')
                mint = balance.get('mint')
                post_amount = balance.get('uiTokenAmount', {}).get('uiAmount', 0)
                decimals = balance.get('uiTokenAmount', {}).get('decimals', 0)
            else:
                continue
            
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
        # Handle both dict and solders object formats
        if hasattr(transaction, '__dict__'):
            transaction = transaction.__dict__
        
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
        
        # Handle both dict and solders object formats
        if hasattr(transaction, '__dict__'):
            transaction = transaction.__dict__
        
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
            
            # Extract basic transaction info - handle both dict and solders object formats
            if hasattr(transaction, 'block_time'):
                # Solders object
                block_time = transaction.block_time
                slot = transaction.slot
                meta = transaction.meta if hasattr(transaction, 'meta') else None
            elif hasattr(transaction, '__dict__'):
                # Convert solders object to dict
                tx_dict = transaction.__dict__
                block_time = tx_dict.get('blockTime')
                slot = tx_dict.get('slot', 0)
                meta = tx_dict.get('meta', {})
            elif isinstance(transaction, dict):
                # Already a dict
                block_time = transaction.get('blockTime')
                slot = transaction.get('slot', 0)
                meta = transaction.get('meta', {})
            else:
                logger.warning("Unknown transaction format", signature=signature, type=type(transaction))
                return None
            
            if not block_time:
                logger.warning("Transaction missing block time", signature=signature)
                return None
            
            block_time_dt = datetime.fromtimestamp(block_time, timezone.utc)
            
            # Determine transaction status
            if hasattr(meta, 'err'):
                err = meta.err
            elif isinstance(meta, dict):
                err = meta.get('err')
            else:
                err = None
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
                
                # Get symbol from known mints, or use mint address prefix as symbol
                if mint in self.mint_to_symbol:
                    symbol = self.mint_to_symbol[mint]
                else:
                    # For unknown tokens, use first 8 characters of mint as symbol
                    symbol = mint[:8].upper()
                
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
            if hasattr(meta, 'fee'):
                fee_lamports = meta.fee or 0
            elif isinstance(meta, dict):
                fee_lamports = meta.get('fee', 0)
            else:
                fee_lamports = 0
            
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