"use client";

import dynamic from "next/dynamic";

// Dynamic import to prevent SSR hydration mismatch
const WalletMultiButtonDynamic = dynamic(
  async () =>
    (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
  { ssr: false }
);

export default function WalletButton() {
  return <WalletMultiButtonDynamic />;
}