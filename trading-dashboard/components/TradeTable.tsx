import React from 'react';
import { Trade } from '@/types';
import { format } from 'date-fns';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';

interface TradeTableProps {
  trades: Trade[];
  loading?: boolean;
}

const TradeTable: React.FC<TradeTableProps> = ({ trades, loading }) => {
  if (loading) {
    return (
      <div className="card">
        <div className="flex justify-center items-center py-8">
          <div className="loading-spinner"></div>
        </div>
      </div>
    );
  }

  if (trades.length === 0) {
    return (
      <div className="card text-center py-8">
        <p className="text-gray-500">No trades found</p>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Trade
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Symbol
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Strategy
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Price
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Quantity
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Value
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                P&L
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Date
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {trades.map((trade) => (
              <tr key={trade.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    {trade.action === 'buy' ? (
                      <ArrowDownRight className="h-4 w-4 text-success-600 mr-2" />
                    ) : (
                      <ArrowUpRight className="h-4 w-4 text-danger-600 mr-2" />
                    )}
                    <span
                      className={`px-2 py-1 text-xs font-medium rounded-full ${
                        trade.action === 'buy'
                          ? 'bg-success-50 text-success-800'
                          : 'bg-danger-50 text-danger-800'
                      }`}
                    >
                      {trade.action.toUpperCase()}
                    </span>
                  </div>
                </td>
                
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="font-medium text-gray-900">{trade.symbol}</div>
                  <div className="text-sm text-gray-500">{trade.order_type}</div>
                </td>
                
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">{trade.subcategory}</div>
                  <div className="text-xs text-gray-500">{trade.category}</div>
                </td>
                
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">
                    ${trade.price.toFixed(6)}
                  </div>
                </td>
                
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">
                    {trade.quantity.toFixed(4)}
                  </div>
                </td>
                
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">
                    ${trade.total_value.toFixed(2)}
                  </div>
                </td>
                
                <td className="px-6 py-4 whitespace-nowrap">
                  {trade.profit_loss !== null && trade.profit_loss !== undefined ? (
                    <div
                      className={`text-sm font-medium ${
                        trade.profit_loss > 0 ? 'profit-positive' : 'profit-negative'
                      }`}
                    >
                      ${trade.profit_loss.toFixed(2)}
                      {trade.profit_percentage && (
                        <span className="text-xs ml-1">
                          ({trade.profit_percentage.toFixed(1)}%)
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-gray-400">-</span>
                  )}
                </td>
                
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {format(new Date(trade.executed_at), 'MMM dd, HH:mm')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default TradeTable;