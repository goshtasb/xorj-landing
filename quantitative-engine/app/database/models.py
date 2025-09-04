"""
SQLAlchemy models for trader intelligence and performance analysis
"""

from sqlalchemy import Column, String, Float, Integer, DateTime, JSON, Boolean, Text, BigInteger, Index
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.dialects.postgresql import UUID, JSONB
from datetime import datetime, timezone
import uuid

Base = declarative_base()


class TraderProfile(Base):
    """
    Core trader profile with basic information and activity status
    """
    __tablename__ = "trader_profiles"
    
    trader_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    wallet_address = Column(String(44), unique=True, nullable=False, index=True)
    first_seen = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    last_activity = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    is_active = Column(Boolean, default=True, index=True)
    total_trades = Column(Integer, default=0)
    total_volume_sol = Column(Float, default=0.0)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    
    # Performance summary (calculated periodically)
    current_trust_score = Column(Float, default=0.0, index=True)
    performance_rank = Column(Integer, nullable=True, index=True)
    
    __table_args__ = (
        Index('idx_trader_trust_score', 'current_trust_score', postgresql_where=Column('is_active')),
        Index('idx_trader_activity', 'last_activity', 'is_active'),
    )


class TraderTransaction(Base):
    """
    Individual blockchain transactions for detailed analysis
    """
    __tablename__ = "trader_transactions"
    
    transaction_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    wallet_address = Column(String(44), nullable=False, index=True)
    signature = Column(String(128), unique=True, nullable=False, index=True)
    block_time = Column(DateTime(timezone=True), nullable=False, index=True)
    slot = Column(BigInteger, nullable=False)
    
    # Transaction details
    transaction_type = Column(String(50), nullable=False)  # 'swap', 'add_liquidity', 'remove_liquidity'
    program_id = Column(String(44), nullable=False)
    
    # Token information
    input_token_mint = Column(String(44), nullable=True)
    output_token_mint = Column(String(44), nullable=True)
    input_amount = Column(BigInteger, nullable=True)  # Raw token amounts
    output_amount = Column(BigInteger, nullable=True)
    input_decimals = Column(Integer, nullable=True)
    output_decimals = Column(Integer, nullable=True)
    
    # USD values (calculated)
    input_usd = Column(Float, nullable=True)
    output_usd = Column(Float, nullable=True)
    net_usd = Column(Float, nullable=True)  # profit/loss
    
    # Analysis metadata
    processed_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    price_data_source = Column(String(50), nullable=True)
    raw_transaction_data = Column(JSONB, nullable=True)
    
    __table_args__ = (
        Index('idx_trader_tx_wallet_time', 'wallet_address', 'block_time'),
        Index('idx_trader_tx_type_time', 'transaction_type', 'block_time'),
        Index('idx_trader_tx_usd_value', 'net_usd', postgresql_where=Column('net_usd').isnot(None)),
    )


class TraderPerformanceMetrics(Base):
    """
    Calculated performance metrics for each trader over different time periods
    """
    __tablename__ = "trader_performance_metrics"
    
    metrics_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    wallet_address = Column(String(44), nullable=False, index=True)
    calculation_date = Column(DateTime(timezone=True), nullable=False, index=True)
    period_days = Column(Integer, nullable=False)  # 7, 30, 90, etc.
    
    # Core performance metrics
    total_trades = Column(Integer, nullable=False, default=0)
    total_volume_usd = Column(Float, nullable=False, default=0.0)
    total_profit_usd = Column(Float, nullable=False, default=0.0)
    net_roi_percent = Column(Float, nullable=False, default=0.0)
    
    # Risk metrics
    sharpe_ratio = Column(Float, nullable=True)
    maximum_drawdown_percent = Column(Float, nullable=True)
    volatility = Column(Float, nullable=True)
    win_loss_ratio = Column(Float, nullable=True)
    
    # Trade analysis
    winning_trades = Column(Integer, default=0)
    losing_trades = Column(Integer, default=0)
    average_win_usd = Column(Float, nullable=True)
    average_loss_usd = Column(Float, nullable=True)
    largest_win_usd = Column(Float, nullable=True)
    largest_loss_usd = Column(Float, nullable=True)
    
    # Trust score components
    performance_score = Column(Float, nullable=True)
    risk_penalty = Column(Float, nullable=True)
    trust_score = Column(Float, nullable=False, default=0.0, index=True)
    
    # Metadata
    data_points = Column(Integer, nullable=False)  # Number of transactions used
    calculation_version = Column(String(20), nullable=False, default="1.0.0")
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    
    __table_args__ = (
        Index('idx_trader_metrics_wallet_period', 'wallet_address', 'period_days', 'calculation_date'),
        Index('idx_trader_metrics_trust_score', 'trust_score', 'period_days'),
        Index('idx_trader_metrics_roi', 'net_roi_percent', 'period_days'),
    )


class TraderRanking(Base):
    """
    Pre-calculated trader rankings for fast API responses
    """
    __tablename__ = "trader_rankings"
    
    ranking_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    calculation_timestamp = Column(DateTime(timezone=True), nullable=False, index=True)
    period_days = Column(Integer, nullable=False, default=90)
    algorithm_version = Column(String(20), nullable=False, default="1.0.0")
    
    # Ranking data
    wallet_address = Column(String(44), nullable=False, index=True)
    rank = Column(Integer, nullable=False, index=True)
    trust_score = Column(Float, nullable=False)
    
    # Performance summary
    performance_metrics = Column(JSONB, nullable=False)  # All metrics as JSON
    eligibility_check = Column(JSONB, nullable=False)  # Why trader qualified
    
    # Fast filtering
    min_trust_score_tier = Column(String(20), nullable=False, index=True)  # 'high', 'medium', 'low'
    is_eligible = Column(Boolean, nullable=False, default=True, index=True)
    
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    
    __table_args__ = (
        Index('idx_trader_ranking_current', 'calculation_timestamp', 'rank', 'is_eligible'),
        Index('idx_trader_ranking_trust_tier', 'min_trust_score_tier', 'rank'),
    )


class DataIngestionLog(Base):
    """
    Track data ingestion progress and status
    """
    __tablename__ = "data_ingestion_log"
    
    ingestion_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    started_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    completed_at = Column(DateTime(timezone=True), nullable=True)
    status = Column(String(20), nullable=False, default='running')  # 'running', 'completed', 'failed'
    
    # Progress tracking
    ingestion_type = Column(String(50), nullable=False)  # 'full_sync', 'incremental', 'trader_discovery'
    total_addresses_processed = Column(Integer, default=0)
    total_transactions_processed = Column(Integer, default=0)
    new_traders_found = Column(Integer, default=0)
    
    # Configuration
    block_range_start = Column(BigInteger, nullable=True)
    block_range_end = Column(BigInteger, nullable=True)
    filters_applied = Column(JSONB, nullable=True)
    
    # Results
    error_message = Column(Text, nullable=True)
    summary_stats = Column(JSONB, nullable=True)
    
    __table_args__ = (
        Index('idx_ingestion_status_time', 'status', 'started_at'),
    )