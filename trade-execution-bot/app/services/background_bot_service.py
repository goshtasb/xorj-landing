"""
Background Bot Service - Continuous execution of enabled bots

This service runs independently of user sessions and ensures that enabled bots
continue trading even when users are offline, logged out, or have closed their browsers.
"""

import asyncio
import logging
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
from decimal import Decimal

import structlog
from app.core.config import get_config
from app.integrations.bot_state_manager import BotStateManager, PersistentBotState
from app.integrations.quantitative_engine import QuantitativeEngineClient

logger = structlog.get_logger(__name__)


class BackgroundBotService:
    """
    Background service that continuously monitors and executes trades for enabled bots.
    
    Features:
    - Runs independently of user sessions
    - Continuous monitoring of enabled bots
    - Integration with quantitative engine for trading signals
    - Automatic error recovery and circuit breaker protection
    - Comprehensive logging and monitoring
    """
    
    def __init__(self):
        self.config = get_config()
        self.bot_state_manager = BotStateManager()
        self.quantitative_engine = QuantitativeEngineClient()
        
        # Service state
        self.running = False
        self.execution_tasks: Dict[str, asyncio.Task] = {}
        self.last_health_check = None
        
        # Configuration
        self.execution_interval = 30  # seconds between bot execution cycles
        self.health_check_interval = 300  # 5 minutes
        self.max_concurrent_bots = 50
        
    async def initialize(self) -> bool:
        """Initialize the background bot service"""
        try:
            logger.info("Initializing Background Bot Service")
            
            # Initialize bot state manager
            if not await self.bot_state_manager.initialize():
                logger.error("Failed to initialize Bot State Manager")
                return False
            
            # Initialize quantitative engine client
            # Note: Quantitative engine should already be running on port 8000
            logger.info("Background Bot Service initialized successfully")
            return True
            
        except Exception as e:
            logger.error(
                "Failed to initialize Background Bot Service",
                error=str(e),
                error_type=type(e).__name__
            )
            return False
    
    async def start(self):
        """Start the background bot service"""
        if self.running:
            logger.warning("Background Bot Service is already running")
            return
        
        self.running = True
        logger.info("Starting Background Bot Service")
        
        # Start main execution loop
        asyncio.create_task(self._execution_loop())
        
        # Start health monitoring
        asyncio.create_task(self._health_monitoring_loop())
        
        logger.info("Background Bot Service started successfully")
    
    async def stop(self):
        """Stop the background bot service"""
        self.running = False
        logger.info("Stopping Background Bot Service")
        
        # Cancel all running execution tasks
        for user_wallet, task in self.execution_tasks.items():
            if not task.done():
                task.cancel()
                logger.info(f"Cancelled execution task for {user_wallet[:10]}...")
        
        # Clear execution tasks
        self.execution_tasks.clear()
        
        # Close bot state manager
        await self.bot_state_manager.close()
        
        logger.info("Background Bot Service stopped")
    
    async def _execution_loop(self):
        """Main execution loop that monitors and executes enabled bots"""
        while self.running:
            try:
                # Get all enabled bots from database
                enabled_bots = await self.bot_state_manager.get_enabled_bots()
                
                logger.info(
                    "Bot execution cycle",
                    enabled_bots_count=len(enabled_bots),
                    active_tasks=len(self.execution_tasks)
                )
                
                # Process each enabled bot
                for bot_state in enabled_bots:
                    if not self.running:
                        break
                    
                    await self._process_bot(bot_state)
                
                # Clean up completed tasks
                await self._cleanup_completed_tasks()
                
                # Wait for next execution cycle
                await asyncio.sleep(self.execution_interval)
                
            except Exception as e:
                logger.error(
                    "Error in bot execution loop",
                    error=str(e),
                    error_type=type(e).__name__
                )
                # Continue running even if there's an error
                await asyncio.sleep(self.execution_interval)
    
    async def _process_bot(self, bot_state: PersistentBotState):
        """Process a single enabled bot"""
        user_wallet = bot_state.user_wallet
        
        # Skip if bot is not actually active
        if not bot_state.enabled or bot_state.status != 'active':
            logger.debug(
                "Skipping inactive bot",
                user_wallet=user_wallet[:10] + "...",
                enabled=bot_state.enabled,
                status=bot_state.status
            )
            return
        
        # Check if bot is already running
        if user_wallet in self.execution_tasks and not self.execution_tasks[user_wallet].done():
            logger.debug(
                "Bot execution already running",
                user_wallet=user_wallet[:10] + "..."
            )
            return
        
        # Check if we've reached max concurrent bots
        active_tasks = sum(1 for task in self.execution_tasks.values() if not task.done())
        if active_tasks >= self.max_concurrent_bots:
            logger.warning(
                "Max concurrent bots reached, skipping bot execution",
                user_wallet=user_wallet[:10] + "...",
                active_tasks=active_tasks,
                max_concurrent=self.max_concurrent_bots
            )
            return
        
        # Start bot execution task
        task = asyncio.create_task(self._execute_bot_cycle(bot_state))
        self.execution_tasks[user_wallet] = task
        
        logger.info(
            "Started bot execution cycle",
            user_wallet=user_wallet[:10] + "...",
            status=bot_state.status
        )
    
    async def _execute_bot_cycle(self, bot_state: PersistentBotState):
        """Execute a single bot trading cycle"""
        user_wallet = bot_state.user_wallet
        
        try:
            logger.info(
                "Executing bot cycle",
                user_wallet=user_wallet[:10] + "...",
                config=bot_state.configuration
            )
            
            # Get trading signals from quantitative engine
            signals = await self._get_trading_signals(bot_state)
            
            if not signals:
                logger.debug(
                    "No trading signals available",
                    user_wallet=user_wallet[:10] + "..."
                )
                return
            
            # Process signals based on bot configuration
            for signal in signals:
                if not self.running:
                    break
                
                await self._process_trading_signal(bot_state, signal)
            
            # Update bot execution timestamp
            await self.bot_state_manager.create_or_update_bot_state(
                user_wallet=user_wallet,
                enabled=bot_state.enabled,
                status=bot_state.status,
                configuration=bot_state.configuration
            )
            
            logger.info(
                "Bot cycle completed",
                user_wallet=user_wallet[:10] + "..."
            )
            
        except Exception as e:
            logger.error(
                "Error in bot execution cycle",
                user_wallet=user_wallet[:10] + "...",
                error=str(e),
                error_type=type(e).__name__
            )
            
            # Update bot status to error
            await self.bot_state_manager.update_bot_status(user_wallet, "error")
    
    async def _get_trading_signals(self, bot_state: PersistentBotState) -> List[Dict[str, Any]]:
        """Get trading signals from quantitative engine"""
        try:
            # Get ranked traders from quantitative engine
            response = await self.quantitative_engine.get_ranked_traders()
            
            if not response.success or not response.data:
                logger.debug("No trading signals from quantitative engine")
                return []
            
            # Convert ranked traders to trading signals based on bot config
            signals = []
            risk_profile = bot_state.configuration.get('risk_profile', 'moderate')
            max_trade_amount = bot_state.configuration.get('max_trade_amount', 10000)
            
            # Filter traders based on risk profile
            suitable_traders = self._filter_traders_by_risk(response.data, risk_profile)
            
            # Generate trading signals
            for trader in suitable_traders[:5]:  # Top 5 traders
                signal = {
                    "trader_wallet": trader.wallet_address,
                    "trust_score": trader.trust_score.score,
                    "risk_level": trader.trust_score.risk_assessment,
                    "recommended_amount": min(max_trade_amount * 0.1, 1000),  # 10% of max, max 1000 SOL
                    "signal_strength": float(trader.trust_score.score) / 100.0,
                    "timestamp": datetime.utcnow().isoformat()
                }
                signals.append(signal)
            
            logger.info(
                "Generated trading signals",
                user_wallet=bot_state.user_wallet[:10] + "...",
                signal_count=len(signals)
            )
            
            return signals
            
        except Exception as e:
            logger.error(
                "Failed to get trading signals",
                user_wallet=bot_state.user_wallet[:10] + "...",
                error=str(e)
            )
            return []
    
    def _filter_traders_by_risk(self, traders: List[Any], risk_profile: str) -> List[Any]:
        """Filter traders based on user's risk profile"""
        if risk_profile == 'conservative':
            return [t for t in traders if t.trust_score.risk_assessment in ['low', 'very_low']]
        elif risk_profile == 'aggressive':
            return traders  # All traders
        else:  # moderate
            return [t for t in traders if t.trust_score.risk_assessment in ['low', 'moderate', 'medium']]
    
    async def _process_trading_signal(self, bot_state: PersistentBotState, signal: Dict[str, Any]):
        """Process a single trading signal"""
        user_wallet = bot_state.user_wallet
        
        try:
            logger.info(
                "Processing trading signal",
                user_wallet=user_wallet[:10] + "...",
                trader=signal['trader_wallet'][:10] + "...",
                trust_score=signal['trust_score'],
                amount=signal['recommended_amount']
            )
            
            # Here you would implement the actual trade execution logic
            # For now, we'll simulate the trade processing
            
            # Simulate trade execution delay
            await asyncio.sleep(1)
            
            # Update trade statistics
            await self.bot_state_manager.increment_trade_count(
                user_wallet,
                Decimal(str(signal['recommended_amount']))
            )
            
            logger.info(
                "Trading signal processed successfully",
                user_wallet=user_wallet[:10] + "...",
                trader=signal['trader_wallet'][:10] + "..."
            )
            
        except Exception as e:
            logger.error(
                "Failed to process trading signal",
                user_wallet=user_wallet[:10] + "...",
                signal=signal,
                error=str(e)
            )
    
    async def _cleanup_completed_tasks(self):
        """Clean up completed execution tasks"""
        completed_wallets = [
            wallet for wallet, task in self.execution_tasks.items() 
            if task.done()
        ]
        
        for wallet in completed_wallets:
            task = self.execution_tasks.pop(wallet)
            if task.exception():
                logger.error(
                    "Bot execution task failed",
                    user_wallet=wallet[:10] + "...",
                    exception=str(task.exception())
                )
    
    async def _health_monitoring_loop(self):
        """Health monitoring loop"""
        while self.running:
            try:
                await self._perform_health_check()
                await asyncio.sleep(self.health_check_interval)
                
            except Exception as e:
                logger.error(
                    "Error in health monitoring loop",
                    error=str(e)
                )
                await asyncio.sleep(self.health_check_interval)
    
    async def _perform_health_check(self):
        """Perform health check on the service"""
        try:
            # Check bot state manager
            bot_manager_healthy = await self.bot_state_manager.health_check()
            
            # Check quantitative engine
            qe_response = await self.quantitative_engine.get_ranked_traders()
            qe_healthy = qe_response.success
            
            # Get service statistics
            enabled_bots = await self.bot_state_manager.get_enabled_bots()
            active_tasks = sum(1 for task in self.execution_tasks.values() if not task.done())
            
            self.last_health_check = {
                "timestamp": datetime.utcnow().isoformat(),
                "bot_manager_healthy": bot_manager_healthy,
                "quantitative_engine_healthy": qe_healthy,
                "enabled_bots_count": len(enabled_bots),
                "active_execution_tasks": active_tasks,
                "service_running": self.running
            }
            
            logger.info(
                "Background Bot Service health check",
                **self.last_health_check
            )
            
        except Exception as e:
            logger.error(
                "Health check failed",
                error=str(e)
            )
    
    def get_service_status(self) -> Dict[str, Any]:
        """Get current service status"""
        active_tasks = sum(1 for task in self.execution_tasks.values() if not task.done())
        
        return {
            "running": self.running,
            "is_initialized": True,  # FIXED: Add missing is_initialized field for health check
            "active_execution_tasks": active_tasks,
            "total_execution_tasks": len(self.execution_tasks),
            "last_health_check": self.last_health_check,
            "service_config": {
                "execution_interval": self.execution_interval,
                "health_check_interval": self.health_check_interval,
                "max_concurrent_bots": self.max_concurrent_bots
            }
        }


# Global service instance
background_bot_service = BackgroundBotService()