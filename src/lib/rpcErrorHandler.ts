/**
 * Global RPC Error Handler
 * Prevents Solana RPC 403/429 errors from disrupting the user experience
 */

interface RpcError {
  code?: number;
  message?: string;
  data?: Record<string, unknown>;
}

class RpcErrorHandler {
  private errorCounts: Map<string, number> = new Map();
  private lastErrorTime: Map<string, number> = new Map();
  private readonly ERROR_COOLDOWN = 60000; // 1 minute cooldown between similar errors

  /**
   * Handle RPC errors gracefully
   */
  handleRpcError(error: unknown, context?: string): boolean {
    const errorKey = this.getErrorKey(error);
    const now = Date.now();
    const lastTime = this.lastErrorTime.get(errorKey) || 0;
    
    // Skip logging if we've seen this error recently (avoid spam)
    if (now - lastTime < this.ERROR_COOLDOWN) {
      return true; // Handled silently
    }

    this.lastErrorTime.set(errorKey, now);
    const count = this.errorCounts.get(errorKey) || 0;
    this.errorCounts.set(errorKey, count + 1);

    if (this.isRateLimitError(error)) {
      console.warn(
        `⚠️ Solana RPC rate limited ${context ? `in ${context}` : ''} - using public endpoint. ` +
        `Consider upgrading to a dedicated RPC provider for better reliability. ` +
        `(${count + 1} times total)`
      );
      return true; // Handled
    }

    if (this.isNetworkError(error)) {
      console.warn(`⚠️ Network error ${context ? `in ${context}` : ''}: ${this.getErrorMessage(error)}`);
      return true; // Handled
    }

    return false; // Not handled, let it bubble up
  }

  private isRateLimitError(error: unknown): boolean {
    const code = (error as RpcError)?.code || (error as RpcError & { status?: number })?.status;
    const message = this.getErrorMessage(error).toLowerCase();
    
    return (
      code === 403 || 
      code === 429 ||
      message.includes('403') ||
      message.includes('429') ||
      message.includes('forbidden') ||
      message.includes('rate limit') ||
      message.includes('too many requests')
    );
  }

  private isNetworkError(error: unknown): boolean {
    const message = this.getErrorMessage(error).toLowerCase();
    return (
      message.includes('network') ||
      message.includes('timeout') ||
      message.includes('connection') ||
      message.includes('fetch')
    );
  }

  private getErrorMessage(error: unknown): string {
    return (error as Error)?.message || (error as Error)?.toString() || 'Unknown error';
  }

  private getErrorKey(error: unknown): string {
    const code = (error as RpcError)?.code || (error as RpcError & { status?: number })?.status || 'unknown';
    const message = this.getErrorMessage(error);
    return `${code}:${message.substring(0, 50)}`;
  }

  /**
   * Get current error statistics
   */
  getErrorStats(): Record<string, number> {
    return Object.fromEntries(this.errorCounts);
  }

  /**
   * Reset error tracking
   */
  resetStats(): void {
    this.errorCounts.clear();
    this.lastErrorTime.clear();
  }
}

// Export singleton instance
export const rpcErrorHandler = new RpcErrorHandler();

// Global error handler for unhandled promise rejections
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    if (rpcErrorHandler.handleRpcError(event.reason, 'unhandled promise')) {
      event.preventDefault(); // Prevent default error logging
    }
  });

  // Override console.error to catch RPC errors
  const originalConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    // Check if this looks like an RPC error
    const errorString = args.join(' ');
    if (
      errorString.includes('403') && 
      errorString.includes('solana') ||
      errorString.includes('jsonrpc')
    ) {
      // Handle RPC error silently
      rpcErrorHandler.handleRpcError({ message: errorString }, 'console');
      return; // Don't log to console
    }
    
    // Log other errors normally
    originalConsoleError.apply(console, args);
  };
}

export default rpcErrorHandler;