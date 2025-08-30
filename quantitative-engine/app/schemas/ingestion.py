"""
XORJ Quantitative Engine - Data Ingestion Schemas
Pydantic models for validating ingested transaction data from Solana/Raydium
"""

from datetime import datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional, Union
from pydantic import BaseModel, validator, Field
from enum import Enum


class TransactionStatus(str, Enum):
    """Transaction processing status"""
    SUCCESS = "success"
    FAILED = "failed"
    PENDING = "pending"


class SwapType(str, Enum):
    """Types of swaps we can detect"""
    SWAP_BASE_IN = "swapBaseIn"
    SWAP_BASE_OUT = "swapBaseOut"
    SWAP = "swap"
    UNKNOWN = "unknown"


class TokenBalance(BaseModel):
    """Token balance change in a transaction"""
    mint: str = Field(..., description="Token mint address")
    symbol: Optional[str] = Field(None, description="Token symbol")
    decimals: int = Field(..., description="Token decimal places")
    amount: Decimal = Field(..., description="Balance change amount")
    usd_value: Optional[Decimal] = Field(None, description="USD value at time of transaction")
    
    @validator('mint')
    def validate_mint(cls, v):
        """Validate mint address format"""
        if not v or len(v) < 32:
            raise ValueError("Invalid mint address format")
        return v
    
    @validator('amount')
    def validate_amount(cls, v):
        """Ensure amount is not zero"""
        if v == 0:
            raise ValueError("Token amount cannot be zero")
        return v


class RaydiumSwap(BaseModel):
    """Validated Raydium swap transaction data"""
    
    # Transaction Identifiers
    signature: str = Field(..., description="Transaction signature")
    block_time: datetime = Field(..., description="Block timestamp")
    slot: int = Field(..., description="Solana slot number")
    
    # Wallet Information
    wallet_address: str = Field(..., description="Wallet performing the swap")
    
    # Transaction Details
    status: TransactionStatus = Field(..., description="Transaction status")
    swap_type: SwapType = Field(SwapType.UNKNOWN, description="Type of swap detected")
    
    # Token Information
    token_in: TokenBalance = Field(..., description="Input token details")
    token_out: TokenBalance = Field(..., description="Output token details")
    
    # Raydium Pool Information
    pool_id: str = Field(..., description="Raydium pool identifier")
    program_id: str = Field(..., description="Raydium program ID")
    
    # Transaction Costs
    fee_lamports: int = Field(..., description="Transaction fee in lamports")
    fee_usd: Optional[Decimal] = Field(None, description="Transaction fee in USD")
    
    # Processing Metadata
    processed_at: datetime = Field(default_factory=datetime.utcnow, description="When this data was processed")
    data_source: str = Field(default="helius", description="Source of transaction data")
    
    @validator('signature')
    def validate_signature(cls, v):
        """Validate transaction signature format"""
        if not v or len(v) < 64:
            raise ValueError("Invalid transaction signature format")
        return v
    
    @validator('wallet_address')
    def validate_wallet_address(cls, v):
        """Validate wallet address format"""
        if not v or len(v) < 32:
            raise ValueError("Invalid wallet address format")
        return v
    
    @validator('pool_id')
    def validate_pool_id(cls, v):
        """Validate pool ID format"""
        if not v or len(v) < 32:
            raise ValueError("Invalid pool ID format")
        return v
    
    @validator('fee_lamports')
    def validate_fee(cls, v):
        """Validate transaction fee"""
        if v < 0:
            raise ValueError("Transaction fee cannot be negative")
        return v
    
    @validator('token_out')
    def validate_swap_direction(cls, v, values):
        """Validate that token_in and token_out are different"""
        if 'token_in' in values and v.mint == values['token_in'].mint:
            raise ValueError("Input and output tokens cannot be the same")
        return v
    
    @property
    def is_buy(self) -> bool:
        """Check if this is a buy transaction (token_out is not SOL/USDC/USDT)"""
        stable_tokens = {"So11111111111111111111111111111111111111112", 
                        "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
                        "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"}
        return self.token_in.mint in stable_tokens
    
    @property
    def is_sell(self) -> bool:
        """Check if this is a sell transaction (token_in is not SOL/USDC/USDT)"""
        return not self.is_buy
    
    @property
    def trade_size_usd(self) -> Optional[Decimal]:
        """Get trade size in USD (using token_in value)"""
        return self.token_in.usd_value
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for database storage"""
        return {
            "signature": self.signature,
            "block_time": self.block_time,
            "slot": self.slot,
            "wallet_address": self.wallet_address,
            "status": self.status.value,
            "swap_type": self.swap_type.value,
            "token_in_mint": self.token_in.mint,
            "token_in_symbol": self.token_in.symbol,
            "token_in_amount": float(self.token_in.amount),
            "token_in_decimals": self.token_in.decimals,
            "token_in_usd_value": float(self.token_in.usd_value) if self.token_in.usd_value else None,
            "token_out_mint": self.token_out.mint,
            "token_out_symbol": self.token_out.symbol,
            "token_out_amount": float(self.token_out.amount),
            "token_out_decimals": self.token_out.decimals,
            "token_out_usd_value": float(self.token_out.usd_value) if self.token_out.usd_value else None,
            "pool_id": self.pool_id,
            "program_id": self.program_id,
            "fee_lamports": self.fee_lamports,
            "fee_usd": float(self.fee_usd) if self.fee_usd else None,
            "processed_at": self.processed_at,
            "data_source": self.data_source,
            "is_buy": self.is_buy,
            "is_sell": self.is_sell,
            "trade_size_usd": float(self.trade_size_usd) if self.trade_size_usd else None,
        }


class WalletIngestionStatus(BaseModel):
    """Status of wallet data ingestion process"""
    
    wallet_address: str = Field(..., description="Wallet being processed")
    start_time: datetime = Field(default_factory=datetime.utcnow, description="When ingestion started")
    end_time: Optional[datetime] = Field(None, description="When ingestion completed")
    
    # Processing Statistics
    total_transactions_found: int = Field(0, description="Total transactions found for wallet")
    raydium_transactions_found: int = Field(0, description="Raydium transactions found")
    valid_swaps_extracted: int = Field(0, description="Valid swaps successfully extracted")
    invalid_transactions: int = Field(0, description="Transactions that failed validation")
    
    # Error Tracking
    errors: List[str] = Field(default_factory=list, description="Errors encountered during processing")
    warnings: List[str] = Field(default_factory=list, description="Warnings encountered during processing")
    
    # Status
    status: str = Field("running", description="Current processing status")
    success: bool = Field(False, description="Whether ingestion completed successfully")
    
    @property
    def duration_seconds(self) -> Optional[float]:
        """Get processing duration in seconds"""
        if self.end_time and self.start_time:
            return (self.end_time - self.start_time).total_seconds()
        return None
    
    @property
    def success_rate(self) -> float:
        """Get success rate of transaction processing"""
        if self.raydium_transactions_found == 0:
            return 0.0
        return self.valid_swaps_extracted / self.raydium_transactions_found
    
    def add_error(self, error: str):
        """Add an error to the status"""
        self.errors.append(f"{datetime.utcnow().isoformat()}: {error}")
    
    def add_warning(self, warning: str):
        """Add a warning to the status"""
        self.warnings.append(f"{datetime.utcnow().isoformat()}: {warning}")
    
    def mark_completed(self, success: bool = True):
        """Mark ingestion as completed"""
        self.end_time = datetime.utcnow()
        self.success = success
        self.status = "completed" if success else "failed"


class IngestionBatch(BaseModel):
    """A batch of wallet addresses to be processed"""
    
    batch_id: str = Field(..., description="Unique batch identifier")
    wallet_addresses: List[str] = Field(..., description="List of wallet addresses to process")
    created_at: datetime = Field(default_factory=datetime.utcnow, description="When batch was created")
    priority: int = Field(0, description="Processing priority (higher = more important)")
    
    # Configuration
    start_date: Optional[datetime] = Field(None, description="Start date for transaction fetching")
    end_date: Optional[datetime] = Field(None, description="End date for transaction fetching")
    max_transactions: Optional[int] = Field(None, description="Maximum transactions per wallet")
    
    @validator('wallet_addresses')
    def validate_wallet_addresses(cls, v):
        """Validate wallet addresses in batch"""
        if not v:
            raise ValueError("Batch cannot be empty")
        
        for addr in v:
            if not addr or len(addr) < 32:
                raise ValueError(f"Invalid wallet address format: {addr}")
        
        # Remove duplicates while preserving order
        seen = set()
        unique_addresses = []
        for addr in v:
            if addr not in seen:
                seen.add(addr)
                unique_addresses.append(addr)
        
        return unique_addresses
    
    @property
    def wallet_count(self) -> int:
        """Get number of wallets in batch"""
        return len(self.wallet_addresses)