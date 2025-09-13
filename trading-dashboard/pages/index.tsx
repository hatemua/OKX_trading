import React, { useState, useEffect } from 'react';
import Layout from '@/components/Layout';
import MetricCard from '@/components/MetricCard';
import TradeTable from '@/components/TradeTable';
import { api } from '@/lib/api';
import { Trade, StrategyPerformance, DashboardStats } from '@/types';
import { TrendingUp, DollarSign, Target, Activity, RefreshCw } from 'lucide-react';

const Dashboard: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentTrades, setRecentTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      
      // Load recent trades
      const trades = await api.getRecentTrades(20);
      setRecentTrades(trades);
      
      // Load strategy performance for stats calculation
      const performance = await api.getStrategyPerformance();
      
      // Calculate dashboard stats
      const dashboardStats = calculateStats(trades, performance);
      setStats(dashboardStats);
      
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateStats = (trades: Trade[], performance: StrategyPerformance[]): DashboardStats => {
    const totalTrades = trades.length;
    const totalProfit = performance.reduce((sum, p) => sum + p.total_profit_loss, 0);
    const totalVolume = performance.reduce((sum, p) => sum + p.total_volume, 0);
    const winningStrategies = performance.filter(p => p.win_rate > 50);
    const avgWinRate = winningStrategies.length > 0 
      ? winningStrategies.reduce((sum, p) => sum + p.win_rate, 0) / winningStrategies.length
      : 0;
    
    const bestStrategy = performance.reduce((best, current) => 
      current.total_profit_loss > best.total_profit_loss ? current : best
    , performance[0]);

    const activeTrades = trades.filter(t => t.status === 'filled' && t.action === 'buy').length;

    return {
      totalTrades,
      totalProfit,
      winRate: avgWinRate,
      bestSubcategory: bestStrategy?.subcategory || 'N/A',
      totalVolume,
      activeTrades,
    };
  };

  const handleImportHistory = async () => {
    try {
      setImporting(true);
      const result = await api.importHistory(undefined, 30, 1000); // Last 30 days, max 1000 trades
      console.log('Import result:', result);
      await loadDashboardData();
      
      if (result.success) {
        alert(`Successfully imported ${result.imported} trades from OKX history!\n\nTime range: ${result.timeRange}\nSymbols: ${result.summary?.uniqueSymbols || 0}`);
      } else {
        alert(`Import failed: ${result.error}`);
      }
    } catch (error) {
      console.error('Error importing history:', error);
      alert('Error importing trade history. Check console for details.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <Layout title="Dashboard Overview">
      <div className="space-y-6">
        {/* Action buttons */}
        <div className="flex justify-between items-center">
          <div className="flex space-x-4">
            <button
              onClick={loadDashboardData}
              disabled={loading}
              className="btn-secondary flex items-center space-x-2"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
            
            <button
              onClick={handleImportHistory}
              disabled={importing}
              className="btn-primary flex items-center space-x-2"
            >
              <Activity className={`h-4 w-4 ${importing ? 'animate-spin' : ''}`} />
              <span>{importing ? 'Importing...' : 'Import OKX History'}</span>
            </button>
          </div>
        </div>

        {/* Stats cards */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <MetricCard
              title="Total Profit/Loss"
              value={`$${stats.totalProfit.toFixed(2)}`}
              trend={stats.totalProfit > 0 ? 'up' : stats.totalProfit < 0 ? 'down' : 'neutral'}
              icon={DollarSign}
            />
            
            <MetricCard
              title="Win Rate"
              value={`${stats.winRate.toFixed(1)}%`}
              subtitle="Average across strategies"
              trend={stats.winRate > 50 ? 'up' : 'down'}
              icon={TrendingUp}
            />
            
            <MetricCard
              title="Best Subcategory"
              value={stats.bestSubcategory}
              subtitle="Highest profit"
              icon={Target}
            />
            
            <MetricCard
              title="Total Volume"
              value={`$${stats.totalVolume.toFixed(0)}`}
              subtitle={`${stats.totalTrades} trades`}
              icon={Activity}
            />
          </div>
        )}

        {/* Recent trades */}
        <div>
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Recent Trades</h3>
            <a href="/trades" className="text-primary-600 hover:text-primary-700 text-sm font-medium">
              View all trades →
            </a>
          </div>
          
          <TradeTable trades={recentTrades} loading={loading} />
        </div>
      </div>
    </Layout>
  );
};

export default Dashboard;