/**
 * Mock Price API for End-to-End Testing
 * 
 * Provides predictable, stable historical prices for SOL, USDC, and JUP tokens
 * Uses MSW (Mock Service Worker) to intercept price feed requests
 */

import { rest } from 'msw';
import { setupServer } from 'msw/node';

export interface PriceData {
  symbol: string;
  price: number;
  timestamp: number;
  volume24h: number;
  change24h: number;
}

export interface HistoricalPriceData {
  symbol: string;
  prices: Array<{
    timestamp: number;
    price: number;
    volume: number;
  }>;
}

class MockPriceApiServer {
  private server: any;
  private priceData: Map<string, HistoricalPriceData> = new Map();

  constructor() {
    this.setupMockPriceData();
    this.setupMockServer();
  }

  private setupMockPriceData() {
    console.log('💰 Setting up mock price data...');
    
    // Generate 6 months of historical price data
    const sixMonthsAgo = Date.now() - (6 * 30 * 24 * 60 * 60 * 1000);
    const now = Date.now();
    const dataPoints = 180; // Daily data points
    const interval = (now - sixMonthsAgo) / dataPoints;

    // SOL price data (volatile but trending up)
    const solPrices = this.generatePriceHistory({
      symbol: 'SOL',
      startPrice: 80,
      endPrice: 120,
      volatility: 0.15, // 15% daily volatility
      startTime: sixMonthsAgo,
      dataPoints,
      interval
    });
    this.priceData.set('SOL', solPrices);

    // USDC price data (stable)
    const usdcPrices = this.generatePriceHistory({
      symbol: 'USDC',
      startPrice: 1.0,
      endPrice: 1.0,
      volatility: 0.001, // 0.1% volatility (stable)
      startTime: sixMonthsAgo,
      dataPoints,
      interval
    });
    this.priceData.set('USDC', usdcPrices);

    // JUP price data (growth token with moderate volatility)
    const jupPrices = this.generatePriceHistory({
      symbol: 'JUP',
      startPrice: 0.50,
      endPrice: 1.20,
      volatility: 0.12, // 12% daily volatility
      startTime: sixMonthsAgo,
      dataPoints,
      interval
    });
    this.priceData.set('JUP', jupPrices);

    console.log('✅ Mock price data generated for SOL, USDC, JUP');
  }

  private generatePriceHistory(params: {
    symbol: string;
    startPrice: number;
    endPrice: number;
    volatility: number;
    startTime: number;
    dataPoints: number;
    interval: number;
  }): HistoricalPriceData {
    const { symbol, startPrice, endPrice, volatility, startTime, dataPoints, interval } = params;
    const prices: Array<{ timestamp: number; price: number; volume: number }> = [];
    
    // Calculate trend (drift) per period
    const totalReturn = (endPrice - startPrice) / startPrice;
    const driftPerPeriod = totalReturn / dataPoints;
    
    let currentPrice = startPrice;
    
    for (let i = 0; i < dataPoints; i++) {
      const timestamp = startTime + (i * interval);
      
      // Random walk with drift
      const randomShock = (Math.random() - 0.5) * 2 * volatility;
      const priceChange = currentPrice * (driftPerPeriod + randomShock);
      currentPrice = Math.max(0.01, currentPrice + priceChange); // Prevent negative prices
      
      // Generate realistic volume (higher volume on price movements)
      const volumeBase = symbol === 'SOL' ? 50000000 : symbol === 'JUP' ? 10000000 : 100000000;
      const volumeMultiplier = 0.5 + Math.abs(randomShock) * 2; // Higher volume on big moves
      const volume = volumeBase * volumeMultiplier;
      
      prices.push({
        timestamp,
        price: Number(currentPrice.toFixed(symbol === 'USDC' ? 4 : 2)),
        volume: Math.round(volume)
      });
    }
    
    console.log(`   📈 ${symbol}: ${startPrice.toFixed(2)} → ${currentPrice.toFixed(2)} (${dataPoints} data points)`);
    
    return {
      symbol,
      prices
    };
  }

  private setupMockServer() {
    const handlers = [
      // CoinGecko API mock
      rest.get('https://api.coingecko.com/api/v3/simple/price', (req, res, ctx) => {
        const ids = req.url.searchParams.get('ids')?.split(',') || [];
        const response: any = {};
        
        ids.forEach(id => {
          const symbol = this.getSymbolFromId(id);
          const priceData = this.priceData.get(symbol);
          if (priceData && priceData.prices.length > 0) {
            const latestPrice = priceData.prices[priceData.prices.length - 1];
            response[id] = {
              usd: latestPrice.price
            };
          }
        });
        
        return res(ctx.json(response));
      }),

      // Historical price data mock
      rest.get('https://api.coingecko.com/api/v3/coins/:id/market_chart', (req, res, ctx) => {
        const id = req.params.id as string;
        const symbol = this.getSymbolFromId(id);
        const priceData = this.priceData.get(symbol);
        
        if (!priceData) {
          return res(ctx.status(404), ctx.json({ error: 'Token not found' }));
        }
        
        const prices = priceData.prices.map(p => [p.timestamp, p.price]);
        const volumes = priceData.prices.map(p => [p.timestamp, p.volume]);
        
        return res(ctx.json({
          prices,
          market_caps: prices.map(([ts, price]) => [ts, price * 1000000]), // Mock market cap
          total_volumes: volumes
        }));
      }),

      // Jupiter API mock (for current prices)
      rest.get('https://quote-api.jup.ag/v6/price', (req, res, ctx) => {
        const ids = req.url.searchParams.get('ids')?.split(',') || [];
        const response: any = { data: {} };
        
        ids.forEach(id => {
          const symbol = this.getMintSymbol(id);
          const priceData = this.priceData.get(symbol);
          if (priceData && priceData.prices.length > 0) {
            const latestPrice = priceData.prices[priceData.prices.length - 1];
            response.data[id] = {
              id,
              mintSymbol: symbol,
              vsToken: 'USDC',
              vsTokenSymbol: 'USDC',
              price: latestPrice.price.toString()
            };
          }
        });
        
        return res(ctx.json(response));
      })
    ];

    this.server = setupServer(...handlers);
  }

  private getSymbolFromId(id: string): string {
    const idMap: Record<string, string> = {
      'solana': 'SOL',
      'usd-coin': 'USDC', 
      'jupiter': 'JUP'
    };
    return idMap[id] || id.toUpperCase();
  }

  private getMintSymbol(mint: string): string {
    const mintMap: Record<string, string> = {
      'So11111111111111111111111111111111111111112': 'SOL',
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': 'USDC',
      'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN': 'JUP'
    };
    return mintMap[mint] || 'UNKNOWN';
  }

  start() {
    this.server.listen({
      onUnhandledRequest: 'bypass' // Allow other requests to pass through
    });
    console.log('✅ Mock price API server started');
  }

  stop() {
    this.server.close();
  }

  restore() {
    this.server.resetHandlers();
  }

  getCurrentPrice(symbol: string): PriceData | null {
    const priceData = this.priceData.get(symbol);
    if (!priceData || priceData.prices.length === 0) {
      return null;
    }
    
    const latest = priceData.prices[priceData.prices.length - 1];
    const previous = priceData.prices[priceData.prices.length - 2];
    
    return {
      symbol,
      price: latest.price,
      timestamp: latest.timestamp,
      volume24h: latest.volume,
      change24h: previous ? ((latest.price - previous.price) / previous.price) * 100 : 0
    };
  }

  getHistoricalPrices(symbol: string): HistoricalPriceData | null {
    return this.priceData.get(symbol) || null;
  }
}

let mockPriceServer: MockPriceApiServer;

export async function setupMockPriceApi() {
  mockPriceServer = new MockPriceApiServer();
  mockPriceServer.start();
  return mockPriceServer;
}

export { mockPriceServer };