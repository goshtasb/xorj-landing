#!/usr/bin/env python3
"""
Quick Test Bot Service - Lightweight version for immediate testing
No heavy dependencies, focuses on API integration testing
"""

import json
import asyncio
from datetime import datetime
from typing import Dict, Any, Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

# Initialize FastAPI app
app = FastAPI(
    title="XORJ Test Bot Service",
    description="Lightweight test service for frontend integration",
    version="1.0.0-test"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mock user states
user_states: Dict[str, Dict[str, Any]] = {}

def get_user_state(user_id: str) -> Dict[str, Any]:
    """Get or create user state"""
    if user_id not in user_states:
        user_states[user_id] = {
            "status": "active",
            "kill_switch_active": False,
            "configuration": {
                "risk_profile": "balanced",
                "slippage_tolerance": 1.0,
                "enabled": True,
                "max_trade_amount": 10000
            },
            "last_emergency_action": None,
            "trades_executed": 147,
            "total_volume": 125000
        }
    return user_states[user_id]

@app.get("/health")
async def health_check():
    """Service health check"""
    return {
        "status": "healthy",
        "version": "1.0.0-test",
        "timestamp": datetime.now().isoformat(),
        "service": "XORJ Test Bot Service"
    }

@app.get("/api/v1/bot/status/{user_id}")
async def get_bot_status(user_id: str):
    """Get bot status"""
    state = get_user_state(user_id)
    
    return {
        "user_id": user_id,
        "status": state["status"],
        "last_execution": datetime.now().isoformat(),
        "health_score": 96.5,
        "circuit_breakers": {
            "price_deviation": {"status": "closed", "failure_count": 0, "threshold": 5},
            "liquidity": {"status": "closed", "failure_count": 0, "threshold": 3},
            "slippage": {"status": "closed", "failure_count": 0, "threshold": 10},
            "volume": {"status": "closed", "failure_count": 0, "threshold": 3},
            "network": {"status": "closed", "failure_count": 0, "threshold": 5},
            "api": {"status": "closed", "failure_count": 0, "threshold": 5},
            "execution_time": {"status": "closed", "failure_count": 0, "threshold": 3}
        },
        "kill_switch_active": state["kill_switch_active"],
        "configuration": state["configuration"],
        "performance": {
            "total_trades": state["trades_executed"],
            "successful_trades": state["trades_executed"] - 1,
            "success_rate": 99.3,
            "average_slippage": 0.08,
            "total_volume_usd": state["total_volume"]
        }
    }

@app.put("/api/v1/bot/configuration/{user_id}")
async def update_configuration(user_id: str, request_data: Dict[str, Any]):
    """Update bot configuration"""
    state = get_user_state(user_id)
    
    # Update configuration
    state["configuration"].update(request_data)
    
    return {
        "success": True,
        "message": "Configuration updated successfully",
        "updated_fields": list(request_data.keys()),
        "timestamp": datetime.now().isoformat()
    }

@app.get("/api/v1/bot/trades/{user_id}")
async def get_bot_trades(user_id: str, limit: int = 50, offset: int = 0):
    """Get trade history"""
    import random
    
    # Generate mock trades
    tokens = ['USDC', 'SOL', 'JUP', 'RAY', 'ORCA']
    trades = []
    
    for i in range(min(limit, 10)):
        from_token = random.choice(tokens)
        to_token = random.choice([t for t in tokens if t != from_token])
        
        trade = {
            "trade_id": f"real_trade_{user_id}_{i + offset}",
            "timestamp": datetime.now().isoformat(),
            "from_token": from_token,
            "to_token": to_token,
            "from_amount": round(random.uniform(100, 5000), 2),
            "to_amount": round(random.uniform(10, 50), 6),
            "status": "confirmed" if random.random() > 0.05 else "failed",
            "transaction_signature": f"real_sig_{random.randint(10000, 99999)}",
            "slippage_realized": round(random.uniform(0, 0.3), 3),
            "execution_time_ms": random.randint(800, 2500),
            "rationale": f"AI-driven rebalance: {from_token} → {to_token}",
            "risk_score": random.randint(15, 45)
        }
        trades.append(trade)
    
    return {
        "user_id": user_id,
        "trades": trades,
        "pagination": {
            "limit": limit,
            "offset": offset,
            "total": 147,
            "has_more": offset + limit < 147
        },
        "summary": {
            "total_trades": 147,
            "successful_trades": 146,
            "success_rate": 99.3,
            "average_slippage": 0.08,
            "total_volume_usd": 125000
        }
    }

@app.post("/api/v1/bot/emergency")
async def execute_emergency_action(action_data: Dict[str, Any]):
    """Execute emergency action"""
    user_id = action_data.get("user_id")
    action = action_data.get("action")
    authorization_key = action_data.get("authorization_key")
    
    if not user_id or not action:
        raise HTTPException(status_code=400, detail="user_id and action required")
    
    if action == "kill_switch" and not authorization_key:
        raise HTTPException(status_code=403, detail="Authorization key required for kill switch")
    
    state = get_user_state(user_id)
    
    if action == "kill_switch":
        state["status"] = "stopped"
        state["kill_switch_active"] = True
        message = "Kill switch activated via bot service"
        bot_status = "stopped"
    elif action == "pause":
        state["status"] = "paused"
        message = "Bot paused via bot service"
        bot_status = "paused"
    elif action == "resume":
        state["status"] = "active"
        state["kill_switch_active"] = False
        message = "Bot resumed via bot service"
        bot_status = "active"
    else:
        raise HTTPException(status_code=400, detail="Invalid action")
    
    result = {
        "action": action,
        "status": "executed",
        "user_id": user_id,
        "timestamp": datetime.now().isoformat(),
        "message": message,
        "bot_status": bot_status
    }
    
    state["last_emergency_action"] = result
    
    return result

@app.get("/api/v1/bot/emergency/status/{user_id}")
async def get_emergency_status(user_id: str):
    """Get emergency status"""
    state = get_user_state(user_id)
    
    return {
        "user_id": user_id,
        "kill_switch_active": state["kill_switch_active"],
        "bot_status": state["status"],
        "circuit_breakers_status": {
            "any_open": False,
            "open_breakers": []
        },
        "last_emergency_action": state["last_emergency_action"],
        "emergency_contacts": {
            "enabled": True,
            "email": "admin@xorj.io",
            "phone": "+1-XXX-XXX-XXXX"
        },
        "recovery_options": ["pause", "resume", "kill_switch"]
    }

if __name__ == "__main__":
    print("🚀 Starting XORJ Test Bot Service on http://localhost:8000")
    print("📊 Health check: http://localhost:8000/health")
    print("📖 API docs: http://localhost:8000/docs")
    
    uvicorn.run(
        app,
        host="127.0.0.1",
        port=8000,
        reload=False,
        log_level="info"
    )