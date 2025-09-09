// server.js
const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const dotenv = require('dotenv');
const winston = require('winston');

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
    DEFAULT_SYMBOL: 'SOL-USDT',
    DEFAULT_POSITION_SIZE: 10, // percentage of balance
    MAX_POSITION_SIZE: 20, // maximum position size
    STOP_LOSS_PERCENTAGE: 2,
    TAKE_PROFIT_PERCENTAGE: 5,
    
    // Cooldown Settings
    COOLDOWN_SECONDS: 60, // Prevent duplicate signals
    
    // Risk Management
    MAX_DAILY_TRADES: 10,
    MIN_BALANCE_USDT: 50
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
        this.okxClient = new OKXClient();
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
            const { action, symbol = config.DEFAULT_SYMBOL, percentage = config.DEFAULT_POSITION_SIZE } = signal;
            
            // Validate signal
            if (!['buy', 'sell'].includes(action)) {
                logger.error('Invalid action:', action);
                return { success: false, error: 'Invalid action' };
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

            // Get account balance
            const balance = await this.okxClient.getBalance('USDT');
            if (!balance || balance.available < config.MIN_BALANCE_USDT) {
                logger.error('Insufficient balance');
                return { success: false, error: 'Insufficient balance' };
            }

            // Calculate position size - use 100% of available balance
            let positionSize;
            if (action === 'buy') {
                // Use all available USDT for buying
                positionSize = balance.available.toString();
            } else {
                // For sell, get current SOL position and sell all of it
                const solBalance = await this.okxClient.getBalance('SOL');
                if (!solBalance || solBalance.available <= 0) {
                    logger.warn('No SOL position to sell');
                    return { success: false, error: 'No SOL position to sell' };
                }
                
                // Sell all available SOL
                positionSize = solBalance.available.toString();
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

// Test trade: Buy SOL with exactly 4 USDT
app.post('/test/buy-sol', async (req, res) => {
    try {
        const okxClient = new OKXClient();
        
        // Get current SOL price
        const ticker = await okxClient.getTicker('SOL-USDT');
        if (!ticker) {
            return res.status(400).json({ 
                success: false, 
                error: 'Failed to get SOL price' 
            });
        }
        
        // Use USDT amount directly for market buy orders
        const usdtAmount = 10;
        
        logger.info(`Test trade: Buying SOL with ${usdtAmount} USDT at price ${ticker.last}`);
        
        // Place market buy order using USDT amount
        const order = await okxClient.placeMarketOrder('SOL-USDT', 'buy', usdtAmount.toString());
        
        if (order) {
            res.json({
                success: true,
                message: `Successfully bought SOL with ${usdtAmount} USDT`,
                details: {
                    symbol: 'SOL-USDT',
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

// Start server
app.listen(config.PORT, () => {
    logger.info(`🚀 Webhook server running on port ${config.PORT}`);
    logger.info(`📍 Webhook URL: http://YOUR_SERVER:${config.PORT}/webhook`);
    logger.info(`🔧 Test mode: ${config.USE_TESTNET ? 'TESTNET' : 'LIVE'}`);
});