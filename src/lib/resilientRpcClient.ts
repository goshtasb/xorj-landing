/**
 * Resilient RPC Client with Exponential Backoff
 * Implements retry logic for Solana RPC calls to handle rate limiting and transient failures
 * Follows PRD requirements for External Dependency Remediation
 */

import { Connection, ConnectionConfig } from '@solana/web3.js';

interface RetryableRpcError {
  code?: number;
  status?: number;
  message?: string;
}

interface RpcRequest {
  method: string;
  params?: any[];
  id?: string | number;
}

interface RpcResponse<T = any> {
  result?: T;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
  id?: string | number;
  jsonrpc: string;
}

export class ResilientRpcClient {
  private connection: Connection;
  private fallbackConnection?: Connection;
  private readonly MAX_RETRIES = 5;
  private readonly INITIAL_DELAY_MS = 1000; // 1 second
  private requestId = 0;

  constructor(
    rpcUrl: string, 
    config?: ConnectionConfig,
    fallbackRpcUrl?: string
  ) {
    this.connection = new Connection(rpcUrl, config || 'confirmed');
    
    if (fallbackRpcUrl) {
      this.fallbackConnection = new Connection(fallbackRpcUrl, config || 'confirmed');
    }
  }

  /**
   * Main retry wrapper with exponential backoff
   */
  async sendRpcRequestWithRetry<T>(
    requestDetails: RpcRequest
  ): Promise<T> {
    let currentDelay = this.INITIAL_DELAY_MS;
    
    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        console.log(`🔄 RPC Request attempt ${attempt}/${this.MAX_RETRIES}: ${requestDetails.method}`);
        
        // Attempt to send the actual RPC request
        const result = await this.sendActualRpcRequest<T>(requestDetails);
        
        if (attempt > 1) {
          console.log(`✅ RPC request succeeded on attempt ${attempt}`);
        }
        
        return result;
        
      } catch (error) {
        const isRetryable = this.isRetryableError(error);
        const isLastAttempt = attempt === this.MAX_RETRIES;
        
        if (isRetryable && !isLastAttempt) {
          console.warn(
            `⚠️ RPC request failed (Attempt ${attempt}/${this.MAX_RETRIES}). ` +
            `Error: ${this.getErrorMessage(error)}. ` +
            `Retrying in ${currentDelay}ms...`
          );
          
          await this.sleep(currentDelay);
          currentDelay *= 2; // Exponential backoff
          
        } else if (isLastAttempt) {
          // Try fallback connection on final attempt if available
          if (this.fallbackConnection && !requestDetails.method.includes('fallback')) {
            try {
              console.warn(`🔄 Final attempt: trying fallback RPC endpoint`);
              const fallbackRequest = { 
                ...requestDetails, 
                method: `${requestDetails.method}_fallback` 
              };
              return await this.sendFallbackRequest<T>(fallbackRequest);
            } catch (fallbackError) {
              console.error(`❌ Fallback RPC also failed:`, fallbackError);
            }
          }
          
          // All retries exhausted
          throw new Error(
            `RPC request failed after ${this.MAX_RETRIES} attempts. ` +
            `Last error: ${this.getErrorMessage(error)}`
          );
        } else {
          // Not a retryable error, fail immediately
          throw error;
        }
      }
    }
    
    throw new Error('Unexpected end of retry loop');
  }

  /**
   * Send actual RPC request to primary endpoint
   */
  private async sendActualRpcRequest<T>(requestDetails: RpcRequest): Promise<T> {
    const rpcEndpoint = this.connection.rpcEndpoint;
    
    const payload = {
      jsonrpc: '2.0',
      id: requestDetails.id || this.generateRequestId(),
      method: requestDetails.method,
      params: requestDetails.params || []
    };

    const response = await fetch(rpcEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    // Check for HTTP-level errors
    if (!response.ok) {
      const errorData: RetryableRpcError = {
        status: response.status,
        message: `HTTP ${response.status}: ${response.statusText}`
      };
      throw errorData;
    }

    const rpcResponse: RpcResponse<T> = await response.json();
    
    // Check for RPC-level errors
    if (rpcResponse.error) {
      const errorData: RetryableRpcError = {
        code: rpcResponse.error.code,
        message: rpcResponse.error.message
      };
      throw errorData;
    }

    return rpcResponse.result as T;
  }

  /**
   * Send request to fallback endpoint
   */
  private async sendFallbackRequest<T>(requestDetails: RpcRequest): Promise<T> {
    if (!this.fallbackConnection) {
      throw new Error('No fallback connection available');
    }

    // Use the fallback connection's built-in methods where possible
    // This is a simplified fallback - in practice, you'd map specific methods
    const rpcEndpoint = this.fallbackConnection.rpcEndpoint;
    
    const payload = {
      jsonrpc: '2.0',
      id: this.generateRequestId(),
      method: requestDetails.method.replace('_fallback', ''),
      params: requestDetails.params || []
    };

    const response = await fetch(rpcEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Fallback HTTP ${response.status}: ${response.statusText}`);
    }

    const rpcResponse: RpcResponse<T> = await response.json();
    
    if (rpcResponse.error) {
      throw new Error(`Fallback RPC error: ${rpcResponse.error.message}`);
    }

    return rpcResponse.result as T;
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: unknown): boolean {
    const err = error as RetryableRpcError;
    const statusCode = err.status || err.code;
    const message = this.getErrorMessage(error).toLowerCase();
    
    // HTTP status codes that are retryable
    const retryableHttpCodes = [429, 500, 502, 503, 504];
    
    // RPC error codes that are retryable
    const retryableRpcCodes = [-32005, -32002]; // Node behind, transaction not found (temporary)
    
    if (statusCode && (
      retryableHttpCodes.includes(statusCode) ||
      retryableRpcCodes.includes(statusCode)
    )) {
      return true;
    }

    // Message-based detection
    const retryableMessages = [
      'too many requests',
      'rate limit',
      'service unavailable',
      'gateway timeout',
      'internal server error',
      'temporary failure',
      'timeout',
      'connection reset',
      'network error'
    ];

    return retryableMessages.some(msg => message.includes(msg));
  }

  /**
   * Extract error message from various error types
   */
  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    
    const err = error as RetryableRpcError;
    return err.message || JSON.stringify(error) || 'Unknown error';
  }

  /**
   * Sleep utility for exponential backoff
   */
  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): number {
    return ++this.requestId;
  }

  /**
   * Get the underlying Connection object for direct access
   */
  getConnection(): Connection {
    return this.connection;
  }

  /**
   * Get fallback connection if available
   */
  getFallbackConnection(): Connection | undefined {
    return this.fallbackConnection;
  }

  /**
   * Wrapper for common Solana RPC methods with retry logic
   */
  async getAccountInfo(publicKeyString: string): Promise<any> {
    return this.sendRpcRequestWithRetry({
      method: 'getAccountInfo',
      params: [publicKeyString, { encoding: 'base64' }]
    });
  }

  async getBalance(publicKeyString: string): Promise<number> {
    const result = await this.sendRpcRequestWithRetry<{ value: number }>({
      method: 'getBalance',
      params: [publicKeyString]
    });
    return result.value;
  }

  async getTokenAccountsByOwner(ownerPublicKey: string, mintPublicKey: string): Promise<any> {
    return this.sendRpcRequestWithRetry({
      method: 'getTokenAccountsByOwner',
      params: [
        ownerPublicKey,
        { mint: mintPublicKey },
        { encoding: 'jsonParsed' }
      ]
    });
  }

  async getSignaturesForAddress(address: string, options?: any): Promise<any> {
    return this.sendRpcRequestWithRetry({
      method: 'getSignaturesForAddress',
      params: [address, options || {}]
    });
  }

  async getTransaction(signature: string, options?: any): Promise<any> {
    return this.sendRpcRequestWithRetry({
      method: 'getTransaction',
      params: [signature, options || { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }]
    });
  }
}

// Export singleton instance with Helius as primary and public RPC as fallback
const HELIUS_API_KEY = process.env.HELIUS_API_KEY || process.env.NEXT_PUBLIC_HELIUS_API_KEY;
const PRIMARY_RPC_URL = HELIUS_API_KEY 
  ? `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`
  : 'https://api.mainnet-beta.solana.com';

const FALLBACK_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

export const resilientRpcClient = new ResilientRpcClient(
  PRIMARY_RPC_URL,
  'confirmed',
  FALLBACK_RPC_URL
);

export default ResilientRpcClient;