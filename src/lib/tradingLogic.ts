/**
 * Trading Logic & Signal Processing Module - Phase 2
 * The "brain" that connects strategy to execution via intelligent signal generation
 */

import { Connection, PublicKey } from '@solana/web3.js';
// Use direct program ID and simplified token operations
const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
import { marketDataService } from './marketData';
// import { priceValidator } from './priceValidation'; // Unused for now

// Core TradeSignal interface as specified
export interface TradeSignal {
  action: 'REBALANCE';
  userId: string;
  vaultAddress: string;
  fromAsset: {
    mintAddress: string;
    symbol: string;
  };
  toAsset: {
    mintAddress: string;
    symbol: string;
  };
  targetPercentage: number; // e.g., 100
  metadata?: {
    currentPercentage: number;
    discrepancy: number;
    confidence: number;
    timestamp: number;
    signalId: string;
  };
}

// Strategic guidance from Quantitative Engine
export interface StrategicGuidance {
  targetTraderId: string;
  allocation: {
    [mintAddress: string]: {
      symbol: string;
      targetPercentage: number;
    };
  };
  confidence: number;
  lastUpdated: number;
}

// Current vault holdings from Solana blockchain
export interface VaultHoldings {
  vaultAddress: string;
  totalValue: number; // in USD
  assets: {
    [mintAddress: string]: {
      symbol: string;
      balance: number;
      value: number; // in USD
      percentage: number;
    };
  };
  lastFetched: number;
}

// Signal processing configuration
export interface SignalProcessingConfig {
  rebalanceThreshold: number; // Minimum percentage discrepancy to trigger rebalance
  maxSignalsPerUser: number; // Rate limiting
  confidenceThreshold: number; // Minimum confidence to generate signals
  staleDataThreshold: number; // Max age for strategic guidance (ms)
}

export class TradingLogicService {
  private connection: Connection;
  private processedSignals = new Map<string, TradeSignal[]>();
  private lastStrategicGuidance = new Map<string, StrategicGuidance>();
  private lastVaultHoldings = new Map<string, VaultHoldings>();
  
  private readonly config: SignalProcessingConfig = {
    rebalanceThreshold: 5.0, // 5% minimum discrepancy
    maxSignalsPerUser: 3, // Max 3 pending signals per user
    confidenceThreshold: 0.8, // 80% minimum confidence
    staleDataThreshold: 300000 // 5 minutes
  };

  private readonly QUANTITATIVE_ENGINE_API = process.env.QUANTITATIVE_ENGINE_API || 'http://localhost:8000';
  private readonly MAINNET_RPC = 'https://api.mainnet-beta.solana.com';

  // Common token mint addresses
  private readonly KNOWN_TOKENS = {
    'USDC': 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    'USDT': 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
    'SOL': 'So11111111111111111111111111111111111111112',
    'JUP': 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
    'RAY': '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R'
  };

  constructor() {
    this.connection = new Connection(this.MAINNET_RPC, 'confirmed');
    this.setupErrorHandling();
  }

  private setupErrorHandling() {
    process.on('unhandledRejection', (error) => {
      console.error('❌ Unhandled rejection in Trading Logic:', error);
    });
  }

  /**
   * Step 1: Ingest Strategic Guidance from Quantitative Engine
   */
  async fetchStrategicGuidance(userId: string): Promise<StrategicGuidance | null> {
    try {

      const response = await fetch(`${this.QUANTITATIVE_ENGINE_API}/internal/ranked-traders`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-User-ID': userId
        },
        timeout: 10000
      });

      if (!response.ok) {
        throw new Error(`Strategic guidance API returned ${response.status}`);
      }

      const data = await response.json();
      
      // Transform API response to StrategicGuidance format
      const guidance: StrategicGuidance = {
        targetTraderId: data.topTrader?.id || 'default',
        allocation: this.parseAllocation(data.topTrader?.allocation || {}),
        confidence: data.confidence || 0.5,
        lastUpdated: Date.now()
      };

      this.lastStrategicGuidance.set(userId, guidance);
      
      return guidance;

    } catch (error) {
      console.error(`❌ Failed to fetch strategic guidance:`, error);
      
      // Return cached guidance if available and not too stale
      const cached = this.lastStrategicGuidance.get(userId);
      if (cached && (Date.now() - cached.lastUpdated) < this.config.staleDataThreshold) {
        return cached;
      }

      return null;
    }
  }

  /**
   * Step 2: Reconcile with Current State - Fetch Vault Holdings
   */
  async fetchVaultHoldings(userId: string, vaultAddress: string): Promise<VaultHoldings | null> {
    try {

      const vaultPublicKey = new PublicKey(vaultAddress);
      const holdings: VaultHoldings = {
        vaultAddress,
        totalValue: 0,
        assets: {},
        lastFetched: Date.now()
      };

      // Fetch all token accounts owned by the vault
      const tokenAccounts = await this.connection.getTokenAccountsByOwner(vaultPublicKey, {
        programId: TOKEN_PROGRAM_ID
      });


      for (const tokenAccountInfo of tokenAccounts.value) {
        try {
          const accountData = await getAccount(this.connection, tokenAccountInfo.pubkey);
          const mintAddress = accountData.mint.toString();
          const balance = Number(accountData.amount) / Math.pow(10, 6); // Assuming 6 decimals for most tokens

          // Skip zero balances
          if (balance === 0) continue;

          // Get price data for valuation
          const priceData = marketDataService.getCurrentPrice(mintAddress);
          const price = priceData?.price || 0;
          const value = balance * price;

          const symbol = this.getTokenSymbol(mintAddress);

          holdings.assets[mintAddress] = {
            symbol,
            balance,
            value,
            percentage: 0 // Will calculate after getting total value
          };

          holdings.totalValue += value;


        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (accountError) {
        }
      }

      // Calculate percentages
      for (const mintAddress in holdings.assets) {
        if (holdings.totalValue > 0) {
          holdings.assets[mintAddress].percentage = 
            (holdings.assets[mintAddress].value / holdings.totalValue) * 100;
        }
      }

      this.lastVaultHoldings.set(vaultAddress, holdings);
      
      return holdings;

    } catch (error) {
      console.error(`❌ Failed to fetch vault holdings:`, error);
      
      // Return cached holdings if available and not too stale
      const cached = this.lastVaultHoldings.get(vaultAddress);
      if (cached && (Date.now() - cached.lastFetched) < this.config.staleDataThreshold) {
        return cached;
      }

      return null;
    }
  }

  /**
   * Step 3: Generate Trade Signal based on discrepancy analysis
   */
  async generateTradeSignal(
    userId: string, 
    vaultAddress: string, 
    guidance: StrategicGuidance, 
    holdings: VaultHoldings
  ): Promise<TradeSignal | null> {
    try {

      // Find the largest discrepancy
      let maxDiscrepancy = 0;
      let signalCandidate: Partial<TradeSignal> | null = null;

      for (const [targetMint, targetAllocation] of Object.entries(guidance.allocation)) {
        const currentHolding = holdings.assets[targetMint];
        const currentPercentage = currentHolding?.percentage || 0;
        const discrepancy = Math.abs(targetAllocation.targetPercentage - currentPercentage);


        if (discrepancy > this.config.rebalanceThreshold && discrepancy > maxDiscrepancy) {
          maxDiscrepancy = discrepancy;

          // Determine source asset (largest current holding that's not the target)
          const fromAsset = this.findLargestNonTargetHolding(holdings, targetMint);
          
          if (!fromAsset) {
            continue;
          }

          signalCandidate = {
            action: 'REBALANCE',
            userId,
            vaultAddress,
            fromAsset,
            toAsset: {
              mintAddress: targetMint,
              symbol: targetAllocation.symbol
            },
            targetPercentage: targetAllocation.targetPercentage,
            metadata: {
              currentPercentage,
              discrepancy,
              confidence: guidance.confidence,
              timestamp: Date.now(),
              signalId: `signal_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`
            }
          };
        }
      }

      // Check if we should generate a signal
      if (!signalCandidate || maxDiscrepancy < this.config.rebalanceThreshold) {
        return null;
      }

      if (guidance.confidence < this.config.confidenceThreshold) {
        return null;
      }

      // Check rate limiting
      const existingSignals = this.processedSignals.get(userId) || [];
      if (existingSignals.length >= this.config.maxSignalsPerUser) {
        return null;
      }

      const signal = signalCandidate as TradeSignal;

      // Store signal for tracking
      existingSignals.push(signal);
      this.processedSignals.set(userId, existingSignals);

      console.log('✅ Generated trade signal:', {
        action: signal.action,
        from: `${signal.fromAsset.symbol} (${signal.fromAsset.mintAddress.substring(0, 8)}...)`,
        to: `${signal.toAsset.symbol} (${signal.toAsset.mintAddress.substring(0, 8)}...)`,
        target: `${signal.targetPercentage}%`,
        discrepancy: `${signal.metadata?.discrepancy.toFixed(2)}%`,
        confidence: signal.metadata?.confidence
      });

      return signal;

    } catch (error) {
      console.error(`❌ Failed to generate trade signal:`, error);
      return null;
    }
  }

  /**
   * Main processing pipeline - orchestrates all steps
   */
  async processTradeSignals(userId: string, vaultAddress: string): Promise<TradeSignal[]> {
    
    const signals: TradeSignal[] = [];

    try {
      // Step 1: Get strategic guidance
      const guidance = await this.fetchStrategicGuidance(userId);
      if (!guidance) {
        console.error(`❌ No strategic guidance available for ${userId}`);
        return signals;
      }

      // Step 2: Get current vault state
      const holdings = await this.fetchVaultHoldings(userId, vaultAddress);
      if (!holdings) {
        console.error(`❌ No vault holdings available for ${vaultAddress}`);
        return signals;
      }

      // Step 3: Generate trade signal
      const signal = await this.generateTradeSignal(userId, vaultAddress, guidance, holdings);
      if (signal) {
        signals.push(signal);
      }

      return signals;

    } catch (error) {
      console.error(`❌ Trade signal processing pipeline failed:`, error);
      return signals;
    }
  }

  // Utility methods
  private parseAllocation(allocation: unknown): { [mintAddress: string]: { symbol: string; targetPercentage: number } } {
    const result: { [mintAddress: string]: { symbol: string; targetPercentage: number } } = {};
    
    // Handle different possible API response formats
    if (typeof allocation === 'object' && allocation !== null) {
      for (const [key, value] of Object.entries(allocation)) {
        if (typeof value === 'object' && value !== null) {
          const v = value as { symbol?: string; targetPercentage?: number; percentage?: number };
          const mintAddress = this.getMintAddress(key) || key;
          result[mintAddress] = {
            symbol: key,
            targetPercentage: Number(v.percentage || v.targetPercentage || 0)
          };
        }
      }
    }

    return result;
  }

  private findLargestNonTargetHolding(holdings: VaultHoldings, excludeMint: string): { mintAddress: string; symbol: string } | null {
    let largestHolding: { mintAddress: string; symbol: string; percentage: number } | null = null;

    for (const [mintAddress, asset] of Object.entries(holdings.assets)) {
      if (mintAddress !== excludeMint && asset.percentage > 0) {
        if (!largestHolding || asset.percentage > largestHolding.percentage) {
          largestHolding = {
            mintAddress,
            symbol: asset.symbol,
            percentage: asset.percentage
          };
        }
      }
    }

    return largestHolding ? { 
      mintAddress: largestHolding.mintAddress, 
      symbol: largestHolding.symbol 
    } : null;
  }

  private getTokenSymbol(mintAddress: string): string {
    for (const [symbol, mint] of Object.entries(this.KNOWN_TOKENS)) {
      if (mint === mintAddress) {
        return symbol;
      }
    }
    return mintAddress.substring(0, 8) + '...';
  }

  private getMintAddress(symbol: string): string | null {
    return this.KNOWN_TOKENS[symbol as keyof typeof this.KNOWN_TOKENS] || null;
  }

  // Signal management
  clearProcessedSignals(userId: string): void {
    this.processedSignals.delete(userId);
  }

  getProcessedSignals(userId: string): TradeSignal[] {
    return this.processedSignals.get(userId) || [];
  }

  // Health and monitoring
  getServiceHealth() {
    return {
      activeUsers: this.processedSignals.size,
      totalSignalsProcessed: Array.from(this.processedSignals.values()).reduce((sum, signals) => sum + signals.length, 0),
      cachedGuidance: this.lastStrategicGuidance.size,
      cachedHoldings: this.lastVaultHoldings.size,
      config: this.config
    };
  }
}

// Singleton instance
export const tradingLogicService = new TradingLogicService();