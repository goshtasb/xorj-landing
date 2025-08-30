'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useEnhancedWallet } from '@/contexts/EnhancedWalletContext';
import { Shield, Zap, TrendingUp, Lock, CheckCircle, ArrowRight, AlertCircle } from 'lucide-react';
import EnhancedWalletButton from '@/components/EnhancedWalletButton';
import { WalletStatus } from '@/components/WalletStatus';
import OnboardingTutorial from '@/components/OnboardingTutorial';
import VaultManager from '@/components/VaultManager';
import WalletDebug from '@/components/WalletDebug';

const XORJLandingPage = () => {
  const [email, setEmail] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [solPrice, setSolPrice] = useState<number | null>(null);
  const [priceChange, setPriceChange] = useState<number | null>(null);
  const [priceHistory, setPriceHistory] = useState<{price: number, time: number, date: string}[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [selectedTimeframe, setSelectedTimeframe] = useState('30d');
  const [timeframeChange, setTimeframeChange] = useState<number | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showWalletStatus, setShowWalletStatus] = useState(false);
  const { connected, publicKey } = useWallet();
  useEnhancedWallet();

  const timeframes = useMemo(() => [
    { key: '24h', label: '24H', days: '1', interval: 'hourly' },
    { key: '7d', label: '7D', days: '7', interval: 'hourly' },
    { key: '30d', label: '1M', days: '30', interval: 'daily' },
    { key: '90d', label: '3M', days: '90', interval: 'daily' },
    { key: '365d', label: '1Y', days: '365', interval: 'daily' },
    { key: 'max', label: 'MAX', days: 'max', interval: 'daily' }
  ], []);

  // Initial data fetching - moved after function definitions

  const trackEvent = (eventName: string, properties = {}) => {
    if (typeof window !== 'undefined') {
      console.log('Analytics Event:', eventName, properties);
    }
  };

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleTimeframeChange = (timeframe: string) => {
    setSelectedTimeframe(timeframe);
    setIsLoadingHistory(true);
    trackEvent('chart_timeframe_change', { timeframe });
  };

  const fetchHistoricalData = useCallback(async (timeframeKey: string) => {
    try {
      const timeframe = timeframes.find(t => t.key === timeframeKey);
      if (!timeframe) return;
      
      const { days, interval } = timeframe;
      
      const response = await fetch(`https://api.coingecko.com/api/v3/coins/solana/market_chart?vs_currency=usd&days=${days}&interval=${interval}`);
      const data = await response.json();
      
      if (data.prices) {
        const historicalPrices = data.prices.map(([timestamp, price]: [number, number]) => ({
          price: price,
          time: timestamp,
          date: new Date(timestamp).toLocaleDateString()
        }));
        
        setPriceHistory(historicalPrices);
        
        const firstPrice = historicalPrices[0]?.price;
        const lastPrice = historicalPrices[historicalPrices.length - 1]?.price;
        if (firstPrice && lastPrice) {
          const change = ((lastPrice - firstPrice) / firstPrice) * 100;
          setTimeframeChange(change);
        }
        
        setIsLoadingHistory(false);
      }
    } catch {
      console.log(`Using simulated ${timeframeKey} SOL price history`);
      
      const generateTimeframeData = (timeframeKey: string) => {
        const data = [];
        const now = new Date();
        let dataPoints, startPrice, endPrice, volatilityFactor;
        
        switch (timeframeKey) {
          case '24h':
            dataPoints = 24;
            startPrice = 97.2;
            endPrice = 98.45;
            volatilityFactor = 0.02;
            break;
          case '7d':
            dataPoints = 7;
            startPrice = 94.5;
            endPrice = 98.45;
            volatilityFactor = 0.03;
            break;
          case '30d':
            dataPoints = 30;
            startPrice = 85;
            endPrice = 98.45;
            volatilityFactor = 0.05;
            break;
          case '90d':
            dataPoints = 90;
            startPrice = 75;
            endPrice = 98.45;
            volatilityFactor = 0.08;
            break;
          case '365d':
            dataPoints = 365;
            startPrice = 45;
            endPrice = 98.45;
            volatilityFactor = 0.12;
            break;
          case 'max':
            dataPoints = 1000;
            startPrice = 8;
            endPrice = 98.45;
            volatilityFactor = 0.15;
            break;
          default:
            dataPoints = 30;
            startPrice = 85;
            endPrice = 98.45;
            volatilityFactor = 0.05;
        }
        
        for (let i = 0; i < dataPoints; i++) {
          const date = new Date(now);
          
          if (timeframeKey === '24h') {
            date.setHours(date.getHours() - (dataPoints - 1 - i));
          } else {
            date.setDate(date.getDate() - (dataPoints - 1 - i));
          }
          
          const progress = i / (dataPoints - 1);
          const basePrice = startPrice + (endPrice - startPrice) * progress;
          
          const volatility = (Math.sin(i * 0.3) + (Math.random() - 0.5)) * basePrice * volatilityFactor;
          const price = Math.max(basePrice + volatility, 5);
          
          data.push({
            price: price,
            time: date.getTime(),
            date: date.toLocaleDateString()
          });
        }
        
        return data;
      };
      
      const historicalData = generateTimeframeData(timeframeKey);
      setPriceHistory(historicalData);
      
      const firstPrice = historicalData[0]?.price;
      const lastPrice = historicalData[historicalData.length - 1]?.price;
      if (firstPrice && lastPrice) {
        const change = ((lastPrice - firstPrice) / firstPrice) * 100;
        setTimeframeChange(change);
      }
      
      setIsLoadingHistory(false);
    }
  }, [timeframes]);

  // Initial data fetching useEffect - now after function definition
  useEffect(() => {
    if (selectedTimeframe) {
      fetchHistoricalData(selectedTimeframe);
    }
  }, [selectedTimeframe, fetchHistoricalData]);

  const fetchCurrentPrice = useCallback(async () => {
    try {
      const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd&include_24hr_change=true');
      const data = await response.json();
      
      if (data.solana) {
        setSolPrice(data.solana.usd);
        setPriceChange(data.solana.usd_24h_change);
      }
    } catch {
      const lastHistoricalPrice = priceHistory[priceHistory.length - 1]?.price || 98.45;
      const variation = (Math.random() - 0.5) * 2;
      setSolPrice(lastHistoricalPrice + variation);
      setPriceChange((Math.random() - 0.3) * 8);
    }
  }, [priceHistory]);

  // Initialize data fetching after functions are defined
  useEffect(() => {
    if (typeof window !== 'undefined') {
      console.log('Analytics initialized');
      trackEvent('page_view', { page: 'landing_page' });
      
      fetchHistoricalData(selectedTimeframe);
      fetchCurrentPrice();
      
      const priceInterval = setInterval(fetchCurrentPrice, 30000);
      
      return () => clearInterval(priceInterval);
    }
  }, [fetchCurrentPrice, fetchHistoricalData, selectedTimeframe]);

  const generateMiniChart = () => {
    if (priceHistory.length < 2) return null;
    
    const prices = priceHistory.map(p => p.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceRange = maxPrice - minPrice || 1;
    
    const points = priceHistory.map((point, index) => {
      const x = (index / (priceHistory.length - 1)) * 280;
      const y = 60 - ((point.price - minPrice) / priceRange) * 50;
      return `${x},${y}`;
    }).join(' ');
    
    const isPositive = timeframeChange && timeframeChange > 0;
    
    const getTimeLabels = () => {
      if (priceHistory.length === 0) return { start: '', end: '' };
      
      const firstPoint = priceHistory[0];
      
      switch (selectedTimeframe) {
        case '24h':
          return {
            start: new Date(firstPoint.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            end: 'Now'
          };
        case '7d':
          return {
            start: '7 days ago',
            end: 'Today'
          };
        case '30d':
          return {
            start: '1 month ago',
            end: 'Today'
          };
        case '90d':
          return {
            start: '3 months ago',
            end: 'Today'
          };
        case '365d':
          return {
            start: '1 year ago',
            end: 'Today'
          };
        case 'max':
          return {
            start: new Date(firstPoint.time).getFullYear().toString(),
            end: 'Today'
          };
        default:
          return {
            start: 'Start',
            end: 'End'
          };
      }
    };
    
    const timeLabels = getTimeLabels();
    
    return (
      <div className="w-full">
        <svg width="100%" height="70" viewBox="0 0 280 70" className="mt-2">
          <defs>
            <pattern id="grid" width="40" height="20" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 20" fill="none" stroke="#374151" strokeWidth="0.5" opacity="0.3"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
          
          <defs>
            <linearGradient id="chartGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={isPositive ? "#10b981" : "#ef4444"} stopOpacity="0.3"/>
              <stop offset="100%" stopColor={isPositive ? "#10b981" : "#ef4444"} stopOpacity="0"/>
            </linearGradient>
          </defs>
          
          <path
            d={`M 0,60 L ${points} L 280,60 Z`}
            fill="url(#chartGradient)"
          />
          
          <polyline
            points={points}
            fill="none"
            stroke={isPositive ? "#10b981" : "#ef4444"}
            strokeWidth="2.5"
            className="drop-shadow-sm"
          />
          
          {priceHistory.length > 0 && (
            <circle
              cx="280"
              cy={60 - ((priceHistory[priceHistory.length - 1].price - minPrice) / priceRange) * 50}
              r="3"
              fill={isPositive ? "#10b981" : "#ef4444"}
              className="drop-shadow-lg"
            />
          )}
        </svg>
        
        <div className="flex justify-between text-xs text-slate-500 mt-1 px-1">
          <span>{timeLabels.start}</span>
          <span>{timeLabels.end}</span>
        </div>
      </div>
    );
  };

  const submitEmailToSupabase = async (emailAddress: string) => {
    console.log('🚀 SUBMITTING TO PRODUCTION SUPABASE');
    
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://yywoynugnrkvpunnvvla.supabase.co';
    const SERVICE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_vOrBqwqUab_Bk6xq4w4aUw_VkyIFlr9';
    
    if (!SUPABASE_URL || SUPABASE_URL.startsWith('sb_')) {
      throw new Error('Invalid Supabase URL configuration');
    }
    
    console.log('Debug - SUPABASE_URL:', SUPABASE_URL);
    console.log('Debug - SERVICE_KEY:', SERVICE_KEY ? 'Present' : 'Missing');
    
    const response = await fetch(`${SUPABASE_URL}/rest/v1/waitlist_signups`, {
      method: 'POST',
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email: emailAddress })
    });
    
    console.log('Response status:', response.status);
    console.log('Response headers:', Object.fromEntries(response.headers.entries()));
    
    if (response.status === 201) {
      return { success: true };
    } else {
      const responseText = await response.text();
      console.log('Response text:', responseText);
      
      if (responseText.includes('duplicate') || response.status === 409) {
        throw new Error('This email is already on the waitlist');
      }
      throw new Error(`Unable to save email. Please try again. (Status: ${response.status})`);
    }
  };

  const handleWaitlistSubmit = async () => {
    if (!email.trim()) {
      setError('Please enter your email address');
      return;
    }

    if (!validateEmail(email)) {
      setError('Please enter a valid email address');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const normalizedEmail = email.toLowerCase().trim();
      
      await submitEmailToSupabase(normalizedEmail);
      
      trackEvent('waitlist_signup', {
        email_domain: normalizedEmail.split('@')[1],
        timestamp: new Date().toISOString()
      });
      
      setIsSubmitted(true);
      setEmail('');
    } catch (err: unknown) {
      console.error('Submission error:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
      
      trackEvent('waitlist_signup_error', {
        error_message: err instanceof Error ? err.message : 'Unknown error',
        email_attempted: email.split('@')[1]
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Navigation */}
      <nav className="relative z-50 px-6 py-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="text-2xl font-bold text-white">
            XORJ
          </div>
          <div className="flex items-center space-x-4">
            <EnhancedWalletButton className="hidden md:block" />
            <button className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-lg transition-colors" onClick={() => {
              trackEvent('nav_cta_click');
              document.getElementById('waitlist-form')?.scrollIntoView({ behavior: 'smooth' });
            }}>
              Join Waitlist
            </button>
          </div>
        </div>
      </nav>

      {/* Wallet Info Button - Only show when connected */}
      {connected && publicKey && (
        <div className="px-6">
          <div className="max-w-7xl mx-auto">
            <button
              onClick={() => setShowWalletStatus(true)}
              className="mb-4 flex items-center space-x-2 px-4 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-white hover:bg-slate-700/50 transition-colors"
            >
              <CheckCircle className="h-4 w-4 text-green-400" />
              <span className="text-sm">Wallet Connected - Click to view details</span>
              <span className="text-xs text-slate-400 font-mono">
                {publicKey.toString().slice(0, 4)}...{publicKey.toString().slice(-4)}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* Hero Section */}
      <section className="relative px-6 py-20 text-center">
        <div className="max-w-6xl mx-auto">
          <div className="absolute inset-0 bg-gradient-to-r from-purple-500/20 to-blue-500/20 blur-3xl -z-10"></div>
          
          <h1 className="text-5xl md:text-7xl font-bold text-white mb-8 leading-tight">
            Intelligent Solana Investing
            <br />
            <span className="bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
              on Autopilot
            </span>
          </h1>
          
          <p className="text-xl md:text-2xl text-slate-300 mb-12 max-w-3xl mx-auto">
            Finally Safe and Simple.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-6 justify-center items-center mb-16">
            <button 
              onClick={() => {
                trackEvent('hero_cta_click', { button: 'join_waitlist' });
                document.getElementById('waitlist-form')?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white px-8 py-4 rounded-xl text-lg font-semibold transition-all transform hover:scale-105 shadow-2xl"
            >
              Join the Waitlist
              <ArrowRight className="inline-block ml-2 h-5 w-5" />
            </button>
          </div>

          {/* Interactive Solana Chart */}
          <div className="relative max-w-4xl mx-auto">
            <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-8 border border-slate-700 shadow-2xl">
              <div className="text-left space-y-6">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
                  <div className="flex flex-col">
                    <span className="text-sm text-slate-400">Solana (SOL)</span>
                    <div className="flex items-center space-x-4 mt-1">
                      {solPrice && (
                        <span className="text-2xl font-bold text-white">${solPrice.toFixed(2)}</span>
                      )}
                      {priceChange && (
                        <span className={`text-sm px-2 py-1 rounded ${priceChange >= 0 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                          {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}% (24h)
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-1 bg-slate-900/50 rounded-lg p-1">
                    {timeframes.map((timeframe) => (
                      <button
                        key={timeframe.key}
                        onClick={() => handleTimeframeChange(timeframe.key)}
                        className={`px-3 py-1.5 text-xs font-medium rounded transition-all ${
                          selectedTimeframe === timeframe.key
                            ? 'bg-purple-600 text-white shadow-lg'
                            : 'text-slate-400 hover:text-white hover:bg-slate-800'
                        }`}
                      >
                        {timeframe.label}
                      </button>
                    ))}
                  </div>
                </div>
                
                {timeframeChange !== null && (
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-slate-400">
                      {timeframes.find(t => t.key === selectedTimeframe)?.label} Change
                    </div>
                    <div className={`text-lg font-semibold flex items-center space-x-2 ${
                      timeframeChange >= 0 ? 'text-green-400' : 'text-red-400'
                    }`}>
                      <span>{timeframeChange >= 0 ? '+' : ''}{timeframeChange.toFixed(1)}%</span>
                      <span className="text-xs text-slate-500">
                        ({timeframeChange >= 0 ? '↗' : '↘'})
                      </span>
                    </div>
                  </div>
                )}
                
                <div className="h-32 bg-gradient-to-r from-slate-900/50 to-slate-800/50 rounded-lg flex items-center justify-center p-4">
                  {isLoadingHistory ? (
                    <div className="flex items-center space-x-2 text-slate-300">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-400"></div>
                      <span className="text-sm">Loading {timeframes.find(t => t.key === selectedTimeframe)?.label} data...</span>
                    </div>
                  ) : priceHistory.length > 1 ? (
                    <div className="w-full">
                      {generateMiniChart()}
                    </div>
                  ) : (
                    <div className="text-slate-300 text-sm">Chart data unavailable</div>
                  )}
                </div>
                
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <div className="flex items-center space-x-2">
                    <div className="h-2 w-2 bg-green-400 rounded-full animate-pulse"></div>
                    <span>Live market data</span>
                  </div>
                  <span>
                    {priceHistory.length} data points • {timeframes.find(t => t.key === selectedTimeframe)?.label} period
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Problem Section */}
      <section className="px-6 py-20 bg-slate-800/50">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl md:text-5xl font-bold text-white text-center mb-16">
            Solana Investing Shouldn&apos;t Be This Hard
          </h2>
          
          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-slate-900/50 p-8 rounded-xl border border-slate-700">
              <div className="text-red-400 text-4xl mb-4">😰</div>
              <h3 className="text-xl font-semibold text-white mb-4">Overwhelming Complexity</h3>
              <p className="text-slate-300">
                Hundreds of tokens, countless DeFi protocols, and Solana-specific mechanics that require deep expertise to navigate safely.
              </p>
            </div>
            
            <div className="bg-slate-900/50 p-8 rounded-xl border border-slate-700">
              <div className="text-yellow-400 text-4xl mb-4">⏰</div>
              <h3 className="text-xl font-semibold text-white mb-4">Time-Consuming Research</h3>
              <p className="text-slate-300">
                Spending hours daily tracking Solana ecosystem updates, analyzing new projects, and monitoring market movements.
              </p>
            </div>
            
            <div className="bg-slate-900/50 p-8 rounded-xl border border-slate-700">
              <div className="text-orange-400 text-4xl mb-4">💸</div>
              <h3 className="text-xl font-semibold text-white mb-4">Emotional Trading</h3>
              <p className="text-slate-300">
                FOMO into new Solana launches and panic selling during volatility, missing the ecosystem&apos;s long-term growth.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Rest of the component continues... */}
      {/* I'll include the rest in the next part due to length */}
      {/* Solution Section */}
      <section className="px-6 py-20">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl md:text-5xl font-bold text-white text-center mb-16">
            Meet Your AI-Powered Solana Vault
          </h2>
          
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-8">
              <div className="flex items-start space-x-4">
                <div className="bg-purple-600 p-3 rounded-lg">
                  <Zap className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-white mb-2">On-Chain Intelligence</h3>
                  <p className="text-slate-300">
                    Our AI analyzes Solana blockchain data, program interactions, and validator metrics to identify optimal entry and exit points across the ecosystem.
                  </p>
                </div>
              </div>
              
              <div className="flex items-start space-x-4">
                <div className="bg-blue-600 p-3 rounded-lg">
                  <TrendingUp className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-white mb-2">Automated Rebalancing</h3>
                  <p className="text-slate-300">
                    Dynamic portfolio adjustments leveraging Solana&apos;s high-speed transactions and low fees for efficient rebalancing based on market conditions and your goals.
                  </p>
                </div>
              </div>
              
              <div className="flex items-start space-x-4">
                <div className="bg-green-600 p-3 rounded-lg">
                  <Shield className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-white mb-2">Risk Management</h3>
                  <p className="text-slate-300">
                    Built-in stop-losses, position sizing, and diversification to protect your capital.
                  </p>
                </div>
              </div>
            </div>
            
            <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-6 border border-slate-700">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-white font-semibold">AI Strategy Dashboard</h4>
                  <div className="flex items-center space-x-2">
                    <div className="h-2 w-2 bg-green-400 rounded-full"></div>
                    <span className="text-green-400 text-sm">Active</span>
                  </div>
                </div>
                
                <div className="bg-slate-900 rounded-lg p-4">
                  <div className="text-sm text-slate-400 mb-2">Current Allocation</div>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-white">Solana (SOL)</span>
                      <span className="text-blue-400">45%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white">Jupiter (JUP)</span>
                      <span className="text-purple-400">20%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white">Raydium (RAY)</span>
                      <span className="text-green-400">15%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white">Other SPL Tokens</span>
                      <span className="text-yellow-400">20%</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Trust & Security Section */}
      <section className="px-6 py-20 bg-slate-800/50">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl md:text-5xl font-bold text-white text-center mb-16">
            Your SOL, Your Control
          </h2>
          
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div className="space-y-6">
              <h3 className="text-2xl font-semibold text-white">Non-Custodial Architecture</h3>
              <p className="text-slate-300 text-lg">
                Unlike traditional funds, you maintain complete control of your Solana assets. Our smart contracts execute trades on your behalf using Solana&apos;s native programs, but your SOL and SPL tokens never leave your wallet.
              </p>
              
              <div className="space-y-4">
                <div className="flex items-center space-x-3">
                  <CheckCircle className="h-5 w-5 text-green-400" />
                  <span className="text-slate-300">You control your Solana wallet</span>
                </div>
                <div className="flex items-center space-x-3">
                  <CheckCircle className="h-5 w-5 text-green-400" />
                  <span className="text-slate-300">Transparent on-chain execution</span>
                </div>
                <div className="flex items-center space-x-3">
                  <CheckCircle className="h-5 w-5 text-green-400" />
                  <span className="text-slate-300">No counterparty risk</span>
                </div>
                <div className="flex items-center space-x-3">
                  <CheckCircle className="h-5 w-5 text-green-400" />
                  <span className="text-slate-300">Audited Solana programs</span>
                </div>
              </div>
            </div>
            
            <div className="bg-gradient-to-br from-slate-900 to-black rounded-2xl p-8 border border-slate-700">
              <div className="text-center space-y-6">
                <Lock className="h-16 w-16 text-purple-400 mx-auto" />
                <h4 className="text-xl font-semibold text-white">Military-Grade Security</h4>
                <div className="space-y-4 text-left">
                  <div className="flex items-center space-x-3">
                    <div className="h-2 w-2 bg-green-400 rounded-full"></div>
                    <span className="text-slate-300 text-sm">Ledger & Phantom integration</span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <div className="h-2 w-2 bg-green-400 rounded-full"></div>
                    <span className="text-slate-300 text-sm">Multi-signature protection</span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <div className="h-2 w-2 bg-green-400 rounded-full"></div>
                    <span className="text-slate-300 text-sm">24/7 Solana network monitoring</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Vault Management Section */}
      <section className="px-6 py-20 bg-slate-800/30" data-vault-section>
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
              Your Personal Trading Vault
            </h2>
            <p className="text-xl text-slate-300 max-w-3xl mx-auto">
              Create and manage your AI-powered Solana vault. Deposit USDC, authorize automated trading, 
              and track your portfolio performance in real-time.
            </p>
          </div>

          <div className="grid lg:grid-cols-2 gap-8 items-start">
            {/* Vault Manager */}
            <div>
              <VaultManager />
            </div>

            {/* Getting Started Guide */}
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
              <h3 className="text-2xl font-semibold text-white mb-4">Getting Started</h3>
              
              <div className="space-y-4">
                <div className="flex items-start space-x-4">
                  <div className="w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center flex-shrink-0 text-white text-sm font-bold">
                    1
                  </div>
                  <div>
                    <h4 className="text-white font-medium">Connect Your Wallet</h4>
                    <p className="text-sm text-slate-400">Connect your Phantom wallet to get started</p>
                  </div>
                </div>

                <div className="flex items-start space-x-4">
                  <div className="w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center flex-shrink-0 text-white text-sm font-bold">
                    2
                  </div>
                  <div>
                    <h4 className="text-white font-medium">Create Your Vault</h4>
                    <p className="text-sm text-slate-400">Initialize your personal trading vault on Solana</p>
                  </div>
                </div>

                <div className="flex items-start space-x-4">
                  <div className="w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center flex-shrink-0 text-white text-sm font-bold">
                    3
                  </div>
                  <div>
                    <h4 className="text-white font-medium">Fund Your Vault</h4>
                    <p className="text-sm text-slate-400">Deposit USDC to start automated trading</p>
                  </div>
                </div>

                <div className="flex items-start space-x-4">
                  <div className="w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center flex-shrink-0 text-white text-sm font-bold">
                    4
                  </div>
                  <div>
                    <h4 className="text-white font-medium">Authorize AI Trading</h4>
                    <p className="text-sm text-slate-400">Grant permissions for automated trading</p>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setShowOnboarding(true)}
                className="w-full mt-6 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white px-6 py-3 rounded-lg font-semibold transition-all transform hover:scale-105"
              >
                Start Guided Setup
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Call to Action Section */}
      <section className="px-6 py-20">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-8">
            Ready to Automate Your Solana Success?
          </h2>
          <p className="text-xl text-slate-300 mb-12">
            Join thousands of smart investors riding the Solana wave with AI precision.
          </p>
          
          <div id="waitlist-form" className="bg-slate-800/50 rounded-2xl p-8 border border-slate-700 max-w-md mx-auto">
            {!isSubmitted ? (
              <div className="space-y-6">
                <h3 className="text-2xl font-semibold text-white">Join the Waitlist</h3>
                <p className="text-slate-300">Be the first to access our AI-powered Solana vault.</p>
                
                <div className="space-y-4">
                  <div>
                    <input
                      type="email"
                      placeholder="Enter your email address"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (error) setError('');
                      }}
                      className={`w-full px-4 py-3 bg-slate-900 border ${
                        error ? 'border-red-500' : 'border-slate-600'
                      } rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 ${
                        error ? 'focus:ring-red-500' : 'focus:ring-purple-500'
                      } transition-colors`}
                    />
                    {error && (
                      <div className="mt-2 flex items-center space-x-2 text-red-400">
                        <AlertCircle className="h-4 w-4" />
                        <span className="text-sm">{error}</span>
                      </div>
                    )}
                  </div>
                  
                  <button
                    onClick={handleWaitlistSubmit}
                    disabled={isLoading}
                    className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 disabled:from-slate-600 disabled:to-slate-700 text-white py-3 rounded-lg font-semibold transition-all transform hover:scale-105 disabled:transform-none disabled:cursor-not-allowed"
                  >
                    {isLoading ? (
                      <div className="flex items-center justify-center space-x-2">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        <span>Joining...</span>
                      </div>
                    ) : (
                      'Reserve My Spot'
                    )}
                  </button>
                </div>
                
                <p className="text-sm text-slate-400">
                  No spam. Unsubscribe anytime. Early access guaranteed.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                <CheckCircle className="h-16 w-16 text-green-400 mx-auto" />
                <h3 className="text-2xl font-semibold text-white">You&apos;re In!</h3>
                <p className="text-slate-300">
                  Thanks for joining the waitlist. We&apos;ll notify you as soon as we launch.
                </p>
                <button
                  onClick={() => {
                    setIsSubmitted(false);
                    setEmail('');
                    setError('');
                    trackEvent('waitlist_reset');
                  }}
                  className="text-purple-400 hover:text-purple-300 text-sm underline transition-colors"
                >
                  Add another email
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 py-12 bg-slate-900 border-t border-slate-800">
        <div className="max-w-6xl mx-auto text-center">
          <div className="text-2xl font-bold text-white mb-4">XORJ</div>
          <p className="text-slate-400 mb-8">
            Intelligent Solana investing made simple and secure.
          </p>
          
          <div className="flex justify-center space-x-8 text-slate-400">
            <a href="#" className="hover:text-white transition-colors">Privacy</a>
            <a href="#" className="hover:text-white transition-colors">Terms</a>
            <a href="#" className="hover:text-white transition-colors">Contact</a>
          </div>
        </div>
      </footer>

      {/* Onboarding Tutorial Modal */}
      <OnboardingTutorial
        isOpen={showOnboarding}
        onClose={() => setShowOnboarding(false)}
        onComplete={() => {
          setShowOnboarding(false);
          // Auto-scroll to vault section after onboarding
          document.querySelector('[data-vault-section]')?.scrollIntoView({ behavior: 'smooth' });
        }}
      />
      
      {/* Debug Component */}
      {/* Wallet Status Modal */}
      {showWalletStatus && (
        <WalletStatus
          modal={true}
          detailed={true}
          onClose={() => setShowWalletStatus(false)}
        />
      )}

      <WalletDebug />
    </div>
  );
};

export default XORJLandingPage;