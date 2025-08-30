'use client'

import { create } from 'zustand'
import { PublicKey } from '@solana/web3.js'

/**
 * Vault State Management Store
 * 
 * Manages the state of user vaults including:
 * - Vault creation status
 * - USDC balance and deposit/withdrawal tracking
 * - Bot authorization status
 * - Transaction states and error handling
 * 
 * This store works alongside the SimpleWalletContext to provide comprehensive
 * state management for XORJ vault operations.
 */

export enum VaultStatus {
  NotCreated = 'not_created',
  Creating = 'creating',
  Active = 'active',
  Inactive = 'inactive',
  Error = 'error'
}

export enum TransactionStatus {
  Idle = 'idle',
  Pending = 'pending',
  Confirming = 'confirming',
  Success = 'success',
  Error = 'error'
}

export interface VaultState {
  // Vault status and metadata
  status: VaultStatus
  vaultAddress: PublicKey | null
  createdAt: number | null
  
  // Balance and deposit tracking
  totalDeposited: number
  currentBalance: number
  lastBalanceUpdate: number | null
  
  // Bot authorization
  botAuthorized: boolean
  botAuthority: PublicKey | null
  
  // Transaction states
  depositStatus: TransactionStatus
  withdrawStatus: TransactionStatus
  createStatus: TransactionStatus
  authorizationStatus: TransactionStatus
  
  // Error handling
  error: string | null
  lastTransactionSignature: string | null
  
  // Actions
  setVaultCreating: () => void
  setVaultActive: (vaultAddress: PublicKey, createdAt: number) => void
  setVaultInactive: () => void
  setVaultError: (error: string) => void
  
  updateBalance: (totalDeposited: number, currentBalance: number) => void
  
  setDepositPending: () => void
  setDepositConfirming: (signature: string) => void
  setDepositSuccess: (newBalance: number) => void
  setDepositError: (error: string) => void
  
  setWithdrawPending: () => void
  setWithdrawConfirming: (signature: string) => void
  setWithdrawSuccess: (newBalance: number) => void
  setWithdrawError: (error: string) => void
  
  setBotAuthorized: (botAuthority: PublicKey) => void
  setBotRevoked: () => void
  setAuthorizationPending: () => void
  setAuthorizationSuccess: () => void
  setAuthorizationError: (error: string) => void
  
  clearError: () => void
  resetTransactionStates: () => void
}

/**
 * Vault Store Hook
 * 
 * Central state management for all vault-related operations.
 * Provides reactive state updates for UI components and maintains
 * transaction history for user feedback.
 */
export const useVaultStore = create<VaultState>((set, get) => ({
  // Initial state
  status: VaultStatus.NotCreated,
  vaultAddress: null,
  createdAt: null,
  
  totalDeposited: 0,
  currentBalance: 0,
  lastBalanceUpdate: null,
  
  botAuthorized: false,
  botAuthority: null,
  
  depositStatus: TransactionStatus.Idle,
  withdrawStatus: TransactionStatus.Idle,
  createStatus: TransactionStatus.Idle,
  authorizationStatus: TransactionStatus.Idle,
  
  error: null,
  lastTransactionSignature: null,

  // Vault status actions
  setVaultCreating: () => set({ 
    status: VaultStatus.Creating,
    createStatus: TransactionStatus.Pending,
    error: null 
  }),

  setVaultActive: (vaultAddress: PublicKey, createdAt: number) => set({
    status: VaultStatus.Active,
    vaultAddress,
    createdAt,
    createStatus: TransactionStatus.Success,
    error: null
  }),

  setVaultInactive: () => set({
    status: VaultStatus.Inactive,
    botAuthorized: false,
    botAuthority: null
  }),

  setVaultError: (error: string) => set({
    status: VaultStatus.Error,
    createStatus: TransactionStatus.Error,
    error
  }),

  // Balance management
  updateBalance: (totalDeposited: number, currentBalance: number) => set({
    totalDeposited,
    currentBalance,
    lastBalanceUpdate: Date.now()
  }),

  // Deposit transaction states
  setDepositPending: () => set({
    depositStatus: TransactionStatus.Pending,
    error: null
  }),

  setDepositConfirming: (signature: string) => set({
    depositStatus: TransactionStatus.Confirming,
    lastTransactionSignature: signature
  }),

  setDepositSuccess: (newBalance: number) => set({
    depositStatus: TransactionStatus.Success,
    currentBalance: newBalance,
    lastBalanceUpdate: Date.now(),
    error: null
  }),

  setDepositError: (error: string) => set({
    depositStatus: TransactionStatus.Error,
    error
  }),

  // Withdrawal transaction states
  setWithdrawPending: () => set({
    withdrawStatus: TransactionStatus.Pending,
    error: null
  }),

  setWithdrawConfirming: (signature: string) => set({
    withdrawStatus: TransactionStatus.Confirming,
    lastTransactionSignature: signature
  }),

  setWithdrawSuccess: (newBalance: number) => set({
    withdrawStatus: TransactionStatus.Success,
    currentBalance: newBalance,
    lastBalanceUpdate: Date.now(),
    error: null
  }),

  setWithdrawError: (error: string) => set({
    withdrawStatus: TransactionStatus.Error,
    error
  }),

  // Bot authorization management
  setBotAuthorized: (botAuthority: PublicKey) => set({
    botAuthorized: true,
    botAuthority,
    authorizationStatus: TransactionStatus.Success,
    error: null
  }),

  setBotRevoked: () => set({
    botAuthorized: false,
    botAuthority: null,
    authorizationStatus: TransactionStatus.Success,
    error: null
  }),

  setAuthorizationPending: () => set({
    authorizationStatus: TransactionStatus.Pending,
    error: null
  }),

  setAuthorizationSuccess: () => set({
    authorizationStatus: TransactionStatus.Success,
    error: null
  }),

  setAuthorizationError: (error: string) => set({
    authorizationStatus: TransactionStatus.Error,
    error
  }),

  // Utility actions
  clearError: () => set({ error: null }),

  resetTransactionStates: () => set({
    depositStatus: TransactionStatus.Idle,
    withdrawStatus: TransactionStatus.Idle,
    authorizationStatus: TransactionStatus.Idle,
    error: null,
    lastTransactionSignature: null
  })
}))

/**
 * Vault Store Selectors
 * 
 * Pre-built selectors for common state queries to optimize re-renders
 * and provide convenient access to derived state.
 */
export const vaultSelectors = {
  // Vault status selectors
  isVaultCreated: (state: VaultState) => state.status !== VaultStatus.NotCreated,
  isVaultActive: (state: VaultState) => state.status === VaultStatus.Active,
  isCreating: (state: VaultState) => state.status === VaultStatus.Creating,
  
  // Transaction status selectors
  isDepositing: (state: VaultState) => 
    state.depositStatus === TransactionStatus.Pending || 
    state.depositStatus === TransactionStatus.Confirming,
  
  isWithdrawing: (state: VaultState) => 
    state.withdrawStatus === TransactionStatus.Pending || 
    state.withdrawStatus === TransactionStatus.Confirming,
    
  isAuthorizingBot: (state: VaultState) => 
    state.authorizationStatus === TransactionStatus.Pending,
  
  // Balance selectors
  hasBalance: (state: VaultState) => state.currentBalance > 0,
  getFormattedBalance: (state: VaultState) => (state.currentBalance / 1_000_000).toFixed(2),
  
  // Error state selectors
  hasError: (state: VaultState) => !!state.error,
  getLastTransaction: (state: VaultState) => state.lastTransactionSignature
}

export default useVaultStore