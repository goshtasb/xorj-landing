'use client'

import React, { useState, useEffect } from 'react'
import { X, ArrowRight, ArrowLeft, Check, Wallet, Shield, Zap, TrendingUp } from 'lucide-react'
import { useSimpleWallet } from '@/contexts/SimpleWalletContext'

/**
 * Onboarding Tutorial Component
 * 
 * Multi-step modal that guides new users through XORJ platform setup:
 * 1. Welcome & Overview
 * 2. Wallet Connection
 * 3. Vault Creation
 * 4. USDC Deposits
 * 5. Bot Authorization
 * 6. Complete Setup
 * 
 * Features:
 * - Progressive steps with validation
 * - Dynamic content based on wallet status
 * - Skip options for experienced users
 * - Visual progress tracking
 * - Responsive design
 */

interface OnboardingStep {
  id: string
  title: string
  description: string
  icon: React.ReactNode
  component: React.ReactNode
  canSkip?: boolean
  validation?: () => boolean
}

interface OnboardingTutorialProps {
  isOpen: boolean
  onClose: () => void
  onComplete: () => void
}

export function OnboardingTutorial({ isOpen, onClose, onComplete }: OnboardingTutorialProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set())
  const { publicKey, connected } = useSimpleWallet()

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setCurrentStep(0)
      setCompletedSteps(new Set())
    }
  }, [isOpen])

  // Auto-complete wallet connection step when wallet connects
  useEffect(() => {
    if ((connected || publicKey) && currentStep === 1) {
      setCompletedSteps(prev => new Set([...prev, 1]))
    }
  }, [connected, publicKey, currentStep])

  const steps: OnboardingStep[] = [
    {
      id: 'welcome',
      title: 'Welcome to XORJ',
      description: 'Your AI-powered Solana investing journey starts here',
      icon: <Zap className="h-6 w-6" />,
      component: <WelcomeStep />,
      canSkip: true
    },
    {
      id: 'wallet',
      title: 'Connect Your Wallet',
      description: 'Connect your Phantom wallet to get started',
      icon: <Wallet className="h-6 w-6" />,
      component: <WalletStep />,
      canSkip: true,
      validation: () => connected || !!publicKey
    },
    {
      id: 'vault',
      title: 'Create Your Vault',
      description: 'Initialize your personal trading vault',
      icon: <Shield className="h-6 w-6" />,
      component: <VaultStep />,
      canSkip: true
    },
    {
      id: 'deposit',
      title: 'Fund Your Vault',
      description: 'Deposit USDC to start trading',
      icon: <TrendingUp className="h-6 w-6" />,
      component: <DepositStep />,
      canSkip: true
    },
    {
      id: 'authorization',
      title: 'Authorize Trading Bot',
      description: 'Grant permissions for automated trading',
      icon: <Shield className="h-6 w-6" />,
      component: <AuthorizationStep />,
      canSkip: true
    },
    {
      id: 'complete',
      title: 'Setup Complete!',
      description: 'You\'re ready to start intelligent Solana investing',
      icon: <Check className="h-6 w-6" />,
      component: <CompleteStep onComplete={onComplete} />
    }
  ]

  const handleNext = () => {
    const currentStepData = steps[currentStep]
    
    // Validate step if validation function exists and step is not skippable
    if (currentStepData.validation && !currentStepData.validation() && !currentStepData.canSkip) {
      return
    }

    // Mark current step as completed
    setCompletedSteps(prev => new Set([...prev, currentStep]))
    
    // Move to next step or complete onboarding
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1)
    } else {
      // This is the last step, complete the onboarding
      onComplete()
    }
  }

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
    }
  }

  const handleSkip = () => {
    setCurrentStep(currentStep + 1)
  }

  const canProceed = () => {
    const step = steps[currentStep]
    // Always allow proceeding if the step can be skipped, or if validation passes
    return step.canSkip || !step.validation || step.validation()
  }

  if (!isOpen) return null

  const currentStepData = steps[currentStep]
  const isLastStep = currentStep === steps.length - 1

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden border border-slate-700">
        {/* Header */}
        <div className="p-6 border-b border-slate-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-purple-600 rounded-lg">
                {currentStepData.icon}
              </div>
              <div>
                <h2 className="text-xl font-semibold text-white">{currentStepData.title}</h2>
                <p className="text-sm text-slate-400">{currentStepData.description}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white transition-colors rounded-lg hover:bg-slate-800"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="p-6 border-b border-slate-700">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-slate-400">Step {currentStep + 1} of {steps.length}</span>
            <span className="text-sm text-slate-400">
              {Math.round(((currentStep + 1) / steps.length) * 100)}% complete
            </span>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-2">
            <div
              className="bg-gradient-to-r from-purple-600 to-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Content */}
        <div className="p-6 max-h-96 overflow-y-auto">
          {currentStepData.component}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-700 flex items-center justify-between">
          <button
            onClick={handleBack}
            disabled={currentStep === 0}
            className="flex items-center space-x-2 px-4 py-2 text-slate-400 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back</span>
          </button>

          <div className="flex items-center space-x-3">
            {currentStepData.canSkip && !isLastStep && (
              <button
                onClick={handleSkip}
                className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
              >
                Skip
              </button>
            )}
            
            <button
              onClick={handleNext}
              disabled={!canProceed()}
              className="flex items-center space-x-2 px-6 py-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 disabled:from-slate-600 disabled:to-slate-700 text-white rounded-lg font-medium transition-all disabled:cursor-not-allowed"
            >
              <span>
                {isLastStep 
                  ? 'Get Started' 
                  : (currentStepData.canSkip && currentStepData.validation && !currentStepData.validation())
                    ? 'Continue Without Wallet' 
                    : 'Next'
                }
              </span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Individual step components
function WelcomeStep() {
  return (
    <div className="text-center space-y-6">
      <div className="w-20 h-20 bg-gradient-to-r from-purple-600 to-blue-600 rounded-full flex items-center justify-center mx-auto">
        <Zap className="h-10 w-10 text-white" />
      </div>
      
      <div className="space-y-4">
        <h3 className="text-2xl font-bold text-white">Welcome to the Future of Solana Investing</h3>
        <p className="text-slate-300 text-lg leading-relaxed">
          XORJ combines artificial intelligence with Solana's speed to create the most advanced 
          non-custodial trading platform. In just a few steps, you'll have your own AI-powered 
          vault ready to capitalize on Solana ecosystem opportunities.
        </p>
        
        <div className="grid grid-cols-3 gap-4 mt-8">
          <div className="text-center">
            <div className="w-12 h-12 bg-green-600 rounded-lg flex items-center justify-center mx-auto mb-2">
              <Shield className="h-6 w-6 text-white" />
            </div>
            <p className="text-sm text-slate-300">Non-Custodial</p>
          </div>
          <div className="text-center">
            <div className="w-12 h-12 bg-purple-600 rounded-lg flex items-center justify-center mx-auto mb-2">
              <Zap className="h-6 w-6 text-white" />
            </div>
            <p className="text-sm text-slate-300">AI-Powered</p>
          </div>
          <div className="text-center">
            <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center mx-auto mb-2">
              <TrendingUp className="h-6 w-6 text-white" />
            </div>
            <p className="text-sm text-slate-300">Automated</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function WalletStep() {
  const { publicKey, connected } = useSimpleWallet()
  const isConnected = connected || !!publicKey
  const [showConnectButton, setShowConnectButton] = useState(false)
  
  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className={`w-16 h-16 ${isConnected ? 'bg-green-600' : 'bg-slate-600'} rounded-full flex items-center justify-center mx-auto mb-4`}>
          {isConnected ? <Check className="h-8 w-8 text-white" /> : <Wallet className="h-8 w-8 text-white" />}
        </div>
        <h3 className="text-xl font-semibold text-white mb-2">
          {isConnected ? 'Wallet Connected!' : 'Connect Your Phantom Wallet (Optional)'}
        </h3>
        <p className="text-slate-300">
          {isConnected 
            ? "Great! Your wallet is connected and ready to go."
            : "You can explore XORJ without connecting a wallet, but you'll need one later for trading. Connect now or skip for later."
          }
        </p>
      </div>

      {!isConnected && (
        <div className="space-y-4">
          {/* Connect Button */}
          <div className="text-center">
            <button
              onClick={() => setShowConnectButton(!showConnectButton)}
              className="px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white rounded-lg font-medium transition-all transform hover:scale-105"
            >
              <Wallet className="h-5 w-5 mr-2 inline" />
              Connect Wallet Now
            </button>
            <p className="text-xs text-slate-400 mt-2">
              Or click "Skip" to continue exploring without a wallet
            </p>
          </div>

          {showConnectButton && (
            <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
              <p className="text-slate-300 text-sm mb-3 text-center">
                Click the "Connect Wallet" button in the top navigation to connect your Phantom wallet.
              </p>
              <div className="flex items-center justify-center">
                <div className="animate-pulse bg-purple-600/20 border border-purple-600/30 rounded px-3 py-1 text-purple-300 text-sm">
                  → Look for "Connect Wallet" button above ↑
                </div>
              </div>
            </div>
          )}

          <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
            <div className="flex items-start space-x-3">
              <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-xs text-white font-bold">i</span>
              </div>
              <div>
                <h4 className="text-white font-medium mb-1">Why Connect Later?</h4>
                <p className="text-sm text-slate-300">
                  Connecting a wallet is only required when you're ready to create a vault and start trading. 
                  You can explore all features and learn how XORJ works first.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {isConnected && (
        <div className="bg-green-900/20 border border-green-600/20 rounded-lg p-4">
          <div className="flex items-center space-x-3">
            <Check className="h-5 w-5 text-green-400" />
            <span className="text-green-300 font-medium">Wallet Connected Successfully!</span>
          </div>
        </div>
      )}
    </div>
  )
}

function VaultStep() {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="w-16 h-16 bg-purple-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <Shield className="h-8 w-8 text-white" />
        </div>
        <h3 className="text-xl font-semibold text-white mb-2">Create Your Personal Vault</h3>
        <p className="text-slate-300">
          Your vault is a smart contract that holds your funds securely while allowing 
          our AI to execute trades on your behalf.
        </p>
      </div>

      <div className="space-y-4">
        <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <h4 className="text-white font-medium mb-2">Vault Features</h4>
          <ul className="space-y-2 text-sm text-slate-300">
            <li className="flex items-center space-x-2">
              <Check className="h-4 w-4 text-green-400" />
              <span>Non-custodial - you maintain full control</span>
            </li>
            <li className="flex items-center space-x-2">
              <Check className="h-4 w-4 text-green-400" />
              <span>Automated trading with customizable limits</span>
            </li>
            <li className="flex items-center space-x-2">
              <Check className="h-4 w-4 text-green-400" />
              <span>Withdraw anytime without restrictions</span>
            </li>
            <li className="flex items-center space-x-2">
              <Check className="h-4 w-4 text-green-400" />
              <span>Transparent on-chain transactions</span>
            </li>
          </ul>
        </div>

        <div className="bg-blue-900/20 border border-blue-600/20 rounded-lg p-4">
          <div className="flex items-start space-x-3">
            <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-xs text-white font-bold">i</span>
            </div>
            <div>
              <h4 className="text-blue-300 font-medium mb-1">One-time setup</h4>
              <p className="text-sm text-blue-200">
                Creating your vault requires a small transaction fee (~0.01 SOL) and takes about 30 seconds to complete.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function DepositStep() {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="w-16 h-16 bg-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <TrendingUp className="h-8 w-8 text-white" />
        </div>
        <h3 className="text-xl font-semibold text-white mb-2">Fund Your Vault</h3>
        <p className="text-slate-300">
          Deposit USDC to start your AI-powered Solana trading journey.
        </p>
      </div>

      <div className="space-y-4">
        <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <h4 className="text-white font-medium mb-3">Recommended Starting Amounts</h4>
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center p-3 bg-slate-700 rounded-lg">
              <div className="text-lg font-bold text-white">$100</div>
              <div className="text-xs text-slate-400">Conservative</div>
            </div>
            <div className="text-center p-3 bg-purple-600/20 border border-purple-600/30 rounded-lg">
              <div className="text-lg font-bold text-purple-300">$500</div>
              <div className="text-xs text-purple-400">Recommended</div>
            </div>
            <div className="text-center p-3 bg-slate-700 rounded-lg">
              <div className="text-lg font-bold text-white">$1,000+</div>
              <div className="text-xs text-slate-400">Aggressive</div>
            </div>
          </div>
        </div>

        <div className="bg-yellow-900/20 border border-yellow-600/20 rounded-lg p-4">
          <div className="flex items-start space-x-3">
            <div className="w-6 h-6 bg-yellow-600 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-xs text-white font-bold">!</span>
            </div>
            <div>
              <h4 className="text-yellow-300 font-medium mb-1">Start Small</h4>
              <p className="text-sm text-yellow-200">
                We recommend starting with a smaller amount while you get familiar with the platform. 
                You can always deposit more USDC later.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function AuthorizationStep() {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <Shield className="h-8 w-8 text-white" />
        </div>
        <h3 className="text-xl font-semibold text-white mb-2">Authorize Trading Bot</h3>
        <p className="text-slate-300">
          Grant our AI trading bot permission to execute trades on your behalf within your specified limits.
        </p>
      </div>

      <div className="space-y-4">
        <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <h4 className="text-white font-medium mb-3">Bot Permissions</h4>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-slate-300">Execute trades</span>
              <div className="w-2 h-2 bg-green-400 rounded-full"></div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-300">Rebalance portfolio</span>
              <div className="w-2 h-2 bg-green-400 rounded-full"></div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-300">Withdraw funds</span>
              <div className="w-2 h-2 bg-red-400 rounded-full"></div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-300">Change vault settings</span>
              <div className="w-2 h-2 bg-red-400 rounded-full"></div>
            </div>
          </div>
        </div>

        <div className="bg-green-900/20 border border-green-600/20 rounded-lg p-4">
          <div className="flex items-start space-x-3">
            <Check className="h-5 w-5 text-green-400 mt-0.5" />
            <div>
              <h4 className="text-green-300 font-medium mb-1">You Stay in Control</h4>
              <p className="text-sm text-green-200">
                You can revoke bot permissions at any time and always retain the ability to 
                withdraw your funds directly from your vault.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function CompleteStep({ onComplete }: { onComplete: () => void }) {
  return (
    <div className="text-center space-y-6">
      <div className="w-20 h-20 bg-gradient-to-r from-green-600 to-blue-600 rounded-full flex items-center justify-center mx-auto">
        <Check className="h-10 w-10 text-white" />
      </div>
      
      <div className="space-y-4">
        <h3 className="text-2xl font-bold text-white">Setup Complete!</h3>
        <p className="text-slate-300 text-lg">
          Congratulations! Your XORJ vault is ready and your AI trading bot is authorized. 
          You're now ready to start your intelligent Solana investing journey.
        </p>
        
        <div className="bg-gradient-to-r from-purple-900/30 to-blue-900/30 border border-purple-600/20 rounded-lg p-6">
          <h4 className="text-white font-semibold mb-3">What happens next?</h4>
          <ul className="space-y-2 text-sm text-slate-300 text-left">
            <li className="flex items-center space-x-2">
              <div className="w-1.5 h-1.5 bg-purple-400 rounded-full"></div>
              <span>Our AI will analyze market conditions and begin identifying opportunities</span>
            </li>
            <li className="flex items-center space-x-2">
              <div className="w-1.5 h-1.5 bg-blue-400 rounded-full"></div>
              <span>You'll receive notifications about trades and performance updates</span>
            </li>
            <li className="flex items-center space-x-2">
              <div className="w-1.5 h-1.5 bg-green-400 rounded-full"></div>
              <span>Track your portfolio performance in real-time through your dashboard</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  )
}

export default OnboardingTutorial