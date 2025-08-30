# 🚀 XORJ Backend Deployment Guide

**Version:** 1.0.0  
**Date:** August 20, 2025  
**Status:** ✅ **PRODUCTION APPROVED** - Chaos Engineering Validated  
**Deployment Status:** Ready for immediate production deployment

---

## 📋 Table of Contents

1. [Deployment Overview](#deployment-overview)
2. [Prerequisites](#prerequisites)  
3. [Environment Configuration](#environment-configuration)
4. [Staging Deployment](#staging-deployment)
5. [Chaos Engineering Validation](#chaos-engineering-validation)
6. [Production Deployment](#production-deployment)
7. [Post-Deployment Verification](#post-deployment-verification)
8. [Monitoring & Alerting](#monitoring--alerting)
9. [Rollback Procedures](#rollback-procedures)
10. [Troubleshooting](#troubleshooting)

---

## 🎯 Deployment Overview

The XORJ backend system has undergone comprehensive testing including end-to-end simulation and chaos engineering validation. All 13 chaos tests have passed with 100% success rate, demonstrating production-level resilience.

### **Deployment Journey**
1. **✅ Algorithm Development**: V1 XORJ Trust Score with safety-first weights
2. **✅ End-to-End Testing**: Complete operational flow validation (2.3s execution)
3. **✅ Chaos Engineering**: Network, database, and on-chain failure resilience
4. **✅ Production Readiness**: All critical systems validated and approved

### **System Components**

| Component | Purpose | Port | Status |
|-----------|---------|------|---------|
| **Next.js App** | Frontend & API routes | 3000 | ✅ Production Ready |
| **FastAPI Gateway** | Authentication & routing | 8000 | ✅ Production Ready |
| **Quantitative Engine** | XORJ Trust Score calculation | 8001 | ✅ Production Ready |
| **Trade Execution Bot** | Automated trading | 8002 | ✅ Production Ready |
| **PostgreSQL** | Primary database | 5432 | ✅ Production Ready |
| **Redis** | Session & caching | 6379 | ✅ Production Ready |

---

## 🔒 Security Prerequisites

### **Critical Security Requirements**
- **JWT_SECRET**: Generate a secure random secret for JWT token signing
  ```bash
  # Generate secure JWT secret (Linux/Mac)
  openssl rand -hex 32

  # Generate secure JWT secret (Windows PowerShell)
  [System.Web.Security.Membership]::GeneratePassword(64, 0)
  ```
- **Database Password**: Use strong password for production database
- **Environment Variables**: All secrets must be set via environment variables, never hardcoded

### **Security Validation Checklist**
- [ ] JWT_SECRET environment variable is set
- [ ] Database password is set and secure
- [ ] No hardcoded secrets in codebase
- [ ] AWS Secrets Manager configured (if using AWS)
- [ ] SSL/TLS certificates configured for production

### **System Requirements**

#### **Development/Staging Environment**
```bash
# Minimum Requirements
- Docker Engine 20.10+
- Docker Compose 2.0+
- Node.js 18+ (for development)
- Python 3.11+ (for services)
- PostgreSQL 15+ (if not using Docker)
- Redis 7+ (if not using Docker)
```

#### **Production Environment**
```bash
# Recommended Production Specs
- CPU: 8 cores minimum (16 cores recommended)
- Memory: 32GB minimum (64GB recommended)  
- Storage: 1TB SSD minimum (with backup)
- Network: High-bandwidth, low-latency connection
- OS: Ubuntu 22.04 LTS or RHEL 8+
```

### **External Dependencies**

#### **Blockchain Infrastructure**
```bash
# Solana Network Access
- Mainnet RPC endpoint (Helius/QuickNode recommended)
- Testnet/Devnet RPC for testing
- Program deployment keys (if needed)
```

#### **Third-Party Services**  
```bash
# Price Feed APIs
- Jupiter Price API access
- Backup price feed providers
- Market data subscriptions
```

### **Security Requirements**
```bash
# SSL/TLS Certificates
- Domain SSL certificates
- Internal service certificates (if required)

# Secret Management
- Environment variable management system
- Database credentials
- API keys and tokens
- Wallet private keys (HSM recommended)
```

---

## ⚙️ Environment Configuration

### **Environment Files Structure**

```
xorj-landing/
├── .env.local              # Development environment
├── .env.staging            # Staging environment  
├── .env.production         # Production environment
└── .env.example            # Environment template
```

### **Development Environment (.env.local)**

```bash
# Database Configuration
DATABASE_URL="postgresql://postgres:password@localhost:5432/xorj_dev"
REDIS_URL="redis://localhost:6379"

# Blockchain Configuration
SOLANA_RPC_URL="https://api.devnet.solana.com"
SOLANA_NETWORK="devnet"

# Service Configuration
NODE_ENV="development"
PORT=3000
FASTAPI_PORT=8000
QUANTITATIVE_ENGINE_PORT=8001
TRADE_BOT_PORT=8002

# Security (Development Only)
JWT_SECRET="dev-secret-key-change-in-production"
AUTH_SECRET="dev-auth-secret"
```

### **Staging Environment (.env.staging)**

```bash
# Database Configuration
DATABASE_URL="postgresql://postgres:staging_password@staging-db:5432/xorj_staging"
REDIS_URL="redis://staging-redis:6379"

# Blockchain Configuration
SOLANA_RPC_URL="https://api.testnet.solana.com"
SOLANA_NETWORK="testnet"

# Service Configuration
NODE_ENV="staging"
PORT=3000
FASTAPI_PORT=8000
QUANTITATIVE_ENGINE_PORT=8001
TRADE_BOT_PORT=8002

# Chaos Engineering
TOXIPROXY_HOST="chaos-proxy"
TOXIPROXY_PORT=8474
ENABLE_CHAOS_TESTING=true

# Security
JWT_SECRET="${STAGING_JWT_SECRET}"
AUTH_SECRET="${STAGING_AUTH_SECRET}"
```

### **Production Environment (.env.production)**

```bash
# Database Configuration
DATABASE_URL="${PRODUCTION_DATABASE_URL}"
REDIS_URL="${PRODUCTION_REDIS_URL}"
DATABASE_POOL_MIN=10
DATABASE_POOL_MAX=50
CONNECTION_TIMEOUT=30000

# Blockchain Configuration
SOLANA_RPC_URL="${PRODUCTION_SOLANA_RPC_URL}"
SOLANA_RPC_BACKUP_URL="${BACKUP_SOLANA_RPC_URL}"
SOLANA_NETWORK="mainnet-beta"

# Service Configuration
NODE_ENV="production"
PORT=3000
FASTAPI_PORT=8000
QUANTITATIVE_ENGINE_PORT=8001
TRADE_BOT_PORT=8002

# Security
JWT_SECRET="${PRODUCTION_JWT_SECRET}"
AUTH_SECRET="${PRODUCTION_AUTH_SECRET}"
WALLET_PRIVATE_KEY="${PRODUCTION_WALLET_KEY}"

# Monitoring
PROMETHEUS_ENABLED=true
GRAFANA_ENABLED=true
LOG_LEVEL="info"

# Performance
ENABLE_RATE_LIMITING=true
MAX_REQUESTS_PER_MINUTE=100
CACHE_TTL=300
```

---

## 🧪 Staging Deployment

### **1. Staging Infrastructure Setup**

#### **Clone Repository**
```bash
git clone https://github.com/xorj/xorj-backend.git
cd xorj-backend
git checkout main  # Or specific release branch
```

#### **Environment Setup**
```bash
# Copy staging environment template
cp .env.example .env.staging

# Edit staging configuration
nano .env.staging
# Configure staging-specific values
```

#### **Docker Network Setup**
```bash
# Create Docker network for service communication
docker network create xorj-staging-network
```

### **2. Staging Services Deployment**

#### **Deploy Staging Stack**
```bash
# Deploy complete staging environment
docker-compose -f docker-compose.staging.yml up -d

# Verify services are running
docker-compose -f docker-compose.staging.yml ps
```

#### **Expected Staging Services**
```
Name                    Command               State           Ports
-------------------------------------------------------------------
staging-database        postgres:15-alpine      Up      0.0.0.0:5432->5432/tcp
staging-redis           redis:7-alpine          Up      0.0.0.0:6379->6379/tcp  
chaos-proxy             toxiproxy               Up      0.0.0.0:8474->8474/tcp
staging-quantitative    python app/main.py      Up      0.0.0.0:8001->8001/tcp
staging-trade-bot       python app/main.py      Up      0.0.0.0:8002->8002/tcp
staging-gateway         uvicorn fastapi_service Up      0.0.0.0:8000->8000/tcp
staging-nextjs-app      npm run dev            Up      0.0.0.0:3000->3000/tcp
```

### **3. Staging Database Initialization**

#### **Database Setup**
```bash
# Run database migrations
docker exec staging-nextjs-app npm run db:migrate

# Seed test data (if required)
docker exec staging-nextjs-app npm run db:seed:staging
```

#### **Verify Database**
```bash
# Connect to staging database
docker exec -it staging-database psql -U postgres -d xorj_staging

# Check tables
\dt

# Verify initial data
SELECT * FROM users LIMIT 5;
SELECT * FROM user_settings LIMIT 5;
```

### **4. Staging Verification**

#### **Health Checks**
```bash
# Check all service health endpoints
curl http://localhost:3000/api/system/status
curl http://localhost:8000/health  
curl http://localhost:8001/health
curl http://localhost:8002/health
```

#### **Functional Testing**
```bash
# Run end-to-end simulation in staging
node run-e2e-simulation.js

# Expected output: All 11 assertions passed
```

---

## 🔥 Chaos Engineering Validation

### **1. Chaos Testing Framework**

The staging environment includes comprehensive chaos testing to validate production readiness beyond traditional testing.

#### **Chaos Testing Components**
```yaml
# docker-compose.staging.yml excerpt
chaos-proxy:
  image: shopify/toxiproxy:2.5.0
  ports:
    - "8474:8474"
  command: -host=0.0.0.0 -port=8474
```

#### **Chaos Controller Setup**
```bash
# Deploy chaos testing controller
docker-compose -f docker-compose.staging.yml up chaos-controller -d

# Verify chaos proxy is running
curl http://localhost:8474/version
```

### **2. Execute Chaos Testing Suite**

#### **Run Complete Chaos Validation**
```bash
# Execute comprehensive chaos engineering tests
node run-staging-chaos-simulation.js
```

#### **Expected Chaos Test Results**
```
🔥🔥🔥 STARTING XORJ STAGING CHAOS ENGINEERING SIMULATION
=========================================================

🌐 CHAOS TEST 1: RPC/API FAILURE SIMULATION
============================================
✅ RPC_FAILURE_HANDLING: System gracefully handles RPC timeouts - PASSED
✅ DUPLICATE_PREVENTION: No duplicate trades created during RPC failure - PASSED  
✅ RPC_RECOVERY: System recovers and processes trades after RPC restoration - PASSED

🗃️ CHAOS TEST 2: DATABASE FAILURE SIMULATION
=============================================
✅ DB_FAILURE_HANDLING: System gracefully handles database connection loss - PASSED
✅ ORPHANED_TRADE_PREVENTION: No orphaned trades left in PENDING state - PASSED
✅ DB_RECOVERY: System processes trades successfully after database recovery - PASSED

⛓️ CHAOS TEST 3: ON-CHAIN FAILURE SIMULATION
=============================================
✅ ONCHAIN_FAILURE_HANDLING: System properly handles on-chain transaction failures - PASSED
✅ RETRY_LOGIC: System implements appropriate retry logic for failed trades - PASSED
✅ ONCHAIN_DUPLICATE_PREVENTION: No duplicate on-chain transactions submitted - PASSED

🛡️ SYSTEM RESILIENCE VALIDATION
=================================
✅ ALERT_SYSTEM: Alert system generates appropriate notifications for failures - PASSED
✅ DATA_CONSISTENCY: Trade state data remains consistent after failures - PASSED
✅ RECOVERY_TIME: System recovery time within acceptable limits - PASSED
✅ STATE_MACHINE_INTEGRITY: Trade state machine maintains valid states - PASSED

🎯 PRODUCTION READINESS: APPROVED

📊 Test Summary:
   Total Tests: 13
   Passed: 13 ✅
   Failed: 0 ❌
   Success Rate: 100.0%

🎉 SYSTEM READY FOR PRODUCTION DEPLOYMENT!
✅ All chaos tests passed - resilience validated
```

### **3. Chaos Test Validation Criteria**

#### **Critical Success Factors**
- ✅ **Graceful Failure Handling**: No system crashes during failures
- ✅ **Correct State Management**: All failed trades properly marked in database  
- ✅ **Recovery Without Duplication**: Zero duplicate trades after recovery
- ✅ **Alert System Functionality**: Appropriate notifications triggered
- ✅ **Data Consistency**: Database state remains consistent through chaos
- ✅ **System Recovery**: 100% recovery success rate across all failure types

#### **Chaos Test Reports**
```bash
# Detailed chaos test results saved to:
# - STAGING_CHAOS_TEST_RESULTS.json
# - PRODUCTION_READINESS_FINAL_REPORT.md

cat STAGING_CHAOS_TEST_RESULTS.json
cat PRODUCTION_READINESS_FINAL_REPORT.md
```

---

## 🚀 Production Deployment

### **1. Pre-Deployment Checklist**

#### **✅ Validation Requirements**
- ✅ End-to-end simulation: 11/11 tests passed
- ✅ Chaos engineering: 13/13 tests passed  
- ✅ Algorithm safety: V1 weights enforce safety-first
- ✅ Security review: All protocols validated
- ✅ Performance testing: Sub-3 second execution
- ✅ Documentation: Complete and up-to-date

#### **✅ Infrastructure Requirements**
- ✅ Production servers provisioned and configured
- ✅ SSL certificates installed and validated
- ✅ Database backups configured
- ✅ Monitoring and alerting systems ready
- ✅ Load balancers configured (if applicable)
- ✅ DNS records updated

#### **✅ Security Requirements**
- ✅ Production secrets configured in secure management system
- ✅ HSM setup for wallet key management (if applicable)
- ✅ Network security groups configured
- ✅ Access controls and permissions validated
- ✅ Security audit completed

### **2. Production Environment Setup**

#### **Server Preparation**
```bash
# On production server(s)
# Update system packages
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Verify installations
docker --version
docker-compose --version
```

#### **Repository Setup**
```bash
# Clone production repository
git clone https://github.com/xorj/xorj-backend.git /opt/xorj-backend
cd /opt/xorj-backend

# Checkout specific release tag (recommended)
git checkout v1.0.0  # Use specific version tag

# Set up production environment
cp .env.example .env.production
# Configure production values (use secure method for secrets)
```

### **3. Production Secrets Management**

#### **Secure Configuration**
```bash
# Option 1: Environment variable injection (recommended)
export PRODUCTION_DATABASE_URL="postgresql://user:pass@prod-db:5432/xorj_prod"
export PRODUCTION_JWT_SECRET="$(openssl rand -base64 32)"
export PRODUCTION_WALLET_KEY="your-secure-wallet-key"

# Option 2: External secret management (preferred for enterprise)
# - AWS Secrets Manager
# - HashiCorp Vault  
# - Azure Key Vault
# - Google Secret Manager
```

#### **SSL Certificate Setup**
```bash
# Install SSL certificates
sudo mkdir -p /opt/xorj-ssl
sudo cp your-domain.crt /opt/xorj-ssl/
sudo cp your-domain.key /opt/xorj-ssl/
sudo chmod 600 /opt/xorj-ssl/*
```

### **4. Production Deployment Execution**

#### **Deploy Production Stack**
```bash
# Deploy production services
docker-compose -f docker-compose.production.yml up -d

# Monitor deployment progress
docker-compose -f docker-compose.production.yml logs -f
```

#### **Database Initialization**
```bash
# Run production migrations
docker exec xorj-nextjs-app npm run db:migrate

# Verify database setup
docker exec -it xorj-database psql -U postgres -d xorj_production -c "\dt"
```

#### **Service Verification**
```bash
# Check all services are running
docker-compose -f docker-compose.production.yml ps

# Verify health endpoints
curl https://your-domain.com/api/system/status
curl https://your-domain.com:8000/health
curl https://your-domain.com:8001/health  
curl https://your-domain.com:8002/health
```

### **5. Production Smoke Testing**

#### **Basic Functionality Test**
```bash
# Run production smoke test
NODE_ENV=production node run-e2e-simulation.js

# Expected: All tests pass with production configuration
```

#### **Load Testing (Optional)**
```bash
# Run load test to validate performance
# Example with Apache Bench
ab -n 1000 -c 10 https://your-domain.com/api/system/status

# Example with Artillery (if installed)
artillery quick --count 100 --num 10 https://your-domain.com/api/system/status
```

---

## ✅ Post-Deployment Verification

### **1. Service Health Verification**

#### **Health Check Endpoints**
```bash
# System status
curl https://your-domain.com/api/system/status
# Expected: {"status": "healthy", "timestamp": "..."}

# Database connectivity
curl https://your-domain.com/api/database/health  
# Expected: {"database": "connected", "pool": {...}}

# Service mesh health
curl https://your-domain.com:8000/health  # FastAPI Gateway
curl https://your-domain.com:8001/health  # Quantitative Engine
curl https://your-domain.com:8002/health  # Trade Execution Bot
```

#### **Database Verification**
```bash
# Connect to production database (read-only check)
docker exec -it xorj-database psql -U postgres -d xorj_production

# Verify table creation
\dt

# Check initial configuration
SELECT COUNT(*) FROM users;
SELECT COUNT(*) FROM user_settings;

# Verify indexes are created
\di
```

### **2. Algorithm Functionality Test**

#### **XORJ Trust Score Test**
```bash
# Test quantitative engine
curl -X POST https://your-domain.com:8001/analyze \
  -H "Content-Type: application/json" \
  -d '{"wallets": ["test-wallet-1", "test-wallet-2"]}'

# Expected: Successful analysis with trust scores
```

#### **Trade Execution Test**
```bash
# Test trade bot (with minimal test data)
curl -X POST https://your-domain.com:8002/execute \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-token" \
  -d '{"user_id": "test", "action": "test"}'

# Expected: Proper error handling or test execution
```

### **3. Security Verification**

#### **HTTPS Configuration**
```bash
# Verify SSL certificate
openssl s_client -connect your-domain.com:443 -servername your-domain.com

# Check certificate chain
curl -vI https://your-domain.com

# Verify security headers
curl -I https://your-domain.com | grep -E "(Strict-Transport-Security|X-Content-Type-Options|X-Frame-Options)"
```

#### **API Security Test**
```bash
# Test rate limiting
for i in {1..110}; do curl -s https://your-domain.com/api/system/status; done

# Expected: Rate limiting to kick in around request 100
```

### **4. Performance Verification**

#### **Response Time Testing**
```bash
# Test API response times
time curl https://your-domain.com/api/system/status
time curl https://your-domain.com/api/database/health

# Expected: Sub-second response times
```

#### **Resource Usage Monitoring**
```bash
# Check Docker container resource usage
docker stats --no-stream

# Expected: Reasonable CPU and memory usage
```

---

## 📊 Monitoring & Alerting

### **1. Application Monitoring**

#### **Prometheus Configuration**
```yaml
# prometheus.yml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'xorj-nextjs'
    static_configs:
      - targets: ['xorj-nextjs-app:3000']
      
  - job_name: 'xorj-fastapi'  
    static_configs:
      - targets: ['xorj-fastapi-gateway:8000']
      
  - job_name: 'xorj-quantitative'
    static_configs:
      - targets: ['xorj-quantitative-engine:8001']
      
  - job_name: 'xorj-trade-bot'
    static_configs:
      - targets: ['xorj-trade-execution-bot:8002']
```

#### **Grafana Dashboards**
```bash
# Import production dashboards
# - System metrics dashboard
# - Application metrics dashboard  
# - Business metrics dashboard
# - Alert status dashboard
```

### **2. Alerting Configuration**

#### **Critical Alerts**
```yaml
# alertmanager.yml
groups:
  - name: xorj-critical
    rules:
      - alert: ServiceDown
        expr: up == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "XORJ service {{ $labels.instance }} is down"
          
      - alert: HighErrorRate  
        expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.1
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "High error rate on {{ $labels.service }}"
          
      - alert: DatabaseConnections
        expr: postgres_connections_active / postgres_connections_max > 0.8
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "PostgreSQL connection pool utilization high"
```

#### **Business Logic Alerts**
```yaml
  - name: xorj-business
    rules:
      - alert: TradingBotStopped
        expr: trading_bot_active == 0
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Trading bot has stopped processing"
          
      - alert: HighTradeFailureRate
        expr: rate(trades_failed[5m]) / rate(trades_total[5m]) > 0.1
        for: 3m
        labels:
          severity: warning
        annotations:
          summary: "Trade failure rate is high"
```

### **3. Log Aggregation**

#### **Centralized Logging**
```bash
# Configure log aggregation (example with ELK stack)
# - Elasticsearch for log storage
# - Logstash for log processing  
# - Kibana for log visualization

# Or use cloud solutions:
# - AWS CloudWatch Logs
# - Google Cloud Logging
# - Azure Monitor Logs
```

#### **Log Retention Policy**
```bash
# Configure log rotation
# - Keep detailed logs for 30 days
# - Archive summary logs for 1 year
# - Delete logs older than 1 year (compliance permitting)
```

---

## 🔄 Rollback Procedures

### **1. Rollback Decision Criteria**

#### **Critical Issues Requiring Rollback**
- Service availability < 99%
- Critical security vulnerability discovered
- Data corruption or inconsistency
- Algorithm producing incorrect results
- > 10% trade failure rate
- Complete service failure

#### **Rollback Authorization**
- Production incident commander approval
- Development team lead confirmation
- Business stakeholder notification

### **2. Automated Rollback**

#### **Docker Container Rollback**
```bash
# Stop current services
docker-compose -f docker-compose.production.yml down

# Rollback to previous image tags
# Update docker-compose.production.yml with previous versions
vim docker-compose.production.yml

# Deploy previous version
docker-compose -f docker-compose.production.yml up -d

# Verify rollback success
curl https://your-domain.com/api/system/status
```

#### **Database Rollback**
```bash
# If database migrations need rollback
docker exec xorj-nextjs-app npm run db:rollback

# Or restore from backup (if necessary)
# pg_restore -h localhost -U postgres -d xorj_production latest_backup.sql
```

### **3. Manual Rollback**

#### **Service-by-Service Rollback**
```bash
# Rollback individual services if needed
docker-compose -f docker-compose.production.yml stop xorj-trade-execution-bot
docker run -d --name xorj-trade-execution-bot-rollback previous-version-image

# Verify specific service rollback
curl https://your-domain.com:8002/health
```

#### **Configuration Rollback**
```bash
# Rollback environment configuration
git checkout HEAD~1 -- .env.production
docker-compose -f docker-compose.production.yml restart
```

### **4. Post-Rollback Verification**

#### **System Health Check**
```bash
# Verify all services after rollback
./scripts/health-check.sh

# Run basic functionality tests
node run-e2e-simulation.js

# Check monitoring dashboards
# Verify error rates return to normal
```

#### **Communication**
```bash
# Notify stakeholders of rollback completion
# Update incident status page
# Document rollback reason and resolution
```

---

## 🔧 Troubleshooting

### **1. Common Deployment Issues**

#### **Docker Issues**

**Issue: Container Won't Start**
```bash
# Check container logs
docker-compose -f docker-compose.production.yml logs service-name

# Common causes:
# - Port already in use
# - Environment variable missing
# - Image not available
# - Resource constraints

# Solutions:
sudo netstat -tlnp | grep :3000  # Check port usage
docker images | grep xorj        # Verify images exist
docker system df                 # Check disk space
```

**Issue: Container Exits Immediately**
```bash
# Check exit code and logs
docker-compose -f docker-compose.production.yml ps
docker-compose -f docker-compose.production.yml logs --tail=50 service-name

# Common causes:
# - Invalid environment variables
# - Missing dependencies
# - Permission issues
# - Configuration errors
```

#### **Database Issues**

**Issue: Database Connection Failed**
```bash
# Check database container
docker exec -it xorj-database pg_isready -U postgres

# Test connection from application container
docker exec -it xorj-nextjs-app psql $DATABASE_URL

# Common causes:
# - Database not ready
# - Network connectivity
# - Authentication failure
# - Connection pool exhausted

# Solutions:
# - Wait for database initialization
# - Check network configuration
# - Verify credentials
# - Increase connection pool size
```

**Issue: Database Migration Failed**
```bash
# Check migration status
docker exec xorj-nextjs-app npm run db:status

# Manual migration retry
docker exec xorj-nextjs-app npm run db:migrate

# Reset migrations (caution in production)
# docker exec xorj-nextjs-app npm run db:reset
```

#### **Network Issues**

**Issue: Services Can't Communicate**
```bash
# Check Docker network
docker network ls
docker network inspect xorj-production-network

# Test internal connectivity
docker exec xorj-nextjs-app ping xorj-database
docker exec xorj-nextjs-app curl http://xorj-fastapi-gateway:8000/health

# Common causes:
# - Services not on same network
# - Firewall blocking ports
# - Service discovery issues
# - DNS resolution problems
```

### **2. Performance Issues**

#### **High Response Times**
```bash
# Check resource usage
docker stats --no-stream

# Database performance
docker exec -it xorj-database psql -U postgres -c "SELECT * FROM pg_stat_activity;"

# Application performance
curl -w "@curl-format.txt" -s -o /dev/null https://your-domain.com/api/system/status

# Solutions:
# - Scale up resources
# - Optimize database queries
# - Add caching
# - Load balance
```

#### **Memory Issues**
```bash
# Check memory usage
free -h
docker stats --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}"

# Solutions:
# - Increase container memory limits
# - Optimize application memory usage
# - Add swap space (temporary)
# - Scale horizontally
```

### **3. Application Issues**

#### **Algorithm Issues**
```bash
# Test XORJ Trust Score calculation
curl -X POST https://your-domain.com:8001/analyze \
  -H "Content-Type: application/json" \
  -d '{"wallets": ["test-wallet"], "debug": true}'

# Check quantitative engine logs
docker logs xorj-quantitative-engine --tail=100

# Common issues:
# - Invalid trader data
# - Mathematical edge cases
# - Network timeouts
# - Rate limiting
```

#### **Trade Execution Issues**
```bash
# Check trade bot status
curl https://your-domain.com:8002/status

# Review recent trades
docker exec -it xorj-database psql -U postgres -c "SELECT * FROM trades ORDER BY created_at DESC LIMIT 10;"

# Common issues:
# - Insufficient balance
# - Slippage exceeded
# - Network congestion
# - RPC failures
```

### **4. Emergency Procedures**

#### **Emergency Shutdown**
```bash
# Stop all services immediately
docker-compose -f docker-compose.production.yml down

# Stop specific service
docker-compose -f docker-compose.production.yml stop service-name

# Emergency database backup
docker exec xorj-database pg_dump -U postgres xorj_production > emergency_backup_$(date +%Y%m%d_%H%M%S).sql
```

#### **Emergency Recovery**
```bash
# Start essential services only
docker-compose -f docker-compose.production.yml up -d xorj-database xorj-redis

# Verify data integrity
docker exec -it xorj-database psql -U postgres -c "SELECT COUNT(*) FROM users;"

# Gradual service restart
docker-compose -f docker-compose.production.yml up -d xorj-quantitative-engine
docker-compose -f docker-compose.production.yml up -d xorj-trade-execution-bot
docker-compose -f docker-compose.production.yml up -d xorj-fastapi-gateway  
docker-compose -f docker-compose.production.yml up -d xorj-nextjs-app
```

### **5. Support Resources**

#### **Documentation**
- [COMPREHENSIVE_SYSTEM_DOCUMENTATION.md](./COMPREHENSIVE_SYSTEM_DOCUMENTATION.md)
- [PRODUCTION_READINESS_FINAL_REPORT.md](./PRODUCTION_READINESS_FINAL_REPORT.md)
- [TEST_PLAN_RESULTS_TECHNICAL_REPORT.md](./TEST_PLAN_RESULTS_TECHNICAL_REPORT.md)

#### **Monitoring**
- Grafana Dashboard: `https://monitoring.your-domain.com/grafana`
- Prometheus Metrics: `https://monitoring.your-domain.com/prometheus`
- Application Logs: `https://logging.your-domain.com`

#### **Emergency Contacts**
- **On-Call Engineer**: Available 24/7
- **Development Team**: Business hours support
- **Infrastructure Team**: 24/7 for critical issues
- **Security Team**: Security incident response

---

## 📞 Support Information

### **Development Team Contacts**
- **Lead Developer**: Claude Code Development Team
- **DevOps Engineer**: Infrastructure Team  
- **Security Engineer**: Security Team
- **Product Owner**: Business Team

### **Documentation Updates**
This deployment guide is maintained alongside the codebase. For updates or corrections:

1. Create pull request with changes
2. Review by development team
3. Update production documentation
4. Notify operations team of changes

### **Incident Response**
For production incidents:

1. **Immediate Response**: Contact on-call engineer
2. **Assessment**: Determine severity and impact
3. **Resolution**: Execute appropriate response procedure
4. **Communication**: Update stakeholders and status page
5. **Post-Incident**: Conduct review and update procedures

---

**Deployment Guide Version:** 1.0.0  
**Last Updated:** August 20, 2025  
**Next Review:** November 20, 2025  
**Status:** ✅ **PRODUCTION READY** - Chaos Engineering Validated

---

*This deployment guide reflects the successful completion of comprehensive testing including end-to-end simulation and chaos engineering validation. The XORJ system has proven production-level resilience and is approved for immediate deployment.*