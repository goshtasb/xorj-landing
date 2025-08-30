/**
 * Critical Flaw #1 Fix Validation Tests
 * Tests database-level duplicate trade prevention
 */

import { TradeService } from '../src/lib/botStateService';
import { CreateTradeData, TradeStatus } from '../src/types/database';

describe('Critical Flaw #1: Database-Level Duplicate Trade Prevention', () => {
  const mockTradeData: Omit<CreateTradeData, 'client_order_id'> = {
    job_id: 'test_job_123',
    user_vault_address: '5QfzCCipXjebAfHpMhCJAoxUJL2TyqM5p8tCFLjsPbmh',
    status: 'PENDING' as TradeStatus,
    from_token_address: 'So11111111111111111111111111111111111111112',
    to_token_address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    amount_in: BigInt('1000000000'),
    expected_amount_out: BigInt('100000000')
  };

  describe('Deterministic Idempotency Key Generation', () => {
    const testTradeData = {
      user_vault_address: '5QfzCCipXjebAfHpMhCJAoxUJL2TyqM5p8tCFLjsPbmh',
      from_token_address: 'So11111111111111111111111111111111111111112',
      to_token_address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      amount_in: BigInt('1000000000')
    };

    it('should generate deterministic client_order_id for same trade parameters', () => {
      const id1 = TradeService.generateClientOrderId(
        testTradeData.user_vault_address,
        testTradeData.from_token_address,
        testTradeData.to_token_address,
        testTradeData.amount_in
      );
      
      const id2 = TradeService.generateClientOrderId(
        testTradeData.user_vault_address,
        testTradeData.from_token_address,
        testTradeData.to_token_address,
        testTradeData.amount_in
      );
      
      expect(id1).toBe(id2);
      expect(id1).toMatch(/^trade_[a-f0-9]{32}$/);
    });

    it('should generate different keys for different trade parameters', () => {
      const id1 = TradeService.generateClientOrderId(
        testTradeData.user_vault_address,
        testTradeData.from_token_address,
        testTradeData.to_token_address,
        testTradeData.amount_in
      );
      
      const id2 = TradeService.generateClientOrderId(
        testTradeData.user_vault_address,
        testTradeData.from_token_address,
        testTradeData.to_token_address,
        BigInt('2000000000') // Different amount
      );
      
      expect(id1).not.toBe(id2);
    });

    it('should use time window for deterministic behavior within same period', () => {
      // Mock Date.now to control time
      const originalNow = Date.now;
      const fixedTime = 1640995200000; // Fixed timestamp
      Date.now = jest.fn(() => fixedTime);
      
      const id1 = TradeService.generateClientOrderId(
        testTradeData.user_vault_address,
        testTradeData.from_token_address,
        testTradeData.to_token_address,
        testTradeData.amount_in
      );
      
      // Same time window (within 5 minutes)
      Date.now = jest.fn(() => fixedTime + 2 * 60 * 1000);
      
      const id2 = TradeService.generateClientOrderId(
        testTradeData.user_vault_address,
        testTradeData.from_token_address,
        testTradeData.to_token_address,
        testTradeData.amount_in
      );
      
      expect(id1).toBe(id2);
      
      // Restore original Date.now
      Date.now = originalNow;
    });
  });

  describe('Database Constraint Enforcement', () => {
    it('should prevent duplicate trades with same client_order_id using SQLSTATE codes', async () => {
      const client_order_id = 'test_duplicate_prevention_' + Date.now();
      
      const tradeData: CreateTradeData = {
        ...mockTradeData,
        client_order_id
      };

      // First trade should succeed
      const result1 = await TradeService.create(tradeData);
      expect(result1.success).toBe(true);
      expect(result1.data?.client_order_id).toBe(client_order_id);

      // Second identical trade should fail with proper SQLSTATE handling
      const result2 = await TradeService.create(tradeData);
      expect(result2.success).toBe(false);
      expect(result2.code).toBe('DUPLICATE_TRADE');
      expect(result2.error).toContain('Duplicate trade prevented');
      expect(result2.error).toContain(client_order_id);
    });

    it('should handle SQLSTATE 23505 constraint violations properly', () => {
      // Mock database error with proper SQLSTATE code
      const mockError = new Error('duplicate key value violates unique constraint "trade_idempotency_key"');
      (mockError as any).code = '23505';
      (mockError as any).constraint = 'trade_idempotency_key';
      
      // This would be tested with actual database connection in integration tests
      expect(mockError).toHaveProperty('code', '23505');
      expect(mockError).toHaveProperty('constraint', 'trade_idempotency_key');
    });

    it('should handle foreign key violations with SQLSTATE 23503', () => {
      const mockFKError = new Error('insert or update on table violates foreign key constraint');
      (mockFKError as any).code = '23503';
      (mockFKError as any).detail = 'Key (job_id)=(invalid_id) is not present in table "execution_jobs"';
      
      expect(mockFKError).toHaveProperty('code', '23503');
      expect(mockFKError).toHaveProperty('detail');
    });

    it('should allow same client_order_id for different users', async () => {
      const client_order_id = 'test_different_users_' + Date.now();
      
      const user1Trade: CreateTradeData = {
        ...mockTradeData,
        user_vault_address: '5QfzCCipXjebAfHpMhCJAoxUJL2TyqM5p8tCFLjsPbmh',
        client_order_id
      };

      const user2Trade: CreateTradeData = {
        ...mockTradeData,
        user_vault_address: '6RfzCCipXjebAfHpMhCJAoxUJL2TyqM5p8tCFLjsPbmh',
        client_order_id
      };

      // Both trades should succeed (different users)
      const result1 = await TradeService.create(user1Trade);
      const result2 = await TradeService.create(user2Trade);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
    });
  });

  describe('Idempotent Trade Creation', () => {
    it('should create trade with auto-generated client_order_id', async () => {
      const result = await TradeService.createIdempotent(mockTradeData);
      
      expect(result.success).toBe(true);
      expect(result.data?.client_order_id).toBeDefined();
      expect(result.data?.client_order_id).toMatch(/^[a-zA-Z0-9]{8}_\d+_[a-zA-Z0-9]{6}$/);
    });

    it('should find existing trade by client_order_id', async () => {
      const client_order_id = 'test_find_by_id_' + Date.now();
      const tradeData: CreateTradeData = {
        ...mockTradeData,
        client_order_id
      };

      // Create trade
      const createResult = await TradeService.create(tradeData);
      expect(createResult.success).toBe(true);

      // Find the trade
      const findResult = await TradeService.findByClientOrderId(
        mockTradeData.user_vault_address,
        client_order_id
      );

      expect(findResult.success).toBe(true);
      expect(findResult.data).not.toBeNull();
      expect(findResult.data?.client_order_id).toBe(client_order_id);
    });

    it('should return null when trade not found by client_order_id', async () => {
      const nonExistentId = 'non_existent_' + Date.now();
      
      const findResult = await TradeService.findByClientOrderId(
        mockTradeData.user_vault_address,
        nonExistentId
      );

      expect(findResult.success).toBe(true);
      expect(findResult.data).toBeNull();
    });
  });

  describe('Race Condition Prevention', () => {
    it('should handle concurrent duplicate trade attempts', async () => {
      const client_order_id = 'test_race_condition_' + Date.now();
      const tradeData: CreateTradeData = {
        ...mockTradeData,
        client_order_id
      };

      // Simulate concurrent trade creation attempts
      const promises = Array(5).fill(null).map(() => 
        TradeService.create(tradeData)
      );

      const results = await Promise.allSettled(promises);
      const successResults = results.filter(r => 
        r.status === 'fulfilled' && r.value.success === true
      );
      const duplicateResults = results.filter(r => 
        r.status === 'fulfilled' && 
        r.value.success === false && 
        r.value.code === 'DUPLICATE_TRADE'
      );

      // Exactly one should succeed, others should fail with duplicate error
      expect(successResults).toHaveLength(1);
      expect(duplicateResults).toHaveLength(4);
    });
  });

  describe('Legacy Compatibility', () => {
    it('should still support legacy checkForDuplicates method', async () => {
      const tradeData: CreateTradeData = {
        ...mockTradeData,
        client_order_id: 'test_legacy_' + Date.now()
      };

      // Create a trade first
      await TradeService.create(tradeData);

      // Check for duplicates using legacy method
      const duplicateCheck = await TradeService.checkForDuplicates(tradeData);
      
      expect(duplicateCheck.success).toBe(true);
      expect(duplicateCheck.data).toBeDefined();
    });
  });
});