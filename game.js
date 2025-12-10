/* webapp/game.js (v77.0 - FIX: Swap Input Logic Restoration) */

const tg = window.Telegram.WebApp;
const API_BASE_URL = window.location.origin;

// تنظیمات سراسری
const CONFIG = {
    // These constants are now hints; the server manages the actual timing and limits.
    BETTING_DURATION: 10, // Seconds for betting
    RUNNING_UPDATE_RATE: 100, // Multiplier update rate (ms)
    SLOW_POLL_RATE: 3000, // 3 seconds for full state/user data update
    EST_USDT_RATE: 90000, // Placeholder for Toman conversion in swap UI
    
    CHART_COLORS: {
        bg: 'transparent',
        text: '#848E9C',
        grid: 'transparent',
        up: '#0ECB81',
        down: '#F6465D',
        areaTopUp: 'rgba(14, 203, 129, 0.7)',
        areaBottomUp: 'rgba(14, 203, 129, 0.05)',
        lineColor: '#0ECB81',
    }
};

let multiplierInterval = null;
let lastState = 'CRASHED';
let lastRoundId = 0;
let userBetAmount = 0;
let userCashedOut = false;
let autoCashoutTarget = 0; // Future feature: Auto-cashout target

// --- DOM Elements ---
const dom = {
    statusText: document.getElementById('game-status-text'),
    multiplierDisplay: document.getElementById('btc-price'), // Reusing the main price display
    timerDisplay: document.getElementById('timer-text'),
    timerCircle: document.getElementById('timer-progress'),
    bettingBox: document.getElementById('betting-box'),
    cashoutBox: document.getElementById('cashout-box'),
    userBalance: document.getElementById('user-balance-display'),
    historyContainer: document.getElementById('history-container'),
    betBtn: document.getElementById('bet-btn'),
    cashoutBtn: document.getElementById('cashout-btn')
};

// --- CHART SETUP (LightweightCharts) ---
let chart, lineSeries;

function initChart() {
    const container = document.getElementById('tv-chart-container');
    chart = LightweightCharts.createChart(container, {
        width: container.clientWidth,
        height: container.clientHeight,
        layout: { background: { type: 'solid', color: CONFIG.CHART_COLORS.bg }, textColor: CONFIG.CHART_COLORS.text, fontFamily: "'Roboto Mono', monospace" },
        grid: { vertLines: { visible: false }, horzLines: { visible: false } },
        rightPriceScale: { borderColor: 'transparent', visible: true, scaleMargins: { top: 0.2, bottom: 0.1 } },
        timeScale: { visible: false }, // Time scale is hidden for crash game multiplier
        crosshair: { mode: 0 }, // Disable crosshair
    });
    lineSeries = chart.addLineSeries({ 
        color: CONFIG.CHART_COLORS.lineColor, 
        lineWidth: 3, 
        lastValueVisible: true, 
        priceLineVisible: false 
    });
    // Set initial dummy data for chart structure
    lineSeries.setData([ { time: 1, value: 1.00 }, { time: 2, value: 1.00 }]);
    
    new ResizeObserver(entries => {
        if (entries.length === 0 || entries[0].target !== container) return;
        const newRect = entries[0].contentRect;
        chart.applyOptions({ height: newRect.height, width: newRect.width });
    }).observe(container);
}


// --- Audio System (Unchanged) ---
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
    crash: () => { SoundFX.playTone(150, 'sawtooth', 0.4, 0.2); tg.HapticFeedback.notificationOccurred('error'); },
    win: () => { [523.25, 659.25, 783.99, 1046.50].forEach((f, i) => setTimeout(() => SoundFX.playTone(f, 'triangle', 0.3, 0.1), i * 80)); },
};

// --- Initialization ---

window.onload = function() {
    tg.ready();
    tg.expand();
    tg.setHeaderColor('#050505');  
    tg.setBackgroundColor('#050505');
    if (!tg.initData) tg.initData = "query_id=TEST_DEV_MODE";

    initChart();
    setupEventListeners();
    
    // Start initial fetch, then poll regularly
    fetchFullState(); 
    setInterval(fetchFullState, CONFIG.SLOW_POLL_RATE);
};

// --- Data Polling ---

async function fetchFullState() {
    try {
        const res = await fetch(`${API_BASE_URL}/webapp/game/state`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ initData: tg.initData })
        });
        if (res.ok) {
            const data = await res.json();
            updateGameUI(data);
            updateHistoryRibbon(data.history || []);
            setConnectionStatus(true);
        } else { setConnectionStatus(false); }
    } catch (e) {
        setConnectionStatus(false);
    }
}

// --- UI Update & Game State Management ---

function updateGameUI(data) {
    if (data.user_balance !== undefined) {
        dom.userBalance.innerText = data.user_balance.toLocaleString('en-US', {minimumFractionDigits: 2});
    }

    if (data.round_id !== lastRoundId && lastRoundId !== 0) {
        // Hard reset chart and UI on new round
        resetChart();
        userBetAmount = 0;
        userCashedOut = false;
        document.getElementById('bet-amount').value = '';
        document.getElementById('chart-loader').classList.remove('fade-out');
    }
    lastRoundId = data.round_id;

    if (data.last_result) {
        showResultModal(data.last_result);
    }
    
    // 1. Handle State Transitions
    if (data.state !== lastState) {
        handleStateTransition(data.state);
    }
    lastState = data.state;
    
    // 2. Update Visuals based on State
    if (data.state === 'BETTING') {
        updateBettingVisuals(data.time_to_next_phase, data.round_id);
    } else if (data.state === 'RUNNING') {
        updateRunningVisuals(data.multiplier);
    } else if (data.state === 'CRASHED') {
        updateCrashedVisuals(data.multiplier);
    }

    // 3. Update User Bet Status
    const betInfo = data.user_bet_info;
    if (betInfo) {
        userBetAmount = betInfo.amount;
        userCashedOut = betInfo.is_cashed_out;
    } else {
        userBetAmount = 0;
        userCashedOut = false;
    }
    updateBetCashoutVisibility();
}

function handleStateTransition(newState) {
    if (newState === 'BETTING') {
        dom.statusText.innerText = "آماده ثبت شرط";
        dom.statusText.className = 'status-betting';
        resetChart();
    } else if (newState === 'RUNNING') {
        dom.statusText.innerText = "در حال صعود...";
        dom.statusText.className = 'status-running';
        // Start fast interval to update multiplier
        if (!multiplierInterval) {
             multiplierInterval = setInterval(fetchFullState, CONFIG.RUNNING_UPDATE_RATE);
        }
        document.getElementById('chart-loader').classList.add('fade-out');
        
    } else if (newState === 'CRASHED') {
        dom.statusText.innerText = `CRASHED @ ${dom.multiplierDisplay.innerText}X`;
        dom.statusText.className = 'status-crashed';
        if (multiplierInterval) {
            clearInterval(multiplierInterval);
            multiplierInterval = null;
        }
        SoundFX.crash();
        // Clear last multiplier display to prevent jump
        dom.multiplierDisplay.innerText = '0.00'; 
    } else if (newState === 'WAITING') {
        dom.statusText.innerText = "آماده‌سازی...";
        dom.statusText.className = 'status-waiting';
    }
}

function updateBettingVisuals(timeLeft, roundId) {
    // Timer visuals
    dom.multiplierDisplay.innerText = '1.00';
    dom.multiplierDisplay.className = 'crash-multiplier'; // Reset class
    dom.timerDisplay.innerText = timeLeft;
    const progress = (CONFIG.BETTING_DURATION - timeLeft) / CONFIG.BETTING_DURATION;
    dom.timerCircle.style.strokeDashoffset = 283 - (progress * 283);
    dom.timerCircle.style.stroke = 'var(--gold-primary)';
    
    document.getElementById('round-id').innerText = `#${roundId}`;
}

function updateRunningVisuals(multiplier) {
    // Update multiplier display (main price area)
    dom.multiplierDisplay.innerText = multiplier.toFixed(2);
    dom.multiplierDisplay.className = 'crash-multiplier running';
    
    // Add point to chart (using arbitrary time axis)
    const timeNow = Date.now() / 1000;
    lineSeries.update({ time: timeNow, value: multiplier });
    chart.timeScale().fitContent();

    // Hide timer elements
    dom.timerDisplay.innerText = '';
    dom.timerCircle.style.strokeDashoffset = 283;
}

function updateCrashedVisuals(crashMultiplier) {
    // Only display crash multiplier if it's the last value in the series
    dom.multiplierDisplay.innerText = crashMultiplier.toFixed(2);
    dom.multiplierDisplay.className = 'crash-multiplier crashed-final';
}

function resetChart() {
    lineSeries.setData([]);
    lineSeries = chart.addLineSeries({ 
        color: CONFIG.CHART_COLORS.lineColor, 
        lineWidth: 3, 
        lastValueVisible: true, 
        priceLineVisible: false 
    });
    lineSeries.setData([ { time: Date.now() / 1000 - 1, value: 1.00 }, { time: Date.now() / 1000, value: 1.00 }]);
}

function updateBetCashoutVisibility() {
    if (userBetAmount > 0 && !userCashedOut && lastState === 'RUNNING') {
        dom.bettingBox.classList.add('hidden');
        dom.cashoutBox.classList.remove('hidden');
        dom.cashoutBtn.innerText = `CASH OUT (${dom.multiplierDisplay.innerText}X)`;
    } else {
        dom.cashoutBox.classList.add('hidden');
        dom.bettingBox.classList.remove('hidden');
        // Disable betting if RUNNING or CRASHED
        const disable = lastState !== 'BETTING' || userBetAmount > 0;
        dom.betBtn.disabled = disable;
        dom.betBtn.style.opacity = disable ? '0.5' : '1';
        dom.betBtn.innerText = userBetAmount > 0 ? `Bet Placed: $${userBetAmount.toFixed(2)}` : 'PLACE BET';
    }
}

// Set up listeners for the cashout button to update in real-time
document.addEventListener('DOMContentLoaded', () => {
    if (dom.multiplierDisplay) {
        const observer = new MutationObserver((mutationsList, observer) => {
            if (lastState === 'RUNNING' && userBetAmount > 0 && !userCashedOut) {
                // Update cashout button text when multiplier changes
                dom.cashoutBtn.innerText = `CASH OUT (${dom.multiplierDisplay.innerText}X)`;
            }
        });
        observer.observe(dom.multiplierDisplay, { childList: true, characterData: true });
    }
    
    // --- RE-ADDED: SWAP INPUT LISTENER LOGIC ---
    const swapInput = document.getElementById('swap-input-toman');
    if(swapInput) {
        swapInput.addEventListener('input', function(e) {
            // Remove all non-numeric and comma characters
            let val = e.target.value.replace(/,/g, '').replace(/\D/g, ''); 
            
            if (val) {
                // Format with thousand separators
                e.target.value = parseInt(val).toLocaleString('en-US');
                
                // Calculate USD equivalent using the placeholder rate
                const tomanAmount = parseFloat(val);
                const usd = tomanAmount / CONFIG.EST_USDT_RATE;
                
                document.getElementById('swap-calc-usd').innerText = usd.toFixed(2) + ' USD';
            } else { 
                e.target.value = ''; 
                document.getElementById('swap-calc-usd').innerText = '0.00 USD'; 
            }
        });
    }
    // --- END RE-ADDED SWAP INPUT LISTENER LOGIC ---
});


// --- Submission Handlers ---

window.placeBet = async function() {
    if (lastState !== 'BETTING' || userBetAmount > 0) return showToast('Cannot place bet now.');
    
    const amount = parseFloat(document.getElementById('bet-amount').value);
    if (!amount || amount <= 0) return showToast('لطفاً مبلغ را وارد کنید');
    
    tg.HapticFeedback.impactOccurred('heavy');
    dom.betBtn.disabled = true;
    dom.betBtn.style.opacity = '0.5';

    try {
        const res = await fetch(`${API_BASE_URL}/webapp/game/bet`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ initData: tg.initData, amount: amount })
        });
        const result = await res.json();
        
        if (result.status === 'success') {
            SoundFX.success();
            showToast(`✅ شرط ثبت شد: $${amount.toFixed(2)}`);
            // Optimistic update
            userBetAmount = amount;
            updateBetCashoutVisibility(); 
        } else { 
            showToast(`⚠️ ${result.message}`); 
            dom.betBtn.disabled = false;
            dom.betBtn.style.opacity = '1';
        }
    } catch(e) { 
        showToast("خطای اتصال"); 
        dom.betBtn.disabled = false;
        dom.betBtn.style.opacity = '1';
    }
};

window.cashOut = async function() {
    if (lastState !== 'RUNNING' || userCashedOut) return showToast('نمی‌توانید نقد کنید.');

    // Prevent double-clicking
    dom.cashoutBtn.disabled = true;
    dom.cashoutBtn.style.opacity = '0.5';
    
    tg.HapticFeedback.impactOccurred('heavy');
    
    try {
        const res = await fetch(`${API_BASE_URL}/webapp/game/cashout`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ initData: tg.initData, target_multiplier: null }) // Manual cashout
        });
        const result = await res.json();
        
        if (result.status === 'success') {
            SoundFX.win();
            const payout = parseFloat(result.payout);
            const profit = payout - userBetAmount;
            showToast(`🏆 نقد موفقیت‌آمیز! سود: $${profit.toFixed(2)}`);
            userCashedOut = true;
            dom.cashoutBox.classList.add('cashed-out');
            dom.cashoutBox.innerText = `CASHED OUT @ ${dom.multiplierDisplay.innerText}X`;
            // Force a full state refresh to update balance immediately
            fetchFullState();
        } else { 
            showToast(`⚠️ ${result.message}`); 
            // If cashout failed due to crash, this will be handled by the next state update
            dom.cashoutBtn.disabled = false;
            dom.cashoutBtn.style.opacity = '1';
        }
    } catch(e) { 
        showToast("خطای شبکه");
        dom.cashoutBtn.disabled = false;
        dom.cashoutBtn.style.opacity = '1';
    }
};


// --- Utility and Modal Handlers ---

function showResultModal(result) {
    const elModal = document.getElementById('result-modal');
    const elTitle = document.getElementById('res-title');
    const elAmount = document.getElementById('res-amount');
    const elIcon = document.getElementById('res-icon');
    const elMsg = document.getElementById('res-message');
    
    // Adaptation for Crash Game results
    const multiplier = result.multiplier;
    const isWin = result.status === 'WIN';

    document.getElementById('res-entry').innerText = `$${result.bet_amount.toFixed(2)}`;
    document.getElementById('res-close').innerText = `@ ${multiplier.toFixed(2)}X`;

    if (isWin) {
        elTitle.innerText = "نقد موفق!"; 
        elTitle.style.color = CONFIG.CHART_COLORS.up;
        elAmount.className = "res-amount res-win"; 
        elAmount.innerText = `+$${result.profit.toFixed(2)}`;
        elIcon.innerText = "💰"; 
        elMsg.innerText = `شما در ضریب ${multiplier.toFixed(2)} نقد کردید.`;
    } else {
        elTitle.innerText = "سقوط"; 
        elTitle.style.color = CONFIG.CHART_COLORS.down;
        elAmount.className = "res-amount res-loss"; 
        elAmount.innerText = `-$${Math.abs(result.profit).toFixed(2)}`;
        elIcon.innerText = "💥"; 
        elMsg.innerText = `ضریب در ${multiplier.toFixed(2)} سقوط کرد.`;
    }
    elModal.classList.add('active');
}
window.closeResultModal = () => document.getElementById('result-modal').classList.remove('active');

function updateHistoryRibbon(history) {
    const container = dom.historyContainer; 
    container.innerHTML = '';
    
    history.slice().forEach(crashPoint => {
        const div = document.createElement('div'); 
        const isLow = crashPoint <= 2.0;
        div.className = `hist-pill ${isLow ? 'low' : 'high'}`; 
        div.innerText = `${crashPoint.toFixed(2)}x`;
        container.appendChild(div);
    });
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

function setupEventListeners() {
    // Attach input listeners for amount chips
    document.querySelectorAll('.chip').forEach(chip => {
        chip.addEventListener('click', function() {
            window.setAmount(parseFloat(this.getAttribute('data-amount')));
        });
    });
    
    // Add haptic feedback and sound effects
    document.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => { if(!btn.disabled) { SoundFX.click(); tg.HapticFeedback.impactOccurred('light'); } });
    });
}

// Global exposure for event handlers in HTML
window.setAmount = function(val) {
    document.getElementById('bet-amount').value = val;
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    document.querySelector(`.chip[data-amount="${val}"]`).classList.add('active');
    tg.HapticFeedback.selectionChanged();
};

window.showToast = function(msg) {
    const toast = document.getElementById('toast');
    if (!toast) return tg.showAlert(msg);
    toast.querySelector('.toast-message').innerText = msg;
    toast.classList.remove('hidden'); 
    tg.HapticFeedback.impactOccurred('light');
    setTimeout(() => toast.classList.add('hidden'), 3000);
};

// --- Modal Handlers ---

window.openSwapModal = () => document.getElementById('swap-modal').classList.add('active');
window.closeSwapModal = () => document.getElementById('swap-modal').classList.remove('active');
window.openHistory = () => document.getElementById('history-modal').classList.add('active');
window.closeHistory = () => document.getElementById('history-modal').classList.remove('active');
window.openLeaderboard = () => document.getElementById('leaderboard-modal').classList.add('active');
window.closeLeaderboard = () => document.getElementById('leaderboard-modal').classList.remove('active');

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
            fetchFullState(); // Refresh balance after swap
        }
        else { showToast(`❌ ${result.message}`); }
    } catch(e) { showToast("خطای شبکه"); }
};