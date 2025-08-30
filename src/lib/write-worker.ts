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
import { query, transaction } from './database';
import { cacheLayer } from './cacheLayer';

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
      console.log(`🔄 Initializing write worker with ${config.concurrency} concurrent jobs`);

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
        console.log('✅ Write worker is ready and waiting for jobs');
        this.isRunning = true;
      });

      this.worker.on('error', (err) => {
        console.error('🚨 Write worker error:', err);
      });

      this.worker.on('failed', (job, err) => {
        console.error(`❌ Job ${job?.id} failed:`, err);
      });

      this.worker.on('completed', (job) => {
        console.log(`✅ Job ${job.id} completed successfully`);
      });

      // Graceful shutdown handling
      process.on('SIGINT', async () => {
        console.log('\n🔄 Gracefully shutting down write worker...');
        await this.shutdown();
        process.exit(0);
      });

      process.on('SIGTERM', async () => {
        console.log('\n🔄 Gracefully shutting down write worker...');
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
    const { type, timestamp, requestId } = job.data;
    const processingStartTime = Date.now();
    
    console.log(`🚀 Processing job ${job.id}: ${type} (requested at ${new Date(timestamp).toISOString()})`);

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
          throw new Error(`Unknown job type: ${(job.data as any).type}`);
      }

      const processingTime = Date.now() - processingStartTime;
      console.log(`✅ Job ${job.id} processed in ${processingTime}ms: ${result}`);
      
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
    const { userId, enabled, requestId } = jobData;
    
    console.log(`🤖 Processing bot status change: ${userId} -> ${enabled ? 'ENABLED' : 'DISABLED'}`);

    try {
      // Execute database transaction
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
        } catch (error) {
          // bot_states table might not exist - log but don't fail
          console.warn(`⚠️ Could not update bot_states table:`, error);
        }

        return updateResult;
      });

      // Invalidate cache for this user
      await cacheLayer.invalidateUserCache(userId, 'settings');
      await cacheLayer.invalidateUserCache(userId, 'bot_status');

      console.log(`✅ Bot status updated in database for ${userId}: ${enabled}`);
      
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
    const { userId, settings, requestId } = jobData;
    
    console.log(`⚙️ Processing user settings update: ${userId}`, settings);

    try {
      // Execute database transaction
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

      console.log(`✅ User settings updated in database for ${userId}`);
      
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
    const { userId, tradeData, requestId } = jobData;
    
    console.log(`💰 Processing trade execution: ${userId}`, tradeData);

    try {
      // Execute database transaction for trade record
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

      console.log(`✅ Trade record created in database for ${userId}`);
      
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
      console.log('🔄 Shutting down write worker...');
      await this.worker.close();
      this.isRunning = false;
      console.log('✅ Write worker shut down complete');
    }
  }
}

// Create and start the worker when this file is run directly
if (require.main === module) {
  console.log('🚀 Starting XORJ Write Worker...');
  console.log(`📍 Process ID: ${process.pid}`);
  console.log(`🕐 Started at: ${new Date().toISOString()}`);
  
  const worker = new WriteWorker();
  
  // Keep the process alive
  setInterval(() => {
    const status = worker.getStatus();
    console.log(`💓 Worker heartbeat: ${status.isRunning ? 'RUNNING' : 'STOPPED'} - ${new Date().toISOString()}`);
  }, 30000); // Heartbeat every 30 seconds
}

export default WriteWorker;