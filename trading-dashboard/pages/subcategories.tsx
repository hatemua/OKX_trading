import React, { useState, useEffect } from 'react';
import Layout from '@/components/Layout';
import MetricCard from '@/components/MetricCard';
import { api } from '@/lib/api';
import { SubcategoryRanking } from '@/types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Trophy, TrendingUp, Target, Filter } from 'lucide-react';

const SubcategoriesPage: React.FC = () => {
  const [rankings, setRankings] = useState<SubcategoryRanking[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCoin, setSelectedCoin] = useState<string>('all');
  const [limit, setLimit] = useState(20);

  useEffect(() => {
    loadSubcategoryData();
  }, [limit]);

  const loadSubcategoryData = async () => {
    try {
      setLoading(true);
      const data = await api.getBestSubcategories(limit);
      setRankings(data);
    } catch (error) {
      console.error('Error loading subcategory data:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredRankings = selectedCoin === 'all' 
    ? rankings 
    : rankings.filter(r => r.coin === selectedCoin);

  const uniqueCoins = [...new Set(rankings.map(r => r.coin))];

  const chartData = filteredRankings.map(r => ({
    subcategory: r.subcategory,
    profit: r.total_profit_loss,
    winRate: r.win_rate,
    trades: r.total_trades,
    coin: r.coin
  }));

  const pieData = filteredRankings.slice(0, 6).map((r, index) => ({
    name: `${r.subcategory} (${r.coin})`,
    value: Math.abs(r.total_profit_loss),
    profit: r.total_profit_loss,
    color: `hsl(${index * 60}, 70%, 50%)`
  }));

  const totalProfit = filteredRankings.reduce((sum, r) => sum + r.total_profit_loss, 0);
  const avgWinRate = filteredRankings.length > 0 
    ? filteredRankings.reduce((sum, r) => sum + r.win_rate, 0) / filteredRankings.length
    : 0;
  const bestPerformer = filteredRankings[0];

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

  return (
    <Layout title="Subcategory Performance">
      <div className="space-y-6">
        {/* Controls */}
        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex items-center space-x-2">
            <Filter className="h-4 w-4 text-gray-500" />
            <label className="text-sm font-medium text-gray-700">Filter by coin:</label>
            <select
              value={selectedCoin}
              onChange={(e) => setSelectedCoin(e.target.value)}
              className="px-3 py-1 border border-gray-300 rounded-md text-sm"
            >
              <option value="all">All Coins</option>
              {uniqueCoins.map(coin => (
                <option key={coin} value={coin}>{coin}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center space-x-2">
            <label className="text-sm font-medium text-gray-700">Limit:</label>
            <select
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="px-3 py-1 border border-gray-300 rounded-md text-sm"
            >
              <option value={10}>Top 10</option>
              <option value={20}>Top 20</option>
              <option value={50}>Top 50</option>
            </select>
          </div>
        </div>

        {/* Summary Stats */}
        {!loading && filteredRankings.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <MetricCard
              title="Total Profit/Loss"
              value={`$${totalProfit.toFixed(2)}`}
              subtitle={`Across ${filteredRankings.length} subcategories`}
              trend={totalProfit > 0 ? 'up' : totalProfit < 0 ? 'down' : 'neutral'}
              icon={TrendingUp}
            />
            
            <MetricCard
              title="Average Win Rate"
              value={`${avgWinRate.toFixed(1)}%`}
              subtitle="Across all subcategories"
              trend={avgWinRate > 50 ? 'up' : 'down'}
              icon={Target}
            />
            
            <MetricCard
              title="Best Performer"
              value={bestPerformer ? `${bestPerformer.subcategory}` : 'N/A'}
              subtitle={bestPerformer ? `$${bestPerformer.total_profit_loss.toFixed(2)} profit` : ''}
              icon={Trophy}
            />
          </div>
        )}

        {/* Charts */}
        {!loading && filteredRankings.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Profit Bar Chart */}
            <div className="card">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Profit/Loss by Subcategory</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData.slice(0, 10)}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="subcategory" />
                  <YAxis />
                  <Tooltip 
                    formatter={(value: number) => [`$${value.toFixed(2)}`, 'Profit/Loss']}
                    labelFormatter={(label) => `Subcategory: ${label}`}
                  />
                  <Bar 
                    dataKey="profit" 
                    fill={(entry) => entry > 0 ? '#10b981' : '#ef4444'}
                    name="Profit/Loss"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Profit Distribution Pie Chart */}
            <div className="card">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Performers Distribution</h3>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                    label={(entry) => `${entry.name}: $${entry.profit.toFixed(0)}`}
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => [`$${value.toFixed(2)}`, 'Profit']} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Detailed Rankings Table */}
        <div className="card">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Subcategory Rankings</h3>
            <div className="text-sm text-gray-500">
              {selectedCoin === 'all' ? 'All coins' : `${selectedCoin} only`}
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center items-center py-8">
              <div className="loading-spinner"></div>
            </div>
          ) : filteredRankings.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500">No data available</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Rank
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Subcategory
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
                      Total Trades
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredRankings.map((ranking, index) => (
                    <tr key={`${ranking.coin}-${ranking.subcategory}`} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <span className="text-sm font-medium text-gray-900">#{index + 1}</span>
                          {index < 3 && (
                            <Trophy className="h-4 w-4 ml-2 text-yellow-500" />
                          )}
                        </div>
                      </td>
                      
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{ranking.subcategory}</div>
                      </td>
                      
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{ranking.coin}</div>
                      </td>
                      
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div
                          className={`text-sm font-medium ${
                            ranking.total_profit_loss > 0 ? 'profit-positive' : 'profit-negative'
                          }`}
                        >
                          ${ranking.total_profit_loss.toFixed(2)}
                        </div>
                      </td>
                      
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div
                          className={`text-sm ${
                            ranking.win_rate > 50 ? 'profit-positive' : 'profit-negative'
                          }`}
                        >
                          {ranking.win_rate.toFixed(1)}%
                        </div>
                      </td>
                      
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div
                          className={`text-sm ${
                            ranking.avg_profit_percentage > 0 ? 'profit-positive' : 'profit-negative'
                          }`}
                        >
                          {ranking.avg_profit_percentage.toFixed(2)}%
                        </div>
                      </td>
                      
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{ranking.total_trades}</div>
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

export default SubcategoriesPage;