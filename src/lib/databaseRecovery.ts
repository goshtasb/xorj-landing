/**
 * Database Recovery Management - Critical Flaw #2 Fix
 * Prevents "thundering herd" catastrophe during database recovery
 * Implements exponential backoff with jitter for graceful reconnection
 */

import { CriticalDatabaseError } from '../types/database';

interface RecoveryState {
  isRecovering: boolean;
  failureCount: number;
  lastFailureTime: Date;
  nextRetryTime: Date;
  maxRetries: number;
  backoffBase: number; // Base multiplier in seconds
  maxBackoff: number; // Maximum backoff in seconds
  jitterMax: number; // Maximum jitter in milliseconds
}

class DatabaseRecoveryManager {
  private static instance: DatabaseRecoveryManager;
  private recoveryState: RecoveryState;
  private recoveryCallbacks: Array<() => Promise<void>> = [];
  private healthCheckInterval: NodeJS.Timeout | null = null;

  private constructor() {
    this.recoveryState = {
      isRecovering: false,
      failureCount: 0,
      lastFailureTime: new Date(0),
      nextRetryTime: new Date(0),
      maxRetries: 10,
      backoffBase: 2, // Exponential base
      maxBackoff: 300, // 5 minutes maximum
      jitterMax: 5000 // 5 seconds maximum jitter
    };
  }

  public static getInstance(): DatabaseRecoveryManager {
    if (!DatabaseRecoveryManager.instance) {
      DatabaseRecoveryManager.instance = new DatabaseRecoveryManager();
    }
    return DatabaseRecoveryManager.instance;
  }

  /**
   * Called when a database failure is detected
   * Triggers recovery process with exponential backoff
   */
  public async onDatabaseFailure(error: CriticalDatabaseError): Promise<void> {
    console.error('🚨 Database failure detected, entering recovery mode:', error.message);
    
    this.recoveryState.isRecovering = true;
    this.recoveryState.failureCount++;
    this.recoveryState.lastFailureTime = new Date();
    
    // Calculate next retry time with exponential backoff + jitter
    const backoffSeconds = Math.min(
      this.recoveryState.backoffBase ** this.recoveryState.failureCount,
      this.recoveryState.maxBackoff
    );
    
    // Add jitter to prevent thundering herd
    const jitterMs = Math.random() * this.recoveryState.jitterMax;
    const totalDelayMs = (backoffSeconds * 1000) + jitterMs;
    
    this.recoveryState.nextRetryTime = new Date(Date.now() + totalDelayMs);
    
    console.log(`⏳ Database recovery scheduled for ${this.recoveryState.nextRetryTime.toISOString()}`);
    console.log(`📊 Failure count: ${this.recoveryState.failureCount}, Backoff: ${backoffSeconds}s, Jitter: ${Math.round(jitterMs)}ms`);
    
    // Start recovery process
    this.startRecoveryProcess();
  }

  /**
   * Check if system should allow database operations
   */
  public canAttemptDatabaseOperation(): boolean {
    if (!this.recoveryState.isRecovering) {
      return true;
    }
    
    // Don't allow operations until retry time
    if (new Date() < this.recoveryState.nextRetryTime) {
      return false;
    }
    
    return true;
  }

  /**
   * Get current recovery status for monitoring
   */
  public getRecoveryStatus(): {
    isRecovering: boolean;
    failureCount: number;
    nextRetryTime: Date;
    timeUntilRetry: number;
  } {
    const timeUntilRetry = this.recoveryState.isRecovering 
      ? Math.max(0, this.recoveryState.nextRetryTime.getTime() - Date.now())
      : 0;

    return {
      isRecovering: this.recoveryState.isRecovering,
      failureCount: this.recoveryState.failureCount,
      nextRetryTime: this.recoveryState.nextRetryTime,
      timeUntilRetry
    };
  }

  /**
   * Start the recovery process with health checking
   */
  private startRecoveryProcess(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    // Check every 10 seconds if we can attempt recovery
    this.healthCheckInterval = setInterval(async () => {
      if (new Date() >= this.recoveryState.nextRetryTime) {
        await this.attemptRecovery();
      }
    }, 10000);
  }

  /**
   * Attempt database recovery with health check
   */
  private async attemptRecovery(): Promise<void> {
    if (this.recoveryState.failureCount >= this.recoveryState.maxRetries) {
      console.error('🚨 CRITICAL: Maximum recovery attempts reached. Manual intervention required.');
      await this.triggerMaxRetryAlert();
      return;
    }

    console.log(`🔄 Attempting database recovery (attempt ${this.recoveryState.failureCount}/${this.recoveryState.maxRetries})`);

    try {
      // Attempt simple health check
      const { healthCheck } = await import('./database');
      const health = await healthCheck();
      
      if (health.healthy) {
        console.log('✅ Database recovery successful!');
        await this.onRecoverySuccess();
      } else {
        console.log(`❌ Database still unhealthy: ${health.error}`);
        await this.scheduleNextRetry();
      }
    } catch {
      console.log(`❌ Recovery attempt failed: Unknown error`);
      await this.scheduleNextRetry();
    }
  }

  /**
   * Handle successful recovery
   */
  private async onRecoverySuccess(): Promise<void> {
    // Reset recovery state
    this.recoveryState.isRecovering = false;
    this.recoveryState.failureCount = 0;
    this.recoveryState.lastFailureTime = new Date(0);
    this.recoveryState.nextRetryTime = new Date(0);

    // Clear health check interval
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    // Execute recovery callbacks
    for (const callback of this.recoveryCallbacks) {
      try {
        await callback();
      } catch {
        console.error('❌ Recovery callback failed:');
      }
    }

    console.log('🎉 Database recovery completed successfully. System resuming normal operations.');
  }

  /**
   * Schedule the next recovery attempt
   */
  private async scheduleNextRetry(): Promise<void> {
    this.recoveryState.failureCount++;
    
    const backoffSeconds = Math.min(
      this.recoveryState.backoffBase ** this.recoveryState.failureCount,
      this.recoveryState.maxBackoff
    );
    
    const jitterMs = Math.random() * this.recoveryState.jitterMax;
    const totalDelayMs = (backoffSeconds * 1000) + jitterMs;
    
    this.recoveryState.nextRetryTime = new Date(Date.now() + totalDelayMs);
    
    console.log(`Next recovery attempt scheduled for ${this.recoveryState.nextRetryTime.toISOString()}`);
    console.log(`Failure count: ${this.recoveryState.failureCount}, Backoff: ${backoffSeconds}s`);
  }

  /**
   * Register callback to execute on successful recovery
   */
  public onRecovery(callback: () => Promise<void>): void {
    this.recoveryCallbacks.push(callback);
  }

  /**
   * Trigger alert when maximum retries reached
   */
  private async triggerMaxRetryAlert(): Promise<void> {
    console.error('🚨 MAXIMUM RECOVERY ATTEMPTS REACHED');
    console.error('📞 MANUAL INTERVENTION REQUIRED');
    console.error('📋 Actions required:');
    console.error('   1. Check database server status');
    console.error('   2. Verify network connectivity');
    console.error('   3. Check database logs');
    console.error('   4. Restart application after database is confirmed healthy');

    // Clear interval to stop retry attempts
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    // In production, this would trigger critical alerts
    // await sendPagerDutyAlert('CRITICAL', 'Database recovery failed - manual intervention required');
    // await sendSlackAlert('#critical-alerts', 'Database recovery exhausted all retry attempts');
  }

  /**
   * Force reset recovery state (for administrative use only)
   */
  public forceReset(): void {
    console.log('⚠️ ADMINISTRATIVE ACTION: Force resetting recovery state');
    
    this.recoveryState.isRecovering = false;
    this.recoveryState.failureCount = 0;
    this.recoveryState.lastFailureTime = new Date(0);
    this.recoveryState.nextRetryTime = new Date(0);

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }
}

// Export singleton instance
export const databaseRecovery = DatabaseRecoveryManager.getInstance();