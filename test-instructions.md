# 🧪 Phantom Wallet Connection Testing Instructions

## Quick Test Steps

### 1. Main App Test (http://localhost:3000)
1. Open http://localhost:3000 in your browser
2. Look for the "Connect Phantom Wallet" button in the navigation
3. Open browser console (F12) to see debug logs
4. Click "Connect Phantom Wallet"
5. **EXPECTED**: Phantom OAuth modal should appear with all authentication options
6. **CHECK**: Modal should show email, Google, Apple, seed phrase, and new wallet options

### 2. Dedicated Test Page (http://localhost:3000/test-wallet)
1. Open http://localhost:3000/test-wallet
2. Click "Re-check Phantom Status" - should show "found" 
3. Click "Test Direct Connection (SHOULD SHOW OAUTH MODAL)"
4. **EXPECTED**: Phantom OAuth modal appears immediately
5. **VERIFY**: All authentication options are visible
6. Complete authentication and verify connection status

### 3. Console Test (Advanced)
1. Open browser console on any page
2. Copy and paste the contents of `test-phantom-connection.js`
3. Press Enter to run the automated test
4. Follow the console output for detailed step-by-step results

## Expected Behavior ✅

When clicking "Connect Phantom Wallet" or "Test Direct Connection":

1. **Phantom OAuth Modal Opens** - This is the key requirement
2. **Multiple Auth Options Visible**:
   - 📧 Email sign-in
   - 🔍 Google sign-in  
   - 🍎 Apple sign-in
   - 🔑 Import seed phrase
   - ✨ Create new wallet
   - 🔌 Browser extension login

3. **No Cached Connection** - Even if previously connected, modal should still appear
4. **Clean Disconnect/Reconnect** - After disconnect, reconnect should work properly

## Troubleshooting 🔧

### If Modal Doesn't Appear:
- Check console for error messages
- Ensure Phantom wallet extension is installed and enabled
- Try the "Force new authentication" button
- Clear browser cache and localStorage
- Restart browser and try again

### If "Phantom wallet not properly detected":
- Install Phantom wallet extension from phantom.app
- Ensure extension is enabled in browser settings
- Refresh the page after installation
- Check if other wallet extensions might be conflicting

## Test Results to Report 📋

Please test and report:
1. ✅/❌ Phantom OAuth modal appears on main page
2. ✅/❌ Modal shows all authentication options
3. ✅/❌ Connection succeeds after authentication
4. ✅/❌ Disconnect functionality works
5. ✅/❌ Reconnect after disconnect works
6. ✅/❌ "Force new authentication" works

## Debug Information 🐛

Check browser console for these debug messages:
- `🔍 Checking Phantom status...`
- `✅ Phantom wallet detected and ready`
- `🚀 Starting Phantom authentication...`
- `🔐 Triggering Phantom authentication modal...`
- `✅ Phantom OAuth successful!`