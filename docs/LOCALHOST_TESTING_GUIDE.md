# 🏠 XORJ Localhost Testing Guide

**Purpose:** Production-identical testing environment running locally  
**Status:** Ready for final validation before production deployment  
**Last Updated:** August 20, 2025

---

## 🎯 Overview

This localhost environment creates an **exact replica of production** running on your local machine. It includes:

- **✅ Real PostgreSQL Database** (not mocked)
- **✅ Real Redis Session Store** (not mocked) 
- **✅ Real FastAPI Gateway** (containerized)
- **✅ Real Quantitative Engine** (containerized)
- **✅ Real Trade Execution Bot** (containerized)
- **✅ Real Next.js Frontend** (connecting to live backend)

This is the **final testing step** before production deployment.

---

## 🏗️ Architecture

```mermaid
graph TB
    User[User Browser] --> NextJS[Next.js App :3002]
    NextJS --> NextAPI[Next.js API Routes]
    NextAPI --> FastAPI[FastAPI Gateway :8010]
    
    FastAPI --> QuantEngine[Quantitative Engine :8011]
    FastAPI --> TradeBot[Trade Bot :8012]
    
    QuantEngine --> Database[(PostgreSQL :5434)]
    TradeBot --> Database
    NextAPI --> Database
    
    FastAPI --> Redis[(Redis :6381)]
    TradeBot --> Solana[Solana Devnet]
    
    subgraph "Docker Containers"
        FastAPI
        QuantEngine
        TradeBot
        Database
        Redis
    end
```

### **Service Ports (Localhost)**
| Service | Port | Purpose |
|---------|------|---------|
| **Next.js App** | 3002 | Frontend (different from dev port 3000) |
| **FastAPI Gateway** | 8010 | Authentication & API routing |
| **Quantitative Engine** | 8011 | XORJ Trust Score calculations |
| **Trade Execution Bot** | 8012 | Automated trading logic |
| **PostgreSQL** | 5434 | Real database (different from dev port) |
| **Redis** | 6381 | Session storage (different from dev port) |

---

## 🚀 Quick Start

### **1. Start Localhost Backend Services**
```bash
# Start all containerized backend services
npm run localhost:start

# Or with clean database (removes old data)
npm run localhost:start:clean
```

This command will:
- ✅ Start PostgreSQL database with real schema
- ✅ Start Redis session store
- ✅ Build and start all Python backend services
- ✅ Wait for all services to become healthy
- ✅ Test connectivity to all services

### **2. Start Frontend Connected to Localhost Backend**
```bash
# Start Next.js app connected to localhost backend
npm run dev:localhost
```

This will:
- ✅ Copy localhost environment config
- ✅ Start Next.js on port 3002 (different from dev)
- ✅ Connect to live localhost backend services

### **3. Run End-to-End Test with Live Backend**
```bash
# Test complete system with live services
npm run test:localhost
```

### **4. Access the Application**
- **Frontend**: http://localhost:3002
- **API Status**: http://localhost:3002/api/system/status

---

## 🔧 Available Commands

### **Lifecycle Management**
```bash
# Start localhost environment
npm run localhost:start

# Start with clean database (removes all data)
npm run localhost:start:clean

# Stop all services
npm run localhost:stop

# View service logs
npm run localhost:logs
```

### **Development**
```bash
# Start frontend connected to localhost backend
npm run dev:localhost

# Test with live backend services
npm run test:localhost

# Run chaos tests with localhost backend  
npm run test:localhost:chaos
```

### **Direct Docker Commands**
```bash
# Start services
docker-compose -f docker-compose.localhost.yml up -d

# View logs for specific service
docker-compose -f docker-compose.localhost.yml logs -f localhost-quantitative-engine

# Stop all services
docker-compose -f docker-compose.localhost.yml down

# Restart specific service
docker-compose -f docker-compose.localhost.yml restart localhost-fastapi-gateway
```

---

## 🔍 Service Health Checks

All services include health checks. You can verify manually:

### **FastAPI Gateway**
```bash
curl http://localhost:8010/health
# Expected: {"status": "healthy", "version": "1.0.0"}
```

### **Quantitative Engine**
```bash
curl http://localhost:8011/health  
# Expected: {"status": "healthy", "service": "quantitative-engine"}
```

### **Trade Execution Bot**
```bash
curl http://localhost:8012/health
# Expected: {"status": "healthy", "service": "trade-execution-bot"}
```

### **Database Connection**
```bash
psql "postgresql://xorj_localhost_user:localhost_password_2024@localhost:5434/xorj_localhost" -c "SELECT 1;"
# Expected: Returns 1
```

### **Redis Connection** 
```bash
redis-cli -h localhost -p 6381 ping
# Expected: PONG
```

---

## 🧪 Testing Features

### **End-to-End Testing**
The localhost environment supports complete end-to-end testing:

1. **Authentication**: Real JWT session management
2. **Algorithm Testing**: XORJ Trust Score with real database
3. **Trade Execution**: Complete trade flow with Solana devnet
4. **Database Operations**: Real PostgreSQL with full schema
5. **API Integration**: All API routes working with live backend

### **Test Scenarios Supported**
- ✅ User authentication and session management
- ✅ XORJ Trust Score calculation with real data
- ✅ Trade execution simulation with Solana devnet
- ✅ Database CRUD operations
- ✅ API endpoint testing
- ✅ Error handling and recovery
- ✅ Performance testing under load

---

## 🗄️ Database Management

### **Database Schema**
The localhost database uses the exact same schema as production:
- **Users and user settings**
- **Trading jobs and execution history**
- **Scoring runs and trader scores**  
- **All indexes and constraints**

### **Database Access**
```bash
# Connect to localhost database
psql "postgresql://xorj_localhost_user:localhost_password_2024@localhost:5434/xorj_localhost"

# View tables
\dt

# Check user data
SELECT * FROM users LIMIT 10;

# Check recent trades
SELECT * FROM trades ORDER BY created_at DESC LIMIT 10;
```

### **Reset Database**
```bash
# Stop services and remove database volume
npm run localhost:stop
docker volume rm xorj-landing_localhost_db_data

# Restart with clean database
npm run localhost:start:clean
```

---

## 🔒 Security Configuration

### **Environment Isolation**
- **Separate ports**: No conflicts with development environment
- **Isolated network**: Docker network prevents external access to internal services
- **Development secrets**: Safe hardcoded secrets for testing only

### **⚠️ Important Security Notes**
- **FOR LOCALHOST TESTING ONLY** - Not for production
- Hardcoded passwords and secrets are safe for local testing
- Database is not exposed externally
- No real money or mainnet transactions

---

## 🔧 Troubleshooting

### **Services Won't Start**
```bash
# Check Docker is running
docker --version

# Check port availability
netstat -an | grep :8010

# View startup logs
npm run localhost:logs
```

### **Database Connection Issues**
```bash
# Check database container status
docker ps | grep xorj-localhost-db

# View database logs
docker-compose -f docker-compose.localhost.yml logs localhost-database

# Test connection manually
psql "postgresql://xorj_localhost_user:localhost_password_2024@localhost:5434/xorj_localhost"
```

### **Service Not Healthy**
```bash
# Check specific service logs
docker-compose -f docker-compose.localhost.yml logs localhost-quantitative-engine

# Restart unhealthy service
docker-compose -f docker-compose.localhost.yml restart localhost-quantitative-engine

# Check health endpoint manually
curl http://localhost:8011/health
```

### **Frontend Connection Issues**
```bash
# Verify environment config
cat .env.local

# Check Next.js is using correct backend URLs
# Should show localhost:8010, :8011, :8012 endpoints

# Test API connectivity
curl http://localhost:3002/api/system/status
```

### **Clean Restart**
```bash
# Nuclear option - restart everything clean
npm run localhost:stop
docker system prune -f
npm run localhost:start:clean
```

---

## 📊 Performance Expectations

### **Expected Performance**
- **Service startup**: 30-60 seconds
- **Database queries**: < 50ms
- **API responses**: < 200ms
- **End-to-end test**: < 30 seconds

### **Resource Usage**
- **Memory**: ~2GB total for all containers
- **CPU**: Light usage during testing
- **Disk**: ~500MB for database and images

---

## 🎯 Testing Workflow

### **Complete Testing Sequence**
```bash
# 1. Start backend services
npm run localhost:start

# 2. Start frontend 
npm run dev:localhost

# 3. Run automated tests
npm run test:localhost

# 4. Manual testing at http://localhost:3002

# 5. Stop services when done
npm run localhost:stop
```

### **What to Test**
1. **Wallet Connection**: Connect with Phantom wallet
2. **Authentication**: JWT session management
3. **Bot Controls**: Enable/disable bot functionality  
4. **Settings**: User preference management
5. **Performance**: Transaction history and metrics
6. **Error Handling**: Test with invalid inputs

---

## 📋 Pre-Production Checklist

Before production deployment, verify:

- [ ] All services start successfully
- [ ] Database schema matches production
- [ ] All API endpoints respond correctly
- [ ] Authentication flow works properly
- [ ] XORJ Trust Score algorithm produces correct results
- [ ] Trade execution simulation completes successfully
- [ ] Error handling works as expected
- [ ] Performance meets requirements
- [ ] No memory leaks or resource issues
- [ ] Clean shutdown process works

---

## 🚀 Next Steps

After successful localhost testing:

1. **✅ Localhost Validation Complete** ← You are here
2. **Deploy to Production Infrastructure**
3. **Smart Contract Mainnet Deployment**
4. **Production Configuration**  
5. **Load Testing**
6. **Go Live!**

---

**🎯 Goal:** Validate that all systems work together exactly as they will in production, but safely on localhost.

**✅ Success Criteria:** All tests pass, all features work, performance is acceptable, and the system behaves identically to how it will in production.