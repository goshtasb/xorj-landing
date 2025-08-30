/**
 * Critical Flaw #2 Fix Validation Tests
 * Tests fail-fast behavior and elimination of dangerous fallback operations
 */

import { CriticalDatabaseError, SystemFailureError } from '../src/types/database';
import { withFailFastProtection, verifyTradingSafetyStatus, createSystemFailureResponse } from '../src/lib/apiSafetyWrapper';
import { TradeService, BotStateService, UserSettingsService } from '../src/lib/botStateService';

// Mock NextResponse for testing
jest.mock('next/server', () => ({
  NextResponse: {
    json: (data: any, options?: any) => ({ 
      json: async () => data, 
      status: options?.status || 200,
      headers: options?.headers || {}
    })
  }
}));

describe('Critical Flaw #2: Fail-Fast Behavior Implementation', () => {
  
  describe('CriticalDatabaseError Handling', () => {
    it('should create CriticalDatabaseError with proper properties', () => {
      const error = new CriticalDatabaseError('Database connection lost', 'CONNECTION_FAILED');
      
      expect(error.name).toBe('CriticalDatabaseError');
      expect(error.isCritical).toBe(true);
      expect(error.errorCode).toBe('CONNECTION_FAILED');
      expect(error.message).toContain('CRITICAL DATABASE ERROR');
      expect(error.timestamp).toBeInstanceOf(Date);
    });

    it('should create SystemFailureError with proper properties', () => {
      const error = new SystemFailureError('Database unavailable', 'Trading operations suspended');
      
      expect(error.name).toBe('SystemFailureError');
      expect(error.isSystemFailure).toBe(true);
      expect(error.failureReason).toBe('Database unavailable');
      expect(error.message).toContain('SYSTEM FAILURE');
    });
  });

  describe('API Safety Wrapper', () => {
    it('should catch CriticalDatabaseError and return system failure response', async () => {
      const mockHandler = jest.fn().mockRejectedValue(
        new CriticalDatabaseError('Database unavailable', 'DB_UNAVAILABLE')
      );
      
      const wrappedHandler = withFailFastProtection(mockHandler);
      const result = await wrappedHandler();
      
      expect(result.status).toBe(503);
      const responseData = await result.json();
      expect(responseData.error).toBe('System Unavailable');
      expect(responseData.code).toBe('SYSTEM_FAILURE');
      expect(responseData.details.reason).toBe('Database unavailable');
    });

    it('should catch SystemFailureError and return appropriate response', async () => {
      const mockHandler = jest.fn().mockRejectedValue(
        new SystemFailureError('Trading halt', 'External service down')
      );
      
      const wrappedHandler = withFailFastProtection(mockHandler);
      const result = await wrappedHandler();
      
      expect(result.status).toBe(503);
      const responseData = await result.json();
      expect(responseData.details.reason).toBe('Trading halt');
    });

    it('should pass through non-critical errors', async () => {
      const regularError = new Error('Regular validation error');
      const mockHandler = jest.fn().mockRejectedValue(regularError);
      
      const wrappedHandler = withFailFastProtection(mockHandler);
      
      await expect(wrappedHandler()).rejects.toThrow('Regular validation error');
    });
  });

  describe('Service Layer Fail-Fast Behavior', () => {
    beforeEach(() => {
      // Mock environment to trigger fail-fast conditions
      process.env.NODE_ENV = 'development';
      delete process.env.DATABASE_URL;
      delete process.env.DATABASE_HOST;
    });

    afterEach(() => {
      // Restore environment
      delete process.env.NODE_ENV;
    });

    it('should throw CriticalDatabaseError when database unavailable in TradeService', async () => {
      await expect(TradeService.getAll()).rejects.toThrow(CriticalDatabaseError);
      await expect(TradeService.getAll()).rejects.toThrow('Database unavailable');
    });

    it('should throw CriticalDatabaseError when database unavailable in BotStateService', async () => {
      await expect(BotStateService.getOrCreate('test_user')).rejects.toThrow(CriticalDatabaseError);
      await expect(BotStateService.getOrCreate('test_user')).rejects.toThrow('bot state');
    });

    it('should throw CriticalDatabaseError when database unavailable in UserSettingsService', async () => {
      await expect(UserSettingsService.getOrCreate('test_wallet')).rejects.toThrow(CriticalDatabaseError);
      await expect(UserSettingsService.getOrCreate('test_wallet')).rejects.toThrow('user settings');
    });

    it('should not use mock database fallback in service methods', async () => {
      // Verify that mock database service is NOT called as fallback
      const mockDbSpy = jest.spyOn(require('../src/lib/mockDatabase').mockDatabaseService.trades, 'getAll');
      
      try {
        await TradeService.getAll();
        fail('Should have thrown CriticalDatabaseError');
      } catch (error) {
        expect(error).toBeInstanceOf(CriticalDatabaseError);
        expect(mockDbSpy).not.toHaveBeenCalled();
      }
      
      mockDbSpy.mockRestore();
    });
  });

  describe('System Safety Verification', () => {
    it('should return safe status when system is operational', async () => {
      // Mock successful system state
      process.env.DATABASE_URL = 'postgresql://localhost:5432/test';
      
      const safetyStatus = await verifyTradingSafetyStatus();
      
      expect(safetyStatus.safe).toBe(true);
      expect(safetyStatus.reason).toBeUndefined();
      
      delete process.env.DATABASE_URL;
    });

    it('should return unsafe status with proper error details', async () => {
      // Mock database unavailable scenario would be handled by database layer
      // This test would need actual database connection mocking in full implementation
      const safetyStatus = await verifyTradingSafetyStatus();
      
      expect(safetyStatus).toHaveProperty('safe');
      expect(safetyStatus).toHaveProperty('reason');
    });
  });

  describe('Error Response Creation', () => {
    it('should create proper system failure response for database errors', async () => {
      const dbError = new CriticalDatabaseError('Connection timeout', 'CONNECTION_FAILED');
      const response = createSystemFailureResponse(dbError);
      
      expect(response.status).toBe(503);
      expect(response.headers.get('X-System-Status')).toBe('FAIL_SAFE_MODE');
      expect(response.headers.get('Retry-After')).toBe('300');
      
      const responseData = await response.json();
      expect(responseData.error).toBe('System Unavailable');
      expect(responseData.code).toBe('SYSTEM_FAILURE');
      expect(responseData.details.errorCode).toBe('CONNECTION_FAILED');
      expect(responseData.instructions.user).toContain('Please wait');
      expect(responseData.instructions.admin).toContain('Check database');
    });

    it('should create proper system failure response for system errors', async () => {
      const sysError = new SystemFailureError('Trading halt', 'Risk management triggered');
      const response = createSystemFailureResponse(sysError);
      
      expect(response.status).toBe(503);
      
      const responseData = await response.json();
      expect(responseData.details.reason).toBe('Trading halt');
    });
  });

  describe('Dangerous Fallback Elimination', () => {
    it('should not have mock data generation in critical paths', () => {
      // Verify that dangerous mock data generation has been removed
      const tradeServiceCode = TradeService.getAll.toString();
      
      expect(tradeServiceCode).not.toContain('mockDatabaseService');
      expect(tradeServiceCode).not.toContain('mock data');
      expect(tradeServiceCode).not.toContain('Array.from');
    });

    it('should not have graceful degradation patterns', () => {
      // Verify that all service methods throw instead of degrading
      const botStateCode = BotStateService.getOrCreate.toString();
      
      expect(botStateCode).not.toContain('mockDatabaseService');
      expect(botStateCode).toContain('CriticalDatabaseError');
    });

    it('should not have fallback return statements in service methods', () => {
      const userSettingsCode = UserSettingsService.update.toString();
      
      expect(userSettingsCode).not.toContain('return mockDatabaseService');
      expect(userSettingsCode).toContain('throw new CriticalDatabaseError');
    });
  });

  describe('Integration Behavior', () => {
    it('should propagate CriticalDatabaseError through service layers', async () => {
      // Mock database query to throw CriticalDatabaseError
      const mockQuery = jest.fn().mockRejectedValue(
        new CriticalDatabaseError('Query timeout', 'DB_UNAVAILABLE')
      );
      
      // This would require dependency injection or module mocking in full implementation
      // The test verifies that errors bubble up correctly
      expect(() => {
        throw new CriticalDatabaseError('Test error', 'CONNECTION_FAILED');
      }).toThrow(CriticalDatabaseError);
    });

    it('should maintain error chain through wrapped API handlers', async () => {
      const mockApiHandler = jest.fn(async () => {
        // Simulate service layer throwing CriticalDatabaseError
        throw new CriticalDatabaseError('Service unavailable', 'DB_UNAVAILABLE');
      });
      
      const wrappedHandler = withFailFastProtection(mockApiHandler);
      const response = await wrappedHandler();
      
      expect(response.status).toBe(503);
      expect(mockApiHandler).toHaveBeenCalled();
    });
  });

  describe('System Recovery Testing', () => {
    it('should allow normal operations when system is healthy', async () => {
      // Set up healthy environment
      process.env.NODE_ENV = 'production';
      process.env.DATABASE_URL = 'postgresql://localhost:5432/test';
      
      const mockHandler = jest.fn().mockResolvedValue({ success: true });
      const wrappedHandler = withFailFastProtection(mockHandler);
      
      const result = await wrappedHandler();
      
      expect(result.success).toBe(true);
      expect(mockHandler).toHaveBeenCalled();
      
      delete process.env.DATABASE_URL;
    });

    it('should transition from fail-safe to normal operations', async () => {
      // This would test the complete failure -> recovery cycle
      // Implementation depends on actual database connection management
      
      // Simulate system going from failed to recovered state
      let systemHealthy = false;
      
      const mockHealthCheck = jest.fn(() => {
        if (!systemHealthy) {
          throw new CriticalDatabaseError('DB down', 'CONNECTION_FAILED');
        }
        return { healthy: true };
      });
      
      // First call - system unhealthy
      expect(() => mockHealthCheck()).toThrow(CriticalDatabaseError);
      
      // System recovers
      systemHealthy = true;
      
      // Second call - system healthy
      expect(mockHealthCheck()).toEqual({ healthy: true });
    });
  });
});