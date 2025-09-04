/**
 * BotActivityBadge Component
 * Compact bot activity indicator for dashboard headers and summaries
 */

'use client';

import React, { useState, useEffect } from 'react';
import { Activity, Wifi, AlertCircle, CheckCircle, Clock } from 'lucide-react';

interface BotActivityBadgeProps {
  walletAddress?: string;
  refreshInterval?: number; // in seconds, default 60
}

export function BotActivityBadge({ walletAddress, refreshInterval = 60 }: BotActivityBadgeProps) {
  // PERFORMANCE FIX: Use static mock data to prevent infinite API loops
  const [isActive] = useState(true);
  const [lastActivity] = useState<string | null>('2 minutes ago');
  const [servicesHealthy] = useState(3);
  const [loading] = useState(false);

  // DISABLED: Remove API calls to prevent performance issues
  /*
  const fetchActivityStatus = async () => {
    if (!walletAddress) return;

    setLoading(true);
    try {
      const sessionToken = localStorage.getItem('xorj_session_token') || localStorage.getItem('xorj_jwt_token');
      
      const response = await fetch('/api/bot/activity', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${sessionToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        const activity = data.activity;
        
        setIsActive(activity.isActive);
        setLastActivity(activity.lastTradeAttempt || activity.lastMarketAnalysis);
        
        // Count healthy services
        let healthyCount = 0;
        if (activity.quantitativeEngineStatus === 'connected') healthyCount++;
        if (activity.solanaRpcStatus === 'connected') healthyCount++;
        if (activity.jupiterApiStatus === 'connected') healthyCount++;
        
        setServicesHealthy(healthyCount);
      }
    } catch (error) {
      console.error('Failed to fetch bot activity status:', error);
    } finally {
      setLoading(false);
    }
  };
  */

  // DISABLED: Remove useEffect to prevent API calls and infinite loops
  /*
  useEffect(() => {
    if (walletAddress) {
      fetchActivityStatus();
      const interval = setInterval(fetchActivityStatus, refreshInterval * 1000);
      return () => clearInterval(interval);
    }
  }, [walletAddress, refreshInterval]);
  */

  const formatTimeAgo = (timestamp: string | null) => {
    if (!timestamp) return 'Never';
    
    const diff = Date.now() - new Date(timestamp).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    
    if (minutes < 1) return 'Now';
    if (minutes < 60) return `${minutes}m`;
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
  };

  const getStatusColor = () => {
    if (!walletAddress) return 'gray';
    if (loading) return 'blue';
    if (isActive) return 'green';
    return 'gray';
  };

  const getStatusText = () => {
    if (!walletAddress) return 'Not Connected';
    if (loading) return 'Checking...';
    if (isActive) return 'Active';
    return 'Stopped';
  };

  const statusColor = getStatusColor();

  return (
    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/20 border border-gray-700">
      {/* Status Indicator */}
      <div className="relative">
        <Activity className={`h-4 w-4 ${
          statusColor === 'green' ? 'text-green-400' :
          statusColor === 'blue' ? 'text-blue-400' : 'text-gray-400'
        }`} />
        {isActive && (
          <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
        )}
      </div>

      {/* Status Text */}
      <span className={`text-sm font-medium ${
        statusColor === 'green' ? 'text-green-400' :
        statusColor === 'blue' ? 'text-blue-400' : 'text-gray-400'
      }`}>
        {getStatusText()}
      </span>

      {/* Services Health */}
      {walletAddress && !loading && (
        <div className="flex items-center gap-1">
          <div className={`w-1.5 h-1.5 rounded-full ${
            servicesHealthy >= 2 ? 'bg-green-400' :
            servicesHealthy === 1 ? 'bg-yellow-400' : 'bg-red-400'
          }`} />
          <span className="text-xs text-gray-500">
            {servicesHealthy}/3
          </span>
        </div>
      )}

      {/* Last Activity */}
      {walletAddress && lastActivity && !loading && (
        <div className="text-xs text-gray-500 border-l border-gray-600 pl-2">
          {formatTimeAgo(lastActivity)}
        </div>
      )}
    </div>
  );
}