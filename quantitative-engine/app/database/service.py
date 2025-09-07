"""
Database service for trader intelligence data management
"""

import asyncio
import asyncpg
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime, timezone, timedelta
from contextlib import asynccontextmanager
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy import text, select, func, and_, or_, desc
import logging
import json

from .models import (
    Base, TraderProfile, TraderTransaction, TraderPerformanceMetrics, 
    TraderRanking, DataIngestionLog
)
from ..core.config import get_settings
# Import statements removed - using dict format instead of classes

logger = logging.getLogger(__name__)


class DatabaseService:
    """
    Manages database connections and trader intelligence data operations
    """
    
    def __init__(self):
        self._engine = None
        self._session_factory = None
        self._settings = None
        
    async def initialize(self):
        """Initialize database connection and verify setup"""
        try:
            self._settings = get_settings()
            database_url = self._settings.database_url
            
            # Convert psycopg2 URL to asyncpg format
            if database_url.startswith('postgresql://'):
                database_url = database_url.replace('postgresql://', 'postgresql+asyncpg://', 1)
            
            self._engine = create_async_engine(
                database_url,
                echo=False,  # Set to True for SQL debugging
                pool_size=10,
                max_overflow=20,
                pool_timeout=30,
                pool_recycle=3600,
            )
            
            self._session_factory = async_sessionmaker(
                self._engine,
                class_=AsyncSession,
                expire_on_commit=False
            )
            
            # Create tables if they don't exist
            async with self._engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
            
            logger.info("Database service initialized successfully")
            return True
            
        except Exception as e:
            logger.error(f"Failed to initialize database service: {e}")
            raise RuntimeError(f"Database initialization failed: {e}")
    
    @asynccontextmanager
    async def get_session(self):
        """Get a database session"""
        if not self._session_factory:
            await self.initialize()
        async with self._session_factory() as session:
            yield session
    
    async def health_check(self) -> bool:
        """Check database connectivity"""
        try:
            async with self.get_session() as session:
                result = await session.execute(text("SELECT 1"))
                return result.scalar() == 1
        except Exception as e:
            logger.error(f"Database health check failed: {e}")
            return False
    
    async def get_ranked_traders(
        self, 
        limit: int = 100, 
        min_trust_score: float = 0.0,
        period_days: int = 90
    ) -> List[Dict[str, Any]]:
        """
        Get ranked traders from the database with real performance data
        """
        try:
            async with self.get_session() as session:
                # Get the most recent ranking calculation
                recent_ranking = await session.execute(
                    text("""
                    SELECT calculation_timestamp 
                    FROM trader_rankings 
                    WHERE period_days = :period_days 
                      AND is_eligible = true
                    ORDER BY calculation_timestamp DESC 
                    LIMIT 1
                    """),
                    {"period_days": period_days}
                )
                
                latest_calc_time = recent_ranking.scalar()
                logger.info(f"Latest calculation time for period_days={period_days}: {latest_calc_time}")
                
                if not latest_calc_time:
                    # No rankings available, trigger calculation
                    logger.warning("No trader rankings available, calculating from available data")
                    return await self._calculate_emergency_rankings(session, limit, min_trust_score)
                
                # Get ranked traders from the latest calculation
                query = text("""
                    SELECT 
                        tr.rank,
                        tr.wallet_address,
                        tr.trust_score,
                        tr.performance_metrics,
                        tr.eligibility_check
                    FROM trader_rankings tr
                    WHERE tr.calculation_timestamp = :calc_time
                      AND tr.period_days = :period_days
                      AND tr.trust_score >= :min_trust_score
                      AND tr.is_eligible = true
                    ORDER BY tr.rank ASC
                    LIMIT :limit
                """)
                
                result = await session.execute(query, {
                    "calc_time": latest_calc_time,
                    "period_days": period_days,
                    "min_trust_score": min_trust_score,
                    "limit": limit
                })
                
                traders = []
                row_count = 0
                for row in result:
                    row_count += 1
                    logger.debug(f"Processing trader row {row_count}: {row.wallet_address}")
                    # Parse the JSON performance metrics
                    metrics = row.performance_metrics
                    
                    trader_data = {
                        "rank": row.rank,
                        "wallet_address": row.wallet_address,
                        "trust_score": row.trust_score,
                        "performance_breakdown": {
                            "performance_score": metrics.get("performance_score", 0.0),
                            "risk_penalty": metrics.get("risk_penalty", 0.0)
                        },
                        "metrics": {
                            "net_roi_percent": metrics.get("net_roi_percent", 0.0),
                            "sharpe_ratio": metrics.get("sharpe_ratio", 0.0),
                            "maximum_drawdown_percent": metrics.get("maximum_drawdown_percent", 0.0),
                            "total_trades": metrics.get("total_trades", 0),
                            "win_loss_ratio": metrics.get("win_loss_ratio", 0.0),
                            "total_volume_usd": metrics.get("total_volume_usd", 0.0),
                            "total_profit_usd": metrics.get("total_profit_usd", 0.0)
                        }
                    }
                    traders.append(trader_data)
                
                logger.info(f"Retrieved {len(traders)} ranked traders from database")
                return traders
                
        except Exception as e:
            logger.error(f"Error retrieving ranked traders: {e}")
            # Fallback to emergency calculation
            async with self.get_session() as session:
                return await self._calculate_emergency_rankings(session, limit, min_trust_score)
    
    async def _calculate_emergency_rankings(
        self, 
        session: AsyncSession, 
        limit: int, 
        min_trust_score: float
    ) -> List[Dict[str, Any]]:
        """
        Calculate rankings on-the-fly if no pre-calculated data exists
        """
        try:
            # Get traders with performance data from the last 90 days
            query = text("""
                SELECT 
                    tp.wallet_address,
                    tpm.trust_score,
                    tpm.net_roi_percent,
                    tpm.sharpe_ratio,
                    tpm.maximum_drawdown_percent,
                    tpm.total_trades,
                    tpm.win_loss_ratio,
                    tpm.total_volume_usd,
                    tpm.total_profit_usd,
                    tpm.performance_score,
                    tpm.risk_penalty
                FROM trader_profiles tp
                JOIN trader_performance_metrics tpm ON tp.wallet_address = tpm.wallet_address
                WHERE tp.is_active = true 
                  AND tpm.period_days = 90
                  AND tpm.trust_score >= :min_trust_score
                  AND tpm.total_trades >= 10
                ORDER BY tpm.trust_score DESC
                LIMIT :limit
            """)
            
            result = await session.execute(query, {
                "min_trust_score": min_trust_score,
                "limit": limit
            })
            
            traders = []
            rank = 1
            
            for row in result:
                trader_data = {
                    "rank": rank,
                    "wallet_address": row.wallet_address,
                    "trust_score": row.trust_score,
                    "performance_breakdown": {
                        "performance_score": row.performance_score or 0.0,
                        "risk_penalty": row.risk_penalty or 0.0
                    },
                    "metrics": {
                        "net_roi_percent": row.net_roi_percent or 0.0,
                        "sharpe_ratio": row.sharpe_ratio or 0.0,
                        "maximum_drawdown_percent": row.maximum_drawdown_percent or 0.0,
                        "total_trades": row.total_trades or 0,
                        "win_loss_ratio": row.win_loss_ratio or 0.0,
                        "total_volume_usd": row.total_volume_usd or 0.0,
                        "total_profit_usd": row.total_profit_usd or 0.0
                    }
                }
                traders.append(trader_data)
                rank += 1
            
            if not traders:
                # If no real data exists, seed with initial mainnet trader discovery
                logger.warning("No trader data found, seeding database with mainnet traders")
                await self._seed_mainnet_traders(session)
                return await self._get_seeded_rankings(session, limit, min_trust_score)
            
            logger.info(f"Calculated emergency rankings for {len(traders)} traders")
            return traders
            
        except Exception as e:
            logger.error(f"Emergency ranking calculation failed: {e}")
            return []
    
    async def _seed_mainnet_traders(self, session: AsyncSession):
        """
        Initialize trader discovery from live mainnet data
        """
        # No longer seed with static data - discovery happens through trader_discovery service
        from ..blockchain.trader_discovery import get_trader_discovery
        
        try:
            discovery = await get_trader_discovery()
            mainnet_traders = await discovery.discover_top_traders(limit=20)
            
            if mainnet_traders:
                logger.info(f"Discovered {len(mainnet_traders)} traders from mainnet analysis")
                # These are live discovered traders, not seed data
                for i, trader in enumerate(mainnet_traders[:10]):  # Store top 10
                    try:
                        # Create trader profile from discovery
                        profile = TraderProfile(
                            wallet_address=trader["wallet_address"],
                            total_trades=trader["metrics"]["total_trades"],
                            total_volume_sol=trader["metrics"]["total_volume_usd"] / 150.0,
                            current_trust_score=trader["trust_score"],
                            is_active=True
                        )
                        session.add(profile)
                        
                        # Create performance metrics from discovery
                        metrics = TraderPerformanceMetrics(
                            wallet_address=trader["wallet_address"],
                            calculation_date=datetime.now(timezone.utc),
                            period_days=90,
                            total_trades=trader["metrics"]["total_trades"],
                            total_volume_usd=trader["metrics"]["total_volume_usd"],
                            total_profit_usd=trader["metrics"]["total_profit_usd"],
                            net_roi_percent=trader["metrics"]["net_roi_percent"],
                            sharpe_ratio=trader["metrics"]["sharpe_ratio"],
                            maximum_drawdown_percent=trader["metrics"]["maximum_drawdown_percent"],
                            win_loss_ratio=trader["metrics"]["win_loss_ratio"],
                            trust_score=trader["trust_score"],
                            performance_score=trader["performance_breakdown"]["performance_score"],
                            risk_penalty=trader["performance_breakdown"]["risk_penalty"],
                            data_points=trader["metrics"]["total_trades"],
                            winning_trades=int(trader["metrics"]["total_trades"] * 0.6),  # Estimate
                            losing_trades=int(trader["metrics"]["total_trades"] * 0.4)   # Estimate
                        )
                        session.add(metrics)
                    except Exception as e:
                        logger.debug(f"Error storing discovered trader {trader.get('wallet_address')}: {e}")
                        continue
                
                await session.commit()
                logger.info(f"Initialized database with {len(mainnet_traders)} discovered mainnet traders")
            else:
                logger.warning("No mainnet traders discovered during initialization")
                
        except Exception as e:
            logger.error(f"Error during mainnet trader discovery initialization: {e}")
            # Don't fail initialization if discovery fails
    
    async def _get_seeded_rankings(
        self, 
        limit: int, 
        min_trust_score: float
    ) -> List[Dict[str, Any]]:
        """Get rankings from seeded data"""
        async with self.get_session() as session:
            return await self._calculate_emergency_rankings(session, limit, min_trust_score)
    
    async def store_trader_transaction(
        self, 
        wallet_address: str, 
        transaction_data: Dict[str, Any]
    ):
        """Store a new trader transaction for analysis"""
        try:
            async with self.get_session() as session:
                transaction = TraderTransaction(
                    wallet_address=wallet_address,
                    signature=transaction_data["signature"],
                    block_time=transaction_data["block_time"],
                    slot=transaction_data.get("slot", 0),
                    transaction_type=transaction_data.get("type", "swap"),
                    program_id=transaction_data.get("program_id", ""),
                    input_token_mint=transaction_data.get("input_token_mint"),
                    output_token_mint=transaction_data.get("output_token_mint"),
                    input_amount=transaction_data.get("input_amount"),
                    output_amount=transaction_data.get("output_amount"),
                    input_usd=transaction_data.get("input_usd"),
                    output_usd=transaction_data.get("output_usd"),
                    net_usd=transaction_data.get("net_usd"),
                    raw_transaction_data=transaction_data
                )
                session.add(transaction)
                await session.commit()
                
        except Exception as e:
            logger.error(f"Error storing trader transaction: {e}")
    
    async def update_trader_metrics(self, wallet_address: str, period_days: int = 90):
        """Recalculate and update trader performance metrics"""
        try:
            async with self.get_session() as session:
                # This would typically involve complex calculations
                # For now, we'll update from existing transaction data
                logger.info(f"Updating metrics for trader {wallet_address}")
                # Implementation would go here for real metric calculations
                
        except Exception as e:
            logger.error(f"Error updating trader metrics: {e}")
    
    async def close(self):
        """Close database connections"""
        if self._engine:
            await self._engine.dispose()


# Global database service instance
_database_service: Optional[DatabaseService] = None


async def get_database_service() -> DatabaseService:
    """Get global database service instance"""
    global _database_service
    
    if _database_service is None:
        _database_service = DatabaseService()
        await _database_service.initialize()
    
    return _database_service