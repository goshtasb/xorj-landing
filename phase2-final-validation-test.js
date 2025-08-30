/**
 * Phase 2 Final Validation Load Test
 * Re-execute the exact Stage 3 test that previously failed with 100% write failures
 * 
 * CRITICAL PARAMETERS:
 * - 100 concurrent users
 * - 10 minutes duration  
 * - 80/20 read/write operation mix
 * 
 * ACCEPTANCE CRITERIA:
 * - P95 Response Time: < 200ms
 * - Error Rate: < 0.1%
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

// Custom metrics for detailed monitoring
export let errorRate = new Rate('errors');
export let readOperations = new Rate('read_operations');
export let writeOperations = new Rate('write_operations');

export let options = {
  // EXACT STAGE 3 PARAMETERS: 100 concurrent users for 10 minutes
  stages: [
    { duration: '1m', target: 20 },    // Ramp up to 20 users over 1 minute
    { duration: '2m', target: 50 },    // Scale to 50 users over next 2 minutes
    { duration: '1m', target: 100 },   // Scale to 100 users over next minute
    { duration: '10m', target: 100 },  // SUSTAINED 100 users for 10 minutes
    { duration: '1m', target: 0 },     // Ramp down
  ],
  
  // NON-NEGOTIABLE THRESHOLDS
  thresholds: {
    'http_req_duration': ['p(95)<200'],   // P95 < 200ms
    'errors': ['rate<0.001'],             // Error rate < 0.1%
    'http_req_failed': ['rate<0.001'],    // Request failure rate < 0.1%
  },
  
  // Additional monitoring
  summaryTrendStats: ['min', 'med', 'avg', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

const BASE_URL = 'http://localhost:3005'; // Using actual server port
const WALLET_ADDRESS = 'DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK';

// Get JWT token for authenticated requests
function getAuthToken() {
  const authResponse = http.post(`${BASE_URL}/api/auth/authenticate`, JSON.stringify({
    wallet_address: WALLET_ADDRESS
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
  
  if (authResponse.status === 200) {
    const authData = JSON.parse(authResponse.body);
    return authData.session_token;
  }
  
  console.error('Failed to get auth token:', authResponse.status);
  return null;
}

// Global token - get once per VU
let authToken = null;

export function setup() {
  console.log('🚀 Starting Phase 2 Final Validation Load Test');
  console.log('📊 Target: 100 concurrent users for 10 minutes');
  console.log('📈 Mix: 80% reads, 20% writes');
  console.log('🎯 P95 < 200ms, Error rate < 0.1%');
  
  // Warm up - ensure server is ready
  const warmup = http.get(`${BASE_URL}/api/queue/status`);
  console.log(`🔥 Warmup response: ${warmup.status}`);
}

export default function() {
  // Get auth token if not already obtained
  if (!authToken) {
    authToken = getAuthToken();
    if (!authToken) {
      errorRate.add(1);
      return;
    }
  }
  
  const headers = {
    'Authorization': `Bearer ${authToken}`,
    'Content-Type': 'application/json',
  };
  
  // 80/20 read/write mix as specified in Stage 3
  const isReadOperation = Math.random() < 0.8;
  
  if (isReadOperation) {
    // READ OPERATIONS (80%) - Test Phase 1 caching
    performReadOperations(headers);
  } else {
    // WRITE OPERATIONS (20%) - Test Phase 2 queue system  
    performWriteOperations(headers);
  }
  
  // Realistic user think time
  sleep(0.1 + Math.random() * 0.5); // 100-600ms think time
}

function performReadOperations(headers) {
  const readEndpoints = [
    '/api/user/transactions?walletAddress=' + WALLET_ADDRESS,
    '/api/user/performance?walletAddress=' + WALLET_ADDRESS + '&timeRange=30D',
    '/api/user/settings?walletAddress=' + WALLET_ADDRESS,
  ];
  
  // Pick random read endpoint
  const endpoint = readEndpoints[Math.floor(Math.random() * readEndpoints.length)];
  const startTime = Date.now();
  
  const response = http.get(`${BASE_URL}${endpoint}`, { headers });
  const duration = Date.now() - startTime;
  
  const success = check(response, {
    'Read operation status is 200': (r) => r.status === 200,
    'Read operation has data': (r) => r.body && r.body.length > 0,
    'Read response time < 200ms': () => duration < 200,
  });
  
  readOperations.add(1);
  
  if (!success || response.status !== 200) {
    errorRate.add(1);
    console.error(`❌ Read failed: ${endpoint} - Status: ${response.status} - Duration: ${duration}ms`);
  } else {
    // Check for cache hit/miss
    const cacheStatus = response.headers['X-Cache-Status'];
    if (cacheStatus) {
      console.log(`✅ Read success: ${endpoint} - Cache: ${cacheStatus} - Duration: ${duration}ms`);
    }
  }
}

function performWriteOperations(headers) {
  const writeEndpoints = [
    { endpoint: '/api/bot/enable', method: 'POST' },
    { endpoint: '/api/bot/disable', method: 'POST' },
  ];
  
  // Pick random write endpoint
  const operation = writeEndpoints[Math.floor(Math.random() * writeEndpoints.length)];
  const startTime = Date.now();
  
  const response = http.post(`${BASE_URL}${operation.endpoint}`, '{}', { headers });
  const duration = Date.now() - startTime;
  
  // Phase 2 write operations should return 202 Accepted (queued) or 200 (immediate fallback)
  const success = check(response, {
    'Write operation accepted': (r) => r.status === 202 || r.status === 200,
    'Write operation has response': (r) => r.body && r.body.length > 0,
    'Write response time < 200ms': () => duration < 200,
  });
  
  writeOperations.add(1);
  
  if (!success || (response.status !== 200 && response.status !== 202)) {
    errorRate.add(1);
    console.error(`❌ Write failed: ${operation.endpoint} - Status: ${response.status} - Duration: ${duration}ms`);
  } else {
    // Check processing status
    const processingStatus = response.headers['X-Processing-Status'];
    const responseData = JSON.parse(response.body);
    const source = responseData._source;
    
    console.log(`✅ Write success: ${operation.endpoint} - Status: ${response.status} - Processing: ${processingStatus} - Source: ${source} - Duration: ${duration}ms`);
  }
}

export function teardown(data) {
  console.log('🏁 Phase 2 Final Validation Load Test Complete');
  console.log('📊 Check results against acceptance criteria:');
  console.log('🎯 P95 Response Time must be < 200ms');
  console.log('🎯 Error Rate must be < 0.1%');
}