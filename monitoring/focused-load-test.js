import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

// Custom metrics
export let errorRate = new Rate('errors');

export let options = {
  // 5-minute focused load test for profiling
  stages: [
    { duration: '30s', target: 20 },   // Quick ramp up to 20 users
    { duration: '1m', target: 50 },    // Scale to 50 users
    { duration: '2m', target: 100 },   // Scale to 100 users (failure point)
    { duration: '1m30s', target: 100 }, // Hold at 100 users for profiling
    { duration: '30s', target: 0 },    // Ramp down
  ],
  thresholds: {
    // Expectations - we expect these to fail, that's the point
    http_req_duration: ['p(95)<200'], // 95% of requests under 200ms
    errors: ['rate<0.01'], // Error rate under 1%
  },
};

const BASE_URL = 'http://localhost:3003';

export default function () {
  // 80% read operations (GET /api/user/performance)
  // 20% write operations (POST /api/bot/enable, POST /api/bot/disable)
  
  const shouldWrite = Math.random() < 0.2;
  
  if (shouldWrite) {
    // Write operation - bot toggle
    const isEnable = Math.random() < 0.5;
    const endpoint = isEnable ? '/api/bot/enable' : '/api/bot/disable';
    
    const response = http.post(`${BASE_URL}${endpoint}`, null, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer mock_token',
      },
      timeout: '10s',
    });
    
    const success = check(response, {
      'write operation status is 200': (r) => r.status === 200,
      'write operation has success field': (r) => {
        try {
          return JSON.parse(r.body).success === true;
        } catch (e) {
          return false;
        }
      },
    });
    
    if (!success) {
      errorRate.add(1);
      console.log(`❌ Write operation failed: ${response.status} - ${response.body}`);
    } else {
      try {
        const data = JSON.parse(response.body);
        if (data.trace) {
          console.log(`✅ Write [${data.trace.requestId}]: Total=${data.trace.totalTime}ms DB=${data.trace.dbTime}ms`);
        }
      } catch (e) {
        // Ignore JSON parse errors for logging
      }
    }
    
  } else {
    // Read operation - user performance
    const response = http.get(`${BASE_URL}/api/user/performance?walletAddress=5QfzCCipXjebAfHpMhCJAoxUJL2TyqM5p8tCFLjsPbmh&timeRange=30D`, {
      headers: {
        'Authorization': 'Bearer mock_token',
      },
      timeout: '10s',
    });
    
    const success = check(response, {
      'read operation status is 200': (r) => r.status === 200,
    });
    
    if (!success) {
      errorRate.add(1);
      console.log(`❌ Read operation failed: ${response.status}`);
    }
  }
  
  // Small sleep to simulate real user behavior
  sleep(0.1);
}