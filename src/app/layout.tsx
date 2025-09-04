import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import AppWalletProvider from "@/components/AppWalletProvider";
import { EnhancedWalletProvider } from "@/contexts/EnhancedWalletContext";
import { SimpleWalletProvider } from "@/contexts/SimpleWalletContext";
import { GlobalErrorProvider } from "@/contexts/GlobalErrorContext";
import { BotStatusProvider } from "@/contexts/BotStatusContext";
import GlobalErrorBanner from "@/components/GlobalErrorBanner";
// Import RPC error handler to initialize global error handling
import "@/lib/rpcErrorHandler";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "XORJ - Intelligent Solana Investing",
  description: "AI-powered Solana investing platform. Finally safe and simple.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <GlobalErrorProvider>
          <GlobalErrorBanner />
          <AppWalletProvider>
            <EnhancedWalletProvider>
              <SimpleWalletProvider>
                <BotStatusProvider>
                  {children}
                </BotStatusProvider>
              </SimpleWalletProvider>
            </EnhancedWalletProvider>
          </AppWalletProvider>
        </GlobalErrorProvider>
      </body>
    </html>
  );
}
