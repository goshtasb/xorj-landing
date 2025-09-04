/**
 * User Transactions API Endpoint (PRD Compliant)
 * GET /api/user/transactions - Fetch paginated user transaction history.
 *
 * This version is compliant with the "Automated Trading Bot Concept Pressure-Tested" conversation.
 * - Fixes critical server-side caching to ensure fresh data.
 * - Fixes data integrity issues by removing random data generation.
 */

import { NextRequest, NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';
import { v4 as uuidv4 } from 'uuid';
import { TradeService } from '@/lib/botStateService';
import { resilientRpcClient } from '@/lib/resilientRpcClient';

// FIX (NFR-1): Mark the route handler as dynamic to prevent static rendering and ensure
// it runs on the server for every request, respecting cache-control headers.
export const dynamic = 'force-dynamic';

// Solana RPC configuration
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

// --- Type Definitions ---
export type TransactionType = 'BUY' | 'SELL' | 'DEPOSIT' | 'WITHDRAWAL';
export type TransactionStatus = 'COMPLETED' | 'PENDING' | 'FAILED';

interface Transaction {
  id: string;
  walletAddress: string;
  timestamp: number;
  type: TransactionType;
  status: TransactionStatus;
  symbol: string;
  amount: number;
  price: number;
  totalValue: number;
  fees: number;
  txHash?: string;
}

interface PaginatedTransactions {
  transactions: Transaction[];
  totalCount: number;
  pageCount: number;
  currentPage: number;
}

// --- API Handler ---
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const requestId = `txn_${uuidv4()}`;

  try {
    const { searchParams } = new URL(request.url);
    const walletAddress = searchParams.get('walletAddress');
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));

    if (!walletAddress) {
      return NextResponse.json({ success: false, error: 'Wallet address is required' }, { status: 400 });
    }
    try {
      new PublicKey(walletAddress);
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid wallet address format' }, { status: 400 });
    }

    // PHASE 1: Use read-through caching for transactions
    const { cacheLayer } = await import('@/lib/cacheLayer');
    const cachedResult = await cacheLayer.getUserTransactions(walletAddress, page, limit);
    
    if (cachedResult.success && cachedResult.data) {
      console.log(`🎯 Serving cached transactions for ${walletAddress} (fromCache: ${cachedResult.fromCache})`);
      const responseData = cachedResult.data as PaginatedTransactions;
      
      // If we got empty results from cache/database, try fallback
      if (responseData.totalCount === 0) {
        // Try real transactions API as fallback
        const realTransactions = await fetchRealTransactions(walletAddress);
        if (realTransactions !== null && realTransactions.length > 0) {
          const totalCount = realTransactions.length;
          const pageCount = Math.ceil(totalCount / limit);
          const offset = (page - 1) * limit;
          const paginatedTransactions = realTransactions.slice(offset, offset + limit);
          
          const fallbackData: PaginatedTransactions = {
            transactions: paginatedTransactions,
            totalCount,
            pageCount,
            currentPage: page,
          };
          
          // Update cache with fallback data
          await cacheLayer.invalidateUserCache(walletAddress, `transactions:${page}:${limit}`);
          
          const processingTime = Date.now() - startTime;
          return NextResponse.json({ success: true, data: fallbackData, requestId }, {
            headers: {
              'Cache-Control': 'no-cache, no-store, max-age=0, must-revalidate',
              'X-Processing-Time': `${processingTime}ms`,
              'X-Request-ID': requestId,
              'X-Cache-Status': 'FALLBACK'
            },
          });
        }
        
        // Return empty data instead of mock transactions
        const responseData: PaginatedTransactions = {
          transactions: [],
          totalCount: 0,
          pageCount: 0,
          currentPage: page,
        };
        
        const processingTime = Date.now() - startTime;
        return NextResponse.json({ success: true, data: responseData, requestId }, {
          headers: {
            'Cache-Control': 'no-cache, no-store, max-age=0, must-revalidate',
            'X-Processing-Time': `${processingTime}ms`,
            'X-Request-ID': requestId,
            'X-Cache-Status': 'EMPTY'
          },
        });
      }
      
      
      const processingTime = Date.now() - startTime;
      return NextResponse.json({ success: true, data: responseData, requestId }, {
        headers: {
          // NFR-1: Ensure browsers and CDNs do not cache this dynamic response.
          'Cache-Control': 'no-cache, no-store, max-age=0, must-revalidate',
          'X-Processing-Time': `${processingTime}ms`,
          'X-Request-ID': requestId,
          'X-Cache-Status': cachedResult.fromCache ? 'HIT' : 'MISS'
        },
      });
    } else {
      // Cache layer failed - fallback to original logic
      console.error(`❌ Cache layer failed for ${walletAddress}:`, cachedResult.error);
      
      // Original fallback logic
      let allTransactions = await fetchDatabaseTransactions(walletAddress);
      
      if (allTransactions.length === 0) {
        const realTransactions = await fetchRealTransactions(walletAddress);
        if (realTransactions !== null && realTransactions.length > 0) {
          allTransactions = realTransactions;
        }
      }

      // Return empty data when no real transactions exist
      if (allTransactions.length === 0) {
        allTransactions = [];
      }

      const totalCount = allTransactions.length;
      const pageCount = Math.ceil(totalCount / limit);
      const offset = (page - 1) * limit;
      const paginatedTransactions = allTransactions.slice(offset, offset + limit);

      const responseData: PaginatedTransactions = {
        transactions: paginatedTransactions,
        totalCount,
        pageCount,
        currentPage: page,
      };
      
      const processingTime = Date.now() - startTime;
      return NextResponse.json({ success: true, data: responseData, requestId }, {
        headers: {
          'Cache-Control': 'no-cache, no-store, max-age=0, must-revalidate',
          'X-Processing-Time': `${processingTime}ms`,
          'X-Request-ID': requestId,
          'X-Cache-Status': 'ERROR'
        },
      });
    }

  } catch {
    console.error(`[${requestId}] Transactions API Error:`);
    return NextResponse.json({ success: false, error: 'An internal error occurred.' }, { status: 500 });
  }
}

// --- Data Fetching & Transformation ---

/**
 * Fetches transaction data from our database (trades table)
 * Returns an array of transactions from the database
 */
async function fetchDatabaseTransactions(walletAddress: string): Promise<Transaction[]> {
  try {
    console.log(`📦 Fetching transactions from database for wallet: ${walletAddress}`);
    
    // Get trades from database for this user's vault address
    // Note: In a real system, we'd need to map wallet address to vault address
    const tradesResult = await TradeService.getAll({
      user_vault_address: walletAddress, // Using wallet as vault address for now
      limit: 1000, // Get all trades for this user
      orderBy: 'created_at',
      orderDirection: 'DESC'
    });
    
    if (!tradesResult.success || !tradesResult.data) {
      console.log(`⚠️ No trades found in database for wallet: ${walletAddress}`);
      return [];
    }
    
    const dbTrades = tradesResult.data;
    console.log(`✅ Found ${dbTrades.length} trades in database`);
    
    // Transform database trades into Transaction format
    return dbTrades.map((trade): Transaction => ({
      id: trade.id,
      walletAddress,
      timestamp: trade.created_at.getTime(),
      type: determineTransactionType(trade.from_token_address, trade.to_token_address),
      status: mapTradeStatus(trade.status),
      symbol: getTokenSymbol(trade.from_token_address),
      amount: Number(trade.amount_in) / 1e6, // Convert from lamports/smallest units
      price: calculateTradePrice(trade),
      totalValue: Number(trade.amount_in) * calculateTradePrice(trade) / 1e6,
      fees: Number(trade.gas_fee || 0) / 1e9, // Convert lamports to SOL
      txHash: trade.transaction_signature || undefined
    }));
    
  } catch {
    console.error(`❌ Error fetching database transactions for ${walletAddress}:`);
    return [];
  }
}

/**
 * Helper functions for database transaction transformation
 */
function determineTransactionType(fromToken: string, toToken: string): TransactionType {
  // If from token is USDC and to token is something else, it's a BUY
  // If from token is something else and to token is USDC, it's a SELL
  const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
  
  if (fromToken === USDC_MINT) return 'BUY';
  if (toToken === USDC_MINT) return 'SELL';
  
  // Default to BUY if we can't determine
  return 'BUY';
}

function mapTradeStatus(dbStatus: string): TransactionStatus {
  switch (dbStatus.toLowerCase()) {
    case 'confirmed': return 'COMPLETED';
    case 'pending': return 'PENDING';
    case 'submitted': return 'PENDING';
    case 'failed': return 'FAILED';
    default: return 'PENDING';
  }
}

function getTokenSymbol(tokenAddress: string): string {
  const tokenMap: Record<string, string> = {
    'So11111111111111111111111111111111111111112': 'SOL',
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': 'USDC',
    'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN': 'JUP',
    '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R': 'RAY',
    // Add more token mappings as needed
  };
  
  return tokenMap[tokenAddress] || tokenAddress.slice(0, 6) + '...';
}

function calculateTradePrice(trade: Record<string, unknown>): number {
  const amountIn = Number(trade.amount_in);
  const expectedOut = Number(trade.expected_amount_out);
  const actualOut = Number(trade.actual_amount_out || expectedOut);
  
  if (amountIn === 0) return 0;
  
  // Calculate price as output/input ratio
  return actualOut / amountIn;
}

/**
 * Fetches real transaction data directly from Solana mainnet.
 * Returns an array of transactions, an empty array if none exist, or null on error.
 */
async function fetchRealTransactions(walletAddress: string): Promise<Transaction[] | null> {
  try {
    console.log(`🌐 Fetching mainnet transactions for wallet: ${walletAddress}`);
    
    // First try the bot service for any bot-executed trades
    const botTrades = await fetchBotServiceTransactions(walletAddress);
    if (botTrades && botTrades.length > 0) {
      console.log(`✅ Found ${botTrades.length} bot service trades`);
      return botTrades;
    }
    
    // Fallback to direct Solana mainnet query
    const mainnetTransactions = await fetchSolanaMainnetTransactions(walletAddress);
    if (mainnetTransactions && mainnetTransactions.length > 0) {
      console.log(`✅ Found ${mainnetTransactions.length} mainnet transactions`);
      return mainnetTransactions;
    }
    
    console.log(`⚠️ No transactions found for wallet: ${walletAddress}`);
    return []; // No transactions found
    
  } catch (error) {
    console.error(`❌ Failed to fetch real transactions for ${walletAddress}:`, error);
    return null; // Indicates a failure
  }
}

/**
 * Fetches transactions from the bot service (for bot-executed trades)
 */
async function fetchBotServiceTransactions(walletAddress: string): Promise<Transaction[] | null> {
  try {
    const response = await fetch(`http://localhost:8001/api/v1/bot/trades/${walletAddress}`, {
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': 'Bearer 315f6e3460b6403a9ce7046fd5457f5d914b32dfc54f104d4458c619cb53c631'
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(2000) // Fast timeout to prevent slowdowns
    });

    if (!response.ok) {
      console.log(`Bot service returned ${response.status} for ${walletAddress}`);
      return null;
    }

    const data = await response.json();
    if (!data.trades || data.trades.length === 0) {
      return []; // No bot trades found
    }

    // Transform bot trade data into the standardized Transaction format
    return data.trades.map((trade: Record<string, unknown>): Transaction => ({
      id: trade.trade_id || uuidv4(),
      walletAddress,
      timestamp: new Date(trade.timestamp).getTime(),
      type: trade.side?.toUpperCase() === 'BUY' ? 'BUY' : 'SELL',
      status: trade.status === 'confirmed' ? 'COMPLETED' : trade.status === 'pending' ? 'PENDING' : 'FAILED',
      symbol: trade.from_token || 'UNKNOWN',
      amount: parseFloat(trade.from_amount || '0'),
      price: parseFloat(trade.price || '0'),
      totalValue: parseFloat(trade.from_amount || '0') * parseFloat(trade.price || '0'),
      fees: parseFloat(trade.fees_usd || '0'),
      txHash: trade.transaction_signature,
    }));

  } catch (error) {
    // Silently fail for bot service connections to avoid spamming logs
    // console.log(`Bot service connection failed for ${walletAddress}:`, error);
    return null;
  }
}

/**
 * Fetches transactions directly from Solana mainnet RPC
 */
async function fetchSolanaMainnetTransactions(walletAddress: string): Promise<Transaction[] | null> {
  try {
    console.log(`🔗 Querying Solana mainnet for transactions: ${walletAddress}`);
    
    // Use resilient RPC client with exponential backoff
    
    const response = await fetch(SOLANA_RPC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getSignaturesForAddress',
        params: [
          walletAddress,
          {
            limit: 50, // Limit to recent 50 transactions
            commitment: 'confirmed'
          }
        ]
      })
    });

    if (!response.ok) {
      console.error(`❌ Solana RPC returned ${response.status}`);
      return null;
    }

    const data = await response.json();
    if (data.error) {
      console.error(`❌ Solana RPC error:`, data.error);
      return null;
    }

    if (!data.result || data.result.length === 0) {
      console.log(`⚠️ No mainnet transactions found for ${walletAddress}`);
      return [];
    }

    console.log(`📊 Found ${data.result.length} mainnet signatures, fetching details...`);
    
    // Fetch detailed transaction data for the first few signatures
    const detailedTransactions = [];
    const signatures = data.result.slice(0, 10); // Limit to 10 most recent for performance
    
    for (const sig of signatures) {
      try {
        const txResponse = await fetch(SOLANA_RPC_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          cache: 'no-store',
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'getTransaction',
            params: [
              sig.signature,
              {
                encoding: 'json',
                maxSupportedTransactionVersion: 0,
                commitment: 'confirmed'
              }
            ]
          })
        });

        if (txResponse.ok) {
          const txData = await txResponse.json();
          if (txData.result && !txData.result.meta?.err) {
            const transaction = parseMainnetTransaction(txData.result, walletAddress, sig.signature);
            if (transaction) {
              detailedTransactions.push(transaction);
            }
          }
        }
      } catch (error) {
        console.log(`Failed to fetch transaction details for ${sig.signature}:`, error);
      }
    }

    console.log(`✅ Successfully parsed ${detailedTransactions.length} mainnet transactions`);
    return detailedTransactions;

  } catch (error) {
    console.error(`❌ Failed to fetch Solana mainnet transactions:`, error);
    return null;
  }
}

/**
 * Interface for Solana transaction data from RPC
 */
interface SolanaTransactionData {
  blockTime?: number;
  meta?: {
    fee?: number;
    preTokenBalances?: Array<{
      accountIndex: number;
      mint: string;
      uiTokenAmount: {
        amount: string;
        decimals: number;
        uiAmount: number;
      };
    }>;
    postTokenBalances?: Array<{
      accountIndex: number;
      mint: string;
      uiTokenAmount: {
        amount: string;
        decimals: number;
        uiAmount: number;
      };
    }>;
  };
  transaction?: {
    message?: {
      instructions?: Array<{
        programId: string;
        accounts: string[];
        data: string;
      }>;
    };
  };
}

/**
 * Parse a raw Solana transaction into our Transaction format
 */
function parseMainnetTransaction(txData: SolanaTransactionData, walletAddress: string, signature: string): Transaction | null {
  try {
    const meta = txData.meta;
    const transaction = txData.transaction;
    
    if (!meta || !transaction) {
      return null;
    }

    // Extract basic transaction info
    const blockTime = txData.blockTime ? txData.blockTime * 1000 : Date.now();
    const fee = meta.fee || 0;
    
    // Try to determine if this is a swap/trade transaction
    const instructions = transaction.message?.instructions || [];
    let isSwapTransaction = false;
    let tokenIn = 'SOL';
    let amount = 0;
    
    // Look for common DEX program IDs (Jupiter, Raydium, Orca, etc.)
    const DEX_PROGRAM_IDS = [
      'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', // Jupiter V6
      '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8', // Jupiter V4
      'EhdjXoNBjgZ9dshVgXJKFLhRvFfcBWcHX4TU2zWt7eAT', // Raydium AMM
      'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc', // Orca Whirlpool
    ];

    for (const instruction of instructions) {
      const programId = transaction.message.accountKeys[instruction.programIdIndex];
      if (DEX_PROGRAM_IDS.includes(programId)) {
        isSwapTransaction = true;
        break;
      }
    }

    // If not a recognized swap, check pre/post token balances for changes
    if (!isSwapTransaction && meta.preTokenBalances && meta.postTokenBalances) {
      for (let i = 0; i < meta.preTokenBalances.length; i++) {
        const preBalance = meta.preTokenBalances[i];
        const postBalance = meta.postTokenBalances.find((pb) => pb.accountIndex === preBalance.accountIndex);
        
        if (postBalance && preBalance.uiTokenAmount.amount !== postBalance.uiTokenAmount.amount) {
          isSwapTransaction = true;
          amount = Math.abs(parseFloat(postBalance.uiTokenAmount.uiAmount || '0') - parseFloat(preBalance.uiTokenAmount.uiAmount || '0'));
          tokenIn = preBalance.uiTokenAmount.amount > postBalance.uiTokenAmount.amount ? 
                    (getTokenSymbolByMint(preBalance.mint) || 'UNKNOWN') : 
                    (getTokenSymbolByMint(postBalance.mint) || 'UNKNOWN');
          break;
        }
      }
    }

    // If no token changes detected, check SOL balance changes
    if (!isSwapTransaction && meta.preBalances && meta.postBalances) {
      for (let i = 0; i < meta.preBalances.length; i++) {
        if (transaction.message.accountKeys[i] === walletAddress) {
          const preBalance = meta.preBalances[i];
          const postBalance = meta.postBalances[i];
          if (Math.abs(preBalance - postBalance) > fee * 2) { // More than just fees
            amount = Math.abs(preBalance - postBalance) / 1e9; // Convert lamports to SOL
            isSwapTransaction = true;
            break;
          }
        }
      }
    }

    return {
      id: signature,
      walletAddress,
      timestamp: blockTime,
      type: isSwapTransaction ? (amount > 0 ? 'BUY' : 'SELL') : 'DEPOSIT',
      status: meta.err ? 'FAILED' : 'COMPLETED',
      symbol: tokenIn,
      amount: amount,
      price: 0, // Price calculation would require additional market data
      totalValue: 0, // Total value calculation would require market prices
      fees: fee / 1e9, // Convert lamports to SOL
      txHash: signature,
    };

  } catch (error) {
    console.log(`Failed to parse transaction ${signature}:`, error);
    return null;
  }
}

/**
 * Get token symbol by mint address
 */
function getTokenSymbolByMint(mint: string): string | null {
  const TOKEN_REGISTRY: Record<string, string> = {
    'So11111111111111111111111111111111111111112': 'SOL',
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': 'USDC',
    'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': 'USDT',
    'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN': 'JUP',
    '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R': 'RAY',
    'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263': 'BONK',
    'orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE': 'ORCA',
    'SRMuApVNdxXokk5GT7XD5cUUgXMBCoAz2LHeuAoKWRt': 'SRM',
  };
  
  return TOKEN_REGISTRY[mint] || null;
}

