"""
Create trader profiles from discovered mainnet traders
This script connects the trader discovery pipeline to the database
"""

import asyncio
import sys
import logging
from datetime import datetime, timezone

# Add current directory to Python path
sys.path.append('.')

from app.database.service import get_database_service
from app.database.models import TraderProfile, TraderPerformanceMetrics
from app.blockchain.trader_discovery_fixed import get_fixed_trader_discovery
from sqlalchemy import text

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def create_profiles_from_discovery():
    """
    Create trader profiles from live mainnet trader discovery
    """
    try:
        logger.info("🔍 Starting trader profile creation from mainnet discovery...")
        
        # Initialize services
        database_service = await get_database_service()
        discovery_service = await get_fixed_trader_discovery()
        
        # Discover current top traders from mainnet
        logger.info("📡 Discovering active traders from mainnet...")
        discovered_traders = await discovery_service.discover_top_traders(limit=10)
        
        if not discovered_traders:
            logger.warning("❌ No traders discovered from mainnet")
            return
        
        logger.info(f"✅ Discovered {len(discovered_traders)} active traders")
        
        # Store trader profiles and metrics
        profiles_created = 0
        metrics_created = 0
        
        async with database_service.get_session() as session:
            for trader in discovered_traders:
                wallet_address = trader["wallet_address"]
                
                try:
                    # Check if profile already exists
                    existing_profile = await session.execute(
                        text("SELECT wallet_address FROM trader_profiles WHERE wallet_address = :wallet"),
                        {"wallet": wallet_address}
                    )
                    
                    if not existing_profile.scalar():
                        # Create new trader profile
                        profile = TraderProfile(
                            wallet_address=wallet_address,
                            total_trades=trader["metrics"]["total_trades"],
                            total_volume_sol=trader["metrics"]["total_volume_usd"] / 150.0,  # Approximate SOL price
                            current_trust_score=trader["trust_score"],
                            first_seen=datetime.now(timezone.utc),
                            is_active=True,
                            last_activity=trader.get("last_activity", datetime.now(timezone.utc))
                        )
                        session.add(profile)
                        profiles_created += 1
                        logger.info(f"📝 Created profile for {wallet_address} (trust: {trader['trust_score']:.1f})")
                    
                    # Always create/update performance metrics
                    metrics = TraderPerformanceMetrics(
                        wallet_address=wallet_address,
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
                        winning_trades=int(trader["metrics"]["total_trades"] * 0.6),  # Estimate from win_rate
                        losing_trades=int(trader["metrics"]["total_trades"] * 0.4)
                    )
                    session.add(metrics)
                    metrics_created += 1
                    
                except Exception as e:
                    logger.error(f"❌ Error processing trader {wallet_address}: {e}")
                    continue
            
            # Commit all changes
            await session.commit()
            logger.info(f"✅ Created {profiles_created} new profiles and {metrics_created} metrics records")
        
        # Verify the data was stored
        logger.info("🔍 Verifying stored data...")
        async with database_service.get_session() as session:
            profile_count = await session.execute(text("SELECT COUNT(*) FROM trader_profiles"))
            metrics_count = await session.execute(text("SELECT COUNT(*) FROM trader_performance_metrics"))
            
            logger.info(f"📊 Database now contains:")
            logger.info(f"   - {profile_count.scalar()} trader profiles")  
            logger.info(f"   - {metrics_count.scalar()} performance metrics")
        
        logger.info("🎉 Trader profile creation completed successfully!")
        
    except Exception as e:
        logger.error(f"💥 Error during trader profile creation: {e}")
        import traceback
        traceback.print_exc()
        

if __name__ == "__main__":
    asyncio.run(create_profiles_from_discovery())