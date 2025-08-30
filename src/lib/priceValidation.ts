/**
 * Price Validation and Staleness Protection
 * Ensures price data integrity for trade execution decisions
 */

import { PriceData, OHLCVData } from './marketData';

export interface PriceValidationResult {
  isValid: boolean;
  confidence: number; // 0-1 scale
  warnings: string[];
  errors: string[];
  recommendation: 'proceed' | 'caution' | 'halt';
}

export interface PriceValidationConfig {
  maxStaleTime: number; // milliseconds
  maxPriceDeviation: number; // percentage (0.05 = 5%)
  minConfidenceThreshold: number; // 0-1 scale
  volatilityThreshold: number; // percentage for high volatility detection
  enableCircuitBreaker: boolean;
}

export class PriceValidator {
  private priceHistory = new Map<string, PriceData[]>();
  private lastValidationResults = new Map<string, PriceValidationResult>();
  private circuitBreakerState = new Map<string, { tripped: boolean; timestamp: number; reason: string }>();
  
  private readonly defaultConfig: PriceValidationConfig = {
    maxStaleTime: 30000, // 30 seconds
    maxPriceDeviation: 0.05, // 5%
    minConfidenceThreshold: 0.8, // 80%
    volatilityThreshold: 0.15, // 15%
    enableCircuitBreaker: true
  };

  constructor(private config: PriceValidationConfig = {}) {
    this.config = { ...this.defaultConfig, ...config };
  }

  validatePrice(priceData: PriceData, config?: Partial<PriceValidationConfig>): PriceValidationResult {
    const validationConfig = { ...this.config, ...(config || {}) };
    const warnings: string[] = [];
    const errors: string[] = [];
    let confidence = 1.0;

    // Store price in history
    this.updatePriceHistory(priceData);

    // Check if circuit breaker is tripped
    const circuitBreaker = this.circuitBreakerState.get(priceData.address);
    if (circuitBreaker?.tripped) {
      const timeSinceTrip = Date.now() - circuitBreaker.timestamp;
      if (timeSinceTrip < 300000) { // 5 minutes
        errors.push(`Circuit breaker active: ${circuitBreaker.reason}`);
        return {
          isValid: false,
          confidence: 0,
          warnings,
          errors,
          recommendation: 'halt'
        };
      } else {
        // Reset circuit breaker after cooldown
        this.circuitBreakerState.delete(priceData.address);
      }
    }

    // 1. Staleness Check
    const currentTime = Date.now();
    const dataAge = currentTime - priceData.timestamp;
    
    if (dataAge > validationConfig.maxStaleTime) {
      const staleFactor = Math.min(dataAge / validationConfig.maxStaleTime, 5);
      confidence *= Math.max(0.1, 1 - (staleFactor - 1) * 0.2);
      
      if (dataAge > validationConfig.maxStaleTime * 2) {
        errors.push(`Price data is critically stale: ${(dataAge / 1000).toFixed(1)}s old`);
      } else {
        warnings.push(`Price data is stale: ${(dataAge / 1000).toFixed(1)}s old`);
      }
    }

    // 2. Price Reasonableness Check
    if (priceData.price <= 0) {
      errors.push('Invalid price: must be positive');
      confidence = 0;
    } else if (priceData.price < 0.000001) {
      warnings.push('Extremely low price detected - verify token decimals');
      confidence *= 0.8;
    } else if (priceData.price > 1000000) {
      warnings.push('Extremely high price detected - verify token decimals');
      confidence *= 0.9;
    }

    // 3. Historical Price Deviation Check
    const priceHistory = this.priceHistory.get(priceData.address);
    if (priceHistory && priceHistory.length >= 2) {
      const recentPrices = priceHistory.slice(-5); // Last 5 prices
      const avgPrice = recentPrices.reduce((sum, p) => sum + p.price, 0) / recentPrices.length;
      const deviation = Math.abs(priceData.price - avgPrice) / avgPrice;
      
      if (deviation > validationConfig.maxPriceDeviation) {
        const deviationPercent = (deviation * 100).toFixed(2);
        
        if (deviation > validationConfig.maxPriceDeviation * 3) {
          errors.push(`Extreme price deviation: ${deviationPercent}% from recent average`);
          confidence *= 0.5;
          
          // Trip circuit breaker for extreme deviations
          if (validationConfig.enableCircuitBreaker) {
            this.tripCircuitBreaker(priceData.address, `Extreme price deviation: ${deviationPercent}%`);
          }
        } else if (deviation > validationConfig.maxPriceDeviation * 2) {
          warnings.push(`High price deviation: ${deviationPercent}% from recent average`);
          confidence *= 0.7;
        } else {
          warnings.push(`Price deviation: ${deviationPercent}% from recent average`);
          confidence *= 0.9;
        }
      }
    }

    // 4. Volatility Check
    if (priceHistory && priceHistory.length >= 3) {
      const volatility = this.calculateVolatility(priceHistory.slice(-10));
      
      if (volatility > validationConfig.volatilityThreshold) {
        const volatilityPercent = (volatility * 100).toFixed(2);
        warnings.push(`High volatility detected: ${volatilityPercent}%`);
        confidence *= Math.max(0.6, 1 - (volatility - validationConfig.volatilityThreshold) * 2);
      }
    }

    // 5. Volume Validation (if available)
    if (priceData.volume24h !== undefined) {
      if (priceData.volume24h === 0) {
        warnings.push('Zero trading volume - liquidity risk');
        confidence *= 0.7;
      } else if (priceData.volume24h < 1000) {
        warnings.push('Low trading volume - potential manipulation risk');
        confidence *= 0.8;
      }
    }

    // Determine final validation result
    const isValid = errors.length === 0 && confidence >= validationConfig.minConfidenceThreshold;
    let recommendation: 'proceed' | 'caution' | 'halt';

    if (errors.length > 0 || confidence < 0.3) {
      recommendation = 'halt';
    } else if (warnings.length > 0 || confidence < validationConfig.minConfidenceThreshold) {
      recommendation = 'caution';
    } else {
      recommendation = 'proceed';
    }

    const result: PriceValidationResult = {
      isValid,
      confidence: Math.max(0, Math.min(1, confidence)),
      warnings,
      errors,
      recommendation
    };

    this.lastValidationResults.set(priceData.address, result);
    return result;
  }

  validateOHLCV(ohlcvData: OHLCVData): PriceValidationResult {
    const warnings: string[] = [];
    const errors: string[] = [];
    let confidence = 1.0;

    // Basic OHLCV validation
    if (ohlcvData.high < ohlcvData.low) {
      errors.push('Invalid OHLCV: high price is less than low price');
    }

    if (ohlcvData.close > ohlcvData.high || ohlcvData.close < ohlcvData.low) {
      errors.push('Invalid OHLCV: close price is outside high-low range');
    }

    if (ohlcvData.open > ohlcvData.high || ohlcvData.open < ohlcvData.low) {
      errors.push('Invalid OHLCV: open price is outside high-low range');
    }

    if (ohlcvData.volume < 0) {
      errors.push('Invalid OHLCV: negative volume');
    }

    // Calculate price range as percentage of close
    if (ohlcvData.close > 0) {
      const priceRange = (ohlcvData.high - ohlcvData.low) / ohlcvData.close;
      if (priceRange > 0.2) { // 20% range
        warnings.push(`High intrabar volatility: ${(priceRange * 100).toFixed(2)}%`);
        confidence *= 0.8;
      }
    }

    return {
      isValid: errors.length === 0,
      confidence,
      warnings,
      errors,
      recommendation: errors.length > 0 ? 'halt' : (warnings.length > 0 ? 'caution' : 'proceed')
    };
  }

  private updatePriceHistory(priceData: PriceData): void {
    let history = this.priceHistory.get(priceData.address) || [];
    
    // Add new price data
    history.push(priceData);
    
    // Keep only last 50 price points to manage memory
    if (history.length > 50) {
      history = history.slice(-50);
    }
    
    // Sort by timestamp to ensure chronological order
    history.sort((a, b) => a.timestamp - b.timestamp);
    
    this.priceHistory.set(priceData.address, history);
  }

  private calculateVolatility(prices: PriceData[]): number {
    if (prices.length < 2) return 0;

    // Calculate returns
    const returns: number[] = [];
    for (let i = 1; i < prices.length; i++) {
      const returnValue = (prices[i].price - prices[i-1].price) / prices[i-1].price;
      returns.push(returnValue);
    }

    // Calculate standard deviation of returns
    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
    
    return Math.sqrt(variance);
  }

  private tripCircuitBreaker(tokenAddress: string, reason: string): void {
    this.circuitBreakerState.set(tokenAddress, {
      tripped: true,
      timestamp: Date.now(),
      reason
    });
    
    console.warn(`🔴 Circuit breaker tripped for ${tokenAddress}: ${reason}`);
  }

  getLastValidationResult(tokenAddress: string): PriceValidationResult | null {
    return this.lastValidationResults.get(tokenAddress) || null;
  }

  getPriceHistory(tokenAddress: string, limit?: number): PriceData[] {
    const history = this.priceHistory.get(tokenAddress) || [];
    return limit ? history.slice(-limit) : history;
  }

  resetCircuitBreaker(tokenAddress: string): void {
    this.circuitBreakerState.delete(tokenAddress);
    console.log(`🟢 Circuit breaker reset for ${tokenAddress}`);
  }

  getCircuitBreakerStatus(tokenAddress: string): { tripped: boolean; reason?: string; timestamp?: number } {
    const status = this.circuitBreakerState.get(tokenAddress);
    return status || { tripped: false };
  }

  // Health check for monitoring
  getValidatorHealth() {
    const totalTokens = this.priceHistory.size;
    const circuitBreakers = Array.from(this.circuitBreakerState.entries()).map(([address, state]) => ({
      address,
      ...state
    }));

    return {
      totalTokensTracked: totalTokens,
      activeCircuitBreakers: circuitBreakers.filter(cb => cb.tripped).length,
      circuitBreakers,
      lastValidationCount: this.lastValidationResults.size
    };
  }
}

// Singleton instance
export const priceValidator = new PriceValidator();