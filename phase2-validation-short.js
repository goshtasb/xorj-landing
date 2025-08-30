/**
 * Phase 2 Validation Test - Short Version
 * 3-minute test to validate the architectural fixes
 * Same 100 concurrent users and 80/20 mix, but shorter duration for complete results
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

export let errorRate = new Rate('errors');

export let options = {
  // Shorter test for complete validation
  stages: [
    { duration: '30s', target: 50 },   // Ramp to 50 users
    { duration: '1m', target: 100 },   // Scale to 100 users  
    { duration: '3m', target: 100 },   // SUSTAINED 100 users for 3 minutes
    { duration: '30s', target: 0 },    // Ramp down
  ],
  
  thresholds: {
    'http_req_duration': ['p(95)<200'],   // P95 < 200ms
    'errors': ['rate<0.001'],             // Error rate < 0.1%
    'http_req_failed': ['rate<0.001'],    
  },
};

const BASE_URL = 'http://localhost:3005';
const WALLET_ADDRESS = 'DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK';

let authToken = null;

function getAuthToken() {
  const authResponse = http.post(`${BASE_URL}/api/auth/authenticate`, JSON.stringify({
    wallet_address: WALLET_ADDRESS
  }), { headers: { 'Content-Type': 'application/json' } });
  
  if (authResponse.status === 200) {
    return JSON.parse(authResponse.body).session_token;
  }
  return null;
}

export default function() {
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
  
  // 80/20 read/write mix
  if (Math.random() < 0.8) {
    // READ OPERATIONS (80%)
    const readEndpoints = [
      '/api/user/transactions?walletAddress=' + WALLET_ADDRESS,
      '/api/user/performance?walletAddress=' + WALLET_ADDRESS + '&timeRange=30D',
      '/api/user/settings?walletAddress=' + WALLET_ADDRESS,
    ];
    
    const endpoint = readEndpoints[Math.floor(Math.random() * readEndpoints.length)];
    const response = http.get(`${BASE_URL}${endpoint}`, { headers });
    
    const success = check(response, {
      'Read success': (r) => r.status === 200,
    });
    
    if (!success) {
      errorRate.add(1);
    }
  } else {
    // WRITE OPERATIONS (20%)
    const writeEndpoints = ['/api/bot/enable', '/api/bot/disable'];
    const endpoint = writeEndpoints[Math.floor(Math.random() * writeEndpoints.length)];
    
    const response = http.post(`${BASE_URL}${endpoint}`, '{}', { headers });
    
    const success = check(response, {
      'Write success': (r) => r.status === 200 || r.status === 202,
    });
    
    if (!success) {
      errorRate.add(1);
    }
  }
  
  sleep(0.1 + Math.random() * 0.3);
}