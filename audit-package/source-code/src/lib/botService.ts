/**
 * XORJ Trade Execution Bot Service Client - SECURE API GATEWAY
 * 
 * CRITICAL SECURITY UPDATE: This client now routes ALL bot communication through
 * the secure FastAPI gateway instead of directly to the bot service.
 * 
 * Architecture:
 * Frontend -> Next.js API -> FastAPI Gateway -> Internal Bot Service
 * 
 * This eliminates the security vulnerability of exposing the bot service directly
 * to the internet and creates a single, hardened entry point to the infrastructure.
 */

import { BotStatus, BotConfiguration, BotTradesResponse, EmergencyAction, EmergencyResponse } from '@/types/bot';

// SECURE API GATEWAY configuration - Frontend talks to Next.js API routes which proxy to FastAPI gateway
// This ensures proper session handling and server-side authentication
const API_BASE_URL = '/api';

// Authentication interfaces
interface AuthRequest {
  wallet_address: string;
  signature: string;
  message: string;
}

interface AuthResponse {
  success: boolean;
  session_token: string;
  expires_at: string;
  user_id: string;
}

interface EmergencyActionRequest {
  action: 'pause' | 'resume' | 'kill_switch';
  reason?: string;
}

interface BotServiceError extends Error {
  status?: number;
  code?: string;
}

class BotServiceClient {
  private gatewayUrl: string;
  private sessionToken: string | null = null;

  constructor(apiBaseUrl: string = API_BASE_URL) {
    this.gatewayUrl = apiBaseUrl;
    this.loadSessionToken();
  }

  /**
   * Load session token from localStorage
   */
  private loadSessionToken(): void {
    if (typeof window !== 'undefined') {
      this.sessionToken = localStorage.getItem('xorj_session_token');
    }
  }

  /**
   * Store session token in localStorage
   */
  private storeSessionToken(token: string): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem('xorj_session_token', token);
      this.sessionToken = token;
    }
  }

  /**
   * Clear session token from localStorage
   */
  private clearSessionToken(): void {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('xorj_session_token');
      this.sessionToken = null;
    }
  }

  private async makeRequest<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.gatewayUrl}${endpoint}`;
    
    // Check if session token is available
    if (!this.sessionToken && !endpoint.includes('/auth/')) {
      throw new Error('No session token available. Please authenticate first.');
    }
    
    const headers = {
      'Content-Type': 'application/json',
      'X-Request-ID': `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ...options.headers,
    };
    
    // Add session token for authenticated endpoints
    if (this.sessionToken && !endpoint.includes('/auth/')) {
      headers['Authorization'] = `Bearer ${this.sessionToken}`;
    }

    try {
      console.log(`🔒 Secure Gateway Request: ${options.method || 'GET'} ${url}`);
      
      const response = await fetch(url, {
        ...options,
        headers,
        // Add timeout for bot service requests
        signal: AbortSignal.timeout(10000), // 10 second timeout
      });

      if (!response.ok) {
        const error = new Error(`Bot service error: ${response.status} ${response.statusText}`) as BotServiceError;
        error.status = response.status;
        
        try {
          const errorData = await response.json();
          error.message = errorData.detail || error.message;
          error.code = errorData.code;
        } catch {
          // If we can't parse error JSON, use the response status text
        }
        
        throw error;
      }

      const data = await response.json();
      console.log(`✅ Secure Gateway Response: ${endpoint}`, data);
      return data;

    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') {
        console.error(`⏱️ Secure Gateway Timeout: ${endpoint}`);
        throw new Error('Secure gateway request timed out');
      }
      
      if (error instanceof Error && error.message.includes('fetch')) {
        console.error(`🚫 Secure Gateway Connection Error: ${endpoint}`, error.message);
        throw new Error('Unable to connect to secure gateway. Please ensure the FastAPI service is running.');
      }
      
      console.error(`❌ Secure Gateway Error: ${endpoint}`, error);
      throw error;
    }
  }

  /**
   * Authenticate user with wallet and get session token
   */
  async authenticate(walletAddress: string, signature: string = 'mock_signature', message: string = 'XORJ Authentication'): Promise<AuthResponse> {
    const authRequest: AuthRequest = {
      wallet_address: walletAddress,
      signature,
      message
    };

    const response = await this.makeRequest<AuthResponse>('/auth/authenticate', {
      method: 'POST',
      body: JSON.stringify(authRequest)
    });

    if (response.success) {
      this.storeSessionToken(response.session_token);
    }

    return response;
  }

  /**
   * Get bot status and configuration through secure gateway
   * NO manual user_id parameter - extracted from session token
   */
  async getBotStatus(): Promise<BotStatus> {
    return this.makeRequest<BotStatus>('/bot/status');
  }

  /**
   * Get current bot configuration through secure gateway
   * NO manual user_id parameter - extracted from session token
   */
  async getBotConfiguration(): Promise<BotConfiguration> {
    return this.makeRequest<BotConfiguration>('/bot/configuration');
  }

  /**
   * Update full bot configuration through secure gateway
   * NO manual user_id parameter - extracted from session token
   * Use this for comprehensive configuration changes (risk profile, slippage, etc.)
   */
  async updateBotConfiguration(
    configuration: Partial<BotConfiguration>
  ): Promise<{ success: boolean; message: string }> {
    return this.makeRequest('/bot/configuration', {
      method: 'PUT',
      body: JSON.stringify(configuration),
    });
  }

  /**
   * Update investment amount for bot trading
   * Validates amount and updates the max_trade_amount configuration
   */
  async updateInvestmentAmount(amount: number): Promise<{ success: boolean; message: string }> {
    // Validate investment amount
    if (!this.validateInvestmentAmount(amount)) {
      return {
        success: false,
        message: 'Invalid investment amount. Must be between $1 and $1,000,000'
      };
    }

    console.log(`💰 Updating bot investment amount to: $${amount}`);
    
    return this.updateBotConfiguration({
      max_trade_amount: amount
    });
  }

  /**
   * Validate investment amount range
   */
  private validateInvestmentAmount(amount: number): boolean {
    return typeof amount === 'number' && 
           amount >= 1 && 
           amount <= 1000000 && 
           Number.isFinite(amount);
  }

  /**
   * Enable bot through secure gateway - simple activation
   * NO manual user_id parameter - extracted from session token
   * Use this for quick bot activation without changing other settings
   */
  async enableBot(): Promise<{ success: boolean; message: string; enabled: boolean }> {
    return this.makeRequest('/bot/enable', {
      method: 'POST',
    });
  }

  /**
   * Disable bot through secure gateway - simple deactivation
   * NO manual user_id parameter - extracted from session token
   * Use this for quick bot deactivation without changing other settings
   */
  async disableBot(): Promise<{ success: boolean; message: string; enabled: boolean }> {
    return this.makeRequest('/bot/disable', {
      method: 'POST',
    });
  }

  /**
   * Get trade execution history through secure gateway
   * NO manual user_id parameter - extracted from session token
   */
  async getBotTrades(
    limit: number = 50,
    offset: number = 0
  ): Promise<BotTradesResponse> {
    const params = new URLSearchParams({
      limit: limit.toString(),
      offset: offset.toString(),
    });
    
    return this.makeRequest<BotTradesResponse>(`/bot/trades?${params}`);
  }

  /**
   * Execute emergency action through secure gateway
   * NO manual user_id parameter - extracted from session token
   */
  async executeEmergencyAction(action: Omit<EmergencyAction, 'user_id'>): Promise<EmergencyResponse> {
    const actionRequest: EmergencyActionRequest = {
      action: action.action as 'pause' | 'resume' | 'kill_switch',
      reason: action.reason
    };

    return this.makeRequest<EmergencyResponse>('/bot/emergency', {
      method: 'POST',
      body: JSON.stringify(actionRequest),
    });
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return !!this.sessionToken;
  }

  /**
   * Logout user and clear session
   */
  logout(): void {
    this.clearSessionToken();
  }

  /**
   * Health check - test connection to secure gateway and bot service
   * Requires authentication
   */
  async healthCheck(): Promise<{ status: string; version: string; timestamp: string }> {
    return this.makeRequest('/bot/health');
  }

  /**
   * @deprecated Use enableBot() instead - simpler and more reliable
   * Start bot through secure gateway
   */
  async startBot(configuration: BotConfiguration): Promise<{ success: boolean; message: string }> {
    console.warn('startBot() is deprecated. Use enableBot() for simple activation or updateBotConfiguration() + enableBot() for configuration changes.');
    return this.makeRequest('/bot/start', {
      method: 'POST',
      body: JSON.stringify(configuration),
    });
  }

  /**
   * @deprecated Use disableBot() instead - simpler and more reliable
   * Stop bot through secure gateway
   */
  async stopBot(): Promise<{ success: boolean; message: string }> {
    console.warn('stopBot() is deprecated. Use disableBot() for simple deactivation.');
    return this.makeRequest('/bot/stop', {
      method: 'POST',
    });
  }
}

// Export singleton instance
export const botService = new BotServiceClient();

/**
 * Check if secure gateway and bot service are available
 * Requires user authentication
 */
export async function checkBotServiceHealth(): Promise<boolean> {
  try {
    if (!botService.isAuthenticated()) {
      return false;
    }
    await botService.healthCheck();
    return true;
  } catch (error) {
    console.warn('Secure gateway or bot service health check failed:', error);
    return false;
  }
}

/**
 * Authenticate user with current wallet
 */
export async function authenticateWithWallet(walletAddress: string): Promise<AuthResponse> {
  return botService.authenticate(walletAddress);
}

/**
 * Check if user is authenticated
 */
export function isAuthenticated(): boolean {
  return botService.isAuthenticated();
}

/**
 * Logout user
 */
export function logout(): void {
  return botService.logout();
}

/**
 * Get current bot configuration
 */
export async function getBotConfiguration() {
  return botService.getBotConfiguration();
}

/**
 * Update full bot configuration (risk profile, slippage, etc.)
 */
export async function updateBotConfiguration(configuration: Partial<BotConfiguration>) {
  return botService.updateBotConfiguration(configuration);
}

/**
 * Enable bot - simple activation without changing other settings
 */
export async function enableBot() {
  return botService.enableBot();
}

/**
 * Disable bot - simple deactivation without changing other settings
 */
export async function disableBot() {
  return botService.disableBot();
}

/**
 * Toggle bot enabled state
 */
export async function toggleBot(enable: boolean) {
  return enable ? botService.enableBot() : botService.disableBot();
}

/**
 * Get bot trades with pagination
 */
export async function getBotTrades(limit: number = 50, offset: number = 0) {
  return botService.getBotTrades(limit, offset);
}

/**
 * Execute emergency action
 */
export async function executeEmergencyAction(action: Omit<EmergencyAction, 'user_id'>) {
  return botService.executeEmergencyAction(action);
}

/**
 * Update investment amount
 */
export async function updateInvestmentAmount(amount: number) {
  return botService.updateInvestmentAmount(amount);
}

/**
 * Gracefully handle bot service errors
 */
export function isBotServiceError(error: unknown): error is BotServiceError {
  return error instanceof Error && 'status' in error;
}

export default botService;