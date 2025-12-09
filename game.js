/* webapp/game.js (v75.0 - WebSocket Real-Time Integration & Luxury Chart) */

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
    }
};

let chart, candleSeries, lineSeries; // تغییر به Candlestick و Line Series
let lastPrice = 0;
let isFirstLoad = true;
let lastCandleTime = 0; // زمان آخرین کندل بسته‌شده
let gameWebSocket = null;
let wsConnectAttempt = 0;
let currentUUSDBalance = 0;

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
    
    // --- جایگزینی Polling با WebSocket ---
    initWebSocket(); 
    // حذف: setInterval(fetchServerData, 1000);
    // فراخوانی اولیه:
    fetchInitialData(); 
};

// ==========================================
// 1. WebSocket Setup (Real-time Core)
// ==========================================

function initWebSocket() {
    if (gameWebSocket && gameWebSocket.readyState === WebSocket.OPEN) return;
    
    const url = `${WS_BASE_URL}/ws/game?init_data=${encodeURIComponent(tg.initData)}`;
    gameWebSocket = new WebSocket(url);

    gameWebSocket.onopen = () => {
        console.log("WebSocket connected.");
        wsConnectAttempt = 0;
        setConnectionStatus(true);
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
        console.log("WebSocket disconnected. Retrying...");
        gameWebSocket = null;
        setConnectionStatus(false);
        if (wsConnectAttempt < 5) {
            wsConnectAttempt++;
            setTimeout(initWebSocket, 2000 * wsConnectAttempt);
        } else {
            showToast("❌ اتصال قطع شد. لطفاً صفحه را رفرش کنید.");
            console.error("Max WebSocket retries reached.");
        }
    };

    gameWebSocket.onerror = (error) => {
        console.error("WebSocket error:", error);
        showToast("⚠️ خطای WebSocket. در حال تلاش مجدد...");
        gameWebSocket.close(); 
    };
}

function handleWebSocketMessage(data) {
    if (data.type === 'GAME_UPDATE') {
        const serverPrice = data.current_price;

        // 1. به‌روزرسانی وضعیت بازی (تایمر، راند و بالانس)
        updateGameStatus(data);

        // 2. به‌روزرسانی نمودار (Candlestick)
        updateChartData(serverPrice, data.round.id);

        // 3. نمایش نتیجه شرط‌بندی قبلی
        if (data.last_result && data.last_result.round_id) {
            showResultModal(data.last_result);
        }
    }
}

// ==========================================
// 2. Data & UI Management
// ==========================================

async function fetchInitialData() {
    // فقط برای گرفتن بالانس اولیه و نرخ سواپ (اگر WebSocket هنوز وصل نشده باشد)
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
    // بالانس
    if (data.user_balance !== undefined) {
        document.getElementById('user-balance-display').innerText = data.user_balance.toLocaleString('en-US', {minimumFractionDigits: 2});
        currentUUSDBalance = data.user_balance;
    }
    
    // راند و تایمر
    if (data.round) {
        updateTimerVisuals(data.round.time_left);
        document.getElementById('round-id').innerText = `#${data.round.id}`;
        const isLocked = data.round.time_left <= 10;
        const hasBet = !!data.user_bet;
        toggleTradeButtons(isLocked || hasBet);
    }
    
    // شرط ثبت شده
    const elEntry = document.getElementById('entry-display');
    if (data.user_bet && data.user_bet.entry_price) {
        elEntry.classList.remove('hidden');
        const isUp = data.user_bet.prediction === 'UP';
        const color = isUp ? CONFIG.CHART_COLORS.up : CONFIG.CHART_COLORS.down;
        const icon = isUp ? '▲' : '▼';
        const text = isUp ? 'خرید' : 'فروش';
        elEntry.innerHTML = `<span style="color:${color}; font-weight:bold; margin-left:5px;">${icon} ${text}</span> <span class="mono-font">$${data.user_bet.entry_price.toLocaleString()}</span>`;
    } else { elEntry.classList.add('hidden'); }

    // تاریخچه
    if (data.history) updateHistoryRibbon(data.history);
}

// ==========================================
// 3. Chart Logic (Upgraded to Candlestick)
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
    
    // استفاده از Candlestick Series برای تجربه لاکچری
    candleSeries = chart.addCandlestickSeries({
        upColor: CONFIG.CHART_COLORS.up, downColor: CONFIG.CHART_COLORS.down,
        borderVisible: false, wickUpColor: CONFIG.CHART_COLORS.up, wickDownColor: CONFIG.CHART_COLORS.down,
    });
    
    // استفاده از Line Series برای قیمت لحظه‌ای (Real-time Price)
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

function updateChartData(serverPrice, roundId) {
    const domPrice = document.getElementById('btc-price');
    const now = Math.floor(Date.now() / 1000);

    // 1. به‌روزرسانی نمایشگر قیمت اصلی
    const isUp = serverPrice >= lastPrice; 
    const color = isUp ? CONFIG.CHART_COLORS.up : CONFIG.CHART_COLORS.down;
    domPrice.style.color = color; 
    domPrice.innerText = serverPrice.toLocaleString('en-US', {minimumFractionDigits: 2});
    
    // 2. به‌روزرسانی سری خط (نمایشگر لحظه‌ای قیمت)
    lineSeries.update({ time: now, value: serverPrice });

    // 3. منطق Candlestick (برای راند جدید یا آپدیت کندل فعلی)
    
    // اگر راند جدید شروع شده و نیاز به بستن کندل قبلی داریم
    if (isFirstLoad) {
        // برای بار اول، یک کندل dummy 1 دقیقه‌ای ایجاد می‌کنیم تا چارت خالی نباشد
        const initialTime = now - CONFIG.ROUND_DURATION;
        candleSeries.setData([
            { time: initialTime, open: serverPrice - 10, high: serverPrice + 10, low: serverPrice - 10, close: serverPrice }
        ]);
        lastCandleTime = initialTime;
        document.getElementById('chart-loader').classList.add('fade-out'); 
        isFirstLoad = false;
    } 

    if (roundId !== window.lastRoundId) {
        // راند جدید: بستن کندل قبلی (اگر باز باشد) و شروع کندل جدید
        if (window.lastCandleOpenPrice) {
            // بستن کندل قبلی در زمان بسته شدن راند
            candleSeries.update({
                time: lastCandleTime,
                open: window.lastCandleOpenPrice,
                high: Math.max(window.lastCandleHigh, serverPrice),
                low: Math.min(window.lastCandleLow, serverPrice),
                close: serverPrice 
            });
        }
        
        // شروع کندل جدید
        lastCandleTime = now;
        window.lastCandleOpenPrice = serverPrice;
        window.lastCandleHigh = serverPrice;
        window.lastCandleLow = serverPrice;
        
    } else {
        // راند فعلی: آپدیت کندل جاری (O, H, L)
        if (window.lastCandleOpenPrice) {
            window.lastCandleHigh = Math.max(window.lastCandleHigh, serverPrice);
            window.lastCandleLow = Math.min(window.lastCandleLow, serverPrice);
            
            candleSeries.update({
                time: lastCandleTime,
                open: window.lastCandleOpenPrice,
                high: window.lastCandleHigh,
                low: window.lastCandleLow,
                close: serverPrice // Close همیشه قیمت لحظه‌ای است
            });
        }
    }
    
    window.lastRoundId = roundId;
    lastPrice = serverPrice;
}

// ==========================================
// 4. Game Logic & Utilities
// ==========================================

function updateTimerVisuals(timeLeft) {
    const elText = document.getElementById('timer-text');
    const elCircle = document.getElementById('timer-progress');
    elText.innerText = timeLeft;
    const offset = 283 - (timeLeft / CONFIG.ROUND_DURATION) * 283;
    elCircle.style.strokeDashoffset = offset;
    
    // 10 ثانیه آخر: حالت هشدار
    if (timeLeft <= 10 && timeLeft > 0) {
        elCircle.style.stroke = CONFIG.CHART_COLORS.down; elText.style.color = CONFIG.CHART_COLORS.down;
        if (!window[`tick_${timeLeft}`]) { SoundFX.tick(); tg.HapticFeedback.impactOccurred('soft'); window[`tick_${timeLeft}`] = true; }
    } else {
        elCircle.style.stroke = CONFIG.CHART_COLORS.gold; elText.style.color = CONFIG.CHART_COLORS.gold; // تغییر رنگ به گلد
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
    
    // فقط برای نمایش، آخرین نتایج را می‌گیریم
    history.slice().reverse().slice(0, 15).forEach(h => {
        const div = document.createElement('div'); 
        const isUp = h.result === 'UP';
        div.className = `hist-pill ${isUp ? 'up' : 'down'}`; 
        container.appendChild(div);
    });
}

// --- Event Handlers ---
function setupEventListeners() {
    document.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => { if(!btn.disabled) { SoundFX.click(); tg.HapticFeedback.impactOccurred('light'); } });
    });
    // منطق Swap Input بدون تغییر باقی می‌ماند
    const swapInput = document.getElementById('swap-input-toman');
    if(swapInput) {
        swapInput.addEventListener('input', function(e) {
            let val = e.target.value.replace(/,/g, '').replace(/\D/g, '');
            if (val) {
                e.target.value = parseInt(val).toLocaleString('en-US');
                // از یک نرخ تخمینی استفاده می‌کنیم، نرخ واقعی در سرور است
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
        // این API همچنان فراخوانی می‌شود، اما به‌روزرسانی بالانس از طریق WebSocket می‌آید.
        const res = await fetch(`${API_BASE_URL}/webapp/game/bet`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ initData: tg.initData, amount: floatAmount, prediction: prediction })
        });
        const result = await res.json();
        if (result.status === 'success') {
            SoundFX.success();
            showToast(`✅ سفارش ${prediction === 'UP' ? 'خرید' : 'فروش'} ثبت شد`);
            // به‌روزرسانی فوری UI برای فیدبک سریع
            const elEntry = document.getElementById('entry-display');
            elEntry.classList.remove('hidden');
            elEntry.innerHTML = `<span style="color:${CONFIG.CHART_COLORS.gold}; font-weight:bold; margin-left:5px;">${prediction === 'UP' ? '▲ خرید' : '▼ فروش'}</span> <span class="mono-font">$${floatAmount.toLocaleString()}</span>`;
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
            // به‌روزرسانی بالانس توسط WebSocket انجام می‌شود
        }
        else { showToast(`❌ ${result.message}`); }
    } catch(e) { showToast("خطای شبکه"); }
};

// --- Modal Functions (بدون تغییر) ---
window.openSwapModal = () => document.getElementById('swap-modal').classList.add('active');
window.closeSwapModal = () => document.getElementById('swap-modal').classList.remove('active');
window.openHistory = () => document.getElementById('history-modal').classList.add('active');
window.closeHistory = () => document.getElementById('history-modal').classList.remove('active');
window.openLeaderboard = () => document.getElementById('leaderboard-modal').classList.add('active');
window.closeLeaderboard = () => document.getElementById('leaderboard-modal').classList.remove('active');

function showResultModal(result) {
    const elModal = document.getElementById('result-modal');
    const elTitle = document.getElementById('res-title');
    const elAmount = document.getElementById('res-amount');
    const elIcon = document.getElementById('res-icon');
    const elMsg = document.getElementById('res-message');
    document.getElementById('res-entry').innerText = `$${result.entry_price.toFixed(2)}`;
    document.getElementById('res-close').innerText = `$${result.close_price.toFixed(2)}`;

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
}
window.closeResultModal = () => document.getElementById('result-modal').classList.remove('active');

function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.querySelector('.toast-message').innerText = msg;
    toast.classList.remove('hidden'); tg.HapticFeedback.impactOccurred('light');
    setTimeout(() => toast.classList.add('hidden'), 3000);
}