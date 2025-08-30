/**
 * Jest test setup for XORJ Backend End-to-End Testing
 */

import { expect } from '@jest/globals';

// Extend Jest matchers if needed
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeWithinRange(a: number, b: number): R;
    }
  }
}

// Custom matcher for numeric ranges
expect.extend({
  toBeWithinRange(received: number, floor: number, ceiling: number) {
    const pass = received >= floor && received <= ceiling;
    if (pass) {
      return {
        message: () =>
          `expected ${received} not to be within range ${floor} - ${ceiling}`,
        pass: true,
      };
    } else {
      return {
        message: () =>
          `expected ${received} to be within range ${floor} - ${ceiling}`,
        pass: false,
      };
    }
  },
});

// Console formatting for better test output
const originalLog = console.log;
console.log = (...args) => {
  const timestamp = new Date().toISOString().substr(11, 8);
  originalLog(`[${timestamp}]`, ...args);
};

// Global test configuration
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://postgres:@localhost:5432/xorj_test';