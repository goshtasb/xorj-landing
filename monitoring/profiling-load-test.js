import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

// Custom metrics
export let errorRate = new Rate('errors');

export let options = {
  // 60-second focused profiling test
  stages: [
    { duration: '10s', target: 10 },   // Quick ramp to 10 users
    { duration: '40s', target: 25 },   // Hold at 25 users for profiling data
    { duration: '10s', target: 0 },    // Quick ramp down
  ],
  thresholds: {
    // We expect failures - this is for profiling, not performance validation
    http_req_duration: ['p(95)<5000'], // Very lenient - just want to complete
    errors: ['rate<0.99'], // Allow up to 99% errors - we just need profiling data
  },
};

const BASE_URL = 'http://localhost:3003';

export default function () {
  // Focus on the failing endpoints from our previous test
  // 70% read operations (user performance - the endpoint that was timing out)
  // 30% write operations (bot enable/disable - also timing out)
  
  const shouldWrite = Math.random() < 0.3;
  
  if (shouldWrite) {
    // Write operation - bot toggle (these were failing with timeouts)
    const isEnable = Math.random() < 0.5;
    const endpoint = isEnable ? '/api/bot/enable' : '/api/bot/disable';
    
    const response = http.post(`${BASE_URL}${endpoint}`, null, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer mock_token',
      },
      timeout: '30s', // Longer timeout for profiling
    });
    
    const success = check(response, {
      'write operation completed': (r) => r.status !== 0, // Any response is good for profiling
    });
    
    if (!success) {
      errorRate.add(1);
    }
    
  } else {
    // Read operation - user performance (this was the main failing endpoint)
    const response = http.get(`${BASE_URL}/api/user/performance?walletAddress=5QfzCCipXjebAfHpMhCJAoxUJL2TyqM5p8tCFLjsPbmh&timeRange=30D`, {
      headers: {
        'Authorization': 'Bearer mock_token',
      },
      timeout: '30s', // Longer timeout for profiling
    });
    
    const success = check(response, {
      'read operation completed': (r) => r.status !== 0, // Any response is good for profiling
    });
    
    if (!success) {
      errorRate.add(1);
    }
  }
  
  // Minimal sleep - we want to stress the event loop
  sleep(0.05);
}