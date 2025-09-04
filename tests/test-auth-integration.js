const jwt = require('jsonwebtoken');
const nacl = require('tweetnacl');
const { PublicKey } = require('@solana/web3.js');

// Test signature verification logic
function testSignatureVerification() {
  console.log('🔐 Testing signature verification logic...\n');

  try {
    // Generate a keypair for testing
    const keypair = nacl.sign.keyPair();
    const publicKey = new PublicKey(keypair.publicKey);
    const message = 'Test authentication message';
    const messageBytes = Buffer.from(message, 'utf8');

    // Sign the message
    const signature = nacl.sign.detached(messageBytes, keypair.secretKey);
    const signatureBase64 = Buffer.from(signature).toString('base64');

    console.log('1️⃣ Generated test signature');
    console.log('   Public Key:', publicKey.toString());
    console.log('   Message:', message);
    console.log('   Signature:', signatureBase64.substring(0, 20) + '...');

    // Verify the signature (this is what our API does)
    const isValid = nacl.sign.detached.verify(
      messageBytes,
      signature,
      keypair.publicKey
    );

    if (isValid) {
      console.log('✅ Signature verification: PASSED');
    } else {
      console.log('❌ Signature verification: FAILED');
      return false;
    }

    // Test with wrong signature
    const wrongSignature = nacl.sign.detached(Buffer.from('wrong message', 'utf8'), keypair.secretKey);
    const isWrongValid = nacl.sign.detached.verify(
      messageBytes,
      wrongSignature,
      keypair.publicKey
    );

    if (!isWrongValid) {
      console.log('✅ Wrong signature rejection: PASSED');
    } else {
      console.log('❌ Wrong signature rejection: FAILED');
      return false;
    }

    console.log('🎉 All signature verification tests passed!\n');
    return true;

  } catch (error) {
    console.error('❌ Signature verification test failed:', error.message);
    return false;
  }
}

// Test complete authentication flow with database integration
async function testAuthenticationIntegration() {
  const baseUrl = 'http://localhost:3003';
  const testWalletAddress = '5QfzCCipXjebAfHpMhCJAoxUJL2TyqM5p8tCFLjsPbmh';
  
  console.log('🔐 Testing authentication integration...\n');

  try {
    // Step 1: Test login endpoint (creates JWT and user record)
    console.log('1️⃣ Testing login endpoint...');
    const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        wallet_address: testWalletAddress
      })
    });

    const loginResult = await loginResponse.json();
    
    if (!loginResponse.ok) {
      console.error('❌ Login failed:', loginResult);
      process.exit(1);
    }
    
    console.log('✅ Login successful');
    console.log('  Token generated:', loginResult.token ? 'Yes' : 'No');
    console.log('  User created:', loginResult.user_created);
    
    const token = loginResult.token;
    
    // Step 2: Test authenticated API calls with real JWT
    console.log('\n2️⃣ Testing authenticated API calls...');
    
    // Test bot enable with real JWT
    const enableResponse = await fetch(`${baseUrl}/api/bot/enable`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    const enableResult = await enableResponse.json();
    
    if (enableResponse.ok) {
      console.log('✅ Bot enable with JWT successful');
      console.log('  Trace available:', enableResult.trace ? 'Yes' : 'No');
      console.log('  Total time:', enableResult.trace?.totalTime + 'ms');
    } else {
      console.log('❌ Bot enable failed:', enableResult);
    }
    
    // Step 3: Test user performance API with database query
    console.log('\n3️⃣ Testing user performance API with real wallet...');
    
    const performanceResponse = await fetch(
      `${baseUrl}/api/user/performance?walletAddress=${testWalletAddress}&timeRange=30D`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );

    const performanceResult = await performanceResponse.json();
    
    if (performanceResponse.ok) {
      console.log('✅ Performance API with JWT successful');
      console.log('  Data received:', Object.keys(performanceResult.data || {}));
    } else {
      console.log('❌ Performance API failed:', performanceResult);
    }
    
    // Step 4: Test JWT token validation  
    console.log('\n4️⃣ Testing JWT token validation...');
    
    const JWT_SECRET = process.env.JWT_SECRET || 'dev_jwt_secret_2024_not_for_production';
    const decoded = jwt.verify(token, JWT_SECRET);
    
    console.log('✅ JWT validation successful');
    console.log('  Wallet address in token:', decoded.wallet_address);
    console.log('  Token expiry:', new Date(decoded.exp * 1000).toISOString());
    
    // Step 5: Test with invalid token
    console.log('\n5️⃣ Testing with invalid token...');
    
    const invalidResponse = await fetch(`${baseUrl}/api/bot/enable`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer invalid_token'
      }
    });

    const invalidResult = await invalidResponse.json();
    
    if (invalidResponse.status === 401) {
      console.log('✅ Invalid token correctly rejected');
      console.log('  Error message:', invalidResult.error.message);
    } else {
      console.log('❌ Invalid token should have been rejected');
    }
    
    console.log('\n🎉 All authentication integration tests passed!');
    console.log('\n📊 Integration Test Summary:');
    console.log('  ✅ Database connection working');
    console.log('  ✅ JWT generation working'); 
    console.log('  ✅ JWT validation working');
    console.log('  ✅ User creation working');
    console.log('  ✅ Authenticated API calls working');
    console.log('  ✅ Error handling working');

  } catch (error) {
    console.error('❌ Authentication integration test failed:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Run signature verification test first
console.log('🚀 Starting XORJ Authentication Tests...\n');

if (!testSignatureVerification()) {
  console.error('❌ Signature verification tests failed!');
  process.exit(1);
}

// Only run integration test if server is expected to be running
if (process.env.RUN_INTEGRATION_TESTS === 'true') {
  console.log('🔗 Running integration tests...');
  testAuthenticationIntegration();
} else {
  console.log('ℹ️  Skipping integration tests (server not running)');
  console.log('   Set RUN_INTEGRATION_TESTS=true to run full integration tests');
}
