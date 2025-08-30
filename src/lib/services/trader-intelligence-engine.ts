/**
 * Trader Intelligence Engine
 * Main orchestrator for the data pipeline that implements Task 3.1 from the PRD
 * Coordinates data ingestion, transaction parsing, price fetching, P&L calculation, and metrics computation
 */

import { 
  WalletAnalysisConfig, 
  WalletAnalysisResult, 
  WalletPerformanceMetrics,
  BatchAnalysisRequest,
  BatchAnalysisResult
  // AnalysisError // Unused
} from '@/types/trader-intelligence';
import { solanaDataService } from './solana-data-service';
import { raydiumParser } from './raydium-parser';
import { priceDataService } from './price-data-service';
import { pnlCalculator } from './pnl-calculator';
import { performanceMetricsCalculator } from './performance-metrics';
import { xorjTrustScoreCalculator, XORJTrustScore } from './xorj-trust-score';
import { ANALYSIS_CONFIG } from '@/lib/constants';
import { pRateLimit } from 'p-ratelimit';

export class TraderIntelligenceEngine {
  private isProcessing = false;
  private currentAnalysisId = 0;

  /**
   * Analyze a single wallet's trading performance
   * This is the main entry point for Task 3.1
   */
  async analyzeWallet(config: WalletAnalysisConfig): Promise<WalletAnalysisResult> {
    const _startTime = Date.now();
    const analysisId = `analysis_${++this.currentAnalysisId}_${Date.now()}`;
    
    console.log(`🚀 Starting wallet analysis: ${analysisId}`);
    console.log(`📊 Wallet: ${config.walletAddress}`);
    console.log(`📅 Period: ${config.startDate ? new Date(config.startDate * 1000).toISOString() : 'All time'} to ${config.endDate ? new Date(config.endDate * 1000).toISOString() : 'Now'}`);

    const result: WalletAnalysisResult = {
      config,
      metrics: {} as WalletPerformanceMetrics, // Will be populated
      processingStats: {
        totalTransactionsFetched: 0,
        validSwapsFound: 0,
        priceDataMissingCount: 0,
        processingTimeMs: 0,
        errors: []
      },
      status: 'partial',
      completedAt: 0
    };

    try {
      // Step 1: Fetch all historical transactions for the wallet
      console.log(`🔍 Step 1: Fetching transaction history...`);
      const { signatures, errors: signatureErrors } = await solanaDataService.getWalletTransactionSignatures(
        config.walletAddress,
        {
          limit: config.maxTransactions || ANALYSIS_CONFIG.MAX_TRANSACTIONS_PER_WALLET
        }
      );

      result.processingStats.errors.push(...signatureErrors);
      result.processingStats.totalTransactionsFetched = signatures.length;

      if (signatures.length === 0) {
        console.warn(`⚠️ No transactions found for wallet ${config.walletAddress}`);
        result.status = 'failed';
        result.completedAt = Date.now();
        result.processingStats.processingTimeMs = Date.now() - _startTime;
        return result;
      }

      console.log(`✅ Step 1 Complete: ${signatures.length} transaction signatures fetched`);

      // Step 2: Filter by time range if specified
      let filteredSignatures = signatures;
      if (config.startDate || config.endDate) {
        const _startTime = config.startDate || 0;
        const endTime = config.endDate || Math.floor(Date.now() / 1000);
        filteredSignatures = solanaDataService.filterTransactionsByTimeRange(
          signatures,
          _startTime,
          endTime
        );
        console.log(`🗓️ Filtered to ${filteredSignatures.length} transactions in date range`);
      }

      // Step 3: Fetch detailed transaction data
      console.log(`🔍 Step 2: Fetching detailed transaction data...`);
      const transactionSignatures = filteredSignatures.map(sig => sig.signature);
      const { transactions, errors: transactionErrors } = await solanaDataService.getTransactionDetails(
        transactionSignatures
      );

      result.processingStats.errors.push(...transactionErrors);
      console.log(`✅ Step 2 Complete: ${transactions.length} detailed transactions fetched`);

      // Step 4: Parse Raydium swap transactions
      console.log(`🔍 Step 3: Parsing Raydium swap transactions...`);
      const { swaps, errors: parsingErrors } = await raydiumParser.parseTransactions(
        transactions,
        config.walletAddress
      );

      result.processingStats.errors.push(...parsingErrors);
      result.processingStats.validSwapsFound = swaps.length;

      if (swaps.length === 0) {
        console.warn(`⚠️ No Raydium swaps found for wallet ${config.walletAddress}`);
        result.status = 'failed';
        result.completedAt = Date.now();
        result.processingStats.processingTimeMs = Date.now() - _startTime;
        return result;
      }

      console.log(`✅ Step 3 Complete: ${swaps.length} Raydium swaps identified`);

      // Step 5: Apply additional filters
      let filteredSwaps = swaps;
      
      if (config.minTradeValueUsd) {
        // This filter will be applied after we get USD values in the next step
        console.log(`🔍 Will apply minimum trade value filter: $${config.minTradeValueUsd}`);
      }

      if (config.includeTokens && config.includeTokens.length > 0) {
        filteredSwaps = filteredSwaps.filter(swap =>
          config.includeTokens!.includes(swap.tokenIn.mint) ||
          config.includeTokens!.includes(swap.tokenOut.mint)
        );
        console.log(`🔍 Filtered to ${filteredSwaps.length} swaps (include tokens)`);
      }

      if (config.excludeTokens && config.excludeTokens.length > 0) {
        filteredSwaps = filteredSwaps.filter(swap =>
          !config.excludeTokens!.includes(swap.tokenIn.mint) &&
          !config.excludeTokens!.includes(swap.tokenOut.mint)
        );
        console.log(`🔍 Filtered to ${filteredSwaps.length} swaps (exclude tokens)`);
      }

      // Step 6: Calculate P&L with USD cost basis
      console.log(`💰 Step 4: Calculating P&L with USD cost basis...`);
      const { enhancedSwaps, positions, completedTrades, errors: pnlErrors } = await pnlCalculator.calculatePnLForSwaps(filteredSwaps);
      
      result.processingStats.errors.push(...pnlErrors);

      // Apply minimum trade value filter if specified
      let finalEnhancedSwaps = enhancedSwaps;
      if (config.minTradeValueUsd) {
        finalEnhancedSwaps = enhancedSwaps.filter(swap => swap.tokenInUsdValue >= config.minTradeValueUsd!);
        console.log(`🔍 Applied minimum trade value filter: ${finalEnhancedSwaps.length} swaps remaining`);
      }

      // Count missing price data
      const priceDataMissing = enhancedSwaps.length - finalEnhancedSwaps.length;
      result.processingStats.priceDataMissingCount = priceDataMissing;

      console.log(`✅ Step 4 Complete: P&L calculated for ${finalEnhancedSwaps.length} swaps`);

      // Step 7: Calculate performance metrics
      console.log(`📊 Step 5: Calculating performance metrics...`);
      
      const analysisStartDate = config.startDate || (completedTrades.length > 0 ? 
        Math.min(...completedTrades.map(t => t.entryTimestamp)) : 
        Math.floor((Date.now() / 1000) - (ANALYSIS_CONFIG.ANALYSIS_PERIOD_DAYS * 24 * 60 * 60)));
      
      const analysisEndDate = config.endDate || Math.floor(Date.now() / 1000);

      const metrics = performanceMetricsCalculator.calculateMetrics(
        config.walletAddress,
        finalEnhancedSwaps,
        completedTrades,
        positions,
        analysisStartDate,
        analysisEndDate
      );

      result.metrics = metrics;

      console.log(`✅ Step 5 Complete: Performance metrics calculated`);

      // Step 8: Validate results
      console.log(`🔍 Step 6: Validating results...`);
      const validation = performanceMetricsCalculator.validateMetrics(metrics);
      
      if (!validation.isValid) {
        console.warn(`⚠️ Validation warnings:`, validation.warnings);
        result.processingStats.errors.push(...validation.warnings.map(warning => ({
          type: 'calculation_error' as const,
          message: `Validation warning: ${warning}`,
          timestamp: Date.now(),
          context: { walletAddress: config.walletAddress }
        })));
      }

      // Determine final status
      if (completedTrades.length >= ANALYSIS_CONFIG.MIN_TRADES_FOR_ANALYSIS) {
        result.status = 'completed';
      } else {
        result.status = 'partial';
        result.processingStats.errors.push({
          type: 'calculation_error',
          message: `Insufficient trades for reliable analysis (${completedTrades.length} < ${ANALYSIS_CONFIG.MIN_TRADES_FOR_ANALYSIS})`,
          timestamp: Date.now(),
          context: { walletAddress: config.walletAddress, tradeCount: completedTrades.length }
        });
      }

      console.log(`✅ Analysis Complete!`);
      console.log(`📊 Final Results:`);
      console.log(`   • Net ROI: ${metrics.netRoi.toFixed(2)}%`);
      console.log(`   • Max Drawdown: ${metrics.maxDrawdown.toFixed(2)}%`);
      console.log(`   • Sharpe Ratio: ${metrics.sharpeRatio.toFixed(3)}`);
      console.log(`   • Win/Loss Ratio: ${metrics.winLossRatio.toFixed(2)}`);
      console.log(`   • Total Trades: ${metrics.totalTrades}`);
      console.log(`   • Win Rate: ${metrics.winRate.toFixed(1)}%`);
      console.log(`   • Data Quality: ${metrics.dataQuality}`);
      console.log(`   • Confidence Score: ${metrics.confidenceScore}/100`);

    } catch {
      console.error(`❌ Fatal error in wallet analysis:`);
      result.status = 'failed';
      result.processingStats.errors.push({
        type: 'calculation_error',
        message: `Analysis failed: ${error}`,
        timestamp: Date.now(),
        context: { walletAddress: config.walletAddress }
      });
    } finally {
      result.completedAt = Date.now();
      result.processingStats.processingTimeMs = Date.now() - _startTime;
      console.log(`⏱️ Total processing time: ${result.processingStats.processingTimeMs}ms`);
    }

    return result;
  }

  /**
   * Calculate XORJ Trust Scores for multiple wallets (analyze + score)
   */
  async scoreWallets(
    walletAddresses: string[],
    config?: Omit<WalletAnalysisConfig, 'walletAddress'>
  ): Promise<{
    scores: XORJTrustScore[];
    cohortStats: { averageScore: number; totalAnalyzed: number; riskDistribution: Record<string, number> };
    processingStats: {
      totalWallets: number;
      analyzedWallets: number;
      eligibleWallets: number;
      processingTimeMs: number;
    };
  }> {
    // const _startTime = Date.now(); // Unused - removed for performance scoring
    console.log(`🎯 Scoring ${walletAddresses.length} wallets with XORJ Trust Score`);

    // Analyze all wallets first
    const batchRequest: BatchAnalysisRequest = {
      walletAddresses,
      config: config || {},
      priority: 'high'
    };

    const batchResult = await this.analyzeBatch(batchRequest);
    
    // Get successful analysis results
    const successfulResults = batchResult.walletResults.filter(r => r.status === 'completed');
    const walletMetrics = successfulResults.map(r => r.metrics);

    console.log(`✅ Analysis complete: ${walletMetrics.length}/${walletAddresses.length} wallets analyzed`);

    // Calculate trust scores
    const { scores, cohortStats } = xorjTrustScoreCalculator.calculateTrustScores(walletMetrics);

    // const _processingTimeMs = Date.now() - _startTime; // Unused

    return {
      scores,
      cohortStats,
      processingStats: {
        totalWallets: walletAddresses.length,
        analyzedWallets: walletMetrics.length,
        eligibleWallets: cohortStats.eligibleWallets,
        processingTimeMs
      }
    };
  }

  /**
   * Analyze multiple wallets in batch with parallel processing
   */
  async analyzeBatch(request: BatchAnalysisRequest): Promise<BatchAnalysisResult> {
    const _startTime = Date.now();
    const requestId = `batch_${Date.now()}`;

    console.log(`🚀 Starting parallel batch analysis: ${requestId}`);
    console.log(`📊 Wallets: ${request.walletAddresses.length}`);

    // Create a rate limiter to run 5 analyses concurrently
    // This respects API limits while maximizing throughput
    const limit = pRateLimit({
      interval: 1000, // 1 second
      rate: 5,        // 5 calls per interval
      concurrency: 5, // 5 promises running at once
    });

    // Create analysis promises for all wallets
    const analysisPromises = request.walletAddresses.map((walletAddress, index) => 
      // Wrap the analysis call in the rate limiter
      limit(async () => {
        console.log(`📈 Processing wallet ${index + 1}/${request.walletAddresses.length}: ${walletAddress}`);
        
        try {
          const walletConfig: WalletAnalysisConfig = {
            ...request.config,
            walletAddress
          };

          const result = await this.analyzeWallet(walletConfig);
          return result;

        } catch {
          console.error(`❌ Failed to analyze wallet ${walletAddress}:`);
          
          // Create failed result
          return {
            config: { ...request.config, walletAddress },
            metrics: {} as WalletPerformanceMetrics,
            processingStats: {
              totalTransactionsFetched: 0,
              validSwapsFound: 0,
              priceDataMissingCount: 0,
              processingTimeMs: 0,
              errors: [{
                type: 'calculation_error' as const,
                message: `Batch analysis failed: ${error}`,
                timestamp: Date.now(),
                context: { walletAddress }
              }]
            },
            status: 'failed' as const,
            completedAt: Date.now()
          };
        }
      })
    );

    // Use Promise.allSettled to wait for all promises to resolve, even if some fail
    console.log(`⚡ Running ${analysisPromises.length} analyses in parallel (max 5 concurrent)...`);
    const results = await Promise.allSettled(analysisPromises);

    // Process results and handle any rejections
    const walletResults: WalletAnalysisResult[] = results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        // Log the specific error for the failed wallet
        console.error(`Analysis failed for ${request.walletAddresses[index]}:`, result.reason);
        return {
          config: { ...request.config, walletAddress: request.walletAddresses[index] },
          metrics: {} as WalletPerformanceMetrics,
          processingStats: {
            totalTransactionsFetched: 0,
            validSwapsFound: 0,
            priceDataMissingCount: 0,
            processingTimeMs: 0,
            errors: [{
              type: 'calculation_error' as const,
              message: `Analysis promise rejected: ${result.reason?.message || result.reason}`,
              timestamp: Date.now(),
              context: { walletAddress: request.walletAddresses[index] }
            }]
          },
          status: 'failed' as const,
          completedAt: Date.now()
        };
      }
    });

    // Calculate summary statistics
    const completedWallets = walletResults.filter(r => r.status === 'completed').length;
    const failedWallets = walletResults.filter(r => r.status === 'failed').length;
    const totalTime = Date.now() - _startTime;
    const avgProcessingTime = walletResults.length > 0 ? 
      walletResults.reduce((sum, result) => sum + result.processingStats.processingTimeMs, 0) / walletResults.length : 0;

    const batchResult: BatchAnalysisResult = {
      requestId,
      walletResults,
      summary: {
        totalWallets: request.walletAddresses.length,
        completedWallets,
        failedWallets,
        avgProcessingTimeMs: avgProcessingTime
      },
      startedAt: _startTime,
      completedAt: Date.now()
    };

    console.log(`✅ Parallel batch analysis complete: ${requestId}`);
    console.log(`📊 Results: ${completedWallets}/${request.walletAddresses.length} successful`);
    console.log(`⚡ Performance improvement: Parallel processing reduced total time to ${totalTime}ms`);
    console.log(`📈 Throughput: ~${(request.walletAddresses.length / (totalTime / 1000)).toFixed(2)} wallets/second`);

    return batchResult;
  }

  /**
   * Get engine health status
   */
  async getHealthStatus(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    services: {
      solanaRpc: boolean;
      priceApis: boolean;
      parser: boolean;
    };
    lastCheck: number;
  }> {
    console.log(`🔍 Checking engine health...`);

    try {
      // Check Solana RPC connection
      const rpcHealthy = await solanaDataService.checkConnectionHealth();
      
      // Check price API services
      const priceHealth = await priceDataService.getHealthMetrics();
      const priceApisHealthy = priceHealth.jupiterStatus === 'ok' || priceHealth.coingeckoStatus === 'ok';

      // Parser is always healthy (no external dependencies)
      const parserHealthy = true;

      const allHealthy = rpcHealthy && priceApisHealthy && parserHealthy;
      const someHealthy = rpcHealthy || priceApisHealthy;

      return {
        status: allHealthy ? 'healthy' : someHealthy ? 'degraded' : 'unhealthy',
        services: {
          solanaRpc: rpcHealthy,
          priceApis: priceApisHealthy,
          parser: parserHealthy
        },
        lastCheck: Date.now()
      };
    } catch {
      console.error(`❌ Health check failed:`);
      return {
        status: 'unhealthy',
        services: {
          solanaRpc: false,
          priceApis: false,
          parser: false
        },
        lastCheck: Date.now()
      };
    }
  }

  /**
   * Get processing status
   */
  getProcessingStatus(): {
    isProcessing: boolean;
    currentAnalysisId: number;
  } {
    return {
      isProcessing: this.isProcessing,
      currentAnalysisId: this.currentAnalysisId
    };
  }

  /**
   * Reset engine state (for testing)
   */
  reset(): void {
    this.isProcessing = false;
    this.currentAnalysisId = 0;
    pnlCalculator.reset();
    priceDataService.clearCache();
  }
}

// Export singleton instance
export const traderIntelligenceEngine = new TraderIntelligenceEngine();