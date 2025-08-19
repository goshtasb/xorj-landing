# XORJ Quantitative Engine API Documentation

## Overview

The XORJ Quantitative Engine provides a RESTful API for data ingestion, performance calculations, and system monitoring. This API is designed for internal use within the XORJ trading platform ecosystem.

## Base URL

```
Development: http://localhost:8000
Production: https://api.xorj.io/quantitative
```

## Authentication

All endpoints require API key authentication via the `X-API-Key` header:

```http
X-API-Key: your-internal-api-key
```

**Development Environment**: Use the development API key: `DEV_API_KEY=dev-xorj-quantitative-engine-key`

**Production Environment**: Use the secure production API key provided via environment variables.

## Content Type

All requests and responses use JSON:

```http
Content-Type: application/json
```

## Error Responses

All endpoints return structured error responses:

```json
{
  "error": "Error Type",
  "message": "Human-readable error description",
  "timestamp": "2024-01-15T12:00:00.000Z",
  "detail": "Additional error context (optional)"
}
```

**HTTP Status Codes**:
- `200`: Success
- `400`: Bad Request (invalid input)
- `401`: Unauthorized (missing/invalid API key)
- `404`: Not Found
- `500`: Internal Server Error
- `503`: Service Unavailable

## Endpoints

### System Health

#### GET /health

Returns basic system health status.

**Authentication**: None required

**Response**: `200 OK`
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T12:00:00.000Z"
}
```

**Degraded Response**: `503 Service Unavailable`
```json
{
  "status": "unhealthy",
  "timestamp": "2024-01-15T12:00:00.000Z"
}
```

#### GET /status/detailed

Returns comprehensive system health status with detailed metrics.

**Authentication**: Required

**Response**: `200 OK`
```json
{
  "healthy": true,
  "timestamp": "2024-01-15T12:00:00.000Z",
  "version": "1.0.0",
  "environment": "development",
  "components": {
    "solana_client": true,
    "ingestion_worker": true,
    "calculation_service": true,
    "database": true
  },
  "details": {
    "solana": {
      "rpc_url": "https://api.devnet.solana.com",
      "current_slot": 245123456,
      "request_count": 1234,
      "error_rate": "0.02%"
    },
    "ingestion": {
      "total_wallets_processed": 156,
      "total_swaps_extracted": 2341,
      "last_run_timestamp": "2024-01-15T11:00:00.000Z",
      "success_rate": "98.5%"
    },
    "calculation": {
      "calculation_service": "healthy",
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
    },
    "response_time_seconds": 0.145,
    "settings": {
      "max_concurrent_workers": 2,
      "ingestion_schedule_hours": 4,
      "supported_tokens": ["SOL", "USDC", "USDT", "RAY", "BONK", "JUP"]
    }
  }
}
```

### Data Ingestion

#### POST /ingestion/manual

Trigger manual data ingestion for specific wallets.

**Authentication**: Required

**Request Body**:
```json
{
  "wallet_addresses": [
    "ExampleAPIWallet...",
    "AnotherWalletAddress123456789012345678901234567890"
  ],
  "lookback_hours": 24,
  "start_date": "2024-01-01T00:00:00Z",
  "end_date": "2024-01-31T23:59:59Z"
}
```

**Parameters**:
- `wallet_addresses` (required): Array of Solana wallet addresses (max 100)
- `lookback_hours` (optional): Hours to look back from current time
- `start_date` (optional): ISO datetime string for ingestion start
- `end_date` (optional): ISO datetime string for ingestion end

**Parameter Precedence Rules**:
- If `start_date` is provided, `lookback_hours` will be ignored
- If both `start_date` and `end_date` are provided, the explicit date range will be used
- If only `start_date` is provided, ingestion runs until current time
- If only `lookback_hours` is provided, ingestion runs from (now - lookback_hours) to now
- If no time parameters are provided, defaults to last 24 hours

**Response**: `200 OK`
```json
{
  "success": true,
  "message": "Ingestion task queued successfully",
  "task_id": "celery-task-uuid-123456789",
  "processed_wallets": 2,
  "results": {
    "status": "queued",
    "task_id": "celery-task-uuid-123456789"
  }
}
```

**Error Response**: `400 Bad Request`
```json
{
  "error": "Bad Request",
  "message": "Maximum 100 wallet addresses per request",
  "timestamp": "2024-01-15T12:00:00.000Z"
}
```

#### GET /ingestion/status/{task_id}

Get the status of a queued ingestion task.

**Authentication**: Required

**Parameters**:
- `task_id` (required): The task ID returned by POST /ingestion/manual

**Success Response**: `200 OK`
```json
{
  "task_id": "celery-task-uuid-123456789",
  "status": "completed",
  "message": "Ingestion completed for 2 wallets",
  "processed_wallets": 2,
  "results": {
    "successful_wallets": 2,
    "wallet_details": {
      "ExampleAPIWallet...": {
        "success": true,
        "swaps_extracted": 47,
        "errors": 0
      },
      "AnotherWalletAddress123456789012345678901234567890": {
        "success": true,
        "swaps_extracted": 23,
        "errors": 1
      }
    }
  },
  "completed_at": "2024-01-15T12:05:00.000Z"
}
```

**In Progress Response**: `200 OK`
```json
{
  "task_id": "celery-task-uuid-123456789",
  "status": "in_progress",
  "message": "Processing wallet 1 of 2",
  "processed_wallets": 0,
  "results": {
    "progress": "50%"
  }
}
```

**Failed Response**: `200 OK`
```json
{
  "task_id": "celery-task-uuid-123456789",
  "status": "failed",
  "message": "Ingestion failed due to RPC timeout",
  "processed_wallets": 0,
  "results": {
    "error": "Connection timeout to Solana RPC"
  },
  "failed_at": "2024-01-15T12:03:00.000Z"
}
```

**Error Response**: `404 Not Found`
```json
{
  "error": "Not Found",
  "message": "Task ID not found",
  "timestamp": "2024-01-15T12:00:00.000Z"
}
```

### Performance Calculations

#### POST /calculation/performance

Calculate performance metrics for a single wallet.

**Authentication**: Required

**Request Body**:
```json
{
  "wallet_address": "ExampleAPIWallet...",
  "end_date": "2024-01-31T23:59:59Z"
}
```

**Parameters**:
- `wallet_address` (required): Single Solana wallet address
- `end_date` (optional): ISO datetime for calculation end point (defaults to now)

**Success Response**: `200 OK`
```json
{
  "success": true,
  "wallet_address": "ExampleAPIWallet...",
  "metrics": {
    "period_start": "2023-11-01T23:59:59Z",
    "period_end": "2024-01-31T23:59:59Z",
    "total_trades": 47,
    "net_roi_percent": "15.75",
    "maximum_drawdown_percent": "8.32",
    "sharpe_ratio": "1.85",
    "win_loss_ratio": "2.33",
    "total_volume_usd": "125000.50",
    "total_fees_usd": "425.75",
    "total_profit_usd": "19688.12",
    "winning_trades": 32,
    "losing_trades": 15,
    "average_trade_size_usd": "2659.58",
    "largest_win_usd": "2150.00",
    "largest_loss_usd": "-1890.25",
    "average_holding_period_hours": "48.5"
  }
}
```

**No Data Response**: `200 OK`
```json
{
  "success": false,
  "wallet_address": "ExampleAPIWallet...",
  "error": "No trades found in rolling period or insufficient data for calculation"
}
```

**Error Response**: `400 Bad Request`
```json
{
  "error": "Bad Request", 
  "message": "wallet_address is required and must be a valid Solana public key",
  "timestamp": "2024-01-15T12:00:00.000Z"
}
```

#### POST /calculation/portfolio

Calculate portfolio summary for multiple wallets.

**Authentication**: Required

**Request Body**:
```json
{
  "wallet_addresses": [
    "ExampleAPIWallet...",
    "AnotherWalletAddress123456789012345678901234567890",
    "ThirdWalletAddress567890123456789012345678901234"
  ],
  "end_date": "2024-01-31T23:59:59Z"
}
```

**Parameters**:
- `wallet_addresses` (required): Array of wallet addresses (max 50)
- `end_date` (optional): ISO datetime for calculation end point (defaults to now)

**Success Response**: `200 OK`
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
      "total_wallets": 3,
      "successful_calculations": 3,
      "success_rate": "100.00%",
      "total_trades": 156,
      "total_volume_usd": 875650.25,
      "total_profit_usd": 45320.18,
      "total_fees_usd": 2150.75,
      "portfolio_roi_percent": 5.18,
      "average_trade_size_usd": 5613.78
    },
    "wallet_summaries": {
      "ExampleAPIWallet...": {
        "metrics": {
          "total_trades": 47,
          "net_roi_percent": "15.75",
          "maximum_drawdown_percent": "8.32",
          "sharpe_ratio": "1.85",
          "win_loss_ratio": "2.33",
          "total_profit_usd": "19688.12"
        },
        "status": "success"
      },
      "AnotherWalletAddress123456789012345678901234567890": {
        "metrics": {
          "total_trades": 63,
          "net_roi_percent": "8.92",
          "maximum_drawdown_percent": "15.67",
          "sharpe_ratio": "1.23",
          "win_loss_ratio": "1.85",
          "total_profit_usd": "15632.06"
        },
        "status": "success"
      },
      "ThirdWalletAddress567890123456789012345678901234": {
        "metrics": null,
        "status": "failed"
      }
    },
    "calculation_timestamp": "2024-01-15T12:00:00.000Z"
  }
}
```

**Error Response**: `400 Bad Request`
```json
{
  "error": "Bad Request",
  "message": "Maximum 50 wallet addresses per portfolio calculation",
  "timestamp": "2024-01-15T12:00:00.000Z"
}
```

#### GET /calculation/health

Get calculation service health status.

**Authentication**: None required

**Response**: `200 OK`
```json
{
  "timestamp": "2024-01-15T12:00:00.000Z",
  "calculation_service": {
    "calculation_service": "healthy",
    "price_feed": {
      "status": "healthy",
      "statistics": {
        "total_cache_entries": 1250,
        "valid_cache_entries": 987,
        "cache_hit_rate": "calculated_per_request",
        "supported_tokens": ["SOL", "USDC", "USDT", "RAY", "BONK", "JUP"],
        "rate_limits": {
          "coingecko": 0.5,
          "jupiter": 0.1,
          "fallback": 1.0
        },
        "last_request_times": {
          "coingecko": 1705320000.123,
          "jupiter": 1705319950.456
        }
      }
    },
    "calculator": {
      "status": "healthy"
    }
  }
}
```

**Error Response**: `503 Service Unavailable`
```json
{
  "timestamp": "2024-01-15T12:00:00.000Z",
  "calculation_service": {
    "status": "error",
    "error": "Price feed initialization failed"
  }
}
```

### System Statistics

#### GET /stats

Get comprehensive system statistics and metrics.

**Authentication**: Required

**Response**: `200 OK`
```json
{
  "timestamp": "2024-01-15T12:00:00.000Z",
  "worker_statistics": {
    "total_wallets_processed": 1250,
    "total_swaps_extracted": 18750,
    "total_processing_time_seconds": 15632.5,
    "last_run_timestamp": "2024-01-15T11:00:00.000Z",
    "success_rate": "98.8%",
    "error_count": 15,
    "average_processing_time_per_wallet": 12.5
  },
  "client_health": {
    "healthy": true,
    "rpc_url": "https://api.devnet.solana.com",
    "current_slot": 245123456,
    "request_count": 5678,
    "error_count": 12,
    "error_rate": "0.21%",
    "average_response_time": 245.6
  },
  "system_info": {
    "environment": "development",
    "version": "1.0.0",
    "supported_tokens": ["SOL", "USDC", "USDT", "RAY", "BONK", "JUP"],
    "configuration": {
      "max_transactions_per_wallet": 10000,
      "ingestion_schedule_hours": 4,
      "max_concurrent_workers": 2
    }
  }
}
```

### Root Endpoint

#### GET /

Returns basic service information and documentation link.

**Authentication**: None required

**Response**: `200 OK`
```json
{
  "message": "XORJ Quantitative Engine",
  "docs": "/docs"
}
```

## Rate Limiting

### Internal Rate Limits

The API implements internal rate limiting for external service calls:

- **CoinGecko API**: 2 requests per second (free tier)
- **Jupiter API**: 10 requests per second
- **Concurrent Processing**: Max 5 concurrent price fetches

### Recommended Usage Patterns

- **Batch Operations**: Use portfolio endpoints for multiple wallets
- **Caching**: Results are cached internally; repeated requests are efficient
- **Async Processing**: Large ingestion jobs are queued in production

## Data Models

### Wallet Address Format

All wallet addresses must be valid Solana public keys:
- Length: 44 characters
- Base58 encoded
- Example: `ExampleAPIWallet...`

### DateTime Format

All timestamps use ISO 8601 format with UTC timezone:
- Format: `YYYY-MM-DDTHH:mm:ssZ`
- Example: `2024-01-15T12:00:00Z`
- Timezone: Always UTC (Z suffix required)

### Decimal Precision

All financial values maintain high precision:
- Format: String representation of decimal number
- Precision: Up to 28 decimal places
- Example: `"125000.123456789012345678901234567890"`

### Token Symbols

Supported tokens with their symbols:
- `SOL`: Solana
- `USDC`: USD Coin
- `USDT`: Tether
- `RAY`: Raydium
- `BONK`: Bonk
- `JUP`: Jupiter

## Error Handling

### Common Error Scenarios

1. **Invalid Wallet Address**
   ```json
   {
     "error": "Bad Request",
     "message": "Invalid wallet address format",
     "detail": "Wallet addresses must be valid Solana public keys"
   }
   ```

2. **Missing API Key**
   ```json
   {
     "error": "Unauthorized",
     "message": "Invalid API key",
     "timestamp": "2024-01-15T12:00:00.000Z"
   }
   ```

3. **Rate Limiting**
   ```json
   {
     "error": "Too Many Requests",
     "message": "Rate limit exceeded",
     "timestamp": "2024-01-15T12:00:00.000Z"
   }
   ```
   
   **HTTP Headers**: 
   ```http
   Retry-After: 30
   ```

4. **Service Unavailable**
   ```json
   {
     "error": "Service Unavailable",
     "message": "Solana RPC endpoint is unreachable",
     "timestamp": "2024-01-15T12:00:00.000Z"
   }
   ```

### Retry Recommendations

- **5xx Errors**: Retry with exponential backoff
- **429 Rate Limited**: Respect `Retry-After` header
- **4xx Client Errors**: Do not retry, fix request
- **Network Errors**: Retry with reasonable timeout

## Development vs Production

### Development Mode (`environment: "development"`)

- **Authentication**: Fixed API key for development: `dev-xorj-quantitative-engine-key`
- **CORS**: Allows all origins (`*`)
- **Documentation**: Swagger UI available at `/docs`
- **Processing**: Asynchronous ingestion (same as production for consistency)
- **Logging**: Detailed debug logging enabled
- **Task Queue**: Uses memory-based queue for development

### Production Mode (`environment: "production"`)

- **Authentication**: Secure API key required for protected endpoints
- **CORS**: Restricted to `https://xorj.io` domain
- **Documentation**: Swagger UI disabled
- **Processing**: Asynchronous ingestion (Celery with Redis/RabbitMQ)
- **Logging**: Structured JSON logging only
- **Task Queue**: Uses Redis or RabbitMQ for distributed processing

## SDK Usage Examples

### Python Example

```python
import httpx
import asyncio
from datetime import datetime, timezone

class XORJQuantitativeClient:
    def __init__(self, base_url: str, api_key: str):
        self.base_url = base_url
        self.headers = {
            "Content-Type": "application/json",
            "X-API-Key": api_key
        }
        self.client = httpx.AsyncClient()
    
    async def get_health(self):
        response = await self.client.get(f"{self.base_url}/health")
        return response.json()
    
    async def calculate_performance(self, wallet_address: str, end_date=None):
        data = {
            "wallet_address": wallet_address
        }
        
        # Only add end_date if it's provided to avoid sending null values
        if end_date:
            data["end_date"] = end_date
        
        response = await self.client.post(
            f"{self.base_url}/calculation/performance",
            json=data,
            headers=self.headers
        )
        
        return response.json()
    
    async def calculate_portfolio(self, wallet_addresses: list, end_date=None):
        data = {
            "wallet_addresses": wallet_addresses
        }
        
        # Only add end_date if it's provided to avoid sending null values
        if end_date:
            data["end_date"] = end_date
        
        response = await self.client.post(
            f"{self.base_url}/calculation/portfolio", 
            json=data,
            headers=self.headers
        )
        
        return response.json()

# Usage
async def main():
    client = XORJQuantitativeClient(
        base_url="http://localhost:8000",
        api_key="dev-xorj-quantitative-engine-key"  # Development API key
    )
    
    # Check system health
    health = await client.get_health()
    print(f"System healthy: {health['healthy']}")
    
    # Calculate performance for single wallet
    performance = await client.calculate_performance(
        "ExampleAPIWallet..."
    )
    
    if performance["success"]:
        metrics = performance["metrics"]
        print(f"ROI: {metrics['net_roi_percent']}%")
        print(f"Sharpe Ratio: {metrics['sharpe_ratio']}")
    
    await client.client.aclose()

if __name__ == "__main__":
    asyncio.run(main())
```

### JavaScript/Node.js Example

```javascript
const axios = require('axios');

class XORJQuantitativeClient {
    constructor(baseUrl, apiKey) {
        this.baseUrl = baseUrl;
        this.headers = {
            'Content-Type': 'application/json',
            'X-API-Key': apiKey
        };
    }

    async getHealth() {
        const response = await axios.get(`${this.baseUrl}/health`);
        return response.data;
    }

    async calculatePerformance(walletAddress, endDate = null) {
        const data = {
            wallet_address: walletAddress
        };
        
        // Only add end_date if it's provided to avoid sending null values
        if (endDate) {
            data.end_date = endDate;
        }

        const response = await axios.post(
            `${this.baseUrl}/calculation/performance`,
            data,
            { headers: this.headers }
        );

        return response.data;
    }

    async calculatePortfolio(walletAddresses, endDate = null) {
        const data = {
            wallet_addresses: walletAddresses
        };
        
        // Only add end_date if it's provided to avoid sending null values
        if (endDate) {
            data.end_date = endDate;
        }

        const response = await axios.post(
            `${this.baseUrl}/calculation/portfolio`,
            data,
            { headers: this.headers }
        );

        return response.data;
    }
}

// Usage
async function main() {
    const client = new XORJQuantitativeClient(
        'http://localhost:8000',
        'dev-xorj-quantitative-engine-key'  // Development API key
    );

    try {
        // Check system health
        const health = await client.getHealth();
        console.log(`System healthy: ${health.healthy}`);

        // Calculate performance
        const performance = await client.calculatePerformance(
            'ExampleAPIWallet...'
        );

        if (performance.success) {
            const metrics = performance.metrics;
            console.log(`ROI: ${metrics.net_roi_percent}%`);
            console.log(`Sharpe Ratio: ${metrics.sharpe_ratio}`);
        }

    } catch (error) {
        console.error('API Error:', error.response?.data || error.message);
    }
}

main();
```

---

**API Version**: 1.0.0  
**Last Updated**: 2024-01-15  
**Status**: ✅ Production Ready