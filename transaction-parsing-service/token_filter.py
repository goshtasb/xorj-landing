"""
Token Filtering Logic for Whitelisted Tokens
FR-3: Whitelisted Token Filtering Implementation
"""

from typing import List, Set, Dict, Any, Optional
import structlog

logger = structlog.get_logger(__name__)

class TokenFilter:
    """
    Filter for validating tokens against whitelist
    FR-3: Only process swaps involving whitelisted tokens
    """
    
    def __init__(self, whitelisted_tokens: Optional[List[str]] = None):
        # FR-3: Predefined list of whitelisted tokens
        # Common Solana tokens for V1 implementation
        default_whitelist = [
            'So11111111111111111111111111111111111111112',    # SOL (Wrapped)
            'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',  # USDC
            'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',  # USDT
            '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',  # RAY (Raydium)
            'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So',   # mSOL (Marinade)
            'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',  # Bonk
            'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn',  # JitoSOL
        ]
        
        self.whitelisted_tokens: Set[str] = set(whitelisted_tokens or default_whitelist)
        
        logger.info("Token filter initialized",
                   whitelisted_count=len(self.whitelisted_tokens))
        logger.debug("Whitelisted tokens", tokens=list(self.whitelisted_tokens)[:3])  # Log first 3
    
    def is_swap_whitelisted(self, from_token_mint: str, to_token_mint: str) -> bool:
        """
        FR-3: Check if either input or output token is whitelisted
        
        Args:
            from_token_mint: Input token mint address
            to_token_mint: Output token mint address
            
        Returns:
            True if at least one token is whitelisted
        """
        try:
            from_whitelisted = from_token_mint in self.whitelisted_tokens
            to_whitelisted = to_token_mint in self.whitelisted_tokens
            
            is_whitelisted = from_whitelisted or to_whitelisted
            
            logger.debug("Token whitelist check",
                        from_token=from_token_mint[:10] + "..." if from_token_mint else "None",
                        to_token=to_token_mint[:10] + "..." if to_token_mint else "None",
                        from_whitelisted=from_whitelisted,
                        to_whitelisted=to_whitelisted,
                        result=is_whitelisted)
            
            return is_whitelisted
            
        except Exception as e:
            # SR-1: Robust Error Handling
            logger.warning("Error checking token whitelist",
                          from_token=from_token_mint,
                          to_token=to_token_mint,
                          error=str(e))
            return False
    
    def get_whitelisted_tokens(self) -> List[str]:
        """Get list of all whitelisted tokens"""
        return list(self.whitelisted_tokens)
    
    def add_token(self, token_mint: str) -> None:
        """Add a token to the whitelist"""
        self.whitelisted_tokens.add(token_mint)
        logger.info("Token added to whitelist", token=token_mint)
    
    def remove_token(self, token_mint: str) -> bool:
        """Remove a token from the whitelist"""
        if token_mint in self.whitelisted_tokens:
            self.whitelisted_tokens.remove(token_mint)
            logger.info("Token removed from whitelist", token=token_mint)
            return True
        return False

