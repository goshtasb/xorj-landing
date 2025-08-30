/**
 * XORJ V1 Stage 3 Performance Load Test
 * 
 * Test Requirements:
 * - 100 concurrent users
 * - 10-minute duration
 * - 80% read operations (GET /api/user/performance)
 * - 20% write operations (POST /api/bot/enable, POST /api/bot/disable)
 * 
 * Acceptance Criteria:
 * - P95 Response Time: < 200ms
 * - Error Rate: < 0.1%
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const responseTimeP95 = new Trend('response_time_p95');

// Test configuration
export const options = {
  stages: [
    // Ramp up to 100 users over 2 minutes
    { duration: '2m', target: 100 },
    // Stay at 100 users for 10 minutes (main test)
    { duration: '10m', target: 100 },
    // Ramp down over 1 minute
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    // CRITICAL: P95 response time must be < 200ms
    'http_req_duration': ['p(95)<200', 'p(99)<500'],
    // CRITICAL: Error rate must be < 0.1%
    'errors': ['rate<0.001'],
    // Additional performance thresholds
    'http_req_failed': ['rate<0.01'],
  },
};

// Base URL for API calls
const BASE_URL = 'http://localhost:3000';

// Test user wallet address for consistent testing
const TEST_WALLET = 'HNhLAVhHcBRfMndANBAzZJggd9u1ZnRVQ3QaFHWKnKNH';

// Authentication token (will be obtained in setup)
let authToken = null;

export function setup() {
  console.log('🚀 Starting XORJ V1 Performance Load Test');
  console.log('📊 Test Configuration:');
  console.log('   - 100 concurrent users');
  console.log('   - 10-minute test duration');
  console.log('   - 80% read operations');
  console.log('   - 20% write operations');
  console.log('   - P95 < 200ms target');
  console.log('   - Error rate < 0.1% target');
  
  // Authenticate to get session token
  const authResponse = http.post(`${BASE_URL}/api/auth/authenticate`, 
    JSON.stringify({
      wallet_address: TEST_WALLET
    }), 
    {
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );
  
  if (authResponse.status === 200) {
    const authData = authResponse.json();
    authToken = authData.session_token;
    console.log('✅ Authentication successful for load testing');
  } else {
    console.error('❌ Authentication failed for load testing');
    console.error('Response:', authResponse.body);
    throw new Error('Setup failed: Could not authenticate');
  }
  
  return { authToken };
}

export default function(data) {
  // Use the auth token from setup
  const token = data.authToken;
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  // Generate random decision: 80% read, 20% write
  const isReadOperation = Math.random() < 0.8;
  
  if (isReadOperation) {
    // READ OPERATION: GET /api/user/performance (80%)
    performReadOperation(headers);
  } else {
    // WRITE OPERATION: Bot enable/disable (20%)
    performWriteOperation(headers);
  }
  
  // Think time between requests (0.5-1.5 seconds)
  sleep(Math.random() * 1 + 0.5);
}

function performReadOperation(headers) {
  // GET /api/user/performance - Main read operation
  const startTime = Date.now();
  
  const response = http.get(
    `${BASE_URL}/api/user/performance?walletAddress=${TEST_WALLET}&timeRange=30D`,
    { headers }
  );
  
  const duration = Date.now() - startTime;
  responseTimeP95.add(duration);
  
  // Check response
  const success = check(response, {
    'Read operation status is 200': (r) => r.status === 200,
    'Read operation response time < 200ms': (r) => r.timings.duration < 200,
    'Read operation has valid JSON': (r) => {
      try {
        JSON.parse(r.body);
        return true;
      } catch (e) {
        return false;
      }
    },
  });
  
  if (!success) {
    errorRate.add(1);
    console.log(`❌ Read operation failed: ${response.status} - ${response.body.substring(0, 100)}`);
  } else {
    errorRate.add(0);
  }
}

function performWriteOperation(headers) {
  // WRITE OPERATIONS: Bot enable/disable (20%)
  // Randomly choose between enable and disable
  const isEnable = Math.random() < 0.5;
  const endpoint = isEnable ? '/api/bot/enable' : '/api/bot/disable';
  
  const startTime = Date.now();
  
  const response = http.post(
    `${BASE_URL}${endpoint}`,
    JSON.stringify({}), // Empty body as per API design
    { headers }
  );
  
  const duration = Date.now() - startTime;
  responseTimeP95.add(duration);
  
  // Check response
  const success = check(response, {
    'Write operation status is 200': (r) => r.status === 200,
    'Write operation response time < 200ms': (r) => r.timings.duration < 200,
    'Write operation has valid JSON': (r) => {
      try {
        const data = JSON.parse(r.body);
        return data.success === true;
      } catch (e) {
        return false;
      }
    },
  });
  
  if (!success) {
    errorRate.add(1);
    console.log(`❌ Write operation failed (${endpoint}): ${response.status} - ${response.body.substring(0, 100)}`);
  } else {
    errorRate.add(0);
  }
}

export function teardown(data) {
  console.log('🏁 XORJ V1 Load Test Complete');
  console.log('📊 Final Results Summary:');
  console.log('   - Test duration: 13 minutes (2m ramp + 10m test + 1m ramp down)');
  console.log('   - Peak concurrent users: 100');
  console.log('   - Check k6 output above for detailed metrics');
  console.log('');
  console.log('🎯 Gate 3.2 Acceptance Criteria:');
  console.log('   - P95 Response Time < 200ms: Check "http_req_duration{p(95)}" metric');
  console.log('   - Error Rate < 0.1%: Check "errors" rate metric');
  console.log('');
  console.log('✅ If both criteria are met, Gate 3.2 is PASSED');
  console.log('❌ If either criteria fails, Gate 3.2 is FAILED');
}