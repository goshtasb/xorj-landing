"""
XORJ Trade Execution Bot - FastAPI Service
Main web service for frontend integration
"""

import os
import sys
import asyncio
import logging
from datetime import datetime
from typing import Dict, List, Optional
from pathlib import Path

from fastapi import FastAPI, HTTPException, Depends, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel

# Add the app directory to Python path
sys.path.append(str(Path(__file__).parent / "app"))

from core.trade_execution_engine import TradeExecutionEngine
from core.audit_logger import AuditLogger
from core.circuit_breakers import CircuitBreakerManager
from core.idempotency import IdempotencyManager
from security.hsm_manager import HSMManager
from schemas.trade_schemas import GeneratedTrade, TradeExecutionRequest
from schemas.config_schemas import SystemConfiguration, BotConfiguration
from utils.health_monitor import HealthMonitor

# Initialize FastAPI app
app = FastAPI(
    title="XORJ Trade Execution Bot Service",
    description="Enterprise-grade Solana trading bot with AI-driven execution",
    version="1.0.0"
)

# Configure CORS for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Security
security = HTTPBearer()

# Global components
trade_engine: Optional[TradeExecutionEngine] = None
circuit_breaker_manager: Optional[CircuitBreakerManager] = None
audit_logger: Optional[AuditLogger] = None
health_monitor: Optional[HealthMonitor] = None

# Request/Response Models
class BotStatusResponse(BaseModel):
    user_id: str
    status: str
    last_execution: str
    health_score: float
    circuit_breakers: Dict
    kill_switch_active: bool
    configuration: Dict
    performance: Dict

class TradeHistoryResponse(BaseModel):
    user_id: str
    trades: List[Dict]
    pagination: Dict
    summary: Dict

class EmergencyActionRequest(BaseModel):
    action: str  # "kill_switch", "pause", "resume"
    user_id: str
    reason: Optional[str] = None
    authorization_key: Optional[str] = None

class EmergencyActionResponse(BaseModel):
    action: str
    status: str
    user_id: str
    timestamp: str
    message: str
    bot_status: str

class ConfigurationUpdateRequest(BaseModel):
    risk_profile: Optional[str] = None
    slippage_tolerance: Optional[float] = None
    enabled: Optional[bool] = None
    max_trade_amount: Optional[int] = None

# Dependency: Validate API Key
async def validate_api_key(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Validate API key for service authentication"""
    api_key = os.getenv("BOT_SERVICE_API_KEY", "development-key")
    
    if credentials.credentials != api_key:
        raise HTTPException(status_code=403, detail="Invalid API key")
    
    return credentials.credentials

# Initialize service components
@app.on_event("startup")
async def startup_event():
    """Initialize bot service components"""
    global trade_engine, circuit_breaker_manager, audit_logger, health_monitor
    
    logging.basicConfig(level=logging.INFO)
    logger = logging.getLogger(__name__)
    
    try:
        logger.info("🚀 Starting XORJ Trade Execution Bot Service...")
        
        # Initialize core components
        audit_logger = AuditLogger()
        await audit_logger.initialize()
        
        circuit_breaker_manager = CircuitBreakerManager()
        
        health_monitor = HealthMonitor()
        await health_monitor.initialize()
        
        # Initialize trade engine with dependencies
        trade_engine = TradeExecutionEngine(
            audit_logger=audit_logger,
            circuit_breaker_manager=circuit_breaker_manager
        )
        await trade_engine.initialize()
        
        logger.info("✅ XORJ Trade Execution Bot Service started successfully")
        
    except Exception as e:
        logger.error(f"❌ Failed to start bot service: {e}")
        raise

@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup service components"""
    global trade_engine, circuit_breaker_manager, audit_logger, health_monitor
    
    logging.getLogger(__name__).info("🛑 Shutting down XORJ Trade Execution Bot Service...")
    
    if trade_engine:
        await trade_engine.shutdown()
    
    if health_monitor:
        await health_monitor.shutdown()

# Health Check Endpoint
@app.get("/health")
async def health_check():
    """Service health check"""
    return {
        "status": "healthy",
        "version": "1.0.0",
        "timestamp": datetime.now().isoformat(),
        "service": "XORJ Trade Execution Bot"
    }

# Bot Status API
@app.get("/api/v1/bot/status/{user_id}", response_model=BotStatusResponse)
async def get_bot_status(
    user_id: str,
    api_key: str = Depends(validate_api_key)
):
    """Get comprehensive bot status for a user"""
    try:
        if not trade_engine:
            raise HTTPException(status_code=503, detail="Bot service not initialized")
        
        # Get current bot status
        status_data = await trade_engine.get_user_status(user_id)
        
        # Get circuit breaker states
        circuit_states = {}
        if circuit_breaker_manager:
            circuit_states = circuit_breaker_manager.get_all_states()
        
        # Get performance metrics
        performance = await audit_logger.get_performance_metrics(user_id) if audit_logger else {}
        
        # Get health score
        health_score = await health_monitor.get_health_score() if health_monitor else 95.0
        
        response = BotStatusResponse(
            user_id=user_id,
            status=status_data.get("status", "active"),
            last_execution=status_data.get("last_execution", datetime.now().isoformat()),
            health_score=health_score,
            circuit_breakers=circuit_states,
            kill_switch_active=status_data.get("kill_switch_active", False),
            configuration=status_data.get("configuration", {}),
            performance=performance
        )
        
        return response
        
    except Exception as e:
        logging.getLogger(__name__).error(f"Failed to get bot status: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Update Bot Configuration
@app.put("/api/v1/bot/configuration/{user_id}")
async def update_bot_configuration(
    user_id: str,
    config: ConfigurationUpdateRequest,
    api_key: str = Depends(validate_api_key)
):
    """Update bot configuration for a user"""
    try:
        if not trade_engine:
            raise HTTPException(status_code=503, detail="Bot service not initialized")
        
        # Convert to dict and filter None values
        config_dict = {k: v for k, v in config.dict().items() if v is not None}
        
        # Update configuration
        await trade_engine.update_user_configuration(user_id, config_dict)
        
        # Log the configuration update
        if audit_logger:
            await audit_logger.log_configuration_update(
                user_id=user_id,
                updates=config_dict,
                source="frontend_api"
            )
        
        return {
            "success": True,
            "message": "Configuration updated successfully",
            "updated_fields": list(config_dict.keys()),
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        logging.getLogger(__name__).error(f"Failed to update bot configuration: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Bot Trades History
@app.get("/api/v1/bot/trades/{user_id}", response_model=TradeHistoryResponse)
async def get_bot_trades(
    user_id: str,
    limit: int = 50,
    offset: int = 0,
    api_key: str = Depends(validate_api_key)
):
    """Get trade execution history for a user"""
    try:
        if not audit_logger:
            raise HTTPException(status_code=503, detail="Audit logger not available")
        
        # Get trade history from audit logs
        trades = await audit_logger.get_user_trade_history(user_id, limit, offset)
        
        # Get summary metrics
        summary = await audit_logger.get_performance_metrics(user_id)
        
        # Calculate pagination
        total_trades = summary.get("total_trades", 0)
        has_more = offset + limit < total_trades
        
        response = TradeHistoryResponse(
            user_id=user_id,
            trades=trades,
            pagination={
                "limit": limit,
                "offset": offset,
                "total": total_trades,
                "has_more": has_more
            },
            summary=summary
        )
        
        return response
        
    except Exception as e:
        logging.getLogger(__name__).error(f"Failed to get bot trades: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Emergency Actions
@app.post("/api/v1/bot/emergency", response_model=EmergencyActionResponse)
async def execute_emergency_action(
    action_request: EmergencyActionRequest,
    api_key: str = Depends(validate_api_key)
):
    """Execute emergency actions (pause, resume, kill switch)"""
    try:
        if not trade_engine:
            raise HTTPException(status_code=503, detail="Bot service not initialized")
        
        # Validate authorization for kill switch
        if action_request.action == "kill_switch" and not action_request.authorization_key:
            raise HTTPException(
                status_code=403, 
                detail="Authorization key required for kill switch activation"
            )
        
        # Execute the emergency action
        result = await trade_engine.execute_emergency_action(
            user_id=action_request.user_id,
            action=action_request.action,
            reason=action_request.reason or "user_requested",
            authorization_key=action_request.authorization_key
        )
        
        # Log the emergency action
        if audit_logger:
            await audit_logger.log_emergency_action(
                user_id=action_request.user_id,
                action=action_request.action,
                reason=action_request.reason,
                result=result
            )
        
        response = EmergencyActionResponse(
            action=action_request.action,
            status=result.get("status", "executed"),
            user_id=action_request.user_id,
            timestamp=datetime.now().isoformat(),
            message=result.get("message", "Emergency action executed successfully"),
            bot_status=result.get("bot_status", "stopped")
        )
        
        return response
        
    except Exception as e:
        logging.getLogger(__name__).error(f"Failed to execute emergency action: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Get Emergency Status
@app.get("/api/v1/bot/emergency/status/{user_id}")
async def get_emergency_status(
    user_id: str,
    api_key: str = Depends(validate_api_key)
):
    """Get current emergency/circuit breaker status"""
    try:
        if not circuit_breaker_manager:
            raise HTTPException(status_code=503, detail="Circuit breaker manager not available")
        
        # Get circuit breaker status
        circuit_states = circuit_breaker_manager.get_all_states()
        open_breakers = [name for name, state in circuit_states.items() if state.get("status") == "open"]
        
        # Get bot status
        bot_status = await trade_engine.get_user_status(user_id) if trade_engine else {}
        
        return {
            "user_id": user_id,
            "kill_switch_active": bot_status.get("kill_switch_active", False),
            "bot_status": bot_status.get("status", "unknown"),
            "circuit_breakers_status": {
                "any_open": len(open_breakers) > 0,
                "open_breakers": open_breakers
            },
            "last_emergency_action": bot_status.get("last_emergency_action"),
            "emergency_contacts": {
                "enabled": True,
                "email": "admin@xorj.io",
                "phone": "+1-XXX-XXX-XXXX"
            },
            "recovery_options": ["pause", "resume", "kill_switch"]
        }
        
    except Exception as e:
        logging.getLogger(__name__).error(f"Failed to get emergency status: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Start/Stop Bot for User
@app.post("/api/v1/bot/start/{user_id}")
async def start_bot(
    user_id: str,
    configuration: BotConfiguration,
    api_key: str = Depends(validate_api_key)
):
    """Start bot for a specific user"""
    try:
        if not trade_engine:
            raise HTTPException(status_code=503, detail="Bot service not initialized")
        
        # Start the bot with provided configuration
        result = await trade_engine.start_user_bot(user_id, configuration)
        
        return {
            "success": True,
            "message": f"Bot started successfully for user {user_id}",
            "status": result.get("status", "active"),
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        logging.getLogger(__name__).error(f"Failed to start bot: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/v1/bot/stop/{user_id}")
async def stop_bot(
    user_id: str,
    api_key: str = Depends(validate_api_key)
):
    """Stop bot for a specific user"""
    try:
        if not trade_engine:
            raise HTTPException(status_code=503, detail="Bot service not initialized")
        
        # Stop the bot
        result = await trade_engine.stop_user_bot(user_id)
        
        return {
            "success": True,
            "message": f"Bot stopped successfully for user {user_id}",
            "status": result.get("status", "stopped"),
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        logging.getLogger(__name__).error(f"Failed to stop bot: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    
    # Configure server
    host = os.getenv("BOT_SERVICE_HOST", "127.0.0.1")
    port = int(os.getenv("BOT_SERVICE_PORT", "8000"))
    
    print(f"🚀 Starting XORJ Trade Execution Bot Service on {host}:{port}")
    
    uvicorn.run(
        app,
        host=host,
        port=port,
        reload=False,  # Disable reload in production
        log_level="info"
    )