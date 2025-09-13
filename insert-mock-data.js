// Mock Data Insertion Script for Supabase
// This script inserts sample trading data for testing the dashboard
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Configuration
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Error: Missing Supabase credentials');
    console.error('Please set SUPABASE_URL and SUPABASE_ANON_KEY in your .env file');
    process.exit(1);
}

// Initialize Supabase client
const supabase = createClient(supabaseUrl, supabaseKey);

// Mock data
const mockTrades = [
    {
        okx_order_id: 'OKX_001_BUY_DOGE_1m',
        symbol: 'DOGE-USDT',
        coin: 'DOGE',
        action: 'buy',
        order_type: 'market',
        quantity: 1000.50,
        price: 0.08245,
        total_value: 82.47,
        category: 'momentum',
        subcategory: '1m',
        strategy_ref: 'DOGE:momentum:1m',
        recurring_mode: 'am',
        executed_at: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
        status: 'filled',
        initial_amount: 82.47,
        initial_quantity: 1000.50
    },
    {
        okx_order_id: 'OKX_002_SELL_DOGE_1m',
        symbol: 'DOGE-USDT',
        coin: 'DOGE',
        action: 'sell',
        order_type: 'market',
        quantity: 1000.50,
        price: 0.08567,
        total_value: 85.74,
        category: 'momentum',
        subcategory: '1m',
        strategy_ref: 'DOGE:momentum:1m',
        recurring_mode: 'am',
        executed_at: new Date(Date.now() - 1800000).toISOString(), // 30 minutes ago
        status: 'filled',
        buy_price: 0.08245,
        profit_loss: 3.27,
        profit_percentage: 3.97
    },
    {
        okx_order_id: 'OKX_003_BUY_BTC_15m',
        symbol: 'BTC-USDT',
        coin: 'BTC',
        action: 'buy',
        order_type: 'limit',
        quantity: 0.0025,
        price: 42350.25,
        total_value: 105.88,
        category: 'momentum',
        subcategory: '15m',
        strategy_ref: 'BTC:momentum:15m',
        recurring_mode: 'am',
        executed_at: new Date(Date.now() - 7200000).toISOString(), // 2 hours ago
        status: 'filled',
        initial_amount: 105.88,
        initial_quantity: 0.0025
    }
];

const mockStrategyPerformance = [
    {
        strategy_ref: 'DOGE:momentum:1m',
        coin: 'DOGE',
        category: 'momentum',
        subcategory: '1m',
        total_trades: 2,
        total_buys: 1,
        total_sells: 1,
        total_profit_loss: 3.27,
        total_volume: 168.21,
        avg_profit_percentage: 3.97,
        win_rate: 100.0,
        first_trade_at: new Date(Date.now() - 3600000).toISOString(),
        last_trade_at: new Date(Date.now() - 1800000).toISOString()
    },
    {
        strategy_ref: 'BTC:momentum:15m',
        coin: 'BTC',
        category: 'momentum',
        subcategory: '15m',
        total_trades: 1,
        total_buys: 1,
        total_sells: 0,
        total_profit_loss: 0,
        total_volume: 105.88,
        avg_profit_percentage: 0,
        win_rate: 0,
        first_trade_at: new Date(Date.now() - 7200000).toISOString(),
        last_trade_at: new Date(Date.now() - 7200000).toISOString()
    },
    {
        strategy_ref: 'ETH:momentum:5m',
        coin: 'ETH',
        category: 'momentum',
        subcategory: '5m',
        total_trades: 4,
        total_buys: 2,
        total_sells: 2,
        total_profit_loss: -2.45,
        total_volume: 520.33,
        avg_profit_percentage: -1.22,
        win_rate: 50.0,
        first_trade_at: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
        last_trade_at: new Date(Date.now() - 3600000).toISOString()
    }
];

const mockTradingAnalytics = [
    {
        date: new Date().toISOString().split('T')[0], // Today
        hour: null, // Daily aggregate
        total_trades: 7,
        total_volume: 794.42,
        total_profit_loss: 0.82,
        best_subcategory: '1m',
        worst_subcategory: '5m'
    },
    {
        date: new Date(Date.now() - 86400000).toISOString().split('T')[0], // Yesterday
        hour: null, // Daily aggregate
        total_trades: 3,
        total_volume: 312.15,
        total_profit_loss: -2.45,
        best_subcategory: '15m',
        worst_subcategory: '5m'
    },
    {
        date: new Date().toISOString().split('T')[0], // Today
        hour: new Date().getHours(), // Current hour
        total_trades: 2,
        total_volume: 168.21,
        total_profit_loss: 3.27,
        best_subcategory: '1m',
        worst_subcategory: null
    }
];

// Main insertion function
async function insertMockData() {
    console.log('🚀 Inserting Mock Data into Supabase...');
    console.log('=====================================');

    try {
        // Insert trades
        console.log('📊 Inserting mock trades...');
        const { data: tradesData, error: tradesError } = await supabase
            .from('trades')
            .insert(mockTrades)
            .select();

        if (tradesError) {
            console.error('❌ Error inserting trades:', tradesError.message);
        } else {
            console.log(`✅ Inserted ${tradesData.length} trades successfully`);
        }

        // Insert strategy performance
        console.log('📈 Inserting strategy performance...');
        const { data: performanceData, error: performanceError } = await supabase
            .from('strategy_performance')
            .insert(mockStrategyPerformance)
            .select();

        if (performanceError) {
            console.error('❌ Error inserting strategy performance:', performanceError.message);
        } else {
            console.log(`✅ Inserted ${performanceData.length} strategy performance records successfully`);
        }

        // Insert trading analytics
        console.log('📊 Inserting trading analytics...');
        const { data: analyticsData, error: analyticsError } = await supabase
            .from('trading_analytics')
            .insert(mockTradingAnalytics)
            .select();

        if (analyticsError) {
            console.error('❌ Error inserting trading analytics:', analyticsError.message);
        } else {
            console.log(`✅ Inserted ${analyticsData.length} trading analytics records successfully`);
        }

        console.log('\n🎉 Mock Data Insertion Complete!');
        console.log('=====================================');
        console.log('You can now visit your dashboard to see the data:');
        console.log('🔗 Dashboard: http://localhost:3001');
        console.log('📊 Trades: 3 sample trades (DOGE, BTC)');
        console.log('📈 Strategies: 3 performance records');
        console.log('📉 Analytics: 3 analytics records (daily + hourly)');

    } catch (error) {
        console.error('❌ Unexpected error:', error.message);
    }
}

// Test function to verify data
async function testMockData() {
    console.log('\n🧪 Testing inserted data...');
    
    try {
        // Test trades count
        const { count: tradesCount } = await supabase
            .from('trades')
            .select('*', { count: 'exact', head: true });

        // Test strategy performance count
        const { count: performanceCount } = await supabase
            .from('strategy_performance')
            .select('*', { count: 'exact', head: true });

        // Test analytics count
        const { count: analyticsCount } = await supabase
            .from('trading_analytics')
            .select('*', { count: 'exact', head: true });

        console.log(`📊 Trades in database: ${tradesCount}`);
        console.log(`📈 Strategy records: ${performanceCount}`);
        console.log(`📉 Analytics records: ${analyticsCount}`);

        if (tradesCount >= 3 && performanceCount >= 3 && analyticsCount >= 3) {
            console.log('✅ All mock data successfully inserted!');
        } else {
            console.log('⚠️  Some data may be missing');
        }

    } catch (error) {
        console.log('⚠️  Test failed, but data may still be inserted:', error.message);
    }
}

// Run the insertion
if (require.main === module) {
    insertMockData()
        .then(() => testMockData())
        .then(() => process.exit(0))
        .catch((error) => {
            console.error('❌ Script failed:', error);
            process.exit(1);
        });
}

module.exports = { insertMockData, mockTrades, mockStrategyPerformance, mockTradingAnalytics };