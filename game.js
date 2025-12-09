/* webapp/game.js (v78.1 - FINAL: Full History & Total P/L Summary) */

const tg = window.Telegram.WebApp;
const API_BASE_URL = window.location.origin;
const WS_BASE_URL = API_BASE_URL.replace('http', 'ws');

// تنظیمات سراسری
const CONFIG = {
    ROUND_DURATION: 60,
    EST_USDT_RATE: 90000, 
    CHART_COLORS: {
        bg: 'transparent',
        text: '#848E9C',
        grid: 'transparent',
        up: '#0ECB81',
        down: '#F6465D',
        areaTopUp: 'rgba(14, 203, 129, 0.5)',
        areaBottomUp: 'rgba(14, 203, 129, 0.01)',
        areaTopDown: 'rgba(246, 70, 93, 0.5)',
        areaBottomDown: 'rgba(246, 70, 93, 0.01)',
        gold: '#FFCC00'
    },
    TROPHY_COLORS: {
        1: '#FFD700', // Gold
        2: '#C0C0C0', // Silver
        3: '#CD7F32'  // Bronze
    }
};

let chart, candleSeries, lineSeries;
let lastPrice = 0;
let isFirstLoad = true;
let lastCandleTime = 0; 
let gameWebSocket = null;
let wsConnectAttempt = 0;
let currentUUSDBalance = 0;
window.lastRoundId = null; 
window.lastCandleOpenPrice = null;

let entryPriceLine = null;
let closePriceLine = null;
let isResultModalActive = false;

// --- سیستم صوتی ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const SoundFX = {
    playTone: (freq, type, duration, vol = 0.1) => {
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        gain.gain.setValueAtTime(vol, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + duration);
    },
    tick: () => SoundFX.playTone(800, 'sine', 0.05, 0.05),
    click: () => SoundFX.playTone(400, 'triangle', 0.05, 0.05),
    success: () => { SoundFX.playTone(600, 'sine', 0.1, 0.1); setTimeout(() => SoundFX.playTone(1200, 'sine', 0.2, 0.1), 100); },
    win: () => { [523.25, 659.25, 783.99, 1046.50].forEach((f, i) => setTimeout(() => SoundFX.playTone(f, 'triangle', 0.3, 0.1), i * 80)); },
    lose: () => { setTimeout(() => SoundFX.playTone(300, 'sawtooth', 0.3, 0.1), 0); setTimeout(() => SoundFX.playTone(200, 'sawtooth', 0.4, 0.1), 200); }
};

window.onload = function() {
    tg.ready();
    tg.expand();
    tg.setHeaderColor('#050505'); 
    tg.setBackgroundColor('#050505');
    if (!tg.initData) tg.initData = "query_id=TEST_DEV_MODE";

    initChart();
    setupEventListeners();
    
    initWebSocket(); 
    fetchInitialData(); 
};

// ==========================================
// 1. WebSocket Setup (Real-time Core)
// (بدون تغییر)
// ==========================================

function initWebSocket() {
    if (gameWebSocket && gameWebSocket.readyState === WebSocket.OPEN) return;
    
    const url = `${WS_BASE_URL}/ws/game?init_data=${encodeURIComponent(tg.initData)}`;
    gameWebSocket = new WebSocket(url);

    let connectionTimeout = setTimeout(() => {
        if (gameWebSocket.readyState !== WebSocket.OPEN) {
             showToast("⚠️ اتصال Real-time برقرار نشد. داده‌ها به روز نیستند.");
             setConnectionStatus(false);
             const loaderEl = document.getElementById('game-loader');
             if(loaderEl) loaderEl.style.display = 'none';
        }
    }, 5000); 

    gameWebSocket.onopen = () => {
        clearTimeout(connectionTimeout);
        console.log("WebSocket connected.");
        wsConnectAttempt = 0;
        setConnectionStatus(true);
        const loaderEl = document.getElementById('game-loader');
        if(loaderEl) { loaderEl.style.opacity='0'; setTimeout(()=>loaderEl.style.display='none', 500); }
    };

    gameWebSocket.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            handleWebSocketMessage(data);
        } catch (e) {
            console.error("Failed to parse WS message:", e);
        }
    };

    gameWebSocket.onclose = () => {
        clearTimeout(connectionTimeout);
        console.log("WebSocket disconnected. Retrying...");
        gameWebSocket = null;
        setConnectionStatus(false);
        if (wsConnectAttempt < 5) {
            wsConnectAttempt++;
            setTimeout(initWebSocket, 2000 * wsConnectAttempt);
        } else {
            showToast("❌ اتصال قطع شد. لطفا صفحه را رفرش کنید.");
            console.error("Max WebSocket retries reached.");
        }
    };

    gameWebSocket.onerror = (error) => {
        clearTimeout(connectionTimeout);
        console.error("WebSocket error:", error);
        showToast("⚠️ خطای WebSocket. در حال تلاش مجدد...");
    };
}

function handleWebSocketMessage(data) {
    if (data.type === 'GAME_UPDATE') {
        const serverPrice = data.current_price;

        updateGameStatus(data);

        updateChartData(serverPrice, data.round.id, data.round.time_left);

        if (data.last_result && data.last_result.round_id && !isResultModalActive) {
            showResultModal(data.last_result);
        }
    }
}

// ==========================================
// 2. Data & UI Management
// ==========================================

function setConnectionStatus(isConnected) {
    const el = document.getElementById('connection-status');
    const txt = el.querySelector('.status-text');
    const dot = el.querySelector('.status-dot');
    if (isConnected) {
        dot.style.background = CONFIG.CHART_COLORS.up; txt.style.color = CONFIG.CHART_COLORS.up; txt.innerText = 'متصل';
    } else {
        dot.style.background = CONFIG.CHART_COLORS.down; txt.style.color = CONFIG.CHART_COLORS.down; txt.innerText = 'قطع';
    }
}


async function fetchInitialData() {
    try {
        const res = await fetch(`${API_BASE_URL}/webapp/get_wallet_data`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ initData: tg.initData })
        });
        if (res.ok) {
            const data = await res.json();
            if (data.status === 'success') {
                document.getElementById('user-balance-display').innerText = parseFloat(data.balances.uusd).toLocaleString('en-US', {minimumFractionDigits: 2});
                currentUUSDBalance = parseFloat(data.balances.uusd);
            }
        }
    } catch(e) {}
}

function updateGameStatus(data) {
    if (data.user_balance !== undefined) {
        document.getElementById('user-balance-display').innerText = data.user_balance.toLocaleString('en-US', {minimumFractionDigits: 2});
        currentUUSDBalance = data.user_balance;
    }
    
    if (data.round) {
        updateTimerVisuals(data.round.time_left);
        document.getElementById('round-id').innerText = `#${data.round.id}`;
        const isLocked = data.round.time_left <= 10;
        const hasBet = !!data.user_bet;
        toggleTradeButtons(isLocked || hasBet);
    }
    
    const elEntry = document.getElementById('entry-display');
    if (data.user_bet && data.user_bet.entry_price) {
        elEntry.classList.remove('hidden');
        const isUp = data.user_bet.prediction === 'UP';
        const color = isUp ? CONFIG.CHART_COLORS.up : CONFIG.CHART_COLORS.down;
        const icon = isUp ? '▲' : '▼';
        const text = isUp ? 'خرید' : 'فروش';
        elEntry.innerHTML = `<span style="color:${color}; font-weight:bold; margin-left:5px;">${icon} ${text}</span> <span class="mono-font">$${data.user_bet.entry_price.toLocaleString()}</span>`;
        
        if(!entryPriceLine) {
             entryPriceLine = lineSeries.createPriceLine({
                 price: data.user_bet.entry_price,
                 color: CONFIG.CHART_COLORS.gold,
                 lineWidth: 2,
                 lineStyle: LightweightCharts.LineStyle.Dotted,
                 axisLabelVisible: true,
                 title: 'قیمت ورود'
             });
        }
        
    } else { 
        elEntry.classList.add('hidden'); 
        if(entryPriceLine) {
            lineSeries.removePriceLine(entryPriceLine);
            entryPriceLine = null;
        }
    }

    if (data.history) updateHistoryRibbon(data.history);
}

// ==========================================
// 3. Chart Logic (Upgraded to Candlestick)
// (بدون تغییر)
// ==========================================

function initChart() {
    const container = document.getElementById('tv-chart-container');
    chart = LightweightCharts.createChart(container, {
        width: container.clientWidth,
        height: container.clientHeight,
        layout: { background: { type: 'solid', color: CONFIG.CHART_COLORS.bg }, textColor: CONFIG.CHART_COLORS.text, fontFamily: "'Roboto Mono', monospace" },
        grid: { vertLines: { color: 'rgba(255, 255, 255, 0.05)' }, horzLines: { color: 'rgba(255, 255, 255, 0.05)' } },
        rightPriceScale: { borderColor: 'transparent', visible: true, scaleMargins: { top: 0.2, bottom: 0.1 } },
        timeScale: { borderColor: 'transparent', timeVisible: true, secondsVisible: true, rightOffset: 2, fixLeftEdge: true },
        crosshair: { vertLine: { width: 1, color: 'rgba(255, 255, 255, 0.1)', style: 3, labelBackgroundColor: '#171B26' }, horzLine: { width: 1, color: 'rgba(255, 255, 255, 0.1)', style: 3, labelBackgroundColor: '#171B26' } },
        handleScroll: { mouseWheel: false, pressedMouseMove: true },
        handleScale: { axisPressedMouseMove: false, mouseWheel: false, pinch: false },
    });
    
    candleSeries = chart.addCandlestickSeries({
        upColor: CONFIG.CHART_COLORS.up, downColor: CONFIG.CHART_COLORS.down,
        borderVisible: false, wickUpColor: CONFIG.CHART_COLORS.up, wickDownColor: CONFIG.CHART_COLORS.down,
    });
    
    lineSeries = chart.addLineSeries({
        color: CONFIG.CHART_COLORS.gold, lineWidth: 1, crosshairMarkerVisible: true,
        crosshairMarkerBackgroundColor: CONFIG.CHART_COLORS.gold, lastValueVisible: true,
    });
    
    new ResizeObserver(entries => {
        if (entries.length === 0 || entries[0].target !== container) return;
        const newRect = entries[0].contentRect;
        chart.applyOptions({ height: newRect.height, width: newRect.width });
        chart.timeScale().fitContent();
    }).observe(container);
}

function updateChartData(serverPrice, roundId, timeLeft) {
    const domPrice = document.getElementById('btc-price');
    const now = Math.floor(Date.now() / 1000); 

    const isUp = serverPrice >= lastPrice; 
    const color = isUp ? CONFIG.CHART_COLORS.up : CONFIG.CHART_COLORS.down;
    domPrice.style.color = color; 
    domPrice.innerText = serverPrice.toLocaleString('en-US', {minimumFractionDigits: 2});
    
    lineSeries.update({ time: now, value: serverPrice });

    if (isFirstLoad) {
        const initialTime = now - CONFIG.ROUND_DURATION;
        candleSeries.setData([
            { time: initialTime, open: serverPrice - 10, high: serverPrice + 10, low: serverPrice - 10, close: serverPrice }
        ]);
        lastCandleTime = initialTime;
        document.getElementById('chart-loader').classList.add('fade-out'); 
        isFirstLoad = false;
    } 

    if (roundId !== window.lastRoundId) {
        if (window.lastCandleOpenPrice) {
            candleSeries.update({
                time: lastCandleTime,
                open: window.lastCandleOpenPrice,
                high: Math.max(window.lastCandleHigh, serverPrice),
                low: Math.min(window.lastCandleLow, serverPrice),
                close: serverPrice 
            });
        }
        
        lastCandleTime = now;
        window.lastCandleOpenPrice = serverPrice;
        window.lastCandleHigh = serverPrice;
        window.lastCandleLow = serverPrice;
        
    } else {
        if (window.lastCandleOpenPrice) {
            window.lastCandleHigh = Math.max(window.lastCandleHigh, serverPrice);
            window.lastCandleLow = Math.min(window.lastCandleLow, serverPrice);
            
            candleSeries.update({
                time: lastCandleTime,
                open: window.lastCandleOpenPrice,
                high: window.lastCandleHigh,
                low: window.lastCandleLow,
                close: serverPrice 
            });
        }
    }
    
    if (timeLeft > 55 && closePriceLine) {
        lineSeries.removePriceLine(closePriceLine);
        closePriceLine = null;
    }


    window.lastRoundId = roundId;
    lastPrice = serverPrice;
}

// ==========================================
// 4. Game Logic & Utilities
// (بدون تغییر)
// ==========================================

function updateTimerVisuals(timeLeft) {
    const elText = document.getElementById('timer-text');
    const elCircle = document.getElementById('timer-progress');
    elText.innerText = timeLeft;
    const offset = 283 - (timeLeft / CONFIG.ROUND_DURATION) * 283;
    elCircle.style.strokeDashoffset = offset;
    
    if (timeLeft <= 10 && timeLeft > 0) {
        elCircle.style.stroke = CONFIG.CHART_COLORS.down; elText.style.color = CONFIG.CHART_COLORS.down;
        if (!window[`tick_${timeLeft}`]) { SoundFX.tick(); tg.HapticFeedback.impactOccurred('soft'); window[`tick_${timeLeft}`] = true; }
    } else {
        elCircle.style.stroke = CONFIG.CHART_COLORS.gold; elText.style.color = CONFIG.CHART_COLORS.gold;
        for(let i=1; i<=10; i++) window[`tick_${i}`] = false;
    }
}

function toggleTradeButtons(disabled) {
    const btns = document.querySelectorAll('.trade-btn');
    btns.forEach(b => { 
        b.disabled = disabled; 
        b.style.opacity = disabled ? '0.5' : '1'; 
        b.style.filter = disabled ? 'grayscale(1)' : 'none'; 
    });
}

function updateHistoryRibbon(history) {
    const container = document.getElementById('history-container'); 
    container.innerHTML = '';
    
    history.slice().reverse().slice(0, 15).forEach(h => {
        const div = document.createElement('div'); 
        const isUp = h.result === 'UP';
        div.className = `hist-pill ${isUp ? 'up' : 'down'}`; 
        container.appendChild(div);
    });
}

// --- Event Handlers (بدون تغییر) ---
function setupEventListeners() {
    document.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => { if(!btn.disabled) { SoundFX.click(); tg.HapticFeedback.impactOccurred('light'); } });
    });
    const swapInput = document.getElementById('swap-input-toman');
    if(swapInput) {
        swapInput.addEventListener('input', function(e) {
            let val = e.target.value.replace(/,/g, '').replace(/\D/g, '');
            if (val) {
                e.target.value = parseInt(val).toLocaleString('en-US');
                const usd = parseFloat(val) / CONFIG.EST_USDT_RATE; 
                document.getElementById('swap-calc-usd').innerText = usd.toFixed(2) + ' USD';
            } else { e.target.value = ''; document.getElementById('swap-calc-usd').innerText = '0.00 USD'; }
        });
    }
}

window.setAmount = function(val) {
    document.getElementById('bet-amount').value = val;
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    Array.from(document.querySelectorAll('.chip')).forEach(c => { if (c.innerText.includes(val)) c.classList.add('active'); });
    tg.HapticFeedback.selectionChanged();
};

window.placeBet = async function(prediction) {
    const amount = document.getElementById('bet-amount').value;
    const floatAmount = parseFloat(amount);
    
    if (!amount || floatAmount <= 0) return showToast('لطفاً مبلغ را وارد کنید');
    if (floatAmount > currentUUSDBalance) return showToast('❌ موجودی دلار کافی نیست.');

    tg.HapticFeedback.impactOccurred('heavy'); 
    try {
        const res = await fetch(`${API_BASE_URL}/webapp/game/bet`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ initData: tg.initData, amount: floatAmount, prediction: prediction })
        });
        const result = await res.json();
        if (result.status === 'success') {
            SoundFX.success();
            showToast(`✅ سفارش ${prediction === 'UP' ? 'خرید' : 'فروش'} ثبت شد`);
            const elEntry = document.getElementById('entry-display');
            elEntry.classList.remove('hidden');
            elEntry.innerHTML = `<span style="color:${CONFIG.CHART_COLORS.gold}; font-weight:bold; margin-left:5px;">${prediction === 'UP' ? '▲ خرید' : '▼ فروش'}</span> <span class="mono-font">$${result.entry_price.toLocaleString()}</span>`;
            toggleTradeButtons(true);
        } else { showToast(`⚠️ ${result.message}`); SoundFX.lose(); }
    } catch(e) { showToast("خطای اتصال یا سرور"); }
};

window.performSwap = async function() {
    const rawVal = document.getElementById('swap-input-toman').value.replace(/,/g, '');
    const amount = parseFloat(rawVal);
    if (!amount || amount < 50000) { showToast("⚠️ حداقل مبلغ ۵۰,۰۰۰ تومان"); return; }
    tg.HapticFeedback.impactOccurred('medium');
    try {
        const res = await fetch(`${API_BASE_URL}/webapp/game/swap-to-usd`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ initData: tg.initData, amount_toman: amount })
        });
        const result = await res.json();
        if (result.status === 'success') { 
            showToast("✅ حساب شارژ شد"); 
            window.closeSwapModal(); 
            SoundFX.success(); 
        }
        else { showToast(`❌ ${result.message}`); }
    } catch(e) { showToast("خطای شبکه"); }
};

// --- Modal Functions (تغییر یافته برای بارگذاری داده) ---
window.openSwapModal = () => document.getElementById('swap-modal').classList.add('active');
window.closeSwapModal = () => document.getElementById('swap-modal').classList.remove('active');

window.openLeaderboard = () => {
    fetchLeaderboard();
    document.getElementById('leaderboard-modal').classList.add('active');
};
window.closeLeaderboard = () => document.getElementById('leaderboard-modal').classList.remove('active');

window.openHistory = () => {
    fetchAndRenderHistory();
    document.getElementById('history-modal').classList.add('active');
};
window.closeHistory = () => document.getElementById('history-modal').classList.remove('active');


function showResultModal(result) {
    isResultModalActive = true; 
    
    const elModal = document.getElementById('result-modal');
    const elTitle = document.getElementById('res-title');
    const elAmount = document.getElementById('res-amount');
    const elIcon = document.getElementById('res-icon');
    const elMsg = document.getElementById('res-message');
    document.getElementById('res-entry').innerText = `$${result.entry_price.toFixed(2)}`;
    document.getElementById('res-close').innerText = `$${result.close_price.toFixed(2)}`;

    if(closePriceLine) lineSeries.removePriceLine(closePriceLine);
    closePriceLine = lineSeries.createPriceLine({
        price: result.close_price,
        color: result.status === 'WIN' ? CONFIG.CHART_COLORS.up : CONFIG.CHART_COLORS.down,
        lineWidth: 2,
        lineStyle: LightweightCharts.LineStyle.Solid,
        axisLabelVisible: true,
        title: 'قیمت پایانی'
    });
    
    if(entryPriceLine) {
        lineSeries.removePriceLine(entryPriceLine);
        entryPriceLine = null;
    }


    if (result.status === 'WIN') {
        SoundFX.win(); tg.HapticFeedback.notificationOccurred('success');
        confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 }, zIndex: 3000 });
        elTitle.innerText = "پیروزی!"; elTitle.style.color = CONFIG.CHART_COLORS.up;
        elAmount.className = "res-amount res-win"; elAmount.innerText = `+$${result.profit.toFixed(2)}`;
        elIcon.innerText = "🏆"; elMsg.innerText = `پیش‌بینی شما صحیح بود. ${result.xp_reward ? '(+' + result.xp_reward + ' XP)' : ''}`;
    } else {
        SoundFX.lose(); tg.HapticFeedback.notificationOccurred('error');
        elTitle.innerText = "شکست"; elTitle.style.color = CONFIG.CHART_COLORS.down;
        elAmount.className = "res-amount res-loss"; elAmount.innerText = `-$${Math.abs(result.profit).toFixed(2)}`;
        elIcon.innerText = "📉"; elMsg.innerText = "بازار خلاف جهت شما حرکت کرد.";
    }
    elModal.classList.add('active');
    
    // حذف خط قیمت نهایی پس از چند ثانیه
    setTimeout(() => {
        if(closePriceLine) {
            lineSeries.removePriceLine(closePriceLine);
            closePriceLine = null;
        }
    }, 5000); 
}
window.closeResultModal = () => {
    isResultModalActive = false; 
    document.getElementById('result-modal').classList.remove('active');
};

function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.querySelector('.toast-message').innerText = msg;
    toast.classList.remove('hidden'); tg.HapticFeedback.impactOccurred('light');
    setTimeout(() => toast.classList.add('hidden'), 3000);
}


// ==========================================
// 5. Leaderboard & History Logic (FINAL FIX)
// ==========================================

async function fetchLeaderboard() {
    const leaderboardList = document.getElementById('leaderboard-list');
    leaderboardList.innerHTML = '<div class="loader-spinner"></div>'; 

    try {
        const res = await fetch(`${API_BASE_URL}/webapp/game/leaderboard`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ initData: tg.initData })
        });
        const data = await res.json();

        if (data.status === 'success') {
            leaderboardList.innerHTML = ''; 
            renderLeaderboard(data.xp_ranking, 'برترین‌های XP');
            renderLeaderboard(data.profit_ranking, 'برترین‌های سود');
        } else {
            leaderboardList.innerHTML = '<p class="error-msg">❌ خطای بارگذاری رتبه‌بندی.</p>';
            showToast("خطای سرور Leaderboard");
        }
    } catch (e) {
        leaderboardList.innerHTML = '<p class="error-msg">❌ خطای شبکه.</p>';
    }
}

function renderLeaderboard(rankingData, title) {
    const leaderboardList = document.getElementById('leaderboard-list');
    
    let html = `<div class="ranking-group-title">${title}</div>`;

    if (rankingData.length === 0) {
        html += '<p class="no-data-msg">هنوز داده‌ای برای نمایش وجود ندارد.</p>';
    } else {
        html += '<ul class="ranking-list">';
        rankingData.forEach((item, index) => {
            const rank = index + 1;
            const trophyColor = CONFIG.TROPHY_COLORS[rank] || '#848E9C';
            const value = item.xp !== undefined ? `${item.xp.toLocaleString()} XP` : `$${item.total_profit.toFixed(2)}`;
            const isUser = item.user_id === tg.initDataUnsafe?.user?.id;
            const rankIcon = rank <= 3 ? `<span style="color:${trophyColor}">🏆</span>` : `<span>${rank}</span>`;
            
            html += `
                <li class="ranking-item ${isUser ? 'is-me' : ''}">
                    <div class="rank-icon">${rankIcon}</div>
                    <div class="user-name">${item.first_name || 'کاربر ناشناس'}</div>
                    <div class="score">${value}</div>
                </li>
            `;
        });
        html += '</ul>';
    }

    leaderboardList.innerHTML += html;
}

// تابع اصلی برای بارگذاری تاریخچه و محاسبه P&L (FIXED)
async function fetchAndRenderHistory() {
    const historyList = document.getElementById('history-list');
    historyList.innerHTML = '<div class="loader-spinner"></div>'; 
    
    try {
        const res = await fetch(`${API_BASE_URL}/webapp/game/round_history`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ initData: tg.initData })
        });
        const data = await res.json();

        if (data.status === 'success' && data.history) {
            let totalProfit = 0;
            let totalBets = data.history.length;
            let totalWins = 0;

            let html = '';
            if (data.history.length === 0) {
                 html = '<p class="no-data-msg">هنوز هیچ شرطی ثبت نشده است.</p>';
            } else {
                // 1. محاسبه خلاصه P&L
                data.history.forEach(r => {
                    totalProfit += r.profit;
                    if (r.win) totalWins++;
                });

                // 2. ساخت Summary Box (NEW UX)
                const isOverallProfit = totalProfit >= 0;
                const profitColor = isOverallProfit ? CONFIG.CHART_COLORS.up : CONFIG.CHART_COLORS.down;
                const profitSign = isOverallProfit ? '+' : '-';
                
                const summaryHtml = `
                    <div class="history-summary-box glass-panel-summary">
                        <div class="summary-item">
                            <span>تعداد راند:</span>
                            <span class="value">${totalBets}</span>
                        </div>
                        <div class="summary-item">
                            <span>بردهای شما:</span>
                            <span class="value">${totalWins} (${((totalWins / totalBets) * 100).toFixed(1)}%)</span>
                        </div>
                        <div class="summary-item total-pl" style="color: ${profitColor};">
                            <span>سود/زیان کل:</span>
                            <span class="value">${profitSign} $${Math.abs(totalProfit).toFixed(2)}</span>
                        </div>
                    </div>
                `;
                html += summaryHtml;

                // 3. ساخت لیست آیتم‌های تاریخچه
                html += '<ul class="history-list-items">';
                data.history.forEach(r => {
                    const statusClass = r.win ? 'win' : 'loss';
                    const icon = r.win ? '▲' : '▼';
                    const color = r.win ? CONFIG.CHART_COLORS.up : CONFIG.CHART_COLORS.down;
                    const itemProfitSign = r.profit >= 0 ? '+' : '-';

                    html += `
                        <li class="history-item ${statusClass}">
                            <div class="round-id-time">#${r.round_id} <span class="time-stamp">${r.time}</span></div>
                            <div class="prediction-info">
                                <span class="pred-type" style="color: ${color};">${r.prediction} ${icon}</span>
                                <span class="bet-amount">$${r.amount.toFixed(2)}</span>
                            </div>
                            <div class="price-action">
                                <span class="entry-price">$${r.entry.toFixed(2)} → $${r.close.toFixed(2)}</span>
                            </div>
                            <div class="profit-amount" style="color: ${color};">${itemProfitSign}$${Math.abs(r.profit).toFixed(2)}</div>
                        </li>
                    `;
                });
                html += '</ul>';
            }
            historyList.innerHTML = html;
        } else {
            historyList.innerHTML = '<p class="error-msg">❌ خطای بارگذاری تاریخچه.</p>';
        }
    } catch (e) {
        historyList.innerHTML = '<p class="error-msg">❌ خطای شبکه.</p>';
    }
}