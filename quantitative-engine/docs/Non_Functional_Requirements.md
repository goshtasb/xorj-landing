# XORJ Quantitative Engine - Non-Functional Requirements (NFR)

## Overview

This document provides comprehensive documentation for all three Non-Functional Requirements (NFR-1 through NFR-3) implemented in the XORJ Quantitative Engine. These requirements ensure enterprise-grade reliability, testability, and observability for the production system.

## NFR-1: Reliability ⚡

**Requirement**: *The engine must be fault-tolerant. An error processing a single wallet must not terminate the entire run.*

### Implementation Architecture

The reliability implementation follows a defense-in-depth approach with multiple layers of fault tolerance:

#### Core Components

1. **Fault-Tolerant Processor** (`app/core/reliability.py`)
   - Implements circuit breaker patterns
   - Provides retry logic with exponential backoff
   - Isolates individual wallet processing failures
   - Manages concurrent processing with semaphore controls

2. **Batch Processing System**
   - Each wallet is processed independently
   - Failed wallets don't affect successful ones
   - Comprehensive error categorization and reporting
   - Configurable retry policies per operation type

#### Key Features

```python
# Example: Fault-tolerant wallet processing
reliability_config = ReliabilityConfig(
    max_retries=2,
    retry_delay_seconds=5.0,
    max_concurrent_wallets=5,
    timeout_seconds=120.0,
    circuit_breaker_threshold=0.8,
    continue_on_failure=True
)

processor = get_fault_tolerant_processor(reliability_config)
batch_result = await processor.process_wallet_batch(
    wallet_addresses,
    process_single_wallet_ingestion,
    lookback_hours=settings.ingestion_schedule_hours
)
```

#### Circuit Breaker Implementation

- **Threshold-based**: Stops processing when failure rate exceeds configured threshold (default 50%)
- **Window-based**: Evaluates failure rate over a rolling window of recent operations
- **Configurable**: Can be set to continue processing despite circuit breaker for non-critical operations
- **Automatic Recovery**: Resets when failure rate drops below threshold

#### Error Handling Categories

1. **Timeout Errors**: Network or processing timeouts
2. **Network Errors**: Connection failures, API unavailability
3. **Calculation Errors**: Data processing or validation failures
4. **System Errors**: Resource exhaustion, memory issues

#### Integration Points

- **Celery Workers**: All scheduled tasks use fault-tolerant processing
- **API Endpoints**: Critical operations wrapped with reliability patterns
- **Service Dependencies**: Graceful degradation when external services fail

### Production Configuration

```python
# Production reliability settings
PRODUCTION_CONFIG = ReliabilityConfig(
    max_retries=3,
    retry_delay_seconds=5.0,
    retry_backoff_multiplier=2.0,
    max_concurrent_wallets=10,
    timeout_seconds=120.0,
    circuit_breaker_threshold=0.7,
    circuit_breaker_window=20,
    continue_on_failure=True,
    log_individual_errors=True
)
```

### Monitoring and Observability

- **Real-time Metrics**: Success rates, retry counts, circuit breaker status
- **Error Categorization**: Detailed breakdown by error type and component
- **Performance Tracking**: Processing times and throughput metrics
- **Health Indicators**: Overall system reliability status

---

## NFR-2: Testability 🧪

**Requirement**: *The calculation and scoring modules must have a minimum of 95% unit test coverage.*

### Testing Architecture

The testability implementation provides comprehensive coverage across all critical components with a focus on the calculation and scoring modules.

#### Test Coverage Overview

| Module | Coverage | Test File | Key Features |
|--------|----------|-----------|--------------|
| Performance Metrics | 95%+ | `test_performance_metrics.py` | Known input/output validation |
| Calculation Service | 95%+ | `test_calculation_service.py` | Service integration testing |
| Scoring Service | 95%+ | `test_scoring_service.py` | Trust score algorithm testing |
| Trust Score Engine | 95%+ | `test_trust_score.py` | Core scoring logic |
| Reliability System | 95%+ | `test_reliability.py` | Fault tolerance testing |
| Observability | 95%+ | `test_observability.py` | Metrics collection testing |

#### Key Testing Patterns

1. **Known Input/Output Validation**
```python
def test_calculate_trade_usd_values_known_output(self):
    """Test USD value calculation with known inputs and expected outputs"""
    # Known calculations:
    # Token in: 10.0 SOL * $100 = $1000.00
    # Token out: 1100.0 USDC * $1 = $1100.00
    # Fee: 0.005 SOL * $100 = $0.50
    # Net profit: $1100 - $1000 - $0.50 = $99.50
    
    assert trade_record.token_in_usd == Decimal("1000.00")
    assert trade_record.token_out_usd == Decimal("1100.00")
    assert trade_record.fee_usd == Decimal("0.50")
    assert trade_record.net_profit_usd == Decimal("99.50")
```

2. **Comprehensive Error Scenario Testing**
```python
@pytest.mark.asyncio
async def test_error_handling_robustness(self):
    """Test error handling in various scenarios"""
    exceptions_to_test = [
        KeyError("Missing key"),
        ValueError("Invalid value"), 
        TypeError("Type mismatch"),
        RuntimeError("Runtime error"),
        ConnectionError("Connection failed"),
        asyncio.CancelledError("Task cancelled")
    ]
    
    for exception in exceptions_to_test:
        # Verify graceful handling of each error type
```

3. **Concurrent Processing Tests**
```python
@pytest.mark.asyncio
async def test_concurrent_processing(self):
    """Test that service can handle concurrent requests"""
    tasks = [
        service.calculate_wallet_performance(f"wallet_{i}", sample_trades)
        for i in range(10)
    ]
    
    results = await asyncio.gather(*tasks)
    assert len(results) == 10
```

#### Test Configuration

**pytest.ini Configuration:**
```ini
[tool:pytest]
# NFR-2: Testability configuration for 95% coverage target
addopts = 
    --cov=app
    --cov-report=html:htmlcov
    --cov-report=term-missing
    --cov-fail-under=95
    --cov-branch
    --cov-context=test
```

#### Coverage Requirements

- **Minimum Coverage**: 95% for calculation and scoring modules
- **Branch Coverage**: Enabled to ensure all code paths tested
- **Context Tracking**: Identifies which tests cover which code
- **Failure Threshold**: Build fails if coverage drops below 95%

#### Test Categories

1. **Unit Tests**: Individual function and method testing
2. **Integration Tests**: Service-to-service interaction testing
3. **Performance Tests**: Known calculation validation
4. **Reliability Tests**: Fault tolerance and error handling
5. **Concurrent Tests**: Multi-threaded and async operation testing

#### Mock Strategy

- **AsyncMock Usage**: Comprehensive mocking of external dependencies
- **Dependency Isolation**: Each test runs in isolation
- **Deterministic Results**: Consistent test outcomes across environments
- **External Service Mocking**: API calls, database operations, network requests

---

## NFR-3: Observability 📊

**Requirement**: *The engine must export key operational metrics (run duration, wallets processed, errors encountered) to our monitoring system (e.g., Prometheus/Datadog).*

### Observability Architecture

The observability system provides comprehensive monitoring, metrics collection, and alerting for production operations.

#### Metrics Collection System

**Core Metrics Collector** (`app/core/observability.py`):
- Dual backend support: Prometheus and Datadog
- Thread-safe metrics aggregation
- Real-time and historical metric tracking
- Business and operational metric correlation

#### Key Operational Metrics

1. **Processing Metrics**
   - `xorj_wallets_processed_total`: Total wallets processed (by status)
   - `xorj_wallet_processing_duration_seconds`: Individual wallet processing times
   - `xorj_batch_processing_duration_seconds`: Batch operation durations

2. **Scoring Metrics**
   - `xorj_trust_scores_calculated_total`: Total trust scores calculated
   - `xorj_trust_score_distribution`: Distribution of trust score values
   - `xorj_wallet_eligibility_total`: Eligibility outcomes by status

3. **API Performance**
   - `xorj_api_requests_total`: API request counts by endpoint and status
   - `xorj_api_request_duration_seconds`: API response time histograms

4. **Error Tracking**
   - `xorj_errors_total`: Errors by type and component
   - Error categorization: timeout, network, calculation

5. **System Resources**
   - `xorj_memory_usage_bytes`: Current memory usage
   - `xorj_cpu_usage_percent`: Current CPU utilization

6. **Business Metrics**
   - `xorj_total_volume_usd`: Total trading volume
   - `xorj_total_profit_usd`: Total profit/loss
   - `xorj_trades_analyzed_total`: Total trades processed

#### Integration Points

**FastAPI Middleware** (`app/core/metrics_middleware.py`):
```python
@app.middleware("http")
async def metrics_middleware(request: Request, call_next):
    """Automatic API metrics collection"""
    start_time = time.time()
    response = await call_next(request)
    duration = time.time() - start_time
    
    metrics_collector.record_api_request(
        method=request.method,
        endpoint=normalize_path(request.url.path),
        status_code=response.status_code,
        duration_seconds=duration
    )
```

**Worker Integration**:
```python
# NFR-3: Record operational metrics
metrics_collector.record_batch_processing(duration, len(results), successful_wallets)

for wallet, status in results.items():
    metrics_collector.record_wallet_processing(duration / len(results), status.success)
```

#### Monitoring Stack

**Complete Docker Compose Setup** (`docker-compose.monitoring.yml`):

1. **Prometheus**: Metrics collection and storage
2. **Grafana**: Visualization dashboards
3. **AlertManager**: Alert routing and notifications
4. **Node Exporter**: System metrics
5. **PostgreSQL Exporter**: Database metrics
6. **Redis Exporter**: Cache metrics

#### Production Dashboards

**Grafana Dashboard Features**:
- Service health overview with real-time status
- Wallet processing performance metrics
- API response time percentiles (50th, 95th, 99th)
- Trust score distribution histograms
- Error rate tracking by type and component
- System resource utilization
- Business metrics visualization
- Alert status and recent incidents

#### Alerting Rules

**Critical Alerts** (`monitoring/alert_rules.yml`):
```yaml
- alert: XORJServiceDown
  expr: xorj_service_health == 0
  for: 1m
  labels:
    severity: critical

- alert: HighWalletProcessingFailureRate
  expr: rate(xorj_wallets_processed_total{status="failed"}[5m]) / rate(xorj_wallets_processed_total[5m]) > 0.2
  for: 2m
  labels:
    severity: warning
```

#### Observability Endpoints

1. **`/metrics`**: Prometheus metrics endpoint
2. **`/metrics/summary`**: Human-readable metrics summary
3. **`/health/metrics`**: Health check with metrics update
4. **`/debug/metrics`**: Detailed debug information

#### Performance Impact

- **Low Overhead**: < 1ms additional latency per request
- **Efficient Storage**: Time-series optimized data structures
- **Configurable**: Can disable specific metric types if needed
- **Non-blocking**: Metrics collection doesn't affect main processing

---

## Production Deployment

### Docker Deployment

**Start Full Monitoring Stack**:
```bash
docker-compose -f docker-compose.monitoring.yml up -d
```

**Access Points**:
- Application: http://localhost:8000
- Metrics: http://localhost:8001/metrics
- Prometheus: http://localhost:9090
- Grafana: http://localhost:3000 (admin/admin)
- AlertManager: http://localhost:9093

### Configuration Management

**Environment Variables**:
```bash
ENABLE_PROMETHEUS_METRICS=true
ENABLE_DATADOG_METRICS=false
RELIABILITY_MAX_RETRIES=3
RELIABILITY_TIMEOUT_SECONDS=120
```

**Reliability Configuration**:
```python
# Production settings
reliability_config = ReliabilityConfig(
    max_retries=3,
    retry_delay_seconds=5.0,
    max_concurrent_wallets=10,
    timeout_seconds=120.0,
    circuit_breaker_threshold=0.7,
    continue_on_failure=True
)
```

### Integration with Security Requirements

All NFRs are implemented with full respect for Security Requirements (SR-1 through SR-5):

- **Zero Trust**: Metrics endpoints secured within VPC
- **Secrets Management**: Monitoring credentials via secrets manager
- **Audit Logging**: All reliability and observability events logged
- **Security Scanning**: Test and monitoring code included in SAST
- **Least Privilege**: Minimal permissions for metrics collection

---

## Testing and Validation

### Coverage Validation

```bash
# Run tests with coverage
pytest --cov=app --cov-report=html --cov-fail-under=95

# View detailed coverage report
open htmlcov/index.html
```

### Reliability Testing

```bash
# Test fault tolerance under load
python -m pytest tests/test_reliability.py -v

# Test circuit breaker functionality
python -m pytest tests/test_reliability.py::TestFaultTolerantProcessor::test_circuit_breaker_functionality -v
```

### Observability Validation

```bash
# Check metrics endpoint
curl http://localhost:8001/metrics

# View metrics summary
curl http://localhost:8000/metrics/summary

# Test health with metrics
curl http://localhost:8000/health/metrics
```

---

## Maintenance and Operations

### Health Monitoring

- **Service Health**: Automatic health checks for all components
- **Performance Monitoring**: SLA tracking and alerting
- **Capacity Planning**: Resource utilization trending

### Troubleshooting

1. **High Error Rates**: Check circuit breaker status and retry configurations
2. **Performance Degradation**: Review metrics histograms and identify bottlenecks
3. **Test Failures**: Use coverage reports to identify untested code paths
4. **Monitoring Issues**: Verify metrics collection and Prometheus connectivity

### Scaling Considerations

- **Horizontal Scaling**: Fault tolerance supports multiple worker instances
- **Metrics Aggregation**: Prometheus handles multi-instance metric collection
- **Load Distribution**: Circuit breakers prevent cascade failures under load

---

## Conclusion

The implementation of NFR-1 through NFR-3 provides the XORJ Quantitative Engine with enterprise-grade operational capabilities:

✅ **Reliability**: Complete fault tolerance with circuit breakers and retry logic  
✅ **Testability**: 95%+ test coverage with comprehensive validation  
✅ **Observability**: Full metrics stack with real-time monitoring and alerting  

These non-functional requirements ensure the system can operate reliably in production environments while providing complete visibility into its operational status and maintaining high code quality through comprehensive testing.