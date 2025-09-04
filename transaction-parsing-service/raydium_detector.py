"""
Raydium Swap Detection Logic
FR-2: Raydium Swap Identification Implementation
"""

import json
from typing import Dict, Any, Optional, List
import structlog

logger = structlog.get_logger(__name__)

class RaydiumSwapDetector:
    """
    Detector for identifying Raydium AMM v4 swap transactions
    """
    
    # FR-2: Official Raydium AMM v4 Program ID
    RAYDIUM_AMM_V4_PROGRAM_ID = '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8'
    
    # FR-2: Instruction discriminators for swap operations
    SWAP_BASE_IN_DISCRIMINATOR = 9  # swapBaseIn instruction in Anchor
    SWAP_BASE_OUT_DISCRIMINATOR = 11  # swapBaseOut instruction in Anchor
    
    def __init__(self):
        logger.debug("Raydium swap detector initialized",
                    program_id=self.RAYDIUM_AMM_V4_PROGRAM_ID)
    
    def detect_raydium_swaps(self, raw_transaction_data: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        FR-2: Identify Raydium AMM v4 swaps in a transaction
        
        Args:
            raw_transaction_data: Full JSON transaction data from Helius API
            
        Returns:
            List of detected Raydium swap instructions
        """
        try:
            detected_swaps = []
            
            # FR-2: Check if transaction has instructions array
            if 'transaction' not in raw_transaction_data:
                logger.debug("Transaction data missing 'transaction' field")
                return detected_swaps
            
            transaction = raw_transaction_data['transaction']
            if 'message' not in transaction:
                logger.debug("Transaction message missing")
                return detected_swaps
            
            message = transaction['message']
            if 'instructions' not in message:
                logger.debug("Transaction instructions missing")
                return detected_swaps
            
            instructions = message['instructions']
            
            # FR-2: Iterate through instructions to find Raydium AMM v4 program calls
            for idx, instruction in enumerate(instructions):
                if self._is_raydium_swap_instruction(instruction, message):
                    logger.debug("Raydium swap instruction detected",
                               instruction_index=idx,
                               program_id=self.RAYDIUM_AMM_V4_PROGRAM_ID)
                    
                    detected_swaps.append({
                        'instruction_index': idx,
                        'instruction': instruction,
                        'accounts': message.get('accountKeys', [])
                    })
            
            if detected_swaps:
                logger.info("Raydium swaps detected in transaction",
                           swap_count=len(detected_swaps))
            else:
                logger.debug("No Raydium swaps detected in transaction")
            
            return detected_swaps
            
        except Exception as e:
            # SR-1: Robust Error Handling
            logger.warning("Error detecting Raydium swaps",
                          error=str(e),
                          error_type=type(e).__name__)
            return []
    
    def _is_raydium_swap_instruction(self, instruction: Dict[str, Any], message: Dict[str, Any]) -> bool:
        """
        FR-2: Check if an instruction is a Raydium AMM v4 swap
        
        Args:
            instruction: Individual instruction from transaction
            message: Transaction message containing account keys
            
        Returns:
            True if this is a Raydium swap instruction
        """
        try:
            # FR-2: Check programId against Raydium AMM v4 Program ID
            program_id_index = instruction.get('programIdIndex')
            if program_id_index is None:
                return False
            
            account_keys = message.get('accountKeys', [])
            if program_id_index >= len(account_keys):
                return False
            
            program_id = account_keys[program_id_index]
            if program_id != self.RAYDIUM_AMM_V4_PROGRAM_ID:
                return False
            
            # FR-2: Check instruction discriminator for swap operations
            instruction_data = instruction.get('data', '')
            if not instruction_data:
                return False
            
            # FR-2: Decode base58 instruction data to get discriminator
            try:
                import base58
                decoded_data = base58.b58decode(instruction_data)
                if len(decoded_data) < 8:  # Need at least 8 bytes for discriminator
                    return False
                
                # Discriminator is the first 8 bytes in Anchor programs
                discriminator = int.from_bytes(decoded_data[:8], byteorder='little')
                
                # FR-2: Check if discriminator matches known swap operations
                if discriminator in [self.SWAP_BASE_IN_DISCRIMINATOR, self.SWAP_BASE_OUT_DISCRIMINATOR]:
                    logger.debug("Valid Raydium swap discriminator found",
                               discriminator=discriminator)
                    return True
                
            except Exception as e:
                logger.debug("Failed to decode instruction data",
                           error=str(e))
                return False
            
            return False
            
        except Exception as e:
            logger.debug("Error checking instruction for Raydium swap",
                        error=str(e))
            return False

