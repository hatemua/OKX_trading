// server.js
const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const dotenv = require('dotenv');
const winston = require('winston');
const redis = require('redis');

dotenv.config();

// === CONFIGURATION ===
const config = {
    // Server Settings
    PORT: process.env.PORT || 3000,
    
    // OKX API Settings
    OKX_API_KEY: process.env.OKX_API_KEY,
    OKX_SECRET_KEY: process.env.OKX_SECRET_KEY,
    OKX_PASSPHRASE: process.env.OKX_PASSPHRASE,
    
    // Use testnet for testing
    USE_TESTNET: process.env.USE_TESTNET === 'true',
    BASE_URL: process.env.USE_TESTNET === 'true' 
        ? 'https://www.okx.com' 
        : 'https://www.okx.com',
    
    // Trading Settings
    TRADING_COIN: process.env.TRADING_COIN || 'DOGE',
    DEFAULT_SYMBOL: `${process.env.TRADING_COIN || 'DOGE'}-USDT`,
    BUY_AMOUNT_USDT: 1000, // Fixed amount for buying
    STOP_LOSS_PERCENTAGE: 2,
    TAKE_PROFIT_PERCENTAGE: 5,
    
    // Cooldown Settings
    COOLDOWN_SECONDS: 60, // Prevent duplicate signals
    
    // Risk Management
    MAX_DAILY_TRADES: 500,
    MIN_BALANCE_USDT: 50,
    
    // Redis Settings
    REDIS_HOST: process.env.REDIS_HOST || 'localhost',
    REDIS_PORT: process.env.REDIS_PORT || 6379,
    REDIS_PASSWORD: process.env.REDIS_PASSWORD || null
};

// === LOGGER SETUP ===
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'error.log', level: 'error' }),
        new winston.transports.File({ filename: 'combined.log' }),
        new winston.transports.Console({
            format: winston.format.simple()
        })
    ]
});

// === REDIS DATABASE ===
class TradeDatabase {
    constructor() {
        this.client = redis.createClient({
            host: config.REDIS_HOST,
            port: config.REDIS_PORT,
            password: config.REDIS_PASSWORD || undefined,
            retry_strategy: (options) => {
                if (options.error && options.error.code === 'ECONNREFUSED') {
                    logger.error('Redis connection refused');
                    return new Error('Redis connection refused');
                }
                if (options.total_retry_time > 1000 * 60 * 60) {
                    return new Error('Retry time exhausted');
                }
                return Math.min(options.attempt * 100, 3000);
            }
        });
        
        this.client.on('error', (err) => {
            logger.error('Redis Client Error:', err);
        });
        
        this.client.on('connect', () => {
            logger.info('Connected to Redis');
        });
    }

    async connect() {
        try {
            await this.client.connect();
            logger.info('Redis database connected successfully');
        } catch (error) {
            logger.error('Failed to connect to Redis:', error);
            throw error;
        }
    }

    // Store a buy order
    async storeBuyOrder(coin, quantity, price, usdtSpent, orderId, timestamp) {
        const key = `buy:${coin}`;
        const orderData = {
            quantity: quantity.toString(),
            price: price.toString(),
            usdtSpent: usdtSpent.toString(),
            orderId: orderId,
            timestamp: timestamp,
            status: 'active'
        };
        
        try {
            await this.client.hSet(key, orderData);
            logger.info(`Stored buy order: ${quantity} ${coin} at ${price} (spent ${usdtSpent} USDT)`);
            return true;
        } catch (error) {
            logger.error('Error storing buy order:', error);
            return false;
        }
    }

    // Get current buy position
    async getBuyPosition(coin) {
        const key = `buy:${coin}`;
        try {
            const data = await this.client.hGetAll(key);
            if (Object.keys(data).length === 0) {
                return null;
            }
            return {
                quantity: parseFloat(data.quantity),
                price: parseFloat(data.price),
                usdtSpent: parseFloat(data.usdtSpent),
                orderId: data.orderId,
                timestamp: data.timestamp,
                status: data.status
            };
        } catch (error) {
            logger.error('Error getting buy position:', error);
            return null;
        }
    }

    // Clear buy position (after selling)
    async clearBuyPosition(coin) {
        const key = `buy:${coin}`;
        try {
            await this.client.del(key);
            logger.info(`Cleared buy position for ${coin}`);
            return true;
        } catch (error) {
            logger.error('Error clearing buy position:', error);
            return false;
        }
    }

    // Check if we can buy (no active position)
    async canBuy(coin) {
        const position = await this.getBuyPosition(coin);
        return position === null || position.status !== 'active';
    }

    // Check if we can sell (have active position)
    async canSell(coin) {
        const position = await this.getBuyPosition(coin);
        return position !== null && position.status === 'active' && position.quantity > 0;
    }

    // Store trading balance (proceeds from sells, or initial amount)
    async storeTradingBalance(coin, usdtAmount) {
        const key = `balance:${coin}`;
        try {
            await this.client.set(key, usdtAmount.toString());
            logger.info(`Stored trading balance: ${usdtAmount} USDT for ${coin}`);
            return true;
        } catch (error) {
            logger.error('Error storing trading balance:', error);
            return false;
        }
    }

    // Get trading balance (amount to use for next buy)
    async getTradingBalance(coin) {
        const key = `balance:${coin}`;
        try {
            const balance = await this.client.get(key);
            if (!balance) {
                // If no balance stored, use default amount
                return config.BUY_AMOUNT_USDT;
            }
            return parseFloat(balance);
        } catch (error) {
            logger.error('Error getting trading balance:', error);
            return config.BUY_AMOUNT_USDT;
        }
    }

    async disconnect() {
        try {
            await this.client.disconnect();
            logger.info('Redis database disconnected');
        } catch (error) {
            logger.error('Error disconnecting from Redis:', error);
        }
    }
}

// === OKX API CLIENT ===
class OKXClient {
    constructor() {
        this.apiKey = config.OKX_API_KEY;
        this.secretKey = config.OKX_SECRET_KEY;
        this.passphrase = config.OKX_PASSPHRASE;
        this.baseURL = config.BASE_URL;
    }

    // Generate signature for OKX API
    sign(timestamp, method, path, body = '') {
        const message = timestamp + method + path + body;
        const hmac = crypto.createHmac('sha256', this.secretKey);
        hmac.update(message);
        return hmac.digest('base64');
    }

    // Make API request to OKX
    async request(method, path, params = null, body = null) {
        try {
            const timestamp = new Date().toISOString();
            let url = this.baseURL + path;
            
            if (method === 'GET' && params) {
                const queryString = new URLSearchParams(params).toString();
                if (queryString) {
                    url += '?' + queryString;
                    path += '?' + queryString;
                }
            }

            const bodyStr = body ? JSON.stringify(body) : '';
            const signature = this.sign(timestamp, method, path, bodyStr);

            const headers = {
                'OK-ACCESS-KEY': this.apiKey,
                'OK-ACCESS-SIGN': signature,
                'OK-ACCESS-TIMESTAMP': timestamp,
                'OK-ACCESS-PASSPHRASE': this.passphrase,
                'Content-Type': 'application/json'
            };

            const axiosConfig = {
                method,
                url,
                headers,
                ...(body && { data: bodyStr })
            };

            const response = await axios(axiosConfig);
            return response.data;
        } catch (error) {
            logger.error('OKX API Error:', error.response?.data || error.message);
            throw error;
        }
    }

    // Get account balance
    async getBalance(currency = 'USDT') {
        try {
            const result = await this.request('GET', '/api/v5/account/balance');
            
            if (result.code === '0' && result.data && result.data[0]) {
                const details = result.data[0].details || [];
                const usdtBalance = details.find(d => d.ccy === currency);
                
                if (usdtBalance) {
                    return {
                        available: parseFloat(usdtBalance.availBal),
                        total: parseFloat(usdtBalance.bal),
                        currency: currency
                    };
                }
            }
            return null;
        } catch (error) {
            logger.error('Error getting balance:', error);
            return null;
        }
    }

    // Place market order
    async placeMarketOrder(symbol, side, amount) {
        try {
            const orderData = {
                instId: symbol,
                tdMode: 'cash', // Spot trading
                side: side, // 'buy' or 'sell'
                ordType: 'market',
                sz: amount.toString()
            };

            const result = await this.request('POST', '/api/v5/trade/order', null, orderData);
            
            if (result.code === '0') {
                logger.info(`Order placed successfully: ${side} ${amount} ${symbol}`);
                return result.data[0];
            } else {
                logger.error('Order failed:', result);
                return null;
            }
        } catch (error) {
            logger.error('Error placing order:', error);
            return null;
        }
    }

    // Place order with stop loss and take profit
    async placeOrderWithSLTP(symbol, side, amount, stopLoss, takeProfit) {
        try {
            // First, place the market order
            const mainOrder = await this.placeMarketOrder(symbol, side, amount);
            
            if (!mainOrder) {
                return null;
            }

            // Get current price for calculating SL/TP
            const ticker = await this.getTicker(symbol);
            if (!ticker) return mainOrder;

            const currentPrice = ticker.last;
            
            // Calculate SL/TP prices
            let slPrice, tpPrice;
            if (side === 'buy') {
                slPrice = currentPrice * (1 - stopLoss / 100);
                tpPrice = currentPrice * (1 + takeProfit / 100);
            } else {
                slPrice = currentPrice * (1 + stopLoss / 100);
                tpPrice = currentPrice * (1 - takeProfit / 100);
            }

            // Place stop-loss order
            const slOrder = {
                instId: symbol,
                tdMode: 'cash',
                side: side === 'buy' ? 'sell' : 'buy',
                ordType: 'conditional',
                sz: amount.toString(),
                slTriggerPx: slPrice.toFixed(4),
                slOrdPx: '-1' // Market order when triggered
            };

            await this.request('POST', '/api/v5/trade/order-algo', null, slOrder);
            logger.info(`Stop loss set at ${slPrice.toFixed(4)}`);

            return mainOrder;
        } catch (error) {
            logger.error('Error placing order with SL/TP:', error);
            return null;
        }
    }

    // Get current ticker price
    async getTicker(symbol) {
        try {
            const result = await this.request('GET', '/api/v5/market/ticker', { instId: symbol });
            
            if (result.code === '0' && result.data && result.data[0]) {
                return {
                    last: parseFloat(result.data[0].last),
                    bid: parseFloat(result.data[0].bidPx),
                    ask: parseFloat(result.data[0].askPx),
                    volume: parseFloat(result.data[0].vol24h)
                };
            }
            return null;
        } catch (error) {
            logger.error('Error getting ticker:', error);
            return null;
        }
    }

    // Get open positions
    async getPositions(symbol = null) {
        try {
            const params = symbol ? { instId: symbol } : {};
            const result = await this.request('GET', '/api/v5/account/positions', params);
            
            if (result.code === '0') {
                return result.data || [];
            }
            return [];
        } catch (error) {
            logger.error('Error getting positions:', error);
            return [];
        }
    }
}

// === SIGNAL MANAGER ===
class SignalManager {
    constructor() {
        this.cooldowns = new Map();
        this.dailyTrades = new Map();
        this.lastAction = null; // Track last executed action
        this.okxClient = new OKXClient();
        this.database = new TradeDatabase();
    }

    async initialize() {
        try {
            await this.database.connect();
            logger.info('SignalManager initialized with Redis database');
        } catch (error) {
            logger.error('Failed to initialize SignalManager:', error);
            throw error;
        }
    }

    // Check if signal is in cooldown
    isInCooldown(symbol, action) {
        const key = `${symbol}-${action}`;
        const lastSignal = this.cooldowns.get(key);
        
        if (!lastSignal) return false;
        
        const elapsed = Date.now() - lastSignal;
        return elapsed < (config.COOLDOWN_SECONDS * 1000);
    }

    // Set cooldown for signal
    setCooldown(symbol, action) {
        const key = `${symbol}-${action}`;
        this.cooldowns.set(key, Date.now());
    }

    // Check daily trade limit
    checkDailyLimit() {
        const today = new Date().toDateString();
        const trades = this.dailyTrades.get(today) || 0;
        
        if (trades >= config.MAX_DAILY_TRADES) {
            return false;
        }
        
        this.dailyTrades.set(today, trades + 1);
        return true;
    }

    // Process trading signal
    async processSignal(signal) {
        try {
            let { action, symbol = config.DEFAULT_SYMBOL, percentage = config.DEFAULT_POSITION_SIZE } = signal;
            
            // Parse action from trading strategy messages
            console.log('Received signal:', signal);
            
            // If action contains a trading message, extract the actual buy/sell action
            if (typeof action === 'string' && action.length > 10) {
                if (action.toLowerCase().includes('order buy')) {
                    action = 'buy';
                } else if (action.toLowerCase().includes('order sell')) {
                    action = 'sell';
                } else {
                    logger.error('Could not parse action from message:', action);
                    return { success: false, error: 'Could not parse trading action from message' };
                }
            }
            
            console.log('Parsed action:', action);
            
            // Validate signal
            if (!['buy', 'sell'].includes(action)) {
                logger.error('Invalid action:', action);
                return { success: false, error: 'Invalid action' };
            }

            // Check Redis database for buy/sell eligibility
            const canBuy = await this.database.canBuy(config.TRADING_COIN);
            const canSell = await this.database.canSell(config.TRADING_COIN);
            
            if (action === 'buy' && !canBuy) {
                logger.warn(`Cannot buy ${config.TRADING_COIN} - already have active position`);
                return { success: false, error: `Already have active ${config.TRADING_COIN} position` };
            }
            
            if (action === 'sell' && !canSell) {
                logger.warn(`Cannot sell ${config.TRADING_COIN} - no active position to sell`);
                return { success: false, error: `No active ${config.TRADING_COIN} position to sell` };
            }

            // Check cooldown
            if (this.isInCooldown(symbol, action)) {
                logger.warn(`Signal in cooldown: ${symbol} ${action}`);
                return { success: false, error: 'Signal in cooldown period' };
            }

            // Check daily limit
            if (!this.checkDailyLimit()) {
                logger.warn('Daily trade limit reached');
                return { success: false, error: 'Daily trade limit reached' };
            }

            // Get account balance (just to verify connection, no minimum check needed)
            const balance = await this.okxClient.getBalance('USDT');

            // Calculate position size
            let positionSize;
            let tradingAmount;
            
            if (action === 'buy') {
                // Get available trading balance (from previous sell or initial amount)
                tradingAmount = await this.database.getTradingBalance(config.TRADING_COIN);
                
                if (!balance || balance.available < tradingAmount) {
                    logger.error(`Insufficient USDT balance. Need ${tradingAmount}, have ${balance?.available || 0}`);
                    return { success: false, error: 'Insufficient USDT balance for trade' };
                }
                positionSize = tradingAmount.toString();
                logger.info(`Using ${tradingAmount} USDT for buy order`);
            } else {
                // For sell, get the quantity from Redis (what we bought)
                const buyPosition = await this.database.getBuyPosition(config.TRADING_COIN);
                if (!buyPosition) {
                    logger.warn(`No buy position found in database for ${config.TRADING_COIN}`);
                    return { success: false, error: `No buy position to sell` };
                }
                
                // Sell the exact quantity we bought
                positionSize = buyPosition.quantity.toString();
                logger.info(`Selling ${positionSize} ${config.TRADING_COIN}`);
            }

            // Place order with stop loss and take profit
            const order = await this.okxClient.placeOrderWithSLTP(
                symbol,
                action,
                positionSize,
                config.STOP_LOSS_PERCENTAGE,
                config.TAKE_PROFIT_PERCENTAGE
            );

            if (order) {
                this.setCooldown(symbol, action);
                this.lastAction = action; // Remember this action
                
                // Update Redis database
                if (action === 'buy') {
                    // Get ticker to store the purchase price
                    const ticker = await this.okxClient.getTicker(symbol);
                    const purchasePrice = ticker ? ticker.last : 0;
                    
                    // Calculate quantity bought (approximate, since we're using USDT amount)
                    const quantityBought = purchasePrice > 0 ? (parseFloat(positionSize) / purchasePrice) : 0;
                    
                    await this.database.storeBuyOrder(
                        config.TRADING_COIN,
                        quantityBought,
                        purchasePrice,
                        tradingAmount,
                        order.ordId,
                        new Date().toISOString()
                    );
                } else {
                    // Calculate proceeds from sell
                    const ticker = await this.okxClient.getTicker(symbol);
                    const currentPrice = ticker ? ticker.last : 0;
                    const soldQuantity = parseFloat(positionSize);
                    const sellProceeds = currentPrice * soldQuantity;
                    
                    // Store new trading balance for next buy
                    await this.database.storeTradingBalance(config.TRADING_COIN, sellProceeds);
                    
                    // Clear buy position after selling
                    await this.database.clearBuyPosition(config.TRADING_COIN);
                    
                    logger.info(`Sell proceeds: ${sellProceeds.toFixed(2)} USDT (will be used for next buy)`);
                }
                
                logger.info(`✅ Order executed: ${action} ${positionSize} ${symbol}`);
                return { 
                    success: true, 
                    order: order,
                    details: {
                        action,
                        symbol,
                        amount: positionSize,
                        timestamp: new Date().toISOString()
                    }
                };
            } else {
                return { success: false, error: 'Order execution failed' };
            }

        } catch (error) {
            logger.error('Error processing signal:', error);
            return { success: false, error: error.message };
        }
    }
}

// === EXPRESS SERVER ===
const app = express();
app.use(express.json());
app.use(express.text());

const signalManager = new SignalManager();

// Initialize SignalManager with Redis
(async () => {
    try {
        await signalManager.initialize();
    } catch (error) {
        logger.error('Failed to initialize application:', error);
        process.exit(1);
    }
})();

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'running', 
        timestamp: new Date().toISOString(),
        config: {
            testnet: config.USE_TESTNET,
            cooldown: config.COOLDOWN_SECONDS,
            maxDailyTrades: config.MAX_DAILY_TRADES
        }
    });
});

// Main webhook endpoint
app.post('/webhook', async (req, res) => {
    try {
        logger.info('Webhook received:', req.body);
        
        // Parse the signal
        let signal;
        if (typeof req.body === 'string') {
            try {
                signal = JSON.parse(req.body);
            } catch {
                // If not JSON, treat as simple text command
                signal = { action: req.body.toLowerCase().trim() };
            }
        } else {
            signal = req.body;
        }

        // Process the signal
        const result = await signalManager.processSignal(signal);
        
        if (result.success) {
            res.json({ 
                success: true, 
                message: 'Signal processed successfully',
                details: result.details 
            });
        } else {
            res.status(400).json({ 
                success: false, 
                error: result.error 
            });
        }

    } catch (error) {
        logger.error('Webhook error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Internal server error' 
        });
    }
});

// Manual trading endpoints (for testing)
app.post('/manual/buy', async (req, res) => {
    const signal = {
        action: 'buy',
        symbol: req.body.symbol || config.DEFAULT_SYMBOL,
        percentage: req.body.percentage || config.DEFAULT_POSITION_SIZE
    };
    
    const result = await signalManager.processSignal(signal);
    res.json(result);
});

app.post('/manual/sell', async (req, res) => {
    const signal = {
        action: 'sell',
        symbol: req.body.symbol || config.DEFAULT_SYMBOL,
        percentage: req.body.percentage || 100
    };
    
    const result = await signalManager.processSignal(signal);
    res.json(result);
});

// Test trade: Buy token with fixed USDT amount
app.post('/test/buy-token', async (req, res) => {
    try {
        const okxClient = new OKXClient();
        
        // Get current token price
        const ticker = await okxClient.getTicker(config.DEFAULT_SYMBOL);
        if (!ticker) {
            return res.status(400).json({ 
                success: false, 
                error: `Failed to get ${config.TRADING_COIN} price` 
            });
        }
        
        // Use fixed USDT amount for market buy orders
        const usdtAmount = 10;
        
        logger.info(`Test trade: Buying ${config.TRADING_COIN} with ${usdtAmount} USDT at price ${ticker.last}`);
        
        // Place market buy order using USDT amount
        const order = await okxClient.placeMarketOrder(config.DEFAULT_SYMBOL, 'buy', usdtAmount.toString());
        
        if (order) {
            res.json({
                success: true,
                message: `Successfully bought ${config.TRADING_COIN} with ${usdtAmount} USDT`,
                details: {
                    symbol: config.DEFAULT_SYMBOL,
                    side: 'buy',
                    usdtSpent: usdtAmount,
                    price: ticker.last,
                    orderId: order.ordId,
                    timestamp: new Date().toISOString()
                }
            });
        } else {
            res.status(400).json({
                success: false,
                error: 'Order execution failed'
            });
        }
        
    } catch (error) {
        logger.error('Test trade error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Get account info
app.get('/account', async (req, res) => {
    try {
        const okxClient = new OKXClient();
        const balance = await okxClient.getBalance();
        const positions = await okxClient.getPositions();
        
        res.json({
            balance,
            positions,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get current position from Redis
app.get('/position', async (req, res) => {
    try {
        const buyPosition = await signalManager.database.getBuyPosition(config.TRADING_COIN);
        const canBuy = await signalManager.database.canBuy(config.TRADING_COIN);
        const canSell = await signalManager.database.canSell(config.TRADING_COIN);
        const tradingBalance = await signalManager.database.getTradingBalance(config.TRADING_COIN);
        
        res.json({
            coin: config.TRADING_COIN,
            buyPosition,
            canBuy,
            canSell,
            tradingBalance: `${tradingBalance} USDT`,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Start server
app.listen(config.PORT, () => {
    logger.info(`🚀 Webhook server running on port ${config.PORT}`);
    logger.info(`📍 Webhook URL: http://YOUR_SERVER:${config.PORT}/webhook`);
    logger.info(`🔧 Test mode: ${config.USE_TESTNET ? 'TESTNET' : 'LIVE'}`);
});