export interface BotStatus {
  user_id: string;
  status: 'active' | 'paused' | 'stopped' | 'error';
  last_execution: string;
  health_score: number;
  circuit_breakers: {
    [key: string]: {
      status: 'closed' | 'open' | 'half_open';
      failure_count?: number;
      threshold?: number;
      last_check?: string;
      rejection_count?: number;
      error_count?: number;
      timeout_count?: number;
    };
  };
  kill_switch_active: boolean;
  configuration: BotConfiguration;
  performance: BotPerformance;
  // Frontend compatibility properties
  isBotActive?: boolean; // Computed from status === 'active' && configuration.enabled
  vaultAddress?: string; // Alias for user_vault_address
}

export interface BotConfiguration {
  risk_profile: 'conservative' | 'balanced' | 'aggressive';
  slippage_tolerance: number;
  enabled: boolean;
  max_trade_amount: number;
  updated_at?: string;
}

export interface BotPerformance {
  total_trades: number;
  successful_trades: number;
  success_rate: number;
  average_slippage: number;
  total_volume_usd: number;
}

export interface BotTrade {
  trade_id: string;
  timestamp: string;
  from_token: string;
  to_token: string;
  from_amount: number;
  to_amount: number;
  status: 'confirmed' | 'failed' | 'pending';
  transaction_signature: string;
  slippage_realized: number;
  execution_time_ms: number;
  rationale: string;
  risk_score: number;
}

export interface BotTradesResponse {
  user_id: string;
  trades: BotTrade[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
    has_more: boolean;
  };
  summary: BotPerformance;
}

export interface EmergencyAction {
  action: 'kill_switch' | 'pause' | 'resume';
  user_id: string;
  reason?: string;
  authorization_key?: string;
}

export interface EmergencyResponse {
  action: string;
  status: string;
  user_id: string;
  reason?: string;
  timestamp: string;
  authorization_key?: string;
  bot_status: string;
  message: string;
  recovery_instructions?: string;
  health_check?: {
    circuit_breakers: string;
    kill_switch: string;
    system_health: string;
  };
}

export interface EmergencyStatus {
  user_id: string;
  kill_switch_active: boolean;
  bot_status: string;
  circuit_breakers_status: {
    any_open: boolean;
    open_breakers: string[];
  };
  last_emergency_action: EmergencyResponse | null;
  emergency_contacts: {
    enabled: boolean;
    email: string;
    phone: string;
  };
  recovery_options: string[];
}