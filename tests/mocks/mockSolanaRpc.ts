/**
 * Mock Solana RPC Server for End-to-End Testing
 * 
 * Provides mock transaction histories and portfolio states for three test traders:
 * - Trader A ("The Pro"): 100 trades, 80% win rate, 90% ROI, 10% max drawdown
 * - Trader B ("The Gambler"): 20 trades, 50% win rate, 300% ROI, 70% max drawdown  
 * - Trader C ("The Safe Bet"): 200 trades, 95% win rate, 20% ROI, 2% max drawdown
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
  timestamp: number;
}

class MockSolanaRpcServer implements MockRpcServer {
  private contractCalls: ContractCall[] = [];
  
  // Mock portfolios
  private portfolios: Map<string, Portfolio> = new Map();
  
  // Mock transaction histories  
  private transactionHistories: Map<string, Transaction[]> = new Map();

  constructor() {
    this.setupMockData();
  }

  private setupMockData() {
    console.log('🔧 Setting up mock Solana RPC data...');
    
    // Setup portfolios
    this.setupMockPortfolios();
    
    // Setup transaction histories
    this.setupMockTransactionHistories();
    
    console.log('✅ Mock Solana RPC data ready');
  }

  private setupMockPortfolios() {
    // User's vault portfolio: 100% USDC
    this.portfolios.set('mock-user-wallet-address', {
      walletAddress: 'mock-user-wallet-address',
      tokens: [
        {
          mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          symbol: 'USDC',
          amount: 10000,
          valueUsd: 10000,
          percentage: 100
        }
      ],
      totalValueUsd: 10000
    });

    // Trader A portfolio: 100% JUP  
    this.portfolios.set('trader-A-wallet-address', {
      walletAddress: 'trader-A-wallet-address',
      tokens: [
        {
          mint: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
          symbol: 'JUP',
          amount: 15000,
          valueUsd: 15000,
          percentage: 100
        }
      ],
      totalValueUsd: 15000
    });

    // Trader B portfolio: Mixed portfolio (for variety)
    this.portfolios.set('trader-B-wallet-address', {
      walletAddress: 'trader-B-wallet-address',
      tokens: [
        {
          mint: 'So11111111111111111111111111111111111111112',
          symbol: 'SOL',
          amount: 100,
          valueUsd: 8000,
          percentage: 80
        },
        {
          mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          symbol: 'USDC',
          amount: 2000,
          valueUsd: 2000,
          percentage: 20
        }
      ],
      totalValueUsd: 10000
    });

    // Trader C portfolio: Conservative mix
    this.portfolios.set('trader-C-wallet-address', {
      walletAddress: 'trader-C-wallet-address',
      tokens: [
        {
          mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          symbol: 'USDC',
          amount: 6000,
          valueUsd: 6000,
          percentage: 60
        },
        {
          mint: 'So11111111111111111111111111111111111111112',
          symbol: 'SOL',
          amount: 40,
          valueUsd: 4000,
          percentage: 40
        }
      ],
      totalValueUsd: 10000
    });
  }

  private setupMockTransactionHistories() {
    // Trader A ("The Pro"): 100 trades, 80% win rate, 90% ROI, 10% max drawdown
    const traderATxns = this.generateTraderTransactions({
      wallet: 'trader-A-wallet-address',
      totalTrades: 100,
      winRate: 0.80,
      totalROI: 0.90,
      maxDrawdown: 0.10,
      baseValue: 10000
    });
    this.transactionHistories.set('trader-A-wallet-address', traderATxns);

    // Trader B ("The Gambler"): 20 trades, 50% win rate, 300% ROI, 70% max drawdown
    const traderBTxns = this.generateTraderTransactions({
      wallet: 'trader-B-wallet-address',
      totalTrades: 20,
      winRate: 0.50,
      totalROI: 3.00,
      maxDrawdown: 0.70,
      baseValue: 5000
    });
    this.transactionHistories.set('trader-B-wallet-address', traderBTxns);

    // Trader C ("The Safe Bet"): 200 trades, 95% win rate, 20% ROI, 2% max drawdown
    const traderCTxns = this.generateTraderTransactions({
      wallet: 'trader-C-wallet-address',
      totalTrades: 200,
      winRate: 0.95,
      totalROI: 0.20,
      maxDrawdown: 0.02,
      baseValue: 8000
    });
    this.transactionHistories.set('trader-C-wallet-address', traderCTxns);
  }

  private generateTraderTransactions(params: {
    wallet: string;
    totalTrades: number;
    winRate: number;
    totalROI: number;
    maxDrawdown: number;
    baseValue: number;
  }): Transaction[] {
    const transactions: Transaction[] = [];
    const { totalTrades, winRate, totalROI, maxDrawdown, baseValue } = params;
    
    let portfolioValue = baseValue;
    let maxValue = baseValue;
    let minValue = baseValue;
    
    // Calculate target final value
    const targetValue = baseValue * (1 + totalROI);
    
    // Generate transactions over 6 months
    const startTime = Date.now() - (6 * 30 * 24 * 60 * 60 * 1000);
    
    for (let i = 0; i < totalTrades; i++) {
      const isWin = Math.random() < winRate;
      const timestamp = startTime + (i * (6 * 30 * 24 * 60 * 60 * 1000) / totalTrades);
      
      // Calculate trade size (1-5% of portfolio)
      const tradeSize = portfolioValue * (0.01 + Math.random() * 0.04);
      
      // Calculate PnL based on win/loss and remaining ROI to achieve
      const remainingTrades = totalTrades - i;
      const currentROI = (portfolioValue - baseValue) / baseValue;
      const neededROI = totalROI - currentROI;
      
      let pnlPercent: number;
      if (isWin) {
        // Wins: positive return
        pnlPercent = (neededROI / remainingTrades) * 2 + (Math.random() * 0.1);
      } else {
        // Losses: negative return, but controlled
        pnlPercent = -(Math.random() * 0.05 + 0.01);
      }
      
      const pnl = tradeSize * pnlPercent;
      portfolioValue += pnl;
      
      // Track max value for drawdown calculation
      if (portfolioValue > maxValue) {
        maxValue = portfolioValue;
      }
      
      // Enforce max drawdown constraint
      const currentDrawdown = (maxValue - portfolioValue) / maxValue;
      if (currentDrawdown > maxDrawdown) {
        // Adjust to stay within max drawdown
        portfolioValue = maxValue * (1 - maxDrawdown);
      }
      
      // Track minimum value
      if (portfolioValue < minValue) {
        minValue = portfolioValue;
      }
      
      transactions.push({
        signature: `tx_${params.wallet}_${i}_${timestamp}`,
        blockTime: timestamp,
        fromToken: Math.random() > 0.5 ? 'USDC' : 'SOL',
        toToken: Math.random() > 0.5 ? 'JUP' : 'RAY',
        amountIn: tradeSize,
        amountOut: tradeSize + pnl,
        priceImpact: Math.random() * 0.01, // 0-1% price impact
        success: true,
        pnl: pnl
      });
    }
    
    console.log(`   📊 Generated ${totalTrades} transactions for ${params.wallet}`);
    console.log(`      Final portfolio value: $${portfolioValue.toFixed(2)}`);
    console.log(`      Actual ROI: ${((portfolioValue - baseValue) / baseValue * 100).toFixed(1)}%`);
    console.log(`      Max drawdown: ${((maxValue - minValue) / maxValue * 100).toFixed(1)}%`);
    
    return transactions;
  }

  getPortfolio(walletAddress: string): Portfolio {
    const portfolio = this.portfolios.get(walletAddress);
    if (!portfolio) {
      throw new Error(`Portfolio not found for wallet: ${walletAddress}`);
    }
    return portfolio;
  }

  getTransactionHistory(walletAddress: string): Transaction[] {
    const history = this.transactionHistories.get(walletAddress);
    if (!history) {
      throw new Error(`Transaction history not found for wallet: ${walletAddress}`);
    }
    return history;
  }

  recordContractCall(call: ContractCall): void {
    this.contractCalls.push({
      ...call,
      timestamp: Date.now()
    });
  }

  getContractCalls(): ContractCall[] {
    return this.contractCalls;
  }

  async close(): Promise<void> {
    console.log('🔌 Closing mock Solana RPC server...');
    this.contractCalls = [];
    this.portfolios.clear();
    this.transactionHistories.clear();
  }
}

export async function setupMockRpcServer(): Promise<MockRpcServer> {
  return new MockSolanaRpcServer();
}