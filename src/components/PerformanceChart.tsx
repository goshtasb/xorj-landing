/**
 * PerformanceChart Component
 * Renders responsive line chart for user performance vs benchmark data
 */

'use client';

import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts';

interface ChartDataPoint {
  date: string;
  timestamp: number;
  value: number;
  cumulative_pnl?: number;
}

interface PerformanceChartProps {
  userDataSeries: ChartDataPoint[];
  benchmarkDataSeries: ChartDataPoint[];
  loading?: boolean;
  timeRange?: '30D' | '90D' | 'ALL';
  className?: string;
}

export function PerformanceChart({
  userDataSeries = [],
  benchmarkDataSeries = [],
  loading = false,
  timeRange = '30D',
  className = ''
}: PerformanceChartProps) {

  // Combine and prepare data for chart
  const prepareChartData = () => {
    if (!userDataSeries.length || !benchmarkDataSeries.length) return [];

    // Combine user and benchmark data by date
    const combinedData = userDataSeries.map((userPoint, index) => {
      const benchmarkPoint = benchmarkDataSeries[index];
      return {
        date: userPoint.date,
        timestamp: userPoint.timestamp,
        portfolio: userPoint.value,
        benchmark: benchmarkPoint?.value || userPoint.value,
        // Calculate percentage from initial value
        portfolioPercent: userDataSeries.length > 0 ? 
          ((userPoint.value - userDataSeries[0].value) / userDataSeries[0].value) * 100 : 0,
        benchmarkPercent: benchmarkDataSeries.length > 0 ? 
          ((benchmarkPoint?.value || userPoint.value) - benchmarkDataSeries[0].value) / benchmarkDataSeries[0].value * 100 : 0
      };
    });

    return combinedData;
  };

  // Format date for X-axis based on time range
  const formatXAxisDate = (dateStr: string) => {
    const date = new Date(dateStr);
    
    switch (timeRange) {
      case '30D':
        return date.getMonth() + 1 + '/' + date.getDate();
      case '90D':
        return date.getMonth() + 1 + '/' + date.getDate();
      case 'ALL':
        return date.getMonth() + 1 + '/' + date.getFullYear().toString().slice(-2);
      default:
        return date.getMonth() + 1 + '/' + date.getDate();
    }
  };

  // Custom tooltip formatter
  const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ color: string; name: string; value: number }>; label?: string }) => {
    if (active && payload && payload.length) {
      const date = new Date(label).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });

      return (
        <div className="bg-gray-900 border border-white/20 rounded-lg p-3 shadow-lg">
          <p className="text-gray-300 text-sm mb-2">{date}</p>
          {payload.map((entry: { color: string; name: string; value: number }, index: number) => (
            <div key={index} className="flex items-center gap-2">
              <div 
                className="w-3 h-3 rounded-full" 
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-white text-sm">
                {entry.name === 'portfolio' ? 'Portfolio' : 'Benchmark'}: 
                <span className="font-bold ml-1">
                  ${entry.payload[entry.dataKey].toLocaleString(undefined, { 
                    minimumFractionDigits: 2, 
                    maximumFractionDigits: 2 
                  })}
                </span>
                <span className="text-gray-400 text-xs ml-2">
                  ({entry.payload[entry.dataKey + 'Percent'] > 0 ? '+' : ''}
                  {entry.payload[entry.dataKey + 'Percent'].toFixed(1)}%)
                </span>
              </span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  const chartData = prepareChartData();

  if (loading) {
    return (
      <div className={`
        bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl p-6
        ${className}
      `}>
        <div className="animate-pulse">
          <div className="h-6 w-48 bg-gray-600 rounded mb-6" />
          <div className="h-80 bg-gray-700 rounded" />
        </div>
      </div>
    );
  }

  if (!chartData.length) {
    return (
      <div className={`
        bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl p-6
        ${className}
      `}>
        <h3 className="text-lg font-semibold text-white mb-6">
          Performance Chart
        </h3>
        <div className="h-80 flex items-center justify-center">
          <div className="text-center">
            <div className="text-gray-400 text-lg mb-2">No Data Available</div>
            <div className="text-gray-500 text-sm">
              Performance data will appear here once available
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`
      bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl p-6
      ${className}
    `}>
      <h3 className="text-lg font-semibold text-white mb-6">
        Performance Chart ({timeRange})
      </h3>
      
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{
              top: 20,
              right: 30,
              left: 20,
              bottom: 20,
            }}
          >
            <CartesianGrid 
              strokeDasharray="3 3" 
              stroke="rgba(255, 255, 255, 0.1)" 
            />
            <XAxis
              dataKey="date"
              tickFormatter={formatXAxisDate}
              stroke="rgba(255, 255, 255, 0.5)"
              fontSize={12}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tickFormatter={(value) => `$${(value / 1000).toFixed(0)}K`}
              stroke="rgba(255, 255, 255, 0.5)"
              fontSize={12}
              tickLine={false}
              axisLine={false}
              width={60}
            />
            <Tooltip 
              content={<CustomTooltip />}
              cursor={{ stroke: 'rgba(255, 255, 255, 0.2)' }}
            />
            <Legend
              wrapperStyle={{
                paddingTop: '20px',
                color: 'rgba(255, 255, 255, 0.8)'
              }}
            />
            <Line
              type="monotone"
              dataKey="portfolio"
              stroke="#10B981" // Green for user portfolio
              strokeWidth={2}
              dot={false}
              name="Portfolio"
              activeDot={{ 
                r: 4, 
                fill: '#10B981',
                stroke: '#ffffff',
                strokeWidth: 2
              }}
            />
            <Line
              type="monotone"
              dataKey="benchmark"
              stroke="#6B7280" // Gray for benchmark
              strokeWidth={1}
              strokeDasharray="5 5"
              dot={false}
              name="Benchmark"
              activeDot={{ 
                r: 3, 
                fill: '#6B7280',
                stroke: '#ffffff',
                strokeWidth: 1
              }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Chart Legend/Info */}
      <div className="mt-4 pt-4 border-t border-white/10">
        <div className="flex items-center justify-between text-xs text-gray-400">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-0.5 bg-green-500" />
              <span>Your Portfolio</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-0.5 bg-gray-500 border-dashed border-t" />
              <span>Market Benchmark</span>
            </div>
          </div>
          <div>
            Data points: {chartData.length}
          </div>
        </div>
      </div>
    </div>
  );
}