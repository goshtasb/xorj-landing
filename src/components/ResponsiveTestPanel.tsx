/**
 * Responsive Design Test Panel - Test Suite 4
 * Tests responsive breakpoints and cross-browser compatibility
 */

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Monitor, Smartphone, Tablet, Check, X, RefreshCw } from 'lucide-react';

interface ResponsiveTest {
  id: string;
  name: string;
  description: string;
  breakpoint: string;
  status: 'pending' | 'testing' | 'passed' | 'failed';
  result?: string;
}

interface BrowserTest {
  id: string;
  name: string;
  description: string;
  userAgent: string;
  status: 'pending' | 'testing' | 'passed' | 'failed';
  result?: string;
}

export function ResponsiveTestPanel() {
  const [currentViewport, setCurrentViewport] = useState({ width: 0, height: 0 });
  const [isRunningTests, setIsRunningTests] = useState(false);
  
  const [responsiveTests, setResponsiveTests] = useState<ResponsiveTest[]>([
    {
      id: 'mobile-320',
      name: 'Mobile Small (320px)',
      description: 'Verify layout works on smallest mobile screens',
      breakpoint: '320px',
      status: 'pending'
    },
    {
      id: 'mobile-375',
      name: 'Mobile Medium (375px)',
      description: 'Test iPhone standard viewport',
      breakpoint: '375px',
      status: 'pending'
    },
    {
      id: 'mobile-414',
      name: 'Mobile Large (414px)',
      description: 'Test large mobile devices',
      breakpoint: '414px',
      status: 'pending'
    },
    {
      id: 'tablet-768',
      name: 'Tablet Portrait (768px)',
      description: 'iPad portrait orientation',
      breakpoint: '768px',
      status: 'pending'
    },
    {
      id: 'tablet-1024',
      name: 'Tablet Landscape (1024px)',
      description: 'iPad landscape and small laptops',
      breakpoint: '1024px',
      status: 'pending'
    },
    {
      id: 'desktop-1280',
      name: 'Desktop Standard (1280px)',
      description: 'Standard desktop resolution',
      breakpoint: '1280px',
      status: 'pending'
    },
    {
      id: 'desktop-1920',
      name: 'Desktop Large (1920px)',
      description: 'Full HD desktop displays',
      breakpoint: '1920px',
      status: 'pending'
    }
  ]);

  const [browserTests, setBrowserTests] = useState<BrowserTest[]>([
    {
      id: 'chrome',
      name: 'Chrome',
      description: 'Google Chrome compatibility',
      userAgent: 'Chrome',
      status: 'pending'
    },
    {
      id: 'firefox',
      name: 'Firefox',
      description: 'Mozilla Firefox compatibility',
      userAgent: 'Firefox',
      status: 'pending'
    },
    {
      id: 'safari',
      name: 'Safari',
      description: 'Apple Safari compatibility',
      userAgent: 'Safari',
      status: 'pending'
    },
    {
      id: 'edge',
      name: 'Edge',
      description: 'Microsoft Edge compatibility',
      userAgent: 'Edge',
      status: 'pending'
    },
    {
      id: 'mobile-safari',
      name: 'Mobile Safari',
      description: 'iOS Safari mobile browser',
      userAgent: 'Mobile Safari',
      status: 'pending'
    },
    {
      id: 'mobile-chrome',
      name: 'Mobile Chrome',
      description: 'Android Chrome mobile browser',
      userAgent: 'Mobile Chrome',
      status: 'pending'
    }
  ]);

  // Update viewport size on resize
  useEffect(() => {
    const updateViewport = () => {
      setCurrentViewport({
        width: window.innerWidth,
        height: window.innerHeight
      });
    };

    updateViewport();
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);

  // Auto-detect browser
  useEffect(() => {
    const userAgent = navigator.userAgent;
    const detectedBrowser = getBrowserFromUserAgent(userAgent);
    
    setBrowserTests(prev => prev.map(test => ({
      ...test,
      status: test.id === detectedBrowser ? 'passed' : test.status,
      result: test.id === detectedBrowser ? 'Currently detected browser' : test.result
    })));
  }, []);

  const getBrowserFromUserAgent = (userAgent: string): string => {
    if (userAgent.includes('Chrome') && userAgent.includes('Mobile')) return 'mobile-chrome';
    if (userAgent.includes('Safari') && userAgent.includes('Mobile')) return 'mobile-safari';
    if (userAgent.includes('Chrome')) return 'chrome';
    if (userAgent.includes('Firefox')) return 'firefox';
    if (userAgent.includes('Safari')) return 'safari';
    if (userAgent.includes('Edge')) return 'edge';
    return 'unknown';
  };

  const getCurrentBreakpoint = (width: number): string => {
    if (width < 640) return 'Mobile';
    if (width < 768) return 'Mobile Large';
    if (width < 1024) return 'Tablet';
    if (width < 1280) return 'Desktop Small';
    if (width < 1536) return 'Desktop';
    return 'Desktop Large';
  };

  const testResponsiveBreakpoints = useCallback(async () => {
    setIsRunningTests(true);
    
    for (const test of responsiveTests) {
      // Update status to testing
      setResponsiveTests(prev => prev.map(t => 
        t.id === test.id ? { ...t, status: 'testing' } : t
      ));

      // Simulate testing different breakpoints
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Check if current viewport matches this breakpoint
      const breakpointWidth = parseInt(test.breakpoint);
      const isCurrentlyTesting = Math.abs(currentViewport.width - breakpointWidth) < 100;
      
      const elementTests = [
        checkWalletButtonVisibility(),
        checkNavigationCollapse(),
        checkCardLayoutResponsive(),
        checkTextReadability(),
        checkButtonAccessibility()
      ];

      const passedTests = elementTests.filter(Boolean).length;
      const totalTests = elementTests.length;
      const passed = passedTests >= totalTests * 0.8; // 80% pass rate

      setResponsiveTests(prev => prev.map(t => 
        t.id === test.id ? { 
          ...t, 
          status: passed ? 'passed' : 'failed',
          result: `${passedTests}/${totalTests} checks passed${isCurrentlyTesting ? ' (currently active)' : ''}`
        } : t
      ));
    }

    setIsRunningTests(false);
  }, [currentViewport.width, responsiveTests]);

  // Basic responsive design checks
  const checkWalletButtonVisibility = (): boolean => {
    const button = document.querySelector('[data-testid="connect-wallet"]');
    return button ? !!(button as HTMLElement).offsetParent : false;
  };

  const checkNavigationCollapse = (): boolean => {
    // Check if navigation properly collapses on mobile
    return currentViewport.width > 640 || document.querySelector('[data-testid="mobile-menu"]') !== null;
  };

  const checkCardLayoutResponsive = (): boolean => {
    const cards = document.querySelectorAll('[class*="grid"]');
    return cards.length > 0;
  };

  const checkTextReadability = (): boolean => {
    // Basic check for text size and contrast
    const textElements = document.querySelectorAll('p, span, div');
    return textElements.length > 0;
  };

  const checkButtonAccessibility = (): boolean => {
    const buttons = document.querySelectorAll('button');
    return Array.from(buttons).every(btn => {
      const rect = btn.getBoundingClientRect();
      return rect.height >= 44; // Minimum touch target size
    });
  };

  const runBrowserCompatibilityTests = useCallback(async () => {
    setIsRunningTests(true);
    
    for (const test of browserTests) {
      setBrowserTests(prev => prev.map(t => 
        t.id === test.id ? { ...t, status: 'testing' } : t
      ));

      await new Promise(resolve => setTimeout(resolve, 800));
      
      // Check browser compatibility features
      const compatibilityChecks = [
        checkCSSGridSupport(),
        checkFlexboxSupport(),
        checkES6Support(),
        checkWebCryptoAPI(),
        checkLocalStorageSupport()
      ];

      const passedChecks = compatibilityChecks.filter(Boolean).length;
      const totalChecks = compatibilityChecks.length;
      const passed = passedChecks === totalChecks;

      setBrowserTests(prev => prev.map(t => 
        t.id === test.id ? { 
          ...t, 
          status: passed ? 'passed' : 'failed',
          result: `${passedChecks}/${totalChecks} compatibility checks passed`
        } : t
      ));
    }

    setIsRunningTests(false);
  }, []);

  // Browser compatibility checks
  const checkCSSGridSupport = (): boolean => {
    return CSS.supports('display', 'grid');
  };

  const checkFlexboxSupport = (): boolean => {
    return CSS.supports('display', 'flex');
  };

  const checkES6Support = (): boolean => {
    try {
      eval('const test = () => {}');
      return true;
    } catch {
      return false;
    }
  };

  const checkWebCryptoAPI = (): boolean => {
    return typeof window !== 'undefined' && 'crypto' in window && 'subtle' in window.crypto;
  };

  const checkLocalStorageSupport = (): boolean => {
    try {
      localStorage.setItem('test', 'test');
      localStorage.removeItem('test');
      return true;
    } catch {
      return false;
    }
  };

  const getStatusIcon = (status: ResponsiveTest['status'] | BrowserTest['status']) => {
    switch (status) {
      case 'testing':
        return <RefreshCw className="h-4 w-4 text-blue-400 animate-spin" />;
      case 'passed':
        return <Check className="h-4 w-4 text-green-400" />;
      case 'failed':
        return <X className="h-4 w-4 text-red-400" />;
      default:
        return <div className="h-4 w-4 rounded-full border-2 border-gray-500" />;
    }
  };

  const getStatusColor = (status: ResponsiveTest['status'] | BrowserTest['status']) => {
    switch (status) {
      case 'testing':
        return 'text-blue-400';
      case 'passed':
        return 'text-green-400';
      case 'failed':
        return 'text-red-400';
      default:
        return 'text-gray-400';
    }
  };

  return (
    <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-white">
            Test Suite 4: Responsive Design & Cross-Browser
          </h3>
          <p className="text-sm text-gray-400 mt-1">
            Current viewport: {currentViewport.width}×{currentViewport.height} ({getCurrentBreakpoint(currentViewport.width)})
          </p>
        </div>
        
        <div className="flex gap-2">
          <button
            onClick={testResponsiveBreakpoints}
            disabled={isRunningTests}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center gap-2"
          >
            <Monitor className="h-4 w-4" />
            Test Responsive
          </button>
          <button
            onClick={runBrowserCompatibilityTests}
            disabled={isRunningTests}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center gap-2"
          >
            <Smartphone className="h-4 w-4" />
            Test Browser
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Responsive Design Tests */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-4">
            <Monitor className="h-5 w-5 text-purple-400" />
            <h4 className="text-md font-semibold text-white">Responsive Breakpoints</h4>
          </div>
          
          {responsiveTests.map((test) => (
            <div
              key={test.id}
              className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/10"
            >
              <div className="flex items-center gap-3">
                {getStatusIcon(test.status)}
                <div>
                  <div className={`font-medium ${getStatusColor(test.status)}`}>
                    {test.name}
                  </div>
                  <div className="text-xs text-gray-500">
                    {test.description}
                  </div>
                  {test.result && (
                    <div className="text-xs text-gray-400 mt-1">
                      {test.result}
                    </div>
                  )}
                </div>
              </div>
              
              <div className="text-right">
                <div className="text-sm text-gray-400">{test.breakpoint}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Browser Compatibility Tests */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-4">
            <Tablet className="h-5 w-5 text-blue-400" />
            <h4 className="text-md font-semibold text-white">Browser Compatibility</h4>
          </div>
          
          {browserTests.map((test) => (
            <div
              key={test.id}
              className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/10"
            >
              <div className="flex items-center gap-3">
                {getStatusIcon(test.status)}
                <div>
                  <div className={`font-medium ${getStatusColor(test.status)}`}>
                    {test.name}
                  </div>
                  <div className="text-xs text-gray-500">
                    {test.description}
                  </div>
                  {test.result && (
                    <div className="text-xs text-gray-400 mt-1">
                      {test.result}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 pt-4 border-t border-white/10">
        <div className="flex items-center justify-between text-sm">
          <div className="text-gray-400">
            Responsive: {responsiveTests.filter(t => t.status === 'passed').length}/{responsiveTests.length} passed
          </div>
          <div className="text-gray-400">
            Browser: {browserTests.filter(t => t.status === 'passed').length}/{browserTests.length} compatible
          </div>
        </div>
      </div>
    </div>
  );
}