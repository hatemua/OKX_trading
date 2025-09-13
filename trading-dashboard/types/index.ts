export interface Trade {
  id: string;
  okx_order_id: string;
  symbol: string;
  coin: string;
  action: 'buy' | 'sell';
  order_type: 'market' | 'limit';
  quantity: number;
  price: number;
  total_value: number;
  category: string;
  subcategory: string;
  strategy_ref: string;
  recurring_mode: 'am' | 'qu';
  executed_at: string;
  created_at: string;
  updated_at: string;
  status: 'pending' | 'filled' | 'cancelled' | 'failed';
  initial_amount?: number;
  initial_quantity?: number;
  buy_price?: number;
  profit_loss?: number;
  profit_percentage?: number;
}

export interface StrategyPerformance {
  id: string;
  strategy_ref: string;
  coin: string;
  category: string;
  subcategory: string;
  total_trades: number;
  total_buys: number;
  total_sells: number;
  total_profit_loss: number;
  total_volume: number;
  avg_profit_percentage: number;
  win_rate: number;
  first_trade_at: string;
  last_trade_at: string;
  updated_at: string;
}

export interface TradingAnalytics {
  id: string;
  date: string;
  hour?: number;
  total_trades: number;
  total_volume: number;
  total_profit_loss: number;
  best_subcategory: string;
  worst_subcategory: string;
  created_at: string;
}

export interface DashboardStats {
  totalTrades: number;
  totalProfit: number;
  winRate: number;
  bestSubcategory: string;
  totalVolume: number;
  activeTrades: number;
}

export interface SubcategoryRanking {
  subcategory: string;
  coin: string;
  total_profit_loss: number;
  win_rate: number;
  avg_profit_percentage: number;
  total_trades: number;
}