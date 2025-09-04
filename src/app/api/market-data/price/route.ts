/**
 * Market Data Price API
 * Get current price data and validation status
 */

import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { marketDataService } from '@/lib/marketData';
import { priceValidator } from '@/lib/priceValidation';

interface PriceResponseData {
  success: boolean;
  priceData: {
    address: string;
    symbol: string;
    price: number;
    timestamp: number;
    volume24h: number;
    priceChange24h: number;
    source: string;
    age: number;
  };
  requestId: string;
  responseTime: string;
  validation?: {
    isValid: boolean;
    confidence: number;
    recommendation: string;
    warnings: string[];
    errors: string[];
    circuitBreaker: { tripped: boolean; reason?: string; timestamp?: number };
  };
  priceHistory?: {
    count: number;
    data: Array<{
      price: number;
      timestamp: number;
      volume24h: number;
      priceChange24h: number;
    }>;
  };
}

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

// Type assertion after null check
const jwtSecret: string = JWT_SECRET;

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const requestId = `price_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    // Authentication
    const authorization = request.headers.get('authorization');
    
    if (!authorization || !authorization.startsWith('Bearer ')) {
      return NextResponse.json({
        error: 'Missing authorization header',
        requestId
      }, { status: 401 });
    }

    const token = authorization.replace('Bearer ', '');
    let walletAddress: string;
    
    try {
      const decoded = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] }) as { wallet_address?: string; sub?: string };
      walletAddress = decoded?.wallet_address || decoded?.sub || '';
      
      if (!walletAddress) {
        throw new Error('No wallet address in token');
      }
    } catch {
      // FIXED: In development, handle malformed JWT tokens gracefully
      if (process.env.NODE_ENV === 'development') {
        console.log('🧪 Development mode: JWT malformed, using default wallet address');
        walletAddress = '5QfzCCipXjebAfHpMhCJAoxUJL2TyqM5p8tCFLjsPbmh';
      } else {
        return NextResponse.json({
          error: 'Invalid token',
          requestId
        }, { status: 401 });
      }
    }

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const tokenAddress = searchParams.get('tokenAddress');
    const includeValidation = searchParams.get('validation') === 'true';
    const includeHistory = searchParams.get('history') === 'true';
    const historyLimit = parseInt(searchParams.get('historyLimit') || '10');

    if (!tokenAddress) {
      return NextResponse.json({
        error: 'Token address is required',
        requestId
      }, { status: 400 });
    }

    console.log(`📊 Price request from ${walletAddress} for ${tokenAddress}`);

    // Get current price data
    const priceData = marketDataService.getCurrentPrice(tokenAddress);
    
    if (!priceData) {
      return NextResponse.json({
        error: 'No price data available for this token',
        message: 'Token may not be subscribed to price feeds',
        requestId,
        suggestions: [
          'Subscribe to price feed first using /api/market-data/subscribe',
          'Verify token address is correct',
          'Check if market data service is connected'
        ],
        marketDataStatus: {
          connected: marketDataService.isConnected(),
          connectionState: marketDataService.getConnectionState()
        }
      }, { status: 404 });
    }

    // Build response object
    const responseData: PriceResponseData = {
      success: true,
      priceData: {
        address: priceData.address,
        symbol: priceData.symbol,
        price: priceData.price,
        timestamp: priceData.timestamp,
        volume24h: priceData.volume24h,
        priceChange24h: priceData.priceChange24h,
        source: priceData.source,
        age: Date.now() - priceData.timestamp
      },
      requestId,
      responseTime: `${Date.now() - startTime}ms`
    };

    // Include price validation if requested
    if (includeValidation) {
      const validation = priceValidator.validatePrice(priceData);
      responseData.validation = {
        isValid: validation.isValid,
        confidence: validation.confidence,
        recommendation: validation.recommendation,
        warnings: validation.warnings,
        errors: validation.errors,
        circuitBreaker: priceValidator.getCircuitBreakerStatus(tokenAddress)
      };
    }

    // Include price history if requested
    if (includeHistory) {
      const history = priceValidator.getPriceHistory(tokenAddress, historyLimit);
      responseData.priceHistory = {
        count: history.length,
        data: history.map(p => ({
          price: p.price,
          timestamp: p.timestamp,
          volume24h: p.volume24h,
          priceChange24h: p.priceChange24h
        }))
      };
    }

    const finalResponseTime = Date.now() - startTime;
    responseData.responseTime = `${finalResponseTime}ms`;

    return NextResponse.json(responseData, {
      status: 200,
      headers: {
        'X-Request-ID': requestId,
        'X-Response-Time': `${finalResponseTime}ms`,
        'Cache-Control': 'no-cache, max-age=0'
      }
    });

  } catch (error) {
    console.error(`❌ Price request failed:`, error);
    const responseTime = Date.now() - startTime;
    
    return NextResponse.json({
      error: 'Price request failed',
      requestId,
      responseTime: `${responseTime}ms`,
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const requestId = `bulk_price_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    // Authentication (same as GET)
    const authorization = request.headers.get('authorization');
    
    if (!authorization || !authorization.startsWith('Bearer ')) {
      return NextResponse.json({
        error: 'Missing authorization header',
        requestId
      }, { status: 401 });
    }

    const token = authorization.replace('Bearer ', '');
    let walletAddress: string;
    
    try {
      const decoded = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] }) as { wallet_address?: string; sub?: string };
      walletAddress = decoded?.wallet_address || decoded?.sub || '';
      
      if (!walletAddress) {
        throw new Error('No wallet address in token');
      }
    } catch {
      // FIXED: In development, handle malformed JWT tokens gracefully
      if (process.env.NODE_ENV === 'development') {
        console.log('🧪 Development mode: JWT malformed, using default wallet address');
        walletAddress = '5QfzCCipXjebAfHpMhCJAoxUJL2TyqM5p8tCFLjsPbmh';
      } else {
        return NextResponse.json({
          error: 'Invalid token',
          requestId
        }, { status: 401 });
      }
    }

    // Parse request body for bulk price request
    const body = await request.json();
    const { tokenAddresses, includeValidation = false } = body;

    if (!Array.isArray(tokenAddresses) || tokenAddresses.length === 0) {
      return NextResponse.json({
        error: 'Token addresses array is required',
        requestId
      }, { status: 400 });
    }

    if (tokenAddresses.length > 20) {
      return NextResponse.json({
        error: 'Maximum 20 token addresses allowed per request',
        requestId
      }, { status: 400 });
    }

    console.log(`📊 Bulk price request from ${walletAddress} for ${tokenAddresses.length} tokens`);

    const results: Array<{
      address: string;
      priceData?: {
        price: number;
        timestamp: number;
        volume24h: number;
        priceChange24h: number;
        source: string;
        age: number;
      };
      validation?: {
        isValid: boolean;
        confidence: number;
        recommendation: string;
        warningCount: number;
        errorCount: number;
      };
      error?: string;
    }> = [];

    for (const tokenAddress of tokenAddresses) {
      const priceData = marketDataService.getCurrentPrice(tokenAddress);

      if (priceData) {
        const result = {
          address: tokenAddress,
          priceData: {
            price: priceData.price,
            timestamp: priceData.timestamp,
            volume24h: priceData.volume24h,
            priceChange24h: priceData.priceChange24h,
            source: priceData.source,
            age: Date.now() - priceData.timestamp
          }
        };

        if (includeValidation) {
          const validation = priceValidator.validatePrice(priceData);
          result.validation = {
            isValid: validation.isValid,
            confidence: validation.confidence,
            recommendation: validation.recommendation,
            warningCount: validation.warnings.length,
            errorCount: validation.errors.length
          };
        }

        results.push(result);
      } else {
        results.push({
          address: tokenAddress,
          error: 'No price data available'
        });
      }
    }

    const responseTime = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      results,
      summary: {
        requested: tokenAddresses.length,
        found: results.filter(r => r.priceData).length,
        missing: results.filter(r => r.error).length
      },
      requestId,
      responseTime: `${responseTime}ms`
    }, {
      status: 200,
      headers: {
        'X-Request-ID': requestId,
        'X-Response-Time': `${responseTime}ms`,
        'Cache-Control': 'no-cache, max-age=0'
      }
    });

  } catch (error) {
    console.error(`❌ Bulk price request failed:`, error);
    const responseTime = Date.now() - startTime;
    
    return NextResponse.json({
      error: 'Bulk price request failed',
      requestId,
      responseTime: `${responseTime}ms`,
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}