// Supabase client for permanent trade storage
const { createClient } = require('@supabase/supabase-js');
const winston = require('winston');

// Logger setup
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'supabase.log' }),
        new winston.transports.Console({
            format: winston.format.simple()
        })
    ]
});

class SupabaseClient {
    constructor() {
        // Initialize Supabase client
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_ANON_KEY;
        
        if (!supabaseUrl || !supabaseKey) {
            throw new Error('Missing Supabase credentials. Please set SUPABASE_URL and SUPABASE_ANON_KEY in your .env file');
        }
        
        this.supabase = createClient(supabaseUrl, supabaseKey);
        logger.info('Supabase client initialized');
    }

    // Store a trade in Supabase
    async storeTrade({
        okxOrderId,
        symbol,
        coin,
        action,
        orderType,
        quantity,
        price,
        totalValue,
        category,
        subcategory,
        recurringMode = 'am',
        executedAt,
        status = 'filled',
        initialAmount = null,
        initialQuantity = null
    }) {
        try {
            const strategyRef = `${coin}:${category}:${subcategory}`;
            
            const tradeData = {
                okx_order_id: okxOrderId,
                symbol,
                coin,
                action,
                order_type: orderType,
                quantity: parseFloat(quantity),
                price: parseFloat(price),
                total_value: parseFloat(totalValue),
                category,
                subcategory,
                strategy_ref: strategyRef,
                recurring_mode: recurringMode,
                executed_at: executedAt,
                status,
                initial_amount: initialAmount ? parseFloat(initialAmount) : null,
                initial_quantity: initialQuantity ? parseFloat(initialQuantity) : null
            };

            const { data, error } = await this.supabase
                .from('trades')
                .insert([tradeData])
                .select();

            if (error) {
                logger.error('Error storing trade in Supabase:', error);
                return { success: false, error: error.message };
            }

            logger.info(`Trade stored in Supabase: ${action} ${quantity} ${coin} at ${price} - Strategy: ${strategyRef}`);
            return { success: true, data: data[0] };
        } catch (error) {
            logger.error('Exception storing trade in Supabase:', error);
            return { success: false, error: error.message };
        }
    }

    // Get all trades for a specific strategy
    async getTradesByStrategy(coin, category, subcategory) {
        try {
            const strategyRef = `${coin}:${category}:${subcategory}`;
            
            const { data, error } = await this.supabase
                .from('trades')
                .select('*')
                .eq('strategy_ref', strategyRef)
                .order('executed_at', { ascending: false });

            if (error) {
                logger.error('Error fetching trades by strategy:', error);
                return { success: false, error: error.message };
            }

            return { success: true, data };
        } catch (error) {
            logger.error('Exception fetching trades by strategy:', error);
            return { success: false, error: error.message };
        }
    }

    // Get active buy position for a strategy
    async getActiveBuyPosition(coin, category, subcategory) {
        try {
            const strategyRef = `${coin}:${category}:${subcategory}`;
            
            // Find the most recent buy that doesn't have a corresponding sell
            const { data: buyTrades, error: buyError } = await this.supabase
                .from('trades')
                .select('*')
                .eq('strategy_ref', strategyRef)
                .eq('action', 'buy')
                .eq('status', 'filled')
                .order('executed_at', { ascending: false });

            if (buyError) {
                logger.error('Error fetching buy trades:', buyError);
                return { success: false, error: buyError.message };
            }

            if (!buyTrades || buyTrades.length === 0) {
                return { success: true, data: null };
            }

            // For each buy, check if there's a corresponding sell after it
            for (const buyTrade of buyTrades) {
                const { data: sellTrades, error: sellError } = await this.supabase
                    .from('trades')
                    .select('id')
                    .eq('strategy_ref', strategyRef)
                    .eq('action', 'sell')
                    .eq('status', 'filled')
                    .gt('executed_at', buyTrade.executed_at)
                    .limit(1);

                if (sellError) {
                    logger.error('Error fetching sell trades:', sellError);
                    continue;
                }

                // If no sell found after this buy, it's still active
                if (!sellTrades || sellTrades.length === 0) {
                    return { success: true, data: buyTrade };
                }
            }

            // No active position found
            return { success: true, data: null };
        } catch (error) {
            logger.error('Exception fetching active buy position:', error);
            return { success: false, error: error.message };
        }
    }

    // Check if we can buy (no active position)
    async canBuy(coin, category, subcategory) {
        try {
            const result = await this.getActiveBuyPosition(coin, category, subcategory);
            if (!result.success) return false;
            return result.data === null;
        } catch (error) {
            logger.error('Exception checking canBuy:', error);
            return false;
        }
    }

    // Check if we can sell (have active position)
    async canSell(coin, category, subcategory) {
        try {
            const result = await this.getActiveBuyPosition(coin, category, subcategory);
            if (!result.success) return false;
            return result.data !== null;
        } catch (error) {
            logger.error('Exception checking canSell:', error);
            return false;
        }
    }

    // Get strategy performance metrics
    async getStrategyPerformance(coin = null, subcategory = null) {
        try {
            let query = this.supabase
                .from('strategy_performance')
                .select('*')
                .order('total_profit_loss', { ascending: false });

            if (coin) {
                query = query.eq('coin', coin);
            }
            if (subcategory) {
                query = query.eq('subcategory', subcategory);
            }

            const { data, error } = await query;

            if (error) {
                logger.error('Error fetching strategy performance:', error);
                return { success: false, error: error.message };
            }

            return { success: true, data };
        } catch (error) {
            logger.error('Exception fetching strategy performance:', error);
            return { success: false, error: error.message };
        }
    }

    // Get trading analytics
    async getTradingAnalytics(days = 30) {
        try {
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - days);

            const { data, error } = await this.supabase
                .from('trading_analytics')
                .select('*')
                .gte('date', startDate.toISOString().split('T')[0])
                .order('date', { ascending: false });

            if (error) {
                logger.error('Error fetching trading analytics:', error);
                return { success: false, error: error.message };
            }

            return { success: true, data };
        } catch (error) {
            logger.error('Exception fetching trading analytics:', error);
            return { success: false, error: error.message };
        }
    }

    // Get best performing subcategories
    async getBestSubcategories(limit = 10) {
        try {
            const { data, error } = await this.supabase
                .from('strategy_performance')
                .select('subcategory, coin, total_profit_loss, win_rate, avg_profit_percentage, total_trades')
                .gt('total_trades', 5) // Only include subcategories with at least 5 trades
                .order('total_profit_loss', { ascending: false })
                .limit(limit);

            if (error) {
                logger.error('Error fetching best subcategories:', error);
                return { success: false, error: error.message };
            }

            return { success: true, data };
        } catch (error) {
            logger.error('Exception fetching best subcategories:', error);
            return { success: false, error: error.message };
        }
    }

    // Get recent trades
    async getRecentTrades(limit = 50) {
        try {
            const { data, error } = await this.supabase
                .from('trades')
                .select('*')
                .order('executed_at', { ascending: false })
                .limit(limit);

            if (error) {
                logger.error('Error fetching recent trades:', error);
                return { success: false, error: error.message };
            }

            return { success: true, data };
        } catch (error) {
            logger.error('Exception fetching recent trades:', error);
            return { success: false, error: error.message };
        }
    }

    // Import OKX trade history
    async importOKXTradeHistory(trades) {
        try {
            const tradesToInsert = trades.map(trade => ({
                okx_order_id: trade.ordId,
                symbol: trade.instId,
                coin: trade.instId.split('-')[0],
                action: trade.side,
                order_type: trade.ordType,
                quantity: parseFloat(trade.fillSz),
                price: parseFloat(trade.fillPx),
                total_value: parseFloat(trade.fillSz) * parseFloat(trade.fillPx),
                category: 'imported', // Default for imported trades
                subcategory: 'unknown', // Default for imported trades
                strategy_ref: `${trade.instId.split('-')[0]}:imported:unknown`,
                executed_at: new Date(parseInt(trade.ts)).toISOString(),
                status: trade.state === 'filled' ? 'filled' : 'pending'
            }));

            const { data, error } = await this.supabase
                .from('trades')
                .upsert(tradesToInsert, { 
                    onConflict: 'okx_order_id',
                    ignoreDuplicates: false 
                })
                .select();

            if (error) {
                logger.error('Error importing OKX trade history:', error);
                return { success: false, error: error.message };
            }

            logger.info(`Imported ${data.length} trades from OKX history`);
            return { success: true, data };
        } catch (error) {
            logger.error('Exception importing OKX trade history:', error);
            return { success: false, error: error.message };
        }
    }
}

module.exports = SupabaseClient;