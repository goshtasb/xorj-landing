/**
 * Market Data Integration Module - Phase 1
 * Real-time price feeds via Birdeye WebSocket
 * Ultra-low latency market data with connection management
 */

import { EventEmitter } from 'events';
import WebSocket from 'ws';

export interface PriceData {
  address: string;
  symbol: string;
  price: number;
  timestamp: number;
  volume24h?: number;
  priceChange24h?: number;
  source: 'birdeye';
}

export interface OHLCVData {
  address: string;
  symbol: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: number;
  interval: '1s' | '15s' | '30s' | '1m' | '5m';
  source: 'birdeye';
}

interface BirdeyeSubscription {
  type: 'SUBSCRIBE_PRICE';
  data: {
    address: string;
    interval?: '1s' | '15s' | '30s';
  };
}

interface BirdeyePriceResponse {
  type: 'PRICE_DATA';
  data: {
    address: string;
    price: number;
    timestamp: number;
    volume24h?: number;
    priceChange24h?: number;
    ohlcv?: {
      open: number;
      high: number;
      low: number;
      close: number;
      volume: number;
    };
  };
}

export class MarketDataService extends EventEmitter {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000;
  private subscriptions = new Set<string>();
  private lastPriceData = new Map<string, PriceData>();
  private connectionState: 'disconnected' | 'connecting' | 'connected' | 'error' = 'disconnected';
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private priceStaleThreshold = 30000; // 30 seconds
  
  private readonly BIRDEYE_WS_URL = 'wss://public-api.birdeye.so/socket';
  
  constructor() {
    super();
    this.setupErrorHandling();
  }

  private setupErrorHandling() {
    this.on('error', (error) => {
      console.error('❌ MarketDataService error:', error);
    });
  }

  async connect(): Promise<void> {
    if (this.connectionState === 'connecting' || this.connectionState === 'connected') {
      return;
    }

    this.connectionState = 'connecting';
    
    try {
      this.ws = new WebSocket(this.BIRDEYE_WS_URL);
      
      this.ws.on('open', () => {
        console.log('✅ Connected to Birdeye WebSocket');
        this.connectionState = 'connected';
        this.reconnectAttempts = 0;
        this.startHeartbeat();
        this.resubscribeAll();
        this.emit('connected');
      });

      this.ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString()) as BirdeyePriceResponse;
          this.handleMessage(message);
        } catch (error) {
          console.error('❌ Failed to parse WebSocket message:', error);
        }
      });

      this.ws.on('close', (code, reason) => {
        console.log(`🔌 WebSocket closed: ${code} ${reason}`);
        this.connectionState = 'disconnected';
        this.stopHeartbeat();
        this.handleReconnection();
        this.emit('disconnected', { code, reason });
      });

      this.ws.on('error', (error) => {
        console.error('❌ WebSocket error:', error);
        this.connectionState = 'error';
        this.emit('error', error);
      });

    } catch (error) {
      this.connectionState = 'error';
      console.error('❌ Failed to connect to Birdeye:', error);
      this.emit('error', error);
      throw error;
    }
  }

  private handleMessage(message: BirdeyePriceResponse) {
    if (message.type === 'PRICE_DATA') {
      const priceData: PriceData = {
        address: message.data.address,
        symbol: this.getSymbolFromAddress(message.data.address),
        price: message.data.price,
        timestamp: message.data.timestamp,
        volume24h: message.data.volume24h,
        priceChange24h: message.data.priceChange24h,
        source: 'birdeye'
      };

      this.lastPriceData.set(message.data.address, priceData);
      this.emit('priceUpdate', priceData);

      // If OHLCV data is included
      if (message.data.ohlcv) {
        const ohlcvData: OHLCVData = {
          address: message.data.address,
          symbol: priceData.symbol,
          open: message.data.ohlcv.open,
          high: message.data.ohlcv.high,
          low: message.data.ohlcv.low,
          close: message.data.ohlcv.close,
          volume: message.data.ohlcv.volume,
          timestamp: message.data.timestamp,
          interval: '1s',
          source: 'birdeye'
        };
        
        this.emit('ohlcvUpdate', ohlcvData);
      }
    }
  }

  async subscribeToPrice(tokenAddress: string, interval: '1s' | '15s' | '30s' = '1s'): Promise<void> {
    if (!this.isConnected()) {
      await this.connect();
    }

    const subscription: BirdeyeSubscription = {
      type: 'SUBSCRIBE_PRICE',
      data: {
        address: tokenAddress,
        interval
      }
    };

    this.subscriptions.add(`${tokenAddress}:${interval}`);
    
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(subscription));
      console.log(`📈 Subscribed to price updates for ${tokenAddress} (${interval})`);
    }
  }

  unsubscribeFromPrice(tokenAddress: string, interval: '1s' | '15s' | '30s' = '1s'): void {
    this.subscriptions.delete(`${tokenAddress}:${interval}`);
    
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const unsubscription = {
        type: 'UNSUBSCRIBE_PRICE',
        data: {
          address: tokenAddress,
          interval
        }
      };
      this.ws.send(JSON.stringify(unsubscription));
      console.log(`📉 Unsubscribed from price updates for ${tokenAddress}`);
    }

    this.lastPriceData.delete(tokenAddress);
  }

  getCurrentPrice(tokenAddress: string): PriceData | null {
    const priceData = this.lastPriceData.get(tokenAddress);
    
    if (!priceData) {
      return null;
    }

    // Check if price data is stale
    const now = Date.now();
    const dataAge = now - priceData.timestamp;
    
    if (dataAge > this.priceStaleThreshold) {
      console.warn(`⚠️ Price data for ${tokenAddress} is stale (${dataAge}ms old)`);
      this.emit('stalePrice', { tokenAddress, age: dataAge });
    }

    return priceData;
  }

  private resubscribeAll(): void {
    if (!this.isConnected()) return;

    for (const subscription of this.subscriptions) {
      const [address, interval] = subscription.split(':');
      this.subscribeToPrice(address, interval as '1s' | '15s' | '30s');
    }
  }

  private handleReconnection(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('❌ Max reconnection attempts reached');
      this.emit('maxReconnectAttemptsReached');
      return;
    }

    const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;

    console.log(`🔄 Attempting reconnection ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);

    setTimeout(async () => {
      try {
        await this.connect();
      } catch (error) {
        console.error('❌ Reconnection failed:', error);
      }
    }, delay);
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.ping();
      }
    }, 30000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private getSymbolFromAddress(address: string): string {
    // In production, this would be a lookup table or API call
    // For now, return a shortened address as symbol
    return address.substring(0, 8) + '...';
  }

  isConnected(): boolean {
    return this.connectionState === 'connected' && 
           this.ws !== null && 
           this.ws.readyState === WebSocket.OPEN;
  }

  getConnectionState(): string {
    return this.connectionState;
  }

  async disconnect(): Promise<void> {
    this.stopHeartbeat();
    
    if (this.ws) {
      this.ws.close(1000, 'Manual disconnect');
      this.ws = null;
    }
    
    this.subscriptions.clear();
    this.lastPriceData.clear();
    this.connectionState = 'disconnected';
    
    console.log('🔌 Disconnected from Birdeye WebSocket');
  }

  // Health check for monitoring
  getHealthStatus() {
    return {
      connected: this.isConnected(),
      connectionState: this.connectionState,
      subscriptions: Array.from(this.subscriptions),
      lastDataCount: this.lastPriceData.size,
      reconnectAttempts: this.reconnectAttempts
    };
  }
}

// Singleton instance for application-wide use
export const marketDataService = new MarketDataService();