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
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Depends, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel

# Add the app directory to Python path
sys.path.append(str(Path(__file__).parent / "app"))

from app.core.trade_execution_engine import TradeExecutionEngine
from app.core.scheduler import get_scheduler
from app.logging.audit_logger import ImmutableAuditLogger
from app.security.circuit_breakers import CircuitBreakerManager
from app.core.idempotency import IdempotencyManager
from app.security.hsm_manager import HSMManager
from app.schemas.trade_schemas import GeneratedTrade, TradeExecutionRequest
from app.schemas.config_schemas import SystemConfiguration, BotConfiguration
from app.utils.health_monitor import HealthMonitor
from app.services.background_bot_service import background_bot_service

# Global service variables
trade_engine = None
circuit_breaker_manager = None
audit_logger = None
health_monitor = None
scheduler_instance = None
scheduler_task = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage service startup and shutdown"""
    global trade_engine, circuit_breaker_manager, audit_logger, health_monitor, scheduler_instance, scheduler_task, background_service_initialized
    
    logging.basicConfig(level=logging.INFO)
    logger = logging.getLogger(__name__)
    
    try:
        # Startup logic
        logger.info("Trade Execution Bot: Service process starting...")
        
        logger.info("Trade Execution Bot: Loading configuration from environment...")
        api_key = os.getenv("BOT_SERVICE_API_KEY")
        if not api_key:
            raise Exception("BOT_SERVICE_API_KEY environment variable not configured")
        logger.info("Trade Execution Bot: Configuration loaded successfully.")
        
        logger.info("Trade Execution Bot: Initializing database connection pool...")
        try:
            audit_logger = ImmutableAuditLogger()
            await audit_logger.initialize()
            logger.info("Trade Execution Bot: Database connection successful.")
        except Exception as e:
            logger.error(f"Database connection failed: {e}")
            raise
        
        logger.info("Trade Execution Bot: Initializing Solana RPC client...")
        try:
            circuit_breaker_manager = CircuitBreakerManager()
            
            health_monitor = HealthMonitor()
            await health_monitor.initialize()
            
            trade_engine = TradeExecutionEngine(
                audit_logger=audit_logger,
                circuit_breaker_manager=circuit_breaker_manager
            )
            await trade_engine.initialize()
            logger.info("Trade Execution Bot: RPC client initialized successfully.")
        except Exception as e:
            logger.error(f"RPC client initialization failed: {e}")
            raise
        
        scheduler_instance = get_scheduler()
        await scheduler_instance.initialize()
        
        if await background_bot_service.initialize():
            await background_bot_service.start()
            background_service_initialized = True
            logger.info("🤖 Background Bot Service started - bots will persist across sessions")
        else:
            logger.error("Failed to initialize Background Bot Service")
            background_service_initialized = False
        
        logger.info("Trade Execution Bot: Startup complete. Awaiting requests...")
        logger.info("✅ XORJ Trade Execution Bot Service started successfully with persistent bot management")
        
        yield
        
    except Exception as e:
        logger.error(f"❌ Failed to start bot service: {e}")
        raise
    finally:
        # Shutdown logic
        logger.info("🛑 Shutting down XORJ Trade Execution Bot Service...")
        
        if background_service_initialized:
            await background_bot_service.stop()
            logger.info("🤖 Background Bot Service stopped")
        
        if scheduler_task and not scheduler_task.done():
            scheduler_task.cancel()
            try:
                await scheduler_task
            except asyncio.CancelledError:
                pass
        
        if scheduler_instance:
            await scheduler_instance.shutdown()
        
        if trade_engine:
            await trade_engine.shutdown()
        
        if health_monitor:
            await health_monitor.shutdown()
        
        logger.info("✅ XORJ Trade Execution Bot Service: Graceful shutdown completed")

# Initialize FastAPI app with lifespan
app = FastAPI(
    title="XORJ Trade Execution Bot Service",
    description="Enterprise-grade Solana trading bot with AI-driven execution",
    version="1.0.0",
    lifespan=lifespan
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
audit_logger: Optional[ImmutableAuditLogger] = None
health_monitor: Optional[HealthMonitor] = None
scheduler_instance = None
scheduler_task: Optional[asyncio.Task] = None
background_service_initialized = False

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
    api_key = os.getenv("BOT_SERVICE_API_KEY")
    
    if not api_key:
        raise HTTPException(status_code=500, detail="BOT_SERVICE_API_KEY environment variable not configured")
    
    if credentials.credentials != api_key:
        raise HTTPException(status_code=403, detail="Invalid API key")
    
    return credentials.credentials

# Deprecated event handlers removed - using lifespan context manager instead

# Health Check Endpoint
@app.get("/health")
async def health_check():
    """
    Robust health check endpoint for Trade Execution Bot
    
    Performs shallow checks of critical dependencies:
    - Database connection pool status
    - RPC client connectivity
    - Core service components initialization
    
    Returns:
    - 200 OK: All critical dependencies are healthy
    - 503 Service Unavailable: One or more dependencies are unhealthy
    """
    health_status = {
        "service": "XORJ Trade Execution Bot",
        "version": "1.0.0",
        "timestamp": datetime.now().isoformat(),
        "status": "healthy",
        "dependencies": {}
    }
    
    overall_healthy = True
    
    try:
        # Check database connection pool status
        try:
            from app.core.config import get_config
            config = get_config()
            
            # Test database connection via connection pool using connection URL
            import asyncpg
            async with asyncpg.create_pool(
                config.user_settings_database_url,
                min_size=1,
                max_size=2,
                command_timeout=5
            ) as pool:
                async with pool.acquire() as conn:
                    await conn.fetchval("SELECT 1")
            
            health_status["dependencies"]["database"] = {
                "status": "healthy",
                "message": "Connection pool operational"
            }
        except Exception as e:
            health_status["dependencies"]["database"] = {
                "status": "unhealthy",
                "message": f"Database connection failed: {str(e)}"
            }
            overall_healthy = False
        
        # Check trade engine initialization
        if trade_engine is not None:
            health_status["dependencies"]["trade_engine"] = {
                "status": "healthy",
                "message": "Trade engine initialized"
            }
        else:
            health_status["dependencies"]["trade_engine"] = {
                "status": "unhealthy",
                "message": "Trade engine not initialized"
            }
            overall_healthy = False
        
        # Check circuit breaker manager
        if circuit_breaker_manager is not None:
            health_status["dependencies"]["circuit_breaker"] = {
                "status": "healthy",
                "message": "Circuit breaker manager active"
            }
        else:
            health_status["dependencies"]["circuit_breaker"] = {
                "status": "unhealthy",
                "message": "Circuit breaker manager not initialized"
            }
            overall_healthy = False
        
        # Check audit logger
        if audit_logger is not None:
            health_status["dependencies"]["audit_logger"] = {
                "status": "healthy",
                "message": "Audit logger active"
            }
        else:
            health_status["dependencies"]["audit_logger"] = {
                "status": "unhealthy",
                "message": "Audit logger not initialized"
            }
            overall_healthy = False
        
        # Check background bot service
        try:
            service_status = background_bot_service.get_service_status()
            if service_status.get("is_initialized", False):
                health_status["dependencies"]["background_service"] = {
                    "status": "healthy",
                    "message": "Background bot service operational"
                }
            else:
                health_status["dependencies"]["background_service"] = {
                    "status": "degraded",
                    "message": "Background service not fully initialized"
                }
        except Exception as e:
            health_status["dependencies"]["background_service"] = {
                "status": "unhealthy",
                "message": f"Background service check failed: {str(e)}"
            }
            overall_healthy = False
        
        # Set overall status
        if overall_healthy:
            health_status["status"] = "healthy"
            return health_status
        else:
            health_status["status"] = "unhealthy"
            raise HTTPException(status_code=503, detail=health_status)
            
    except HTTPException:
        # Re-raise HTTP exceptions (like 503)
        raise
    except Exception as e:
        # Handle any unexpected errors
        health_status["status"] = "unhealthy"
        health_status["error"] = f"Health check failed: {str(e)}"
        raise HTTPException(status_code=503, detail=health_status)

@app.get("/api/v1/service/background-status")
async def get_background_service_status(api_key: str = Depends(validate_api_key)):
    """Get background bot service status"""
    try:
        service_status = background_bot_service.get_service_status()
        return {
            "background_service": service_status,
            "persistent_bot_management": background_service_initialized,
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        logging.getLogger(__name__).error(f"Failed to get background service status: {e}")
        raise HTTPException(status_code=500, detail=str(e))

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

# Get Bot Configuration  
@app.get("/api/v1/bot/configuration/{user_id}")
async def get_bot_configuration(
    user_id: str,
    api_key: str = Depends(validate_api_key)
):
    """Get current bot configuration for a user - PERMANENT SOLUTION: Supports bidirectional sync"""
    try:
        if not trade_engine:
            raise HTTPException(status_code=503, detail="Bot service not initialized")
            
        # Get current configuration from trade engine
        if user_id not in trade_engine.user_bots:
            # Return default configuration if user not found
            default_config = {
                "risk_profile": "moderate",
                "slippage_tolerance": 1.0,
                "enabled": True,
                "max_trade_amount": 10000,
                "_source": "default"
            }
            return {
                "success": True,
                "configuration": default_config,
                "user_id": user_id,
                "timestamp": datetime.now().isoformat()
            }
        
        bot_state = trade_engine.user_bots[user_id]
        current_config = bot_state.configuration.copy()
        current_config["_source"] = "bot_service"
        current_config["_last_updated"] = bot_state.last_execution.isoformat() if bot_state.last_execution else datetime.now().isoformat()
        
        logging.getLogger(__name__).info(f"PERMANENT SOLUTION: Retrieved bot configuration for user {user_id}")
        
        return {
            "success": True,
            "configuration": current_config,
            "user_id": user_id,
            "status": bot_state.status,
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        logging.getLogger(__name__).error(f"Failed to get bot configuration: {e}")
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
        
        # Convert to dict and filter None values (fix Pydantic deprecation)
        config_dict = {k: v for k, v in config.model_dump().items() if v is not None}
        
        # Update configuration
        await trade_engine.update_user_configuration(user_id, config_dict)
        
        # Log the configuration update with correct parameters
        if audit_logger:
            await audit_logger.log_configuration_update(
                user_id=user_id,
                wallet_address=user_id,  # Use user_id as wallet_address for now
                old_config={},  # We don't track old config yet
                new_config=config_dict,
                config_changes=list(config_dict.keys()),
                update_reason="Bot configuration update via API"
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

# Continuous Scheduler Management
@app.post("/api/v1/scheduler/start")
async def start_scheduler(api_key: str = Depends(validate_api_key)):
    """Start the continuous trading scheduler (5-minute XORJ logic cycles)"""
    global scheduler_instance, scheduler_task
    
    try:
        if not scheduler_instance:
            raise HTTPException(status_code=503, detail="Scheduler not initialized")
        
        if scheduler_task and not scheduler_task.done():
            return {
                "success": False,
                "message": "Scheduler is already running",
                "status": "running",
                "timestamp": datetime.now().isoformat()
            }
        
        # Start the scheduler in a background task
        scheduler_task = asyncio.create_task(scheduler_instance.start())
        
        return {
            "success": True,
            "message": "Continuous trading scheduler started successfully",
            "status": "running",
            "interval_seconds": scheduler_instance.execution_interval_seconds,
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        logging.getLogger(__name__).error(f"Failed to start scheduler: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/v1/scheduler/stop")
async def stop_scheduler(api_key: str = Depends(validate_api_key)):
    """Stop the continuous trading scheduler"""
    global scheduler_instance, scheduler_task
    
    try:
        if not scheduler_instance:
            raise HTTPException(status_code=503, detail="Scheduler not initialized")
        
        if scheduler_task and not scheduler_task.done():
            scheduler_task.cancel()
            try:
                await scheduler_task
            except asyncio.CancelledError:
                pass
        
        await scheduler_instance.shutdown()
        
        return {
            "success": True,
            "message": "Continuous trading scheduler stopped successfully",
            "status": "stopped",
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        logging.getLogger(__name__).error(f"Failed to stop scheduler: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/v1/scheduler/status")
async def get_scheduler_status(api_key: str = Depends(validate_api_key)):
    """Get continuous scheduler status and statistics"""
    global scheduler_instance, scheduler_task
    
    try:
        if not scheduler_instance:
            raise HTTPException(status_code=503, detail="Scheduler not initialized")
        
        status = scheduler_instance.get_status()
        
        # Add task status
        task_status = "stopped"
        if scheduler_task and not scheduler_task.done():
            if scheduler_task.cancelled():
                task_status = "cancelled"
            else:
                task_status = "running"
        elif scheduler_task and scheduler_task.done():
            if scheduler_task.exception():
                task_status = "error"
            else:
                task_status = "completed"
        
        status["task_status"] = task_status
        status["timestamp"] = datetime.now().isoformat()
        
        return status
        
    except Exception as e:
        logging.getLogger(__name__).error(f"Failed to get scheduler status: {e}")
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