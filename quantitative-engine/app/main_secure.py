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

from fastapi import (FastAPI, HTTPException, Depends, Request, Header)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
import structlog

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


@asynccontextmanager
async def lifespan(app: FastAPI):
    """SR-2, SR-3, NFR-3: Secure application lifespan with audit logging and observability"""
    global settings, audit_logger, metrics_collector
    
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
async def verify_api_key(
    request: Request,
    authorization: Optional[str] = Header(None)
) -> None:
    """
    SR-4 & SR-5 Compliant: Secure API key verification using constant-time comparison.
    - No development mode bypass.
    - Uses secrets.compare_digest() to prevent timing attacks.
    - Comprehensive audit logging for all authentication attempts.
    """
    client_ip = request.client.host if request.client else "unknown"
    user_agent = request.headers.get("user-agent", "unknown")
    
    # FIX: Removed the development mode authentication bypass. Auth is now enforced everywhere.
    if not authorization or not authorization.startswith("Bearer "):
        await audit_logger.log_authentication_event(
            result="failure",
            reason="token_missing",
            details={"endpoint": str(request.url)},
            client_ip=client_ip,
            user_agent=user_agent
        )
        raise HTTPException(status_code=401, detail="Authorization header is required")

    token = authorization.split(" ")[1]
    
    # SR-4 FIX: Use constant-time comparison to prevent timing attacks.
    if not secrets.compare_digest(token, settings.api_key):
        await audit_logger.log_authentication_event(
            result="failure",
            reason="token_invalid",
            details={"endpoint": str(request.url)},
            client_ip=client_ip,
            user_agent=user_agent
        )
        raise HTTPException(status_code=401, detail="Invalid authentication token")

    # Success
    await audit_logger.log_authentication_event(
        result="success",
        reason="token_valid",
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