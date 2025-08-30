"use client";

import React, { useMemo } from "react";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-wallets";
import { clusterApiUrl } from "@solana/web3.js";

import "@solana/wallet-adapter-react-ui/styles.css";

export default function AppWalletProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const network = WalletAdapterNetwork.Devnet;
  const endpoint = useMemo(() => clusterApiUrl(network), [network]);
  
  // Initialize wallets - Phantom is included by default
  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter({
        // Explicitly prefer Phantom over MetaMask
        network,
      })
    ],
    [network]
  );

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider 
        wallets={wallets} 
        autoConnect={true}
        localStorageKey="xorj-wallet"
        onError={(error) => {
          console.error('Wallet connection error:', error);
          
          // Filter out MetaMask-related errors for Solana wallet adapter
          if (error.message && error.message.includes('MetaMask')) {
            console.warn('MetaMask detected but this is a Solana app. Please use Phantom wallet.');
            return;
          }
          
          // Show user-friendly error messages
          if (error.message && error.message.includes('User rejected')) {
            console.log('User cancelled wallet connection');
          } else {
            console.error('Unexpected wallet error:', error);
          }
        }}
      >
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}