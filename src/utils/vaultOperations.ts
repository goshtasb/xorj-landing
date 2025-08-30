'use client'

import { Connection, PublicKey, Transaction, SystemProgram } from '@solana/web3.js'
import { 
  // TOKEN_PROGRAM_ID, // Unused
  // ASSOCIATED_TOKEN_PROGRAM_ID, // Unused
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAccount
} from '@solana/spl-token'
// import * as anchor from '@coral-xyz/anchor' // Unused

/**
 * Vault Operations Utilities
 * 
 * Core functions for interacting with XORJ vault smart contracts:
 * - Vault creation and initialization
 * - USDC deposits and withdrawals
 * - Bot authorization management
 * - Balance checking and transaction handling
 */

// Constants
export const VAULT_PROGRAM_ID = new PublicKey('11111111111111111111111111111112') // System program as placeholder
export const USDC_MINT_DEVNET = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU') // USDC on devnet
export const USDC_DECIMALS = 6

/**
 * Get the PDA address for a user's vault
 */
export function getVaultAddress(owner: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('vault'), owner.toBuffer()],
    VAULT_PROGRAM_ID
  )
}

/**
 * Get the associated token account address for USDC
 */
export async function getUSDCTokenAccount(wallet: PublicKey): Promise<PublicKey> {
  return await getAssociatedTokenAddress(
    USDC_MINT_DEVNET,
    wallet
  )
}

/**
 * Get the vault's USDC token account address
 */
export async function getVaultUSDCTokenAccount(vaultAddress: PublicKey): Promise<PublicKey> {
  return await getAssociatedTokenAddress(
    USDC_MINT_DEVNET,
    vaultAddress,
    true // Allow PDA as owner
  )
}

/**
 * Check if a token account exists and get its balance
 */
export async function checkTokenAccountBalance(
  connection: Connection,
  tokenAccount: PublicKey
): Promise<{ exists: boolean; balance: number }> {
  try {
    const account = await getAccount(connection, tokenAccount)
    return {
      exists: true,
      balance: Number(account.amount)
    }
  } catch {
    return {
      exists: false,
      balance: 0
    }
  }
}

/**
 * Create vault initialization transaction
 */
export async function createVaultInitTransaction(
  connection: Connection,
  owner: PublicKey
): Promise<{ transaction: Transaction; vaultAddress: PublicKey }> {
  const [vaultAddress /* _bump */] = getVaultAddress(owner)
  
  // Get minimum rent exemption
  const rentExemption = await connection.getMinimumBalanceForRentExemption(200)
  
  // Create vault account
  const createVaultInstruction = SystemProgram.createAccount({
    fromPubkey: owner,
    newAccountPubkey: vaultAddress,
    lamports: rentExemption,
    space: 200, // Vault account size
    programId: VAULT_PROGRAM_ID
  })

  // TODO: Add actual vault initialization instruction using Anchor IDL
  // This would be: program.methods.initializeVault().accounts({...}).instruction()

  const transaction = new Transaction().add(createVaultInstruction)
  
  return {
    transaction,
    vaultAddress
  }
}

/**
 * Create USDC deposit transaction
 */
export async function createDepositTransaction(
  connection: Connection,
  owner: PublicKey,
  vaultAddress: PublicKey,
  amount: number // Amount in USDC units (not lamports)
): Promise<Transaction> {
  const transaction = new Transaction()
  
  // Convert amount to smallest unit
  const amountLamports = amount * Math.pow(10, USDC_DECIMALS)
  
  // Get token accounts
  const userUSDCAccount = await getUSDCTokenAccount(owner)
  const vaultUSDCAccount = await getVaultUSDCTokenAccount(vaultAddress)
  
  // Check if user's USDC account exists
  const userAccountInfo = await checkTokenAccountBalance(connection, userUSDCAccount)
  if (!userAccountInfo.exists) {
    throw new Error('User USDC account does not exist. Please get some USDC first.')
  }
  
  // Check if user has sufficient balance
  if (userAccountInfo.balance < amountLamports) {
    throw new Error(`Insufficient USDC balance. Required: ${amount}, Available: ${userAccountInfo.balance / Math.pow(10, USDC_DECIMALS)}`)
  }
  
  // Check if vault USDC account exists, create if not
  const vaultAccountInfo = await checkTokenAccountBalance(connection, vaultUSDCAccount)
  if (!vaultAccountInfo.exists) {
    const createVaultUSDCAccountInstruction = createAssociatedTokenAccountInstruction(
      owner, // Payer
      vaultUSDCAccount,
      vaultAddress, // Owner (the vault PDA)
      USDC_MINT_DEVNET
    )
    transaction.add(createVaultUSDCAccountInstruction)
  }
  
  // Create transfer instruction
  const transferInstruction = createTransferInstruction(
    userUSDCAccount, // Source
    vaultUSDCAccount, // Destination
    owner, // Owner authority
    amountLamports // Amount
  )
  transaction.add(transferInstruction)
  
  // TODO: Add vault deposit instruction using Anchor IDL
  // This would update the vault's internal balance tracking
  
  return transaction
}

/**
 * Create USDC withdrawal transaction
 */
export async function createWithdrawTransaction(
  connection: Connection,
  owner: PublicKey,
  vaultAddress: PublicKey,
  amount: number // Amount in USDC units
): Promise<Transaction> {
  const transaction = new Transaction()
  
  // Convert amount to smallest unit
  const amountLamports = amount * Math.pow(10, USDC_DECIMALS)
  
  // Get token accounts
  const userUSDCAccount = await getUSDCTokenAccount(owner)
  const vaultUSDCAccount = await getVaultUSDCTokenAccount(vaultAddress)
  
  // Check if vault USDC account exists and has sufficient balance
  const vaultAccountInfo = await checkTokenAccountBalance(connection, vaultUSDCAccount)
  if (!vaultAccountInfo.exists || vaultAccountInfo.balance < amountLamports) {
    throw new Error(`Insufficient vault balance. Requested: ${amount}, Available: ${vaultAccountInfo.balance / Math.pow(10, USDC_DECIMALS)}`)
  }
  
  // Check if user USDC account exists, create if not
  const userAccountInfo = await checkTokenAccountBalance(connection, userUSDCAccount)
  if (!userAccountInfo.exists) {
    const createUserUSDCAccountInstruction = createAssociatedTokenAccountInstruction(
      owner, // Payer
      userUSDCAccount,
      owner, // Owner
      USDC_MINT_DEVNET
    )
    transaction.add(createUserUSDCAccountInstruction)
  }
  
  // TODO: Add vault withdrawal instruction using Anchor IDL
  // This would transfer from vault to user and update internal tracking
  
  return transaction
}

/**
 * Create bot authorization transaction
 */
export async function createBotAuthorizationTransaction(
  /* _connection: Connection,
  _owner: PublicKey,
  _vaultAddress: PublicKey,
  _botAuthority: PublicKey,
  _authorize: boolean */ // true to authorize, false to revoke
): Promise<Transaction> {
  const transaction = new Transaction()
  
  // TODO: Add bot authorization instruction using Anchor IDL
  // This would be: 
  // - program.methods.grantBotAuthority().accounts({...}) for authorize
  // - program.methods.revokeBotAuthority().accounts({...}) for revoke
  
  return transaction
}

/**
 * Get vault account data
 */
export async function getVaultAccountData(
  connection: Connection,
  vaultAddress: PublicKey
): Promise<{
  owner: PublicKey;
  totalDeposited: number;
  botAuthority: PublicKey | null;
  isActive: boolean;
  createdAt: number;
} | null> {
  try {
    const accountInfo = await connection.getAccountInfo(vaultAddress)
    if (!accountInfo) {
      return null
    }
    
    // TODO: Parse account data using Anchor IDL
    // For now, return mock data
    return {
      owner: new PublicKey('11111111111111111111111111111111'),
      totalDeposited: 0,
      botAuthority: null,
      isActive: true,
      createdAt: Date.now()
    }
  } catch {
    console.error('Error fetching vault data:', error)
    return null
  }
}

/**
 * Get vault USDC balance
 */
export async function getVaultUSDCBalance(
  connection: Connection,
  vaultAddress: PublicKey
): Promise<number> {
  try {
    const vaultUSDCAccount = await getVaultUSDCTokenAccount(vaultAddress)
    const accountInfo = await checkTokenAccountBalance(connection, vaultUSDCAccount)
    return accountInfo.balance / Math.pow(10, USDC_DECIMALS)
  } catch {
    console.error('Error fetching vault USDC balance:', error)
    return 0
  }
}

/**
 * Format USDC amount for display
 */
export function formatUSDCAmount(amount: number): string {
  return amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6
  })
}

/**
 * Parse USDC amount from user input
 */
export function parseUSDCAmount(input: string): number {
  const parsed = parseFloat(input)
  if (isNaN(parsed) || parsed <= 0) {
    throw new Error('Invalid amount')
  }
  return parsed
}

/**
 * Validate USDC amount
 */
export function validateUSDCAmount(amount: number, maxAmount?: number): string | null {
  if (amount <= 0) {
    return 'Amount must be greater than 0'
  }
  
  if (amount < 0.01) {
    return 'Minimum amount is 0.01 USDC'
  }
  
  if (maxAmount && amount > maxAmount) {
    return `Amount exceeds maximum of ${formatUSDCAmount(maxAmount)} USDC`
  }
  
  return null
}

const vaultOperations = {
  getVaultAddress,
  getUSDCTokenAccount,
  getVaultUSDCTokenAccount,
  checkTokenAccountBalance,
  createVaultInitTransaction,
  createDepositTransaction,
  createWithdrawTransaction,
  createBotAuthorizationTransaction,
  getVaultAccountData,
  getVaultUSDCBalance,
  formatUSDCAmount,
  parseUSDCAmount,
  validateUSDCAmount
};

export default vaultOperations;