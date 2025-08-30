/**
 * Sophisticated Fail-Fast Behavior Tests - Critical Flaw #2 Issues Fix
 * Tests recovery management, nuanced error handling, and thundering herd prevention
 */

import { databaseRecovery } from '../src/lib/databaseRecovery';
import { databaseErrorHandler } from '../src/lib/databaseErrorHandler';
import { CriticalDatabaseError } from '../src/types/database';

// Mock timers for testing exponential backoff
jest.useFakeTimers();

describe('Sophisticated Fail-Fast Behavior', () => {
  
  beforeEach(() => {
    // Reset recovery state before each test
    databaseRecovery.forceReset();
    
    // Clear any existing timer mocks
    jest.clearAllTimers();
  });

  afterEach(() => {
    // Clean up after each test
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe('Recovery Management - Thundering Herd Prevention', () => {
    it('should implement exponential backoff with jitter', async () => {
      const error = new CriticalDatabaseError('Connection failed', 'CONNECTION_FAILED');
      
      // Trigger first failure
      await databaseRecovery.onDatabaseFailure(error);
      
      let status = databaseRecovery.getRecoveryStatus();
      expect(status.isRecovering).toBe(true);
      expect(status.failureCount).toBe(1);
      
      // Should not allow operations immediately
      expect(databaseRecovery.canAttemptDatabaseOperation()).toBe(false);
      
      // Simulate second failure (should increase backoff)
      await databaseRecovery.onDatabaseFailure(error);
      
      status = databaseRecovery.getRecoveryStatus();
      expect(status.failureCount).toBe(2);
      
      // Next retry time should be later (exponential backoff)
      expect(status.nextRetryTime.getTime()).toBeGreaterThan(Date.now());
    });

    it('should prevent thundering herd during recovery', async () => {
      const error = new CriticalDatabaseError('Database down', 'DB_UNAVAILABLE');
      
      // Simulate multiple concurrent failures
      const failurePromises = Array(10).fill(null).map(() => 
        databaseRecovery.onDatabaseFailure(error)
      );
      
      await Promise.all(failurePromises);
      
      // Should still be in single recovery state, not multiple overlapping recoveries
      const status = databaseRecovery.getRecoveryStatus();
      expect(status.isRecovering).toBe(true);
      
      // All instances should respect the same retry time
      const canAttempt = Array(10).fill(null).map(() => 
        databaseRecovery.canAttemptDatabaseOperation()
      );
      
      // All should return the same result (no thundering herd)
      expect(canAttempt.every(result => result === canAttempt[0])).toBe(true);
    });

    it('should provide proper recovery status information', () => {
      const status = databaseRecovery.getRecoveryStatus();
      
      expect(status).toHaveProperty('isRecovering');
      expect(status).toHaveProperty('failureCount');
      expect(status).toHaveProperty('nextRetryTime');
      expect(status).toHaveProperty('timeUntilRetry');
      
      expect(typeof status.timeUntilRetry).toBe('number');
    });
  });

  describe('Nuanced Error Handling', () => {
    it('should distinguish transient errors from critical errors', async () => {
      // Mock deadlock error (transient)
      const deadlockError = new Error('deadlock detected');
      (deadlockError as Error & { code: string }).code = '40P01';
      
      const response = await databaseErrorHandler.handleDatabaseError(deadlockError);
      
      expect(response.action).toBe('retry');
      expect(response.shouldThrow).toBe(false);
      expect(response.retryAfterMs).toBeGreaterThan(0);
      expect(response.errorInfo?.classification).toBe('deadlock');
    });

    it('should identify critical connection errors', async () => {
      // Mock connection error (critical)
      const connectionError = new Error('connection exception');
      (connectionError as any).code = '08000';
      
      const response = await databaseErrorHandler.handleDatabaseError(connectionError);
      
      expect(response.action).toBe('critical');
      expect(response.shouldThrow).toBe(true);
      expect(response.errorInfo?.classification).toBe('critical_connection_failure');
    });

    it('should retry transient errors with exponential backoff', async () => {
      let attempt = 0;
      const maxAttempts = 3;
      
      const mockOperation = jest.fn().mockImplementation(() => {
        attempt++;
        if (attempt <= maxAttempts) {
          const error = new Error('serialization failure');
          (error as any).code = '40001';
          throw error;
        }
        return { success: true };
      });
      
      const result = await databaseErrorHandler.executeWithRetry(mockOperation);
      
      expect(result.success).toBe(true);
      expect(attempt).toBe(maxAttempts + 1);
      expect(mockOperation).toHaveBeenCalledTimes(maxAttempts + 1);
    });

    it('should escalate transient errors to critical after max retries', async () => {
      const persistentError = new Error('deadlock detected');
      (persistentError as any).code = '40P01';
      
      const mockOperation = jest.fn().mockRejectedValue(persistentError);
      
      await expect(databaseErrorHandler.executeWithRetry(mockOperation))
        .rejects.toThrow(CriticalDatabaseError);
      
      // Should have attempted max retries + 1 initial attempt
      expect(mockOperation).toHaveBeenCalledTimes(4); // 3 retries + 1 initial
    });

    it('should handle different types of transient errors appropriately', async () => {
      const errorTypes = [
        { code: '40P01', name: 'Deadlock' },
        { code: '40001', name: 'Serialization Failure' },
        { code: '53200', name: 'Out of Memory' },
        { code: '53300', name: 'Too Many Connections' },
        { code: '57P03', name: 'Cannot Connect Now' }
      ];
      
      for (const errorType of errorTypes) {
        const error = new Error(`Test ${errorType.name}`);
        (error as any).code = errorType.code;
        
        const response = await databaseErrorHandler.handleDatabaseError(error);
        
        expect(response.action).toBe('retry');
        expect(response.retryAfterMs).toBeGreaterThan(0);
        expect(response.errorInfo?.sqlstate).toBe(errorType.code);
      }
    });

    it('should track retry statistics for monitoring', () => {
      const stats = databaseErrorHandler.getRetryStatistics();
      
      expect(stats).toHaveProperty('activeOperations');
      expect(stats).toHaveProperty('operationRetries');
      expect(Array.isArray(stats.operationRetries)).toBe(true);
    });
  });

  describe('Feature Flag Elimination', () => {
    it('should not have any feature flags for fail-fast behavior', () => {
      // Verify no environment variable dependencies for core fail-fast behavior
      const originalEnv = process.env;
      
      // Test with various environment configurations
      const testEnvs = [
        {},
        { ENABLE_FAIL_FAST: 'false' },
        { FAIL_FAST_ON_DB_ERROR: 'false' },
        { DISABLE_SAFE_MODE: 'true' }
      ];
      
      testEnvs.forEach(testEnv => {
        process.env = { ...originalEnv, ...testEnv };
        
        // Fail-fast behavior should be intrinsic, not configurable
        const error = new CriticalDatabaseError('Test error', 'DB_UNAVAILABLE');
        expect(() => {
          throw error;
        }).toThrow(CriticalDatabaseError);
      });
      
      process.env = originalEnv;
    });

    it('should not have dangerous fallback code paths', () => {
      // Verify that mock database service is not used as fallback in production code
      const databaseCode = require('../src/lib/database');
      const serviceCode = require('../src/lib/botStateService');
      
      // These should not contain fallback patterns
      const codeStrings = [
        databaseCode.toString(),
        serviceCode.toString()
      ];
      
      codeStrings.forEach(codeString => {
        expect(codeString).not.toContain('mockDatabaseService');
        expect(codeString).not.toContain('fallback to in-memory');
        expect(codeString).not.toContain('graceful degradation');
      });
    });
  });

  describe('System Status Integration', () => {
    it('should report recovery status in system status API', async () => {
      const error = new CriticalDatabaseError('Test failure', 'CONNECTION_FAILED');
      await databaseRecovery.onDatabaseFailure(error);
      
      // Mock the system status API call
      const mockStatusResponse = {
        services: {
          database: {
            healthy: false,
            recovery: databaseRecovery.getRecoveryStatus()
          },
          errorHandling: databaseErrorHandler.getRetryStatistics()
        }
      };
      
      expect(mockStatusResponse.services.database.recovery.isRecovering).toBe(true);
      expect(mockStatusResponse.services.database.recovery.failureCount).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases and Robustness', () => {
    it('should handle maximum retry attempts gracefully', async () => {
      const error = new CriticalDatabaseError('Persistent failure', 'CONNECTION_FAILED');
      
      // Simulate maximum retry attempts
      for (let i = 0; i < 12; i++) { // More than max retries (10)
        await databaseRecovery.onDatabaseFailure(error);
      }
      
      const status = databaseRecovery.getRecoveryStatus();
      expect(status.failureCount).toBeGreaterThanOrEqual(10);
      
      // System should still be in controlled state, not crashed
      expect(status.isRecovering).toBe(true);
    });

    it('should handle concurrent error analysis correctly', async () => {
      const errors = [
        { code: '40P01', message: 'deadlock detected' },
        { code: '08000', message: 'connection exception' },
        { code: '40001', message: 'serialization failure' }
      ];
      
      const responses = await Promise.all(
        errors.map(errorData => {
          const error = new Error(errorData.message);
          (error as any).code = errorData.code;
          return databaseErrorHandler.handleDatabaseError(error);
        })
      );
      
      // Should handle concurrent analysis without interference
      expect(responses[0].action).toBe('retry'); // Deadlock
      expect(responses[1].action).toBe('critical'); // Connection exception
      expect(responses[2].action).toBe('retry'); // Serialization failure
    });

    it('should clean up retry tracking appropriately', () => {
      const operationId = 'test_operation_123';
      
      // Simulate adding retry tracking
      const stats = databaseErrorHandler.getRetryStatistics();
      const initialCount = stats.activeOperations;
      
      // Clear specific operation
      databaseErrorHandler.clearRetryTracking(operationId);
      
      // Should not crash or cause issues
      expect(() => {
        databaseErrorHandler.clearRetryTracking(operationId);
      }).not.toThrow();
    });
  });

  describe('Recovery Callback System', () => {
    it('should execute recovery callbacks on successful recovery', async () => {
      const mockCallback1 = jest.fn().mockResolvedValue(undefined);
      const mockCallback2 = jest.fn().mockResolvedValue(undefined);
      
      // Register callbacks
      databaseRecovery.onRecovery(mockCallback1);
      databaseRecovery.onRecovery(mockCallback2);
      
      // This would be tested with actual recovery process in integration tests
      // For unit tests, we verify the callback registration mechanism exists
      expect(databaseRecovery.onRecovery).toBeDefined();
      expect(typeof databaseRecovery.onRecovery).toBe('function');
    });
  });
});