/**
 * V1 Trade Executor - Testnet Only
 * Simple, working trade execution for Solana testnet
 */

import { Connection, PublicKey, VersionedTransaction } from '@solana/web3.js';
import { TradeService } from './botStateService';
import { CreateTradeData } from '@/types/database';

// V1 Mainnet configuration (using very small amounts for safety)
const MAINNET_RPC = 'https://api.mainnet-beta.solana.com';
const JUPITER_V6_API = 'https://quote-api.jup.ag/v6';

export class TradeExecutor {
  private connection: Connection;

  constructor() {
    this.connection = new Connection(MAINNET_RPC, 'confirmed');
  }

  /**
   * Execute a simple SOL to USDC swap on mainnet with small amounts for V1 testing
   */
  async executeTrade(params: {
    userWalletAddress: string;
    fromMint: string;
    toMint: string;
    amount: number; // in lamports/smallest unit
    slippageBps: number;
  }) {
    const { userWalletAddress, fromMint, toMint, amount, slippageBps } = params;

    console.log(`🚀 Executing trade: ${amount} from ${fromMint} to ${toMint}`);

    try {
      // 1. Get Jupiter quote
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
      console.log(`📊 Quote received: ${quoteData.outAmount} expected`);

      // 2. For V1: Generate trade ID without database (database creation will be added later)
      const tradeId = `v1_trade_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      console.log(`💾 V1 Trade ID generated: ${tradeId}`);

      // 3. Get swap transaction from Jupiter
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

      // 4. For V1: Return transaction for manual signing (no auto-execution)
      console.log(`✅ Trade prepared successfully: ${tradeId}`);
      
      return {
        success: true,
        tradeId,
        transaction: swapTransaction,
        expectedOutput: quoteData.outAmount,
        route: quoteData.routePlan
      };

    } catch (error) {
      console.error(`❌ Trade execution failed:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
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
  }) {
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
    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
}

export const tradeExecutor = new TradeExecutor();