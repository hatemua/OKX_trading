import { fetchBotAPI } from './supabase';
import { Trade, StrategyPerformance, TradingAnalytics, SubcategoryRanking } from '@/types';

export const api = {
  // Import trade history from OKX
  importHistory: async (symbol?: string, days = 30, maxTrades = 1000) => {
    return fetchBotAPI('/import-history', {
      method: 'POST',
      body: JSON.stringify({ symbol, days, maxTrades }),
    });
  },

  // Preview OKX trade history without importing
  previewOKXHistory: async (symbol?: string, days = 7, maxTrades = 100) => {
    return fetchBotAPI('/okx-history-preview', {
      method: 'POST',
      body: JSON.stringify({ symbol, days, maxTrades }),
    });
  },

  // Get strategy performance
  getStrategyPerformance: async (coin?: string, subcategory?: string): Promise<StrategyPerformance[]> => {
    const params = new URLSearchParams();
    if (coin) params.append('coin', coin);
    if (subcategory) params.append('subcategory', subcategory);
    
    const response = await fetchBotAPI(`/analytics/performance?${params}`);
    return response.data;
  },

  // Get best performing subcategories
  getBestSubcategories: async (limit = 10): Promise<SubcategoryRanking[]> => {
    const response = await fetchBotAPI(`/analytics/best-subcategories?limit=${limit}`);
    return response.data;
  },

  // Get recent trades
  getRecentTrades: async (limit = 50): Promise<Trade[]> => {
    const response = await fetchBotAPI(`/analytics/recent-trades?limit=${limit}`);
    return response.data;
  },

  // Get trading analytics
  getTradingAnalytics: async (days = 30): Promise<TradingAnalytics[]> => {
    const response = await fetchBotAPI(`/analytics/trading?days=${days}`);
    return response.data;
  },

  // Get trades by strategy
  getTradesByStrategy: async (coin: string, category: string, subcategory: string): Promise<Trade[]> => {
    const response = await fetchBotAPI(`/analytics/trades/${coin}/${category}/${subcategory}`);
    return response.data;
  },
};