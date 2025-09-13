import React, { useState, useEffect } from 'react';
import Layout from '@/components/Layout';
import MetricCard from '@/components/MetricCard';
import { api } from '@/lib/api';
import { StrategyPerformance } from '@/types';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from 'recharts';
import { TrendingUp, DollarSign, Target, Activity } from 'lucide-react';

const PerformancePage: React.FC = () => {
  const [performance, setPerformance] = useState<StrategyPerformance[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCoin, setSelectedCoin] = useState<string>('all');

  useEffect(() => {
    loadPerformanceData();
  }, []);

  const loadPerformanceData = async () => {
    try {
      setLoading(true);
      const data = await api.getStrategyPerformance();
      setPerformance(data);
    } catch (error) {
      console.error('Error loading performance data:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredPerformance = selectedCoin === 'all' 
    ? performance 
    : performance.filter(p => p.coin === selectedCoin);

  const uniqueCoins = Array.from(new Set(performance.map(p => p.coin)));

  // Aggregate metrics
  const totalProfit = filteredPerformance.reduce((sum, p) => sum + p.total_profit_loss, 0);
  const totalVolume = filteredPerformance.reduce((sum, p) => sum + p.total_volume, 0);
  const avgWinRate = filteredPerformance.length > 0 
    ? filteredPerformance.reduce((sum, p) => sum + p.win_rate, 0) / filteredPerformance.length
    : 0;
  const totalTrades = filteredPerformance.reduce((sum, p) => sum + p.total_trades, 0);

  // Chart data for profit by subcategory
  const profitChartData = filteredPerformance
    .sort((a, b) => b.total_profit_loss - a.total_profit_loss)
    .map(p => ({
      strategy: `${p.subcategory} (${p.coin})`,
      profit: p.total_profit_loss,
      volume: p.total_volume,
      winRate: p.win_rate,
      trades: p.total_trades,
      fill: p.total_profit_loss > 0 ? '#10b981' : '#ef4444'
    }));

  // Volume vs Profit scatter data
  const scatterData = filteredPerformance.map(p => ({
    volume: p.total_volume,
    profit: p.total_profit_loss,
    strategy: `${p.subcategory} (${p.coin})`,
    winRate: p.win_rate
  }));

  return (
    <Layout title="Strategy Performance">
      <div className="space-y-6">
        {/* Controls */}
        <div className="flex items-center space-x-4">
          <label className="text-sm font-medium text-gray-700">Filter by coin:</label>
          <select
            value={selectedCoin}
            onChange={(e) => setSelectedCoin(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm"
          >
            <option value="all">All Coins</option>
            {uniqueCoins.map(coin => (
              <option key={coin} value={coin}>{coin}</option>
            ))}
          </select>
        </div>

        {/* Summary Metrics */}
        {!loading && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <MetricCard
              title="Total Profit/Loss"
              value={`$${totalProfit.toFixed(2)}`}
              trend={totalProfit > 0 ? 'up' : totalProfit < 0 ? 'down' : 'neutral'}
              icon={DollarSign}
            />
            
            <MetricCard
              title="Average Win Rate"
              value={`${avgWinRate.toFixed(1)}%`}
              trend={avgWinRate > 50 ? 'up' : 'down'}
              icon={TrendingUp}
            />
            
            <MetricCard
              title="Total Volume"
              value={`$${totalVolume.toLocaleString()}`}
              subtitle={`${totalTrades} trades`}
              icon={Activity}
            />
            
            <MetricCard
              title="Active Strategies"
              value={filteredPerformance.length}
              subtitle={`${selectedCoin === 'all' ? 'All coins' : selectedCoin}`}
              icon={Target}
            />
          </div>
        )}

        {/* Charts */}
        {!loading && filteredPerformance.length > 0 && (
          <div className="space-y-6">
            {/* Profit by Strategy */}
            <div className="card">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Profit/Loss by Strategy</h3>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={profitChartData.slice(0, 15)}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="strategy" 
                    angle={-45}
                    textAnchor="end"
                    height={100}
                    interval={0}
                  />
                  <YAxis />
                  <Tooltip 
                    formatter={(value: number) => [`$${value.toFixed(2)}`, 'Profit/Loss']}
                    labelFormatter={(label) => `Strategy: ${label}`}
                  />
                  <Bar 
                    dataKey="profit" 
                    name="Profit/Loss"
                  >
                    {profitChartData.slice(0, 15).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Volume vs Profit Correlation */}
            <div className="card">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Volume vs Profit Analysis</h3>
              <ResponsiveContainer width="100%" height={400}>
                <AreaChart data={scatterData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="volume" 
                    name="Volume"
                    tickFormatter={(value) => `$${(value / 1000).toFixed(0)}K`}
                  />
                  <YAxis 
                    dataKey="profit"
                    name="Profit"
                    tickFormatter={(value) => `$${value.toFixed(0)}`}
                  />
                  <Tooltip 
                    formatter={(value: number, name: string) => {
                      if (name === 'profit') return [`$${value.toFixed(2)}`, 'Profit'];
                      if (name === 'volume') return [`$${value.toFixed(2)}`, 'Volume'];
                      return [value, name];
                    }}
                    labelFormatter={(label, payload) => {
                      if (payload && payload[0]) {
                        return `Strategy: ${payload[0].payload.strategy}`;
                      }
                      return '';
                    }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="profit" 
                    stroke="#3b82f6" 
                    fill="#3b82f6" 
                    fillOpacity={0.3} 
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Strategy Performance Table */}
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Detailed Strategy Performance</h3>
          
          {loading ? (
            <div className="flex justify-center items-center py-8">
              <div className="loading-spinner"></div>
            </div>
          ) : filteredPerformance.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500">No performance data available</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Strategy
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Coin
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Total P&L
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Win Rate
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Avg Profit %
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Total Volume
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Trades
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredPerformance
                    .sort((a, b) => b.total_profit_loss - a.total_profit_loss)
                    .map((strategy) => (
                    <tr key={strategy.strategy_ref} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{strategy.subcategory}</div>
                        <div className="text-xs text-gray-500">{strategy.category}</div>
                      </td>
                      
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{strategy.coin}</div>
                      </td>
                      
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div
                          className={`text-sm font-medium ${
                            strategy.total_profit_loss > 0 ? 'profit-positive' : 'profit-negative'
                          }`}
                        >
                          ${strategy.total_profit_loss.toFixed(2)}
                        </div>
                      </td>
                      
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div
                          className={`text-sm ${
                            strategy.win_rate > 50 ? 'profit-positive' : 'profit-negative'
                          }`}
                        >
                          {strategy.win_rate.toFixed(1)}%
                        </div>
                      </td>
                      
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div
                          className={`text-sm ${
                            strategy.avg_profit_percentage > 0 ? 'profit-positive' : 'profit-negative'
                          }`}
                        >
                          {strategy.avg_profit_percentage?.toFixed(2) || 'N/A'}%
                        </div>
                      </td>
                      
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          ${strategy.total_volume.toLocaleString()}
                        </div>
                      </td>
                      
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{strategy.total_trades}</div>
                        <div className="text-xs text-gray-500">
                          B: {strategy.total_buys} / S: {strategy.total_sells}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default PerformancePage;