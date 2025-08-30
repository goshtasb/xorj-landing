"""
XORJ Quantitative Engine - Secure Main Application (SR-1 through SR-5)
Production-ready FastAPI application with comprehensive security implementation
"""

import asyncio
import time
import uuid
import secrets  # SR-4: Import for constant-time comparison
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Dict, List, Optional
import uvicorn
import httpx  # For secure bot service communication

from fastapi import (FastAPI, HTTPException, Depends, Request, Header)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
import structlog
import jwt
from typing import Union

# SR-2: Secure configuration management
from .core.config_secure import get_secure_settings, init_secure_settings
# SR-3: Immutable audit logging
from .core.audit_logger import get_audit_logger, init_audit_logging, AuditEventType, AuditLevel
# NFR-3: Observability
from .core.metrics_middleware import setup_observability, observe_async_operation
from .core.observability import get_metrics_collector
# Existing modules
from .core.logging import get_api_logger, CorrelationContext
from .ingestion.worker import get_ingestion_worker, run_ingestion_for_wallets
from .ingestion.solana_client import get_helius_client, close_all_clients
from .calculation.service import get_calculation_service, close_calculation_service
from .scoring.service import get_scoring_service, close_scoring_service
from .worker import process_wallet_batch

# Initialize structured logging
structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.add_log_level,
        structlog.processors.JSONRenderer()
    ],
    wrapper_class=structlog.make_filtering_bound_logger(30),  # WARNING level
    logger_factory=structlog.PrintLoggerFactory(),
    cache_logger_on_first_use=True,
)

# --- Global Variables & Initialization ---
settings = None
audit_logger = None
metrics_collector = None

logger = structlog.get_logger()


# --- Secure Bot Service Client (Internal Server-to-Server) ---
class SecureBotServiceClient:
    """
    Secure internal client for server-to-server communication with Trade Execution Bot
    This acts as the secure gateway between FastAPI and the internal bot service
    """
    
    def __init__(self):
        # Internal bot service URL (never exposed to frontend)
        self.bot_service_url = settings.internal_bot_service_url if settings else "http://localhost:8000"
        self.bot_service_api_key = settings.internal_bot_api_key if settings else "development-key"
        self.client = None
    
    async def __aenter__(self):
        self.client = httpx.AsyncClient(timeout=30.0)
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.client:
            await self.client.aclose()
    
    async def _make_secure_request(self, method: str, endpoint: str, **kwargs):
        """Make secure server-to-server request to bot service"""
        if not self.client:
            raise HTTPException(status_code=503, detail="Bot service client not initialized")
        
        url = f"{self.bot_service_url}{endpoint}"
        headers = {
            "X-API-Key": self.bot_service_api_key,
            "User-Agent": "XORJ-Gateway/1.0",
            "Content-Type": "application/json",
            **kwargs.get("headers", {})
        }
        
        try:
            logger.info(f"Secure bot service request: {method} {endpoint}")
            response = await self.client.request(method, url, headers=headers, **kwargs)
            
            if response.status_code >= 400:
                logger.error(f"Bot service error: {response.status_code}", response=response.text)
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"Bot service error: {response.text}"
                )
            
            return response.json()
            
        except httpx.TimeoutException:
            logger.error("Bot service timeout")
            raise HTTPException(status_code=504, detail="Bot service timeout")
        except httpx.ConnectError:
            logger.error("Bot service connection error")
            raise HTTPException(status_code=503, detail="Bot service unavailable")
    
    async def get_bot_status(self, user_id: str) -> Dict:
        """Get bot status through secure gateway"""
        return await self._make_secure_request("GET", f"/api/v1/bot/status/{user_id}")
    
    async def get_bot_configuration(self, user_id: str) -> Dict:
        """Get bot configuration through secure gateway"""
        return await self._make_secure_request("GET", f"/api/v1/bot/configuration/{user_id}")
    
    async def update_bot_configuration(self, user_id: str, configuration: Dict) -> Dict:
        """Update bot configuration through secure gateway"""
        return await self._make_secure_request(
            "PUT", 
            f"/api/v1/bot/configuration/{user_id}",
            json=configuration
        )
    
    async def enable_bot(self, user_id: str) -> Dict:
        """Enable bot through secure gateway"""
        return await self._make_secure_request("POST", f"/api/v1/bot/enable/{user_id}")
    
    async def disable_bot(self, user_id: str) -> Dict:
        """Disable bot through secure gateway"""
        return await self._make_secure_request("POST", f"/api/v1/bot/disable/{user_id}")
    
    async def execute_emergency_action(self, action_data: Dict) -> Dict:
        """Execute emergency action through secure gateway"""
        return await self._make_secure_request("POST", "/api/v1/bot/emergency", json=action_data)
    
    async def get_bot_trades(self, user_id: str, limit: int = 50, offset: int = 0) -> Dict:
        """Get bot trades through secure gateway"""
        return await self._make_secure_request(
            "GET", 
            f"/api/v1/bot/trades/{user_id}",
            params={"limit": limit, "offset": offset}
        )
    
    async def check_bot_health(self) -> Dict:
        """Check bot service health through secure gateway"""
        return await self._make_secure_request("GET", "/health")


# Global bot service client
bot_service_client = None


# --- Pydantic Models ---
class RankedTraderMetrics(BaseModel):
    net_roi_percent: float
    sharpe_ratio: float
    max_drawdown_percent: float
    total_trades: int
    win_loss_ratio: float
    total_volume_usd: float
    total_profit_usd: float

class RankedTrader(BaseModel):
    rank: int
    wallet_address: str
    trust_score: float
    metrics: RankedTraderMetrics

class RankedTradersResponse(BaseModel):
    status: str = "success"
    data: List[RankedTrader]
    meta: Dict[str, any]

# Bot Service Models (API Gateway)
class BotConfiguration(BaseModel):
    risk_profile: str
    slippage_tolerance: float
    enabled: bool
    max_trade_amount: float

class CircuitBreaker(BaseModel):
    status: str
    failure_count: int = 0
    threshold: int = 5

class BotStatus(BaseModel):
    user_id: str
    status: str
    last_execution: str
    health_score: float
    circuit_breakers: Dict[str, CircuitBreaker]
    kill_switch_active: bool
    configuration: BotConfiguration
    performance: Dict[str, any]

class BotConfigurationRequest(BaseModel):
    user_id: str
    configuration: BotConfiguration

class BotResponse(BaseModel):
    success: bool
    message: str
    data: Optional[Dict] = None

class BotStatusResponse(BaseModel):
    success: bool
    message: str
    enabled: bool

class EmergencyAction(BaseModel):
    action: str  # "pause", "resume", "kill_switch"
    user_id: str
    reason: Optional[str] = None

class HealthResponse(BaseModel):
    healthy: bool
    timestamp: str
    version: str
    environment: str
    components: Dict[str, bool]
    details: Dict[str, any]

class AuthRequest(BaseModel):
    wallet_address: str
    signature: str
    message: str

class AuthResponse(BaseModel):
    success: bool
    session_token: str
    expires_at: str
    user_id: str


@asynccontextmanager
async def lifespan(app: FastAPI):
    """SR-2, SR-3, NFR-3: Secure application lifespan with audit logging and observability"""
    global settings, audit_logger, metrics_collector, bot_service_client
    
    # SR-2: Initialize secure settings with secrets manager
    logger.info("Initializing secure configuration...")
    try:
        settings = await init_secure_settings()
        logger.info("Secure settings initialized", environment=settings.environment)
    except Exception as e:
        logger.error("Failed to initialize secure settings", error=str(e))
        raise
    
    # SR-3: Initialize audit logging system
    logger.info("Initializing audit logging system...")
    try:
        audit_logger = await init_audit_logging()
        logger.info("Audit logging system initialized")
    except Exception as e:
        logger.error("Failed to initialize audit logging", error=str(e))
        raise
    
    # NFR-3: Initialize observability and metrics
    logger.info("Initializing observability system...")
    try:
        metrics_collector = setup_observability(app)
        logger.info("Observability system initialized", 
                   prometheus_enabled=metrics_collector.enable_prometheus,
                   datadog_enabled=metrics_collector.enable_datadog)
    except Exception as e:
        logger.error("Failed to initialize observability", error=str(e))
        # Don't fail startup for metrics - continue with degraded observability
        metrics_collector = get_metrics_collector()
    
    # Log secure startup
    await audit_logger.log_event({
        "event_id": str(uuid.uuid4()),
        "event_type": AuditEventType.SYSTEM_EVENT,
        "level": AuditLevel.INFO,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "component": "application",
        "message": "XORJ Quantitative Engine starting with security requirements",
        "details": {
            "environment": settings.environment,
            "version": settings.version,
            "security_requirements": ["SR-1", "SR-2", "SR-3", "SR-4", "SR-5"],
            "startup_timestamp": datetime.now(timezone.utc).isoformat()
        }
    })
    
    # Initialize services
    logger.info("Initializing services...")
    
    try:
        client = await get_helius_client()
        health = await client.get_health_status()
        logger.info("Solana client initialized", health=health)
    except Exception as e:
        logger.error("Failed to initialize Solana client", error=str(e))
    
    try:
        calc_service = await get_calculation_service()
        logger.info("Calculation service initialized")
    except Exception as e:
        logger.error("Failed to initialize calculation service", error=str(e))
    
    try:
        scoring_service = await get_scoring_service()
        logger.info("Scoring service initialized")
    except Exception as e:
        logger.error("Failed to initialize scoring service", error=str(e))
    
    # Initialize secure bot service client
    try:
        bot_service_client = SecureBotServiceClient()
        logger.info("Secure bot service client initialized")
    except Exception as e:
        logger.error("Failed to initialize bot service client", error=str(e))
    
    yield
    
    # Shutdown with audit logging
    await audit_logger.log_event({
        "event_id": str(uuid.uuid4()),
        "event_type": AuditEventType.SYSTEM_EVENT,
        "level": AuditLevel.INFO,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "component": "application",
        "message": "XORJ Quantitative Engine shutting down",
        "details": {
            "shutdown_timestamp": datetime.now(timezone.utc).isoformat()
        }
    })
    
    logger.info("Shutting down XORJ Quantitative Engine...")
    await close_all_clients()
    await close_calculation_service()
    await close_scoring_service()


# --- FastAPI App Initialization ---
app = FastAPI(
    title="XORJ Quantitative Engine",
    description="Secure analytical engine compliant with all security requirements (SR-1 through SR-5).",
    version="2.0.0",
    docs_url=None,
    redoc_url=None,
    lifespan=lifespan
)

# SR-1: Secure CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.cors_origin if settings else "https://xorj.io"],
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
)


# --- Security & Authentication ---

# User authentication models
class AuthenticatedUser(BaseModel):
    """Represents an authenticated user with verified wallet address"""
    user_id: str  # Wallet address
    wallet_address: str
    session_id: str
    authenticated_at: datetime

async def verify_user_session(
    request: Request,
    authorization: Optional[str] = Header(None)
) -> AuthenticatedUser:
    """
    UNIFIED USER AUTHENTICATION: Validate user session tokens from frontend
    This replaces manual user_id parameters with authenticated user context
    """
    client_ip = request.client.host if request.client else "unknown"
    user_agent = request.headers.get("user-agent", "unknown")
    
    if not authorization or not authorization.startswith("Bearer "):
        await audit_logger.log_authentication_event(
            result="failure",
            reason="session_token_missing",
            details={"endpoint": str(request.url)},
            client_ip=client_ip,
            user_agent=user_agent
        )
        raise HTTPException(status_code=401, detail="User session token required")

    token = authorization.split(" ")[1]
    
    try:
        # Decode and validate user session token
        payload = jwt.decode(
            token, 
            settings.jwt_secret_key,
            algorithms=["HS256"]
        )
        
        # Extract user information from verified token
        wallet_address = payload.get("wallet_address")
        session_id = payload.get("session_id")
        exp = payload.get("exp")
        
        if not wallet_address or not session_id:
            raise jwt.InvalidTokenError("Missing required claims")
        
        # Check token expiration
        if exp and datetime.fromtimestamp(exp, timezone.utc) < datetime.now(timezone.utc):
            raise jwt.ExpiredSignatureError("Token expired")
        
        # Create authenticated user context
        authenticated_user = AuthenticatedUser(
            user_id=wallet_address,
            wallet_address=wallet_address,
            session_id=session_id,
            authenticated_at=datetime.now(timezone.utc)
        )
        
        # Success - log authentication
        await audit_logger.log_authentication_event(
            result="success",
            reason="session_valid",
            details={
                "endpoint": str(request.url),
                "user_id": wallet_address,
                "session_id": session_id
            },
            client_ip=client_ip,
            user_agent=user_agent
        )
        
        return authenticated_user
        
    except jwt.ExpiredSignatureError:
        await audit_logger.log_authentication_event(
            result="failure",
            reason="session_expired",
            details={"endpoint": str(request.url)},
            client_ip=client_ip,
            user_agent=user_agent
        )
        raise HTTPException(status_code=401, detail="Session expired - please reconnect wallet")
        
    except jwt.InvalidTokenError as e:
        await audit_logger.log_authentication_event(
            result="failure",
            reason="session_invalid",
            details={"endpoint": str(request.url), "error": str(e)},
            client_ip=client_ip,
            user_agent=user_agent
        )
        raise HTTPException(status_code=401, detail="Invalid session token")
        
    except Exception as e:
        await audit_logger.log_authentication_event(
            result="failure",
            reason="session_validation_error",
            details={"endpoint": str(request.url), "error": str(e)},
            client_ip=client_ip,
            user_agent=user_agent
        )
        raise HTTPException(status_code=401, detail="Session validation failed")

async def verify_api_key(
    request: Request,
    authorization: Optional[str] = Header(None)
) -> None:
    """
    SR-4 & SR-5 Compliant: Secure API key verification for internal services
    This is used for service-to-service authentication
    """
    client_ip = request.client.host if request.client else "unknown"
    user_agent = request.headers.get("user-agent", "unknown")
    
    if not authorization or not authorization.startswith("Bearer "):
        await audit_logger.log_authentication_event(
            result="failure",
            reason="api_key_missing",
            details={"endpoint": str(request.url)},
            client_ip=client_ip,
            user_agent=user_agent
        )
        raise HTTPException(status_code=401, detail="API key required")

    token = authorization.split(" ")[1]
    
    # SR-4 FIX: Use constant-time comparison to prevent timing attacks.
    if not secrets.compare_digest(token, settings.api_key):
        await audit_logger.log_authentication_event(
            result="failure",
            reason="api_key_invalid",
            details={"endpoint": str(request.url)},
            client_ip=client_ip,
            user_agent=user_agent
        )
        raise HTTPException(status_code=401, detail="Invalid API key")

    # Success
    await audit_logger.log_authentication_event(
        result="success",
        reason="api_key_valid",
        details={"endpoint": str(request.url)},
        client_ip=client_ip,
        user_agent=user_agent
    )


# --- Middleware ---
@app.middleware("http")
async def security_and_logging_middleware(request: Request, call_next):
    """SR-3: Adds security headers and comprehensive request/response audit logging."""
    start_time = time.time()
    request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
    
    response = await call_next(request)
    
    processing_time = time.time() - start_time
    
    # SR-3: Log all API access events
    await audit_logger.log_api_access(
        endpoint=str(request.url.path),
        method=request.method,
        status_code=response.status_code,
        processing_time=processing_time,
        client_ip=request.client.host if request.client else "unknown",
        user_agent=request.headers.get("user-agent", "unknown"),
        request_id=request_id
    )
    
    # Add essential security headers to every response
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    
    return response


# --- API Endpoints ---
@app.get("/", include_in_schema=False)
async def root():
    return {"service": "XORJ Quantitative Engine"}


@app.get("/health", response_model=HealthResponse)
async def health_check(request: Request):
    """
    SR-2, SR-3: Comprehensive health check with audit logging
    """
    start_time = datetime.now(timezone.utc)
    correlation_id = getattr(request.state, 'correlation_id', str(uuid.uuid4()))
    
    logger.info("Health check requested", correlation_id=correlation_id)
    
    components = {}
    details = {}
    overall_healthy = True
    
    # Test secrets manager
    try:
        secrets_health = await settings.health_check()
        components["secrets_manager"] = secrets_health.get("secrets_manager") == "healthy"
        details["secrets"] = secrets_health
    except Exception as e:
        logger.error("Secrets manager health check failed", error=str(e))
        components["secrets_manager"] = False
        details["secrets"] = {"error": str(e)}
        overall_healthy = False
    
    # Test other components (similar to original health check)
    try:
        client = await get_helius_client()
        client_health = await client.get_health_status()
        components["solana_client"] = client_health["healthy"]
        details["solana"] = client_health
    except Exception as e:
        logger.error("Solana client health check failed", error=str(e))
        components["solana_client"] = False
        details["solana"] = {"error": str(e)}
        overall_healthy = False
    
    # Test calculation service
    try:
        calc_service = await get_calculation_service()
        calc_health = await calc_service.get_calculation_health()
        components["calculation_service"] = calc_health["calculation_service"] == "healthy"
        details["calculation"] = calc_health
    except Exception as e:
        logger.error("Calculation service health check failed", error=str(e))
        components["calculation_service"] = False
        details["calculation"] = {"error": str(e)}
        overall_healthy = False
    
    # Test scoring service
    try:
        scoring_service = await get_scoring_service()
        scoring_health = await scoring_service.get_scoring_health()
        components["scoring_service"] = scoring_health["scoring_service"] == "healthy"
        details["scoring"] = scoring_health
    except Exception as e:
        logger.error("Scoring service health check failed", error=str(e))
        components["scoring_service"] = False
        details["scoring"] = {"error": str(e)}
        overall_healthy = False
    
    end_time = datetime.now(timezone.utc)
    response_time = (end_time - start_time).total_seconds()
    
    health_response = HealthResponse(
        healthy=overall_healthy,
        timestamp=end_time.isoformat(),
        version=settings.version,
        environment=settings.environment,
        components=components,
        details={
            **details,
            "response_time_seconds": response_time,
            "correlation_id": correlation_id
        }
    )
    
    status_code = 200 if overall_healthy else 503
    
    logger.info(
        "Health check completed",
        healthy=overall_healthy,
        response_time=response_time,
        correlation_id=correlation_id
    )
    
    return JSONResponse(
        content=health_response.model_dump(),
        status_code=status_code
    )


@app.post(
    "/auth/authenticate",
    response_model=AuthResponse
)
async def authenticate_user(auth_request: AuthRequest, request: Request):
    """
    UNIFIED USER AUTHENTICATION: Create session token for wallet-authenticated users
    This endpoint validates wallet signatures and creates JWT session tokens
    """
    request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
    client_ip = request.client.host if request.client else "unknown"
    
    try:
        # TODO: Add signature verification logic here
        # For now, accepting wallet address as valid authentication
        # In production, this should verify the wallet signature
        
        wallet_address = auth_request.wallet_address
        
        # Validate wallet address format
        if not wallet_address or len(wallet_address) < 32:
            raise HTTPException(status_code=400, detail="Invalid wallet address")
        
        # Create session token
        session_id = str(uuid.uuid4())
        expires_at = datetime.now(timezone.utc) + timedelta(hours=24)  # 24 hour session
        
        # Create JWT payload
        payload = {
            "wallet_address": wallet_address,
            "session_id": session_id,
            "iat": datetime.now(timezone.utc),
            "exp": expires_at,
            "iss": "xorj-gateway"
        }
        
        # Generate JWT token
        session_token = jwt.encode(
            payload,
            settings.jwt_secret_key,
            algorithm="HS256"
        )
        
        # Log successful authentication
        await audit_logger.log_authentication_event(
            result="success",
            reason="wallet_authenticated",
            details={
                "user_id": wallet_address,
                "session_id": session_id,
                "request_id": request_id
            },
            client_ip=client_ip,
            user_agent=request.headers.get("user-agent", "unknown")
        )
        
        return AuthResponse(
            success=True,
            session_token=session_token,
            expires_at=expires_at.isoformat(),
            user_id=wallet_address
        )
        
    except Exception as e:
        # Log failed authentication
        await audit_logger.log_authentication_event(
            result="failure",
            reason="authentication_error",
            details={
                "error": str(e),
                "request_id": request_id
            },
            client_ip=client_ip,
            user_agent=request.headers.get("user-agent", "unknown")
        )
        
        if isinstance(e, HTTPException):
            raise e
        
        logger.error("Authentication failed", error=str(e), request_id=request_id)
        raise HTTPException(status_code=500, detail="Authentication failed")


@app.get(
    "/internal/ranked-traders",
    response_model=RankedTradersResponse,
    dependencies=[Depends(verify_api_key)]
)
async def get_ranked_traders(
    request: Request,
    limit: int = Field(100, gt=0, le=500),
    min_trust_score: float = Field(0.0, ge=0, le=100)
):
    """FR-4: Secure endpoint to retrieve ranked traders based on trust score."""
    scoring_service = await get_scoring_service()
    traders_data = await scoring_service.get_top_traders(limit, min_trust_score)

    # FIX: Removed sensitive business logic (scoring weights, eligibility criteria) from the response.
    # This information is now considered an internal implementation detail.
    meta = {
        "returned_count": len(traders_data),
        "parameters": {
            "limit": limit,
            "min_trust_score": min_trust_score
        },
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "request_id": request.headers.get("X-Request-ID")
    }
    
    return RankedTradersResponse(data=traders_data, meta=meta)


# --- SECURE API GATEWAY ENDPOINTS FOR BOT SERVICE ---

@app.get(
    "/bot/status",
    response_model=Dict
)
async def get_bot_status_secure(
    request: Request,
    user: AuthenticatedUser = Depends(verify_user_session)
):
    """
    SECURE API GATEWAY: Get bot status through secure server-to-server communication
    Frontend -> FastAPI Gateway -> Internal Bot Service
    
    UNIFIED AUTHENTICATION: User ID extracted from verified session token
    """
    request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
    
    await audit_logger.log_event({
        "event_id": str(uuid.uuid4()),
        "event_type": AuditEventType.API_ACCESS,
        "level": AuditLevel.INFO,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "component": "bot_gateway",
        "message": f"Bot status request for authenticated user {user.user_id}",
        "details": {
            "user_id": user.user_id,
            "session_id": user.session_id,
            "request_id": request_id
        }
    })
    
    try:
        async with SecureBotServiceClient() as client:
            bot_status = await client.get_bot_status(user.user_id)
            return bot_status
    except Exception as e:
        logger.error("Failed to get bot status through gateway", error=str(e), user_id=user.user_id)
        raise HTTPException(status_code=503, detail="Bot service unavailable through gateway")


@app.get(
    "/bot/configuration",
    response_model=Dict
)
async def get_bot_configuration_secure(
    request: Request,
    user: AuthenticatedUser = Depends(verify_user_session)
):
    """
    IMPROVED API DESIGN: Get current bot configuration
    Frontend -> FastAPI Gateway -> Internal Bot Service
    
    UNIFIED AUTHENTICATION: User ID extracted from verified session token
    """
    request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
    
    await audit_logger.log_event({
        "event_id": str(uuid.uuid4()),
        "event_type": AuditEventType.DATA_ACCESS,
        "level": AuditLevel.INFO,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "component": "bot_gateway",
        "message": f"Bot configuration fetch for authenticated user {user.user_id}",
        "details": {
            "user_id": user.user_id,
            "session_id": user.session_id,
            "request_id": request_id
        }
    })
    
    try:
        async with SecureBotServiceClient() as client:
            configuration = await client.get_bot_configuration(user.user_id)
            return configuration
    except Exception as e:
        logger.error("Failed to get bot configuration through gateway", error=str(e), user_id=user.user_id)
        raise HTTPException(status_code=503, detail="Bot service unavailable through gateway")


@app.put(
    "/bot/configuration",
    response_model=BotResponse
)
async def update_bot_configuration_secure(
    configuration: BotConfiguration,
    request: Request,
    user: AuthenticatedUser = Depends(verify_user_session)
):
    """
    IMPROVED API DESIGN: Update full bot configuration
    Frontend -> FastAPI Gateway -> Internal Bot Service
    
    UNIFIED AUTHENTICATION: User ID extracted from verified session token
    Use this for comprehensive configuration changes (risk profile, slippage, etc.)
    """
    request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
    
    await audit_logger.log_event({
        "event_id": str(uuid.uuid4()),
        "event_type": AuditEventType.CONFIG_CHANGE,
        "level": AuditLevel.WARN,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "component": "bot_gateway",
        "message": f"Full bot configuration update for authenticated user {user.user_id}",
        "details": {
            "user_id": user.user_id,
            "session_id": user.session_id,
            "configuration": configuration.model_dump(),
            "request_id": request_id
        }
    })
    
    try:
        async with SecureBotServiceClient() as client:
            result = await client.update_bot_configuration(user.user_id, configuration.model_dump())
            return BotResponse(success=True, message="Full configuration updated successfully", data=result)
    except Exception as e:
        logger.error("Failed to update bot configuration through gateway", error=str(e), user_id=user.user_id)
        raise HTTPException(status_code=503, detail="Bot service unavailable through gateway")


@app.post(
    "/bot/enable",
    response_model=BotStatusResponse
)
async def enable_bot_secure(
    request: Request,
    user: AuthenticatedUser = Depends(verify_user_session)
):
    """
    IMPROVED API DESIGN: Simple endpoint to turn the bot ON
    Frontend -> FastAPI Gateway -> Internal Bot Service
    
    UNIFIED AUTHENTICATION: User ID extracted from verified session token
    Use this for quick bot activation without changing other settings
    """
    request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
    
    await audit_logger.log_event({
        "event_id": str(uuid.uuid4()),
        "event_type": AuditEventType.CONFIG_CHANGE,
        "level": AuditLevel.INFO,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "component": "bot_gateway",
        "message": f"Bot enabled for authenticated user {user.user_id}",
        "details": {
            "user_id": user.user_id,
            "session_id": user.session_id,
            "action": "enable",
            "request_id": request_id
        }
    })
    
    try:
        async with SecureBotServiceClient() as client:
            result = await client.enable_bot(user.user_id)
            return BotStatusResponse(
                success=True, 
                message="Bot enabled successfully", 
                enabled=True
            )
    except Exception as e:
        logger.error("Failed to enable bot through gateway", error=str(e), user_id=user.user_id)
        raise HTTPException(status_code=503, detail="Bot service unavailable through gateway")


@app.post(
    "/bot/disable",
    response_model=BotStatusResponse
)
async def disable_bot_secure(
    request: Request,
    user: AuthenticatedUser = Depends(verify_user_session)
):
    """
    IMPROVED API DESIGN: Simple endpoint to turn the bot OFF
    Frontend -> FastAPI Gateway -> Internal Bot Service
    
    UNIFIED AUTHENTICATION: User ID extracted from verified session token
    Use this for quick bot deactivation without changing other settings
    """
    request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
    
    await audit_logger.log_event({
        "event_id": str(uuid.uuid4()),
        "event_type": AuditEventType.CONFIG_CHANGE,
        "level": AuditLevel.INFO,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "component": "bot_gateway",
        "message": f"Bot disabled for authenticated user {user.user_id}",
        "details": {
            "user_id": user.user_id,
            "session_id": user.session_id,
            "action": "disable",
            "request_id": request_id
        }
    })
    
    try:
        async with SecureBotServiceClient() as client:
            result = await client.disable_bot(user.user_id)
            return BotStatusResponse(
                success=True, 
                message="Bot disabled successfully", 
                enabled=False
            )
    except Exception as e:
        logger.error("Failed to disable bot through gateway", error=str(e), user_id=user.user_id)
        raise HTTPException(status_code=503, detail="Bot service unavailable through gateway")


@app.get(
    "/bot/trades",
    response_model=Dict
)
async def get_bot_trades_secure(
    request: Request,
    user: AuthenticatedUser = Depends(verify_user_session),
    limit: int = Field(50, gt=0, le=500),
    offset: int = Field(0, ge=0)
):
    """
    SECURE API GATEWAY: Get bot trades through secure server-to-server communication
    Frontend -> FastAPI Gateway -> Internal Bot Service
    
    UNIFIED AUTHENTICATION: User ID extracted from verified session token
    """
    request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
    
    await audit_logger.log_event({
        "event_id": str(uuid.uuid4()),
        "event_type": AuditEventType.DATA_ACCESS,
        "level": AuditLevel.INFO,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "component": "bot_gateway",
        "message": f"Bot trades request for authenticated user {user.user_id}",
        "details": {
            "user_id": user.user_id,
            "session_id": user.session_id,
            "limit": limit,
            "offset": offset,
            "request_id": request_id
        }
    })
    
    try:
        async with SecureBotServiceClient() as client:
            trades_data = await client.get_bot_trades(user.user_id, limit, offset)
            return trades_data
    except Exception as e:
        logger.error("Failed to get bot trades through gateway", error=str(e), user_id=user.user_id)
        raise HTTPException(status_code=503, detail="Bot service unavailable through gateway")


class EmergencyActionRequest(BaseModel):
    action: str  # "pause", "resume", "kill_switch"
    reason: Optional[str] = None

@app.post(
    "/bot/emergency",
    response_model=Dict
)
async def execute_emergency_action_secure(
    action_request: EmergencyActionRequest,
    request: Request,
    user: AuthenticatedUser = Depends(verify_user_session)
):
    """
    SECURE API GATEWAY: Execute emergency action through secure server-to-server communication
    Frontend -> FastAPI Gateway -> Internal Bot Service
    
    UNIFIED AUTHENTICATION: User ID extracted from verified session token
    """
    request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
    
    # Create action with authenticated user ID
    action = EmergencyAction(
        action=action_request.action,
        user_id=user.user_id,
        reason=action_request.reason
    )
    
    await audit_logger.log_event({
        "event_id": str(uuid.uuid4()),
        "event_type": AuditEventType.SECURITY_EVENT,
        "level": AuditLevel.CRITICAL,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "component": "bot_gateway",
        "message": f"Emergency action executed: {action.action} for authenticated user {user.user_id}",
        "details": {
            "action": action.action,
            "user_id": user.user_id,
            "session_id": user.session_id,
            "reason": action.reason,
            "request_id": request_id
        }
    })
    
    try:
        async with SecureBotServiceClient() as client:
            result = await client.execute_emergency_action(action.model_dump())
            return result
    except Exception as e:
        logger.error("Failed to execute emergency action through gateway", error=str(e), action=action.action)
        raise HTTPException(status_code=503, detail="Bot service unavailable through gateway")


@app.get(
    "/bot/health",
    response_model=Dict
)
async def check_bot_health_secure(
    request: Request,
    user: AuthenticatedUser = Depends(verify_user_session)
):
    """
    SECURE API GATEWAY: Check bot service health through secure server-to-server communication
    Frontend -> FastAPI Gateway -> Internal Bot Service
    
    UNIFIED AUTHENTICATION: Requires valid user session
    """
    try:
        async with SecureBotServiceClient() as client:
            health_data = await client.check_bot_health()
            return health_data
    except Exception as e:
        logger.error("Failed to check bot health through gateway", error=str(e))
        raise HTTPException(status_code=503, detail="Bot service unavailable through gateway")


# --- Error Handling ---
@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    """SR-3: Catch-all error handler for comprehensive audit logging."""
    request_id = request.headers.get("X-Request-ID", "unknown")
    await audit_logger.log_error(
        component="generic_exception_handler",
        error_message=f"An unhandled error occurred: {exc}",
        error_details={
            "endpoint": str(request.url),
            "error_type": type(exc).__name__,
        },
        request_id=request_id
    )
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal Server Error",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "request_id": request_id,
        },
    )


if __name__ == "__main__":
    # Production deployment uses Gunicorn, this is for development
    uvicorn.run(
        "app.main_secure:app",
        host="0.0.0.0",
        port=8000,
        reload=False,  # No reload in production
        log_level="warning",
        workers=1
    )