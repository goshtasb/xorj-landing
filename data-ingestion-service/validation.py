"""
Input Validation for XORJ On-Chain Data Ingestion Service
SR-2: Input Validation - Solana wallet address validation
"""

import re
import base58
from typing import Tuple, Optional
import structlog

logger = structlog.get_logger(__name__)

class ValidationError(Exception):
    """Custom exception for validation errors"""
    pass

class InputValidator:
    """
    Input validation utilities for API requests
    SR-2: Validate wallet addresses before making API calls
    """
    
    # Solana public key constants
    SOLANA_ADDRESS_LENGTH = 44  # Base58 encoded 32 bytes
    SOLANA_ADDRESS_PATTERN = re.compile(r'^[1-9A-HJ-NP-Za-km-z]{43,44}$')
    
    @staticmethod
    def validate_solana_wallet_address(wallet_address: str) -> Tuple[bool, Optional[str]]:
        """
        SR-2: Validate Solana wallet address format
        
        Args:
            wallet_address: The wallet address to validate
            
        Returns:
            Tuple[bool, Optional[str]]: (is_valid, error_message)
        """
        if not wallet_address:
            return False, "Wallet address is required"
        
        # Check if string type
        if not isinstance(wallet_address, str):
            return False, "Wallet address must be a string"
        
        # Remove any whitespace
        wallet_address = wallet_address.strip()
        
        # Check length (Solana addresses are typically 43-44 characters in base58)
        if len(wallet_address) < 43 or len(wallet_address) > 44:
            return False, f"Invalid wallet address length: {len(wallet_address)} (expected 43-44 characters)"
        
        # Check character set (base58)
        if not InputValidator.SOLANA_ADDRESS_PATTERN.match(wallet_address):
            return False, "Wallet address contains invalid characters (must be valid base58)"
        
        # Validate base58 decoding and proper length
        try:
            decoded = base58.b58decode(wallet_address)
            if len(decoded) != 32:  # Solana public keys are 32 bytes
                return False, f"Invalid decoded address length: {len(decoded)} bytes (expected 32 bytes)"
        except Exception as e:
            return False, f"Invalid base58 encoding: {str(e)}"
        
        # Additional validation for known invalid patterns
        if wallet_address in ['1' * 44, '11111111111111111111111111111111']:
            return False, "Invalid wallet address pattern"
        
        logger.debug("Wallet address validation successful", 
                    wallet_address=wallet_address[:10] + "...")
        
        return True, None
    
    @staticmethod
    def validate_and_raise(wallet_address: str) -> str:
        """
        SR-2: Validate wallet address and raise exception if invalid
        
        Args:
            wallet_address: The wallet address to validate
            
        Returns:
            str: The validated wallet address (cleaned)
            
        Raises:
            ValidationError: If validation fails
        """
        is_valid, error_message = InputValidator.validate_solana_wallet_address(wallet_address)
        
        if not is_valid:
            logger.warning("Wallet address validation failed", 
                         wallet_address=wallet_address[:20] + "..." if len(wallet_address) > 20 else wallet_address,
                         error=error_message)
            raise ValidationError(f"Invalid Solana wallet address: {error_message}")
        
        # Return cleaned address
        return wallet_address.strip()
    
    @staticmethod
    def validate_job_id(job_id: str) -> Tuple[bool, Optional[str]]:
        """Validate UUID format for job ID"""
        import uuid
        
        if not job_id:
            return False, "Job ID is required"
        
        try:
            uuid.UUID(job_id)
            return True, None
        except ValueError:
            return False, "Invalid UUID format for job ID"
    
    @staticmethod
    def sanitize_input(input_string: str, max_length: int = 1000) -> str:
        """Sanitize string input to prevent injection attacks"""
        if not input_string:
            return ""
        
        # Remove potential SQL injection patterns
        sanitized = re.sub(r'[;\'"\\]', '', str(input_string))
        
        # Truncate to max length
        if len(sanitized) > max_length:
            sanitized = sanitized[:max_length]
        
        return sanitized.strip()


# Convenience functions
def validate_wallet_address(address: str) -> str:
    """Validate and return cleaned wallet address"""
    return InputValidator.validate_and_raise(address)

def is_valid_solana_address(address: str) -> bool:
    """Check if address is valid Solana format"""
    is_valid, _ = InputValidator.validate_solana_wallet_address(address)
    return is_valid