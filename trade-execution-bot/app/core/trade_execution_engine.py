"""
Trade Execution Engine - Main orchestrator for trade execution
Simplified version for FastAPI service integration
"""

import asyncio
import logging
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, List
from dataclasses import dataclass, asdict
import json

from schemas.trade_schemas import GeneratedTrade, TradeExecutionResult, TradeStatus
from schemas.config_schemas import BotConfiguration

@dataclass
class UserBotState:
    """State of a user's bot"""
    user_id: str
    status: str = "stopped"  # "active", "paused", "stopped", "error"
    configuration: Dict[str, Any] = None
    last_execution: datetime = None
    kill_switch_active: bool = False
    last_emergency_action: Optional[Dict[str, Any]] = None
    trades_executed: int = 0
    total_volume: float = 0.0
    
    def __post_init__(self):
        if self.configuration is None:
            self.configuration = {
                "risk_profile": "balanced",
                "slippage_tolerance": 1.0,
                "enabled": True,
                "max_trade_amount": 10000
            }
        if self.last_execution is None:
            self.last_execution = datetime.now()

class TradeExecutionEngine:
    """Main trade execution engine"""
    
    def __init__(self, audit_logger=None, circuit_breaker_manager=None):
        self.logger = logging.getLogger(__name__)
        self.audit_logger = audit_logger
        self.circuit_breaker_manager = circuit_breaker_manager
        
        # User bot states
        self.user_bots: Dict[str, UserBotState] = {}
        
        # Mock trade data for demonstration
        self.mock_trades: Dict[str, List[Dict[str, Any]]] = {}
        
        self.initialized = False
    
    async def initialize(self):
        """Initialize the trade execution engine"""
        self.logger.info("🚀 Initializing Trade Execution Engine")
        
        # Initialize components
        self.initialized = True
        
        self.logger.info("✅ Trade Execution Engine initialized")
    
    async def shutdown(self):
        """Shutdown the trade execution engine"""
        self.logger.info("🛑 Shutting down Trade Execution Engine")
        self.initialized = False
    
    async def get_user_status(self, user_id: str) -> Dict[str, Any]:
        """Get bot status for a user"""
        if user_id not in self.user_bots:
            # Create default bot state
            self.user_bots[user_id] = UserBotState(user_id=user_id)
        
        bot_state = self.user_bots[user_id]
        
        return {
            "status": bot_state.status,
            "last_execution": bot_state.last_execution.isoformat(),
            "kill_switch_active": bot_state.kill_switch_active,
            "configuration": bot_state.configuration,
            "last_emergency_action": bot_state.last_emergency_action,
            "trades_executed": bot_state.trades_executed,
            "total_volume": bot_state.total_volume
        }
    
    async def update_user_configuration(self, user_id: str, config_updates: Dict[str, Any]):
        """Update bot configuration for a user"""
        if user_id not in self.user_bots:
            self.user_bots[user_id] = UserBotState(user_id=user_id)
        
        bot_state = self.user_bots[user_id]
        bot_state.configuration.update(config_updates)
        
        self.logger.info(f"Updated configuration for user {user_id}: {config_updates}")
    
    async def start_user_bot(self, user_id: str, configuration: BotConfiguration) -> Dict[str, Any]:
        """Start bot for a user"""
        if user_id not in self.user_bots:
            self.user_bots[user_id] = UserBotState(user_id=user_id)
        
        bot_state = self.user_bots[user_id]
        bot_state.status = "active"
        bot_state.configuration.update(configuration.dict(exclude_unset=True))
        bot_state.kill_switch_active = False
        
        self.logger.info(f"Started bot for user {user_id}")
        
        return {"status": "active", "message": "Bot started successfully"}
    
    async def stop_user_bot(self, user_id: str) -> Dict[str, Any]:
        """Stop bot for a user"""
        if user_id not in self.user_bots:
            self.user_bots[user_id] = UserBotState(user_id=user_id)
        
        bot_state = self.user_bots[user_id]
        bot_state.status = "stopped"
        
        self.logger.info(f"Stopped bot for user {user_id}")
        
        return {"status": "stopped", "message": "Bot stopped successfully"}
    
    async def execute_emergency_action(self, user_id: str, action: str, reason: str, authorization_key: Optional[str] = None) -> Dict[str, Any]:
        """Execute emergency action"""
        if user_id not in self.user_bots:
            self.user_bots[user_id] = UserBotState(user_id=user_id)
        
        bot_state = self.user_bots[user_id]
        
        action_result = {
            "action": action,
            "user_id": user_id,
            "reason": reason,
            "timestamp": datetime.now().isoformat(),
            "success": True
        }
        
        if action == "kill_switch":
            if not authorization_key:
                return {
                    "success": False,
                    "message": "Authorization key required for kill switch",
                    "status": bot_state.status,
                    "bot_status": bot_state.status
                }
            
            bot_state.status = "stopped"
            bot_state.kill_switch_active = True
            action_result.update({
                "status": "activated",
                "message": "Kill switch activated successfully. All trading operations have been halted.",
                "bot_status": "stopped"
            })
            
        elif action == "pause":
            bot_state.status = "paused"
            action_result.update({
                "status": "paused",
                "message": "Bot paused successfully. Trading operations are temporarily halted.",
                "bot_status": "paused"
            })
            
        elif action == "resume":
            if bot_state.kill_switch_active:
                return {
                    "success": False,
                    "message": "Cannot resume: Kill switch is active",
                    "status": "kill_switch_active",
                    "bot_status": "stopped"
                }
            
            bot_state.status = "active"
            action_result.update({
                "status": "resumed",
                "message": "Bot resumed successfully. Trading operations are now active.",
                "bot_status": "active"
            })
        
        else:
            return {
                "success": False,
                "message": f"Unknown emergency action: {action}",
                "status": "error",
                "bot_status": bot_state.status
            }
        
        # Store the emergency action
        bot_state.last_emergency_action = action_result
        
        self.logger.info(f"Emergency action executed: {action} for user {user_id}")
        
        return action_result
    
    def _generate_mock_trades(self, user_id: str, count: int = 20) -> List[Dict[str, Any]]:
        """Generate mock trade data for development"""
        if user_id not in self.mock_trades:
            import random
            from datetime import timedelta
            
            tokens = ['USDC', 'SOL', 'JUP', 'RAY', 'ORCA', 'MSOL', 'BONK']
            statuses = ['confirmed', 'confirmed', 'confirmed', 'confirmed', 'failed']  # 80% success rate
            
            trades = []
            
            for i in range(count):
                from_token = random.choice(tokens)
                to_token = random.choice([t for t in tokens if t != from_token])
                
                from_amount = round(random.uniform(10, 5000), 2)
                to_amount = round(from_amount * random.uniform(0.95, 1.05), 6)
                status = random.choice(statuses)
                
                trade = {
                    "trade_id": f"trade_{user_id}_{datetime.now().timestamp()}_{i}",
                    "timestamp": (datetime.now() - timedelta(hours=i * 2)).isoformat(),
                    "from_token": from_token,
                    "to_token": to_token,
                    "from_amount": from_amount,
                    "to_amount": to_amount,
                    "status": status,
                    "transaction_signature": f"sig{random.randint(10000, 99999)}" if status == "confirmed" else None,
                    "slippage_realized": round(random.uniform(0, 0.5), 3),
                    "execution_time_ms": random.randint(500, 3000),
                    "rationale": f"Rebalancing portfolio: Swap {from_token} for {to_token} based on market analysis",
                    "risk_score": random.randint(10, 50),
                    "confidence_score": round(random.uniform(0.7, 0.95), 2)
                }
                
                trades.append(trade)
            
            self.mock_trades[user_id] = trades
        
        return self.mock_trades[user_id]
    
    async def get_user_trade_history(self, user_id: str, limit: int = 50, offset: int = 0) -> List[Dict[str, Any]]:
        """Get trade history for a user"""
        # For development, return mock data
        # In production, this would query the audit database
        
        if self.audit_logger:
            try:
                return await self.audit_logger.get_user_trade_history(user_id, limit, offset)
            except Exception as e:
                self.logger.warning(f"Failed to get trade history from audit logger: {e}")
        
        # Fallback to mock data
        mock_trades = self._generate_mock_trades(user_id)
        
        # Apply pagination
        start = offset
        end = offset + limit
        
        return mock_trades[start:end]
    
    async def get_performance_metrics(self, user_id: str) -> Dict[str, Any]:
        """Get performance metrics for a user"""
        if self.audit_logger:
            try:
                return await self.audit_logger.get_performance_metrics(user_id)
            except Exception as e:
                self.logger.warning(f"Failed to get performance metrics from audit logger: {e}")
        
        # Fallback to mock metrics
        trades = self._generate_mock_trades(user_id)
        successful_trades = [t for t in trades if t["status"] == "confirmed"]
        
        total_volume = sum(t["from_amount"] for t in trades)
        success_rate = (len(successful_trades) / len(trades)) * 100 if trades else 0
        avg_slippage = sum(t["slippage_realized"] for t in successful_trades) / len(successful_trades) if successful_trades else 0
        
        return {
            "total_trades": len(trades),
            "successful_trades": len(successful_trades),
            "success_rate": round(success_rate, 1),
            "average_slippage": round(avg_slippage, 3),
            "total_volume_usd": round(total_volume, 2)
        }