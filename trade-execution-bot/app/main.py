"""
Main entry point for XORJ Trade Execution Bot.

This module provides the main application entry point with support for:
- Scheduled execution (FR-1: Fixed schedule polling)
- Manual execution (for testing and debugging)
- Health monitoring and status reporting
- Graceful shutdown handling

Usage:
    python -m app.main [--mode] [--config]
    
Modes:
    --scheduled: Run on fixed schedule (default, production mode)
    --once: Execute single cycle then exit (testing mode)
    --status: Show current status and statistics
"""

import asyncio
import argparse
import sys
from typing import Optional

import structlog
from app.core.config import get_config, validate_production_config
from app.core.scheduler import get_scheduler
from app.core.system_orchestrator import get_orchestrator


# Configure structured logging
structlog.configure(
    processors=[
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.UnicodeDecoder(),
        structlog.processors.JSONRenderer()
    ],
    context_class=dict,
    logger_factory=structlog.stdlib.LoggerFactory(),
    wrapper_class=structlog.stdlib.BoundLogger,
    cache_logger_on_first_use=True,
)

logger = structlog.get_logger(__name__)


async def run_scheduled_mode():
    """
    Run the bot in scheduled mode (production).
    
    This implements FR-1: Scheduled Polling & Strategy Ingestion
    with continuous execution on fixed schedule.
    """
    logger.info("Starting XORJ Trade Execution Bot in scheduled mode")
    
    scheduler = get_scheduler()
    
    try:
        # Initialize scheduler system
        if not await scheduler.initialize():
            logger.critical("Failed to initialize scheduler system")
            return False
        
        logger.info(
            "XORJ Trade Execution Bot initialized successfully",
            mode="scheduled",
            execution_interval_seconds=scheduler.execution_interval_seconds
        )
        
        # Start scheduled execution
        await scheduler.start()
        
        return True
        
    except KeyboardInterrupt:
        logger.info("Received keyboard interrupt - shutting down gracefully")
        await scheduler.shutdown()
        return True
        
    except Exception as e:
        logger.critical(
            "Critical error in scheduled mode",
            error=str(e),
            error_type=type(e).__name__
        )
        await scheduler.emergency_stop()
        return False


async def run_single_cycle():
    """
    Run a single execution cycle then exit (testing mode).
    
    This is useful for testing and debugging the FR-1 implementation
    without starting the full scheduler.
    """
    logger.info("Starting XORJ Trade Execution Bot in single-cycle mode")
    
    orchestrator = get_orchestrator()
    
    try:
        # Initialize orchestrator
        if not await orchestrator.initialize():
            logger.critical("Failed to initialize system orchestrator")
            return False
        
        logger.info("System orchestrator initialized - executing single cycle")
        
        # Execute single trading cycle
        cycle_result = await orchestrator.execute_trading_cycle()
        
        # Report results
        logger.info(
            "Single cycle execution completed",
            success_rate=cycle_result.success_rate,
            duration_seconds=cycle_result.duration_seconds,
            traders_retrieved=cycle_result.traders_retrieved,
            active_users=cycle_result.active_users_found,
            target_portfolios_created=cycle_result.target_portfolios_created,
            trades_executed=cycle_result.trades_executed,
            errors_count=len(cycle_result.errors),
            warnings_count=len(cycle_result.warnings)
        )
        
        # Print summary for human readability
        print("\n" + "="*50)
        print("XORJ TRADE EXECUTION BOT - SINGLE CYCLE SUMMARY")
        print("="*50)
        print(f"Duration: {cycle_result.duration_seconds:.2f} seconds")
        print(f"Success Rate: {cycle_result.success_rate:.1%}")
        print(f"Traders Retrieved: {cycle_result.traders_retrieved}")
        print(f"Active Users Found: {cycle_result.active_users_found}")
        print(f"Target Portfolios Created: {cycle_result.target_portfolios_created}")
        print(f"Trades Executed: {cycle_result.trades_executed}")
        print(f"Errors: {len(cycle_result.errors)}")
        print(f"Warnings: {len(cycle_result.warnings)}")
        
        if cycle_result.errors:
            print("\nERRORS:")
            for error in cycle_result.errors:
                print(f"  - {error}")
        
        if cycle_result.warnings:
            print("\nWARNINGS:")
            for warning in cycle_result.warnings:
                print(f"  - {warning}")
        
        print("="*50)
        
        # Shutdown
        await orchestrator.shutdown()
        
        return len(cycle_result.errors) == 0
        
    except Exception as e:
        logger.critical(
            "Critical error in single-cycle mode",
            error=str(e),
            error_type=type(e).__name__
        )
        await orchestrator.shutdown()
        return False


async def show_status():
    """Show current bot status and configuration."""
    config = get_config()
    
    print("\n" + "="*60)
    print("XORJ TRADE EXECUTION BOT - STATUS")
    print("="*60)
    
    # Configuration status
    print("CONFIGURATION:")
    print(f"  Environment: {config.environment}")
    print(f"  Execution Interval: {config.execution_interval_seconds} seconds")
    print(f"  Max Execution Time: {config.max_execution_time_seconds} seconds")
    print(f"  Quantitative Engine URL: {config.quantitative_engine_base_url}")
    print(f"  Solana Network: {config.solana_network}")
    
    # Production validation
    if config.is_production():
        try:
            validate_production_config()
            print("  Production Config: ✅ VALID")
        except Exception as e:
            print(f"  Production Config: ❌ INVALID - {str(e)}")
    
    # FR-1 Implementation Status
    print(f"\nFR-1: SCHEDULED POLLING & STRATEGY INGESTION:")
    print(f"  ✅ Fixed schedule execution ({config.execution_interval_seconds}s intervals)")
    print(f"  ✅ Quantitative Engine integration")
    print(f"  ✅ Risk profile threshold matching")
    print(f"  ✅ Target portfolio selection")
    print(f"  ✅ Comprehensive audit logging")
    
    # Trust Score Thresholds
    print(f"\nRISK PROFILE THRESHOLDS:")
    print(f"  Conservative: >95 trust score")
    print(f"  Moderate: >90 trust score") 
    print(f"  Aggressive: >85 trust score")
    
    # Try to get scheduler status if running
    try:
        from app.core.scheduler import get_scheduler
        scheduler = get_scheduler()
        status = scheduler.get_status()
        
        print(f"\nSCHEDULER STATUS:")
        print(f"  Running: {status['is_running']}")
        print(f"  Emergency Stop: {status['emergency_stop_active']}")
        print(f"  Next Run: {status['next_run_time']}")
        print(f"  Total Cycles: {status['statistics']['total_cycles_run']}")
        print(f"  Success Rate: {status['statistics']['success_rate']:.1f}%")
        print(f"  Healthy: {'✅' if status['statistics']['is_healthy'] else '❌'}")
        
    except Exception:
        print(f"\nSCHEDULER STATUS: Not running")
    
    print("="*60 + "\n")


def parse_arguments():
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(
        description="XORJ Trade Execution Bot - Secure, intelligent trade execution",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python -m app.main                    # Run in scheduled mode (production)
  python -m app.main --once            # Execute single cycle then exit  
  python -m app.main --status          # Show status and configuration
        """
    )
    
    parser.add_argument(
        "--once",
        action="store_true",
        help="Execute single cycle then exit (testing mode)"
    )
    
    parser.add_argument(
        "--status",
        action="store_true", 
        help="Show current status and configuration"
    )
    
    parser.add_argument(
        "--config",
        type=str,
        help="Path to configuration file (optional)"
    )
    
    return parser.parse_args()


async def main():
    """Main entry point for XORJ Trade Execution Bot."""
    args = parse_arguments()
    config = get_config()
    
    # Setup logging level
    logging_level = config.log_level
    
    logger.info(
        "XORJ Trade Execution Bot starting",
        version="1.0.0",
        environment=config.environment,
        log_level=logging_level
    )
    
    try:
        if args.status:
            # Show status and exit
            await show_status()
            return True
            
        elif args.once:
            # Run single cycle
            success = await run_single_cycle()
            return success
            
        else:
            # Run in scheduled mode (default, production)
            success = await run_scheduled_mode()
            return success
            
    except KeyboardInterrupt:
        logger.info("Received interrupt signal - shutting down")
        return True
        
    except Exception as e:
        logger.critical(
            "Unhandled error in main",
            error=str(e),
            error_type=type(e).__name__
        )
        return False


def cli_main():
    """CLI entry point."""
    try:
        success = asyncio.run(main())
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\nShutdown complete.")
        sys.exit(0)
    except Exception as e:
        print(f"Fatal error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    cli_main()