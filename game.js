/* webapp/game.js (v83.3 - FINAL FIX: Execution Flow & WS Dynamic URL) */

const tg = window.Telegram.WebApp;
const API_BASE_URL = window.location.origin;

// === CRITICAL FIX: Dynamic WS URL for better proxy/WSS handling ===
function getWebSocketUrl() {
    // Determine the correct WebSocket protocol based on the current page protocol
    const ws_protocol = window.location.protocol === "https:" ? "wss://" : "ws://";
    // Use window.location.host (includes domain and port if necessary)
    return ws_protocol + window.location.host + "/ws/game/state";
}

// تنظیمات سراسری (unchanged)
const CONFIG = {
    BETTING_DURATION: 10,
    RUNNING_UPDATE_RATE: 100,
    SLOW_POLL_RATE: 3000, 
    EST_USDT_RATE: 90000,
    
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
let ws = null; // WebSocket instance

// --- DOM Elements (Must be populated before use) ---
let dom = {};

// --- CHART SETUP (DEACTIVATED FOR DEBUGGING) ---
let chart, lineSeries;
function initChart() { /* Temporarily deactivated to check for chart library conflicts */ }
function resetChart() { /* Temporarily deactivated */ }

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

// --- Initialization Logic (Moved from window.onload) ---

function initializeGame() {
    // 1. Populate DOM elements (CRITICAL: Must be run after DOM is parsed)
    dom = {
        statusText: document.getElementById('game-status-text'),
        multiplierDisplay: document.getElementById('btc-price'), 
        timerDisplay: document.getElementById('timer-text'),
        timerCircle: document.getElementById('timer-progress'),
        bettingBox: document.getElementById('betting-box'),
        cashoutBox: document.getElementById('cashout-box'),
        userBalance: document.getElementById('user-balance-display'),
        historyContainer: document.getElementById('history-container'),
        betBtn: document.getElementById('bet-btn'),
        cashoutBtn: document.getElementById('cashout-btn')
    };

    tg.ready();
    tg.expand();
    tg.setHeaderColor('#050505');  
    tg.setBackgroundColor('#050505');
    if (!tg.initData) tg.initData = "query_id=TEST_DEV_MODE";

    // 2. Start communication immediately via WebSocket
    connectWebSocket();
    // We keep one slow poll to refresh user balance/last result after WS reconnects or state changes
    window.fetchUserBalanceAndLastResult();
    setInterval(window.fetchUserBalanceAndLastResult, CONFIG.SLOW_POLL_RATE);
    
    // 3. Setup event listeners
    setupEventListeners();
}

// --- WebSocket Communication ---

function connectWebSocket() {
    // FIX: Use the dynamic URL construction 
    const ws_url = getWebSocketUrl();

    // Safety check to ensure we don't spam connections if one is already connecting/open
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        return; 
    }
    
    ws = new WebSocket(ws_url);

    ws.onopen = () => {
        setConnectionStatus(true);
        console.log("WebSocket connected to game state.");
        window.fetchUserBalanceAndLastResult();
    };

    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            updateGameUI(data); 
        } catch (e) {
            console.error("Failed to parse WebSocket message:", e);
        }
    };

    ws.onclose = () => {
        setConnectionStatus(false);
        console.warn("WebSocket disconnected. Attempting to reconnect in 3s...");
        setTimeout(connectWebSocket, 3000); // Attempt to reconnect after 3 seconds
    };

    ws.onerror = (err) => {
        setConnectionStatus(false);
        console.error("WebSocket error:", err);
        // Do NOT call ws.close() here; let onclose handle reconnection
    };
}

// --- Data Fetch (Reduced scope to non-real-time data) ---

window.fetchUserBalanceAndLastResult = async function() {
    try {
        const res = await fetch(`${API_BASE_URL}/webapp/game/state`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ initData: tg.initData })
        });
        if (res.ok) {
            const data = await res.json();
            // Only update non-WS driven data
            if (dom.userBalance && data.user_balance !== undefined) {
                dom.userBalance.innerText = data.user_balance.toLocaleString('en-US', {minimumFractionDigits: 2});
            }
            updateHistoryRibbon(data.history || []);
            
            // Check for last result and show modal
            if (data.last_result) {
                showResultModal(data.last_result);
            }
            
        } else {  
            // Server error response, but connection is alive.
            setConnectionStatus(false);
            console.warn("Server responded, but status was not OK:", res.status);
        }
    } catch (e) {
        setConnectionStatus(false);
        console.error("Network Error: Could not reach user state endpoint.", e);
    }
}


// --- UI Update & Game State Management ---

function updateGameUI(data) {
    // Reset logic simplified
    if (data.round_id !== lastRoundId && lastRoundId !== 0) {
        userBetAmount = 0;
        userCashedOut = false;
        if(document.getElementById('bet-amount')) {
            document.getElementById('bet-amount').value = '';
        }
        if(document.getElementById('chart-loader')) {
            document.getElementById('chart-loader').classList.remove('fade-out');
        }
        // Force a balance fetch after round transition in case of payout/loss
        window.fetchUserBalanceAndLastResult(); 
    }
    lastRoundId = data.round_id;
    
    // State handling
    if (data.state !== lastState) {
        handleStateTransition(data.state);
    }
    lastState = data.state;
    
    // State visuals use the current WS data
    if (data.state === 'BETTING') {
        updateBettingVisuals(data.time_to_next_phase, data.round_id);
    } else if (data.state === 'RUNNING') {
        updateRunningVisuals(data.multiplier);
    } else if (data.state === 'CRASHED') {
        updateCrashedVisuals(data.multiplier);
    }

    // This bet info should ideally be pushed by the WS manager after a successful POST /bet
    // but for stability, we assume the user only updates it on local events and re-syncs on transition.
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
    } else if (newState === 'RUNNING') {
        dom.statusText.innerText = "در حال صعود...";
        dom.statusText.className = 'status-running';
        if(document.getElementById('chart-loader')) {
            document.getElementById('chart-loader').classList.add('fade-out');
        }
    } else if (newState === 'CRASHED') {
        dom.statusText.innerText = `CRASHED @ ${dom.multiplierDisplay.innerText}X`;
        dom.statusText.className = 'status-crashed';
        SoundFX.crash();
        dom.multiplierDisplay.innerText = '0.00'; 
    } else if (newState === 'WAITING') {
        dom.statusText.innerText = "آماده‌سازی...";
        dom.statusText.className = 'status-waiting';
    }
}

function updateBettingVisuals(timeLeft, roundId) {
    dom.multiplierDisplay.innerText = '1.00';
    dom.multiplierDisplay.className = 'crash-multiplier'; 
    dom.timerDisplay.innerText = timeLeft;
    const progress = (CONFIG.BETTING_DURATION - timeLeft) / CONFIG.BETTING_DURATION;
    dom.timerCircle.style.strokeDashoffset = 283 - (progress * 283);
    dom.timerCircle.style.stroke = 'var(--gold-primary)';
    
    if(document.getElementById('round-id')) {
        document.getElementById('round-id').innerText = `#${roundId}`;
    }
}

function updateRunningVisuals(multiplier) {
    dom.multiplierDisplay.innerText = multiplier.toFixed(2);
    dom.multiplierDisplay.className = 'crash-multiplier running';
    
    // CHART UPDATES REMOVED FOR DEBUGGING
    
    dom.timerDisplay.innerText = '';
    dom.timerCircle.style.strokeDashoffset = 283;
}

function updateCrashedVisuals(crashMultiplier) {
    dom.multiplierDisplay.innerText = crashMultiplier.toFixed(2);
    dom.multiplierDisplay.className = 'crash-multiplier crashed-final';
}

function setConnectionStatus(isConnected) {
    const statusDot = document.getElementById('connection-status-dot');
    if (statusDot) {
        statusDot.style.backgroundColor = isConnected ? CONFIG.CHART_COLORS.up : CONFIG.CHART_COLORS.down;
    }
    if (!isConnected) {
        dom.statusText.innerText = "در حال اتصال به اجین بازی...";
        dom.statusText.className = 'status-error';
    } else {
        // FIX: هنگام اتصال موفق، وضعیت متنی را بلافاصله بر اساس lastState تنظیم کن.
        handleStateTransition(lastState); 
    }
}

// updateBetCashoutVisibility, setupEventListeners, showResultModal, etc. (Unchanged functions follow)

function updateBetCashoutVisibility() {
    if (!dom.bettingBox || !dom.cashoutBox) return;
    
    if (userBetAmount > 0 && !userCashedOut && lastState === 'RUNNING') {
        dom.bettingBox.classList.add('hidden');
        dom.cashoutBox.classList.remove('hidden');
        dom.cashoutBtn.innerText = `CASH OUT (${dom.multiplierDisplay.innerText}X)`;
    } else {
        dom.cashoutBox.classList.add('hidden');
        dom.bettingBox.classList.remove('hidden');
        const disable = lastState !== 'BETTING' || userBetAmount > 0;
        dom.betBtn.disabled = disable;
        dom.betBtn.style.opacity = disable ? '0.5' : '1';
        dom.betBtn.innerText = userBetAmount > 0 ? `Bet Placed: $${userBetAmount.toFixed(2)}` : 'PLACE BET';
    }
}

function setupEventListeners() {
    if (dom.multiplierDisplay) {
        const observer = new MutationObserver((mutationsList, observer) => {
            if (lastState === 'RUNNING' && userBetAmount > 0 && !userCashedOut) {
                dom.cashoutBtn.innerText = `CASH OUT (${dom.multiplierDisplay.innerText}X)`;
            }
        });
        observer.observe(dom.multiplierDisplay, { childList: true, characterData: true });
    }
    
    document.querySelectorAll('.chip').forEach(chip => {
        chip.addEventListener('click', function() {
            window.setAmount(parseFloat(this.getAttribute('data-amount')));
        });
    });
    
    document.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => { if(!btn.disabled) { SoundFX.click(); tg.HapticFeedback.impactOccurred('light'); } });
    });
    
    const swapInput = document.getElementById('swap-input-toman');
    if(swapInput) {
        swapInput.addEventListener('input', function(e) {
            let val = e.target.value.replace(/,/g, '').replace(/\D/g, ''); 
            
            if (val) {
                e.target.value = parseInt(val).toLocaleString('en-US');
                const tomanAmount = parseFloat(val);
                const usd = tomanAmount / CONFIG.EST_USDT_RATE;
                
                if(document.getElementById('swap-calc-usd')) {
                    document.getElementById('swap-calc-usd').innerText = usd.toFixed(2) + ' USD';
                }
            } else { 
                e.target.value = ''; 
                if(document.getElementById('swap-calc-usd')) {
                    document.getElementById('swap-calc-usd').innerText = '0.00 USD';
                }
            }
        });
    }
}

// --- Global Exposed Functions (Called from HTML) ---

function showResultModal(result) {
    const elModal = document.getElementById('result-modal');
    const elTitle = document.getElementById('res-title');
    const elAmount = document.getElementById('res-amount');
    const elIcon = document.getElementById('res-icon');
    const elMsg = document.getElementById('res-message');
    
    if (!elModal || !elTitle || !elAmount) return;
    
    // Note: Confetti removed here as the library is not guaranteed to be loaded
    
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
        SoundFX.win();
    } else {
        elTitle.innerText = "سقوط"; 
        elTitle.style.color = CONFIG.CHART_COLORS.down;
        elAmount.className = "res-amount res-loss"; 
        elAmount.innerText = `-$${Math.abs(result.profit).toFixed(2)}`;
        elIcon.innerText = "💥"; 
        elMsg.innerText = `ضریب در ${multiplier.toFixed(2)} سقوط کرد.`;
        // SoundFX.crash() is handled in handleStateTransition when state changes to CRASHED
    }
    elModal.classList.add('active');
}
window.closeResultModal = () => document.getElementById('result-modal').classList.remove('active');


// --- Game Action Handlers ---

window.placeBet = async function() {
    if (lastState !== 'BETTING' || userBetAmount > 0) return window.showToast('Cannot place bet now.');
    
    const amount = parseFloat(document.getElementById('bet-amount').value);
    // Assuming auto-cash-out input is available, otherwise default to null
    const autoCashOutInput = document.getElementById('auto-cashout-multiplier'); 
    const auto_cash_out = (autoCashOutInput && autoCashOutInput.value) ? parseFloat(autoCashOutInput.value) : null;
    
    if (!amount || amount <= 0) return window.showToast('لطفاً مبلغ را وارد کنید');
    
    tg.HapticFeedback.impactOccurred('heavy');
    dom.betBtn.disabled = true;
    dom.betBtn.style.opacity = '0.5';

    try {
        const res = await fetch(`${API_BASE_URL}/webapp/game/bet`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ initData: tg.initData, amount: amount, auto_cash_out: auto_cash_out })
        });
        const result = await res.json();
        
        if (result.status === 'success') {
            SoundFX.success();
            window.showToast(`✅ شرط ثبت شد: $${amount.toFixed(2)}`);
            userBetAmount = amount;
            // Force a balance refresh as the deduction has occurred
            window.fetchUserBalanceAndLastResult(); 
            updateBetCashoutVisibility(); 
        } else { 
            window.showToast(`⚠️ ${result.message}`); 
            dom.betBtn.disabled = false;
            dom.betBtn.style.opacity = '1';
        }
    } catch(e) { 
        window.showToast("خطای اتصال"); 
        dom.betBtn.disabled = false;
        dom.betBtn.style.opacity = '1';
    }
};

window.cashOut = async function() {
    if (lastState !== 'RUNNING' || userCashedOut) return window.showToast('نمی‌توانید نقد کنید.');

    dom.cashoutBtn.disabled = true;
    dom.cashoutBtn.style.opacity = '0.5';
    
    tg.HapticFeedback.impactOccurred('heavy');
    
    try {
        const res = await fetch(`${API_BASE_URL}/webapp/game/cashout`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ initData: tg.initData }) // target_multiplier removed, controlled by server time
        });
        const result = await res.json();
        
        if (result.status === 'success') {
            // SoundFX.win is now called inside showResultModal
            const payout = parseFloat(result.payout);
            const profit = payout - userBetAmount;
            window.showToast(`🏆 نقد موفقیت‌آمیز! سود: $${profit.toFixed(2)}`);
            userCashedOut = true;
            dom.cashoutBox.classList.add('cashed-out');
            dom.cashoutBox.innerText = `CASHED OUT @ ${dom.multiplierDisplay.innerText}X`;
            // Force a balance refresh as the credit has occurred
            window.fetchUserBalanceAndLastResult(); 
        } else { 
            window.showToast(`⚠️ ${result.message}`); 
            dom.cashoutBtn.disabled = false;
            dom.cashoutBtn.style.opacity = '1';
        }
    } catch(e) { 
        window.showToast("خطای شبکه");
        dom.cashoutBtn.disabled = false;
        dom.cashoutBtn.style.opacity = '1';
    }
};

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

// --- History and Swap Utility Handlers ---

function updateHistoryRibbon(history) {
    const container = dom.historyContainer; 
    if (!container) return;

    container.innerHTML = '';
    
    history.slice().forEach(crashPoint => {
        const div = document.createElement('div'); 
        const isLow = crashPoint <= 2.0;
        div.className = `hist-pill ${isLow ? 'low' : 'high'}`; 
        div.innerText = `${crashPoint.toFixed(2)}x`;
        container.appendChild(div);
    });
}

window.openSwapModal = () => document.getElementById('swap-modal').classList.add('active');
window.closeSwapModal = () => document.getElementById('swap-modal').classList.remove('active');
window.openHistory = () => document.getElementById('history-modal').classList.add('active');
window.closeHistory = () => document.getElementById('history-modal').classList.remove('active');
window.openLeaderboard = () => document.getElementById('leaderboard-modal').classList.add('active');
window.closeLeaderboard = () => document.getElementById('leaderboard-modal').classList.remove('active');

window.performSwap = async function() {
    const swapInput = document.getElementById('swap-input-toman');
    if (!swapInput) { window.showToast("Error: Swap input not found."); return; }
    
    const rawVal = swapInput.value.replace(/,/g, '');
    const amount = parseFloat(rawVal);
    if (!amount || amount < 50000) { window.showToast("⚠️ حداقل مبلغ ۵۰,۰۰۰ تومان"); return; }
    
    tg.HapticFeedback.impactOccurred('medium');
    try {
        const res = await fetch(`${API_BASE_URL}/webapp/game/swap-to-usd`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ initData: tg.initData, amount_toman: amount })
        });
        const result = await res.json();
        if (result.status === 'success') { 
            window.showToast("✅ حساب شارژ شد"); 
            window.closeSwapModal(); 
            SoundFX.success(); 
            window.fetchUserBalanceAndLastResult(); // Use the dedicated function for balance update
        }
        else { window.showToast(`❌ ${result.message}`); }
    } catch(e) { window.showToast("خطای شبکه"); }
};

// --- اجرای تابع اولیه بلافاصله پس از بارگذاری اسکریپت ---
// این خط جایگزین window.onload شده است تا از Race Condition جلوگیری کند
initializeGame();