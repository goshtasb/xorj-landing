/**
 * Mock Database Service for Development
 * Provides in-memory storage when PostgreSQL is not available
 */

import { 
  ServiceResponse,
  UserSettings,
  CreateUserSettingsData,
  UpdateUserSettingsData,
  BotState,
  CreateBotStateData,
  UpdateBotStateData,
  Trade,
  CreateTradeData,
  TradeFilters
} from '../types/database';

// In-memory storage
const mockUserSettings = new Map<string, UserSettings>();
const mockBotStates = new Map<string, BotState>();
const mockTrades = new Map<string, Trade>();

let isConnected = false;

// Auto-initialize mock database in development when needed
// Removed auto-initialization to prevent blocking on app start

export const mockDatabaseService = {
  /**
   * Initialize mock database
   */
  initialize(): boolean {
    console.log('📦 Using mock database for development');
    isConnected = true;
    return true;
  },

  /**
   * Check if database is connected
   */
  isConnected(): boolean {
    return isConnected;
  },

  /**
   * User Settings Mock Service
   */
  userSettings: {
    async getOrCreate(walletAddress: string): Promise<ServiceResponse<UserSettings>> {
      try {
        if (!isConnected) {
          console.log('📦 Auto-initializing mock database on first use');
          isConnected = true;
        }
        
        let settings = mockUserSettings.get(walletAddress);
        
        if (!settings) {
          // Create default settings
          settings = {
            id: `mock_${Date.now()}`,
            wallet_address: walletAddress,
            risk_profile: 'Balanced',
            settings: {
              maxDrawdownLimit: 15,
              positionSizePercent: 5,
              stopLossEnabled: true,
              takeProfitEnabled: true
            },
            created_at: new Date(),
            updated_at: new Date()
          };
          mockUserSettings.set(walletAddress, settings);
        }

        return {
          success: true,
          data: settings,
          message: 'Settings retrieved from mock database'
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    },

    async update(walletAddress: string, data: UpdateUserSettingsData): Promise<ServiceResponse<UserSettings>> {
      try {
        let settings = mockUserSettings.get(walletAddress);
        
        if (!settings) {
          // Create if doesn't exist
          settings = {
            id: `mock_${Date.now()}`,
            wallet_address: walletAddress,
            risk_profile: data.risk_profile || 'Balanced',
            settings: data.settings || {},
            created_at: new Date(),
            updated_at: new Date()
          };
        } else {
          // Update existing
          if (data.risk_profile) settings.risk_profile = data.risk_profile;
          if (data.settings) settings.settings = { ...settings.settings, ...data.settings };
          settings.updated_at = new Date();
        }
        
        mockUserSettings.set(walletAddress, settings);

        return {
          success: true,
          data: settings,
          message: 'Settings updated in mock database'
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    }
  },

  /**
   * Bot State Mock Service
   */
  botState: {
    async getOrCreate(userId: string): Promise<ServiceResponse<BotState>> {
      try {
        let botState = mockBotStates.get(userId);
        
        if (!botState) {
          // Create default bot state
          botState = {
            id: `mock_${Date.now()}`,
            user_id: userId,
            enabled: true,
            last_updated: new Date(),
            configuration: { enabled: true },
            created_at: new Date(),
            updated_at: new Date()
          };
          mockBotStates.set(userId, botState);
        }

        return {
          success: true,
          data: botState,
          message: 'Bot state retrieved from mock database'
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    },

    async update(userId: string, data: UpdateBotStateData): Promise<ServiceResponse<BotState>> {
      try {
        let botState = mockBotStates.get(userId);
        
        if (!botState) {
          // Create if doesn't exist
          botState = {
            id: `mock_${Date.now()}`,
            user_id: userId,
            enabled: data.enabled ?? true,
            last_updated: new Date(),
            configuration: data.configuration || { enabled: data.enabled ?? true },
            created_at: new Date(),
            updated_at: new Date()
          };
        } else {
          // Update existing
          if (data.enabled !== undefined) botState.enabled = data.enabled;
          if (data.configuration) botState.configuration = { ...botState.configuration, ...data.configuration };
          botState.last_updated = new Date();
          botState.updated_at = new Date();
        }
        
        mockBotStates.set(userId, botState);

        return {
          success: true,
          data: botState,
          message: 'Bot state updated in mock database'
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    }
  },

  /**
   * Trades Mock Service
   */
  trades: {
    async getAll(filters?: TradeFilters): Promise<ServiceResponse<Trade[]>> {
      try {
        let trades = Array.from(mockTrades.values());
        
        // Apply filters
        if (filters?.user_vault_address) {
          trades = trades.filter(t => t.user_vault_address === filters.user_vault_address);
        }
        
        if (filters?.status) {
          trades = trades.filter(t => t.status === filters.status);
        }
        
        // Sort by creation date (newest first)
        trades.sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
        
        // Apply pagination
        const limit = filters?.limit || 50;
        const offset = filters?.offset || 0;
        trades = trades.slice(offset, offset + limit);

        return {
          success: true,
          data: trades,
          message: `Retrieved ${trades.length} trades from mock database`
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    },

    async create(data: CreateTradeData): Promise<ServiceResponse<Trade>> {
      try {
        // Check for duplicate client_order_id to simulate database constraint
        const existingTrade = Array.from(mockTrades.values()).find(
          t => t.user_vault_address === data.user_vault_address && 
               t.client_order_id === data.client_order_id
        );
        
        if (existingTrade) {
          // Simulate PostgreSQL SQLSTATE 23505 unique constraint violation
          const mockError = new Error('duplicate key value violates unique constraint "trade_idempotency_key"');
          (mockError as any).code = '23505';
          (mockError as any).constraint = 'trade_idempotency_key';
          throw mockError;
        }

        const trade: Trade = {
          id: `mock_trade_${Date.now()}`,
          job_id: data.job_id,
          user_vault_address: data.user_vault_address,
          client_order_id: data.client_order_id,
          status: data.status,
          from_token_address: data.from_token_address,
          to_token_address: data.to_token_address,
          amount_in: data.amount_in,
          expected_amount_out: data.expected_amount_out,
          actual_amount_out: undefined,
          transaction_signature: undefined,
          slippage_realized: undefined,
          gas_fee: undefined,
          error_message: undefined,
          created_at: new Date(),
          updated_at: new Date()
        };
        
        mockTrades.set(trade.id, trade);

        return {
          success: true,
          data: trade,
          message: 'Trade created in mock database'
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    }
  }
};