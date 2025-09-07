"""
Data Quality Validation Script
Validates that we have sufficient data quality for trading decisions
"""

import asyncio
import sys
import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Any

# Add current directory to Python path
sys.path.append('.')

from app.database.service import get_database_service
from sqlalchemy import text

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class DataQualityValidator:
    """Validates data quality for trading readiness"""
    
    def __init__(self):
        self.database_service = None
        self.validation_results = {}
    
    async def initialize(self):
        """Initialize database connection"""
        self.database_service = await get_database_service()
        logger.info("Data quality validator initialized")
    
    async def validate_all(self) -> Dict[str, Any]:
        """Run all validation checks"""
        if not self.database_service:
            await self.initialize()
        
        logger.info("🔍 Starting comprehensive data quality validation...")
        
        # Run all validation checks
        await self._validate_trader_profiles()
        await self._validate_performance_metrics() 
        await self._validate_transaction_data()
        await self._validate_data_recency()
        await self._validate_trader_diversity()
        
        # Calculate overall readiness score
        overall_score = self._calculate_readiness_score()
        
        # Generate summary report
        summary = self._generate_summary_report(overall_score)
        
        return {
            "validation_results": self.validation_results,
            "overall_score": overall_score,
            "summary": summary,
            "trading_ready": overall_score >= 70
        }
    
    async def _validate_trader_profiles(self):
        """Validate trader profile data quality"""
        logger.info("📊 Validating trader profiles...")
        
        async with self.database_service.get_session() as session:
            # Check total count
            count_result = await session.execute(text("SELECT COUNT(*) FROM trader_profiles"))
            total_profiles = count_result.scalar()
            
            # Check active profiles
            active_result = await session.execute(
                text("SELECT COUNT(*) FROM trader_profiles WHERE is_active = true")
            )
            active_profiles = active_result.scalar()
            
            # Check trust score distribution
            trust_scores = await session.execute(
                text("""
                    SELECT 
                        AVG(current_trust_score) as avg_score,
                        MIN(current_trust_score) as min_score,
                        MAX(current_trust_score) as max_score,
                        COUNT(CASE WHEN current_trust_score >= 50 THEN 1 END) as high_trust_count
                    FROM trader_profiles
                """)
            )
            trust_stats = trust_scores.fetchone()
            
            # Check volume data
            volume_result = await session.execute(
                text("""
                    SELECT 
                        AVG(total_volume_sol) as avg_volume_sol,
                        COUNT(CASE WHEN total_volume_sol > 0 THEN 1 END) as profiles_with_volume
                    FROM trader_profiles
                """)
            )
            volume_stats = volume_result.fetchone()
            
            self.validation_results["trader_profiles"] = {
                "total_profiles": total_profiles,
                "active_profiles": active_profiles,
                "avg_trust_score": float(trust_stats.avg_score) if trust_stats.avg_score else 0,
                "min_trust_score": float(trust_stats.min_score) if trust_stats.min_score else 0,
                "max_trust_score": float(trust_stats.max_score) if trust_stats.max_score else 0,
                "high_trust_count": trust_stats.high_trust_count,
                "avg_volume_sol": float(volume_stats.avg_volume_sol) if volume_stats.avg_volume_sol else 0,
                "profiles_with_volume": volume_stats.profiles_with_volume,
                "quality_score": self._score_trader_profiles(total_profiles, active_profiles, trust_stats, volume_stats)
            }
            
            logger.info(f"✅ Found {total_profiles} trader profiles ({active_profiles} active)")
    
    async def _validate_performance_metrics(self):
        """Validate performance metrics data"""
        logger.info("📈 Validating performance metrics...")
        
        async with self.database_service.get_session() as session:
            # Check metrics count and quality
            metrics_result = await session.execute(
                text("""
                    SELECT 
                        COUNT(*) as total_metrics,
                        AVG(net_roi_percent) as avg_roi,
                        AVG(sharpe_ratio) as avg_sharpe,
                        AVG(total_trades) as avg_trades,
                        COUNT(CASE WHEN total_trades >= 10 THEN 1 END) as sufficient_trades,
                        COUNT(CASE WHEN net_roi_percent > 0 THEN 1 END) as profitable_traders
                    FROM trader_performance_metrics
                """)
            )
            metrics_stats = metrics_result.fetchone()
            
            # Check data completeness
            completeness_result = await session.execute(
                text("""
                    SELECT 
                        COUNT(CASE WHEN sharpe_ratio IS NOT NULL THEN 1 END) as with_sharpe,
                        COUNT(CASE WHEN maximum_drawdown_percent IS NOT NULL THEN 1 END) as with_drawdown,
                        COUNT(CASE WHEN win_loss_ratio IS NOT NULL THEN 1 END) as with_win_loss
                    FROM trader_performance_metrics
                """)
            )
            completeness_stats = completeness_result.fetchone()
            
            self.validation_results["performance_metrics"] = {
                "total_metrics": metrics_stats.total_metrics,
                "avg_roi_percent": float(metrics_stats.avg_roi) if metrics_stats.avg_roi else 0,
                "avg_sharpe_ratio": float(metrics_stats.avg_sharpe) if metrics_stats.avg_sharpe else 0,
                "avg_trades": float(metrics_stats.avg_trades) if metrics_stats.avg_trades else 0,
                "sufficient_trades_count": metrics_stats.sufficient_trades,
                "profitable_traders": metrics_stats.profitable_traders,
                "with_sharpe": completeness_stats.with_sharpe,
                "with_drawdown": completeness_stats.with_drawdown,
                "with_win_loss": completeness_stats.with_win_loss,
                "quality_score": self._score_performance_metrics(metrics_stats, completeness_stats)
            }
            
            logger.info(f"✅ Found {metrics_stats.total_metrics} performance metrics records")
    
    async def _validate_transaction_data(self):
        """Validate transaction data availability"""
        logger.info("💳 Validating transaction data...")
        
        async with self.database_service.get_session() as session:
            # Check transaction count
            tx_count_result = await session.execute(text("SELECT COUNT(*) FROM trader_transactions"))
            total_transactions = tx_count_result.scalar()
            
            if total_transactions > 0:
                # Analyze transaction quality if we have data
                tx_quality_result = await session.execute(
                    text("""
                        SELECT 
                            COUNT(DISTINCT wallet_address) as unique_wallets,
                            AVG(CASE WHEN input_usd IS NOT NULL AND output_usd IS NOT NULL 
                                     THEN ABS(input_usd - output_usd) END) as avg_trade_size,
                            COUNT(CASE WHEN net_usd IS NOT NULL THEN 1 END) as with_pnl,
                            MIN(block_time) as earliest_tx,
                            MAX(block_time) as latest_tx
                        FROM trader_transactions
                    """)
                )
                tx_stats = tx_quality_result.fetchone()
                
                self.validation_results["transaction_data"] = {
                    "total_transactions": total_transactions,
                    "unique_wallets": tx_stats.unique_wallets,
                    "avg_trade_size_usd": float(tx_stats.avg_trade_size) if tx_stats.avg_trade_size else 0,
                    "transactions_with_pnl": tx_stats.with_pnl,
                    "earliest_transaction": tx_stats.earliest_tx,
                    "latest_transaction": tx_stats.latest_tx,
                    "quality_score": min(100, (total_transactions / 100) * 20)  # Up to 20 points
                }
            else:
                self.validation_results["transaction_data"] = {
                    "total_transactions": 0,
                    "unique_wallets": 0,
                    "avg_trade_size_usd": 0,
                    "transactions_with_pnl": 0,
                    "earliest_transaction": None,
                    "latest_transaction": None,
                    "quality_score": 0,
                    "warning": "No transaction data available - trading decisions will be less informed"
                }
            
            logger.info(f"⚠️ Found {total_transactions} trader transactions (0 is concerning)")
    
    async def _validate_data_recency(self):
        """Validate data recency and freshness"""
        logger.info("⏰ Validating data recency...")
        
        async with self.database_service.get_session() as session:
            # Check profile creation dates
            recency_result = await session.execute(
                text("""
                    SELECT 
                        MIN(created_at) as earliest_profile,
                        MAX(created_at) as latest_profile,
                        COUNT(CASE WHEN created_at > NOW() - INTERVAL '7 days' THEN 1 END) as recent_profiles,
                        AVG(EXTRACT(EPOCH FROM (NOW() - created_at))/3600) as avg_age_hours
                    FROM trader_profiles
                """)
            )
            recency_stats = recency_result.fetchone()
            
            # Check performance metrics recency
            metrics_recency_result = await session.execute(
                text("""
                    SELECT 
                        MIN(calculation_date) as earliest_calc,
                        MAX(calculation_date) as latest_calc,
                        COUNT(CASE WHEN calculation_date > NOW() - INTERVAL '1 day' THEN 1 END) as recent_calcs
                    FROM trader_performance_metrics
                """)
            )
            metrics_recency_stats = metrics_recency_result.fetchone()
            
            avg_age_hours = float(recency_stats.avg_age_hours) if recency_stats.avg_age_hours else 0
            
            self.validation_results["data_recency"] = {
                "earliest_profile": recency_stats.earliest_profile,
                "latest_profile": recency_stats.latest_profile,
                "recent_profiles_7d": recency_stats.recent_profiles,
                "avg_profile_age_hours": avg_age_hours,
                "earliest_calc": metrics_recency_stats.earliest_calc,
                "latest_calc": metrics_recency_stats.latest_calc,
                "recent_calculations_1d": metrics_recency_stats.recent_calcs,
                "quality_score": max(0, 100 - (avg_age_hours / 24) * 10)  # Decay over days
            }
            
            logger.info(f"✅ Data average age: {avg_age_hours:.1f} hours")
    
    async def _validate_trader_diversity(self):
        """Validate trader diversity and quality distribution"""
        logger.info("🎯 Validating trader diversity...")
        
        async with self.database_service.get_session() as session:
            # Check diversity metrics
            diversity_result = await session.execute(
                text("""
                    SELECT 
                        COUNT(CASE WHEN current_trust_score >= 80 THEN 1 END) as excellent_traders,
                        COUNT(CASE WHEN current_trust_score >= 60 AND current_trust_score < 80 THEN 1 END) as good_traders,
                        COUNT(CASE WHEN current_trust_score >= 40 AND current_trust_score < 60 THEN 1 END) as fair_traders,
                        COUNT(CASE WHEN current_trust_score < 40 THEN 1 END) as poor_traders,
                        STDDEV(current_trust_score) as trust_score_stddev,
                        COUNT(DISTINCT SUBSTRING(wallet_address, 1, 5)) as address_diversity
                    FROM trader_profiles
                """)
            )
            diversity_stats = diversity_result.fetchone()
            
            self.validation_results["trader_diversity"] = {
                "excellent_traders": diversity_stats.excellent_traders,
                "good_traders": diversity_stats.good_traders,
                "fair_traders": diversity_stats.fair_traders,
                "poor_traders": diversity_stats.poor_traders,
                "trust_score_stddev": float(diversity_stats.trust_score_stddev) if diversity_stats.trust_score_stddev else 0,
                "address_diversity": diversity_stats.address_diversity,
                "quality_score": self._score_trader_diversity(diversity_stats)
            }
            
            logger.info(f"✅ Trader quality distribution: {diversity_stats.excellent_traders} excellent, {diversity_stats.good_traders} good")
    
    def _score_trader_profiles(self, total, active, trust_stats, volume_stats) -> float:
        """Score trader profile quality (0-100)"""
        score = 0
        
        # Base count score (0-30 points)
        score += min(30, total * 3)  # 3 points per profile, max 30
        
        # Active ratio score (0-20 points)
        if total > 0:
            active_ratio = active / total
            score += active_ratio * 20
        
        # Trust score quality (0-30 points)
        if trust_stats.avg_score:
            score += (trust_stats.avg_score / 100) * 30
        
        # Volume data completeness (0-20 points)
        if total > 0 and volume_stats.profiles_with_volume:
            volume_completeness = volume_stats.profiles_with_volume / total
            score += volume_completeness * 20
        
        return min(100, score)
    
    def _score_performance_metrics(self, metrics_stats, completeness_stats) -> float:
        """Score performance metrics quality (0-100)"""
        score = 0
        
        # Metrics count (0-30 points)
        score += min(30, metrics_stats.total_metrics * 3)
        
        # Trade count adequacy (0-25 points)
        if metrics_stats.total_metrics > 0:
            sufficient_ratio = metrics_stats.sufficient_trades / metrics_stats.total_metrics
            score += sufficient_ratio * 25
        
        # Data completeness (0-45 points, 15 each)
        total_metrics = metrics_stats.total_metrics
        if total_metrics > 0:
            score += (completeness_stats.with_sharpe / total_metrics) * 15
            score += (completeness_stats.with_drawdown / total_metrics) * 15
            score += (completeness_stats.with_win_loss / total_metrics) * 15
        
        return min(100, score)
    
    def _score_trader_diversity(self, diversity_stats) -> float:
        """Score trader diversity (0-100)"""
        total = (diversity_stats.excellent_traders + diversity_stats.good_traders + 
                diversity_stats.fair_traders + diversity_stats.poor_traders)
        
        if total == 0:
            return 0
        
        score = 0
        
        # Quality distribution (0-60 points)
        excellent_ratio = diversity_stats.excellent_traders / total
        good_ratio = diversity_stats.good_traders / total
        score += excellent_ratio * 40  # Excellent traders worth 40 points
        score += good_ratio * 20       # Good traders worth 20 points
        
        # Diversity bonus (0-40 points)
        if diversity_stats.trust_score_stddev > 10:  # Good spread
            score += 20
        score += min(20, diversity_stats.address_diversity * 2)  # Address diversity
        
        return min(100, score)
    
    def _calculate_readiness_score(self) -> float:
        """Calculate overall trading readiness score (0-100)"""
        weights = {
            "trader_profiles": 0.25,
            "performance_metrics": 0.25,
            "transaction_data": 0.20,
            "data_recency": 0.15,
            "trader_diversity": 0.15
        }
        
        weighted_score = 0
        for category, weight in weights.items():
            if category in self.validation_results:
                quality_score = self.validation_results[category].get("quality_score", 0)
                weighted_score += quality_score * weight
        
        return min(100, weighted_score)
    
    def _generate_summary_report(self, overall_score: float) -> Dict[str, Any]:
        """Generate human-readable summary report"""
        # Determine readiness level
        if overall_score >= 90:
            readiness_level = "EXCELLENT"
            readiness_color = "🟢"
        elif overall_score >= 70:
            readiness_level = "GOOD"
            readiness_color = "🟡"
        elif overall_score >= 50:
            readiness_level = "FAIR"
            readiness_color = "🟠"
        else:
            readiness_level = "POOR"
            readiness_color = "🔴"
        
        # Identify key issues
        issues = []
        recommendations = []
        
        # Check transaction data
        if self.validation_results["transaction_data"]["total_transactions"] == 0:
            issues.append("No historical transaction data available")
            recommendations.append("Run data ingestion to collect trader transaction history")
        
        # Check profile count
        profile_count = self.validation_results["trader_profiles"]["total_profiles"]
        if profile_count < 20:
            issues.append(f"Only {profile_count} trader profiles (recommend 20+)")
            recommendations.append("Discover more traders from mainnet activity")
        
        # Check data age
        avg_age_hours = self.validation_results["data_recency"]["avg_profile_age_hours"]
        if avg_age_hours > 72:  # Older than 3 days
            issues.append(f"Data is {avg_age_hours/24:.1f} days old")
            recommendations.append("Update trader data with recent market activity")
        
        return {
            "overall_score": overall_score,
            "readiness_level": readiness_level,
            "readiness_color": readiness_color,
            "trading_ready": overall_score >= 70,
            "key_issues": issues,
            "recommendations": recommendations,
            "summary_stats": {
                "trader_profiles": profile_count,
                "performance_metrics": self.validation_results["performance_metrics"]["total_metrics"],
                "transactions": self.validation_results["transaction_data"]["total_transactions"],
                "data_age_hours": avg_age_hours
            }
        }


async def main():
    """Run data quality validation"""
    validator = DataQualityValidator()
    
    try:
        result = await validator.validate_all()
        
        # Print summary report
        summary = result["summary"]
        print("\n" + "="*80)
        print("🔍 XORJ TRADING SYSTEM - DATA QUALITY VALIDATION REPORT")
        print("="*80)
        print(f"\n{summary['readiness_color']} OVERALL READINESS: {summary['readiness_level']} ({summary['overall_score']:.1f}/100)")
        print(f"📊 Trading Ready: {'✅ YES' if summary['trading_ready'] else '❌ NO'}")
        
        print(f"\n📈 SUMMARY STATISTICS:")
        stats = summary["summary_stats"]
        print(f"  • Trader Profiles: {stats['trader_profiles']}")
        print(f"  • Performance Metrics: {stats['performance_metrics']}")
        print(f"  • Historical Transactions: {stats['transactions']}")
        print(f"  • Data Age: {stats['data_age_hours']:.1f} hours")
        
        if summary["key_issues"]:
            print(f"\n⚠️ KEY ISSUES:")
            for issue in summary["key_issues"]:
                print(f"  • {issue}")
        
        if summary["recommendations"]:
            print(f"\n💡 RECOMMENDATIONS:")
            for rec in summary["recommendations"]:
                print(f"  • {rec}")
        
        print(f"\n📋 DETAILED SCORES:")
        for category, data in result["validation_results"].items():
            score = data.get("quality_score", 0)
            print(f"  • {category.replace('_', ' ').title()}: {score:.1f}/100")
        
        print("\n" + "="*80)
        
        return result
        
    except Exception as e:
        logger.error(f"Validation failed: {e}")
        import traceback
        traceback.print_exc()
        return None


if __name__ == "__main__":
    asyncio.run(main())