
        -- Create enum for trade actions
        DO $$ BEGIN
            CREATE TYPE trade_action AS ENUM ('buy', 'sell');
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;

        -- Create enum for order types
        DO $$ BEGIN
            CREATE TYPE order_type AS ENUM ('market', 'limit');
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;

        -- Create enum for trade status
        DO $$ BEGIN
            CREATE TYPE trade_status AS ENUM ('pending', 'filled', 'cancelled', 'failed');
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;
    


        -- Main trades table
        CREATE TABLE IF NOT EXISTS trades (
            id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
            
            -- Trade identification
            okx_order_id TEXT UNIQUE NOT NULL,
            symbol TEXT NOT NULL, -- e.g., "DOGE-USDT"
            coin TEXT NOT NULL, -- e.g., "DOGE"
            
            -- Trade details
            action trade_action NOT NULL,
            order_type order_type NOT NULL,
            quantity DECIMAL(20, 8) NOT NULL,
            price DECIMAL(20, 8) NOT NULL,
            total_value DECIMAL(20, 8) NOT NULL, -- quantity * price
            
            -- Strategy information
            category TEXT NOT NULL, -- e.g., "momentum"
            subcategory TEXT NOT NULL, -- e.g., "1m", "15m", "1h"
            strategy_ref TEXT NOT NULL, -- coin:category:subcategory
            
            -- Trading mode
            recurring_mode TEXT DEFAULT 'am', -- 'am' (amount) or 'qu' (quantity)
            
            -- Timestamps
            executed_at TIMESTAMP WITH TIME ZONE NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            
            -- Trade status
            status trade_status DEFAULT 'pending',
            
            -- Additional metadata
            initial_amount DECIMAL(20, 8), -- for first trades
            initial_quantity DECIMAL(20, 8), -- for first trades
            
            -- Profit tracking (for sell orders)
            buy_price DECIMAL(20, 8), -- original buy price (for sells)
            profit_loss DECIMAL(20, 8), -- calculated profit/loss
            profit_percentage DECIMAL(10, 4), -- profit percentage
            
            -- Constraints
            CONSTRAINT positive_quantity CHECK (quantity > 0),
            CONSTRAINT positive_price CHECK (price > 0),
            CONSTRAINT positive_total CHECK (total_value > 0)
        );
    


        -- Table for tracking strategy performance
        CREATE TABLE IF NOT EXISTS strategy_performance (
            id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
            
            strategy_ref TEXT NOT NULL,
            coin TEXT NOT NULL,
            category TEXT NOT NULL,
            subcategory TEXT NOT NULL,
            
            -- Performance metrics
            total_trades INTEGER DEFAULT 0,
            total_buys INTEGER DEFAULT 0,
            total_sells INTEGER DEFAULT 0,
            total_profit_loss DECIMAL(20, 8) DEFAULT 0,
            total_volume DECIMAL(20, 8) DEFAULT 0,
            avg_profit_percentage DECIMAL(10, 4) DEFAULT 0,
            win_rate DECIMAL(5, 2) DEFAULT 0, -- percentage
            
            -- Time tracking
            first_trade_at TIMESTAMP WITH TIME ZONE,
            last_trade_at TIMESTAMP WITH TIME ZONE,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            
            UNIQUE(strategy_ref)
        );
    


        -- Table for daily/hourly analytics
        CREATE TABLE IF NOT EXISTS trading_analytics (
            id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
            
            date DATE NOT NULL,
            hour INTEGER, -- 0-23, null for daily aggregates
            
            -- Aggregated metrics
            total_trades INTEGER DEFAULT 0,
            total_volume DECIMAL(20, 8) DEFAULT 0,
            total_profit_loss DECIMAL(20, 8) DEFAULT 0,
            best_subcategory TEXT,
            worst_subcategory TEXT,
            
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            
            UNIQUE(date, hour)
        );
    


        -- Create indexes for performance
        CREATE INDEX IF NOT EXISTS idx_trades_symbol ON trades(symbol);
        CREATE INDEX IF NOT EXISTS idx_trades_coin ON trades(coin);
        CREATE INDEX IF NOT EXISTS idx_trades_action ON trades(action);
        CREATE INDEX IF NOT EXISTS idx_trades_subcategory ON trades(subcategory);
        CREATE INDEX IF NOT EXISTS idx_trades_strategy_ref ON trades(strategy_ref);
        CREATE INDEX IF NOT EXISTS idx_trades_executed_at ON trades(executed_at);
        CREATE INDEX IF NOT EXISTS idx_trades_created_at ON trades(created_at);
        CREATE INDEX IF NOT EXISTS idx_trades_status ON trades(status);

        -- Composite indexes for common queries
        CREATE INDEX IF NOT EXISTS idx_trades_coin_subcategory ON trades(coin, subcategory);
        CREATE INDEX IF NOT EXISTS idx_trades_strategy_status ON trades(strategy_ref, status);
        CREATE INDEX IF NOT EXISTS idx_trades_coin_action_date ON trades(coin, action, executed_at);

        -- Create indexes for strategy performance
        CREATE INDEX IF NOT EXISTS idx_strategy_performance_coin ON strategy_performance(coin);
        CREATE INDEX IF NOT EXISTS idx_strategy_performance_subcategory ON strategy_performance(subcategory);
        CREATE INDEX IF NOT EXISTS idx_strategy_performance_profit ON strategy_performance(total_profit_loss);
        CREATE INDEX IF NOT EXISTS idx_strategy_performance_win_rate ON strategy_performance(win_rate);
    


        -- Function for automatic updates
        CREATE OR REPLACE FUNCTION update_updated_at_column()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = NOW();
            RETURN NEW;
        END;
        $$ language 'plpgsql';

        -- Function to calculate profit/loss and update strategy performance
        CREATE OR REPLACE FUNCTION calculate_trade_profit()
        RETURNS TRIGGER AS $$
        DECLARE
            buy_trade RECORD;
            profit_amount DECIMAL(20, 8);
            profit_pct DECIMAL(10, 4);
        BEGIN
            -- Only calculate for sell orders
            IF NEW.action = 'sell' THEN
                -- Find the corresponding buy trade for this strategy
                SELECT * INTO buy_trade 
                FROM trades 
                WHERE strategy_ref = NEW.strategy_ref 
                AND action = 'buy' 
                AND status = 'filled'
                AND executed_at < NEW.executed_at
                ORDER BY executed_at DESC 
                LIMIT 1;
                
                IF FOUND THEN
                    -- Calculate profit
                    profit_amount := NEW.total_value - buy_trade.total_value;
                    profit_pct := (profit_amount / buy_trade.total_value) * 100;
                    
                    -- Update the sell trade with profit info
                    NEW.buy_price := buy_trade.price;
                    NEW.profit_loss := profit_amount;
                    NEW.profit_percentage := profit_pct;
                END IF;
            END IF;
            
            RETURN NEW;
        END;
        $$ language 'plpgsql';

        -- Function to update strategy performance metrics
        CREATE OR REPLACE FUNCTION update_strategy_performance()
        RETURNS TRIGGER AS $$
        BEGIN
            -- Insert or update strategy performance
            INSERT INTO strategy_performance (
                strategy_ref, coin, category, subcategory,
                total_trades, total_buys, total_sells,
                total_profit_loss, total_volume,
                first_trade_at, last_trade_at
            )
            VALUES (
                NEW.strategy_ref,
                NEW.coin,
                NEW.category,
                NEW.subcategory,
                1,
                CASE WHEN NEW.action = 'buy' THEN 1 ELSE 0 END,
                CASE WHEN NEW.action = 'sell' THEN 1 ELSE 0 END,
                COALESCE(NEW.profit_loss, 0),
                NEW.total_value,
                NEW.executed_at,
                NEW.executed_at
            )
            ON CONFLICT (strategy_ref) DO UPDATE SET
                total_trades = strategy_performance.total_trades + 1,
                total_buys = strategy_performance.total_buys + CASE WHEN NEW.action = 'buy' THEN 1 ELSE 0 END,
                total_sells = strategy_performance.total_sells + CASE WHEN NEW.action = 'sell' THEN 1 ELSE 0 END,
                total_profit_loss = strategy_performance.total_profit_loss + COALESCE(NEW.profit_loss, 0),
                total_volume = strategy_performance.total_volume + NEW.total_value,
                last_trade_at = NEW.executed_at,
                updated_at = NOW();
            
            -- Update win rate and average profit for this strategy
            UPDATE strategy_performance SET
                win_rate = (
                    SELECT COALESCE((COUNT(*) FILTER (WHERE profit_loss > 0) * 100.0 / NULLIF(COUNT(*) FILTER (WHERE action = 'sell'), 0)), 0)
                    FROM trades 
                    WHERE strategy_ref = NEW.strategy_ref AND action = 'sell' AND status = 'filled'
                ),
                avg_profit_percentage = (
                    SELECT COALESCE(AVG(profit_percentage), 0)
                    FROM trades 
                    WHERE strategy_ref = NEW.strategy_ref AND action = 'sell' AND status = 'filled'
                )
            WHERE strategy_ref = NEW.strategy_ref;
            
            RETURN NEW;
        END;
        $$ language 'plpgsql';
    


        -- Create triggers
        DROP TRIGGER IF EXISTS update_trades_updated_at ON trades;
        CREATE TRIGGER update_trades_updated_at BEFORE UPDATE ON trades
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

        DROP TRIGGER IF EXISTS update_strategy_performance_updated_at ON strategy_performance;
        CREATE TRIGGER update_strategy_performance_updated_at BEFORE UPDATE ON strategy_performance
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

        DROP TRIGGER IF EXISTS calculate_trade_profit_trigger ON trades;
        CREATE TRIGGER calculate_trade_profit_trigger BEFORE INSERT OR UPDATE ON trades
            FOR EACH ROW EXECUTE FUNCTION calculate_trade_profit();

        DROP TRIGGER IF EXISTS update_strategy_performance_trigger ON trades;
        CREATE TRIGGER update_strategy_performance_trigger AFTER INSERT ON trades
            FOR EACH ROW EXECUTE FUNCTION update_strategy_performance();
    


        -- Enable RLS
        ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
        ALTER TABLE strategy_performance ENABLE ROW LEVEL SECURITY;
        ALTER TABLE trading_analytics ENABLE ROW LEVEL SECURITY;

        -- Create policies (allow all for authenticated users)
        DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON trades;
        CREATE POLICY "Allow all operations for authenticated users" ON trades
            FOR ALL TO authenticated USING (true);

        DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON strategy_performance;
        CREATE POLICY "Allow all operations for authenticated users" ON strategy_performance
            FOR ALL TO authenticated USING (true);

        DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON trading_analytics;
        CREATE POLICY "Allow all operations for authenticated users" ON trading_analytics
            FOR ALL TO authenticated USING (true);

        -- Allow anon access for development
        DROP POLICY IF EXISTS "Allow anon access for development" ON trades;
        CREATE POLICY "Allow anon access for development" ON trades
            FOR ALL TO anon USING (true);

        DROP POLICY IF EXISTS "Allow anon access for development" ON strategy_performance;
        CREATE POLICY "Allow anon access for development" ON strategy_performance
            FOR ALL TO anon USING (true);

        DROP POLICY IF EXISTS "Allow anon access for development" ON trading_analytics;
        CREATE POLICY "Allow anon access for development" ON trading_analytics
            FOR ALL TO anon USING (true);
    