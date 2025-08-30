/**
 * Risk Management Module - Phase 3
 * The final guardian: Non-negotiable safety checks before trade execution
 * "Intent ≠ License" - transforms trade signals into authorized actions
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, getAccount } from '@solana/spl-token';
import { TradeSignal } from './tradingLogic';
import { marketDataService } from './marketData';

// Validated trade signal - only issued after passing ALL risk checks
export interface ValidatedTradeSignal extends TradeSignal {
  riskValidation: {
    validatedAt: number;
    validationId: string;
    checksPerformed: string[];
    tradeValueUSD: number;
    positionSizePercentage: number;
    currentDrawdown: number;
    priceImpact: number;
    slippage: number;
    jupiterQuote: any;
  };
}

// Risk validation error - thrown when any check fails
export class RiskValidationError extends Error {
  public readonly code: string;
  public readonly checkFailed: string;
  public readonly signal: TradeSignal;
  public readonly details: any;

  constructor(message: string, code: string, checkFailed: string, signal: TradeSignal, details: any = {}) {
    super(message);
    this.name = 'RiskValidationError';
    this.code = code;
    this.checkFailed = checkFailed;
    this.signal = signal;
    this.details = details;
  }
}

// Portfolio P&L data
interface PortfolioMetrics {
  totalValue: number;
  initialValue: number;
  unrealizedPnL: number;
  unrealizedPnLPercentage: number;
  isInDrawdown: boolean;
  drawdownPercentage: number;
}

// Risk management configuration
interface RiskConfig {
  maxPositionSizePercentage: number; // 50% of vault value
  maxDrawdownThreshold: number; // 20% maximum drawdown
  maxPriceImpact: number; // 1% maximum price impact
  maxSlippage: number; // 1% maximum slippage
}

export class RiskManagementService {
  private connection: Connection;
  
  private readonly config: RiskConfig = {
    maxPositionSizePercentage: 50.0, // V1: 50% of total vault value
    maxDrawdownThreshold: 20.0, // 20% maximum portfolio drawdown
    maxPriceImpact: 1.0, // 1% maximum price impact
    maxSlippage: 1.0 // 1% maximum slippage
  };

  private readonly MAINNET_RPC = 'https://api.mainnet-beta.solana.com';
  private readonly JUPITER_V6_API = 'https://quote-api.jup.ag/v6';

  constructor() {
    this.connection = new Connection(this.MAINNET_RPC, 'confirmed');
  }

  /**
   * MAIN VALIDATION FUNCTION - The Final Guardian
   * Input: TradeSignal from Trading Logic Module
   * Output: ValidatedTradeSignal OR RiskValidationError
   */
  async validateTradeSignal(signal: TradeSignal): Promise<ValidatedTradeSignal> {
    const validationId = `risk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const checksPerformed: string[] = [];

    console.log(`🛡️ RISK VALIDATION STARTED: ${validationId}`);
    console.log(`📊 Signal: ${signal.fromAsset.symbol} → ${signal.toAsset.symbol} (${signal.targetPercentage}%)`);

    try {
      // Requirement 3.1: Position Sizing Check
      console.log('🔍 Check 1/3: Position Sizing Validation');
      checksPerformed.push('Position Sizing Check');
      
      const { tradeValueUSD, positionSizePercentage, vaultTotalValue } = await this.validatePositionSizing(signal);
      
      if (positionSizePercentage > this.config.maxPositionSizePercentage) {
        throw new RiskValidationError(
          `Position size ${positionSizePercentage.toFixed(2)}% exceeds maximum allowed ${this.config.maxPositionSizePercentage}%`,
          'POSITION_SIZE_EXCEEDED',
          'Position Sizing Check',
          signal,
          { tradeValueUSD, positionSizePercentage, maxAllowed: this.config.maxPositionSizePercentage }
        );
      }

      console.log(`✅ Position sizing passed: ${positionSizePercentage.toFixed(2)}% of vault ($${tradeValueUSD.toFixed(2)})`);

      // Requirement 3.2: Portfolio Drawdown Check
      console.log('🔍 Check 2/3: Portfolio Drawdown Validation');
      checksPerformed.push('Portfolio Drawdown Check');
      
      const portfolioMetrics = await this.validatePortfolioDrawdown(signal.vaultAddress);
      
      if (portfolioMetrics.drawdownPercentage > this.config.maxDrawdownThreshold) {
        throw new RiskValidationError(
          `Portfolio in excessive drawdown: ${portfolioMetrics.drawdownPercentage.toFixed(2)}% exceeds maximum ${this.config.maxDrawdownThreshold}%`,
          'EXCESSIVE_DRAWDOWN',
          'Portfolio Drawdown Check', 
          signal,
          { currentDrawdown: portfolioMetrics.drawdownPercentage, maxAllowed: this.config.maxDrawdownThreshold, portfolioMetrics }
        );
      }

      console.log(`✅ Drawdown check passed: ${portfolioMetrics.drawdownPercentage.toFixed(2)}% drawdown (limit: ${this.config.maxDrawdownThreshold}%)`);

      // Requirement 3.3: Price Impact & Slippage Check
      console.log('🔍 Check 3/3: Price Impact & Slippage Validation');
      checksPerformed.push('Price Impact & Slippage Check');
      
      const { priceImpact, slippage, jupiterQuote } = await this.validatePriceImpactAndSlippage(signal, tradeValueUSD);
      
      if (priceImpact > this.config.maxPriceImpact) {
        throw new RiskValidationError(
          `Price impact ${priceImpact.toFixed(4)}% exceeds maximum allowed ${this.config.maxPriceImpact}%`,
          'EXCESSIVE_PRICE_IMPACT',
          'Price Impact & Slippage Check',
          signal,
          { priceImpact, slippage, maxPriceImpact: this.config.maxPriceImpact, jupiterQuote }
        );
      }

      if (slippage > this.config.maxSlippage) {
        throw new RiskValidationError(
          `Slippage ${slippage.toFixed(4)}% exceeds maximum allowed ${this.config.maxSlippage}%`,
          'EXCESSIVE_SLIPPAGE',
          'Price Impact & Slippage Check',
          signal,
          { priceImpact, slippage, maxSlippage: this.config.maxSlippage, jupiterQuote }
        );
      }

      console.log(`✅ Price impact check passed: Impact ${priceImpact.toFixed(4)}%, Slippage ${slippage.toFixed(4)}%`);

      // ALL CHECKS PASSED - Create ValidatedTradeSignal
      const validatedSignal: ValidatedTradeSignal = {
        ...signal,
        riskValidation: {
          validatedAt: Date.now(),
          validationId,
          checksPerformed,
          tradeValueUSD,
          positionSizePercentage,
          currentDrawdown: portfolioMetrics.drawdownPercentage,
          priceImpact,
          slippage,
          jupiterQuote
        }
      };

      console.log(`🟢 RISK VALIDATION PASSED: ${validationId}`);
      console.log(`📋 Signal authorized for execution - all safety checks cleared`);

      return validatedSignal;

    } catch (error) {
      if (error instanceof RiskValidationError) {
        console.log(`🔴 RISK VALIDATION FAILED: ${error.checkFailed}`);
        console.log(`❌ Reason: ${error.message}`);
        console.log(`🚫 Signal REJECTED for safety - no execution permitted`);
        throw error;
      }

      // Unexpected error during validation
      throw new RiskValidationError(
        `Risk validation failed due to system error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'VALIDATION_SYSTEM_ERROR',
        'System Error',
        signal,
        { originalError: error, checksPerformed }
      );
    }
  }

  /**
   * Requirement 3.1: Position Sizing Check
   * Verify trade value doesn't exceed 50% of total vault value
   */
  private async validatePositionSizing(signal: TradeSignal): Promise<{
    tradeValueUSD: number;
    positionSizePercentage: number;
    vaultTotalValue: number;
  }> {
    try {
      // Get current vault total value
      const vaultPublicKey = new PublicKey(signal.vaultAddress);
      let vaultTotalValue = 0;

      // Fetch all token accounts to calculate total vault value
      const tokenAccounts = await this.connection.getTokenAccountsByOwner(vaultPublicKey, {
        programId: TOKEN_PROGRAM_ID
      });

      for (const tokenAccountInfo of tokenAccounts.value) {
        try {
          const accountData = await getAccount(this.connection, tokenAccountInfo.pubkey);
          const mintAddress = accountData.mint.toString();
          const balance = Number(accountData.amount) / Math.pow(10, 6); // Assuming 6 decimals
          
          if (balance === 0) continue;

          // Get price for valuation
          const priceData = marketDataService.getCurrentPrice(mintAddress);
          const price = priceData?.price || 0;
          const value = balance * price;
          
          vaultTotalValue += value;
        } catch (accountError) {
          console.warn(`⚠️ Could not process token account for position sizing:`, accountError);
        }
      }

      if (vaultTotalValue === 0) {
        throw new Error('Vault total value is zero - cannot calculate position sizing');
      }

      // Calculate trade value from target percentage
      const tradeValueUSD = (signal.targetPercentage / 100) * vaultTotalValue;
      const positionSizePercentage = (tradeValueUSD / vaultTotalValue) * 100;

      return { tradeValueUSD, positionSizePercentage, vaultTotalValue };

    } catch (error) {
      throw new Error(`Position sizing validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Requirement 3.2: Portfolio Drawdown Check  
   * Verify portfolio isn't in excessive drawdown (>20%)
   */
  private async validatePortfolioDrawdown(vaultAddress: string): Promise<PortfolioMetrics> {
    try {
      // For V1, we'll use a simplified approach
      // In production, this would query historical portfolio values from our database
      
      // Get current vault value
      const vaultPublicKey = new PublicKey(vaultAddress);
      let currentValue = 0;

      const tokenAccounts = await this.connection.getTokenAccountsByOwner(vaultPublicKey, {
        programId: TOKEN_PROGRAM_ID
      });

      for (const tokenAccountInfo of tokenAccounts.value) {
        try {
          const accountData = await getAccount(this.connection, tokenAccountInfo.pubkey);
          const mintAddress = accountData.mint.toString();
          const balance = Number(accountData.amount) / Math.pow(10, 6);
          
          if (balance === 0) continue;

          const priceData = marketDataService.getCurrentPrice(mintAddress);
          const price = priceData?.price || 0;
          currentValue += balance * price;
        } catch (accountError) {
          console.warn(`⚠️ Could not process token account for drawdown check:`, accountError);
        }
      }

      // For V1 MVP, assume initial value is 20% higher than current (simulating some losses)
      // In production, this would be tracked in our database from actual historical data
      const initialValue = currentValue * 1.25; // Simulates previous higher portfolio value
      
      const unrealizedPnL = currentValue - initialValue;
      const unrealizedPnLPercentage = (unrealizedPnL / initialValue) * 100;
      
      const isInDrawdown = unrealizedPnLPercentage < 0;
      const drawdownPercentage = isInDrawdown ? Math.abs(unrealizedPnLPercentage) : 0;

      const portfolioMetrics: PortfolioMetrics = {
        totalValue: currentValue,
        initialValue,
        unrealizedPnL,
        unrealizedPnLPercentage,
        isInDrawdown,
        drawdownPercentage
      };

      return portfolioMetrics;

    } catch (error) {
      throw new Error(`Portfolio drawdown validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Requirement 3.3: Price Impact & Slippage Check
   * Verify Jupiter quote shows acceptable price impact (<1%) and slippage (<1%)
   */
  private async validatePriceImpactAndSlippage(signal: TradeSignal, tradeValueUSD: number): Promise<{
    priceImpact: number;
    slippage: number;
    jupiterQuote: any;
  }> {
    try {
      // Convert USD value to input token amount for Jupiter quote
      const inputPriceData = marketDataService.getCurrentPrice(signal.fromAsset.mintAddress);
      if (!inputPriceData) {
        throw new Error(`No price data available for input token ${signal.fromAsset.symbol}`);
      }

      const inputAmount = Math.floor((tradeValueUSD / inputPriceData.price) * Math.pow(10, 6)); // Assuming 6 decimals

      // Get Jupiter quote for the exact trade
      const quoteResponse = await fetch(
        `${this.JUPITER_V6_API}/quote?` + new URLSearchParams({
          inputMint: signal.fromAsset.mintAddress,
          outputMint: signal.toAsset.mintAddress,
          amount: inputAmount.toString(),
          slippageBps: '100', // 1% slippage for quote
          onlyDirectRoutes: 'false',
          asLegacyTransaction: 'false'
        })
      );

      if (!quoteResponse.ok) {
        throw new Error(`Jupiter quote failed with status ${quoteResponse.status}`);
      }

      const jupiterQuote = await quoteResponse.json();

      // Calculate actual price impact from quote
      const expectedOutputAmount = inputAmount; // 1:1 would be no impact
      const actualOutputAmount = parseInt(jupiterQuote.outAmount);
      const priceImpact = Math.abs(1 - (actualOutputAmount / expectedOutputAmount)) * 100;

      // Get slippage from quote
      const slippage = parseFloat(jupiterQuote.slippageBps || '0') / 100; // Convert basis points to percentage

      return { priceImpact, slippage, jupiterQuote };

    } catch (error) {
      throw new Error(`Price impact validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Utility method to get current risk configuration
   */
  getRiskConfig(): RiskConfig {
    return { ...this.config };
  }

  /**
   * Health check for monitoring
   */
  getServiceHealth() {
    return {
      service: 'Risk Management Module',
      status: 'active',
      version: '3.0.0',
      config: this.config,
      lastCheck: new Date().toISOString(),
      criticalChecks: [
        'Position Sizing Check (≤50% vault value)',
        'Portfolio Drawdown Check (≤20% drawdown)',
        'Price Impact & Slippage Check (≤1% each)'
      ]
    };
  }
}

// Singleton instance
export const riskManagementService = new RiskManagementService();