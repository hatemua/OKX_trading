// Test script to verify OKX history import functionality
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function testOKXHistoryPreview() {
    try {
        console.log('Testing OKX history preview endpoint...');
        
        const response = await fetch('http://localhost:5004/okx-history-preview', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                symbol: 'DOGE-USDT', // Test with DOGE
                days: 7,
                maxTrades: 50
            })
        });

        const result = await response.json();
        
        console.log('Preview result:', JSON.stringify(result, null, 2));
        
        if (result.success && result.trades && result.trades.length > 0) {
            console.log(`✅ Successfully found ${result.count} trades`);
            console.log(`📊 Summary:`, result.summary);
            console.log(`🎯 Sample trade:`, result.trades[0]);
        } else {
            console.log('ℹ️ No trades found or different result:', result.message);
        }
        
    } catch (error) {
        console.error('❌ Error testing OKX history:', error);
    }
}

// Run the test
testOKXHistoryPreview();