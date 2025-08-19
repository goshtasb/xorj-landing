# FR-2: Calculation Module Documentation

## Overview

The Calculation Module is the mathematical core of the XORJ Quantitative Engine, responsible for calculating performance metrics with high precision using historical price data. This module implements all requirements specified in FR-2 of the PRD.

## Core Requirements Met

✅ **Accurate USD Valuation**: Calculate USD value of every trade at execution time using historical price feeds  
✅ **Five Key Metrics**: Net ROI (%), Maximum Drawdown (%), Sharpe Ratio, Win/Loss Ratio, and Total Trades  
✅ **Rolling 90-Day Periods**: All metrics calculated over configurable rolling windows  
✅ **High-Precision Decimals**: 28-decimal place precision to avoid floating-point inaccuracies  
✅ **Extensive Unit Tests**: Comprehensive test coverage with known inputs and expected outputs  

## Architecture

```
app/calculation/
├── price_feed.py      # Historical price data integration
├── metrics.py         # Performance metrics calculations  
├── service.py         # Integrated calculation service
└── __init__.py        # Module initialization
```

## Components

### 1. Historical Price Feed (`price_feed.py`)

**Purpose**: Provides accurate historical price data for USD valuation at trade execution time.

**Key Features**:
- **Multiple Data Sources**: CoinGecko (primary) and Jupiter APIs (fallback)
- **High-Precision Caching**: TTL-based caching with 28-decimal precision
- **Rate Limiting**: Respects API quotas (CoinGecko: 2 req/sec, Jupiter: 10 req/sec)
- **Batch Processing**: Efficient concurrent price fetching
- **Stablecoin Optimization**: USDC/USDT automatically set to $1.00

**Classes**:
```python
@dataclass
class PricePoint:
    timestamp: datetime
    mint: str
    symbol: str
    price_usd: Decimal        # 28-decimal precision
    source: str
    confidence: float = 1.0

class HistoricalPriceFeed:
    async def get_historical_price(mint, timestamp, symbol) -> PricePoint
    async def get_multiple_historical_prices(requests) -> Dict[str, PricePoint]
```

**Supported Tokens**: SOL, USDC, USDT, RAY, BONK, JUP

### 2. Performance Metrics (`metrics.py`)

**Purpose**: Calculates the five required financial metrics using high-precision arithmetic.

**Key Features**:
- **28-Decimal Precision**: All calculations use Python's Decimal library
- **Rolling Windows**: Configurable period (default: 90 days)
- **Trade Classification**: Automatic buy/sell/swap detection
- **Comprehensive Metrics**: All five metrics plus supporting analytics

**Classes**:
```python
@dataclass
class TradeRecord:
    timestamp: datetime
    signature: str
    trade_type: TradeType
    token_in_usd: Decimal
    token_out_usd: Decimal
    net_profit_usd: Decimal
    fee_usd: Decimal
    # ... additional fields

@dataclass  
class PerformanceMetrics:
    # Core FR-2 metrics
    net_roi_percent: Decimal
    maximum_drawdown_percent: Decimal
    sharpe_ratio: Decimal
    win_loss_ratio: Decimal
    total_trades: int
    
    # Supporting metrics
    total_volume_usd: Decimal
    total_profit_usd: Decimal
    winning_trades: int
    losing_trades: int
    # ... additional analytics

class PerformanceCalculator:
    async def calculate_performance_metrics(wallet, trades, end_date) -> PerformanceMetrics
    async def calculate_trade_usd_values(swap) -> TradeRecord
    async def calculate_batch_metrics(wallet_trades) -> Dict[str, PerformanceMetrics]
```

### 3. Calculation Service (`service.py`)

**Purpose**: Orchestrates all calculation operations and provides a unified interface.

**Key Features**:
- **Service Orchestration**: Coordinates price feeds and metrics calculations
- **Batch Processing**: Efficient multi-wallet processing
- **Portfolio Summaries**: Aggregated analytics across multiple wallets
- **Health Monitoring**: Component health checks and statistics

**Classes**:
```python
class CalculationService:
    async def calculate_wallet_performance(wallet, trades, end_date) -> PerformanceMetrics
    async def calculate_batch_wallet_performance(wallet_trades) -> Dict[str, PerformanceMetrics]
    async def get_portfolio_summary(wallets, wallet_trades) -> Dict[str, any]
    async def get_calculation_health() -> Dict[str, any]
```

## Financial Metrics Detailed

### 1. Net ROI (%)
```python
net_roi_percent = (total_profit_usd / initial_capital) * 100
```
- Measures overall return on investment
- Calculated over rolling 90-day period
- Includes fees in profit calculation

### 2. Maximum Drawdown (%)
```python
# Peak-to-trough decline in cumulative returns
max_drawdown_percent = (peak_value - trough_value) / peak_value * 100
```
- Identifies largest loss from peak to trough
- Critical risk metric for portfolio management
- Expressed as positive percentage

### 3. Sharpe Ratio
```python
sharpe_ratio = (mean_return - risk_free_rate) / std_dev_returns
```
- Risk-adjusted return metric
- Higher values indicate better risk-adjusted performance
- Uses trade-level returns for calculation

### 4. Win/Loss Ratio
```python
win_loss_ratio = winning_trades_count / losing_trades_count
```
- Simple ratio of profitable vs unprofitable trades
- Returns 99999 if no losing trades (infinite)
- Key indicator of trading success rate

### 5. Total Trades
```python
total_trades = len(trades_in_rolling_period)
```
- Count of trades in rolling window
- Used for activity level assessment
- Filters trades by timestamp within period

## API Endpoints

### Performance Metrics Calculation
```http
POST /calculation/performance
Content-Type: application/json
X-API-Key: your-api-key

{
  "wallet_addresses": ["ExampleFR2Wallet..."],
  "end_date": "2024-01-31T23:59:59Z"
}
```

**Response**:
```json
{
  "success": true,
  "wallet_address": "GjJy...",
  "metrics": {
    "net_roi_percent": "15.75",
    "maximum_drawdown_percent": "8.32",
    "sharpe_ratio": "1.85",
    "win_loss_ratio": "2.33",
    "total_trades": 47,
    "total_volume_usd": "125000.50",
    "total_profit_usd": "19688.12",
    "winning_trades": 32,
    "losing_trades": 15
  }
}
```

### Portfolio Summary
```http
POST /calculation/portfolio
Content-Type: application/json
X-API-Key: your-api-key

{
  "wallet_addresses": ["wallet1...", "wallet2..."],
  "end_date": "2024-01-31T23:59:59Z"
}
```

**Response**:
```json
{
  "success": true,
  "portfolio_summary": {
    "analysis_period": {
      "start_date": "2023-11-01T23:59:59Z",
      "end_date": "2024-01-31T23:59:59Z", 
      "period_days": 90
    },
    "portfolio_metrics": {
      "total_wallets": 5,
      "successful_calculations": 5,
      "success_rate": "100.00%",
      "total_trades": 234,
      "total_volume_usd": 875650.25,
      "total_profit_usd": 45320.18,
      "portfolio_roi_percent": 5.18
    },
    "wallet_summaries": {
      "wallet1...": {
        "metrics": { /* individual metrics */ },
        "status": "success"
      }
    }
  }
}
```

### Calculation Health
```http
GET /calculation/health
```

**Response**:
```json
{
  "timestamp": "2024-01-15T12:00:00Z",
  "calculation_service": {
    "status": "healthy",
    "price_feed": {
      "status": "healthy",
      "statistics": {
        "total_cache_entries": 1250,
        "valid_cache_entries": 987,
        "supported_tokens": ["SOL", "USDC", "USDT", "RAY", "BONK", "JUP"]
      }
    },
    "calculator": {
      "status": "healthy"
    }
  }
}
```

## Configuration

### Environment Variables
```bash
# Performance Metrics Configuration
METRICS_ROLLING_PERIOD_DAYS=90
RISK_FREE_RATE_ANNUAL=0.02
METRICS_PRECISION_PLACES=28

# Price Feed APIs
COINGECKO_API_KEY=your_coingecko_key
JUPITER_API_URL=https://price.jup.ag/v6
```

### Settings (`app/core/config.py`)
```python
class Settings:
    # Performance Metrics Configuration
    metrics_rolling_period_days: int = 90
    risk_free_rate_annual: float = 0.02
    metrics_precision_places: int = 28
```

## Testing

### Unit Tests (`tests/test_performance_metrics.py`)

**Coverage**:
- ✅ USD value calculations with known inputs/outputs
- ✅ All five metrics calculations with deterministic data
- ✅ High-precision arithmetic validation
- ✅ Edge cases (empty trades, single trades, etc.)
- ✅ Batch processing and error handling
- ✅ Trade type classification

**Run Tests**:
```bash
cd /Users/aflatoongoshtasb/xorj-landing/quantitative-engine
pytest tests/test_performance_metrics.py -v
```

**Example Test**:
```python
def test_calculate_performance_metrics_comprehensive(self, calculator):
    """Test comprehensive performance metrics with known expected ranges"""
    # Known inputs: 4 trades with specific profit/loss amounts
    # Expected outputs: Precise metrics calculations
    
    trades = self.create_test_trades()  # [+99.50, -50.25, +24.90, -75.15]
    
    metrics = await calc.calculate_performance_metrics("test_wallet", trades)
    
    assert metrics.total_trades == 4
    assert metrics.winning_trades == 2
    assert metrics.losing_trades == 2
    assert metrics.win_loss_ratio == Decimal("1.00")  # 2 wins / 2 losses
    assert metrics.total_profit_usd == Decimal("-1.00")  # Net loss
```

## Error Handling

### Price Feed Errors
- **Rate Limiting**: Automatic backoff with exponential delay
- **API Failures**: Fallback from CoinGecko to Jupiter
- **Missing Data**: Graceful degradation with confidence scores
- **Network Issues**: Retry with circuit breaker pattern

### Calculation Errors
- **Insufficient Data**: Returns None for wallets with no valid trades
- **Division by Zero**: Handled in Sharpe ratio and other ratios
- **Precision Loss**: All calculations maintain 28-decimal precision
- **Invalid Dates**: Proper date parsing and timezone handling

## Performance Considerations

### Optimization Features
- **Concurrent Processing**: Max 3 concurrent wallet calculations
- **Batch Price Fetching**: Reduces API calls via batch requests
- **Intelligent Caching**: 1-hour TTL for historical prices
- **Rate Limiting**: Respects external API quotas

### Resource Usage
- **Memory**: ~50MB for typical calculation workload
- **CPU**: High-precision decimal operations are CPU-intensive
- **Network**: Cached price data reduces external API dependencies
- **Concurrency**: Limited concurrent operations prevent resource exhaustion

## Integration Points

### With Data Ingestion (FR-1)
```python
# Input: RaydiumSwap objects from ingestion module
swap = RaydiumSwap(
    signature="tx_sig",
    block_time=datetime(...),
    token_in=TokenBalance(...),
    token_out=TokenBalance(...),
    # ... other fields
)

# Output: TradeRecord with USD valuations
trade_record = await calculator.calculate_trade_usd_values(swap)
```

### With Future Modules
- **FR-3 Scoring Module**: Will consume PerformanceMetrics for trust score calculation
- **Database Layer**: When implemented, will provide persistent trade data
- **API Module**: Already integrated with FastAPI endpoints

## Monitoring and Observability

### Structured Logging
```json
{
  "timestamp": "2024-01-15T12:00:00Z",
  "level": "INFO",
  "logger": "xorj.calculation",
  "message": "Calculated wallet performance",
  "wallet": "GjJy...",
  "total_trades": 47,
  "net_roi_percent": "15.75",
  "calculation_time_ms": 1250
}
```

### Health Metrics
- **Calculation Success Rate**: Percentage of successful metric calculations
- **Price Feed Health**: API response times and error rates
- **Cache Hit Rates**: Price cache effectiveness
- **Processing Times**: Performance metrics calculation latency

## Security Considerations

### Data Validation
- **Input Sanitization**: All wallet addresses and dates validated
- **Type Safety**: Pydantic models ensure type correctness
- **Precision Bounds**: Decimal calculations bounded to prevent overflow

### API Security
- **Authentication**: API key required for calculation endpoints
- **Rate Limiting**: Request throttling prevents abuse
- **Error Sanitization**: No sensitive data exposed in error messages

## Future Enhancements

### Planned Features
- **Real-time Calculations**: Stream processing for live updates
- **Advanced Metrics**: Additional risk metrics (VaR, Sortino ratio, etc.)
- **Historical Analysis**: Trend analysis over extended periods
- **Benchmarking**: Performance comparison against market indices

### Database Integration
- **Persistent Storage**: Store calculated metrics for historical analysis
- **Query Optimization**: Indexed queries for fast metric retrieval
- **Data Archival**: Long-term storage strategy for historical data

---

**Status**: ✅ **Complete and Production Ready**  
**Coverage**: All FR-2 requirements implemented and tested  
**Dependencies**: FR-1 Data Ingestion Module, External Price APIs  
**Next**: Ready for FR-3 Scoring Module integration