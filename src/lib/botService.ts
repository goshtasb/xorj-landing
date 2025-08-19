/**
 * XORJ Trade Execution Bot Service Client
 * Handles communication with the Python FastAPI bot service
 */

import { BotStatus, BotConfiguration, BotTradesResponse, EmergencyAction, EmergencyResponse } from '@/types/bot';

// Bot service configuration
const BOT_SERVICE_URL = process.env.NEXT_PUBLIC_BOT_SERVICE_URL || 'http://localhost:8000';
const BOT_SERVICE_API_KEY = process.env.BOT_SERVICE_API_KEY || 'development-key';

interface BotServiceError extends Error {
  status?: number;
  code?: string;
}

class BotServiceClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(baseUrl: string = BOT_SERVICE_URL, apiKey: string = BOT_SERVICE_API_KEY) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
  }

  private async makeRequest<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const headers = {
      'Content-Type': 'application/json',
      'X-API-Key': this.apiKey,
      ...options.headers,
    };

    try {
      console.log(`🤖 Bot Service Request: ${options.method || 'GET'} ${url}`);
      
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
      console.log(`✅ Bot Service Response: ${endpoint}`, data);
      return data;

    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') {
        console.error(`⏱️ Bot Service Timeout: ${endpoint}`);
        throw new Error('Bot service request timed out');
      }
      
      if (error instanceof Error && error.message.includes('fetch')) {
        console.error(`🚫 Bot Service Connection Error: ${endpoint}`, error.message);
        throw new Error('Unable to connect to bot service. Please ensure the bot is running.');
      }
      
      console.error(`❌ Bot Service Error: ${endpoint}`, error);
      throw error;
    }
  }

  /**
   * Get bot status and configuration
   */
  async getBotStatus(userId: string): Promise<BotStatus> {
    return this.makeRequest<BotStatus>(`/api/v1/bot/status/${userId}`);
  }

  /**
   * Update bot configuration
   */
  async updateBotConfiguration(
    userId: string, 
    configuration: Partial<BotConfiguration>
  ): Promise<{ success: boolean; message: string }> {
    return this.makeRequest(`/api/v1/bot/configuration/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(configuration),
    });
  }

  /**
   * Get trade execution history
   */
  async getBotTrades(
    userId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<BotTradesResponse> {
    const params = new URLSearchParams({
      limit: limit.toString(),
      offset: offset.toString(),
    });
    
    return this.makeRequest<BotTradesResponse>(`/api/v1/bot/trades/${userId}?${params}`);
  }

  /**
   * Execute emergency action (pause, resume, kill switch)
   */
  async executeEmergencyAction(action: EmergencyAction): Promise<EmergencyResponse> {
    return this.makeRequest<EmergencyResponse>('/api/v1/bot/emergency', {
      method: 'POST',
      body: JSON.stringify(action),
    });
  }

  /**
   * Get emergency status
   */
  async getEmergencyStatus(userId: string): Promise<any> {
    return this.makeRequest(`/api/v1/bot/emergency/status/${userId}`);
  }

  /**
   * Health check - test connection to bot service
   */
  async healthCheck(): Promise<{ status: string; version: string; timestamp: string }> {
    return this.makeRequest('/health');
  }

  /**
   * Start bot for a user
   */
  async startBot(userId: string, configuration: BotConfiguration): Promise<{ success: boolean; message: string }> {
    return this.makeRequest(`/api/v1/bot/start/${userId}`, {
      method: 'POST',
      body: JSON.stringify(configuration),
    });
  }

  /**
   * Stop bot for a user
   */
  async stopBot(userId: string): Promise<{ success: boolean; message: string }> {
    return this.makeRequest(`/api/v1/bot/stop/${userId}`, {
      method: 'POST',
    });
  }
}

// Export singleton instance
export const botService = new BotServiceClient();

/**
 * Check if bot service is available
 */
export async function checkBotServiceHealth(): Promise<boolean> {
  try {
    await botService.healthCheck();
    return true;
  } catch (error) {
    console.warn('Bot service health check failed:', error);
    return false;
  }
}

/**
 * Gracefully handle bot service errors
 */
export function isBotServiceError(error: unknown): error is BotServiceError {
  return error instanceof Error && 'status' in error;
}

export default botService;