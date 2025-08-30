/**
 * Solana Data Service
 * Handles RPC connections and transaction fetching for wallet analysis
 */

import { Connection, PublicKey, ConfirmedSignatureInfo, ParsedTransactionWithMeta, GetTransactionConfig } from '@solana/web3.js';
import { SolanaTransaction, AnalysisError } from '@/types/trader-intelligence';
import { SOLANA_CONFIG, ERROR_CONFIG } from '@/lib/constants';

export class SolanaDataService {
  private connection: Connection;
  private retryDelays: number[];

  constructor(rpcEndpoint?: string) {
    const endpoint = rpcEndpoint || SOLANA_CONFIG.RPC_ENDPOINT;
    this.connection = new Connection(endpoint, {
      commitment: SOLANA_CONFIG.COMMITMENT_LEVEL,
      confirmTransactionInitialTimeout: SOLANA_CONFIG.REQUEST_TIMEOUT,
    });
    this.retryDelays = ERROR_CONFIG.RETRY_DELAYS;
  }

  /**
   * Fetch all transaction signatures for a wallet within a time range
   */
  async getWalletTransactionSignatures(
    walletAddress: string,
    options: {
      before?: string;
      until?: string;
      limit?: number;
    } = {}
  ): Promise<{ signatures: ConfirmedSignatureInfo[]; errors: AnalysisError[] }> {
    const errors: AnalysisError[] = [];
    const allSignatures: ConfirmedSignatureInfo[] = [];

    try {
      const publicKey = new PublicKey(walletAddress);
      const limit = Math.min(options.limit || SOLANA_CONFIG.TRANSACTION_BATCH_SIZE, 1000);
      
      let before = options.before;
      let fetchMore = true;
      let batchCount = 0;
      const maxBatches = Math.ceil((options.limit || 10000) / limit);

      console.log(`🔍 Fetching transaction signatures for wallet: ${walletAddress}`);
      console.log(`📊 Batch size: ${limit}, Max batches: ${maxBatches}`);

      while (fetchMore && batchCount < maxBatches) {
        try {
          const signatures = await this.retryRpcCall(async () => {
            return await this.connection.getSignaturesForAddress(
              publicKey,
              {
                before,
                until: options.until,
                limit,
              },
              SOLANA_CONFIG.COMMITMENT_LEVEL
            );
          });

          if (signatures.length === 0) {
            fetchMore = false;
            break;
          }

          allSignatures.push(...signatures);
          
          // Update before for next batch (last signature in current batch)
          before = signatures[signatures.length - 1].signature;
          batchCount++;

          console.log(`✅ Batch ${batchCount}: Found ${signatures.length} signatures (Total: ${allSignatures.length})`);

          // Rate limiting - small delay between batches
          if (batchCount < maxBatches && signatures.length === limit) {
            await this.sleep(100);
          } else {
            fetchMore = false;
          }

        } catch (error) {
          console.error(`❌ Error fetching signature batch ${batchCount + 1}:`, error);
          errors.push({
            type: 'rpc_error',
            message: `Failed to fetch signatures batch ${batchCount + 1}: ${error}`,
            timestamp: Date.now(),
            context: { walletAddress, batchCount, before }
          });
          break;
        }
      }

      console.log(`🎯 Total signatures fetched: ${allSignatures.length}`);
      return { signatures: allSignatures, errors };

    } catch (error) {
      console.error('❌ Fatal error in getWalletTransactionSignatures:', error);
      errors.push({
        type: 'rpc_error',
        message: `Failed to fetch wallet signatures: ${error}`,
        timestamp: Date.now(),
        context: { walletAddress }
      });
      return { signatures: [], errors };
    }
  }

  /**
   * Fetch detailed transaction data for multiple signatures
   */
  async getTransactionDetails(
    signatures: string[]
  ): Promise<{ transactions: SolanaTransaction[]; errors: AnalysisError[] }> {
    const errors: AnalysisError[] = [];
    const transactions: SolanaTransaction[] = [];

    if (signatures.length === 0) {
      return { transactions, errors };
    }

    console.log(`🔍 Fetching details for ${signatures.length} transactions`);

    // Process in smaller batches to avoid overwhelming the RPC
    const batchSize = 50; // Conservative batch size for transaction details
    const batches = this.chunkArray(signatures, batchSize);

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      console.log(`📦 Processing transaction batch ${i + 1}/${batches.length} (${batch.length} transactions)`);

      try {
        const batchPromises = batch.map(signature => 
          this.getTransactionWithRetry(signature)
        );

        const batchResults = await Promise.allSettled(batchPromises);
        
        for (let j = 0; j < batchResults.length; j++) {
          const result = batchResults[j];
          const signature = batch[j];

          if (result.status === 'fulfilled' && result.value) {
            transactions.push(result.value as SolanaTransaction);
          } else {
            const error = result.status === 'rejected' ? result.reason : 'Transaction not found';
            console.warn(`⚠️ Failed to fetch transaction ${signature}:`, error);
            errors.push({
              type: 'rpc_error',
              message: `Failed to fetch transaction ${signature}: ${error}`,
              timestamp: Date.now(),
              context: { signature }
            });
          }
        }

        // Rate limiting between batches
        if (i < batches.length - 1) {
          await this.sleep(200);
        }

      } catch (error) {
        console.error(`❌ Error processing transaction batch ${i + 1}:`, error);
        errors.push({
          type: 'rpc_error',
          message: `Failed to process transaction batch ${i + 1}: ${error}`,
          timestamp: Date.now(),
          context: { batchIndex: i, batchSize: batch.length }
        });
      }
    }

    console.log(`✅ Successfully fetched ${transactions.length}/${signatures.length} transactions`);
    console.log(`⚠️ Errors: ${errors.length}`);

    return { transactions, errors };
  }

  /**
   * Get a single transaction with retry logic
   */
  private async getTransactionWithRetry(signature: string): Promise<SolanaTransaction | null> {
    const config: GetTransactionConfig = {
      commitment: SOLANA_CONFIG.COMMITMENT_LEVEL,
      maxSupportedTransactionVersion: 0,
    };

    return await this.retryRpcCall(async () => {
      const transaction = await this.connection.getTransaction(signature, config);
      return transaction as SolanaTransaction | null;
    });
  }

  /**
   * Retry RPC calls with exponential backoff
   */
  private async retryRpcCall<T>(
    operation: () => Promise<T>,
    attempt: number = 0
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= SOLANA_CONFIG.MAX_RETRIES) {
        throw error;
      }

      const delay = this.retryDelays[attempt] || this.retryDelays[this.retryDelays.length - 1];
      console.log(`🔄 Retrying RPC call in ${delay}ms (attempt ${attempt + 1}/${SOLANA_CONFIG.MAX_RETRIES})`);
      
      await this.sleep(delay);
      return this.retryRpcCall(operation, attempt + 1);
    }
  }

  /**
   * Filter transactions by time range
   */
  filterTransactionsByTimeRange(
    signatures: ConfirmedSignatureInfo[],
    startTimestamp: number,
    endTimestamp: number
  ): ConfirmedSignatureInfo[] {
    return signatures.filter(sig => {
      if (!sig.blockTime) return false;
      return sig.blockTime >= startTimestamp && sig.blockTime <= endTimestamp;
    });
  }

  /**
   * Get wallet transaction count (approximate)
   */
  async getWalletTransactionCount(walletAddress: string): Promise<number> {
    try {
      const publicKey = new PublicKey(walletAddress);
      
      // Get recent signatures to estimate total count
      const recentSignatures = await this.connection.getSignaturesForAddress(
        publicKey,
        { limit: 1000 },
        SOLANA_CONFIG.COMMITMENT_LEVEL
      );

      // This is an approximation - for exact count, we'd need to fetch all signatures
      return recentSignatures.length;
    } catch (error) {
      console.error('Error getting transaction count:', error);
      return 0;
    }
  }

  /**
   * Check if RPC connection is healthy
   */
  async checkConnectionHealth(): Promise<boolean> {
    try {
      const slot = await this.connection.getSlot();
      return slot > 0;
    } catch (error) {
      console.error('RPC connection health check failed:', error);
      return false;
    }
  }

  /**
   * Get current RPC performance metrics
   */
  async getRpcMetrics(): Promise<{
    slot: number;
    blockHeight: number;
    health: 'ok' | 'behind' | 'error';
    latency: number;
  }> {
    const startTime = Date.now();
    
    try {
      const [slot, blockHeight] = await Promise.all([
        this.connection.getSlot(),
        this.connection.getBlockHeight()
      ]);

      const latency = Date.now() - startTime;
      
      return {
        slot,
        blockHeight,
        health: 'ok',
        latency
      };
    } catch (error) {
      return {
        slot: 0,
        blockHeight: 0,
        health: 'error',
        latency: Date.now() - startTime
      };
    }
  }

  /**
   * Utility: Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Utility: Chunk array into smaller arrays
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Get the underlying connection for advanced operations
   */
  getConnection(): Connection {
    return this.connection;
  }

  /**
   * Update RPC endpoint
   */
  updateRpcEndpoint(endpoint: string): void {
    this.connection = new Connection(endpoint, {
      commitment: SOLANA_CONFIG.COMMITMENT_LEVEL,
      confirmTransactionInitialTimeout: SOLANA_CONFIG.REQUEST_TIMEOUT,
    });
  }
}

// Export singleton instance for convenience
export const solanaDataService = new SolanaDataService();