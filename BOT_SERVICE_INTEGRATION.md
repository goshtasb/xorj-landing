# XORJ Bot Service Integration Guide

## Overview
The XORJ Trade Execution Bot is now fully integrated with the frontend via a FastAPI service. This guide explains how to run both the Python bot service and the Next.js frontend together.

## 🚀 Quick Start

### Option 1: Automated Startup (Recommended)
```bash
./start-bot-service.sh
```

This script will:
- ✅ Check system requirements
- ✅ Install Python dependencies
- ✅ Install Node.js dependencies  
- ✅ Start the Python bot service on port 8000
- ✅ Start the Next.js frontend on port 3000
- ✅ Wait for both services to be ready
- ✅ Provide health check URLs

### Option 2: Manual Startup

#### 1. Start the Python Bot Service
```bash
cd trade-execution-bot
pip install -r requirements.txt
python fastapi_service.py
```

#### 2. Start the Frontend (in another terminal)
```bash
npm install
npm run dev
```

## 📋 Architecture

```
┌─────────────────────┐     ┌─────────────────────┐
│   Next.js Frontend  │────▶│  FastAPI Bot Service │
│   (Port 3000)       │     │   (Port 8000)        │
├─────────────────────┤     ├─────────────────────┤
│ • Bot Dashboard     │     │ • Trade Engine       │
│ • Wallet Connection │     │ • Circuit Breakers   │
│ • Emergency Controls│     │ • Audit Logging      │
│ • Real-time Updates │     │ • Health Monitor     │
└─────────────────────┘     └─────────────────────┘
```

## 🔌 API Integration

The frontend automatically connects to the Python bot service via:

### Service Endpoints
- **Health Check**: `GET http://localhost:8000/health`
- **Bot Status**: `GET http://localhost:8000/api/v1/bot/status/{user_id}`
- **Update Config**: `PUT http://localhost:8000/api/v1/bot/configuration/{user_id}`
- **Trade History**: `GET http://localhost:8000/api/v1/bot/trades/{user_id}`
- **Emergency Actions**: `POST http://localhost:8000/api/v1/bot/emergency`

### Authentication
- API Key: `development-key` (configurable via environment)
- Header: `Authorization: Bearer development-key`

## 🌐 Frontend Features

### Bot Dashboard (`/bot`)
- **Real-time Status**: Health score, success rate, circuit breakers
- **Configuration**: Risk profile, slippage tolerance, trading limits
- **Emergency Controls**: Pause, resume, kill switch with auth
- **Trade History**: Recent executions with detailed metrics
- **Performance Analytics**: Volume, success rate, average slippage

### Navigation
- Connect Solana wallet on landing page
- "Bot Dashboard" link appears when wallet connected
- Wallet-gated access to bot controls

## ⚙️ Configuration

### Environment Variables
```bash
# Bot Service
NEXT_PUBLIC_BOT_SERVICE_URL=http://localhost:8000
BOT_SERVICE_API_KEY=development-key
BOT_SERVICE_HOST=127.0.0.1
BOT_SERVICE_PORT=8000

# Frontend
FRONTEND_PORT=3000
```

### Bot Configuration Options
```json
{
  "risk_profile": "conservative|balanced|aggressive",
  "slippage_tolerance": 0.1-5.0,
  "enabled": true,
  "max_trade_amount": 100-100000,
  "trading_pairs": ["SOL/USDC", "JUP/SOL"]
}
```

## 🔒 Security Features

### Authentication & Authorization
- API key validation for all bot service requests
- Kill switch requires authorization key
- Wallet-gated frontend access

### Circuit Breakers
- **Trade Failure**: Monitors failed trade execution
- **Network**: Tracks Solana network connectivity
- **Volatility**: Detects extreme market conditions
- **HSM**: Hardware security module health
- **Slippage**: Excessive slippage protection
- **System Error**: General system health monitoring

### Emergency Controls
- **Pause**: Temporarily halt trading operations
- **Resume**: Restart paused operations
- **Kill Switch**: Immediate emergency stop with auth key

## 📊 Monitoring & Health

### Health Check
```bash
curl http://localhost:8000/health
```

### Service Status Indicators
- ✅ **Green**: Service healthy and operating normally
- ⚠️ **Yellow**: Warning conditions detected
- ❌ **Red**: Critical issues requiring attention

### Real-time Updates
- Frontend polls bot service every 30 seconds
- Emergency actions trigger immediate updates
- Circuit breaker status monitored continuously

## 🔄 Development vs Production

### Current State (Development)
- ✅ Frontend-backend integration complete
- ✅ API layer functional with fallback to mock data
- ✅ Bot dashboard fully operational
- ✅ Emergency controls active
- ✅ Health monitoring implemented
- ⚠️ Using mock trade data when bot service unavailable

### Production Ready Features
- Real Solana blockchain integration
- Live trade execution with audit trails
- HSM integration for secure key management
- Database persistence for trade history
- WebSocket connections for real-time updates
- Production monitoring and alerting

## 🛠️ Troubleshooting

### Common Issues

#### Port Already in Use
```bash
# Check what's using the port
lsof -i :8000
lsof -i :3000

# Kill process using port
kill -9 <PID>
```

#### Python Dependencies
```bash
# Ensure Python 3.11+
python3 --version

# Install dependencies
pip3 install -r trade-execution-bot/requirements.txt
```

#### Connection Errors
- Ensure both services are running
- Check firewall settings
- Verify environment variables are set correctly

### Log Files
- Bot Service: Console output with structured logging
- Frontend: Next.js console output
- Browser: Developer console for client-side issues

## 📱 Usage Instructions

1. **Start Services**: `./start-bot-service.sh`
2. **Open Frontend**: http://localhost:3000
3. **Connect Wallet**: Use Phantom or compatible Solana wallet
4. **Access Dashboard**: Click "Bot Dashboard" in navigation
5. **Configure Bot**: Set risk profile and trading limits
6. **Monitor Activity**: View real-time status and trade history
7. **Emergency Stop**: Use kill switch if needed

## 🎯 Next Steps

1. **Production Deployment**: Deploy to cloud infrastructure
2. **Real Trading**: Connect to live Solana markets
3. **Advanced Analytics**: Enhanced performance metrics
4. **Multi-User Support**: Scale to multiple concurrent users
5. **Mobile App**: React Native app for mobile access

---

🎉 **The XORJ Trade Execution Bot is now fully integrated and ready for use!**

For support, check the logs or review the API documentation at http://localhost:8000/docs when the service is running.