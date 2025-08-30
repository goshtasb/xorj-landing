/**
 * Wallet Detection and Conflict Resolution Utilities
 * Helps handle conflicts between MetaMask and Phantom wallets
 */

export interface WalletDetectionResult {
  hasPhantom: boolean;
  hasMetaMask: boolean;
  phantomAvailable: boolean;
  metaMaskConflict: boolean;
  recommendation: string;
}

/**
 * Detect available wallet extensions and potential conflicts
 */
export function detectWallets(): WalletDetectionResult {
  if (typeof window === 'undefined') {
    return {
      hasPhantom: false,
      hasMetaMask: false,
      phantomAvailable: false,
      metaMaskConflict: false,
      recommendation: 'Server-side rendering - wallets not available'
    };
  }

  const hasPhantom = !!(window as any).phantom?.solana;
  const hasMetaMask = !!(window as any).ethereum?.isMetaMask;
  const phantomAvailable = hasPhantom && !!(window as any).phantom?.solana?.isPhantom;
  
  // Check if MetaMask is interfering with Solana connections
  const metaMaskConflict = hasMetaMask && (
    // MetaMask injected itself as window.solana
    (!!(window as any).solana && !(window as any).solana.isPhantom) ||
    // MetaMask is blocking other wallet connections
    ((window as any).ethereum && (window as any).ethereum.isMetaMask && !hasPhantom)
  );

  let recommendation = '';
  
  if (!hasPhantom && !hasMetaMask) {
    recommendation = 'Please install Phantom wallet to use this Solana application.';
  } else if (!hasPhantom && hasMetaMask) {
    recommendation = 'MetaMask detected. Please install Phantom wallet for Solana transactions.';
  } else if (hasPhantom && !hasMetaMask) {
    recommendation = 'Phantom wallet ready! You can connect to start using the app.';
  } else if (metaMaskConflict) {
    recommendation = 'Wallet conflict detected. Please disable MetaMask or use Phantom in a separate browser profile.';
  } else {
    recommendation = 'Multiple wallets detected. Phantom will be used for Solana transactions.';
  }

  return {
    hasPhantom,
    hasMetaMask,
    phantomAvailable,
    metaMaskConflict,
    recommendation
  };
}

/**
 * Get user-friendly instructions for resolving wallet conflicts
 */
export function getWalletInstructions(): string[] {
  const detection = detectWallets();
  
  if (detection.metaMaskConflict) {
    return [
      'Wallet conflict detected between MetaMask and Phantom.',
      'To resolve this issue:',
      '1. Disable MetaMask extension temporarily, or',
      '2. Use Phantom in a separate browser profile, or', 
      '3. Use a different browser where only Phantom is installed'
    ];
  }
  
  if (!detection.hasPhantom) {
    return [
      'Phantom wallet is required for this Solana application.',
      'Please install Phantom:',
      '1. Visit phantom.app',
      '2. Download and install the browser extension',
      '3. Create or import your Solana wallet',
      '4. Refresh this page and try connecting again'
    ];
  }
  
  if (detection.phantomAvailable) {
    return [
      'Phantom wallet detected and ready!',
      'Click "Connect Wallet" to get started.'
    ];
  }
  
  return [
    'Please ensure Phantom wallet is properly installed and enabled.',
    'Refresh the page and try again.'
  ];
}

/**
 * Attempt to force Phantom wallet connection despite MetaMask presence
 */
export async function connectPhantomWallet() {
  if (typeof window === 'undefined') {
    throw new Error('Window not available - cannot connect wallet');
  }

  // Try to get Phantom specifically
  const phantom = (window as any).phantom?.solana;
  
  if (!phantom) {
    throw new Error('Phantom wallet not found. Please install Phantom wallet.');
  }
  
  if (!phantom.isPhantom) {
    throw new Error('Invalid wallet provider. Please use Phantom wallet.');
  }
  
  try {
    const response = await phantom.connect();
    console.log('✅ Phantom wallet connected successfully:', response.publicKey.toString());
    return response;
  } catch (error: any) {
    console.error('❌ Phantom wallet connection failed:', error);
    
    if (error.code === 4001) {
      throw new Error('Connection cancelled. Please approve the wallet connection.');
    } else if (error.message?.includes('MetaMask')) {
      throw new Error('MetaMask conflict detected. Please disable MetaMask and try again.');
    } else {
      throw new Error(`Wallet connection failed: ${error.message || 'Unknown error'}`);
    }
  }
}