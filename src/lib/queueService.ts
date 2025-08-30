/**
 * Write Queue Service - BullMQ Implementation
 * Phase 2: Architecting for Concurrency - Solving Write Operation Failures
 * 
 * This service decouples write operations from API responses, making writes:
 * - Instantaneous (202 Accepted)
 * - 100% reliable (queued for processing)
 * - Scalable (no blocking database operations)
 */

import { Queue, Job } from 'bullmq';
import { redisService } from './redis';

// Job type definitions for type safety
export interface BotStatusJob {
  type: 'SET_BOT_STATUS';
  userId: string;
  enabled: boolean;
  timestamp: number;
  requestId: string;
}

export interface UserSettingsJob {
  type: 'UPDATE_USER_SETTINGS';
  userId: string;
  settings: Record<string, unknown>;
  timestamp: number;
  requestId: string;
}

export interface TradeExecutionJob {
  type: 'EXECUTE_TRADE';
  userId: string;
  tradeData: Record<string, unknown>;
  timestamp: number;
  requestId: string;
}

// Union type for all job types
export type WriteJob = BotStatusJob | UserSettingsJob | TradeExecutionJob;

interface QueueConfig {
  defaultJobOptions: {
    removeOnComplete: number;
    removeOnFail: number;
    attempts: number;
    backoff: {
      type: 'exponential';
      delay: number;
    };
  };
  redis: {
    host: string;
    port: number;
    password?: string;
    db: number;
  };
}

class WriteQueueService {
  private queue: Queue<WriteJob> | null = null;
  private isInitialized = false;

  constructor() {
    this.initialize().catch(error => {
      console.error('🚨 Write queue initialization failed:', error);
    });
  }

  private async initialize(): Promise<void> {
    try {
      const config = this.getQueueConfig();
      console.log(`🔄 Initializing write queue with Redis at ${config.redis.host}:${config.redis.port}`);

      this.queue = new Queue<WriteJob>('write-operations', {
        connection: config.redis,
        defaultJobOptions: config.defaultJobOptions,
      });

      // Handle queue events
      this.queue.on('error', (error) => {
        console.error('🚨 Write queue error:', error);
      });

      this.queue.on('waiting', (job) => {
        console.log(`⏳ Job ${job.id} is waiting`);
      });

      this.queue.on('active', (job) => {
        console.log(`🚀 Job ${job.id} started processing`);
      });

      this.queue.on('completed', (job) => {
        console.log(`✅ Job ${job.id} completed successfully`);
      });

      this.queue.on('failed', (job, err) => {
        console.error(`❌ Job ${job?.id} failed:`, err);
      });

      this.isInitialized = true;
      console.log('✅ Write queue initialized successfully');

    } catch (error) {
      console.error('❌ Failed to initialize write queue:', error);
      this.isInitialized = false;
    }
  }

  private getQueueConfig(): QueueConfig {
    // Use same Redis configuration as cache service
    return {
      defaultJobOptions: {
        removeOnComplete: 100,  // Keep last 100 completed jobs
        removeOnFail: 50,       // Keep last 50 failed jobs
        attempts: 3,            // Retry failed jobs 3 times
        backoff: {
          type: 'exponential',
          delay: 2000,          // Start with 2s delay, then exponential backoff
        },
      },
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD || undefined,
        db: parseInt(process.env.REDIS_DB || '0'),
      },
    };
  }

  /**
   * Check if queue is ready to accept jobs
   */
  async isReady(): Promise<boolean> {
    if (!this.queue || !this.isInitialized) {
      return false;
    }

    try {
      await this.queue.client.ping();
      return true;
    } catch (error) {
      console.error('📊 Queue health check failed:', error);
      return false;
    }
  }

  /**
   * Add a bot status change job to the queue
   */
  async addBotStatusJob(
    userId: string,
    enabled: boolean,
    requestId: string
  ): Promise<{ success: boolean; jobId?: string; error?: string }> {
    if (!await this.isReady()) {
      return { success: false, error: 'Queue not ready' };
    }

    try {
      const job: BotStatusJob = {
        type: 'SET_BOT_STATUS',
        userId,
        enabled,
        timestamp: Date.now(),
        requestId,
      };

      const queueJob = await this.queue!.add('set-bot-status', job, {
        priority: 10, // High priority for bot status changes
        delay: 0,     // Process immediately
      });

      console.log(`📝 Bot status job queued: ${queueJob.id} for user ${userId}`);
      
      return { success: true, jobId: queueJob.id?.toString() };
    } catch (error) {
      console.error(`❌ Failed to queue bot status job for ${userId}:`, error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * Add a user settings update job to the queue
   */
  async addUserSettingsJob(
    userId: string,
    settings: Record<string, unknown>,
    requestId: string
  ): Promise<{ success: boolean; jobId?: string; error?: string }> {
    if (!await this.isReady()) {
      return { success: false, error: 'Queue not ready' };
    }

    try {
      const job: UserSettingsJob = {
        type: 'UPDATE_USER_SETTINGS',
        userId,
        settings,
        timestamp: Date.now(),
        requestId,
      };

      const queueJob = await this.queue!.add('update-user-settings', job, {
        priority: 5,  // Medium priority for settings updates
        delay: 0,
      });

      console.log(`📝 User settings job queued: ${queueJob.id} for user ${userId}`);
      
      return { success: true, jobId: queueJob.id?.toString() };
    } catch (error) {
      console.error(`❌ Failed to queue user settings job for ${userId}:`, error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * Add a trade execution job to the queue
   */
  async addTradeExecutionJob(
    userId: string,
    tradeData: Record<string, unknown>,
    requestId: string
  ): Promise<{ success: boolean; jobId?: string; error?: string }> {
    if (!await this.isReady()) {
      return { success: false, error: 'Queue not ready' };
    }

    try {
      const job: TradeExecutionJob = {
        type: 'EXECUTE_TRADE',
        userId,
        tradeData,
        timestamp: Date.now(),
        requestId,
      };

      const queueJob = await this.queue!.add('execute-trade', job, {
        priority: 20, // Highest priority for trades
        delay: 0,
      });

      console.log(`📝 Trade execution job queued: ${queueJob.id} for user ${userId}`);
      
      return { success: true, jobId: queueJob.id?.toString() };
    } catch (error) {
      console.error(`❌ Failed to queue trade execution job for ${userId}:`, error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * Get queue statistics for monitoring
   */
  async getQueueStats(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  } | null> {
    if (!this.queue) {
      return null;
    }

    try {
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        this.queue.getWaiting(),
        this.queue.getActive(),
        this.queue.getCompleted(),
        this.queue.getFailed(),
        this.queue.getDelayed(),
      ]);

      return {
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length,
        delayed: delayed.length,
      };
    } catch (error) {
      console.error('❌ Failed to get queue stats:', error);
      return null;
    }
  }

  /**
   * Get failed jobs for inspection
   */
  async getFailedJobs(limit: number = 10): Promise<Job<WriteJob>[]> {
    if (!this.queue) {
      return [];
    }

    try {
      return await this.queue.getFailed(0, limit - 1);
    } catch (error) {
      console.error('❌ Failed to get failed jobs:', error);
      return [];
    }
  }

  /**
   * Retry failed jobs
   */
  async retryFailedJobs(jobIds?: string[]): Promise<{ success: boolean; error?: string }> {
    if (!this.queue) {
      return { success: false, error: 'Queue not initialized' };
    }

    try {
      if (jobIds && jobIds.length > 0) {
        // Retry specific jobs
        for (const jobId of jobIds) {
          const job = await this.queue.getJob(jobId);
          if (job && job.isFailed()) {
            await job.retry();
            console.log(`🔄 Retrying failed job: ${jobId}`);
          }
        }
      } else {
        // Retry all failed jobs
        const failedJobs = await this.queue.getFailed();
        for (const job of failedJobs) {
          await job.retry();
          console.log(`🔄 Retrying failed job: ${job.id}`);
        }
      }

      return { success: true };
    } catch (error) {
      console.error('❌ Failed to retry jobs:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * Clean up old jobs (maintenance operation)
   */
  async cleanQueue(olderThan: number = 24 * 60 * 60 * 1000): Promise<void> {
    if (!this.queue) {
      return;
    }

    try {
      await this.queue.clean(olderThan, 100, 'completed');
      await this.queue.clean(olderThan, 50, 'failed');
      console.log(`🧹 Queue cleaned - removed jobs older than ${olderThan}ms`);
    } catch (error) {
      console.error('❌ Failed to clean queue:', error);
    }
  }

  /**
   * Gracefully close the queue connection
   */
  async close(): Promise<void> {
    if (this.queue) {
      await this.queue.close();
      this.isInitialized = false;
      console.log('🔒 Write queue connection closed');
    }
  }
}

// Export singleton instance
export const writeQueueService = new WriteQueueService();

// Export utilities for job management
export const queueUtils = {
  /**
   * Generate job identifiers
   */
  generateJobId: (type: string, userId: string): string => 
    `${type.toLowerCase()}_${userId}_${Date.now()}`,

  /**
   * Job priority levels
   */
  PRIORITY: {
    LOW: 1,
    MEDIUM: 5,
    HIGH: 10,
    URGENT: 20,
  } as const,

  /**
   * Job status check
   */
  isJobCompleted: async (job: Job): Promise<boolean> => {
    return job.isCompleted();
  },

  isJobFailed: async (job: Job): Promise<boolean> => {
    return job.isFailed();
  },
};

export default writeQueueService;