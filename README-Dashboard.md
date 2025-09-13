# OKX Trading Bot Dashboard

A comprehensive Next.js dashboard for analyzing OKX trading bot performance with Supabase integration for permanent trade storage and analytics.

## 🚀 Features

### 🎯 **Subcategory Analytics**
- **Performance Ranking**: See which timeframes (1m, 5m, 15m, etc.) perform best
- **Profit Analysis**: Compare profit/loss across different subcategories
- **Win Rate Tracking**: Monitor success rates by timeframe
- **Visual Charts**: Beautiful charts showing performance distribution

### 📊 **Trading Analytics**
- **Real-time Dashboard**: Overview of key metrics and recent trades
- **Strategy Performance**: Detailed analysis of each strategy's effectiveness  
- **Trade History**: Complete trade log with advanced filtering
- **Export Functionality**: Download trade data as CSV for external analysis

### 🔄 **Data Management**
- **Supabase Integration**: Permanent storage of all trades with full analytics
- **OKX History Import**: Automatically import existing trade history
- **Redis Caching**: Fast temporary data for active positions
- **Automatic Profit Calculation**: Real-time P&L tracking with percentages

## 🏗️ Architecture

### Backend (Enhanced Bot)
- **Supabase Client**: Permanent trade storage with analytics
- **Redis Database**: Fast caching for active positions  
- **API Endpoints**: RESTful endpoints for dashboard data
- **Trade Tracking**: Enhanced with subcategory-based cooldowns

### Frontend (Next.js Dashboard)
- **Modern UI**: Beautiful, responsive design with Tailwind CSS
- **Real-time Charts**: Interactive charts using Recharts
- **Advanced Filtering**: Multi-criteria trade filtering and search
- **Performance Metrics**: Comprehensive analytics and KPIs

## 📦 Installation

### 1. Set up Supabase Database

1. Create a new Supabase project at [supabase.com](https://supabase.com)
2. Run the SQL schema in `supabase-schema.sql` in your Supabase SQL editor
3. Get your project URL and anon key from Settings → API

### 2. Configure Environment Variables

Update `.env` in the bot directory:
```env
# Supabase Configuration
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here

# Existing OKX configuration...
OKX_API_KEY=your-okx-api-key
OKX_SECRET_KEY=your-okx-secret-key
OKX_PASSPHRASE=your-okx-passphrase
```

Update `.env.local` in the dashboard directory:
```env
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
BOT_API_URL=http://localhost:5004
```

### 3. Start the Bot
```bash
# Install new dependencies
npm install @supabase/supabase-js

# Start the enhanced bot
node index.js
```

### 4. Start the Dashboard
```bash
cd trading-dashboard
npm install
npm run dev
```

The dashboard will be available at `http://localhost:3000`

## 🎛️ Dashboard Pages

### 📈 **Overview (`/`)**
- Key performance metrics
- Recent trades table  
- Quick import functionality
- Real-time statistics

### 🎯 **Subcategories (`/subcategories`)**
- **Best performing timeframes** ranked by profit
- **Interactive charts** showing profit distribution
- **Detailed performance table** with win rates and trade counts
- **Filtering by coin** to analyze specific assets

### 🏆 **Performance (`/performance`)**
- **Strategy comparison** across all timeframes
- **Volume vs Profit analysis** to identify optimal strategies
- **Win rate tracking** by subcategory
- **Detailed performance metrics**

### 📋 **Trades (`/trades`)**  
- **Complete trade history** with advanced filtering
- **Search functionality** across symbols, categories, subcategories
- **Date range filtering** for specific time periods
- **CSV export** for external analysis
- **Real-time P&L calculations**

## 🔧 API Endpoints

The enhanced bot provides these new analytics endpoints:

- `POST /import-history` - Import OKX trade history
- `GET /analytics/performance` - Get strategy performance data
- `GET /analytics/best-subcategories` - Get best performing timeframes
- `GET /analytics/recent-trades` - Get recent trades with filters
- `GET /analytics/trading` - Get trading analytics by date
- `GET /analytics/trades/:coin/:category/:subcategory` - Get trades by strategy

## 🎨 Key Improvements

### ✅ **Fixed Cooldown System**
- **Subcategory-specific cooldowns**: Different timeframes can now trade independently
- **Enhanced logging**: Better visibility into cooldown decisions
- **Strategic flexibility**: No more blocked signals from different timeframes

### 📊 **Advanced Analytics**
- **Automatic profit calculation**: Real-time P&L tracking with buy/sell matching
- **Strategy performance metrics**: Win rates, average profit percentages, volume analysis
- **Timeframe comparison**: Identify which timeframes (1m, 5m, 15m, etc.) work best
- **Historical data analysis**: Import and analyze existing OKX trade history

### 💾 **Permanent Data Storage**
- **Supabase integration**: All trades stored permanently with full analytics
- **Automated triggers**: Profit calculations and performance updates happen automatically
- **Data consistency**: No more lost trade data, complete audit trail
- **Scalable architecture**: Ready for high-volume trading analysis

## 📱 Usage Examples

### Find Best Performing Timeframes
1. Navigate to **Subcategories** page
2. Filter by coin (e.g., DOGE) 
3. See ranked list of timeframes by profit
4. Identify which timeframes (1m, 5m, 15m) work best for each coin

### Analyze Trading Performance
1. Go to **Performance** page
2. View strategy comparison charts
3. Check volume vs profit correlation
4. Identify underperforming strategies to optimize

### Export Trade Data
1. Visit **Trades** page
2. Apply filters (date range, coin, subcategory)
3. Click **Export CSV** button
4. Analyze in Excel or other tools

### Import Historical Data
1. Click **Import OKX History** on dashboard
2. System fetches recent trade history
3. Data is automatically stored in Supabase
4. Analytics are updated with historical performance

## 🚀 Next Steps

With this comprehensive system, you can now:

1. **Identify optimal timeframes** for each coin you trade
2. **Track real-time performance** across all strategies  
3. **Make data-driven decisions** about which subcategories to focus on
4. **Export and analyze** your trading data in depth
5. **Monitor cooldowns** and ensure strategies don't interfere with each other

The dashboard provides everything you need to optimize your trading bot's performance and make informed decisions about which timeframe strategies work best for your trading style!