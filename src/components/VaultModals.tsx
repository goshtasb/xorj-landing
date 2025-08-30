'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { Connection, clusterApiUrl } from '@solana/web3.js'
import { useSimpleWallet } from '@/contexts/SimpleWalletContext'
import { useVaultStore, TransactionStatus } from '@/store/vaultStore'
import { 
  X, AlertCircle, Check, Loader2, DollarSign, 
  TrendingUp, TrendingDown, Shield, Settings
} from 'lucide-react'
import {
  createDepositTransaction,
  createWithdrawTransaction,
  createBotAuthorizationTransaction,
  formatUSDCAmount,
  parseUSDCAmount,
  validateUSDCAmount,
  getVaultUSDCBalance,
  checkTokenAccountBalance,
  getUSDCTokenAccount
} from '@/utils/vaultOperations'

/**
 * Enhanced Vault Modals
 * 
 * Full-featured modals for vault operations:
 * - USDC deposit with balance checking and validation
 * - USDC withdrawal with confirmation and limits
 * - Bot authorization with clear permissions display
 * - Transaction status tracking and error handling
 */

interface ModalProps {
  onClose: () => void
}

// Enhanced Deposit Modal
export function DepositModal({ onClose }: ModalProps) {
  const connection = useMemo(() => new Connection(clusterApiUrl('devnet')), [])
  const { publicKey } = useSimpleWallet()
  const {
    vaultAddress,
    currentBalance,
    depositStatus,
    error,
    setDepositPending,
    setDepositConfirming,
    setDepositSuccess,
    setDepositError,
    clearError
  } = useVaultStore()

  const [amount, setAmount] = useState('')
  const [userUSDCBalance, setUserUSDCBalance] = useState<number | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [loadingBalance, setLoadingBalance] = useState(true)

  // Fetch user's USDC balance on mount
  useEffect(() => {
    const fetchBalance = async () => {
      if (!publicKey || !connection) return

      try {
        setLoadingBalance(true)
        const userUSDCAccount = await getUSDCTokenAccount(publicKey)
        const accountInfo = await checkTokenAccountBalance(connection, userUSDCAccount)
        setUserUSDCBalance(accountInfo.balance / 1_000_000) // Convert to USDC units
      } catch {
        console.error('Failed to fetch USDC balance:', err)
        setUserUSDCBalance(0)
      } finally {
        setLoadingBalance(false)
      }
    }

    fetchBalance()
  }, [publicKey, connection])

  // Validate amount on change
  useEffect(() => {
    if (amount) {
      try {
        const parsedAmount = parseUSDCAmount(amount)
        const validation = validateUSDCAmount(parsedAmount, userUSDCBalance || 0)
        setValidationError(validation)
      } catch {
        setValidationError('Invalid amount')
      }
    } else {
      setValidationError(null)
    }
  }, [amount, userUSDCBalance])

  const handleDeposit = async () => {
    if (!publicKey || !connection || !vaultAddress) return
    
    try {
      const parsedAmount = parseUSDCAmount(amount)
      
      setDepositPending()
      clearError()
      
      await createDepositTransaction(
        connection,
        publicKey,
        vaultAddress,
        parsedAmount
      )
      
      // TODO: Implement transaction signing with SimpleWallet
      // const signature = await sendTransaction(transaction, connection)
      throw new Error('Transaction signing not implemented in SimpleWallet yet')
      setDepositConfirming(signature)
      
      // Wait for confirmation
      await connection.confirmTransaction(signature, 'confirmed')
      
      // Update balance
      const newBalance = await getVaultUSDCBalance(connection, vaultAddress)
      setDepositSuccess(newBalance * 1_000_000) // Convert back to smallest unit
      
      onClose()
    } catch (err: unknown) {
      console.error('Deposit failed:', err)
      setDepositError(err instanceof Error ? err.message : 'Deposit failed')
    }
  }

  const isLoading = depositStatus === TransactionStatus.Pending || depositStatus === TransactionStatus.Confirming
  const canDeposit = amount && !validationError && !isLoading && userUSDCBalance !== null

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 rounded-xl max-w-md w-full border border-slate-700">
        {/* Header */}
        <div className="p-6 border-b border-slate-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-green-600 rounded-lg">
                <TrendingUp className="h-5 w-5 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">Deposit USDC</h3>
                <p className="text-sm text-slate-400">Add funds to your vault</p>
              </div>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-white">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Balance Display */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-800 rounded-lg p-3">
              <div className="text-xs text-slate-400 mb-1">Your USDC Balance</div>
              <div className="text-lg font-semibold text-white">
                {loadingBalance ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  `$${formatUSDCAmount(userUSDCBalance || 0)}`
                )}
              </div>
            </div>
            <div className="bg-slate-800 rounded-lg p-3">
              <div className="text-xs text-slate-400 mb-1">Vault Balance</div>
              <div className="text-lg font-semibold text-white">
                ${formatUSDCAmount(currentBalance / 1_000_000)}
              </div>
            </div>
          </div>

          {/* Amount Input */}
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Deposit Amount (USDC)
            </label>
            <div className="relative">
              <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400">
                <DollarSign className="h-4 w-4" />
              </div>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full pl-10 pr-4 py-3 bg-slate-800 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500"
                step="0.01"
                min="0"
              />
            </div>
            
            {/* Quick Amount Buttons */}
            <div className="flex space-x-2 mt-2">
              {[25, 100, 250, 500].map((quickAmount) => (
                <button
                  key={quickAmount}
                  onClick={() => setAmount(quickAmount.toString())}
                  disabled={!userUSDCBalance || userUSDCBalance < quickAmount}
                  className="px-3 py-1 text-xs bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-500 text-slate-300 rounded transition-colors"
                >
                  ${quickAmount}
                </button>
              ))}
              {userUSDCBalance && (
                <button
                  onClick={() => setAmount(userUSDCBalance.toString())}
                  className="px-3 py-1 text-xs bg-green-600/20 hover:bg-green-600/30 text-green-400 rounded transition-colors"
                >
                  Max
                </button>
              )}
            </div>
            
            {validationError && (
              <div className="mt-2 flex items-center space-x-2 text-red-400">
                <AlertCircle className="h-4 w-4" />
                <span className="text-sm">{validationError}</span>
              </div>
            )}
          </div>

          {/* Transaction Fee Info */}
          <div className="bg-blue-900/20 border border-blue-600/20 rounded-lg p-3">
            <div className="flex items-start space-x-2">
              <div className="w-4 h-4 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-xs text-white">i</span>
              </div>
              <div>
                <p className="text-sm text-blue-200">
                  Transaction fee: ~0.005 SOL (~$0.50). USDC deposits are processed instantly.
                </p>
              </div>
            </div>
          </div>

          {/* Error Display */}
          {error && (
            <div className="bg-red-900/20 border border-red-600/20 rounded-lg p-3">
              <div className="flex items-center space-x-2">
                <AlertCircle className="h-4 w-4 text-red-400" />
                <span className="text-sm text-red-300">{error}</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-700 flex space-x-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 text-slate-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleDeposit}
            disabled={!canDeposit}
            className="flex-1 flex items-center justify-center space-x-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-slate-600 text-white rounded-lg font-medium transition-colors disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>
                  {depositStatus === TransactionStatus.Pending ? 'Preparing...' : 'Confirming...'}
                </span>
              </>
            ) : (
              <>
                <TrendingUp className="h-4 w-4" />
                <span>Deposit ${amount || '0.00'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

// Enhanced Withdrawal Modal
export function WithdrawModal({ onClose }: ModalProps) {
  const connection = useMemo(() => new Connection(clusterApiUrl('devnet')), [])
  const { publicKey } = useSimpleWallet()
  const {
    vaultAddress,
    currentBalance,
    withdrawStatus,
    error,
    setWithdrawPending,
    setWithdrawConfirming,
    setWithdrawSuccess,
    setWithdrawError,
    clearError
  } = useVaultStore()

  const [amount, setAmount] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)
  const [showConfirmation] = useState(false)

  const maxWithdraw = currentBalance / 1_000_000

  // Validate amount on change
  useEffect(() => {
    if (amount) {
      try {
        const parsedAmount = parseUSDCAmount(amount)
        const validation = validateUSDCAmount(parsedAmount, maxWithdraw)
        setValidationError(validation)
      } catch {
        setValidationError('Invalid amount')
      }
    } else {
      setValidationError(null)
    }
  }, [amount, maxWithdraw])

  const handleWithdraw = async () => {
    if (!publicKey || !connection || !vaultAddress) return
    
    try {
      const parsedAmount = parseUSDCAmount(amount)
      
      setWithdrawPending()
      clearError()
      
      await createWithdrawTransaction(
        connection,
        publicKey,
        vaultAddress,
        parsedAmount
      )
      
      // TODO: Implement transaction signing with SimpleWallet
      // const signature = await sendTransaction(transaction, connection)
      throw new Error('Transaction signing not implemented in SimpleWallet yet')
      setWithdrawConfirming(signature)
      
      // Wait for confirmation
      await connection.confirmTransaction(signature, 'confirmed')
      
      // Update balance
      const newBalance = await getVaultUSDCBalance(connection, vaultAddress)
      setWithdrawSuccess(newBalance * 1_000_000) // Convert back to smallest unit
      
      onClose()
    } catch (err: unknown) {
      console.error('Withdrawal failed:', err)
      setWithdrawError(err instanceof Error ? err.message : 'Withdrawal failed')
    }
  }

  const isLoading = withdrawStatus === TransactionStatus.Pending || withdrawStatus === TransactionStatus.Confirming
  const canWithdraw = amount && !validationError && !isLoading

  if (showConfirmation) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-slate-900 rounded-xl max-w-md w-full border border-slate-700">
          <div className="p-6 text-center space-y-4">
            <div className="w-16 h-16 bg-red-600 rounded-full flex items-center justify-center mx-auto">
              <TrendingDown className="h-8 w-8 text-white" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-white mb-2">Confirm Withdrawal</h3>
              <p className="text-slate-300">
                Are you sure you want to withdraw <strong>${formatUSDCAmount(parseUSDCAmount(amount))}</strong> USDC from your vault?
              </p>
            </div>
            
            <div className="bg-yellow-900/20 border border-yellow-600/20 rounded-lg p-3">
              <p className="text-sm text-yellow-200">
                This action will reduce your vault balance and may affect automated trading performance.
              </p>
            </div>

            <div className="flex space-x-3 pt-4">
              <button
                onClick={() => setShowConfirmation(false)}
                className="flex-1 px-4 py-2 text-slate-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleWithdraw}
                disabled={isLoading}
                className="flex-1 flex items-center justify-center space-x-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-slate-600 text-white rounded-lg font-medium transition-colors"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Withdrawing...</span>
                  </>
                ) : (
                  <>
                    <TrendingDown className="h-4 w-4" />
                    <span>Confirm Withdrawal</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 rounded-xl max-w-md w-full border border-slate-700">
        {/* Header */}
        <div className="p-6 border-b border-slate-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-red-600 rounded-lg">
                <TrendingDown className="h-5 w-5 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">Withdraw USDC</h3>
                <p className="text-sm text-slate-400">Remove funds from your vault</p>
              </div>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-white">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Balance Display */}
          <div className="bg-slate-800 rounded-lg p-4">
            <div className="text-sm text-slate-400 mb-1">Available for Withdrawal</div>
            <div className="text-2xl font-bold text-white">
              ${formatUSDCAmount(maxWithdraw)}
            </div>
          </div>

          {/* Amount Input */}
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Withdrawal Amount (USDC)
            </label>
            <div className="relative">
              <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400">
                <DollarSign className="h-4 w-4" />
              </div>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full pl-10 pr-4 py-3 bg-slate-800 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500"
                step="0.01"
                min="0"
                max={maxWithdraw}
              />
            </div>
            
            {/* Quick Amount Buttons */}
            <div className="flex space-x-2 mt-2">
              {[0.25, 0.5, 0.75].map((percentage) => {
                const quickAmount = maxWithdraw * percentage
                return (
                  <button
                    key={percentage}
                    onClick={() => setAmount(quickAmount.toFixed(2))}
                    disabled={maxWithdraw === 0}
                    className="px-3 py-1 text-xs bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-500 text-slate-300 rounded transition-colors"
                  >
                    {(percentage * 100).toFixed(0)}%
                  </button>
                )
              })}
              <button
                onClick={() => setAmount(maxWithdraw.toString())}
                disabled={maxWithdraw === 0}
                className="px-3 py-1 text-xs bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded transition-colors"
              >
                All
              </button>
            </div>
            
            {validationError && (
              <div className="mt-2 flex items-center space-x-2 text-red-400">
                <AlertCircle className="h-4 w-4" />
                <span className="text-sm">{validationError}</span>
              </div>
            )}
          </div>

          {/* Warning */}
          <div className="bg-yellow-900/20 border border-yellow-600/20 rounded-lg p-3">
            <div className="flex items-start space-x-2">
              <AlertCircle className="h-4 w-4 text-yellow-400 mt-0.5" />
              <div>
                <p className="text-sm text-yellow-200">
                  Withdrawing funds may reduce the effectiveness of automated trading strategies.
                </p>
              </div>
            </div>
          </div>

          {/* Error Display */}
          {error && (
            <div className="bg-red-900/20 border border-red-600/20 rounded-lg p-3">
              <div className="flex items-center space-x-2">
                <AlertCircle className="h-4 w-4 text-red-400" />
                <span className="text-sm text-red-300">{error}</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-700 flex space-x-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 text-slate-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => setShowConfirmation(true)}
            disabled={!canWithdraw}
            className="flex-1 flex items-center justify-center space-x-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-slate-600 text-white rounded-lg font-medium transition-colors disabled:cursor-not-allowed"
          >
            <TrendingDown className="h-4 w-4" />
            <span>Withdraw ${amount || '0.00'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}

// Bot Authorization Modal
export function BotAuthorizationModal({ onClose }: ModalProps) {
  const connection = useMemo(() => new Connection(clusterApiUrl('devnet')), [])
  const { publicKey } = useSimpleWallet()
  const {
    vaultAddress,
    botAuthorized,
    botAuthority,
    authorizationStatus,
    error,
    setAuthorizationPending,
    setBotAuthorized,
    setBotRevoked,
    setAuthorizationError,
    clearError
  } = useVaultStore()

  const [action, setAction] = useState<'authorize' | 'revoke'>('authorize')

  // XORJ Bot authority address (would be provided by the platform)
  const XORJ_BOT_AUTHORITY = new PublicKey('11111111111111111111111111111113') // Placeholder address

  const handleAuthorization = async () => {
    if (!publicKey || !connection || !vaultAddress) return
    
    try {
      setAuthorizationPending()
      clearError()
      
      await createBotAuthorizationTransaction(
        connection,
        publicKey,
        vaultAddress,
        XORJ_BOT_AUTHORITY,
        action === 'authorize'
      )
      
      // TODO: Implement transaction signing with SimpleWallet
      // const signature = await sendTransaction(transaction, connection)
      throw new Error('Transaction signing not implemented in SimpleWallet yet')
      await connection.confirmTransaction(signature, 'confirmed')
      
      if (action === 'authorize') {
        setBotAuthorized(XORJ_BOT_AUTHORITY)
      } else {
        setBotRevoked()
      }
      
      onClose()
    } catch (err: unknown) {
      console.error('Authorization failed:', err)
      setAuthorizationError(err instanceof Error ? err.message : 'Authorization failed')
    }
  }

  const isLoading = authorizationStatus === TransactionStatus.Pending

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 rounded-xl max-w-lg w-full border border-slate-700">
        {/* Header */}
        <div className="p-6 border-b border-slate-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-blue-600 rounded-lg">
                <Settings className="h-5 w-5 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">Bot Authorization</h3>
                <p className="text-sm text-slate-400">Manage AI trading permissions</p>
              </div>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-white">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Current Status */}
          <div className="bg-slate-800 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-white font-medium">AI Trading Bot</h4>
                <p className="text-sm text-slate-400">
                  {botAuthorized ? 'Currently authorized' : 'Not authorized'}
                </p>
              </div>
              <div className={`w-3 h-3 rounded-full ${
                botAuthorized ? 'bg-green-400 animate-pulse' : 'bg-slate-500'
              }`}></div>
            </div>

            {botAuthorized && botAuthority && (
              <div className="mt-3 pt-3 border-t border-slate-700">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400">Bot Address:</span>
                  <span className="text-white font-mono">
                    {botAuthority.toString().slice(0, 8)}...{botAuthority.toString().slice(-8)}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Permissions List */}
          <div className="bg-slate-800 rounded-lg p-4">
            <h4 className="text-white font-medium mb-3">Bot Permissions</h4>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-300">Execute trades within limits</span>
                <Check className="h-4 w-4 text-green-400" />
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-300">Rebalance portfolio</span>
                <Check className="h-4 w-4 text-green-400" />
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-300">Access vault funds</span>
                <X className="h-4 w-4 text-red-400" />
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-300">Modify vault settings</span>
                <X className="h-4 w-4 text-red-400" />
              </div>
            </div>
          </div>

          {/* Security Notice */}
          <div className="bg-green-900/20 border border-green-600/20 rounded-lg p-4">
            <div className="flex items-start space-x-3">
              <Shield className="h-5 w-5 text-green-400 mt-0.5" />
              <div>
                <h4 className="text-green-300 font-medium mb-1">You Stay in Control</h4>
                <p className="text-sm text-green-200">
                  You can revoke bot permissions at any time. The bot cannot withdraw your funds 
                  or change vault settings - only execute pre-approved trading strategies.
                </p>
              </div>
            </div>
          </div>

          {/* Error Display */}
          {error && (
            <div className="bg-red-900/20 border border-red-600/20 rounded-lg p-3">
              <div className="flex items-center space-x-2">
                <AlertCircle className="h-4 w-4 text-red-400" />
                <span className="text-sm text-red-300">{error}</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-700 flex space-x-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 text-slate-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          
          {botAuthorized ? (
            <button
              onClick={() => {
                setAction('revoke')
                handleAuthorization()
              }}
              disabled={isLoading}
              className="flex-1 flex items-center justify-center space-x-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-slate-600 text-white rounded-lg font-medium transition-colors"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Revoking...</span>
                </>
              ) : (
                <>
                  <X className="h-4 w-4" />
                  <span>Revoke Authorization</span>
                </>
              )}
            </button>
          ) : (
            <button
              onClick={() => {
                setAction('authorize')
                handleAuthorization()
              }}
              disabled={isLoading}
              className="flex-1 flex items-center justify-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 text-white rounded-lg font-medium transition-colors"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Authorizing...</span>
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  <span>Authorize Bot</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}