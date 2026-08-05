const express = require('express');
const cors = require('cors');
const http = require('http');
const https = require('https');

const app = express();
app.use(cors()); // 允許您的 HTML 跨網域存取
app.use(express.json());

// 開放無限並發連線池配置
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: Infinity });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: Infinity });

let isTesting = false;
let targetUrl = '';
let metrics = { requests: 0, success: 0, fail: 0 };

// 核心發送迴圈：非同步尾遞迴（一秒可產生數千並發）
function bomb() {
    if (!isTesting) return;

    metrics.requests++;
    
    // Cache Busting 隨機數防快取
    const randUrl = `${targetUrl}${targetUrl.includes('?') ? '&' : '?'}td=${Date.now()}_${Math.random()}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // 3秒不回應判定卡死

    fetch(randUrl, {
        signal: controller.signal,
        agent: targetUrl.startsWith('https') ? httpsAgent : httpAgent,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) StressEngine/1.0',
            'Cache-Control': 'no-cache'
        }
    })
    .then(() => {
        clearTimeout(timeoutId);
        metrics.success++;
    })
    .catch(() => {
        clearTimeout(timeoutId);
        metrics.fail++;
    })
    .finally(() => {
        // 關鍵：利用 setImmediate 讓事件循環不中斷、無縫隙持續發送新請求
        if (isTesting) setImmediate(bomb);
    });
}

// API: 接收控制台的開始指令
app.post('/start', (req, res) => {
    if (isTesting) return res.json({ msg: "已經在測試中" });

    targetUrl = req.body.url;
    isTesting = true;
    metrics = { requests: 0, success: 0, fail: 0 };

    console.log(`🚀 壓測發動！目標：${targetUrl}`);

    // 同時啟動 500 個並發起點
    for (let i = 0; i < 500; i++) {
        bomb();
    }

    res.json({ msg: "測試已啟動" });
});

// API: 接收控制台的停止指令
app.post('/stop', (req, res) => {
    isTesting = false;
    console.log(`🛑 測試已手動終止`);
    res.json(metrics);
});

// API: 讓控制台每秒索取最新數字
app.get('/status', (req, res) => {
    res.json(metrics);
});

app.listen(3000, () => {
    console.log('🌐 後端控制核心執行中：http://localhost:3000');
});

