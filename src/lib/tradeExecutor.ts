/**
 * V2 Trade Executor - Enhanced with Real-Time Market Data
 * Integrated with Birdeye price feeds and validation
 */

import { Connection } from '@solana/web3.js';
import { marketDataService, PriceData } from './marketData';
import { priceValidator, PriceValidationResult } from './priceValidation';

interface TradeResult {
  success: boolean;
  tradeId?: string;
  transaction?: string;
  expectedOutput?: string;
  simulation?: boolean;
  route?: unknown;
  error?: string;
  priceValidation?: PriceValidationResult;
  marketData?: {
    inputPrice: PriceData | null;
    outputPrice: PriceData | null;
    priceImpact?: number;
  };
}

// V1 Mainnet configuration (using very small amounts for safety)
const MAINNET_RPC = 'https://api.mainnet-beta.solana.com';
const JUPITER_V6_API = 'https://quote-api.jup.ag/v6';

export class TradeExecutor {
  private connection: Connection;
  private marketDataInitialized = false;

  constructor() {
    this.connection = new Connection(MAINNET_RPC, 'confirmed');
    this.initializeMarketData();
  }

  private async initializeMarketData(): Promise<void> {
    if (this.marketDataInitialized) return;

    try {
      if (!marketDataService.isConnected()) {
        await marketDataService.connect();
        console.log('✅ Trade executor connected to market data service');
      }
      this.marketDataInitialized = true;
    } catch (error) {
      console.warn('⚠️ Failed to connect to market data service:', error);
    }
  }

  /**
   * Execute trade with real-time market data validation
   */
  async executeTrade(params: {
    userWalletAddress: string;
    fromMint: string;
    toMint: string;
    amount: number; // in lamports/smallest unit
    slippageBps: number;
  }): Promise<TradeResult> {
    const { userWalletAddress, fromMint, toMint, amount, slippageBps } = params;

    console.log(`🚀 Executing V2 trade: ${amount} from ${fromMint} to ${toMint}`);

    // Ensure market data service is initialized
    await this.initializeMarketData();

    try {
      // 1. Get real-time price data for validation
      const inputPrice = marketDataService.getCurrentPrice(fromMint);
      const outputPrice = marketDataService.getCurrentPrice(toMint);
      
      let priceValidation: PriceValidationResult | undefined;

      // Subscribe to price feeds if not already subscribed
      if (!inputPrice) {
        await marketDataService.subscribeToPrice(fromMint, '1s');
        // Wait briefly for initial price data
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      if (!outputPrice) {
        await marketDataService.subscribeToPrice(toMint, '1s');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      // Get updated price data after subscription
      const updatedInputPrice = marketDataService.getCurrentPrice(fromMint);
      const updatedOutputPrice = marketDataService.getCurrentPrice(toMint);

      // Validate price data if available
      if (updatedInputPrice) {
        priceValidation = priceValidator.validatePrice(updatedInputPrice);
        
        console.log(`📊 Input token price validation:`, {
          price: updatedInputPrice.price,
          confidence: priceValidation.confidence,
          recommendation: priceValidation.recommendation
        });

        // Halt trade execution if price validation fails
        if (priceValidation.recommendation === 'halt') {
          return {
            success: false,
            error: `Price validation failed for input token: ${priceValidation.errors.join(', ')}`,
            priceValidation,
            marketData: {
              inputPrice: updatedInputPrice,
              outputPrice: updatedOutputPrice
            }
          };
        }
      } else {
        console.warn('⚠️ No price data available for input token, proceeding with Jupiter quote only');
      }
      // 2. Get Jupiter quote
      const quoteResponse = await fetch(
        `${JUPITER_V6_API}/quote?` + new URLSearchParams({
          inputMint: fromMint,
          outputMint: toMint,
          amount: amount.toString(),
          slippageBps: slippageBps.toString(),
          onlyDirectRoutes: 'false',
          asLegacyTransaction: 'false'
        })
      );

      if (!quoteResponse.ok) {
        throw new Error(`Quote failed: ${quoteResponse.status}`);
      }

      const quoteData = await quoteResponse.json();
      console.log(`📊 Jupiter quote: ${quoteData.outAmount} expected`);

      // 3. Calculate price impact if we have market data
      let priceImpact: number | undefined;
      if (updatedInputPrice && updatedOutputPrice) {
        const expectedRate = updatedOutputPrice.price / updatedInputPrice.price;
        const jupiterRate = parseFloat(quoteData.outAmount) / amount;
        priceImpact = Math.abs(1 - (jupiterRate / expectedRate)) * 100;
        
        console.log(`💹 Price impact analysis: ${priceImpact.toFixed(4)}%`);
        
        // Warn about high price impact
        if (priceImpact > 3) {
          console.warn(`⚠️ High price impact detected: ${priceImpact.toFixed(2)}%`);
        }
      }

      // 4. Generate trade ID with market data context
      const tradeId = `v2_trade_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      console.log(`💾 V2 Trade ID generated: ${tradeId}`);

      // 5. Get swap transaction from Jupiter
      const swapResponse = await fetch(`${JUPITER_V6_API}/swap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quoteResponse: quoteData,
          userPublicKey: userWalletAddress,
          wrapAndUnwrapSol: true,
          dynamicComputeUnitLimit: true,
          prioritizationFeeLamports: 1000
        })
      });

      if (!swapResponse.ok) {
        console.error(`❌ Swap API error: ${swapResponse.status}`);
        throw new Error(`Swap failed: ${swapResponse.status}`);
      }

      const { swapTransaction } = await swapResponse.json();

      // 6. Return enhanced trade result with market data
      console.log(`✅ V2 Trade prepared successfully: ${tradeId}`);
      
      return {
        success: true,
        tradeId,
        transaction: swapTransaction,
        expectedOutput: quoteData.outAmount,
        route: quoteData.routePlan,
        priceValidation,
        marketData: {
          inputPrice: updatedInputPrice,
          outputPrice: updatedOutputPrice,
          priceImpact
        }
      };

    } catch {
      console.error(`❌ Trade execution failed:`);
      return {
        success: false,
        error: 'Unknown error'
      };
    }
  }

  /**
   * Simulate trade execution for testing
   */
  async simulateTrade(params: {
    userWalletAddress: string;
    fromMint: string;
    toMint: string;
    amount: number;
    slippageBps: number;
  }): Promise<TradeResult> {
    console.log(`🧪 Simulating trade:`, params);
    
    // Create a mock successful trade
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const mockOutput = Math.floor(params.amount * 0.998); // 0.2% slippage
    
    return {
      success: true,
      tradeId: `sim_${Date.now()}`,
      expectedOutput: mockOutput,
      simulation: true
    };
  }

  /**
   * Check testnet connection health
   */
  async checkHealth() {
    try {
      const slot = await this.connection.getSlot();
      return {
        healthy: true,
        network: 'mainnet',
        slot,
        rpc: MAINNET_RPC
      };
    } catch {
      return {
        healthy: false,
        error: 'Unknown error'
      };
    }
  }
}

export const tradeExecutor = new TradeExecutor();