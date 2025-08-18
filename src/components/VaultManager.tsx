'use client'

import React, { useState, useEffect } from 'react'
import { Connection, PublicKey, Transaction, SystemProgram, clusterApiUrl } from '@solana/web3.js'
import { createInitializeInstruction, getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { useVaultStore, VaultStatus, TransactionStatus, vaultSelectors } from '@/store/vaultStore'
import { useSimpleWallet } from '@/contexts/SimpleWalletContext'
import { 
  Shield, Plus, Minus, Settings, AlertCircle, Check, 
  Loader2, ExternalLink, Copy, RefreshCw, X
} from 'lucide-react'
import { DepositModal, WithdrawModal, BotAuthorizationModal } from './VaultModals'

/**
 * Vault Manager Component
 * 
 * Main interface for vault operations:
 * - Create new vault
 * - Deposit/withdraw USDC
 * - Manage bot authorization
 * - View vault status and balance
 * 
 * Integrates with the Anchor smart contract and provides
 * comprehensive error handling and transaction feedback.
 */

// USDC Mint address on Devnet - for production, use mainnet USDC
const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')

interface VaultManagerProps {
  className?: string
}

export function VaultManager({ className = '' }: VaultManagerProps) {
  const connection = new Connection(clusterApiUrl('devnet'))
  const { publicKey, connected } = useSimpleWallet()
  
  const {
    status: vaultStatus,
    vaultAddress,
    currentBalance,
    totalDeposited,
    botAuthorized,
    error,
    createStatus,
    setVaultCreating,
    setVaultActive,
    setVaultError,
    clearError
  } = useVaultStore()

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showDepositModal, setShowDepositModal] = useState(false)
  const [showWithdrawModal, setShowWithdrawModal] = useState(false)
  const [showAuthModal, setShowAuthModal] = useState(false)

  // Check if wallet is connected
  const isConnected = connected && publicKey

  // Initialize vault creation
  const handleCreateVault = async () => {
    if (!isConnected || !publicKey) return

    try {
      setVaultCreating()
      
      // Generate vault PDA
      const [vaultPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from('vault'), publicKey.toBuffer()],
        new PublicKey('11111111111111111111111111111112') // Program ID placeholder
      )

      // Create vault initialization instruction
      // Note: This would typically use the Anchor generated IDL
      const instruction = SystemProgram.createAccount({
        fromPubkey: publicKey,
        newAccountPubkey: vaultPDA,
        lamports: await connection.getMinimumBalanceForRentExemption(200), // Approximate vault size
        space: 200,
        programId: new PublicKey('11111111111111111111111111111112') // Program ID placeholder
      })

      const transaction = new Transaction().add(instruction)
      // TODO: Implement transaction signing with SimpleWallet
      // const signature = await sendTransaction(transaction, connection)
      throw new Error('Transaction signing not implemented in SimpleWallet yet')
      
      // Confirm transaction
      await connection.confirmTransaction(signature, 'confirmed')
      
      // Update store with success
      setVaultActive(vaultPDA, Date.now())
      setShowCreateModal(false)
      
    } catch (err: any) {
      console.error('Vault creation failed:', err)
      setVaultError(err.message || 'Failed to create vault')
    }
  }

  if (!isConnected) {
    return (
      <div className={`bg-slate-800/50 border border-slate-700 rounded-xl p-6 ${className}`}>
        <div className="text-center space-y-4">
          <div className="w-16 h-16 bg-slate-700 rounded-full flex items-center justify-center mx-auto">
            <Shield className="h-8 w-8 text-slate-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white mb-2">Connect Wallet to Access Vault</h3>
            <p className="text-slate-400 text-sm">
              Connect your Phantom wallet to create and manage your XORJ vault.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Vault Status Card */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className={`p-2 rounded-lg ${
              vaultStatus === VaultStatus.Active ? 'bg-green-600' :
              vaultStatus === VaultStatus.Creating ? 'bg-yellow-600' :
              'bg-slate-600'
            }`}>
              <Shield className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Your Vault</h3>
              <p className="text-sm text-slate-400">
                {vaultStatus === VaultStatus.NotCreated && 'No vault created yet'}
                {vaultStatus === VaultStatus.Creating && 'Creating vault...'}
                {vaultStatus === VaultStatus.Active && 'Vault active and ready'}
                {vaultStatus === VaultStatus.Error && 'Vault error - please retry'}
              </p>
            </div>
          </div>

          {vaultStatus === VaultStatus.Active && (
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
              <span className="text-xs text-green-400">Active</span>
            </div>
          )}
        </div>

        {/* Balance Display */}
        {vaultStatus === VaultStatus.Active && (
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="bg-slate-900/50 rounded-lg p-4">
              <div className="text-sm text-slate-400 mb-1">Current Balance</div>
              <div className="text-xl font-bold text-white">
                ${(currentBalance / 1_000_000).toFixed(2)} USDC
              </div>
            </div>
            <div className="bg-slate-900/50 rounded-lg p-4">
              <div className="text-sm text-slate-400 mb-1">Total Deposited</div>
              <div className="text-xl font-bold text-white">
                ${(totalDeposited / 1_000_000).toFixed(2)} USDC
              </div>
            </div>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="bg-red-900/20 border border-red-600/20 rounded-lg p-3 mb-4">
            <div className="flex items-center space-x-2">
              <AlertCircle className="h-4 w-4 text-red-400" />
              <span className="text-sm text-red-300">{error}</span>
              <button
                onClick={clearError}
                className="ml-auto text-red-400 hover:text-red-300"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-3">
          {vaultStatus === VaultStatus.NotCreated && (
            <button
              onClick={() => setShowCreateModal(true)}
              disabled={createStatus === TransactionStatus.Pending}
              className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 disabled:from-slate-600 disabled:to-slate-700 text-white rounded-lg font-medium transition-all disabled:cursor-not-allowed"
            >
              {createStatus === TransactionStatus.Pending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Creating...</span>
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  <span>Create Vault</span>
                </>
              )}
            </button>
          )}

          {vaultStatus === VaultStatus.Active && (
            <>
              <button
                onClick={() => setShowDepositModal(true)}
                className="flex items-center space-x-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors"
              >
                <Plus className="h-4 w-4" />
                <span>Deposit</span>
              </button>
              
              <button
                onClick={() => setShowWithdrawModal(true)}
                disabled={currentBalance === 0}
                className="flex items-center space-x-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-slate-600 text-white rounded-lg font-medium transition-colors disabled:cursor-not-allowed"
              >
                <Minus className="h-4 w-4" />
                <span>Withdraw</span>
              </button>
              
              <button
                onClick={() => setShowAuthModal(true)}
                className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
              >
                <Settings className="h-4 w-4" />
                <span>Bot Settings</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Bot Authorization Status */}
      {vaultStatus === VaultStatus.Active && (
        <BotAuthorizationCard />
      )}

      {/* Modals */}
      {showCreateModal && (
        <CreateVaultModal
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreateVault}
          isLoading={createStatus === TransactionStatus.Pending}
        />
      )}

      {showDepositModal && (
        <DepositModal onClose={() => setShowDepositModal(false)} />
      )}

      {showWithdrawModal && (
        <WithdrawModal onClose={() => setShowWithdrawModal(false)} />
      )}

      {showAuthModal && (
        <BotAuthorizationModal onClose={() => setShowAuthModal(false)} />
      )}
    </div>
  )
}

// Bot Authorization Status Card
function BotAuthorizationCard() {
  const { botAuthorized, botAuthority } = useVaultStore()

  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className={`p-2 rounded-lg ${botAuthorized ? 'bg-green-600' : 'bg-slate-600'}`}>
            <Settings className="h-5 w-5 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">AI Trading Bot</h3>
            <p className="text-sm text-slate-400">
              {botAuthorized ? 'Authorized and active' : 'Not authorized'}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <div className={`w-2 h-2 rounded-full ${
            botAuthorized ? 'bg-green-400 animate-pulse' : 'bg-slate-400'
          }`}></div>
          <span className={`text-xs ${botAuthorized ? 'text-green-400' : 'text-slate-400'}`}>
            {botAuthorized ? 'Active' : 'Inactive'}
          </span>
        </div>
      </div>

      {botAuthorized && botAuthority && (
        <div className="mt-4 bg-slate-900/50 rounded-lg p-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-400">Bot Address:</span>
            <div className="flex items-center space-x-2">
              <span className="text-white font-mono text-xs">
                {botAuthority.toString().slice(0, 8)}...{botAuthority.toString().slice(-8)}
              </span>
              <button className="text-slate-400 hover:text-white">
                <Copy className="h-3 w-3" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Enhanced Modal Components
function CreateVaultModal({ onClose, onCreate, isLoading }: any) {
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 rounded-xl max-w-md w-full border border-slate-700">
        <div className="p-6 border-b border-slate-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-purple-600 rounded-lg">
                <Shield className="h-5 w-5 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">Create Your Vault</h3>
                <p className="text-sm text-slate-400">Initialize your personal trading vault</p>
              </div>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-white">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        
        <div className="p-6 space-y-4">
          <p className="text-slate-300">
            Your vault will be created as a secure smart contract on Solana. This one-time setup 
            enables automated trading while keeping you in full control of your funds.
          </p>
          
          <div className="bg-blue-900/20 border border-blue-600/20 rounded-lg p-4">
            <div className="flex items-start space-x-3">
              <div className="w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-xs text-white">i</span>
              </div>
              <div>
                <h4 className="text-blue-300 font-medium mb-1">Transaction Cost</h4>
                <p className="text-sm text-blue-200">
                  Creating your vault requires ~0.01 SOL (~$1) for rent and transaction fees.
                </p>
              </div>
            </div>
          </div>
          
          <div className="space-y-2 text-sm text-slate-400">
            <div className="flex items-center space-x-2">
              <Check className="h-4 w-4 text-green-400" />
              <span>Non-custodial - you maintain full control</span>
            </div>
            <div className="flex items-center space-x-2">
              <Check className="h-4 w-4 text-green-400" />
              <span>Withdraw anytime without restrictions</span>
            </div>
            <div className="flex items-center space-x-2">
              <Check className="h-4 w-4 text-green-400" />
              <span>Transparent on-chain operations</span>
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-slate-700 flex space-x-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 text-slate-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onCreate}
            disabled={isLoading}
            className="flex-1 flex items-center justify-center space-x-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 disabled:from-slate-600 disabled:to-slate-700 text-white rounded-lg font-medium transition-all disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Creating...</span>
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" />
                <span>Create Vault</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

export default VaultManager