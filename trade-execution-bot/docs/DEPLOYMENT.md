# XORJ Trade Execution Bot - Deployment Guide

## Production Deployment Overview

The XORJ Trade Execution Bot requires careful deployment with **security-first** configuration. This guide covers production deployment with all security requirements (SR-1 through SR-5) properly configured.

## Prerequisites

### Infrastructure Requirements

#### Hardware Security Module (HSM)
**Required for Production** - Choose one:

1. **AWS KMS** (Recommended)
   ```bash
   # AWS CLI configuration required
   aws configure set aws_access_key_id YOUR_ACCESS_KEY
   aws configure set aws_secret_access_key YOUR_SECRET_KEY
   aws configure set default.region us-east-1
   ```

2. **Azure Key Vault**
   ```bash
   # Azure CLI authentication required
   az login
   az account set --subscription YOUR_SUBSCRIPTION_ID
   ```

3. **Google Cloud KMS**
   ```bash
   # GCP authentication required
   gcloud auth application-default login
   gcloud config set project YOUR_PROJECT_ID
   ```

4. **Hardware HSM**
   - Physical HSM device with PKCS#11 interface
   - Network connectivity to HSM device
   - HSM client libraries installed

#### Database Requirements
- **PostgreSQL 12+** (Required)
- **Audit Database** (Separate instance recommended)
- **Connection Pooling** (PgBouncer recommended)
- **Backup Strategy** (Point-in-time recovery)

#### Network Requirements
- **Solana RPC Access** (Mainnet for production)
- **Quantitative Engine API** connectivity
- **Monitoring Systems** integration
- **Load Balancer** (for high availability)

### System Requirements

#### Minimum Production Specifications
- **CPU**: 8 cores (2.4GHz+)
- **RAM**: 16GB
- **Storage**: 100GB SSD (audit logs grow over time)
- **Network**: 1Gbps with low latency to Solana RPC

#### Recommended Production Specifications  
- **CPU**: 16 cores (3.0GHz+)
- **RAM**: 32GB
- **Storage**: 500GB NVMe SSD
- **Network**: 10Gbps with redundant connections

## Environment Configuration

### Production Environment Variables

Create a secure `.env.production` file:

```bash
# Environment Configuration
ENVIRONMENT=production
DEBUG=false
LOG_LEVEL=info

# Database Configuration
DATABASE_URL=postgresql://user:password@db-host:5432/trade_execution
AUDIT_LOG_DATABASE_URL=postgresql://user:password@audit-host:5432/audit_logs

# Solana Network Configuration
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
VAULT_PROGRAM_ID=your_vault_program_id_here
COMMITMENT_LEVEL=finalized

# HSM Configuration (Choose ONE provider)
HSM_PROVIDER=aws_kms

# AWS KMS Configuration
AWS_KMS_KEY_ID=your_kms_key_id
AWS_REGION=us-east-1

# Azure Key Vault Configuration  
# AZURE_KEY_VAULT_URL=https://your-vault.vault.azure.net/
# AZURE_CLIENT_ID=your_client_id
# AZURE_CLIENT_SECRET=your_client_secret
# AZURE_TENANT_ID=your_tenant_id

# Google Cloud KMS Configuration
# GOOGLE_KMS_PROJECT_ID=your_project_id
# GOOGLE_KMS_LOCATION=global
# GOOGLE_KMS_KEY_RING=your_key_ring
# GOOGLE_KMS_KEY=your_key_name

# External Services
QUANTITATIVE_ENGINE_URL=https://quant.xorj.com/api/v1
QUANTITATIVE_ENGINE_API_KEY=your_api_key_here

# Security Configuration
MAX_TRADE_VALUE_USD=100000
DEFAULT_SLIPPAGE_TOLERANCE=1.0

# Kill Switch Configuration  
KILL_SWITCH_MASTER_KEY=generate_secure_256_bit_key
KILL_SWITCH_EMERGENCY_KEY=generate_different_secure_key
KILL_SWITCH_FILE=/opt/xorj/kill_switch

# Circuit Breaker Configuration (Optional - uses defaults if not set)
CIRCUIT_BREAKER_TRADE_FAILURE_THRESHOLD=5
CIRCUIT_BREAKER_TRADE_FAILURE_WINDOW=10
CIRCUIT_BREAKER_NETWORK_FAILURE_THRESHOLD=3
CIRCUIT_BREAKER_NETWORK_FAILURE_WINDOW=5

# Monitoring Configuration
ENABLE_METRICS=true
METRICS_PORT=9090
HEALTH_CHECK_PORT=8080
```

### Security Configuration Validation

#### Generate Secure Keys
```bash
# Kill switch master key (256-bit)
openssl rand -hex 32

# Kill switch emergency key (256-bit) 
openssl rand -hex 32

# Additional admin keys
openssl rand -hex 32
```

#### Validate HSM Configuration
```python
# Test HSM connectivity before deployment
python -c "
import asyncio
from app.security.hsm_manager import HSMManager
from app.core.config import get_config

async def test_hsm():
    config = get_config()
    hsm = HSMManager(config)
    health = await hsm.health_check()
    print(f'HSM Status: {health[\"status\"]}')
    print(f'Provider: {health[\"provider\"]}')
    
asyncio.run(test_hsm())
"
```

## Deployment Methods

### Method 1: Docker Deployment (Recommended)

#### 1. Build Production Image
```dockerfile
# Dockerfile.prod
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY app/ ./app/
COPY tests/ ./tests/

# Create non-root user
RUN useradd -m -u 1000 xorj && chown -R xorj:xorj /app
USER xorj

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s \
  CMD python -c "from app.core.health import health_check; exit(0 if health_check() else 1)"

CMD ["python", "-m", "app.main"]
```

#### 2. Build and Deploy
```bash
# Build production image
docker build -f Dockerfile.prod -t xorj-trade-executor:latest .

# Run with production configuration
docker run -d \
  --name xorj-trade-executor \
  --env-file .env.production \
  --restart unless-stopped \
  --memory 4g \
  --cpus 4 \
  --health-cmd="python -c 'from app.core.health import health_check; exit(0 if health_check() else 1)'" \
  --health-interval=30s \
  --health-timeout=10s \
  --health-retries=3 \
  xorj-trade-executor:latest
```

#### 3. Docker Compose (Production)
```yaml
# docker-compose.prod.yml
version: '3.8'

services:
  trade-executor:
    image: xorj-trade-executor:latest
    container_name: xorj-trade-executor
    restart: unless-stopped
    env_file: .env.production
    depends_on:
      - database
      - audit-database
    networks:
      - xorj-network
    deploy:
      resources:
        limits:
          memory: 4G
          cpus: '4'
        reservations:
          memory: 2G
          cpus: '2'
    healthcheck:
      test: ["CMD", "python", "-c", "from app.core.health import health_check; exit(0 if health_check() else 1)"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s

  database:
    image: postgres:15
    container_name: xorj-database
    restart: unless-stopped
    environment:
      POSTGRES_DB: trade_execution
      POSTGRES_USER: xorj_user
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./backups:/backups
    networks:
      - xorj-network

  audit-database:
    image: postgres:15
    container_name: xorj-audit-db
    restart: unless-stopped
    environment:
      POSTGRES_DB: audit_logs
      POSTGRES_USER: audit_user
      POSTGRES_PASSWORD: ${AUDIT_DB_PASSWORD}
    volumes:
      - audit_postgres_data:/var/lib/postgresql/data
    networks:
      - xorj-network

  monitoring:
    image: prom/prometheus
    container_name: xorj-monitoring
    restart: unless-stopped
    ports:
      - "9090:9090"
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml
    networks:
      - xorj-network

volumes:
  postgres_data:
  audit_postgres_data:

networks:
  xorj-network:
    driver: bridge
```

### Method 2: Kubernetes Deployment

#### 1. Kubernetes Manifests

##### Deployment
```yaml
# k8s/deployment.yml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: xorj-trade-executor
  namespace: xorj
spec:
  replicas: 2
  selector:
    matchLabels:
      app: xorj-trade-executor
  template:
    metadata:
      labels:
        app: xorj-trade-executor
    spec:
      containers:
      - name: trade-executor
        image: xorj-trade-executor:latest
        ports:
        - containerPort: 8080
        - containerPort: 9090
        envFrom:
        - secretRef:
            name: xorj-secrets
        - configMapRef:
            name: xorj-config
        resources:
          requests:
            memory: "2Gi"
            cpu: "2"
          limits:
            memory: "4Gi"
            cpu: "4"
        readinessProbe:
          httpGet:
            path: /health/ready
            port: 8080
          initialDelaySeconds: 30
          periodSeconds: 10
        livenessProbe:
          httpGet:
            path: /health/live
            port: 8080
          initialDelaySeconds: 60
          periodSeconds: 30
```

##### Service & Ingress
```yaml
# k8s/service.yml
apiVersion: v1
kind: Service
metadata:
  name: xorj-trade-executor-service
  namespace: xorj
spec:
  selector:
    app: xorj-trade-executor
  ports:
  - name: http
    port: 80
    targetPort: 8080
  - name: metrics
    port: 9090
    targetPort: 9090
  type: ClusterIP

---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: xorj-trade-executor-ingress
  namespace: xorj
  annotations:
    kubernetes.io/ingress.class: nginx
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
spec:
  tls:
  - hosts:
    - trade-executor.xorj.com
    secretName: xorj-tls
  rules:
  - host: trade-executor.xorj.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: xorj-trade-executor-service
            port:
              number: 80
```

##### Secrets Management
```yaml
# k8s/secrets.yml
apiVersion: v1
kind: Secret
metadata:
  name: xorj-secrets
  namespace: xorj
type: Opaque
data:
  DATABASE_URL: <base64_encoded>
  AUDIT_LOG_DATABASE_URL: <base64_encoded>
  QUANTITATIVE_ENGINE_API_KEY: <base64_encoded>
  KILL_SWITCH_MASTER_KEY: <base64_encoded>
  KILL_SWITCH_EMERGENCY_KEY: <base64_encoded>
  AWS_ACCESS_KEY_ID: <base64_encoded>
  AWS_SECRET_ACCESS_KEY: <base64_encoded>
```

#### 2. Deploy to Kubernetes
```bash
# Create namespace
kubectl create namespace xorj

# Apply secrets
kubectl apply -f k8s/secrets.yml

# Apply configuration
kubectl apply -f k8s/configmap.yml

# Deploy application
kubectl apply -f k8s/deployment.yml
kubectl apply -f k8s/service.yml

# Verify deployment
kubectl get pods -n xorj
kubectl logs -f deployment/xorj-trade-executor -n xorj
```

## Database Setup

### Production Database Configuration

#### 1. PostgreSQL Setup
```sql
-- Create databases
CREATE DATABASE trade_execution;
CREATE DATABASE audit_logs;

-- Create users
CREATE USER xorj_user WITH PASSWORD 'secure_password';
CREATE USER audit_user WITH PASSWORD 'secure_audit_password';

-- Grant permissions
GRANT ALL PRIVILEGES ON DATABASE trade_execution TO xorj_user;
GRANT ALL PRIVILEGES ON DATABASE audit_logs TO audit_user;

-- Enable required extensions
\c trade_execution;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

\c audit_logs;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
```

#### 2. Database Migrations
```bash
# Run database migrations
python -m app.database.migrate

# Verify tables created
python -c "
from app.database import get_connection
conn = get_connection()
cursor = conn.cursor()
cursor.execute('SELECT tablename FROM pg_tables WHERE schemaname = \'public\';')
print('Tables created:', [row[0] for row in cursor.fetchall()])
"
```

#### 3. Database Optimization
```sql
-- Performance tuning for production
ALTER SYSTEM SET shared_buffers = '8GB';
ALTER SYSTEM SET effective_cache_size = '24GB';
ALTER SYSTEM SET maintenance_work_mem = '2GB';
ALTER SYSTEM SET checkpoint_completion_target = 0.9;
ALTER SYSTEM SET wal_buffers = '16MB';
ALTER SYSTEM SET default_statistics_target = 100;
SELECT pg_reload_conf();

-- Create indexes for performance
CREATE INDEX idx_audit_logs_timestamp ON audit_logs(created_at);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_event_type ON audit_logs(event_type);
CREATE INDEX idx_trades_user_id ON trades(user_id);
CREATE INDEX idx_trades_status ON trades(status);
CREATE INDEX idx_trades_created_at ON trades(created_at);
```

## HSM Setup

### AWS KMS Setup

#### 1. Create KMS Key
```bash
# Create KMS key for trade execution
aws kms create-key \
    --description "XORJ Trade Execution Bot Key" \
    --usage SIGN_VERIFY \
    --spec ECC_NIST_P256 \
    --region us-east-1

# Create alias for easier management
aws kms create-alias \
    --alias-name alias/xorj-trade-executor \
    --target-key-id YOUR_KEY_ID
```

#### 2. IAM Policy
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "kms:GetPublicKey",
                "kms:Sign",
                "kms:Describe*"
            ],
            "Resource": "arn:aws:kms:us-east-1:ACCOUNT:key/YOUR_KEY_ID"
        }
    ]
}
```

### Azure Key Vault Setup

#### 1. Create Key Vault
```bash
# Create resource group
az group create --name xorj-rg --location eastus

# Create key vault
az keyvault create \
    --name xorj-trade-executor \
    --resource-group xorj-rg \
    --location eastus

# Create signing key
az keyvault key create \
    --vault-name xorj-trade-executor \
    --name trade-executor-key \
    --kty EC \
    --curve P-256
```

### Google Cloud KMS Setup

#### 1. Create Key Ring and Key
```bash
# Create key ring
gcloud kms keyrings create xorj-trade-executor \
    --location global

# Create signing key
gcloud kms keys create trade-executor-key \
    --location global \
    --keyring xorj-trade-executor \
    --purpose asymmetric-signing \
    --default-algorithm ec-sign-p256-sha256
```

## Production Validation

### Pre-Deployment Checklist

```bash
# 1. Validate environment configuration
python -c "
from app.core.config import get_config, validate_production_config
config = get_config()
validate_production_config()
print('✅ Configuration valid')
"

# 2. Test HSM connectivity
python -c "
import asyncio
from app.security.hsm_manager import get_hsm_manager

async def test():
    hsm = await get_hsm_manager()
    health = await hsm.health_check()
    assert health['status'] == 'healthy'
    print('✅ HSM connectivity verified')
    
asyncio.run(test())
"

# 3. Test database connectivity
python -c "
from app.database import get_connection
conn = get_connection()
cursor = conn.cursor()
cursor.execute('SELECT 1')
assert cursor.fetchone()[0] == 1
print('✅ Database connectivity verified')
"

# 4. Validate kill switch configuration
python -c "
from app.security.kill_switch import GlobalKillSwitch
ks = GlobalKillSwitch()
assert len(ks.authorized_keys) > 0
print('✅ Kill switch authorized keys configured')
"

# 5. Run production readiness check
python -c "
import asyncio
from app.execution.trade_executor import get_trade_executor

async def validate():
    executor = await get_trade_executor()
    result = await executor.validate_production_readiness()
    
    if result['production_ready']:
        print('✅ Production ready!')
        print(f'Passed checks: {len(result[\"checks\"])}')
        for check in result['checks']:
            print(f'  ✓ {check}')
    else:
        print('❌ Production validation failed!')
        for error in result['errors']:
            print(f'  ✗ {error}')
        exit(1)
        
asyncio.run(validate())
"
```

### Health Checks

#### Application Health Endpoints
```python
# app/core/health.py
from fastapi import APIRouter
from app.security.kill_switch import get_global_kill_switch
from app.execution.trade_executor import get_trade_executor

router = APIRouter()

@router.get("/health/live")
async def liveness():
    """Kubernetes liveness probe"""
    return {"status": "alive", "timestamp": datetime.utcnow()}

@router.get("/health/ready") 
async def readiness():
    """Kubernetes readiness probe"""
    try:
        # Check kill switch status
        kill_switch = await get_global_kill_switch()
        if kill_switch.is_active():
            return {"status": "not_ready", "reason": "kill_switch_active"}, 503
        
        # Check trade executor
        executor = await get_trade_executor()
        validation = await executor.validate_production_readiness()
        
        if not validation["production_ready"]:
            return {"status": "not_ready", "errors": validation["errors"]}, 503
            
        return {"status": "ready"}
    except Exception as e:
        return {"status": "not_ready", "error": str(e)}, 503

@router.get("/health/detailed")
async def detailed_health():
    """Detailed health information"""
    # Implementation with comprehensive system status
    pass
```

## Monitoring & Observability

### Prometheus Metrics

#### 1. Custom Metrics
```python
# app/monitoring/metrics.py
from prometheus_client import Counter, Histogram, Gauge

# Trade execution metrics
trades_total = Counter('xorj_trades_total', 'Total trades executed', ['status'])
trade_duration = Histogram('xorj_trade_duration_seconds', 'Trade execution duration')
active_trades = Gauge('xorj_active_trades', 'Currently active trades')

# Security metrics
kill_switch_activations = Counter('xorj_kill_switch_activations_total', 'Kill switch activations')
circuit_breaker_trips = Counter('xorj_circuit_breaker_trips_total', 'Circuit breaker trips', ['breaker_type'])
hsm_operations = Counter('xorj_hsm_operations_total', 'HSM operations', ['operation', 'status'])
```

#### 2. Prometheus Configuration
```yaml
# monitoring/prometheus.yml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'xorj-trade-executor'
    static_configs:
      - targets: ['trade-executor:9090']
    scrape_interval: 15s
    metrics_path: '/metrics'

rule_files:
  - "alert_rules.yml"

alerting:
  alertmanagers:
    - static_configs:
        - targets:
          - alertmanager:9093
```

#### 3. Alert Rules
```yaml
# monitoring/alert_rules.yml
groups:
- name: xorj_security_alerts
  rules:
  - alert: KillSwitchActivated
    expr: xorj_kill_switch_activations_total > 0
    for: 0m
    labels:
      severity: critical
    annotations:
      summary: "XORJ Kill Switch Activated"
      description: "The global kill switch has been activated"

  - alert: CircuitBreakerOpen
    expr: xorj_circuit_breaker_trips_total > 0
    for: 1m
    labels:
      severity: high
    annotations:
      summary: "Circuit Breaker Tripped"
      description: "Circuit breaker {{ $labels.breaker_type }} has tripped"

  - alert: HSMFailureRate
    expr: rate(xorj_hsm_operations_total{status="failed"}[5m]) > 0.1
    for: 2m
    labels:
      severity: high
    annotations:
      summary: "High HSM Failure Rate"
      description: "HSM failure rate is {{ $value }} operations/second"
```

### Logging Configuration

#### 1. Structured Logging
```python
# app/core/logging.py
import structlog
import logging.config

def setup_logging():
    logging.config.dictConfig({
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {
            "json": {
                "()": structlog.stdlib.ProcessorFormatter,
                "processor": structlog.dev.ConsoleRenderer(colors=False),
            },
        },
        "handlers": {
            "console": {
                "level": "INFO",
                "class": "logging.StreamHandler",
                "formatter": "json",
            },
            "file": {
                "level": "INFO", 
                "class": "logging.handlers.RotatingFileHandler",
                "filename": "/var/log/xorj/trade-executor.log",
                "maxBytes": 100000000,  # 100MB
                "backupCount": 10,
                "formatter": "json",
            }
        },
        "root": {
            "level": "INFO",
            "handlers": ["console", "file"],
        },
    })

    structlog.configure(
        processors=[
            structlog.stdlib.filter_by_level,
            structlog.stdlib.add_logger_name,
            structlog.stdlib.add_log_level,
            structlog.stdlib.PositionalArgumentsFormatter(),
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.UnicodeDecoder(),
            structlog.processors.JSONRenderer()
        ],
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )
```

## Security Hardening

### System Hardening

#### 1. Container Security
```dockerfile
# Security-hardened Dockerfile
FROM python:3.11-slim

# Install security updates
RUN apt-get update && \
    apt-get upgrade -y && \
    apt-get install -y --no-install-recommends \
        build-essential \
        libpq-dev && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd -r xorj && useradd -r -g xorj -m -s /bin/bash xorj

# Set secure file permissions
COPY --chown=xorj:xorj app/ /app/
RUN chmod -R 750 /app

# Switch to non-root user
USER xorj

# Remove unnecessary packages and files
RUN apt-get autoremove -y build-essential
```

#### 2. Network Security
```yaml
# Network policies for Kubernetes
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: xorj-network-policy
  namespace: xorj
spec:
  podSelector:
    matchLabels:
      app: xorj-trade-executor
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - podSelector:
        matchLabels:
          app: nginx-ingress
    ports:
    - protocol: TCP
      port: 8080
  egress:
  - to:
    - podSelector:
        matchLabels:
          app: postgres
    ports:
    - protocol: TCP
      port: 5432
  - to: []
    ports:
    - protocol: TCP
      port: 443  # HTTPS outbound
```

### Secrets Management

#### 1. Kubernetes Secrets
```bash
# Create secrets from files
kubectl create secret generic xorj-secrets \
  --from-env-file=.env.production \
  --namespace=xorj

# Or create individual secrets
kubectl create secret generic xorj-hsm-keys \
  --from-literal=master-key="$(openssl rand -hex 32)" \
  --from-literal=emergency-key="$(openssl rand -hex 32)" \
  --namespace=xorj
```

#### 2. External Secrets Operator
```yaml
# For integration with external secret management
apiVersion: external-secrets.io/v1beta1
kind: SecretStore
metadata:
  name: xorj-secret-store
  namespace: xorj
spec:
  provider:
    aws:
      service: SecretsManager
      region: us-east-1
---
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: xorj-external-secret
  namespace: xorj
spec:
  refreshInterval: 15s
  secretStoreRef:
    name: xorj-secret-store
    kind: SecretStore
  target:
    name: xorj-secrets
    creationPolicy: Owner
  data:
  - secretKey: KILL_SWITCH_MASTER_KEY
    remoteRef:
      key: xorj/kill-switch-master-key
```

## Disaster Recovery

### Backup Procedures

#### 1. Database Backups
```bash
#!/bin/bash
# scripts/backup_database.sh

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups"

# Backup main database
pg_dump -h db-host -U xorj_user trade_execution | gzip > \
  "${BACKUP_DIR}/trade_execution_${DATE}.sql.gz"

# Backup audit database  
pg_dump -h audit-host -U audit_user audit_logs | gzip > \
  "${BACKUP_DIR}/audit_logs_${DATE}.sql.gz"

# Upload to S3 (optional)
aws s3 cp "${BACKUP_DIR}/" s3://xorj-backups/ --recursive

# Clean old backups (keep 30 days)
find "${BACKUP_DIR}" -name "*.sql.gz" -mtime +30 -delete
```

#### 2. Configuration Backups
```bash
#!/bin/bash
# scripts/backup_config.sh

DATE=$(date +%Y%m%d_%H%M%S)

# Backup Kubernetes secrets (encrypted)
kubectl get secrets -n xorj -o yaml | \
  gpg --symmetric --cipher-algo AES256 --armor > \
  "/backups/k8s_secrets_${DATE}.yaml.gpg"

# Backup configuration files
tar -czf "/backups/config_${DATE}.tar.gz" \
  k8s/ \
  monitoring/ \
  scripts/ \
  .env.production.template
```

### Recovery Procedures

#### 1. Database Recovery
```bash
# Restore main database
gunzip -c /backups/trade_execution_YYYYMMDD_HHMMSS.sql.gz | \
  psql -h db-host -U xorj_user trade_execution

# Restore audit database
gunzip -c /backups/audit_logs_YYYYMMDD_HHMMSS.sql.gz | \
  psql -h audit-host -U audit_user audit_logs
```

#### 2. Application Recovery
```bash
# Restore from backup
kubectl apply -f k8s/

# Verify deployment
kubectl get pods -n xorj
kubectl logs -f deployment/xorj-trade-executor -n xorj

# Run health checks
kubectl exec -it deployment/xorj-trade-executor -n xorj -- \
  python -c "from app.core.health import health_check; health_check()"
```

## Maintenance

### Regular Maintenance Tasks

#### 1. Weekly Tasks
```bash
# Check system health
kubectl exec -it deployment/xorj-trade-executor -n xorj -- \
  python -c "
import asyncio
from app.execution.trade_executor import get_trade_executor

async def check():
    executor = await get_trade_executor()
    result = await executor.validate_production_readiness()
    print('Production Ready:', result['production_ready'])
    
asyncio.run(check())
"

# Verify kill switch status
kubectl exec -it deployment/xorj-trade-executor -n xorj -- \
  python -c "
import asyncio  
from app.security.kill_switch import get_global_kill_switch

async def check():
    ks = await get_global_kill_switch()
    status = ks.get_status()
    print('Kill Switch Status:', status['state'])
    print('Authorized Keys:', status['authorized_keys_count'])
    
asyncio.run(check())
"

# Database maintenance
kubectl exec -it postgres-pod -- psql -U xorj_user -d trade_execution -c "VACUUM ANALYZE;"
```

#### 2. Monthly Tasks
```bash
# Rotate kill switch keys (if required)
# HSM key rotation (follow provider guidelines)  
# Update dependencies and security patches
# Review audit logs for anomalies
# Performance optimization review
```

### Rolling Updates

#### 1. Kubernetes Rolling Update
```bash
# Update image
kubectl set image deployment/xorj-trade-executor \
  trade-executor=xorj-trade-executor:v2.0.0 -n xorj

# Monitor rollout
kubectl rollout status deployment/xorj-trade-executor -n xorj

# Rollback if needed
kubectl rollout undo deployment/xorj-trade-executor -n xorj
```

#### 2. Zero-Downtime Update Strategy
```yaml
# Deployment configuration for zero-downtime updates
spec:
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  template:
    spec:
      containers:
      - name: trade-executor
        readinessProbe:
          httpGet:
            path: /health/ready
            port: 8080
          initialDelaySeconds: 30
          periodSeconds: 10
        livenessProbe:
          httpGet:
            path: /health/live  
            port: 8080
          initialDelaySeconds: 60
          periodSeconds: 30
```

This comprehensive deployment guide ensures secure, reliable production deployment of the XORJ Trade Execution Bot with all security requirements properly configured and maintained.