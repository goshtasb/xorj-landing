/**
 * Type definitions for mock testing environment
 */

export interface MockRpcServer {
  getPortfolio(walletAddress: string): Portfolio;
  getTransactionHistory(walletAddress: string): Transaction[];
  recordContractCall(call: ContractCall): void;
  getContractCalls(): ContractCall[];
  close(): Promise<void>;
}

export interface Portfolio {
  walletAddress: string;
  tokens: TokenHolding[];
  totalValueUsd: number;
}

export interface TokenHolding {
  mint: string;
  symbol: string;
  amount: number;
  valueUsd: number;
  percentage: number;
}

export interface Transaction {
  signature: string;
  blockTime: number;
  fromToken: string;
  toToken: string;
  amountIn: number;
  amountOut: number;
  priceImpact: number;
  success: boolean;
  pnl: number;
}

export interface ContractCall {
  method: string;
  parameters: any;
  timestamp?: number;
}

export interface PriceData {
  symbol: string;
  price: number;
  timestamp: number;
  volume24h: number;
  change24h: number;
}

export interface HistoricalPriceData {
  symbol: string;
  prices: Array<{
    timestamp: number;
    price: number;
    volume: number;
  }>;
}