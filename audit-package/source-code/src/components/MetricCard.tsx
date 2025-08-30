/**
 * MetricCard Component
 * Reusable presentational component for displaying performance metrics
 */

'use client';

import React from 'react';
import { TrendingUp, TrendingDown, DollarSign, BarChart3 } from 'lucide-react';

interface MetricCardProps {
  label: string;
  value: string | number;
  icon?: 'dollar' | 'trending-up' | 'trending-down' | 'chart' | 'auto';
  trend?: 'positive' | 'negative' | 'neutral';
  subtitle?: string;
  loading?: boolean;
  className?: string;
}

export function MetricCard({ 
  label, 
  value, 
  icon = 'auto',
  trend = 'neutral',
  subtitle,
  loading = false,
  className = ''
}: MetricCardProps) {
  
  // Auto-detect trend and icon based on value if not specified
  const getAutoIcon = () => {
    if (icon !== 'auto') return icon;
    
    if (typeof value === 'string' && value.includes('$')) return 'dollar';
    if (typeof value === 'string' && value.includes('%')) {
      const numValue = parseFloat(value.replace('%', ''));
      return numValue >= 0 ? 'trending-up' : 'trending-down';
    }
    return 'chart';
  };

  const getAutoTrend = () => {
    if (trend !== 'neutral') return trend;
    
    if (typeof value === 'string' && value.includes('%')) {
      const numValue = parseFloat(value.replace('%', ''));
      return numValue >= 0 ? 'positive' : 'negative';
    }
    return 'neutral';
  };

  const finalIcon = getAutoIcon();
  const finalTrend = getAutoTrend();

  const renderIcon = () => {
    if (loading) return <div className="w-5 h-5 bg-gray-600 rounded animate-pulse" />;
    
    const iconClassName = `h-5 w-5 ${
      finalTrend === 'positive' 
        ? 'text-green-400' 
        : finalTrend === 'negative' 
        ? 'text-red-400' 
        : 'text-gray-400'
    }`;

    switch (finalIcon) {
      case 'dollar':
        return <DollarSign className={iconClassName} />;
      case 'trending-up':
        return <TrendingUp className={iconClassName} />;
      case 'trending-down':
        return <TrendingDown className={iconClassName} />;
      case 'chart':
        return <BarChart3 className={iconClassName} />;
      default:
        return <BarChart3 className={iconClassName} />;
    }
  };

  const getValueColor = () => {
    if (loading) return 'text-gray-500';
    
    switch (finalTrend) {
      case 'positive':
        return 'text-green-400';
      case 'negative':
        return 'text-red-400';
      default:
        return 'text-white';
    }
  };

  const formatValue = (val: string | number) => {
    if (loading) return '---';
    
    if (typeof val === 'number') {
      // Format numbers with appropriate precision
      if (val >= 1000000) {
        return `$${(val / 1000000).toFixed(2)}M`;
      } else if (val >= 1000) {
        return `$${(val / 1000).toFixed(1)}K`;
      } else if (val >= 0) {
        return `$${val.toFixed(2)}`;
      } else {
        return `-$${Math.abs(val).toFixed(2)}`;
      }
    }
    
    return val.toString();
  };

  return (
    <div className={`
      bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl p-6
      transition-all duration-200 hover:bg-white/15 hover:border-white/30
      ${className}
    `}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-gray-300">
          {label}
        </h3>
        {renderIcon()}
      </div>
      
      <div className="space-y-1">
        <div className={`text-2xl font-bold ${getValueColor()}`}>
          {loading ? (
            <div className="h-8 w-24 bg-gray-600 rounded animate-pulse" />
          ) : (
            formatValue(value)
          )}
        </div>
        
        {subtitle && (
          <div className="text-xs text-gray-400">
            {loading ? (
              <div className="h-3 w-16 bg-gray-700 rounded animate-pulse" />
            ) : (
              subtitle
            )}
          </div>
        )}
      </div>
    </div>
  );
}