"""
XORJ Quantitative Engine - Main Application Entry Point
FastAPI application with health checks and basic API endpoints
"""

from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Dict, List, Optional
import uvicorn

from fastapi import FastAPI, HTTPException, Depends, BackgroundTasks, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from .core.config import get_settings
from .core.logging import get_api_logger, CorrelationContext
from .ingestion.worker import get_ingestion_worker, run_ingestion_for_wallets
from .ingestion.solana_client import get_helius_client, close_all_clients
from .calculation.service import get_calculation_service, close_calculation_service
from .scoring.service import get_scoring_service, close_scoring_service
from .worker import process_wallet_batch

settings = get_settings()
logger = get_api_logger()


# Pydantic models for API
class HealthResponse(BaseModel):
    """Health check response model"""
    healthy: bool
    timestamp: str
    version: str
    environment: str
    components: Dict[str, bool]
    details: Dict[str, any]


class IngestionRequest(BaseModel):
    """Request model for manual ingestion"""
    wallet_addresses: List[str]
    lookback_hours: Optional[int] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None


class IngestionResponse(BaseModel):
    """Response model for ingestion requests"""
    success: bool
    message: str
    task_id: Optional[str] = None
    processed_wallets: int
    results: Dict[str, any]


class CalculationRequest(BaseModel):
    """Request model for performance calculation"""
    wallet_addresses: List[str]
    end_date: Optional[str] = None  # ISO format datetime string


class PerformanceMetricsResponse(BaseModel):
    """Response model for performance metrics"""
    success: bool
    wallet_address: str
    metrics: Optional[Dict[str, any]] = None
    error: Optional[str] = None


class PortfolioSummaryResponse(BaseModel):
    """Response model for portfolio summary"""
    success: bool
    portfolio_summary: Optional[Dict[str, any]] = None
    error: Optional[str] = None


class TrustScoreRequest(BaseModel):
    """Request model for Trust Score calculation"""
    wallet_addresses: List[str]
    benchmark_wallets: Optional[List[str]] = None
    end_date: Optional[str] = None


class TrustScoreResponse(BaseModel):
    """Response model for single wallet Trust Score"""
    success: bool
    wallet_address: str
    trust_score: Optional[float] = None
    eligibility_status: Optional[str] = None
    eligibility_reason: Optional[str] = None
    score_breakdown: Optional[Dict[str, any]] = None
    error: Optional[str] = None


class BatchTrustScoreResponse(BaseModel):
    """Response model for batch Trust Score calculation"""
    success: bool
    results: Optional[Dict[str, Dict[str, any]]] = None
    summary: Optional[Dict[str, any]] = None
    error: Optional[str] = None


class LeaderboardRequest(BaseModel):
    """Request model for Trust Score leaderboard"""
    wallet_addresses: List[str]
    limit: Optional[int] = 100
    min_trust_score: Optional[float] = 0.0
    end_date: Optional[str] = None


class LeaderboardResponse(BaseModel):
    """Response model for Trust Score leaderboard"""
    success: bool
    leaderboard: Optional[Dict[str, any]] = None
    error: Optional[str] = None


class RankedTraderMetrics(BaseModel):
    """Individual trader metrics in ranked response"""
    net_roi_percent: float
    sharpe_ratio: float
    maximum_drawdown_percent: float
    total_trades: int
    win_loss_ratio: float
    total_volume_usd: float
    total_profit_usd: float


class RankedTrader(BaseModel):
    """Individual ranked trader entry"""
    rank: int
    wallet_address: str
    trust_score: float
    performance_breakdown: Dict[str, float]
    metrics: RankedTraderMetrics


class RankedTradersResponse(BaseModel):
    """Response model for GET /internal/ranked-traders endpoint"""
    status: str
    data: List[RankedTrader]
    meta: Dict[str, any]


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager"""
    # Startup
    logger.info(
        "Starting XORJ Quantitative Engine",
        version=settings.version,
        environment=settings.environment
    )
    
    # Initialize clients
    try:
        client = await get_helius_client()
        health = await client.get_health_status()
        logger.info("Solana client initialized", health=health)
    except Exception as e:
        logger.error("Failed to initialize Solana client", error=str(e))
    
    # Initialize calculation service
    try:
        calc_service = await get_calculation_service()
        logger.info("Calculation service initialized")
    except Exception as e:
        logger.error("Failed to initialize calculation service", error=str(e))
    
    # Initialize scoring service
    try:
        scoring_service = await get_scoring_service()
        logger.info("Scoring service initialized")
    except Exception as e:
        logger.error("Failed to initialize scoring service", error=str(e))
    
    yield
    
    # Shutdown
    logger.info("Shutting down XORJ Quantitative Engine")
    await close_all_clients()
    await close_calculation_service()
    await close_scoring_service()


# Create FastAPI app
app = FastAPI(
    title="XORJ Quantitative Engine",
    description="Backend analytical engine for XORJ trading platform",
    version=settings.version,
    docs_url="/docs" if settings.is_development else None,
    redoc_url="/redoc" if settings.is_development else None,
    lifespan=lifespan
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if settings.is_development else ["https://xorj.io"],
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


# Authentication dependency
async def verify_api_key(api_key: Optional[str] = None) -> bool:
    """Verify API key for internal endpoints"""
    if settings.is_development:
        return True
    
    if not api_key or api_key != settings.api_key:
        raise HTTPException(status_code=401, detail="Invalid API key")
    
    return True


async def verify_auth_token(authorization: Optional[str] = Header(None)) -> bool:
    """Verify authentication token from header for FR-4 endpoints"""
    if settings.is_development:
        return True
    
    if not authorization:
        raise HTTPException(
            status_code=401, 
            detail="Authorization header required"
        )
    
    # Expected format: "Bearer <token>" or just "<token>"
    token = authorization
    if authorization.startswith("Bearer "):
        token = authorization[7:]
    
    if not token or token != settings.api_key:
        raise HTTPException(
            status_code=401, 
            detail="Invalid authentication token"
        )
    
    return True


@app.get("/", include_in_schema=False)
async def root():
    """Root endpoint redirect"""
    return {"message": "XORJ Quantitative Engine", "docs": "/docs"}


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """
    Comprehensive health check endpoint
    Tests all critical system components
    """
    start_time = datetime.now(timezone.utc)
    
    with CorrelationContext(endpoint="health_check"):
        logger.info("Starting health check")
        
        components = {}
        details = {}
        overall_healthy = True
        
        # Test Solana client
        try:
            client = await get_helius_client()
            client_health = await client.get_health_status()
            components["solana_client"] = client_health["healthy"]
            details["solana"] = {
                "rpc_url": client_health["rpc_url"],
                "current_slot": client_health["current_slot"],
                "request_count": client_health["request_count"],
                "error_rate": client_health["error_rate"]
            }
            
            if not client_health["healthy"]:
                overall_healthy = False
                
        except Exception as e:
            logger.error("Solana client health check failed", error=str(e))
            components["solana_client"] = False
            details["solana"] = {"error": str(e)}
            overall_healthy = False
        
        # Test ingestion worker
        try:
            worker = get_ingestion_worker()
            stats = worker.get_statistics()
            components["ingestion_worker"] = True
            details["ingestion"] = stats
            
        except Exception as e:
            logger.error("Ingestion worker health check failed", error=str(e))
            components["ingestion_worker"] = False
            details["ingestion"] = {"error": str(e)}
            overall_healthy = False
        
        # Test calculation service
        try:
            calc_service = await get_calculation_service()
            calc_health = await calc_service.get_calculation_health()
            components["calculation_service"] = calc_health["calculation_service"] == "healthy"
            details["calculation"] = calc_health
            
            if calc_health["calculation_service"] != "healthy":
                overall_healthy = False
                
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
            
            if scoring_health["scoring_service"] != "healthy":
                overall_healthy = False
                
        except Exception as e:
            logger.error("Scoring service health check failed", error=str(e))
            components["scoring_service"] = False
            details["scoring"] = {"error": str(e)}
            overall_healthy = False
        
        # Test database connection (when implemented)
        components["database"] = True  # Placeholder
        details["database"] = {"status": "not_implemented"}
        
        # Calculate response time
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
                "settings": {
                    "max_concurrent_workers": settings.max_concurrent_workers,
                    "ingestion_schedule_hours": settings.ingestion_schedule_hours,
                    "supported_tokens": settings.supported_token_list,
                }
            }
        )
        
        status_code = 200 if overall_healthy else 503
        
        logger.info(
            "Health check completed",
            healthy=overall_healthy,
            response_time=response_time,
            components_healthy=sum(components.values()),
            components_total=len(components)
        )
        
        return JSONResponse(
            content=health_response.model_dump(),
            status_code=status_code
        )


@app.post("/ingestion/manual", response_model=IngestionResponse, dependencies=[Depends(verify_api_key)])
async def manual_ingestion(
    request: IngestionRequest,
    background_tasks: BackgroundTasks
):
    """
    Trigger manual data ingestion for specific wallets
    Requires API key authentication
    """
    with CorrelationContext(
        endpoint="manual_ingestion",
        wallet_count=len(request.wallet_addresses)
    ):
        logger.info(
            "Manual ingestion requested",
            wallet_count=len(request.wallet_addresses),
            lookback_hours=request.lookback_hours
        )
        
        try:
            # Validate request
            if not request.wallet_addresses:
                raise HTTPException(
                    status_code=400,
                    detail="At least one wallet address is required"
                )
            
            if len(request.wallet_addresses) > 100:
                raise HTTPException(
                    status_code=400,
                    detail="Maximum 100 wallet addresses per request"
                )
            
            # For immediate processing, run in background
            if settings.is_development:
                # In development, run directly
                results = await run_ingestion_for_wallets(
                    request.wallet_addresses,
                    request.lookback_hours
                )
                
                successful_wallets = sum(1 for status in results.values() if status.success)
                
                return IngestionResponse(
                    success=True,
                    message=f"Ingestion completed for {len(results)} wallets",
                    processed_wallets=len(results),
                    results={
                        "successful_wallets": successful_wallets,
                        "wallet_details": {
                            wallet: {
                                "success": status.success,
                                "swaps_extracted": status.valid_swaps_extracted,
                                "errors": len(status.errors)
                            }
                            for wallet, status in results.items()
                        }
                    }
                )
            
            else:
                # In production, queue as Celery task
                task = process_wallet_batch.delay(
                    request.wallet_addresses,
                    request.start_date,
                    request.end_date
                )
                
                return IngestionResponse(
                    success=True,
                    message="Ingestion task queued successfully",
                    task_id=task.id,
                    processed_wallets=0,
                    results={"status": "queued", "task_id": task.id}
                )
                
        except HTTPException:
            raise
        except Exception as e:
            logger.error(
                "Manual ingestion failed",
                error=str(e),
                error_type=type(e).__name__
            )
            
            raise HTTPException(
                status_code=500,
                detail=f"Ingestion failed: {str(e)}"
            )


@app.get("/stats")
async def get_statistics(authenticated: bool = Depends(verify_api_key)):
    """
    Get system statistics and metrics
    Requires API key authentication
    """
    with CorrelationContext(endpoint="statistics"):
        try:
            # Get worker statistics
            worker = get_ingestion_worker()
            worker_stats = worker.get_statistics()
            
            # Get client health
            client = await get_helius_client()
            client_health = await client.get_health_status()
            
            return {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "worker_statistics": worker_stats,
                "client_health": client_health,
                "system_info": {
                    "environment": settings.environment,
                    "version": settings.version,
                    "supported_tokens": settings.supported_token_list,
                    "configuration": {
                        "max_transactions_per_wallet": settings.max_transactions_per_wallet,
                        "ingestion_schedule_hours": settings.ingestion_schedule_hours,
                        "max_concurrent_workers": settings.max_concurrent_workers,
                    }
                }
            }
            
        except Exception as e:
            logger.error("Failed to get statistics", error=str(e))
            
            raise HTTPException(
                status_code=500,
                detail="Failed to retrieve statistics"
            )


@app.post("/calculation/performance", response_model=PerformanceMetricsResponse, dependencies=[Depends(verify_api_key)])
async def calculate_performance_metrics(request: CalculationRequest):
    """
    Calculate performance metrics for a single wallet
    Requires API key authentication
    """
    if len(request.wallet_addresses) != 1:
        raise HTTPException(
            status_code=400,
            detail="This endpoint accepts exactly one wallet address"
        )
    
    wallet_address = request.wallet_addresses[0]
    
    with CorrelationContext(endpoint="calculate_performance", wallet=wallet_address):
        logger.info("Performance calculation requested", wallet=wallet_address)
        
        try:
            # Parse end_date if provided
            end_date = None
            if request.end_date:
                try:
                    end_date = datetime.fromisoformat(request.end_date.replace('Z', '+00:00'))
                except ValueError:
                    raise HTTPException(
                        status_code=400,
                        detail="Invalid end_date format. Use ISO format: 2024-01-01T12:00:00Z"
                    )
            
            # For demonstration, we'll use mock data since we don't have database integration yet
            # In production, this would fetch actual trades from the database
            logger.warning(
                "Using mock data for performance calculation (database not implemented)",
                wallet=wallet_address
            )
            
            # Mock response for now
            return PerformanceMetricsResponse(
                success=False,
                wallet_address=wallet_address,
                error="Performance calculation requires database integration (not yet implemented)"
            )
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(
                "Performance calculation failed",
                wallet=wallet_address,
                error=str(e),
                error_type=type(e).__name__
            )
            
            return PerformanceMetricsResponse(
                success=False,
                wallet_address=wallet_address,
                error=f"Calculation failed: {str(e)}"
            )


@app.post("/calculation/portfolio", response_model=PortfolioSummaryResponse, dependencies=[Depends(verify_api_key)])
async def calculate_portfolio_summary(request: CalculationRequest):
    """
    Calculate portfolio summary for multiple wallets
    Requires API key authentication
    """
    with CorrelationContext(
        endpoint="calculate_portfolio", 
        wallet_count=len(request.wallet_addresses)
    ):
        logger.info(
            "Portfolio calculation requested",
            wallet_count=len(request.wallet_addresses)
        )
        
        try:
            # Validate request
            if not request.wallet_addresses:
                raise HTTPException(
                    status_code=400,
                    detail="At least one wallet address is required"
                )
            
            if len(request.wallet_addresses) > 50:
                raise HTTPException(
                    status_code=400,
                    detail="Maximum 50 wallet addresses per portfolio calculation"
                )
            
            # Parse end_date if provided
            end_date = None
            if request.end_date:
                try:
                    end_date = datetime.fromisoformat(request.end_date.replace('Z', '+00:00'))
                except ValueError:
                    raise HTTPException(
                        status_code=400,
                        detail="Invalid end_date format. Use ISO format: 2024-01-01T12:00:00Z"
                    )
            
            # For demonstration, return mock response since we don't have database integration yet
            logger.warning(
                "Using mock portfolio summary (database not implemented)",
                wallet_count=len(request.wallet_addresses)
            )
            
            return PortfolioSummaryResponse(
                success=False,
                error="Portfolio calculation requires database integration (not yet implemented)"
            )
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(
                "Portfolio calculation failed",
                wallet_count=len(request.wallet_addresses),
                error=str(e),
                error_type=type(e).__name__
            )
            
            return PortfolioSummaryResponse(
                success=False,
                error=f"Portfolio calculation failed: {str(e)}"
            )


@app.get("/calculation/health")
async def get_calculation_health():
    """Get calculation service health status"""
    with CorrelationContext(endpoint="calculation_health"):
        try:
            calc_service = await get_calculation_service()
            health = await calc_service.get_calculation_health()
            
            return {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "calculation_service": health
            }
            
        except Exception as e:
            logger.error("Failed to get calculation health", error=str(e))
            
            return JSONResponse(
                status_code=503,
                content={
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "calculation_service": {
                        "status": "error",
                        "error": str(e)
                    }
                }
            )


@app.post("/scoring/trust-score", response_model=TrustScoreResponse, dependencies=[Depends(verify_api_key)])
async def calculate_trust_score(request: TrustScoreRequest):
    """
    Calculate XORJ Trust Score for a single wallet
    Requires API key authentication
    """
    if len(request.wallet_addresses) != 1:
        raise HTTPException(
            status_code=400,
            detail="This endpoint accepts exactly one wallet address"
        )
    
    wallet_address = request.wallet_addresses[0]
    
    with CorrelationContext(endpoint="calculate_trust_score", wallet=wallet_address):
        logger.info("Trust Score calculation requested", wallet=wallet_address)
        
        try:
            # Parse end_date if provided
            end_date = None
            if request.end_date:
                try:
                    end_date = datetime.fromisoformat(request.end_date.replace('Z', '+00:00'))
                except ValueError:
                    raise HTTPException(
                        status_code=400,
                        detail="Invalid end_date format. Use ISO format: 2024-01-01T12:00:00Z"
                    )
            
            # For demonstration, we'll use mock response since we don't have database integration yet
            logger.warning(
                "Using mock Trust Score calculation (database not implemented)",
                wallet=wallet_address
            )
            
            # Mock response for now
            return TrustScoreResponse(
                success=False,
                wallet_address=wallet_address,
                error="Trust Score calculation requires database integration (not yet implemented)"
            )
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(
                "Trust Score calculation failed",
                wallet=wallet_address,
                error=str(e),
                error_type=type(e).__name__
            )
            
            return TrustScoreResponse(
                success=False,
                wallet_address=wallet_address,
                error=f"Trust Score calculation failed: {str(e)}"
            )


@app.post("/scoring/batch", response_model=BatchTrustScoreResponse, dependencies=[Depends(verify_api_key)])
async def calculate_batch_trust_scores(request: TrustScoreRequest):
    """
    Calculate XORJ Trust Scores for multiple wallets
    Requires API key authentication
    """
    with CorrelationContext(
        endpoint="calculate_batch_trust_scores",
        wallet_count=len(request.wallet_addresses)
    ):
        logger.info(
            "Batch Trust Score calculation requested",
            wallet_count=len(request.wallet_addresses)
        )
        
        try:
            # Validate request
            if not request.wallet_addresses:
                raise HTTPException(
                    status_code=400,
                    detail="At least one wallet address is required"
                )
            
            if len(request.wallet_addresses) > 50:
                raise HTTPException(
                    status_code=400,
                    detail="Maximum 50 wallet addresses per batch calculation"
                )
            
            # Parse end_date if provided
            end_date = None
            if request.end_date:
                try:
                    end_date = datetime.fromisoformat(request.end_date.replace('Z', '+00:00'))
                except ValueError:
                    raise HTTPException(
                        status_code=400,
                        detail="Invalid end_date format. Use ISO format: 2024-01-01T12:00:00Z"
                    )
            
            # For demonstration, return mock response since we don't have database integration yet
            logger.warning(
                "Using mock batch Trust Score calculation (database not implemented)",
                wallet_count=len(request.wallet_addresses)
            )
            
            return BatchTrustScoreResponse(
                success=False,
                error="Batch Trust Score calculation requires database integration (not yet implemented)"
            )
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(
                "Batch Trust Score calculation failed",
                wallet_count=len(request.wallet_addresses),
                error=str(e),
                error_type=type(e).__name__
            )
            
            return BatchTrustScoreResponse(
                success=False,
                error=f"Batch Trust Score calculation failed: {str(e)}"
            )


@app.post("/scoring/leaderboard", response_model=LeaderboardResponse, dependencies=[Depends(verify_api_key)])
async def get_trust_score_leaderboard(request: LeaderboardRequest):
    """
    Get XORJ Trust Score leaderboard with rankings
    Requires API key authentication
    """
    with CorrelationContext(
        endpoint="get_trust_score_leaderboard",
        wallet_count=len(request.wallet_addresses)
    ):
        logger.info(
            "Trust Score leaderboard requested",
            wallet_count=len(request.wallet_addresses),
            limit=request.limit,
            min_score=request.min_trust_score
        )
        
        try:
            # Validate request
            if not request.wallet_addresses:
                raise HTTPException(
                    status_code=400,
                    detail="At least one wallet address is required"
                )
            
            if len(request.wallet_addresses) > 500:
                raise HTTPException(
                    status_code=400,
                    detail="Maximum 500 wallet addresses for leaderboard generation"
                )
            
            if request.limit and (request.limit < 1 or request.limit > 500):
                raise HTTPException(
                    status_code=400,
                    detail="Limit must be between 1 and 500"
                )
            
            # Parse end_date if provided
            end_date = None
            if request.end_date:
                try:
                    end_date = datetime.fromisoformat(request.end_date.replace('Z', '+00:00'))
                except ValueError:
                    raise HTTPException(
                        status_code=400,
                        detail="Invalid end_date format. Use ISO format: 2024-01-01T12:00:00Z"
                    )
            
            # For demonstration, return mock response since we don't have database integration yet
            logger.warning(
                "Using mock Trust Score leaderboard (database not implemented)",
                wallet_count=len(request.wallet_addresses)
            )
            
            return LeaderboardResponse(
                success=False,
                error="Trust Score leaderboard requires database integration (not yet implemented)"
            )
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(
                "Trust Score leaderboard generation failed",
                wallet_count=len(request.wallet_addresses),
                error=str(e),
                error_type=type(e).__name__
            )
            
            return LeaderboardResponse(
                success=False,
                error=f"Trust Score leaderboard generation failed: {str(e)}"
            )


@app.get("/scoring/health")
async def get_scoring_health():
    """Get scoring service health status"""
    with CorrelationContext(endpoint="scoring_health"):
        try:
            scoring_service = await get_scoring_service()
            health = await scoring_service.get_scoring_health()
            
            return {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "scoring_service": health
            }
            
        except Exception as e:
            logger.error("Failed to get scoring health", error=str(e))
            
            return JSONResponse(
                status_code=503,
                content={
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "scoring_service": {
                        "status": "error",
                        "error": str(e)
                    }
                }
            )


@app.get("/internal/ranked-traders", response_model=RankedTradersResponse, dependencies=[Depends(verify_auth_token)])
async def get_ranked_traders(
    limit: Optional[int] = 100,
    min_trust_score: Optional[float] = 0.0
):
    """
    FR-4: API Module - GET /internal/ranked-traders
    Secure, internal REST API endpoint to expose ranked traders with Trust Scores
    Requires authentication token in Authorization header
    """
    with CorrelationContext(endpoint="ranked_traders"):
        logger.info(
            "Ranked traders request received",
            limit=limit,
            min_trust_score=min_trust_score
        )
        
        try:
            # For demonstration purposes, we'll use mock data since we don't have 
            # a populated database yet. In production, this would:
            # 1. Fetch wallet addresses from database
            # 2. Get their trading history
            # 3. Calculate Trust Scores via scoring service
            # 4. Return ranked results
            
            logger.warning(
                "Using mock ranked traders data (database not implemented)",
                limit=limit
            )
            
            # Mock data structure following the exact schema requirements
            mock_traders = [
                {
                    "rank": 1,
                    "wallet_address": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
                    "trust_score": 87.45,
                    "performance_breakdown": {
                        "performance_score": 0.6234,
                        "risk_penalty": 0.1489
                    },
                    "metrics": {
                        "net_roi_percent": 24.75,
                        "sharpe_ratio": 2.18,
                        "maximum_drawdown_percent": 6.25,
                        "total_trades": 142,
                        "win_loss_ratio": 3.45,
                        "total_volume_usd": 245000.0,
                        "total_profit_usd": 60637.5
                    }
                },
                {
                    "rank": 2,
                    "wallet_address": "DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK",
                    "trust_score": 76.92,
                    "performance_breakdown": {
                        "performance_score": 0.5545,
                        "risk_penalty": 0.2353
                    },
                    "metrics": {
                        "net_roi_percent": 18.30,
                        "sharpe_ratio": 1.67,
                        "maximum_drawdown_percent": 12.40,
                        "total_trades": 98,
                        "win_loss_ratio": 2.15,
                        "total_volume_usd": 156000.0,
                        "total_profit_usd": 28548.0
                    }
                },
                {
                    "rank": 3,
                    "wallet_address": "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
                    "trust_score": 65.33,
                    "performance_breakdown": {
                        "performance_score": 0.4892,
                        "risk_penalty": 0.1759
                    },
                    "metrics": {
                        "net_roi_percent": 15.80,
                        "sharpe_ratio": 1.42,
                        "maximum_drawdown_percent": 9.15,
                        "total_trades": 73,
                        "win_loss_ratio": 1.95,
                        "total_volume_usd": 89000.0,
                        "total_profit_usd": 14062.0
                    }
                }
            ]
            
            # Apply limit and filter by min_trust_score
            filtered_traders = [
                trader for trader in mock_traders 
                if trader["trust_score"] >= min_trust_score
            ]
            
            limited_traders = filtered_traders[:limit] if limit else filtered_traders
            
            # Convert to proper response format
            ranked_traders = []
            for trader_data in limited_traders:
                metrics = RankedTraderMetrics(**trader_data["metrics"])
                trader = RankedTrader(
                    rank=trader_data["rank"],
                    wallet_address=trader_data["wallet_address"],
                    trust_score=trader_data["trust_score"],
                    performance_breakdown=trader_data["performance_breakdown"],
                    metrics=metrics
                )
                ranked_traders.append(trader)
            
            # Generate metadata
            meta = {
                "total_traders": len(filtered_traders),
                "returned_count": len(limited_traders),
                "min_trust_score_applied": min_trust_score,
                "limit_applied": limit,
                "calculation_timestamp": datetime.now(timezone.utc).isoformat(),
                "algorithm_version": "1.0.0",
                "eligibility_criteria": {
                    "min_trading_days": 90,
                    "min_total_trades": 50,
                    "max_single_day_roi_spike": "50%"
                },
                "scoring_weights": {
                    "sharpe_weight": "40%",
                    "roi_weight": "25%",
                    "drawdown_penalty_weight": "35%"
                }
            }
            
            response = RankedTradersResponse(
                status="success",
                data=ranked_traders,
                meta=meta
            )
            
            logger.info(
                "Ranked traders response generated",
                returned_count=len(limited_traders),
                top_trust_score=limited_traders[0]["trust_score"] if limited_traders else 0
            )
            
            return response
            
        except Exception as e:
            logger.error(
                "Failed to generate ranked traders response",
                error=str(e),
                error_type=type(e).__name__
            )
            
            raise HTTPException(
                status_code=500,
                detail=f"Internal server error: {str(e)}"
            )


# Error handlers
@app.exception_handler(404)
async def not_found_handler(request, exc):
    """Handle 404 errors"""
    return JSONResponse(
        status_code=404,
        content={
            "error": "Not Found",
            "message": "The requested resource was not found",
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
    )


@app.exception_handler(500)
async def internal_error_handler(request, exc):
    """Handle 500 errors"""
    logger.error("Internal server error", error=str(exc))
    
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal Server Error",
            "message": "An internal error occurred",
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
    )


if __name__ == "__main__":
    # Run with uvicorn in development
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.is_development,
        log_level=settings.log_level.lower(),
        workers=1 if settings.is_development else settings.workers
    )