/* webapp/game.js (v75.0 - UX Upgrade: Fast Price Ticker) */

const tg = window.Telegram.WebApp;
const API_BASE_URL = window.location.origin;

// تنظیمات سراسری
const CONFIG = {
    ROUND_DURATION: 60,
    EST_USDT_RATE: 90000, 
    // UPGRADE: Define polling rates
    FAST_POLL_RATE: 500, // 0.5 seconds for price/timer update
    SLOW_POLL_RATE: 10000, // 10 seconds for full state/user data update
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
    }
};

let chart, areaSeries;
let lastPrice = 0;
let isFirstLoad = true;
let lastTime = 0;
let lastRoundId = 0; // Track round ID for new round detection

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
    
    // UPGRADE: Start separate polling loops
    fetchFullState(); // Initial call to get everything
    setInterval(fetchPriceUpdate, CONFIG.FAST_POLL_RATE);
    setInterval(fetchFullState, CONFIG.SLOW_POLL_RATE);
};

function initChart() {
    const container = document.getElementById('tv-chart-container');
    chart = LightweightCharts.createChart(container, {
        width: container.clientWidth,
        height: container.clientHeight,
        layout: { background: { type: 'solid', color: CONFIG.CHART_COLORS.bg }, textColor: CONFIG.CHART_COLORS.text, fontFamily: "'Roboto Mono', monospace" },
        grid: { vertLines: { visible: false }, horzLines: { visible: false } },
        rightPriceScale: { borderColor: 'transparent', visible: true, scaleMargins: { top: 0.2, bottom: 0.1 } },
        timeScale: { borderColor: 'transparent', timeVisible: true, secondsVisible: true, rightOffset: 2, fixLeftEdge: true },
        crosshair: { vertLine: { width: 1, color: 'rgba(255, 255, 255, 0.1)', style: 3, labelBackgroundColor: '#171B26' }, horzLine: { width: 1, color: 'rgba(255, 255, 255, 0.1)', style: 3, labelBackgroundColor: '#171B26' } },
        handleScroll: { mouseWheel: false, pressedMouseMove: true },
        handleScale: { axisPressedMouseMove: false, mouseWheel: false, pinch: false },
    });
    areaSeries = chart.addAreaSeries({ topColor: CONFIG.CHART_COLORS.areaTopUp, bottomColor: CONFIG.CHART_COLORS.areaBottomUp, lineColor: CONFIG.CHART_COLORS.up, lineWidth: 2, crosshairMarkerVisible: true, crosshairMarkerRadius: 5 });
    new ResizeObserver(entries => {
        if (entries.length === 0 || entries[0].target !== container) return;
        const newRect = entries[0].contentRect;
        chart.applyOptions({ height: newRect.height, width: newRect.width });
        chart.timeScale().fitContent();
    }).observe(container);
}

// UPGRADE: New function for fast, lightweight price polling
async function fetchPriceUpdate() {
    try {
        const res = await fetch(`${API_BASE_URL}/webapp/game/price`);
        if (res.ok) {
            const data = await res.json();
            if (data.status === 'success') {
                updateChartData(data.price);
                updateTimerVisuals(data.time_left);
                // Check for new round initiation
                if (data.round_id !== lastRoundId && lastRoundId !== 0) {
                     fetchFullState(); // Trigger full state refresh on new round
                }
                lastRoundId = data.round_id;
                document.getElementById('round-id').innerText = `#${data.round_id}`;
                setConnectionStatus(true);
            }
        } else { 
            setConnectionStatus(false); 
        }
    } catch (e) {
        setConnectionStatus(false);
    }
}

// UPGRADE: Renamed and refactored from fetchServerData to fetch only heavy, user-specific state
async function fetchFullState() {
    try {
        const res = await fetch(`${API_BASE_URL}/webapp/game/state`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ initData: tg.initData })
        });
        if (res.ok) {
            const data = await res.json();
            updateHeavyGameUI(data); // New function to handle user data only
            // Full state update overrides any connection error from fast poll
            setConnectionStatus(true); 
            // Only update the ribbon and user-specific round data from the slow poll
            if (data.history) updateHistoryRibbon(data.history);
            if (data.user_balance !== undefined) document.getElementById('user-balance-display').innerText = data.user_balance.toLocaleString('en-US', {minimumFractionDigits: 2});
        } else { setConnectionStatus(false); }
    } catch (e) {
        setConnectionStatus(false);
    }
}

function setConnectionStatus(isConnected) {
    const el = document.getElementById('connection-status');
    const txt = el.querySelector('.status-text');
    const dot = el.querySelector('.status-dot');
    const upColor = '#0ECB81';
    const downColor = '#F6465D';
    if (isConnected) {
        dot.style.background = upColor; 
        txt.style.color = upColor; 
        txt.innerText = 'متصل';
        el.classList.remove('disconnected');
    } else {
        dot.style.background = downColor; 
        txt.style.color = downColor; 
        txt.innerText = 'قطع';
        el.classList.add('disconnected');
    }
}

// UPGRADE: Function to handle heavy/user-specific state updates (from fetchFullState)
function updateHeavyGameUI(data) {
    const elEntry = document.getElementById('entry-display');
    
    // Handle User Bet Display
    if (data.user_bet && data.user_bet.entry_price) {
        elEntry.classList.remove('hidden');
        const isUp = data.user_bet.prediction === 'UP';
        const color = isUp ? CONFIG.CHART_COLORS.up : CONFIG.CHART_COLORS.down;
        const icon = isUp ? '▲' : '▼';
        const text = isUp ? 'خرید' : 'فروش';
        elEntry.innerHTML = `<span style="color:${color}; font-weight:bold; margin-left:5px;">${icon} ${text}</span> <span class="mono-font">$${data.user_bet.entry_price.toLocaleString()}</span>`;
    } else { elEntry.classList.add('hidden'); }

    // Handle Round Result Modal
    if (data.last_result) showResultModal(data.last_result);
    
    // Check Round Lock Status (now only dependent on full state refresh)
    const timeLock = data.round && data.round.time_left <= 10;
    const hasBet = !!data.user_bet;
    toggleTradeButtons(timeLock || hasBet);
}

// UPGRADE: Consolidated price and chart update into this function
function updateChartData(serverPrice) {
    const domPrice = document.getElementById('btc-price');
    const timeNow = Math.floor(Date.now() / 1000);
    
    // Only proceed if the price has meaningfully changed to avoid unnecessary chart redraws
    if (serverPrice === lastPrice && !isFirstLoad) {
        // Still update the chart point for time progression even if price hasn't changed much
        if (timeNow > lastTime) { lastTime = timeNow; areaSeries.update({ time: timeNow, value: serverPrice }); }
        return;
    }
    
    // Handle Initial Load
    if (isFirstLoad && serverPrice > 0) {
        // Use a slight random walk to populate the initial chart view for aesthetics
        const historyData = []; 
        let tempPrice = serverPrice; 
        for (let i = 60; i > 0; i--) { tempPrice = tempPrice + (Math.random() - 0.5) * 5; historyData.push({ time: timeNow - i, value: tempPrice }); }
        historyData.sort((a,b) => a.time - b.time);
        
        areaSeries.setData(historyData); 
        lastTime = timeNow; 
        areaSeries.update({ time: lastTime, value: serverPrice }); // Add current price point
        
        document.getElementById('chart-loader').classList.add('fade-out'); 
        isFirstLoad = false; 
        lastPrice = serverPrice;
    }
    
    // Handle Real-Time Updates
    if (!isFirstLoad) {
        const isUp = serverPrice >= lastPrice; 
        const color = isUp ? CONFIG.CHART_COLORS.up : CONFIG.CHART_COLORS.down;
        
        // 1. Update Header Price Display
        domPrice.style.color = color; 
        domPrice.innerText = serverPrice.toLocaleString('en-US', {minimumFractionDigits: 2});
        
        // 2. Update Chart Colors (Line/Area)
        areaSeries.applyOptions({ 
            lineColor: color, 
            topColor: isUp ? CONFIG.CHART_COLORS.areaTopUp : CONFIG.CHART_COLORS.areaTopDown, 
            bottomColor: isUp ? CONFIG.CHART_COLORS.areaBottomUp : CONFIG.CHART_COLORS.areaBottomDown, 
            crosshairMarkerBackgroundColor: color 
        });
        
        // 3. Add new data point (only if time advanced or if it's the current time tick)
        if (timeNow > lastTime) { lastTime = timeNow; areaSeries.update({ time: timeNow, value: serverPrice }); } 
        else { areaSeries.update({ time: lastTime, value: serverPrice }); }

        lastPrice = serverPrice;
    }
}

function updateTimerVisuals(timeLeft) {
    const elText = document.getElementById('timer-text');
    const elCircle = document.getElementById('timer-progress');
    
    const currentText = elText.innerText;
    
    // Only update timer text if it actually changes (to prevent visual jitters)
    if (parseInt(currentText) !== timeLeft) {
         elText.innerText = timeLeft;
    }
    
    // Update SVG progress circle
    const offset = 283 - (timeLeft / CONFIG.ROUND_DURATION) * 283;
    elCircle.style.strokeDashoffset = offset;
    
    // Handle audio and visual countdown warnings
    if (timeLeft <= 5) {
        elCircle.style.stroke = CONFIG.CHART_COLORS.down; 
        elText.style.color = CONFIG.CHART_COLORS.down;
        
        // Play tick sound only once per second for the last 5 seconds
        if (!window[`tick_${timeLeft}`]) { 
            SoundFX.tick(); 
            tg.HapticFeedback.impactOccurred('soft'); 
            window[`tick_${timeLeft}`] = true; 
        }
    } else {
        elCircle.style.stroke = 'var(--gold-primary)'; // Use global variable
        elText.style.color = 'var(--text-main)'; // Use global variable
        for(let i=1; i<=5; i++) window[`tick_${i}`] = false;
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
    
    // Only show the last 15 results
    history.slice().reverse().slice(0, 15).forEach(h => {
        const div = document.createElement('div'); 
        const isUp = h.result === 'UP';
        div.className = `hist-pill ${isUp ? 'up' : 'down'}`; 
        container.appendChild(div);
    });
}

function setupEventListeners() {
    // ... (rest of the listeners remain unchanged)
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
    if (!amount || amount <= 0) return showToast('لطفاً مبلغ را وارد کنید');
    tg.HapticFeedback.impactOccurred('heavy'); 
    try {
        const res = await fetch(`${API_BASE_URL}/webapp/game/bet`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ initData: tg.initData, amount: parseFloat(amount), prediction: prediction })
        });
        const result = await res.json();
        if (result.status === 'success') {
            SoundFX.success();
            showToast(`✅ سفارش ${prediction === 'UP' ? 'خرید' : 'فروش'} ثبت شد`);
        } else { showToast(`⚠️ ${result.message}`); SoundFX.lose(); }
    } catch(e) { showToast("خطای اتصال"); }
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
        if (result.status === 'success') { showToast("✅ حساب شارژ شد"); window.closeSwapModal(); SoundFX.success(); }
        else { showToast(`❌ ${result.message}`); }
    } catch(e) { showToast("خطای شبکه"); }
};

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
        elIcon.innerText = "🏆"; elMsg.innerText = "پیش‌بینی شما صحیح بود.";
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