#!/usr/bin/env python3
"""
Simple test server to verify authentication flow for BotControlsCard fix
"""

import json
import secrets
from datetime import datetime, timezone, timedelta
from typing import Optional
from fastapi import FastAPI, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import jwt

app = FastAPI(title="XORJ Test Auth Server")

# Enable CORS for localhost development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Simple in-memory JWT secret for testing
JWT_SECRET = secrets.token_urlsafe(32)

# Simple in-memory bot state tracker
bot_states = {}  # user_id -> {"enabled": bool, "last_updated": str}

class AuthRequest(BaseModel):
    wallet_address: str
    signature: str = "mock_signature"
    message: str = "XORJ Authentication"

class AuthResponse(BaseModel):
    success: bool
    session_token: str
    expires_at: str
    user_id: str

class AuthenticatedUser(BaseModel):
    user_id: str
    wallet_address: str

class BotStatus(BaseModel):
    user_id: str
    status: str = "active"
    last_execution: str
    configuration: dict = {
        "risk_profile": "balanced",
        "enabled": True
    }
    performance: dict = {
        "total_trades": 42,
        "success_rate": 95.5
    }

def create_session_token(wallet_address: str) -> str:
    """Create JWT session token"""
    payload = {
        "wallet_address": wallet_address,
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(hours=24)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")

async def verify_user_session(authorization: Optional[str] = Header(None)) -> AuthenticatedUser:
    """Verify JWT session token and extract user"""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid authorization header")
    
    token = authorization[7:]  # Remove "Bearer " prefix
    
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        wallet_address = payload.get("wallet_address")
        if not wallet_address:
            raise HTTPException(status_code=401, detail="Invalid token: missing wallet_address")
        
        return AuthenticatedUser(
            user_id=wallet_address,
            wallet_address=wallet_address
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.InvalidTokenError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")

@app.post("/auth/authenticate", response_model=AuthResponse)
async def authenticate(request: AuthRequest):
    """Authenticate user and return session token"""
    print(f"🔐 Authentication request for wallet: {request.wallet_address}")
    
    # Create session token
    session_token = create_session_token(request.wallet_address)
    expires_at = (datetime.now(timezone.utc) + timedelta(hours=24)).isoformat()
    
    response = AuthResponse(
        success=True,
        session_token=session_token,
        expires_at=expires_at,
        user_id=request.wallet_address
    )
    
    print(f"✅ Authentication successful for: {request.wallet_address}")
    return response

@app.get("/bot/status")
async def get_bot_status(user: AuthenticatedUser = Depends(verify_user_session)):
    """Get bot status for authenticated user"""
    print(f"📊 Bot status request for user: {user.user_id}")
    
    # Get current bot state for user (default to enabled)
    user_state = bot_states.get(user.user_id, {"enabled": True, "last_updated": datetime.now(timezone.utc).isoformat()})
    is_enabled = user_state.get("enabled", True)
    
    status = BotStatus(
        user_id=user.user_id,
        status="active" if is_enabled else "stopped",
        last_execution=user_state.get("last_updated", datetime.now(timezone.utc).isoformat()),
        configuration={
            "risk_profile": "balanced",
            "enabled": is_enabled
        },
        performance={
            "total_trades": 42,
            "success_rate": 95.5
        }
    )
    
    print(f"✅ Bot status returned for user: {user.user_id} (enabled: {is_enabled})")
    return status

@app.post("/bot/enable")
async def enable_bot(user: AuthenticatedUser = Depends(verify_user_session)):
    """Enable bot for authenticated user"""
    print(f"🟢 Bot enable request for user: {user.user_id}")
    
    # Update bot state to enabled
    bot_states[user.user_id] = {
        "enabled": True,
        "last_updated": datetime.now(timezone.utc).isoformat()
    }
    
    print(f"✅ Bot enabled for user: {user.user_id}")
    return {
        "success": True,
        "message": "Bot enabled successfully",
        "enabled": True
    }

@app.post("/bot/disable") 
async def disable_bot(user: AuthenticatedUser = Depends(verify_user_session)):
    """Disable bot for authenticated user"""
    print(f"🔴 Bot disable request for user: {user.user_id}")
    
    # Update bot state to disabled
    bot_states[user.user_id] = {
        "enabled": False,
        "last_updated": datetime.now(timezone.utc).isoformat()
    }
    
    print(f"✅ Bot disabled for user: {user.user_id}")
    return {
        "success": True,
        "message": "Bot disabled successfully", 
        "enabled": False
    }

@app.post("/bot/emergency")
async def emergency_action(request: dict, user: AuthenticatedUser = Depends(verify_user_session)):
    """Execute emergency action for authenticated user"""
    print(f"🚨 Emergency action request for user: {user.user_id}, action: {request.get('action')}")
    
    return {
        "success": True,
        "message": "Emergency action executed successfully",
        "action": request.get("action"),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "user_id": user.user_id
    }

@app.get("/bot/trades")
async def get_bot_trades(limit: int = 50, offset: int = 0, user: AuthenticatedUser = Depends(verify_user_session)):
    """Get bot trades for authenticated user"""
    print(f"📊 Bot trades request for user: {user.user_id}, limit: {limit}, offset: {offset}")
    
    # Mock trade data
    trades = []
    for i in range(min(limit, 10)):  # Return up to 10 mock trades
        trade = {
            "trade_id": f"trade_{i + offset}",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "from_token": "USDC",
            "to_token": "SOL",
            "amount": 1000 + (i * 100),
            "status": "confirmed",
            "transaction_signature": f"mock_signature_{i}",
            "slippage_realized": 0.05 + (i * 0.01)
        }
        trades.append(trade)
    
    result = {
        "trades": trades,
        "total_trades": 147,
        "pagination": {
            "limit": limit,
            "offset": offset,
            "has_more": (offset + limit) < 147
        }
    }
    
    print(f"✅ Bot trades returned for user: {user.user_id}")
    return result

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "version": "1.0.0",
        "timestamp": datetime.now(timezone.utc).isoformat()
    }

if __name__ == "__main__":
    import uvicorn
    print("🚀 Starting XORJ Test Auth Server on http://localhost:8000")
    print("🔐 JWT Secret: Generated")
    print("📋 Available endpoints:")
    print("  POST /auth/authenticate - Get session token")
    print("  GET /bot/status - Get bot status (authenticated)")
    print("  POST /bot/enable - Enable bot (authenticated)")
    print("  POST /bot/disable - Disable bot (authenticated)")
    print("  POST /bot/emergency - Emergency actions (authenticated)")
    print("  GET /health - Health check")
    
    uvicorn.run(app, host="0.0.0.0", port=8000)