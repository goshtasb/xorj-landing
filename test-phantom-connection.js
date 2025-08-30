// Test script to verify Phantom wallet connection
// Run this in the browser console on localhost:3000

console.log('🧪 Starting Phantom Wallet Connection Test...');

// Function to test Phantom wallet detection and connection
async function testPhantomConnection() {
  console.log('\n=== PHANTOM WALLET TEST ===\n');
  
  // Step 1: Check if Phantom is available
  console.log('1. Checking Phantom availability...');
  console.log('   window.solana exists:', !!window.solana);
  console.log('   window.solana.isPhantom:', window.solana?.isPhantom);
  console.log('   window.solana.isConnected:', window.solana?.isConnected);
  
  if (!window.solana || !window.solana.isPhantom) {
    console.error('❌ FAIL: Phantom wallet not detected');
    console.log('   Please install Phantom wallet extension');
    return;
  }
  
  console.log('✅ PASS: Phantom wallet detected');
  
  // Step 2: Clear existing connections and storage
  console.log('\n2. Clearing existing connections and storage...');
  
  try {
    if (window.solana.isConnected) {
      console.log('   Disconnecting existing connection...');
      await window.solana.disconnect();
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Clear localStorage
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.includes('phantom') || key.includes('wallet') || key.includes('solana'))) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
    console.log('   Cleared', keysToRemove.length, 'localStorage keys');
    
    console.log('✅ PASS: Cleanup completed');
  } catch (error) {
    console.log('⚠️  Cleanup had issues:', error.message);
  }
  
  // Step 3: Test direct connection with onlyIfTrusted: false
  console.log('\n3. Testing direct connection (should show OAuth modal)...');
  console.log('   Calling window.solana.connect({ onlyIfTrusted: false })');
  console.log('   🔍 WATCH FOR: Phantom OAuth modal should appear now');
  console.log('   📱 Expected modal contents:');
  console.log('      - Email sign-in option');
  console.log('      - Google sign-in option'); 
  console.log('      - Apple sign-in option');
  console.log('      - Import seed phrase option');
  console.log('      - Create new wallet option');
  console.log('      - Browser extension login option');
  
  try {
    const response = await window.solana.connect({
      onlyIfTrusted: false // This MUST trigger the OAuth modal
    });
    
    console.log('\n   📱 Connection response received:');
    console.log('      Response:', response);
    console.log('      Public key:', response?.publicKey?.toString());
    
    if (response && response.publicKey) {
      console.log('✅ SUCCESS: Phantom OAuth connection established!');
      console.log('   Public key:', response.publicKey.toString());
      
      // Test disconnection
      console.log('\n4. Testing disconnection...');
      await window.solana.disconnect();
      console.log('✅ SUCCESS: Disconnection completed');
      
      return true;
    } else {
      console.error('❌ FAIL: No response or public key received');
      return false;
    }
    
  } catch (error) {
    console.error('❌ FAIL: Connection failed');
    console.error('   Error:', error.message);
    console.error('   Code:', error.code);
    console.error('   Details:', error);
    
    if (error.code === 4001) {
      console.log('   ℹ️  User rejected the connection (this is normal if you clicked cancel)');
    }
    
    return false;
  }
}

// Run the test
testPhantomConnection().then(success => {
  console.log('\n=== TEST COMPLETE ===');
  console.log('Result:', success ? '✅ SUCCESS' : '❌ FAILED');
  
  if (success) {
    console.log('🎉 Phantom OAuth modal appeared and connection worked!');
  } else {
    console.log('💡 Next steps:');
    console.log('   1. Make sure Phantom wallet extension is installed');
    console.log('   2. Check if Phantom is enabled in your browser');
    console.log('   3. Try refreshing the page and running the test again');
  }
});