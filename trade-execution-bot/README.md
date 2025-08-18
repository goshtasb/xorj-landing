# XORJ Trade Execution Bot

## Overview

The XORJ Trade Execution Bot is the **final and most critical component** of the XORJ ecosystem. It translates intelligence from the Quantitative Engine into secure, risk-managed trades with **absolute security and flawless reliability** as its prime directives. This component has the unique authority to manage user funds.

**Prime Directives**:
- 🔒 **Absolute Security**: Zero-compromise security with HSM-managed keys
- ⚡ **Flawless Reliability**: Precise and dependable trade execution
- 🛡️ **Risk Management**: Strict protocols to protect user capital
- 🎯 **Strategy Replication**: Accurately mirror top-performing traders
- 🛑 **Ultimate Control**: Global kill switch for instant system halt

## 🚀 Status: PRODUCTION READY

✅ **All Core Requirements Implemented**:
- ✅ FR-1: Scheduled Polling & Strategy Ingestion
- ✅ FR-2: Portfolio Reconciliation  
- ✅ FR-3: Trade Generation Logic
- ✅ FR-4: Smart Contract Interaction & Execution

✅ **All Security Requirements Implemented**:
- ✅ SR-1: Secure Key Management (HSM)
- ✅ SR-2: Strict Slippage Control
- ✅ SR-3: Transaction Confirmation & Error Handling  
- ✅ SR-4: Automated Circuit Breakers
- ✅ SR-5: Global Kill Switch

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    XORJ Trade Execution Bot                     │
├─────────────────────────────────────────────────────────────────┤
│                       Security Layer                            │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐   │
│  │ SR-5: Global    │ │ SR-4: Circuit   │ │ SR-1: HSM Key   │   │
│  │ Kill Switch     │ │    Breakers     │ │   Management    │   │
│  │ (Ultimate       │ │ (Automated      │ │ (Secure         │   │
│  │  Override)      │ │  Protection)    │ │  Signing)       │   │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘   │
│  ┌─────────────────┐ ┌─────────────────┐                       │
│  │ SR-2: Slippage  │ │ SR-3: Tx        │                       │
│  │    Control      │ │ Confirmation    │                       │
│  │ (Risk Mgmt)     │ │ (Monitoring)    │                       │
│  └─────────────────┘ └─────────────────┘                       │
├─────────────────────────────────────────────────────────────────┤
│                     Processing Layer                            │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐   │
│  │   Input Layer   │ │  Trade Engine   │ │   Output Layer  │   │
│  │ • Strategy      │ │ • Generation    │ │ • Blockchain    │   │
│  │   Ingestion     │ │ • Risk Mgmt     │ │   Execution     │   │
│  │ • Portfolio     │ │ • Validation    │ │ • Confirmation  │   │
│  │   Reconciliation│ │ • Orchestration │ │ • Audit Logging │   │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## 🔧 System Integration Points

### Input Sources
1. **Intelligence Input**: Polls ranked traders from XORJ Quantitative Engine
   - Endpoint: `GET /internal/ranked-traders`
   - Data: Trust scores, performance metrics, strategy data
   - Frequency: Configurable (default: every 5 minutes)

2. **User Settings Input**: Risk profiles and preferences
   - Conservative: Trust score >95%, 0.5% slippage limit
   - Moderate: Trust score >90%, 1.0% slippage limit  
   - Aggressive: Trust score >85%, 2.0% slippage limit

### Output Actions
1. **On-Chain Action**: XORJ Vault Smart Contract interactions
   - Network: Solana blockchain
   - Operations: Token swaps via Raydium/Jupiter DEX
   - Security: HSM-signed transactions only

2. **Audit Logging**: Immutable audit trail
   - Database: PostgreSQL with blockchain-style chaining
   - Integrity: Cryptographic verification of all entries
   - Compliance: Complete transaction history preservation

## 🏗️ Core Components

### 1. Trade Execution Engine (`app/execution/trade_executor.py`)

**8-Step Secure Execution Pipeline**:
0. **Global Kill Switch Validation** (SR-5) - Ultimate override
1. **Circuit Breaker Validation** (SR-4) - Automated protection  
2. **Pre-execution Validation** - Trade readiness checks
3. **Strict Slippage Validation** (SR-2) - Risk management
4. **Transaction Construction** - Solana transaction building
5. **HSM-based Transaction Signing** (SR-1) - Secure execution
6. **Transaction Simulation** - Pre-flight verification
7. **Network Submission** - Blockchain broadcasting
8. **Confirmation Monitoring** (SR-3) - Execution verification

**Key Features**:
- Batch execution with concurrency control
- Comprehensive error handling and recovery
- Real-time status monitoring
- Production readiness validation

### 2. Strategy Ingestion System (`app/core/strategy_selector.py`)

**FR-1: Scheduled Polling & Strategy Ingestion**
- **Trust Score Thresholds**: Risk-based trader selection
- **API Integration**: Secure communication with Quantitative Engine
- **Data Validation**: Comprehensive input sanitization
- **Caching Strategy**: Optimized performance with data freshness

### 3. Portfolio Reconciliation (`app/integrations/solana_client.py`)

**FR-2: Portfolio Reconciliation**
- **Blockchain Reading**: Real-time vault balance verification
- **Delta Calculation**: Target vs actual allocation comparison
- **Reconciliation Logic**: Precise rebalancing requirements
- **State Management**: Comprehensive portfolio tracking

### 4. Trade Generation Logic (`app/core/trade_generator.py`)

**FR-3: Trade Generation Logic**
- **Swap Instructions**: Precise token exchange calculations
- **Example Logic**: "100% JUP target → Swap 100% USDC for JUP"
- **Risk Assessment**: Trade risk scoring and validation
- **Priority Management**: Trade execution ordering

## 🔐 Security Implementation

### SR-1: Secure Key Management (HSM)
**Location**: `app/security/hsm_manager.py`

**Critical Security Guarantee**: Private keys NEVER leave HSM boundary

**Supported Providers**:
- **AWS KMS** (Production recommended)
- **Azure Key Vault** (Production ready)
- **Google Cloud KMS** (Production ready)  
- **Hardware HSM** (Maximum security)

**Features**:
- Zero private key exposure
- Health monitoring and automatic failover
- Comprehensive audit logging (CRITICAL severity)
- Provider abstraction for seamless switching

### SR-2: Strict Slippage Control
**Location**: `app/security/slippage_controller.py`

**Multi-Layer Protection**:
- Pre-execution market impact analysis
- Risk-based dynamic limits
- Circuit breaker integration
- Real-time volatility assessment

**Risk-Based Limits**:
- Conservative: 0.5% maximum slippage
- Moderate: 1.0% maximum slippage
- Aggressive: 2.0% maximum slippage

### SR-3: Transaction Confirmation & Error Handling
**Location**: `app/security/confirmation_monitor.py`

**Value-Based Confirmation Requirements**:
| Trade Value | Confirmations | Timeout | Finalization |
|-------------|--------------|---------|--------------|
| $10,000+    | 3           | 5 min   | Required     |
| $1,000-$9,999 | 2         | 3 min   | Optional     |
| $100-$999   | 1           | 2 min   | Optional     |
| <$100       | 1           | 1 min   | Optional     |

**Error Recovery Strategies**:
- **Exponential Backoff**: Network errors, rate limiting
- **Linear Backoff**: Program errors, timeouts
- **Transaction Replacement**: Blockhash expiry, compute budget exceeded
- **No Retry**: Insufficient funds, slippage exceeded

### SR-4: Automated Circuit Breakers
**Location**: `app/security/circuit_breakers.py`

**7 Independent Circuit Breakers**:

1. **Trade Failure Rate**: 5 failures/10 min OR 3 consecutive
2. **Network Connectivity**: 3 failures/5 min OR 2 consecutive
3. **Market Volatility**: 10 events/30 min, >50% volatility threshold
4. **HSM Failure Rate**: 3 failures/10 min (CRITICAL - highest priority)
5. **Slippage Rate**: 8 rejections/15 min OR 4 consecutive
6. **System Error Rate**: 10 errors/20 min OR 5 consecutive
7. **Confirmation Timeout**: 5 timeouts/30 min OR 3 consecutive

**Circuit States**: CLOSED (normal) → OPEN (blocked) → HALF_OPEN (testing) → CLOSED (recovered)

### SR-5: Global Kill Switch
**Location**: `app/security/kill_switch.py`

**Ultimate System Override**: Absolute authority to instantly halt ALL trading

**Multiple Activation Methods**:
- **Manual API**: Secure authenticated endpoint
- **Environment Variable**: `KILL_SWITCH_ACTIVE=true`
- **Kill File**: `/tmp/xorj_kill_switch` file detection
- **OS Signals**: SIGUSR1 (graceful), SIGUSR2 (emergency)
- **Automatic Triggers**: System condition detection

**Kill Switch States**:
- **ARMED**: Ready for operation, monitoring active
- **TRIGGERED**: All trading halted immediately  
- **RECOVERY_PENDING**: Recovery initiated, awaiting authorization
- **MAINTENANCE**: Planned maintenance mode

**Authorization System**:
- Multi-key recovery with HMAC verification
- Tamper-resistant event logging
- Safety validation before recovery
- Complete audit trail with cryptographic integrity

## 📊 Audit & Compliance

### Immutable Audit Logging
**Location**: `app/logging/audit_logger.py`

**Blockchain-Style Event Chaining**:
```python
class AuditLogEntry:
    entry_id: str
    timestamp: datetime
    event_type: AuditEventType
    severity: AuditSeverity
    user_id: str
    event_details: Dict[str, Any]
    previous_hash: str         # Links to previous entry
    current_hash: str          # SHA-256 hash of entry
    verification_signature: str # HMAC verification
```

**Event Categories**:
- **TRADE_EXECUTION**: All trade attempts and results
- **SECURITY_VIOLATION**: Kill switch, circuit breaker, slippage violations
- **SYSTEM_EVENT**: Component initialization, recovery, shutdown
- **ERROR_EVENT**: System errors and exceptions
- **KEY_OPERATION**: HSM operations and key management

## 🚀 Getting Started

### Prerequisites
- **Python 3.11+**
- **PostgreSQL 12+** (for audit logs)
- **HSM Provider** (AWS KMS, Azure Key Vault, Google Cloud KMS, or Hardware HSM)
- **Solana RPC Access** (mainnet for production)

### Installation

1. **Clone Repository**
   ```bash
   git clone https://github.com/xorj/trade-execution-bot
   cd trade-execution-bot
   ```

2. **Install Dependencies**
   ```bash
   pip install -r requirements.txt
   ```

3. **Configure Environment**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Initialize Database**
   ```bash
   python -m app.database.migrate
   ```

5. **Validate Production Readiness**
   ```bash
   python -c "
   import asyncio
   from app.execution.trade_executor import get_trade_executor
   
   async def validate():
       executor = await get_trade_executor()
       result = await executor.validate_production_readiness()
       
       if result['production_ready']:
           print('✅ Production Ready!')
           for check in result['checks']:
               print(f'  ✓ {check}')
       else:
           print('❌ Production validation failed!')
           for error in result['errors']:
               print(f'  ✗ {error}')
               
   asyncio.run(validate())
   "
   ```

### Basic Usage

```python
from app.execution.trade_executor import get_trade_executor
from app.models.trades import GeneratedTrade, SwapInstruction

# Initialize trade executor (includes all security validations)
executor = await get_trade_executor()

# Create trade
trade = GeneratedTrade(
    trade_id="trade_001",
    user_id="user_001",
    vault_address="vault_address",
    trade_type=TradeType.SWAP,
    swap_instruction=SwapInstruction(
        from_token_symbol="USDC",
        to_token_symbol="JUP",
        from_mint="EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        to_mint="JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
        from_amount=Decimal("1000.0"),
        max_slippage_percent=Decimal("1.0")
    ),
    rationale="Portfolio rebalancing"
)

# Execute trade (8-step secure pipeline)
result = await executor.execute_trade(trade)
print(f"Success: {result.success}")
print(f"Transaction: {result.transaction_signature}")
```

## 🛠️ Configuration

### Environment Variables

```bash
# Environment
ENVIRONMENT=production
DEBUG=false

# Database
DATABASE_URL=postgresql://user:password@host:5432/trade_execution
AUDIT_LOG_DATABASE_URL=postgresql://user:password@host:5432/audit_logs

# Solana Network  
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
VAULT_PROGRAM_ID=your_vault_program_id

# HSM Configuration (choose one)
HSM_PROVIDER=aws_kms
AWS_KMS_KEY_ID=your_key_id

# Security
MAX_TRADE_VALUE_USD=100000
DEFAULT_SLIPPAGE_TOLERANCE=1.0

# Kill Switch
KILL_SWITCH_MASTER_KEY=generate_secure_256_bit_key
KILL_SWITCH_EMERGENCY_KEY=generate_different_secure_key

# External Services
QUANTITATIVE_ENGINE_URL=https://api.xorj.com
QUANTITATIVE_ENGINE_API_KEY=your_api_key
```

### HSM Provider Setup

#### AWS KMS
```bash
aws kms create-key --description "XORJ Trade Execution" --usage SIGN_VERIFY --spec ECC_NIST_P256
```

#### Azure Key Vault
```bash
az keyvault key create --vault-name your-vault --name trade-executor-key --kty EC --curve P-256
```

#### Google Cloud KMS
```bash
gcloud kms keys create trade-executor-key --location global --keyring your-ring --purpose asymmetric-signing --default-algorithm ec-sign-p256-sha256
```

## 📦 Deployment

### Docker Deployment
```bash
# Build production image
docker build -f Dockerfile.prod -t xorj-trade-executor:latest .

# Run with production configuration
docker run -d --name xorj-trade-executor --env-file .env.production xorj-trade-executor:latest
```

### Kubernetes Deployment
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: xorj-trade-executor
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
        envFrom:
        - secretRef:
            name: xorj-secrets
        readinessProbe:
          httpGet:
            path: /health/ready
            port: 8080
        livenessProbe:
          httpGet:
            path: /health/live
            port: 8080
```

## 🔍 Monitoring & Operations

### Health Checks
- `/health/live` - Kubernetes liveness probe
- `/health/ready` - Kubernetes readiness probe  
- `/health/detailed` - Comprehensive system status

### Metrics (Prometheus)
- `xorj_trades_total` - Total trades executed
- `xorj_trade_duration_seconds` - Trade execution duration
- `xorj_kill_switch_activations_total` - Kill switch activations
- `xorj_circuit_breaker_trips_total` - Circuit breaker trips
- `xorj_hsm_operations_total` - HSM operations

### Emergency Operations

#### Kill Switch Activation
```python
from app.security.kill_switch import get_global_kill_switch

# Activate kill switch
kill_switch = await get_global_kill_switch()
await kill_switch.activate(
    reason="Emergency market conditions",
    method=ActivationMethod.MANUAL_API,
    authorization_key="master_key"
)
```

#### System Recovery
```python
# Deactivate after issue resolution
await kill_switch.deactivate(
    reason="Emergency resolved",
    authorization_key="recovery_key",
    user_id="incident_commander"
)
```

## 🧪 Testing

### Test Suite Coverage
- **Unit Tests**: Individual component functionality
- **Integration Tests**: Cross-component interaction
- **Security Tests**: All security requirements validation
- **End-to-End Tests**: Complete trade execution flows

### Running Tests
```bash
# All tests
python -m pytest tests/ -v

# Security tests only  
python -m pytest tests/security/ -v

# With coverage
python -m pytest tests/ --cov=app --cov-report=html
```

### Security Test Examples
```bash
# Test kill switch functionality
python -m pytest tests/security/test_kill_switch.py -v

# Test circuit breaker logic
python -m pytest tests/security/test_circuit_breakers.py -v

# Test HSM integration
python -m pytest tests/security/test_hsm_manager.py -v
```

## 📚 Documentation

- **[Architecture Guide](docs/ARCHITECTURE.md)**: Comprehensive system design
- **[API Documentation](docs/API.md)**: Complete API reference
- **[Security Documentation](docs/SECURITY.md)**: Security model and threat analysis
- **[Deployment Guide](docs/DEPLOYMENT.md)**: Production deployment procedures

## 🔐 Security Features Summary

### Defense-in-Depth Architecture
1. **Layer 0**: Global Kill Switch (Ultimate override)
2. **Layer 1**: Circuit Breakers (Automated protection)  
3. **Layer 2**: Slippage Control (Risk management)
4. **Layer 3**: HSM Security (Secure execution)
5. **Layer 4**: Confirmation Monitoring (Execution verification)

### Key Security Guarantees
- ✅ **Zero Private Key Exposure**: All signing within HSM boundary
- ✅ **Immediate Emergency Control**: Kill switch halts all operations instantly
- ✅ **Automated Risk Management**: Circuit breakers prevent cascading failures
- ✅ **Comprehensive Audit Trail**: Immutable logging with cryptographic integrity
- ✅ **Multi-Layer Validation**: Every trade passes through 8 security checkpoints

## 🤝 Contributing

### Development Setup
1. Fork the repository
2. Create feature branch: `git checkout -b feature/your-feature`
3. Install dependencies: `pip install -r requirements-dev.txt`
4. Run tests: `python -m pytest tests/ -v`
5. Submit pull request

### Code Standards
- **Security First**: All code must pass security review
- **Comprehensive Testing**: 90%+ test coverage required
- **Documentation**: All public APIs must be documented
- **Type Hints**: Full type annotation required

## 📄 License

Copyright (c) 2024 XORJ. All rights reserved.

This software is proprietary and confidential. Unauthorized copying, distribution, or use is strictly prohibited.

## 🆘 Support

### Emergency Contacts
- **Security Issues**: security@xorj.com
- **System Outages**: ops@xorj.com  
- **General Support**: support@xorj.com

### Documentation & Resources
- **Architecture**: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- **Security Model**: [docs/SECURITY.md](docs/SECURITY.md)
- **API Reference**: [docs/API.md](docs/API.md)
- **Deployment**: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)

---

## 🎯 Production Readiness Checklist

- ✅ All Functional Requirements (FR-1 through FR-4) implemented
- ✅ All Security Requirements (SR-1 through SR-5) implemented  
- ✅ HSM integration with production-grade providers
- ✅ Global kill switch with multiple activation methods
- ✅ Automated circuit breakers with recovery mechanisms
- ✅ Comprehensive audit logging with integrity verification
- ✅ Production deployment documentation complete
- ✅ Security hardening and threat mitigation implemented
- ✅ Monitoring, alerting, and incident response procedures
- ✅ Disaster recovery and business continuity planning

**The XORJ Trade Execution Bot is production-ready with enterprise-grade security.**

---

*XORJ Trade Execution Bot - The final and most critical component with absolute authority over user fund management. Built with defense-in-depth security and fail-safe defaults to ensure the highest level of protection and reliability.*