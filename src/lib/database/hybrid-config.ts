/**
 * Hybrid Database Configuration
 * Manages connections to both Supabase (user data) and local PostgreSQL (quantitative data)
 */

import { createClient } from '@supabase/supabase-js';
import { Pool } from 'pg';

// Database configuration interface
interface HybridDatabaseConfig {
  supabase: {
    url: string;
    anonKey: string;
  };
  local: {
    connectionString: string;
  };
}

// Supabase tables (user-facing data)
export const SUPABASE_TABLES = {
  USER_SETTINGS: 'user_settings',
  BOT_STATES: 'bot_states',
  TRADES: 'trades',
} as const;

// Local PostgreSQL tables (sensitive quantitative data)
export const LOCAL_TABLES = {
  PARSED_RAYDIUM_SWAPS: 'parsed_raydium_swaps',
  TRADER_RANKINGS: 'trader_rankings',
  TOKEN_METADATA: 'token_metadata',
  DISCOVERED_TRADERS: 'discovered_traders',
} as const;

class HybridDatabaseService {
  private supabaseClient: ReturnType<typeof createClient> | null = null;
  private localPool: Pool | null = null;
  private config: HybridDatabaseConfig | null = null;

  /**
   * Initialize the hybrid database connections
   */
  initialize(config?: Partial<HybridDatabaseConfig>) {
    // Set up configuration
    this.config = {
      supabase: {
        url: config?.supabase?.url || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
        anonKey: config?.supabase?.anonKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
      },
      local: {
        connectionString: config?.local?.connectionString || 
          process.env.LOCAL_DATABASE_URL || 
          'postgresql://xorj:xorj_password@localhost:5432/xorj_quant',
      },
    };

    // Initialize Supabase client (for user data)
    if (this.config.supabase.url && this.config.supabase.anonKey) {
      this.supabaseClient = createClient(
        this.config.supabase.url,
        this.config.supabase.anonKey,
        {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
          },
          realtime: {
            params: {
              eventsPerSecond: 10,
            },
          },
        }
      );
      console.log('✅ Supabase client initialized');
    } else {
      console.warn('⚠️ Supabase credentials not configured');
    }

    // Initialize local PostgreSQL pool (for quantitative data)
    this.localPool = new Pool({
      connectionString: this.config.local.connectionString,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    this.localPool.on('error', (err) => {
      console.error('Local database pool error:', err);
    });

    console.log('✅ Local PostgreSQL pool initialized');
  }

  /**
   * Get Supabase client for user-facing operations
   */
  getSupabase() {
    if (!this.supabaseClient) {
      throw new Error('Supabase client not initialized. Call initialize() first.');
    }
    return this.supabaseClient;
  }

  /**
   * Get local database pool for quantitative operations
   */
  getLocalPool() {
    if (!this.localPool) {
      throw new Error('Local database pool not initialized. Call initialize() first.');
    }
    return this.localPool;
  }

  /**
   * Execute query on local database (for quantitative data)
   */
  async queryLocal<T = any>(query: string, params: any[] = []): Promise<T[]> {
    const pool = this.getLocalPool();
    try {
      const result = await pool.query(query, params);
      return result.rows;
    } catch (error) {
      console.error('Local database query error:', error);
      throw error;
    }
  }

  /**
   * Get user settings from Supabase
   */
  async getUserSettings(walletAddress: string) {
    const supabase = this.getSupabase();
    
    const { data, error } = await supabase
      .from(SUPABASE_TABLES.USER_SETTINGS)
      .select('*')
      .eq('wallet_address', walletAddress)
      .single();

    if (error) {
      console.error('Error fetching user settings:', error);
      return null;
    }

    return data;
  }

  /**
   * Update bot state in Supabase (with real-time broadcast)
   */
  async updateBotState(walletAddress: string, updates: any) {
    const supabase = this.getSupabase();

    const { data, error } = await supabase
      .from(SUPABASE_TABLES.BOT_STATES)
      .update({
        ...updates,
        last_updated: new Date().toISOString(),
      })
      .eq('user_wallet', walletAddress)
      .select()
      .single();

    if (error) {
      console.error('Error updating bot state:', error);
      return null;
    }

    return data;
  }

  /**
   * Get trader rankings from local database (sensitive data)
   */
  async getTraderRankings(limit: number = 100) {
    return this.queryLocal(`
      SELECT 
        wallet_address,
        trust_score,
        total_trades,
        win_rate,
        avg_profit_per_trade,
        ranking_position
      FROM trader_rankings
      WHERE is_active = true
      ORDER BY trust_score DESC
      LIMIT $1
    `, [limit]);
  }

  /**
   * Subscribe to real-time bot state changes
   */
  subscribeToBotStateChanges(
    walletAddress: string,
    callback: (payload: any) => void
  ) {
    const supabase = this.getSupabase();

    const subscription = supabase
      .channel(`bot-state-${walletAddress}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: SUPABASE_TABLES.BOT_STATES,
          filter: `user_wallet=eq.${walletAddress}`,
        },
        callback
      )
      .subscribe();

    return subscription;
  }

  /**
   * Subscribe to new trades for a wallet
   */
  subscribeToTrades(
    walletAddress: string,
    callback: (payload: any) => void
  ) {
    const supabase = this.getSupabase();

    const subscription = supabase
      .channel(`trades-${walletAddress}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: SUPABASE_TABLES.TRADES,
          filter: `user_vault_address=eq.${walletAddress}`,
        },
        callback
      )
      .subscribe();

    return subscription;
  }

  /**
   * Clean up connections
   */
  async cleanup() {
    if (this.localPool) {
      await this.localPool.end();
      console.log('Local database pool closed');
    }

    if (this.supabaseClient) {
      await this.supabaseClient.removeAllChannels();
      console.log('Supabase channels closed');
    }
  }
}

// Export singleton instance
export const hybridDB = new HybridDatabaseService();

// Helper function to determine which database to use
export function getDatabaseForTable(tableName: string): 'supabase' | 'local' {
  const supabaseTables = Object.values(SUPABASE_TABLES);
  const localTables = Object.values(LOCAL_TABLES);

  if (supabaseTables.includes(tableName as any)) {
    return 'supabase';
  } else if (localTables.includes(tableName as any)) {
    return 'local';
  } else {
    // Default to local for unknown tables (safer for sensitive data)
    console.warn(`Unknown table ${tableName}, defaulting to local database`);
    return 'local';
  }
}