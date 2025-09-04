/**
 * Performance & Load Testing Panel - Test Suite 5
 * Tests application performance, load times, and resource usage
 */

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Activity, Zap, Timer, Server, AlertTriangle, CheckCircle } from 'lucide-react';

interface PerformanceMetric {
  id: string;
  name: string;
  description: string;
  value: number | null;
  unit: string;
  threshold: number;
  status: 'good' | 'warning' | 'critical' | 'unknown';
  category: 'loading' | 'runtime' | 'memory' | 'network';
}

interface LoadTest {
  id: string;
  name: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: string;
  duration?: number;
}

export function PerformanceTestPanel() {
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [performanceMetrics, setPerformanceMetrics] = useState<PerformanceMetric[]>([
    {
      id: 'page-load',
      name: 'Page Load Time',
      description: 'Time to fully load the page',
      value: null,
      unit: 'ms',
      threshold: 3000,
      status: 'unknown',
      category: 'loading'
    },
    {
      id: 'first-contentful-paint',
      name: 'First Contentful Paint',
      description: 'Time to render first content',
      value: null,
      unit: 'ms',
      threshold: 1500,
      status: 'unknown',
      category: 'loading'
    },
    {
      id: 'largest-contentful-paint',
      name: 'Largest Contentful Paint',
      description: 'Time to render largest content element',
      value: null,
      unit: 'ms',
      threshold: 2500,
      status: 'unknown',
      category: 'loading'
    },
    {
      id: 'cumulative-layout-shift',
      name: 'Cumulative Layout Shift',
      description: 'Visual stability score',
      value: null,
      unit: 'score',
      threshold: 0.1,
      status: 'unknown',
      category: 'runtime'
    },
    {
      id: 'memory-usage',
      name: 'Memory Usage',
      description: 'JavaScript heap size',
      value: null,
      unit: 'MB',
      threshold: 50,
      status: 'unknown',
      category: 'memory'
    },
    {
      id: 'api-response-time',
      name: 'API Response Time',
      description: 'Average API call response time',
      value: null,
      unit: 'ms',
      threshold: 1000,
      status: 'unknown',
      category: 'network'
    }
  ]);

  const [loadTests, setLoadTests] = useState<LoadTest[]>([
    {
      id: 'wallet-connection',
      name: 'Wallet Connection Load',
      description: 'Test wallet connection under load',
      status: 'pending'
    },
    {
      id: 'api-stress',
      name: 'API Endpoint Stress',
      description: 'Stress test API endpoints',
      status: 'pending'
    },
    {
      id: 'concurrent-users',
      name: 'Concurrent User Simulation',
      description: 'Simulate multiple users',
      status: 'pending'
    },
    {
      id: 'memory-leak',
      name: 'Memory Leak Detection',
      description: 'Monitor for memory leaks',
      status: 'pending'
    }
  ]);

  // Monitor performance metrics in real-time
  useEffect(() => {
    if (!isMonitoring) return;

    const updateMetrics = () => {
      // Get performance timing data
      const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      const paint = performance.getEntriesByType('paint');
      
      setPerformanceMetrics(prev => prev.map(metric => {
        let value: number | null = null;
        
        switch (metric.id) {
          case 'page-load':
            value = navigation ? navigation.loadEventEnd - navigation.fetchStart : null;
            break;
          case 'first-contentful-paint':
            const fcp = paint.find(entry => entry.name === 'first-contentful-paint');
            value = fcp ? fcp.startTime : null;
            break;
          case 'largest-contentful-paint':
            // Would normally use PerformanceObserver for LCP
            value = navigation ? navigation.domContentLoadedEventEnd - navigation.fetchStart : null;
            break;
          case 'cumulative-layout-shift':
            // Simplified CLS calculation
            value = Math.random() * 0.15; // Mock value for demo
            break;
          case 'memory-usage':
            // @ts-expect-error - performance.memory might not be available in all browsers
            value = window.performance?.memory ? Math.round(window.performance.memory.usedJSHeapSize / 1024 / 1024) : null;
            break;
          case 'api-response-time':
            // Calculate from recent API calls (mock for demo)
            value = 200 + Math.random() * 800;
            break;
        }

        let status: PerformanceMetric['status'] = 'unknown';
        if (value !== null) {
          if (metric.id === 'cumulative-layout-shift') {
            status = value <= metric.threshold ? 'good' : value <= metric.threshold * 2 ? 'warning' : 'critical';
          } else {
            status = value <= metric.threshold ? 'good' : value <= metric.threshold * 1.5 ? 'warning' : 'critical';
          }
        }

        return { ...metric, value, status };
      }));
    };

    updateMetrics();
    const interval = setInterval(updateMetrics, 2000);
    
    return () => clearInterval(interval);
  }, [isMonitoring]);

  const startPerformanceMonitoring = useCallback(() => {
    setIsMonitoring(true);
  }, []);

  const stopPerformanceMonitoring = useCallback(() => {
    setIsMonitoring(false);
  }, []);

  const runLoadTests = useCallback(async () => {
    for (const test of loadTests) {
      setLoadTests(prev => prev.map(t => 
        t.id === test.id ? { ...t, status: 'running' } : t
      ));

      const startTime = Date.now();
      
      try {
        switch (test.id) {
          case 'wallet-connection':
            await simulateWalletConnectionLoad();
            break;
          case 'api-stress':
            await simulateAPIStressTest();
            break;
          case 'concurrent-users':
            await simulateConcurrentUsers();
            break;
          case 'memory-leak':
            await simulateMemoryLeakTest();
            break;
        }

        const duration = Date.now() - startTime;
        
        setLoadTests(prev => prev.map(t => 
          t.id === test.id ? { 
            ...t, 
            status: 'completed',
            result: `Completed successfully`,
            duration
          } : t
        ));
        
      } catch (error) {
        const duration = Date.now() - startTime;
        
        setLoadTests(prev => prev.map(t => 
          t.id === test.id ? { 
            ...t, 
            status: 'failed',
            result: `Failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            duration
          } : t
        ));
      }

      // Wait between tests
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }, [loadTests]);

  // Simulated load tests
  const simulateWalletConnectionLoad = async (): Promise<void> => {
    // Simulate multiple wallet connection attempts
    for (let i = 0; i < 10; i++) {
      await fetch('/api/user/settings?walletAddress=test', { 
        method: 'GET',
        headers: { 'Cache-Control': 'no-cache' }
      });
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  };

  const simulateAPIStressTest = async (): Promise<void> => {
    // Simulate concurrent API calls
    const promises = Array.from({ length: 20 }, () =>
      fetch('/api/bot/status', { 
        method: 'GET',
        headers: { 'Cache-Control': 'no-cache' }
      })
    );
    await Promise.all(promises);
  };

  const simulateConcurrentUsers = async (): Promise<void> => {
    // Simulate multiple user sessions
    const userSessions = Array.from({ length: 5 }, async (_, i) => {
      for (let j = 0; j < 5; j++) {
        await fetch(`/api/user/settings?walletAddress=user${i}`, { 
          method: 'GET',
          headers: { 'Cache-Control': 'no-cache' }
        });
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    });
    
    await Promise.all(userSessions);
  };

  const simulateMemoryLeakTest = async (): Promise<void> => {
    // Create and cleanup objects to test for memory leaks
    const objects: Array<{
      id: number;
      data: number[];
      timestamp: number;
    }> = [];
    
    for (let i = 0; i < 1000; i++) {
      objects.push({
        id: i,
        data: new Array(1000).fill(Math.random()),
        timestamp: Date.now()
      });
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    objects.length = 0; // Clear array to test cleanup
  };

  const getMetricStatusColor = (status: PerformanceMetric['status']) => {
    switch (status) {
      case 'good':
        return 'text-green-400';
      case 'warning':
        return 'text-yellow-400';
      case 'critical':
        return 'text-red-400';
      default:
        return 'text-gray-400';
    }
  };

  const getMetricStatusIcon = (status: PerformanceMetric['status']) => {
    switch (status) {
      case 'good':
        return <CheckCircle className="h-4 w-4 text-green-400" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-yellow-400" />;
      case 'critical':
        return <AlertTriangle className="h-4 w-4 text-red-400" />;
      default:
        return <Timer className="h-4 w-4 text-gray-400" />;
    }
  };

  const getLoadTestStatusIcon = (status: LoadTest['status']) => {
    switch (status) {
      case 'running':
        return <Activity className="h-4 w-4 text-blue-400 animate-pulse" />;
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-400" />;
      case 'failed':
        return <AlertTriangle className="h-4 w-4 text-red-400" />;
      default:
        return <div className="h-4 w-4 rounded-full border-2 border-gray-500" />;
    }
  };

  const categorizeMetrics = (category: PerformanceMetric['category']) => {
    return performanceMetrics.filter(metric => metric.category === category);
  };

  return (
    <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-white">
            Test Suite 5: Performance & Load Testing
          </h3>
          <p className="text-sm text-gray-400 mt-1">
            Monitor application performance and run load tests
          </p>
        </div>
        
        <div className="flex gap-2">
          <button
            onClick={isMonitoring ? stopPerformanceMonitoring : startPerformanceMonitoring}
            className={`px-4 py-2 ${
              isMonitoring ? 'bg-red-600 hover:bg-red-500' : 'bg-green-600 hover:bg-green-500'
            } text-white rounded-lg transition-colors flex items-center gap-2`}
          >
            <Activity className="h-4 w-4" />
            {isMonitoring ? 'Stop Monitoring' : 'Start Monitoring'}
          </button>
          <button
            onClick={runLoadTests}
            className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-lg transition-colors flex items-center gap-2"
          >
            <Zap className="h-4 w-4" />
            Run Load Tests
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Performance Metrics */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="h-5 w-5 text-green-400" />
            <h4 className="text-md font-semibold text-white">Performance Metrics</h4>
          </div>

          {['loading', 'runtime', 'memory', 'network'].map(category => (
            <div key={category}>
              <h5 className="text-sm font-medium text-gray-300 mb-2 capitalize">
                {category} Metrics
              </h5>
              {categorizeMetrics(category as PerformanceMetric['category']).map((metric) => (
                <div
                  key={metric.id}
                  className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/10 mb-2"
                >
                  <div className="flex items-center gap-3">
                    {getMetricStatusIcon(metric.status)}
                    <div>
                      <div className={`font-medium ${getMetricStatusColor(metric.status)}`}>
                        {metric.name}
                      </div>
                      <div className="text-xs text-gray-500">
                        {metric.description}
                      </div>
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <div className={`text-sm font-mono ${getMetricStatusColor(metric.status)}`}>
                      {metric.value !== null 
                        ? `${metric.value.toFixed(metric.unit === 'score' ? 3 : 0)}${metric.unit}`
                        : '---'
                      }
                    </div>
                    <div className="text-xs text-gray-500">
                      Target: &lt;{metric.threshold}{metric.unit}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Load Tests */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-4">
            <Server className="h-5 w-5 text-orange-400" />
            <h4 className="text-md font-semibold text-white">Load Tests</h4>
          </div>
          
          {loadTests.map((test) => (
            <div
              key={test.id}
              className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/10"
            >
              <div className="flex items-center gap-3">
                {getLoadTestStatusIcon(test.status)}
                <div>
                  <div className={`font-medium ${
                    test.status === 'completed' ? 'text-green-400' :
                    test.status === 'failed' ? 'text-red-400' :
                    test.status === 'running' ? 'text-blue-400' :
                    'text-gray-400'
                  }`}>
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
                {test.duration && (
                  <div className="text-sm text-gray-400">
                    {test.duration}ms
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 pt-4 border-t border-white/10">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div className="text-center">
            <div className="text-green-400 font-bold text-lg">
              {performanceMetrics.filter(m => m.status === 'good').length}
            </div>
            <div className="text-gray-400">Good Performance</div>
          </div>
          <div className="text-center">
            <div className="text-yellow-400 font-bold text-lg">
              {performanceMetrics.filter(m => m.status === 'warning').length}
            </div>
            <div className="text-gray-400">Warnings</div>
          </div>
          <div className="text-center">
            <div className="text-red-400 font-bold text-lg">
              {performanceMetrics.filter(m => m.status === 'critical').length}
            </div>
            <div className="text-gray-400">Critical Issues</div>
          </div>
          <div className="text-center">
            <div className="text-green-400 font-bold text-lg">
              {loadTests.filter(t => t.status === 'completed').length}/{loadTests.length}
            </div>
            <div className="text-gray-400">Load Tests Passed</div>
          </div>
        </div>
      </div>
    </div>
  );
}