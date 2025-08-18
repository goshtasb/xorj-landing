# XORJ Trade Execution Bot - API Documentation

## Core Components API

### TradeExecutor (`app/execution/trade_executor.py`)

#### Primary Methods

##### `async def execute_trade(trade: GeneratedTrade) -> TradeExecutionResult`
Executes a single trade with comprehensive security validation.

**Execution Pipeline:**
1. **Step 0**: Global kill switch validation (SR-5) - Ultimate override
2. **Step 1**: Circuit breaker validation (SR-4)
3. **Step 2**: Pre-execution validation
4. **Step 3**: Strict slippage validation (SR-2)
5. **Step 4**: Construct Solana transaction
6. **Step 5**: HSM-based transaction signing (SR-1)
7. **Step 6**: Transaction simulation
8. **Step 7**: Network submission
9. **Step 8**: Confirmation monitoring (SR-3)

**Parameters:**
- `trade`: GeneratedTrade object with swap instructions

**Returns:**
- TradeExecutionResult with execution details, transaction signature, and status

**Security Guarantees:**
- Kill switch provides ultimate override
- All private key operations occur within HSM
- Comprehensive audit logging of all attempts

##### `async def execute_trade_batch(trades: List[GeneratedTrade], max_concurrent: int = 3) -> List[TradeExecutionResult]`
Executes multiple trades with concurrency control and batch-level kill switch validation.

**Features:**
- Kill switch check before batch execution
- Priority-based trade ordering
- Configurable concurrency limits
- Exception handling for failed trades

##### `async def validate_production_readiness() -> Dict[str, Any]`
Validates system readiness for production deployment.

**Validation Checks:**
- HSM Manager initialization and health
- Slippage Controller status
- Confirmation Monitor status
- Circuit Breaker Manager status
- Global Kill Switch status and authorized keys
- Production configuration validation

**Returns:**
```python
{
    "production_ready": bool,
    "checks": List[str],
    "warnings": List[str], 
    "errors": List[str]
}
```

### GlobalKillSwitch (`app/security/kill_switch.py`)

#### Primary Methods

##### `async def activate(reason: str, method: ActivationMethod, user_id: str, authorization_key: str) -> bool`
Activates the global kill switch to halt all trading immediately.

**Activation Methods:**
- `MANUAL_API`: Secure API activation
- `ENVIRONMENT_VARIABLE`: Environment variable detection
- `EXTERNAL_SIGNAL`: OS signal activation
- `AUTOMATIC_TRIGGER`: System condition triggers
- `EMERGENCY_OVERRIDE`: Emergency activation

**Security Features:**
- Immediate effect without waiting for operations
- Cryptographic authorization verification
- Comprehensive audit logging

##### `async def deactivate(reason: str, authorization_key: str, user_id: str, force: bool = False) -> bool`
Deactivates kill switch after safety validation.

**Safety Checks:**
- Circuit breaker status validation
- Active transaction monitoring
- System health verification
- Forced deactivation option for emergencies

##### `def get_status() -> Dict[str, Any]`
Returns comprehensive kill switch status.

**Status Information:**
```python
{
    "state": str,  # "armed", "triggered", "recovery_pending", "maintenance"
    "is_active": bool,
    "triggered_at": str,
    "triggered_by": str,
    "trigger_reason": str,
    "activation_method": str,
    "authorized_keys_count": int,
    "total_events": int,
    "monitoring_active": bool,
    "signal_handlers_installed": bool,
    "last_event": Dict[str, Any]
}
```

### CircuitBreakerManager (`app/security/circuit_breakers.py`)

#### Event Recording Methods

##### `async def record_trade_event(success: bool, metadata: Dict[str, Any]) -> bool`
Records trade execution events for failure rate monitoring.

##### `async def record_network_event(success: bool, metadata: Dict[str, Any]) -> bool`
Records network connectivity events.

##### `async def record_hsm_event(success: bool, metadata: Dict[str, Any]) -> bool`
Records HSM operation events for security monitoring.

##### `async def record_slippage_event(success: bool, metadata: Dict[str, Any]) -> bool`
Records slippage control events.

##### `async def record_volatility_event(volatility_percent: Decimal, metadata: Dict[str, Any]) -> bool`
Records market volatility events.

#### Status Methods

##### `def is_trading_allowed() -> Tuple[bool, Optional[str]]`
Returns whether trading is currently allowed and block reason if applicable.

##### `def get_system_status() -> Dict[str, Any]`
Returns comprehensive circuit breaker system status.

**System Status:**
```python
{
    "trading_allowed": bool,
    "block_reason": str,
    "system_halt_active": bool,
    "total_breakers": int,
    "open_breakers": List[str],
    "half_open_breakers": List[str],
    "breaker_details": Dict[str, Dict[str, Any]]
}
```

#### Control Methods

##### `async def activate_system_halt(reason: str, duration_minutes: int = None)`
Activates system-wide trading halt.

##### `async def force_open_breaker(breaker_type: CircuitBreakerType, reason: str) -> bool`
Manually opens a specific circuit breaker.

##### `async def force_close_breaker(breaker_type: CircuitBreakerType, reason: str) -> bool`
Manually closes a specific circuit breaker.

### SlippageController (`app/security/slippage_controller.py`)

#### Primary Methods

##### `async def validate_trade_slippage(trade: GeneratedTrade) -> SlippageAnalysisResult`
Validates trade slippage before execution.

**Analysis Result:**
```python
{
    "approved": bool,
    "estimated_slippage_percent": Decimal,
    "max_allowed_slippage": Decimal,
    "risk_level": RiskLevel,
    "violation_type": SlippageViolationType,
    "rejection_reason": str,
    "market_analysis": Dict[str, Any]
}
```

**Risk Levels:**
- `LOW`: < 0.5% estimated slippage
- `MEDIUM`: 0.5% - 2% estimated slippage  
- `HIGH`: 2% - 5% estimated slippage
- `CRITICAL`: > 5% estimated slippage

### ConfirmationMonitor (`app/security/confirmation_monitor.py`)

#### Primary Methods

##### `async def monitor_transaction(trade: GeneratedTrade, transaction_signature: str, trade_value_usd: Decimal) -> str`
Starts monitoring transaction confirmation based on trade value.

**Confirmation Requirements:**
- **High Value** ($10k+): 3 confirmations, 5-minute timeout, finalization required
- **Medium Value** ($1k-$10k): 2 confirmations, 3-minute timeout
- **Low Value** ($100-$1k): 1 confirmation, 2-minute timeout
- **Small Value** (<$100): 1 confirmation, 1-minute timeout

##### `async def get_transaction_status(monitor_id: str) -> Dict[str, Any]`
Returns current transaction monitoring status.

**Transaction States:**
- `SUBMITTED`: Transaction sent to network
- `PENDING`: Awaiting confirmations
- `CONFIRMED`: Required confirmations received
- `FAILED`: Transaction failed
- `TIMEOUT`: Confirmation timeout exceeded
- `STUCK`: Transaction appears stuck

### HSMManager (`app/security/hsm_manager.py`)

#### Primary Methods

##### `async def sign_transaction(transaction: Transaction, user_id: str, trade_context: Dict[str, Any]) -> Transaction`
Signs transaction using HSM-managed private key.

**Security Guarantees:**
- Private key never leaves HSM boundary
- All signing operations occur within HSM
- Comprehensive audit logging of all operations
- Provider-specific implementation (AWS KMS, Azure, Google Cloud)

##### `async def get_public_key() -> PublicKey`
Retrieves public key for verification (private key stays in HSM).

##### `async def health_check() -> Dict[str, Any]`
Performs HSM connectivity and health verification.

**Health Check Result:**
```python
{
    "status": str,  # "healthy", "degraded", "failed"
    "provider": str,
    "connectivity": bool,
    "last_operation_time": str,
    "error": str
}
```

## Data Models

### GeneratedTrade (`app/models/trades.py`)

```python
class GeneratedTrade:
    trade_id: str
    user_id: str
    vault_address: str
    trade_type: TradeType
    swap_instruction: SwapInstruction
    rationale: str
    priority: int
    risk_score: Decimal
    status: TradeStatus
    created_at: datetime
    execution_error: Optional[str]
```

### SwapInstruction (`app/models/trades.py`)

```python
class SwapInstruction:
    from_token_symbol: str
    to_token_symbol: str
    from_mint: str
    to_mint: str
    from_amount: Decimal
    max_slippage_percent: Decimal
```

### CircuitBreakerConfig (`app/security/circuit_breakers.py`)

```python
class CircuitBreakerConfig:
    breaker_type: CircuitBreakerType
    name: str
    description: str
    failure_threshold: int
    time_window_minutes: int
    consecutive_failure_limit: int
    recovery_timeout_minutes: int
    percentage_threshold: Optional[Decimal]
    absolute_threshold: Optional[Decimal]
```

## Configuration

### TradeExecutionConfig (`app/core/config.py`)

```python
class TradeExecutionConfig:
    # Environment
    environment: str = "development"
    
    # HSM Configuration (SR-1)
    hsm_provider: str = "aws_kms"
    aws_kms_key_id: Optional[str]
    azure_key_vault_url: Optional[str]
    google_kms_project_id: Optional[str]
    
    # Solana Network
    solana_rpc_url: str
    vault_program_id: str
    
    # External Services
    quantitative_engine_url: str
    quantitative_engine_api_key: str
    
    # Database
    database_url: str
    audit_log_database_url: str
    
    # Security Settings
    max_trade_value_usd: Decimal = Decimal("100000")
    default_slippage_tolerance: Decimal = Decimal("1.0")
```

## Error Handling

### Exception Hierarchy

#### HSM Exceptions
- `HSMConnectionError`: HSM connectivity issues
- `HSMSigningError`: Transaction signing failures  
- `HSMConfigurationError`: HSM setup problems

#### Trading Exceptions
- `TradeValidationError`: Trade validation failures
- `SlippageViolationError`: Slippage limit violations
- `CircuitBreakerError`: Circuit breaker blocking

#### Network Exceptions
- `SolanaNetworkError`: Blockchain connectivity issues
- `TransactionFailedError`: On-chain transaction failures
- `ConfirmationTimeoutError`: Transaction confirmation timeouts

## Usage Examples

### Basic Trade Execution

```python
from app.execution.trade_executor import get_trade_executor
from app.models.trades import GeneratedTrade, SwapInstruction

# Initialize trade executor
executor = await get_trade_executor()

# Create trade
swap = SwapInstruction(
    from_token_symbol="USDC",
    to_token_symbol="JUP", 
    from_mint="EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    to_mint="JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
    from_amount=Decimal("1000.0"),
    max_slippage_percent=Decimal("1.0")
)

trade = GeneratedTrade(
    trade_id="trade_001",
    user_id="user_001", 
    vault_address="vault_address",
    trade_type=TradeType.SWAP,
    swap_instruction=swap,
    rationale="Portfolio rebalancing"
)

# Execute trade (includes all security validations)
result = await executor.execute_trade(trade)
print(f"Success: {result.success}, Signature: {result.transaction_signature}")
```

### Kill Switch Operations

```python
from app.security.kill_switch import get_global_kill_switch

# Get kill switch instance
kill_switch = await get_global_kill_switch()

# Activate kill switch
await kill_switch.activate(
    reason="Emergency market conditions",
    method=ActivationMethod.MANUAL_API,
    user_id="admin_001",
    authorization_key="master_key"
)

# Check status
status = kill_switch.get_status()
print(f"Active: {status['is_active']}, Reason: {status['trigger_reason']}")

# Deactivate (requires authorization)
await kill_switch.deactivate(
    reason="Emergency resolved",
    authorization_key="master_key", 
    user_id="admin_001"
)
```

### Circuit Breaker Monitoring

```python
from app.security.circuit_breakers import get_circuit_breaker_manager

# Get circuit breaker manager
cb_manager = await get_circuit_breaker_manager()

# Record events
await cb_manager.record_trade_event(
    success=True,
    metadata={"trade_id": "trade_001", "amount": "1000.0"}
)

# Check system status
status = cb_manager.get_system_status()
print(f"Trading allowed: {status['trading_allowed']}")
print(f"Open breakers: {status['open_breakers']}")
```

## Testing

### Test Categories

#### Unit Tests
- Individual component functionality
- Security validation logic
- Error handling scenarios
- Configuration validation

#### Integration Tests
- Cross-component interaction
- Database integration
- HSM integration testing
- Network connectivity testing

#### Security Tests
- Kill switch activation/deactivation
- Circuit breaker triggering
- HSM signing validation
- Slippage protection testing

#### End-to-End Tests
- Complete trade execution flows
- Failure scenario testing
- Recovery procedure testing
- Production readiness validation

### Test Execution

```bash
# Run all tests
python -m pytest tests/ -v

# Run security tests only
python -m pytest tests/security/ -v

# Run with coverage
python -m pytest tests/ --cov=app --cov-report=html
```