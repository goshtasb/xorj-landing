"""
XORJ On-Chain Data Ingestion Service
Microservice for fetching complete transaction history from Solana blockchain via Helius API
Version: 1.0
Author: Synapse - PRD Implementation

6. OUT OF SCOPE (Section 6 - PRD Implementation)
This service is explicitly designed NOT to do the following:

6.1 Transaction Filtering or Analysis
- Does NOT filter transactions by type (swap, transfer, etc.)
- Does NOT analyze transaction patterns or extract trading signals
- Does NOT calculate performance metrics or trading statistics
- Raw transaction data storage only - analysis handled by separate services

6.2 Real-time Data Streaming
- Does NOT provide WebSocket or SSE real-time transaction feeds
- Does NOT implement pub/sub for live transaction notifications
- Historical batch fetching only - real-time handled by separate services

6.3 Transaction Parsing or Interpretation
- Does NOT parse transaction instructions or decode program data
- Does NOT extract token amounts, prices, or swap details
- Does NOT identify specific DeFi protocols or transaction types
- Raw Helius API response storage only - parsing handled by analytics services

6.4 Data Transformation or Aggregation
- Does NOT transform raw transaction data into normalized formats
- Does NOT calculate wallet balances, PnL, or portfolio metrics
- Does NOT aggregate data across multiple wallets or time periods
- Pure data ingestion only - transformation handled by processing services

6.5 API Management Beyond Core Endpoints
- Does NOT provide GraphQL interfaces or complex query capabilities
- Does NOT implement custom filtering, sorting, or search endpoints
- Does NOT provide data export formats (CSV, JSON, etc.) beyond raw storage
- Two-endpoint design only (/fetch-transactions, /fetch-status) plus health check
"""

import uuid
import asyncio
import time
from datetime import datetime, timezone
from enum import Enum
from typing import Dict, Any, Optional

import uvicorn
from fastapi import FastAPI, HTTPException, BackgroundTasks, status
from pydantic import BaseModel, Field
import structlog

# Configure structured logging
logger = structlog.get_logger(__name__)

# Job status enumeration
class JobStatus(str, Enum):
    PENDING = "PENDING"
    RUNNING = "RUNNING" 
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"

# Request models
class FetchTransactionsRequest(BaseModel):
    """Request model for POST /fetch-transactions endpoint"""
    walletAddress: str = Field(..., description="Solana wallet address to fetch transaction history for")

# Response models
class FetchTransactionsResponse(BaseModel):
    """Response model for POST /fetch-transactions endpoint (202 Accepted)"""
    jobId: str = Field(..., description="UUID v4 generated job identifier")
    status: JobStatus = Field(..., description="Job status - will be PENDING for new jobs")
    message: str = Field(..., description="Human readable status message")

class FetchStatusResponse(BaseModel):
    """Response model for GET /fetch-status/:jobId endpoint"""
    jobId: str = Field(..., description="Job identifier")
    status: JobStatus = Field(..., description="Current job status")
    walletAddress: str = Field(..., description="Wallet address being processed")
    transactionsFound: int = Field(..., description="Number of transactions found (0 if still processing)")
    error: Optional[str] = Field(None, description="Error message if status is FAILED")

# In-memory job storage (will be replaced with database persistence later)
job_store: Dict[str, Dict[str, Any]] = {}

# FastAPI application initialization
app = FastAPI(
    title="XORJ On-Chain Data Ingestion Service",
    description="Microservice for fetching complete Solana transaction history",
    version="1.0.0"
)

# Import FR implementations
from helius_client import get_helius_client
from database import get_database_client

# Import SR implementations
from secrets_manager import get_secrets_manager
from validation import validate_wallet_address, ValidationError

# Import metrics collector for Section 7: Success Metrics
from metrics import get_metrics_collector

# Real background task with Helius integration (FR-1 through FR-4)
async def fetch_wallet_transactions(job_id: str, wallet_address: str):
    """
    Background task to fetch transaction history for a wallet
    Implements FR-1: Helius API Integration
    Implements FR-2: Comprehensive Pagination Handling
    Implements FR-3: Robust Rate Limit Handling
    Implements FR-4: Database Persistence
    Implements Section 7: Success Metrics
    """
    # Initialize metrics tracking (Section 7: Success Metrics)
    metrics_collector = get_metrics_collector()
    job_metrics = metrics_collector.start_job_timing(job_id, wallet_address)
    
    try:
        logger.info("Starting real transaction fetch job", 
                   job_id=job_id, 
                   wallet_address=wallet_address)
        
        # Update job status to RUNNING
        job_store[job_id]["status"] = JobStatus.RUNNING
        job_store[job_id]["started_at"] = datetime.now(timezone.utc).isoformat()
        
        # FR-1: Get Helius API client
        helius_client = await get_helius_client()
        
        # FR-1 & FR-2: Fetch complete transaction history with pagination
        logger.info("Fetching transaction history from Helius API",
                   job_id=job_id,
                   wallet_address=wallet_address[:10] + "...")
        
        # Track Helius API response time for metrics
        helius_start_time = time.time()
        transactions = await helius_client.get_transaction_history(wallet_address)
        helius_response_time = time.time() - helius_start_time
        
        logger.info("Transaction history fetched from Helius",
                   job_id=job_id,
                   transactions_found=len(transactions))
        
        # FR-4: Store raw transactions in database
        database_client = await get_database_client()
        
        # Track database write time for metrics
        db_start_time = time.time()
        stored_count = await database_client.store_raw_transactions(
            job_id, wallet_address, transactions
        )
        database_write_time = time.time() - db_start_time
        
        # Update job as completed
        job_store[job_id]["status"] = JobStatus.COMPLETED
        job_store[job_id]["transactions_found"] = stored_count
        job_store[job_id]["completed_at"] = datetime.now(timezone.utc).isoformat()
        job_store[job_id]["error"] = None
        
        # Record successful completion in metrics (Section 7: Success Metrics)
        metrics_collector.record_job_completion(
            job_id=job_id,
            transactions_fetched=len(transactions),
            api_calls_made=1,
            helius_response_time=helius_response_time,
            database_write_time=database_write_time
        )
        
        logger.info("Transaction fetch job completed successfully", 
                   job_id=job_id, 
                   wallet_address=wallet_address,
                   transactions_fetched=len(transactions),
                   transactions_stored=stored_count)
        
    except Exception as error:
        logger.error("Transaction fetch job failed", 
                    job_id=job_id, 
                    wallet_address=wallet_address, 
                    error=str(error),
                    error_type=type(error).__name__)
        
        # Record failure in metrics (Section 7: Success Metrics)
        metrics_collector.record_job_failure(job_id, str(error))
        
        # Update job as failed
        job_store[job_id]["status"] = JobStatus.FAILED
        job_store[job_id]["error"] = str(error)
        job_store[job_id]["failed_at"] = datetime.now(timezone.utc).isoformat()

@app.post("/fetch-transactions", response_model=FetchTransactionsResponse, status_code=status.HTTP_202_ACCEPTED)
async def initiate_transaction_fetch(
    request: FetchTransactionsRequest, 
    background_tasks: BackgroundTasks
) -> FetchTransactionsResponse:
    """
    Initiate Transaction Fetch Endpoint (3.1)
    SR-2: Input validation before processing
    SR-3: Comprehensive error handling
    
    Starts the process of fetching a wallet's transaction history.
    Returns 202 Accepted immediately with a job ID for status polling.
    Actual fetching runs asynchronously in the background.
    """
    # SR-2: Validate wallet address before processing
    try:
        validated_address = validate_wallet_address(request.walletAddress)
        logger.info("Wallet address validation successful", 
                   wallet_address=validated_address[:10] + "...")
    except ValidationError as e:
        logger.warning("Wallet address validation failed", 
                      provided_address=request.walletAddress[:20] + "..." if len(request.walletAddress) > 20 else request.walletAddress,
                      error=str(e))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid wallet address: {str(e)}"
        )
    except Exception as e:
        logger.error("Unexpected validation error", error=str(e), error_type=type(e).__name__)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal validation error"
        )
    
    # Generate UUID v4 job identifier
    job_id = str(uuid.uuid4())
    
    # Create job record with PENDING status
    job_record = {
        "job_id": job_id,
        "wallet_address": validated_address,
        "status": JobStatus.PENDING,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "transactions_found": 0,
        "error": None
    }
    
    # Store job record
    job_store[job_id] = job_record
    
    # Add background task for actual fetching
    background_tasks.add_task(fetch_wallet_transactions, job_id, validated_address)
    
    logger.info("Transaction fetch job created", 
               job_id=job_id, 
               wallet_address=validated_address)
    
    # Return 202 Accepted with job details
    return FetchTransactionsResponse(
        jobId=job_id,
        status=JobStatus.PENDING,
        message="Transaction history fetch initiated."
    )

@app.get("/fetch-status/{job_id}", response_model=FetchStatusResponse)
async def check_fetch_status(job_id: str) -> FetchStatusResponse:
    """
    Check Fetch Status Endpoint (3.2)
    
    Allows clients to poll for the result of a background transaction fetch job.
    Returns current status, progress, and results.
    """
    # Check if job exists
    if job_id not in job_store:
        logger.warning("Job status requested for non-existent job", job_id=job_id)
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Job {job_id} not found"
        )
    
    job = job_store[job_id]
    
    logger.debug("Job status requested", 
                job_id=job_id, 
                status=job["status"],
                wallet_address=job["wallet_address"])
    
    return FetchStatusResponse(
        jobId=job_id,
        status=job["status"],
        walletAddress=job["wallet_address"],
        transactionsFound=job.get("transactions_found", 0),
        error=job.get("error")
    )

# Health check endpoint
@app.get("/health")
async def health_check():
    """Health check endpoint for service monitoring"""
    return {
        "service": "XORJ On-Chain Data Ingestion Service",
        "status": "healthy",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "version": "1.0.0"
    }

# Metrics endpoint (Section 7: Success Metrics)
@app.get("/metrics")
async def get_metrics():
    """
    Section 7: Success Metrics Endpoint
    Returns comprehensive performance, reliability, and operational metrics
    
    Metrics include:
    - Performance: average processing time, throughput
    - Reliability: success/error rates
    - Operational: job counts, service uptime
    """
    metrics_collector = get_metrics_collector()
    return metrics_collector.get_comprehensive_metrics()

# Development server
if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8002,
        reload=True,
        log_level="info"
    )