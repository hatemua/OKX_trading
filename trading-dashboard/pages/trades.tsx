import React, { useState, useEffect } from 'react';
import Layout from '@/components/Layout';
import TradeTable from '@/components/TradeTable';
import { api } from '@/lib/api';
import { Trade } from '@/types';
import { Search, Filter, Download, Calendar } from 'lucide-react';

const TradesPage: React.FC = () => {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [filteredTrades, setFilteredTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    coin: '',
    subcategory: '',
    action: '',
    dateFrom: '',
    dateTo: '',
    search: ''
  });

  useEffect(() => {
    loadTrades();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [trades, filters]);

  const loadTrades = async () => {
    try {
      setLoading(true);
      const data = await api.getRecentTrades(200); // Load more trades for analysis
      setTrades(data);
    } catch (error) {
      console.error('Error loading trades:', error);
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...trades];

    // Filter by coin
    if (filters.coin) {
      filtered = filtered.filter(t => t.coin.toLowerCase().includes(filters.coin.toLowerCase()));
    }

    // Filter by subcategory
    if (filters.subcategory) {
      filtered = filtered.filter(t => t.subcategory.toLowerCase().includes(filters.subcategory.toLowerCase()));
    }

    // Filter by action
    if (filters.action) {
      filtered = filtered.filter(t => t.action === filters.action);
    }

    // Filter by date range
    if (filters.dateFrom) {
      filtered = filtered.filter(t => new Date(t.executed_at) >= new Date(filters.dateFrom));
    }
    if (filters.dateTo) {
      filtered = filtered.filter(t => new Date(t.executed_at) <= new Date(filters.dateTo));
    }

    // Search filter
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      filtered = filtered.filter(t =>
        t.symbol.toLowerCase().includes(searchLower) ||
        t.coin.toLowerCase().includes(searchLower) ||
        t.subcategory.toLowerCase().includes(searchLower) ||
        t.category.toLowerCase().includes(searchLower)
      );
    }

    setFilteredTrades(filtered);
  };

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const clearFilters = () => {
    setFilters({
      coin: '',
      subcategory: '',
      action: '',
      dateFrom: '',
      dateTo: '',
      search: ''
    });
  };

  const exportTrades = () => {
    // Simple CSV export
    const headers = ['Date', 'Symbol', 'Action', 'Subcategory', 'Price', 'Quantity', 'Value', 'P&L'];
    const csvData = [
      headers.join(','),
      ...filteredTrades.map(trade => [
        new Date(trade.executed_at).toISOString().split('T')[0],
        trade.symbol,
        trade.action,
        trade.subcategory,
        trade.price,
        trade.quantity,
        trade.total_value,
        trade.profit_loss || 0
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvData], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trades-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const uniqueCoins = [...new Set(trades.map(t => t.coin))];
  const uniqueSubcategories = [...new Set(trades.map(t => t.subcategory))];

  const totalProfit = filteredTrades.reduce((sum, t) => sum + (t.profit_loss || 0), 0);
  const profitableTrades = filteredTrades.filter(t => (t.profit_loss || 0) > 0);
  const winRate = filteredTrades.length > 0 ? (profitableTrades.length / filteredTrades.length) * 100 : 0;

  return (
    <Layout title="All Trades">
      <div className="space-y-6">
        {/* Filters */}
        <div className="card">
          <div className="flex flex-wrap gap-4 items-center">
            <div className="flex items-center space-x-2">
              <Search className="h-4 w-4 text-gray-500" />
              <input
                type="text"
                placeholder="Search trades..."
                value={filters.search}
                onChange={(e) => handleFilterChange('search', e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm w-64"
              />
            </div>

            <select
              value={filters.coin}
              onChange={(e) => handleFilterChange('coin', e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm"
            >
              <option value="">All Coins</option>
              {uniqueCoins.map(coin => (
                <option key={coin} value={coin}>{coin}</option>
              ))}
            </select>

            <select
              value={filters.subcategory}
              onChange={(e) => handleFilterChange('subcategory', e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm"
            >
              <option value="">All Subcategories</option>
              {uniqueSubcategories.map(sub => (
                <option key={sub} value={sub}>{sub}</option>
              ))}
            </select>

            <select
              value={filters.action}
              onChange={(e) => handleFilterChange('action', e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm"
            >
              <option value="">All Actions</option>
              <option value="buy">Buy</option>
              <option value="sell">Sell</option>
            </select>

            <div className="flex items-center space-x-2">
              <Calendar className="h-4 w-4 text-gray-500" />
              <input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm"
              />
              <span className="text-gray-500">to</span>
              <input
                type="date"
                value={filters.dateTo}
                onChange={(e) => handleFilterChange('dateTo', e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm"
              />
            </div>

            <button
              onClick={clearFilters}
              className="btn-secondary"
            >
              Clear Filters
            </button>

            <button
              onClick={exportTrades}
              className="btn-primary flex items-center space-x-2"
              disabled={filteredTrades.length === 0}
            >
              <Download className="h-4 w-4" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="card text-center">
            <div className="text-2xl font-bold text-gray-900">{filteredTrades.length}</div>
            <div className="text-sm text-gray-600">Total Trades</div>
          </div>
          
          <div className="card text-center">
            <div className={`text-2xl font-bold ${totalProfit >= 0 ? 'profit-positive' : 'profit-negative'}`}>
              ${totalProfit.toFixed(2)}
            </div>
            <div className="text-sm text-gray-600">Total P&L</div>
          </div>
          
          <div className="card text-center">
            <div className={`text-2xl font-bold ${winRate >= 50 ? 'profit-positive' : 'profit-negative'}`}>
              {winRate.toFixed(1)}%
            </div>
            <div className="text-sm text-gray-600">Win Rate</div>
          </div>
          
          <div className="card text-center">
            <div className="text-2xl font-bold text-gray-900">
              {filteredTrades.reduce((sum, t) => sum + t.total_value, 0).toFixed(0)}
            </div>
            <div className="text-sm text-gray-600">Total Volume ($)</div>
          </div>
        </div>

        {/* Trades Table */}
        <div>
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-gray-900">
              Trade History 
              {filteredTrades.length !== trades.length && (
                <span className="text-sm text-gray-500 ml-2">
                  ({filteredTrades.length} of {trades.length} trades)
                </span>
              )}
            </h3>
          </div>

          <TradeTable trades={filteredTrades} loading={loading} />
        </div>
      </div>
    </Layout>
  );
};

export default TradesPage;