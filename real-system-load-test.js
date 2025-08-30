import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

// Custom metrics
export let errorRate = new Rate('errors');

export let options = {
  // 3-minute focused test for real system baseline
  stages: [
    { duration: '30s', target: 10 },   // Warm up to 10 users
    { duration: '1m', target: 25 },    // Scale to 25 users
    { duration: '1m', target: 50 },    // Scale to 50 users 
    { duration: '30s', target: 0 },    // Ramp down
  ],
  thresholds: {
    // Real system expectations
    http_req_duration: ['p(95)<100'], // 95% under 100ms (with real DB)
    errors: ['rate<0.05'], // Error rate under 5%
  },
};

const BASE_URL = 'http://localhost:3003';
const JWT_SECRET = 'dev_jwt_secret_2024_not_for_production';

// Generate a valid JWT token for testing
function generateJWT() {
  const payload = {
    wallet_address: '5QfzCCipXjebAfHpMhCJAoxUJL2TyqM5p8tCFLjsPbmh',
    user_id: '5QfzCCipXjebAfHpMhCJAoxUJL2TyqM5p8tCFLjsPbmh',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60)
  };
  
  // Simple JWT generation (k6 doesn't have jwt library, so using static token)
  // In reality, this would be generated server-side or with proper library
  return 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ3YWxsZXRfYWRkcmVzcyI6IjVRZnpDQ2lwWGplYkFmSHBNaENKQW94VUpMMlR5cU01cDh0Q0ZManNQYm1oIiwidXNlcl9pZCI6IjVRZnpDQ2lwWGplYkFmSHBNaENKQW94VUpMMlR5cU01cDh0Q0ZManNQYm1oIiwiaWF0IjoxNzI0Nzg5MTAwLCJleHAiOjE3MjQ4NzU1MDB9.X2Y8QUE6tIFXjAU3dUhI4jAxxFR3ySW8-qLZN3r_abc';
}

export default function () {
  const token = generateJWT();
  
  // 70% read operations, 30% write operations  
  const shouldWrite = Math.random() < 0.3;
  
  if (shouldWrite) {
    // Write operation - bot enable/disable with real database
    const isEnable = Math.random() < 0.5;
    const endpoint = isEnable ? '/api/bot/enable' : '/api/bot/disable';
    
    const response = http.post(`${BASE_URL}${endpoint}`, null, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
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
      'database operation completed': (r) => {
        try {
          const data = JSON.parse(r.body);
          return data.trace && data.trace.dbTime >= 0;
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
          console.log(`✅ Write [${data.trace.requestId}]: Total=${data.trace.totalTime}ms DB=${data.trace.dbTime}ms JWT=${data.trace.jwtTime}ms`);
        }
      } catch (e) {
        // Ignore JSON parse errors for logging
      }
    }
    
  } else {
    // Read operation - user performance with authentication
    const response = http.get(`${BASE_URL}/api/user/performance?walletAddress=5QfzCCipXjebAfHpMhCJAoxUJL2TyqM5p8tCFLjsPbmh&timeRange=30D`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      timeout: '10s',
    });
    
    const success = check(response, {
      'read operation status is 200': (r) => r.status === 200,
      'read operation has success field': (r) => {
        try {
          return JSON.parse(r.body).success === true;
        } catch (e) {
          return false;
        }
      },
    });
    
    if (!success) {
      errorRate.add(1);
      console.log(`❌ Read operation failed: ${response.status}`);
    }
  }
  
  // Small sleep to simulate real user behavior  
  sleep(0.1);
}
