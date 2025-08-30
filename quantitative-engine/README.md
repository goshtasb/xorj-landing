# XORJ Quantitative Engine

The core backend analytical engine for the XORJ trading platform. This service functions as the "brain" of the entire system, securely ingesting and analyzing public on-chain Solana data to calculate and serve the proprietary XORJ Trust Score.

## 🎯 Overview

This containerized, modular service implements **FR-1: Data Ingestion Module** and **FR-2: Calculation Module** as specified in the PRD, providing:

- **Scheduled Data Ingestion**: Configurable worker that runs every 4 hours to fetch Raydium swap data
- **High-Precision Calculations**: 28-decimal place precision for all financial calculations
- **Performance Metrics**: Net ROI, Maximum Drawdown, Sharpe Ratio, Win/Loss Ratio, and Total Trades over rolling 90-day periods
- **USD Valuation**: Accurate trade valuation using historical price feeds at execution time
- **Robust Error Handling**: Exponential backoff retry logic for transient RPC/API failures
- **Comprehensive Validation**: Strict schema validation for all ingested data
- **High Performance**: Concurrent processing with rate limiting and monitoring

## 🏗️ Architecture

The engine consists of four core modules:

1. **Ingestion Module**: Fetches and validates raw data from Solana RPC (Helius) ✅
2. **Calculation Module**: High-precision financial metrics with historical USD valuation ✅
3. **Scoring Module**: Implements XORJ Trust Score algorithm (future)
4. **API Module**: Secure internal REST API for serving results ✅

## 📊 Financial Metrics (FR-2)

The Calculation Module provides five key performance metrics over rolling 90-day periods:

### Core Metrics
1. **Net ROI (%)** - Overall return on investment percentage
2. **Maximum Drawdown (%)** - Peak-to-trough decline in portfolio value  
3. **Sharpe Ratio** - Risk-adjusted return measurement
4. **Win/Loss Ratio** - Ratio of profitable to unprofitable trades
5. **Total Trades** - Number of trades executed in the period

### Key Features
- **28-Decimal Precision**: All calculations use high-precision arithmetic to avoid floating-point errors
- **Historical USD Valuation**: Accurate trade values calculated using price data at exact execution time
- **Multi-Source Price Feeds**: CoinGecko (primary) and Jupiter (fallback) for reliable pricing
- **Rolling Windows**: Configurable period analysis (default: 90 days)
- **Comprehensive Testing**: Extensive unit tests with known inputs and expected outputs

### Supported Tokens
SOL, USDC, USDT, RAY, BONK, JUP with mint address mapping and automatic price resolution

## 🚀 Quick Start

### Prerequisites

- Docker & Docker Compose
- Python 3.12+ (for local development)
- Helius API key (recommended)

### Environment Setup

1. **Clone and setup environment:**
```bash
cp .env.example .env
# Edit .env with your configuration
```

2. **Start with Docker Compose:**
```bash
docker-compose up -d
```

3. **Verify health:**
```bash
curl http://localhost:8000/health
```

### Local Development

1. **Install dependencies:**
```bash
pip install -r requirements.txt
```

2. **Start services:**
```bash
# Terminal 1: Start the API server
uvicorn app.main:app --reload

# Terminal 2: Start Celery worker
celery -A app.worker worker --loglevel=info

# Terminal 3: Start Celery beat (scheduler)
celery -A app.worker beat --loglevel=info
```

## 📋 Configuration

Key environment variables:

```bash
# Solana RPC Configuration
SOLANA_RPC_URL=https://api.devnet.solana.com
HELIUS_API_KEY=your_helius_api_key_here
SOLANA_COMMITMENT_LEVEL=confirmed

# Scheduling
INGESTION_SCHEDULE_HOURS=4
MAX_CONCURRENT_WORKERS=2

# Data Validation
MAX_TRANSACTIONS_PER_WALLET=10000
MIN_TRADE_VALUE_USD=1.0
SUPPORTED_TOKENS=SOL,USDC,USDT,RAY,BONK,JUP

# Retry Configuration
MAX_RETRIES=3
RETRY_BACKOFF_MULTIPLIER=2
MAX_RETRY_DELAY_SECONDS=300

# Performance Metrics Configuration (FR-2)
METRICS_ROLLING_PERIOD_DAYS=90
RISK_FREE_RATE_ANNUAL=0.02
METRICS_PRECISION_PLACES=28

# Price Feed APIs (FR-2)  
COINGECKO_API_KEY=your_coingecko_api_key  # Optional
JUPITER_API_URL=https://price.jup.ag/v6
```

## 🔄 Scheduled Operation

The engine runs automatically every 4 hours (configurable):

1. **Fetches monitored wallet list** (currently hardcoded demo wallets)
2. **Retrieves transaction signatures** for each wallet since last run
3. **Filters for Raydium program transactions** (675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8)
4. **Fetches full transaction data** with batching and rate limiting
5. **Parses and validates swap data** using strict schema validation
6. **Stores results** (database integration pending)

## 🛡️ Error Handling & Resilience

The engine implements robust error handling as required:

- **Exponential Backoff**: Automatic retry with configurable backoff multiplier
- **Rate Limiting**: Respects RPC rate limits (10 requests/second default)
- **Timeout Handling**: Configurable timeouts with graceful degradation
- **Circuit Breaking**: Automatic failure detection and recovery
- **Comprehensive Logging**: Structured logging with correlation IDs

### Error Categories

- **Transient Errors**: Network timeouts, rate limits, temporary RPC failures
- **Validation Errors**: Invalid transaction data, unsupported tokens
- **System Errors**: Database failures, memory issues, configuration errors

## 📊 API Endpoints

### Health Check
```bash
GET /health
```
Returns comprehensive system health status.

### Manual Ingestion (Development)
```bash
POST /ingestion/manual
Content-Type: application/json
X-API-Key: your-api-key

{
  "wallet_addresses": ["GjJy..."],
  "lookback_hours": 24
}
```

### Performance Metrics Calculation
```bash
POST /calculation/performance
Content-Type: application/json
X-API-Key: your-api-key

{
  "wallet_addresses": ["GjJy..."],
  "end_date": "2024-01-31T23:59:59Z"
}
```

### Portfolio Summary
```bash
POST /calculation/portfolio
Content-Type: application/json  
X-API-Key: your-api-key

{
  "wallet_addresses": ["GjJy...", "Abc1..."],
  "end_date": "2024-01-31T23:59:59Z"
}
```

### Calculation Health
```bash
GET /calculation/health
```

### System Statistics
```bash
GET /stats
X-API-Key: your-api-key
```

## 📈 Monitoring

The engine provides comprehensive monitoring:

- **Health Checks**: Automated health monitoring every 5 minutes
- **Metrics**: Processing statistics, success rates, error counts
- **Structured Logging**: JSON-formatted logs with correlation tracking
- **Performance Tracking**: Response times, throughput, resource usage

### Key Metrics

- **Wallets Processed**: Number of wallets successfully analyzed
- **Swaps Extracted**: Valid Raydium swaps found and parsed
- **Error Rate**: Percentage of failed operations
- **Processing Time**: Average time per wallet
- **Success Rate**: Percentage of successful ingestion runs

## 🗄️ Data Schema

### RaydiumSwap Model
```python
{
  "signature": "transaction_signature",
  "block_time": "2024-01-01T12:00:00Z", 
  "wallet_address": "wallet_pubkey",
  "status": "success|failed|pending",
  "swap_type": "swapBaseIn|swapBaseOut|swap",
  "token_in": {
    "mint": "token_mint_address",
    "symbol": "SOL",
    "amount": "123.456",
    "decimals": 9,
    "usd_value": "456.78"
  },
  "token_out": {
    "mint": "token_mint_address", 
    "symbol": "USDC",
    "amount": "456.78",
    "decimals": 6,
    "usd_value": "456.78"
  },
  "pool_id": "raydium_pool_address",
  "fee_lamports": 5000,
  "fee_usd": "0.01"
}
```

## 🔒 Security

- **API Key Authentication**: Required for all sensitive endpoints
- **Origin Validation**: CORS protection for production deployments
- **Input Validation**: Strict schema validation for all inputs
- **Rate Limiting**: Protection against abuse
- **Error Sanitization**: No sensitive data in error responses

## 🐳 Docker Deployment

The engine is designed for containerized deployment:

```bash
# Production build
docker build -t xorj-quantitative-engine .

# Run with environment
docker run -d \
  --name xorj-engine \
  -p 8000:8000 \
  -e HELIUS_API_KEY=your_key \
  -e DATABASE_URL=postgresql://... \
  xorj-quantitative-engine
```

## 📝 Logs

Structured JSON logging with contextual information:

```json
{
  "timestamp": "2024-01-01T12:00:00.000Z",
  "level": "INFO",
  "logger": "xorj.ingestion", 
  "message": "Starting wallet processing",
  "wallet": "GjJy...",
  "operation": "wallet_ingestion",
  "correlation_id": "abc123"
}
```

## 🧪 Testing

### System Health Tests
```bash
# Run comprehensive health check
curl http://localhost:8000/health

# Test calculation service health
curl http://localhost:8000/calculation/health

# Get system statistics
curl http://localhost:8000/stats
```

### Data Ingestion Tests  
```bash
# Test manual ingestion (development mode)
curl -X POST http://localhost:8000/ingestion/manual \
  -H "Content-Type: application/json" \
  -d '{
    "wallet_addresses": ["ExampleIngestionWallet..."],
    "lookback_hours": 24
  }'
```

### Performance Calculation Tests (FR-2)
```bash
# Test single wallet performance metrics
curl -X POST http://localhost:8000/calculation/performance \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-internal-api-key" \
  -d '{
    "wallet_addresses": ["ExamplePerformanceWallet..."],
    "end_date": "2024-01-31T23:59:59Z"
  }'

# Test portfolio summary for multiple wallets  
curl -X POST http://localhost:8000/calculation/portfolio \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-internal-api-key" \
  -d '{
    "wallet_addresses": ["wallet1...", "wallet2..."],
    "end_date": "2024-01-31T23:59:59Z"
  }'
```

### Unit Tests
```bash
# Run comprehensive unit test suite
pytest tests/ -v

# Run specific performance metrics tests  
pytest tests/test_performance_metrics.py -v

# Run tests with coverage report
pytest --cov=app tests/
```

### Development Tools
```bash
# View Celery monitoring (development)
# Visit http://localhost:5555 (Flower UI)

# Access API documentation (development)  
# Visit http://localhost:8000/docs (Swagger UI)
```

## 📚 Documentation

Comprehensive documentation is available in the `/docs` directory:

- **[📋 Documentation Index](docs/README.md)** - Navigation and overview
- **[🎯 Project Overview](docs/Project_Overview.md)** - Complete system architecture
- **[📊 FR-2 Calculation Module](docs/FR2_Calculation_Module.md)** - Performance metrics deep dive
- **[💰 Price Feed Integration](docs/Price_Feed_Integration.md)** - Historical pricing architecture
- **[🌐 API Documentation](docs/API_Documentation.md)** - Complete REST API reference

## 🔮 Next Steps

### Immediate (FR-3)
- **Scoring Module**: XORJ Trust Score algorithm implementation
- **Database Integration**: PostgreSQL for persistent storage and historical analysis

### Medium Term  
- **Real-time Processing**: Stream processing for live metric updates
- **Advanced Metrics**: Value at Risk, Sortino ratio, additional risk metrics
- **Performance Optimization**: Query optimization, advanced caching strategies

### Long Term
- **Machine Learning**: Predictive analytics and pattern recognition
- **Multi-Chain Support**: Extend beyond Solana to other blockchains
- **Horizontal Scaling**: Multi-instance deployment with load balancing
- **Advanced Monitoring**: Prometheus metrics, alerting, and observability

## 📄 License

Proprietary - XORJ Trading Platform

---

**Status**: ✅ FR-1 Data Ingestion Module Complete | ✅ FR-2 Calculation Module Complete
**Next**: FR-3 Scoring Module Implementation