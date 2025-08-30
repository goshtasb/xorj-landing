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

// FIX (NFR-1): Mark the route handler as dynamic to prevent static rendering and ensure
// it runs on the server for every request, respecting cache-control headers.
export const dynamic = 'force-dynamic';

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
 * Fetches real transaction data from the backend bot service.
 * Returns an array of transactions, an empty array if none exist, or null on error.
 */
async function fetchRealTransactions(walletAddress: string): Promise<Transaction[] | null> {
  try {
    // FIX (NFR-1): Add { cache: 'no-store' } to prevent Next.js from caching this server-side fetch.
    // This is the critical fix for the frontend not updating.
    const response = await fetch(`http://localhost:8000/api/v1/bot/trades/${walletAddress}`, {
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
    });

    if (!response.ok) {
      console.error(`Bot trades API returned non-OK status: ${response.status} for ${walletAddress}`);
      return null;
    }

    const data = await response.json();
    if (!data.trades || data.trades.length === 0) {
      return []; // No trades found is a valid state, not an error.
    }

    // Transform raw trade data into the standardized Transaction format.
    return data.trades.map((trade: Record<string, unknown>): Transaction => ({
      id: trade.trade_id || uuidv4(),
      walletAddress,
      timestamp: new Date(trade.timestamp).getTime(),
      // FIX (FR-1): Use the actual trade side from the API. Fallback to a deterministic method.
      type: trade.side?.toUpperCase() === 'BUY' ? 'BUY' : 'SELL',
      status: trade.status === 'confirmed' ? 'COMPLETED' : trade.status === 'pending' ? 'PENDING' : 'FAILED',
      symbol: trade.from_token,
      amount: parseFloat(trade.from_amount),
      price: parseFloat(trade.price),
      totalValue: parseFloat(trade.from_amount) * parseFloat(trade.price),
      fees: parseFloat(trade.fees_usd),
      txHash: trade.transaction_signature,
    }));

  } catch {
    console.error(`Bot trades API connection failed for ${walletAddress}:`);
    return null; // Indicates a failure to connect to the service.
  }
}

