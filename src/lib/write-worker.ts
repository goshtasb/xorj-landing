#!/usr/bin/env node
/**
 * Write Worker - BullMQ Job Processor
 * Phase 2: Architecting for Concurrency - Processing Write Operations
 * 
 * This worker runs as a separate, long-running process to handle all queued write operations.
 * 
 * WORKER LOGIC:
 * 1. Connect to BullMQ queue and listen for new jobs
 * 2. Process jobs by executing actual database write operations
 * 3. Robust error handling for failed database writes
 * 4. Move failed jobs to "failed" queue for inspection
 * 
 * To run: node dist/lib/write-worker.js
 * Or: ts-node src/lib/write-worker.ts (for development)
 */

import { Worker, Job } from 'bullmq';
import { WriteJob, BotStatusJob, UserSettingsJob, TradeExecutionJob } from './queueService';
import { transaction } from './database';
import { cacheLayer } from './cacheLayer';
// import { redisService } from './redis'; // Unused for now

interface WorkerConfig {
  concurrency: number;
  redis: {
    host: string;
    port: number;
    password?: string;
    db: number;
  };
}

class WriteWorker {
  private worker: Worker<WriteJob> | null = null;
  private isRunning = false;

  constructor() {
    this.initialize();
  }

  private getWorkerConfig(): WorkerConfig {
    return {
      concurrency: parseInt(process.env.WORKER_CONCURRENCY || '5'), // Process 5 jobs concurrently
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD || undefined,
        db: parseInt(process.env.REDIS_DB || '0'),
      },
    };
  }

  private async initialize(): Promise<void> {
    try {
      const config = this.getWorkerConfig();

      this.worker = new Worker<WriteJob>(
        'write-operations',
        async (job: Job<WriteJob>) => {
          return await this.processJob(job);
        },
        {
          connection: config.redis,
          concurrency: config.concurrency,
          removeOnComplete: 100,
          removeOnFail: 50,
        }
      );

      // Handle worker events
      this.worker.on('ready', () => {
        this.isRunning = true;
      });

      this.worker.on('error', (err) => {
        console.error('🚨 Write worker error:', err);
      });

      this.worker.on('failed', (job, err) => {
        console.error(`❌ Job ${job?.id} failed:`, err);
      });

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      this.worker.on('completed', (job) => {
        // Completed job logic would go here
      });

      // Graceful shutdown handling
      process.on('SIGINT', async () => {
        await this.shutdown();
        process.exit(0);
      });

      process.on('SIGTERM', async () => {
        await this.shutdown();
        process.exit(0);
      });

    } catch (error) {
      console.error('❌ Failed to initialize write worker:', error);
      process.exit(1);
    }
  }

  /**
   * Process individual jobs based on their type
   */
  private async processJob(job: Job<WriteJob>): Promise<string> {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { type, timestamp: _timestamp, requestId: _requestId } = job.data;
    const processingStartTime = Date.now();
    

    try {
      let result: string;

      switch (type) {
        case 'SET_BOT_STATUS':
          result = await this.processBotStatusJob(job.data as BotStatusJob);
          break;
        case 'UPDATE_USER_SETTINGS':
          result = await this.processUserSettingsJob(job.data as UserSettingsJob);
          break;
        case 'EXECUTE_TRADE':
          result = await this.processTradeExecutionJob(job.data as TradeExecutionJob);
          break;
        default:
          throw new Error(`Unknown job type: ${(job.data as { type?: string }).type}`);
      }

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const processingTime = Date.now() - processingStartTime;
      
      return result;
    } catch (error) {
      const processingTime = Date.now() - processingStartTime;
      const errorMessage = `Job ${job.id} failed after ${processingTime}ms: ${error instanceof Error ? error.message : 'Unknown error'}`;
      console.error(`❌ ${errorMessage}`);
      throw new Error(errorMessage);
    }
  }

  /**
   * Process bot status change jobs
   */
  private async processBotStatusJob(jobData: BotStatusJob): Promise<string> {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { userId, enabled, requestId: _requestId } = jobData;
    

    try {
      // Execute database transaction
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const result = await transaction(async (client) => {
        // Update user_settings table
        const updateResult = await client.query(`
          INSERT INTO user_settings (wallet_address, bot_enabled, risk_level, max_trade_size, created_at)
          VALUES ($1, $2, 'medium', 100, NOW())
          ON CONFLICT (wallet_address)
          DO UPDATE SET 
            bot_enabled = $2,
            updated_at = NOW()
          RETURNING wallet_address, bot_enabled, updated_at
        `, [userId, enabled]);

        // Also update bot_states table if it exists
        try {
          await client.query(`
            INSERT INTO bot_states (user_vault_address, is_enabled, created_at)
            VALUES ($1, $2, NOW())
            ON CONFLICT (user_vault_address)
            DO UPDATE SET 
              is_enabled = $2,
              updated_at = NOW()
          `, [userId, enabled]);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (error) {
          // bot_states table might not exist - log but don't fail
        }

        return updateResult;
      });

      // Invalidate cache for this user
      await cacheLayer.invalidateUserCache(userId, 'settings');
      await cacheLayer.invalidateUserCache(userId, 'bot_status');

      
      return `Bot ${enabled ? 'enabled' : 'disabled'} for user ${userId}`;
    } catch (error) {
      console.error(`❌ Database error for bot status job:`, error);
      throw error;
    }
  }

  /**
   * Process user settings update jobs
   */
  private async processUserSettingsJob(jobData: UserSettingsJob): Promise<string> {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { userId, settings, requestId } = jobData;
    

    try {
      // Execute database transaction
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const result = await transaction(async (client) => {
        const updateResult = await client.query(`
          INSERT INTO user_settings (
            wallet_address, 
            risk_level, 
            max_trade_size, 
            bot_enabled,
            created_at
          )
          VALUES ($1, $2, $3, $4, NOW())
          ON CONFLICT (wallet_address)
          DO UPDATE SET 
            risk_level = COALESCE($2, user_settings.risk_level),
            max_trade_size = COALESCE($3, user_settings.max_trade_size),
            bot_enabled = COALESCE($4, user_settings.bot_enabled),
            updated_at = NOW()
          RETURNING *
        `, [
          userId,
          settings.riskProfile || null,
          settings.investmentAmount || null,
          settings.botEnabled || null
        ]);

        return updateResult;
      });

      // Invalidate relevant caches
      await cacheLayer.invalidateUserCache(userId, 'settings');
      await cacheLayer.invalidateUserCache(userId);

      
      return `Settings updated for user ${userId}`;
    } catch (error) {
      console.error(`❌ Database error for user settings job:`, error);
      throw error;
    }
  }

  /**
   * Process trade execution jobs
   */
  private async processTradeExecutionJob(jobData: TradeExecutionJob): Promise<string> {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { userId, tradeData, requestId } = jobData;
    

    try {
      // Execute database transaction for trade record
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const result = await transaction(async (client) => {
        const tradeResult = await client.query(`
          INSERT INTO trades (
            user_vault_address,
            from_token_address,
            to_token_address,
            amount_in,
            expected_amount_out,
            status,
            created_at
          )
          VALUES ($1, $2, $3, $4, $5, 'pending', NOW())
          RETURNING id, created_at
        `, [
          userId,
          tradeData.fromMint || '',
          tradeData.toMint || '',
          tradeData.amount || 0,
          tradeData.expectedOutput || 0
        ]);

        return tradeResult;
      });

      // Invalidate user transaction caches
      await cacheLayer.invalidateUserCache(userId, 'transactions');
      await cacheLayer.invalidateUserCache(userId, 'performance');
      await cacheLayer.invalidateUserCache(userId, 'bot_trades');

      
      return `Trade queued for user ${userId}`;
    } catch (error) {
      console.error(`❌ Database error for trade execution job:`, error);
      throw error;
    }
  }

  /**
   * Get worker status
   */
  public getStatus(): { isRunning: boolean; jobsProcessed?: number } {
    return {
      isRunning: this.isRunning,
      // BullMQ doesn't expose processed count directly, would need to implement tracking
    };
  }

  /**
   * Gracefully shutdown the worker
   */
  public async shutdown(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.isRunning = false;
    }
  }
}

// Create and start the worker when this file is run directly
if (require.main === module) {
  
  const worker = new WriteWorker();
  
  // Keep the process alive
  setInterval(() => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const status = worker.getStatus();
    // Heartbeat check - could log status if needed
  }, 30000); // Heartbeat every 30 seconds
}

export default WriteWorker;