# XORJ Quantitative Engine Documentation

## 📚 Documentation Index

This directory contains comprehensive documentation for the XORJ Quantitative Engine, covering all aspects of the system from architecture to API usage.

### Core Documentation

#### 🎯 [Project Overview](Project_Overview.md)
**Complete system overview and architecture guide**
- Executive summary of all modules
- Technology stack and architecture decisions  
- File structure and component organization
- Configuration management and deployment
- Performance characteristics and scaling
- Development roadmap and quality assurance

#### 📊 [FR-2: Calculation Module](FR2_Calculation_Module.md) 
**Detailed documentation for the performance metrics calculation engine**
- Five required financial metrics implementation
- High-precision decimal arithmetic (28 places)
- Rolling 90-day period calculations
- USD valuation at trade execution time
- Comprehensive unit testing with known I/O
- Integration with price feeds and APIs

#### 💰 [Price Feed Integration](Price_Feed_Integration.md)
**Historical price data architecture and implementation**
- Multi-source pricing strategy (CoinGecko + Jupiter)
- High-precision caching and rate limiting
- Supported tokens and confidence scoring
- Batch processing and error handling
- Performance optimization and monitoring
- Security considerations and API management

#### 🌐 [API Documentation](API_Documentation.md)
**Complete REST API reference guide**
- All endpoint specifications with examples
- Request/response schemas and data models
- Authentication and error handling
- Rate limiting and usage patterns
- Development vs production differences
- Python and JavaScript SDK examples

### Quick Navigation

| Documentation | Purpose | Audience |
|---------------|---------|----------|
| [Project Overview](Project_Overview.md) | System architecture & deployment | DevOps, Architects, PM |
| [FR-2 Calculation Module](FR2_Calculation_Module.md) | Financial calculations deep-dive | Developers, QA |  
| [Price Feed Integration](Price_Feed_Integration.md) | Price data architecture | Developers, Integration |
| [API Documentation](API_Documentation.md) | REST API reference | Frontend, Integration |

### Implementation Status

| Module | Status | Documentation |
|--------|--------|---------------|
| **FR-1: Data Ingestion** | ✅ Complete | Covered in Project Overview |
| **FR-2: Calculation Module** | ✅ Complete | [Dedicated guide](FR2_Calculation_Module.md) |
| **FR-3: Scoring Module** | 📋 Planned | TBD |
| **FR-4: API Module** | ✅ Complete | [API Documentation](API_Documentation.md) |
| **Price Feed Integration** | ✅ Complete | [Price Feed Guide](Price_Feed_Integration.md) |

### Getting Started

For new developers or integrators, we recommend this reading order:

1. **Start Here**: [Project Overview](Project_Overview.md) - Get the big picture
2. **API Usage**: [API Documentation](API_Documentation.md) - Understand the interface  
3. **Deep Dive**: [FR-2 Calculation Module](FR2_Calculation_Module.md) - Core functionality
4. **Integration**: [Price Feed Integration](Price_Feed_Integration.md) - External dependencies

### Key Concepts

#### High-Precision Financial Calculations
The engine uses Python's Decimal library with 28-decimal place precision to avoid floating-point errors in financial calculations. This ensures accuracy for all monetary computations.

#### Rolling Period Analytics  
All performance metrics are calculated over configurable rolling periods (default: 90 days), providing current and historical performance views.

#### Multi-Source Price Feeds
Historical USD valuations use multiple data sources (CoinGecko primary, Jupiter fallback) with intelligent caching and rate limiting.

#### Production-Ready Architecture
Containerized deployment with comprehensive health monitoring, structured logging, and error handling suitable for production environments.

### Technical Requirements

#### Supported Tokens
- **SOL**: Solana native token
- **USDC**: USD Coin stablecoin  
- **USDT**: Tether stablecoin
- **RAY**: Raydium protocol token
- **BONK**: Bonk meme token
- **JUP**: Jupiter aggregator token

#### Performance Metrics (FR-2)
1. **Net ROI (%)**: Overall return on investment
2. **Maximum Drawdown (%)**: Peak-to-trough decline  
3. **Sharpe Ratio**: Risk-adjusted returns
4. **Win/Loss Ratio**: Profitable vs unprofitable trades
5. **Total Trades**: Trade count in period

#### External Dependencies
- **Solana RPC**: Blockchain data (Helius recommended)
- **CoinGecko API**: Historical price data
- **Jupiter API**: Real-time Solana token prices
- **Redis**: Task queue and caching
- **PostgreSQL**: Persistent storage (planned)

### Development Workflow

#### Local Development
```bash
# Quick start with Docker
docker-compose --profile dev up

# Or local Python development  
./scripts/start.sh local
```

#### Testing
```bash
# Run comprehensive test suite
pytest tests/ -v

# Test specific calculations
pytest tests/test_performance_metrics.py -v
```

#### API Testing
```bash
# Health check
curl http://localhost:8000/health

# Calculation health  
curl http://localhost:8000/calculation/health
```

### Support & Contributing

#### Issue Reporting
- **Bugs**: Use structured issue templates
- **Features**: Reference PRD specifications
- **Performance**: Include profiling data

#### Code Quality Standards
- **Type Safety**: Full mypy type checking
- **Testing**: >90% coverage for core logic  
- **Documentation**: Comprehensive docstrings
- **Formatting**: Black code formatter

#### Integration Support
- **API Questions**: See [API Documentation](API_Documentation.md)
- **Calculation Issues**: Reference [FR-2 Module Guide](FR2_Calculation_Module.md)
- **Price Feed Problems**: Check [Price Feed Integration](Price_Feed_Integration.md)

---

## 📋 Document Status

| Document | Version | Last Updated | Status |
|----------|---------|--------------|--------|
| [Project Overview](Project_Overview.md) | 1.0 | 2024-01-15 | ✅ Current |
| [FR-2 Calculation Module](FR2_Calculation_Module.md) | 1.0 | 2024-01-15 | ✅ Current |
| [Price Feed Integration](Price_Feed_Integration.md) | 1.0 | 2024-01-15 | ✅ Current |
| [API Documentation](API_Documentation.md) | 1.0 | 2024-01-15 | ✅ Current |

---

**Documentation Maintained By**: XORJ Development Team  
**Engine Version**: 1.0.0  
**Last Updated**: January 15, 2024