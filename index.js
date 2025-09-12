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
    MAX_DAILY_TRADES: 5000,
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

    // Create strategy reference key
    getStrategyKey(coin, category, subcategory) {
        return `${coin}:${category}:${subcategory}`;
    }

    // Store a buy order with strategy reference
    async storeBuyOrder(coin, category, subcategory, quantity, price, usdtSpent, orderId, timestamp) {
        const strategyRef = this.getStrategyKey(coin, category, subcategory);
        const key = `buy:${strategyRef}`;
        const orderData = {
            quantity: quantity.toString(),
            price: price.toString(),
            usdtSpent: usdtSpent.toString(),
            orderId: orderId,
            timestamp: timestamp,
            status: 'active',
            coin: coin,
            category: category,
            subcategory: subcategory
        };
        
        try {
            await this.client.hSet(key, orderData);
            logger.info(`Stored buy order: ${quantity} ${coin} at ${price} (spent ${usdtSpent} USDT) - Strategy: ${strategyRef}`);
            return true;
        } catch (error) {
            logger.error('Error storing buy order:', error);
            return false;
        }
    }

    // Get current buy position by strategy reference
    async getBuyPosition(coin, category, subcategory) {
        const strategyRef = this.getStrategyKey(coin, category, subcategory);
        const key = `buy:${strategyRef}`;
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
                status: data.status,
                coin: data.coin,
                category: data.category,
                subcategory: data.subcategory,
                strategyRef: strategyRef
            };
        } catch (error) {
            logger.error('Error getting buy position:', error);
            return null;
        }
    }

    // Clear buy position (after selling)
    async clearBuyPosition(coin, category, subcategory) {
        const strategyRef = this.getStrategyKey(coin, category, subcategory);
        const key = `buy:${strategyRef}`;
        try {
            await this.client.del(key);
            logger.info(`Cleared buy position for strategy: ${strategyRef}`);
            return true;
        } catch (error) {
            logger.error('Error clearing buy position:', error);
            return false;
        }
    }

    // Check if we can buy (no active position)
    async canBuy(coin, category, subcategory) {
        const position = await this.getBuyPosition(coin, category, subcategory);
        return position === null || position.status !== 'active';
    }

    // Check if we can sell (have active position)
    async canSell(coin, category, subcategory) {
        const position = await this.getBuyPosition(coin, category, subcategory);
        return position !== null && position.status === 'active' && position.quantity > 0;
    }

    // Store trading balance (proceeds from sells, or initial amount) by strategy
    async storeTradingBalance(coin, category, subcategory, usdtAmount) {
        const strategyRef = this.getStrategyKey(coin, category, subcategory);
        const key = `balance:${strategyRef}`;
        try {
            await this.client.set(key, usdtAmount.toString());
            logger.info(`Stored trading balance: ${usdtAmount} USDT for strategy: ${strategyRef}`);
            return true;
        } catch (error) {
            logger.error('Error storing trading balance:', error);
            return false;
        }
    }

    // Get trading balance (amount to use for next buy) by strategy
    async getTradingBalance(coin, category, subcategory) {
        const strategyRef = this.getStrategyKey(coin, category, subcategory);
        const key = `balance:${strategyRef}`;
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

    // Check if this is the first trade for this strategy reference
    async isFirstTrade(coin, category, subcategory) {
        const strategyRef = this.getStrategyKey(coin, category, subcategory);
        const balanceKey = `balance:${strategyRef}`;
        const positionKey = `buy:${strategyRef}`;
        
        try {
            // Check if we have any stored balance or position for this strategy
            const balance = await this.client.get(balanceKey);
            const position = await this.client.hGetAll(positionKey);
            
            // It's the first trade if neither balance nor position exists
            return !balance && Object.keys(position).length === 0;
        } catch (error) {
            logger.error('Error checking first trade:', error);
            return true; // Assume first trade if error
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
                logger.info(`Market order placed successfully: ${side} ${amount} ${symbol}`);
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

    // Place limit order
    async placeLimitOrder(symbol, side, amount, price) {
        try {
            const orderData = {
                instId: symbol,
                tdMode: 'cash', // Spot trading
                side: side, // 'buy' or 'sell'
                ordType: 'limit',
                sz: amount.toString(),
                px: price.toString()
            };

            const result = await this.request('POST', '/api/v5/trade/order', null, orderData);
            
            if (result.code === '0') {
                logger.info(`Limit order placed successfully: ${side} ${amount} ${symbol} at ${price}`);
                return result.data[0];
            } else {
                logger.error('Limit order failed:', result);
                return null;
            }
        } catch (error) {
            logger.error('Error placing limit order:', error);
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

    // Validate if symbol exists on OKX
    async validateSymbol(symbol) {
        try {
            // Try the symbol as provided first
            let result = await this.request('GET', '/api/v5/public/instruments', { 
                instType: 'SPOT',
                instId: symbol 
            });
            
            if (result.code === '0' && result.data && result.data.length > 0) {
                logger.info(`Symbol ${symbol} is valid on OKX`);
                return true;
            }
            
            // If not found, try alternative formats
            const alternatives = [
                symbol.replace('-', ''),    // SOL-USDT → SOLUSDT
                symbol.replace('-', '_'),   // SOL-USDT → SOL_USDT
                symbol.replace('-USDT', '-USD'),  // SOL-USDT → SOL-USD
            ];
            
            for (const alt of alternatives) {
                if (alt !== symbol) {
                    result = await this.request('GET', '/api/v5/public/instruments', { 
                        instType: 'SPOT',
                        instId: alt 
                    });
                    
                    if (result.code === '0' && result.data && result.data.length > 0) {
                        logger.info(`Symbol found with alternative format: ${alt} (original: ${symbol})`);
                        return true;
                    }
                }
            }
            
            logger.error(`Symbol ${symbol} not found on OKX (tried alternatives too)`);
            return false;
            
        } catch (error) {
            logger.error(`Error validating symbol ${symbol}:`, error);
            return false;
        }
    }
}

// === TRADINGVIEW MESSAGE PARSER ===
class TradingViewParser {
    static parseMessage(message) {
        try {
            // Parse TradingView webhook format
            const lines = message.split('\n').map(line => line.trim()).filter(line => line);
            const parsed = {};
            
            for (const line of lines) {
                if (line.includes(':')) {
                    const [key, ...valueParts] = line.split(':');
                    const value = valueParts.join(':').trim();
                    
                    switch (key.toLowerCase().trim()) {
                        case 'coin':
                            // Handle format like "Sol;usdt" or "Sol-usdt"
                            let coinPair = value.replace(/[;]/g, '-').toUpperCase();
                            
                            // Ensure proper OKX format (BASE-QUOTE)
                            if (!coinPair.includes('-')) {
                                // If no separator, assume it's just the base coin, add USDT
                                coinPair = `${coinPair}-USDT`;
                            }
                            
                            parsed.symbol = coinPair;
                            // Extract base coin (e.g., "SOL" from "SOL-USDT")
                            parsed.coin = coinPair.split('-')[0];
                            break;
                        case 'cat':
                            parsed.category = value;
                            break;
                        case 'scat':
                            parsed.subcategory = value;
                            break;
                        case 'action':
                            parsed.action = value.toLowerCase();
                            break;
                        case 'quantity':
                            parsed.quantity = parseFloat(value) || null;
                            break;
                        case 'amount':
                            parsed.amount = parseFloat(value) || null;
                            break;
                        case 'recurringmode':
                            parsed.recurringMode = value.toLowerCase();
                            break;
                        case 'ordertype':
                            parsed.orderType = value.toLowerCase();
                            break;
                        case 'price':
                            parsed.price = parseFloat(value) || null;
                            break;
                        case 'initialamount':
                            parsed.initialAmount = parseFloat(value) || null;
                            break;
                        case 'initialquantity':
                            parsed.initialQuantity = parseFloat(value) || null;
                            break;
                    }
                }
            }
            
            // Validate required fields
            if (!parsed.action || !['buy', 'sell'].includes(parsed.action)) {
                throw new Error('Invalid or missing action');
            }
            
            if (!parsed.symbol) {
                throw new Error('Missing coin pair');
            }
            
            logger.info('Parsed TradingView message:', parsed);
            return parsed;
            
        } catch (error) {
            logger.error('Error parsing TradingView message:', error);
            throw error;
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
    isInCooldown(symbol, action, subcategory = null) {
        const key = subcategory ? `${symbol}-${action}-${subcategory}` : `${symbol}-${action}`;
        const lastSignal = this.cooldowns.get(key);
        
        if (!lastSignal) return false;
        
        const elapsed = Date.now() - lastSignal;
        return elapsed < (config.COOLDOWN_SECONDS * 1000);
    }

    // Set cooldown for signal
    setCooldown(symbol, action, subcategory = null) {
        const key = subcategory ? `${symbol}-${action}-${subcategory}` : `${symbol}-${action}`;
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
            // Convert all signal parameters to lowercase and handle N/A values
            const normalizedSignal = {};
            for (const [key, value] of Object.entries(signal)) {
                if (typeof value === 'string') {
                    // Convert "N/A" to null for easier handling
                    if (value.toLowerCase() === 'n/a') {
                        normalizedSignal[key] = null;
                    } else {
                        normalizedSignal[key] = value.toLowerCase();
                    }
                } else {
                    normalizedSignal[key] = value;
                }
            }
            
            // Extract parameters from normalized signal
            let {
                action,
                symbol,
                coin,
                recurringMode,
                orderType,
                price,
                category,
                subcategory,
                initialAmount,
                initialQuantity
            } = normalizedSignal;
            
            // Convert null values to proper defaults or undefined
            price = price || null;
            initialAmount = initialAmount || null;
            initialQuantity = initialQuantity || null;
            
            // Validate and set order type
            if (!orderType || orderType === null) {
                orderType = price ? 'limit' : 'market';
            }
            
            // Validate orderType is either 'market' or 'limit'
            if (!['market', 'limit'].includes(orderType)) {
                logger.error(`Invalid orderType: ${orderType}. Must be 'market' or 'limit'`);
                return { success: false, error: `Invalid orderType: ${orderType}. Must be 'market' or 'limit'` };
            }
            
            // Set default recurringMode if not provided
            if (!recurringMode || !['am', 'qu'].includes(recurringMode)) {
                recurringMode = 'am'; // Default to amount mode
            }
            
            // Convert coin and symbol back to uppercase for consistency
            if (coin) {
                coin = coin.toUpperCase();
            }
            if (symbol) {
                symbol = symbol.toUpperCase();
            }
            
            logger.info('Processing signal:', signal);
            
            // Validate signal
            if (!action || !['buy', 'sell'].includes(action)) {
                logger.error('Invalid or missing action:', action);
                return { success: false, error: 'Invalid or missing action' };
            }
            
            if (!symbol || !coin) {
                logger.error('Missing coin or symbol:', { symbol, coin });
                return { success: false, error: 'Missing coin or symbol information' };
            }

            // Validate that the symbol exists on OKX
            const symbolValid = await this.okxClient.validateSymbol(symbol);
            if (!symbolValid) {
                logger.error(`Invalid symbol: ${symbol}`);
                return { success: false, error: `Symbol ${symbol} not available on OKX` };
            }

            // Check Redis database for buy/sell eligibility using strategy reference
            const canBuy = await this.database.canBuy(coin, category, subcategory);
            const canSell = await this.database.canSell(coin, category, subcategory);
            const strategyRef = this.database.getStrategyKey(coin, category, subcategory);
            
            if (action === 'buy' && !canBuy) {
                logger.warn(`Cannot buy ${coin} - already have active position for strategy: ${strategyRef}`);
                return { success: false, error: `Already have active position for strategy: ${strategyRef}` };
            }
            
            if (action === 'sell' && !canSell) {
                logger.warn(`Cannot sell ${coin} - no active position for strategy: ${strategyRef}`);
                return { success: false, error: `No active position to sell for strategy: ${strategyRef}` };
            }

            // Check cooldown
            if (this.isInCooldown(symbol, action, subcategory)) {
                logger.warn(`Signal in cooldown: ${symbol} ${action} ${subcategory || 'no-subcategory'}`);
                return { success: false, error: 'Signal in cooldown period' };
            }

            // Check daily limit
            if (!this.checkDailyLimit()) {
                logger.warn('Daily trade limit reached');
                return { success: false, error: 'Daily trade limit reached' };
            }

            // Get account balance
            const balance = await this.okxClient.getBalance('USDT');

            // Calculate position size based on recurring mode
            let positionSize;
            let tradingAmount;
            
            if (action === 'buy') {
                const isFirstTrade = await this.database.isFirstTrade(coin, category, subcategory);
                
                if (isFirstTrade) {
                    // First trade: use initial parameters if provided
                    if (initialQuantity) {
                        // Buy specific token quantity
                        positionSize = initialQuantity.toString();
                        logger.info(`Buy mode: First trade with ${initialQuantity} ${coin} (initialQuantity) - Strategy: ${strategyRef}`);
                    } else if (initialAmount) {
                        // Buy with specific USDT amount
                        tradingAmount = initialAmount;
                        if (!balance || balance.available < tradingAmount) {
                            logger.error(`Insufficient USDT balance. Need ${tradingAmount}, have ${balance?.available || 0}`);
                            return { success: false, error: 'Insufficient USDT balance for trade' };
                        }
                        positionSize = tradingAmount.toString();
                        logger.info(`Buy mode: First trade with ${tradingAmount} USDT (initialAmount) - Strategy: ${strategyRef}`);
                    } else {
                        // Use default amount
                        tradingAmount = config.BUY_AMOUNT_USDT;
                        if (!balance || balance.available < tradingAmount) {
                            logger.error(`Insufficient USDT balance. Need ${tradingAmount}, have ${balance?.available || 0}`);
                            return { success: false, error: 'Insufficient USDT balance for trade' };
                        }
                        positionSize = tradingAmount.toString();
                        logger.info(`Buy mode: First trade with ${tradingAmount} USDT (default) - Strategy: ${strategyRef}`);
                    }
                } else {
                    // Subsequent trades: use stored balance from previous sell
                    tradingAmount = await this.database.getTradingBalance(coin, category, subcategory);
                    if (!balance || balance.available < tradingAmount) {
                        logger.error(`Insufficient USDT balance. Need ${tradingAmount}, have ${balance?.available || 0}`);
                        return { success: false, error: 'Insufficient USDT balance for trade' };
                    }
                    positionSize = tradingAmount.toString();
                    logger.info(`Buy mode: Using ${tradingAmount} USDT from previous sell proceeds - Strategy: ${strategyRef}`);
                }
            } else {
                // Sell logic
                const buyPosition = await this.database.getBuyPosition(coin, category, subcategory);
                const isFirstTrade = await this.database.isFirstTrade(coin, category, subcategory);
                
                if (isFirstTrade) {
                    // First sell: use initial parameters if provided
                    if (initialQuantity) {
                        // Sell specific token quantity
                        positionSize = initialQuantity.toString();
                        logger.info(`Sell mode: First trade selling ${initialQuantity} ${coin} (initialQuantity) - Strategy: ${strategyRef}`);
                    } else if (recurringMode === 'am') {
                        // For Am mode, prevent selling on first trade if no initial parameters
                        logger.warn(`Cannot sell on first trade for Am mode without position - Strategy: ${strategyRef}`);
                        return { success: false, error: `Cannot sell on first trade for Am mode. Must buy first - Strategy: ${strategyRef}` };
                    } else {
                        // For other modes, check if there's a position to sell
                        if (!buyPosition) {
                            logger.warn(`No buy position found for first sell - Strategy: ${strategyRef}`);
                            return { success: false, error: `No buy position to sell for strategy: ${strategyRef}` };
                        }
                        positionSize = buyPosition.quantity.toString();
                        logger.info(`Sell mode: First trade selling ${positionSize} ${coin} (from position) - Strategy: ${strategyRef}`);
                    }
                } else {
                    // Subsequent sells: use existing position
                    if (!buyPosition) {
                        logger.warn(`No buy position found for strategy: ${strategyRef}`);
                        return { success: false, error: `No buy position to sell for strategy: ${strategyRef}` };
                    }
                    
                    // Both Qu and Am modes: sell the quantity that was bought
                    positionSize = buyPosition.quantity.toString();
                    logger.info(`Sell mode: Selling ${positionSize} ${coin} (strategy: ${strategyRef})`);
                }
            }

            // Place order based on order type
            let order;
            if (orderType === 'limit' && price) {
                order = await this.okxClient.placeLimitOrder(symbol, action, positionSize, price);
            } else {
                order = await this.okxClient.placeMarketOrder(symbol, action, positionSize);
            }

            if (order) {
                this.setCooldown(symbol, action, subcategory);
                
                // Update Redis database
                if (action === 'buy') {
                    // Get ticker to store the purchase price
                    const ticker = await this.okxClient.getTicker(symbol);
                    const purchasePrice = ticker ? ticker.last : (price || 0);
                    
                    let quantityBought, amountSpent;
                    
                    if (initialQuantity) {
                        // When buying by quantity, calculate amount spent
                        quantityBought = initialQuantity;
                        amountSpent = quantityBought * purchasePrice;
                    } else {
                        // When buying by amount, calculate quantity bought
                        amountSpent = tradingAmount;
                        quantityBought = purchasePrice > 0 ? (amountSpent / purchasePrice) : 0;
                    }
                    
                    await this.database.storeBuyOrder(
                        coin,
                        category,
                        subcategory,
                        quantityBought,
                        purchasePrice,
                        amountSpent,
                        order.ordId,
                        new Date().toISOString()
                    );
                    
                    logger.info(`Stored buy: ${quantityBought} ${coin} for ${amountSpent} USDT (strategy: ${strategyRef})`);
                } else {
                    // Calculate proceeds from sell
                    const ticker = await this.okxClient.getTicker(symbol);
                    const currentPrice = ticker ? ticker.last : (price || 0);
                    const soldQuantity = parseFloat(positionSize);
                    const sellProceeds = currentPrice * soldQuantity;
                    
                    // Store new trading balance for next buy based on recurring mode
                    if (recurringMode === 'am') {
                        // Amount mode: store sell proceeds for next buy
                        await this.database.storeTradingBalance(coin, category, subcategory, sellProceeds);
                        logger.info(`Sell proceeds: ${sellProceeds.toFixed(2)} USDT (will be used for next buy) - Strategy: ${strategyRef}`);
                    } else if (recurringMode === 'qu') {
                        // Quantity mode: store the original amount that was used for buying
                        const buyPosition = await this.database.getBuyPosition(coin, category, subcategory);
                        if (buyPosition) {
                            await this.database.storeTradingBalance(coin, category, subcategory, buyPosition.usdtSpent);
                            logger.info(`Quantity mode: Will use original amount ${buyPosition.usdtSpent} USDT for next buy - Strategy: ${strategyRef}`);
                        }
                    }
                    
                    // Clear buy position after selling
                    await this.database.clearBuyPosition(coin, category, subcategory);
                }
                
                logger.info(`✅ Order executed: ${action} ${positionSize} ${symbol} (${orderType})`);
                return { 
                    success: true, 
                    order: order,
                    details: {
                        action,
                        symbol,
                        coin,
                        amount: positionSize,
                        orderType,
                        price: price || 'market',
                        recurringMode,
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
                // Try to parse as JSON first
                signal = JSON.parse(req.body);
            } catch {
                // If not JSON, try to parse as TradingView format
                try {
                    signal = TradingViewParser.parseMessage(req.body);
                } catch (parseError) {
                    // If TradingView parsing fails, treat as simple text command
                    signal = { action: req.body.toLowerCase().trim() };
                }
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

// Test webhook with JSON (for testing purposes)
app.post('/test/webhook', async (req, res) => {
    try {
        logger.info('Test webhook received:', req.body);
        
        // Process the signal directly
        const result = await signalManager.processSignal(req.body);
        
        if (result.success) {
            res.json({ 
                success: true, 
                message: 'Test signal processed successfully',
                details: result.details 
            });
        } else {
            res.status(400).json({ 
                success: false, 
                error: result.error 
            });
        }

    } catch (error) {
        logger.error('Test webhook error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Internal server error' 
        });
    }
});

// Get current position from Redis by strategy
app.get('/position/:coin/:category/:subcategory', async (req, res) => {
    try {
        const coin = req.params.coin?.toUpperCase();
        const category = req.params.category;
        const subcategory = req.params.subcategory;
        
        if (!coin || !category || !subcategory) {
            return res.status(400).json({ 
                error: 'Missing required parameters: coin, category, subcategory' 
            });
        }
        
        const buyPosition = await signalManager.database.getBuyPosition(coin, category, subcategory);
        const canBuy = await signalManager.database.canBuy(coin, category, subcategory);
        const canSell = await signalManager.database.canSell(coin, category, subcategory);
        const tradingBalance = await signalManager.database.getTradingBalance(coin, category, subcategory);
        const strategyRef = signalManager.database.getStrategyKey(coin, category, subcategory);
        
        res.json({
            strategyRef: strategyRef,
            coin: coin,
            category: category,
            subcategory: subcategory,
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