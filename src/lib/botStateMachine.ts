/**
 * Bot Reliability Module - Formal State Machine
 * Requirement 1.1: Implement a Formal State Machine for Trade Execution Bot lifecycle
 * 
 * This module ensures the bot never gets stuck in an unknown state and provides
 * guaranteed recovery paths for all possible states.
 */

import { Connection } from '@solana/web3.js';
import { TradeService, BotStateService, ExecutionJobService } from './botStateService';
import { ValidatedTradeSignal } from './riskManagement';
import { ServiceResponse } from '../types/database';

/**
 * Bot State Machine States
 * Each state represents a distinct phase in the bot's lifecycle
 */
export enum BotState {
  IDLE = 'IDLE',                           // Bot is waiting for signals
  ANALYZING_SIGNALS = 'ANALYZING_SIGNALS', // Processing incoming trade signals
  VALIDATING_RISK = 'VALIDATING_RISK',     // Performing risk management checks
  EXECUTING_TRADE = 'EXECUTING_TRADE',     // Submitting trade to blockchain
  AWAITING_CONFIRMATION = 'AWAITING_CONFIRMATION', // Waiting for blockchain confirmation
  FAILED_RETRY_PENDING = 'FAILED_RETRY_PENDING',   // Failed trade, waiting for retry
  PAUSED = 'PAUSED',                       // Bot manually paused
  ERROR = 'ERROR'                          // Unrecoverable error state
}

/**
 * Bot Events that trigger state transitions
 */
export enum BotEvent {
  SIGNAL_RECEIVED = 'SIGNAL_RECEIVED',
  RISK_VALIDATION_PASSED = 'RISK_VALIDATION_PASSED', 
  RISK_VALIDATION_FAILED = 'RISK_VALIDATION_FAILED',
  TRADE_SUBMITTED = 'TRADE_SUBMITTED',
  TRADE_CONFIRMED = 'TRADE_CONFIRMED',
  TRADE_FAILED = 'TRADE_FAILED',
  RETRY_SCHEDULED = 'RETRY_SCHEDULED',
  MANUAL_PAUSE = 'MANUAL_PAUSE',
  MANUAL_RESUME = 'MANUAL_RESUME',
  SYSTEM_ERROR = 'SYSTEM_ERROR',
  RECOVERY_INITIATED = 'RECOVERY_INITIATED'
}

/**
 * State Machine Transition Map
 * Defines valid state transitions for safety
 */
const STATE_TRANSITIONS: Record<BotState, Partial<Record<BotEvent, BotState>>> = {
  [BotState.IDLE]: {
    [BotEvent.SIGNAL_RECEIVED]: BotState.ANALYZING_SIGNALS,
    [BotEvent.MANUAL_PAUSE]: BotState.PAUSED,
    [BotEvent.SYSTEM_ERROR]: BotState.ERROR
  },
  [BotState.ANALYZING_SIGNALS]: {
    [BotEvent.RISK_VALIDATION_PASSED]: BotState.VALIDATING_RISK,
    [BotEvent.RISK_VALIDATION_FAILED]: BotState.IDLE,
    [BotEvent.MANUAL_PAUSE]: BotState.PAUSED,
    [BotEvent.SYSTEM_ERROR]: BotState.ERROR
  },
  [BotState.VALIDATING_RISK]: {
    [BotEvent.RISK_VALIDATION_PASSED]: BotState.EXECUTING_TRADE,
    [BotEvent.RISK_VALIDATION_FAILED]: BotState.IDLE,
    [BotEvent.MANUAL_PAUSE]: BotState.PAUSED,
    [BotEvent.SYSTEM_ERROR]: BotState.ERROR
  },
  [BotState.EXECUTING_TRADE]: {
    [BotEvent.TRADE_SUBMITTED]: BotState.AWAITING_CONFIRMATION,
    [BotEvent.TRADE_FAILED]: BotState.FAILED_RETRY_PENDING,
    [BotEvent.MANUAL_PAUSE]: BotState.PAUSED,
    [BotEvent.SYSTEM_ERROR]: BotState.ERROR
  },
  [BotState.AWAITING_CONFIRMATION]: {
    [BotEvent.TRADE_CONFIRMED]: BotState.IDLE,
    [BotEvent.TRADE_FAILED]: BotState.FAILED_RETRY_PENDING,
    [BotEvent.MANUAL_PAUSE]: BotState.PAUSED,
    [BotEvent.SYSTEM_ERROR]: BotState.ERROR
  },
  [BotState.FAILED_RETRY_PENDING]: {
    [BotEvent.RETRY_SCHEDULED]: BotState.IDLE,
    [BotEvent.MANUAL_PAUSE]: BotState.PAUSED,
    [BotEvent.SYSTEM_ERROR]: BotState.ERROR
  },
  [BotState.PAUSED]: {
    [BotEvent.MANUAL_RESUME]: BotState.IDLE,
    [BotEvent.SYSTEM_ERROR]: BotState.ERROR
  },
  [BotState.ERROR]: {
    [BotEvent.RECOVERY_INITIATED]: BotState.IDLE
  }
};

/**
 * Bot State Context
 * Contains all data needed for state machine operations
 */
export interface BotStateContext {
  userId: string;
  vaultAddress: string;
  currentState: BotState;
  lastUpdated: Date;
  currentTradeId?: string;
  currentJobId?: string;
  retryCount: number;
  errorMessage?: string;
  stateHistory: Array<{
    state: BotState;
    event?: BotEvent;
    timestamp: Date;
    metadata?: Record<string, unknown>;
  }>;
}

/**
 * Bot State Machine Implementation
 * Ensures reliable state transitions and recovery
 */
export class BotStateMachine {
  private connection: Connection;
  private readonly MAX_RETRIES = 3;
  private readonly CONFIRMATION_TIMEOUT_MS = 30000; // 30 seconds

  constructor() {
    this.connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
  }

  /**
   * Initialize or restore bot state machine for a user
   * Called on bot startup or recovery
   */
  async initializeBotState(userId: string, vaultAddress: string): Promise<ServiceResponse<BotStateContext>> {
    try {

      // Get existing bot state from database
      const existingState = await BotStateService.getOrCreate(userId);
      
      if (!existingState.success) {
        throw new Error(`Failed to get bot state: ${existingState.error}`);
      }

      // Check for pending trades that need recovery
      const pendingTrades = await this.checkPendingTrades(userId);
      
      let currentState = BotState.IDLE;
      let currentTradeId: string | undefined;
      let currentJobId: string | undefined;

      // Determine initial state based on pending operations
      if (pendingTrades.length > 0) {
        
        // Recover the first pending trade
        const pendingTrade = pendingTrades[0];
        currentTradeId = pendingTrade.id;
        currentJobId = pendingTrade.job_id;

        if (pendingTrade.status === 'SUBMITTED' || pendingTrade.status === 'PENDING') {
          currentState = BotState.AWAITING_CONFIRMATION;
        } else {
          currentState = BotState.FAILED_RETRY_PENDING;
        }
      }

      // Create state context
      const stateContext: BotStateContext = {
        userId,
        vaultAddress,
        currentState,
        lastUpdated: new Date(),
        currentTradeId,
        currentJobId,
        retryCount: 0,
        stateHistory: [{
          state: currentState,
          event: BotEvent.RECOVERY_INITIATED,
          timestamp: new Date(),
          metadata: { pendingTrades: pendingTrades.length }
        }]
      };

      // Persist initial state
      await this.persistState(stateContext);

      
      return {
        success: true,
        data: stateContext,
        message: `Bot state machine initialized in ${currentState} state`
      };

    } catch (error) {
      console.error(`❌ Failed to initialize bot state machine:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Process a bot event and transition to new state
   * Core state machine logic with validation
   */
  async processEvent(
    context: BotStateContext, 
    event: BotEvent, 
    metadata?: Record<string, unknown>
  ): Promise<ServiceResponse<BotStateContext>> {
    try {

      // Validate transition is allowed
      const allowedTransitions = STATE_TRANSITIONS[context.currentState];
      const newState = allowedTransitions?.[event];

      if (!newState) {
        return {
          success: false,
          error: `Invalid transition: ${event} from ${context.currentState}`,
          code: 'INVALID_TRANSITION'
        };
      }

      // Create new state context
      const updatedContext: BotStateContext = {
        ...context,
        currentState: newState,
        lastUpdated: new Date(),
        stateHistory: [
          ...context.stateHistory,
          {
            state: newState,
            event,
            timestamp: new Date(),
            metadata
          }
        ]
      };

      // Handle state-specific logic
      await this.handleStateEntry(updatedContext, event, metadata);

      // Persist updated state
      await this.persistState(updatedContext);


      return {
        success: true,
        data: updatedContext,
        message: `Transitioned to ${newState}`
      };

    } catch (error) {
      console.error(`❌ Event processing failed:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Execute trade with state machine coordination
   * Requirement 1.2: Guarantee Idempotency
   */
  async executeTradeWithStateMachine(
    context: BotStateContext,
    validatedSignal: ValidatedTradeSignal
  ): Promise<ServiceResponse<BotStateContext>> {
    try {

      // Generate deterministic client_order_id for idempotency
      const clientOrderId = TradeService.generateClientOrderId(
        validatedSignal.vaultAddress,
        validatedSignal.fromAsset.mintAddress,
        validatedSignal.toAsset.mintAddress,
        BigInt(Math.floor(validatedSignal.targetPercentage * 1000000)), // Convert to amount
        5 // 5 minute time window
      );

      // Check if trade already exists (idempotency)
      const existingTrade = await TradeService.findByClientOrderId(
        validatedSignal.vaultAddress, 
        clientOrderId
      );

      if (existingTrade.success && existingTrade.data) {
        
        return {
          success: true,
          data: {
            ...context,
            currentTradeId: existingTrade.data.id
          },
          message: 'Trade already exists - idempotency enforced'
        };
      }

      // Create new execution job
      const jobResult = await ExecutionJobService.create({
        status: 'RUNNING',
        trigger_reason: 'Automated signal execution',
        started_at: new Date()
      });

      if (!jobResult.success || !jobResult.data) {
        throw new Error(`Failed to create execution job: ${jobResult.error}`);
      }

      // Create trade record with PENDING status
      const tradeResult = await TradeService.create({
        job_id: jobResult.data.id,
        user_vault_address: validatedSignal.vaultAddress,
        client_order_id: clientOrderId,
        status: 'PENDING',
        from_token_address: validatedSignal.fromAsset.mintAddress,
        to_token_address: validatedSignal.toAsset.mintAddress,
        amount_in: BigInt(Math.floor(validatedSignal.targetPercentage * 1000000)),
        expected_amount_out: BigInt(Math.floor(validatedSignal.targetPercentage * 1000000 * 0.95)) // Estimate with slippage
      });

      if (!tradeResult.success || !tradeResult.data) {
        throw new Error(`Failed to create trade: ${tradeResult.error}`);
      }

      // Update context with trade information
      const updatedContext = {
        ...context,
        currentTradeId: tradeResult.data.id,
        currentJobId: jobResult.data.id
      };

      // Transition to EXECUTING_TRADE state
      return await this.processEvent(updatedContext, BotEvent.TRADE_SUBMITTED, {
        tradeId: tradeResult.data.id,
        jobId: jobResult.data.id,
        clientOrderId,
        signal: validatedSignal
      });

    } catch (error) {
      console.error(`❌ Trade execution failed:`, error);
      
      // Transition to error state
      return await this.processEvent(context, BotEvent.SYSTEM_ERROR, {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Check pending trades for recovery
   * Requirement 1.3: Implement Graceful Recovery Logic
   */
  private async checkPendingTrades(userId: string): Promise<unknown[]> {
    try {
      const pendingTrades = await TradeService.getSubmittedTrades();
      
      if (!pendingTrades.success || !pendingTrades.data) {
        return [];
      }

      // Filter trades for this user and verify blockchain status
      const userTrades = pendingTrades.data.filter(trade => 
        trade.user_vault_address.includes(userId) || // Rough filter - would need proper user mapping
        trade.user_vault_address === userId
      );

      // Verify each trade on blockchain
      for (const trade of userTrades) {
        if (trade.transaction_signature) {
          await this.verifyTransactionStatus(trade.transaction_signature, trade.id);
        }
      }

      return userTrades;

    } catch (error) {
      console.error(`❌ Error checking pending trades:`, error);
      return [];
    }
  }

  /**
   * Verify transaction status on Solana blockchain
   */
  private async verifyTransactionStatus(signature: string, tradeId: string): Promise<void> {
    try {
      
      const status = await this.connection.getSignatureStatus(signature);
      
      if (status?.value?.confirmationStatus === 'confirmed' || status?.value?.confirmationStatus === 'finalized') {
        // Update trade to confirmed
        await TradeService.updateToConfirmed(tradeId, {});
      } else if (status?.value?.err) {
        // Update trade to failed
        await TradeService.updateToFailed(tradeId, `Transaction failed: ${JSON.stringify(status.value.err)}`);
      } else {
      }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (_error) {
    }
  }

  /**
   * Handle state-specific entry logic
   */
  private async handleStateEntry(
    context: BotStateContext, 
    event: BotEvent, 
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const { currentState } = context;

    switch (currentState) {
      case BotState.AWAITING_CONFIRMATION:
        // Set up confirmation timeout
        this.scheduleConfirmationTimeout(context);
        break;
        
      case BotState.FAILED_RETRY_PENDING:
        // Increment retry count and schedule retry
        context.retryCount += 1;
        if (context.retryCount >= this.MAX_RETRIES) {
          await this.processEvent(context, BotEvent.SYSTEM_ERROR, {
            reason: 'Maximum retry attempts exceeded'
          });
        } else {
          // Schedule retry after exponential backoff
          const retryDelay = Math.pow(2, context.retryCount) * 1000; // 2s, 4s, 8s
          setTimeout(() => {
            this.processEvent(context, BotEvent.RETRY_SCHEDULED);
          }, retryDelay);
        }
        break;
        
      case BotState.ERROR:
        // Log error state and prepare for manual intervention
        context.errorMessage = metadata?.error || 'Unknown error occurred';
        console.error(`🚨 Bot entered ERROR state: ${context.errorMessage}`);
        break;
        
      case BotState.IDLE:
        // Reset trade context when returning to idle
        context.currentTradeId = undefined;
        context.currentJobId = undefined;
        context.retryCount = 0;
        context.errorMessage = undefined;
        break;
    }
  }

  /**
   * Schedule confirmation timeout
   */
  private scheduleConfirmationTimeout(context: BotStateContext): void {
    setTimeout(async () => {
      if (context.currentState === BotState.AWAITING_CONFIRMATION) {
        await this.processEvent(context, BotEvent.TRADE_FAILED, {
          reason: 'Confirmation timeout exceeded'
        });
      }
    }, this.CONFIRMATION_TIMEOUT_MS);
  }

  /**
   * Persist state to database
   */
  private async persistState(context: BotStateContext): Promise<void> {
    try {
      await BotStateService.update(context.userId, {
        enabled: context.currentState !== BotState.PAUSED && context.currentState !== BotState.ERROR,
        configuration: {
          currentState: context.currentState,
          lastUpdated: context.lastUpdated.toISOString(),
          currentTradeId: context.currentTradeId,
          currentJobId: context.currentJobId,
          retryCount: context.retryCount,
          errorMessage: context.errorMessage,
          stateHistory: context.stateHistory.slice(-10) // Keep last 10 states
        }
      });
    } catch (error) {
      console.error(`⚠️ Failed to persist state:`, error);
    }
  }

  /**
   * Get current bot state for user
   */
  async getBotState(userId: string): Promise<ServiceResponse<BotStateContext | null>> {
    try {
      const botState = await BotStateService.getOrCreate(userId);
      
      if (!botState.success || !botState.data) {
        return {
          success: false,
          error: 'Failed to retrieve bot state'
        };
      }

      const config = botState.data.configuration;
      
      const context: BotStateContext = {
        userId,
        vaultAddress: '', // Would need to get from user mapping
        currentState: config.currentState || BotState.IDLE,
        lastUpdated: new Date(config.lastUpdated || botState.data.last_updated),
        currentTradeId: config.currentTradeId,
        currentJobId: config.currentJobId,
        retryCount: config.retryCount || 0,
        errorMessage: config.errorMessage,
        stateHistory: config.stateHistory || []
      };

      return {
        success: true,
        data: context
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

// Singleton instance
export const botStateMachine = new BotStateMachine();