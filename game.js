/* webapp/game.js (v84.0 - FINAL FIX: Switched to HTTP Polling for Telegram Compatibility) */

const tg = window.Telegram.WebApp;
const API_BASE_URL = window.location.origin;

// تنظیمات سراسری (Adjusted for Crash Game)
const CONFIG = {
    // NOTE: ROUND_DURATION is now controlled by RoundManager/Engine
    SLOW_POLL_RATE: 200, // Reduced poll rate for smoother updates (5 times per second)
    EST_USDT_RATE: 90000,
    CHART_COLORS: {
        bg: 'transparent',
        text: '#848E9C',
        grid: 'transparent',
        up: '#0ECB81',
        down: '#F6465D',
        areaTopUp: 'rgba(14, 203, 129, 0.7)',
        areaBottomUp: 'rgba(14, 203, 129, 0.05)',
    }
};

let lastState = 'CRASHED';
let lastRoundId = 0;
let userBetAmount = 0;
let userCashedOut = false;

// --- DOM Elements (Populated inside initializeGame) ---
let dom = {};

// --- Audio System (Unchanged - simplified) ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const SoundFX = {
    // ... (Your SoundFX functions here)
    // Simplified placeholder for brevity:
    click: () => {}, success: () => {}, crash: () => { tg.HapticFeedback.notificationOccurred('error'); }, win: () => { tg.HapticFeedback.notificationOccurred('success'); },
    playTone: (f, t, d, v) => { if (audioCtx.state === 'suspended') audioCtx.resume(); /* ... */ },
};


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

    // 2. Start communication immediately via HTTP Polling
    fetchServerData();
    setInterval(fetchServerData, CONFIG.SLOW_POLL_RATE); // Check every 200ms
    
    // 3. Setup event listeners
    setupEventListeners();
}

async function fetchServerData() {
    try {
        const res = await fetch(`${API_BASE_URL}/webapp/game/state`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ initData: tg.initData })
        });
        if (res.ok) {
            const data = await res.json();
            updateGameUI(data);
            setConnectionStatus(true);
        } else { 
            setConnectionStatus(false); 
            console.warn("Server responded with error status:", res.status);
        }
    } catch (e) {
        setConnectionStatus(false);
        console.error("Network Polling Error:", e);
    }
}


function setConnectionStatus(isConnected) {
    const statusDot = document.getElementById('connection-status-dot');
    if (statusDot) {
        statusDot.style.backgroundColor = isConnected ? CONFIG.CHART_COLORS.up : CONFIG.CHART_COLORS.down;
    }
    if (!isConnected) {
        dom.statusText.innerText = "در حال اتصال به انجین بازی...";
        dom.statusText.className = 'status-error';
    } else {
        // FIX: Force UI update to remove 'Connecting...' text
        handleStateTransition(lastState);
    }
}

function updateGameUI(data) {
    // 1. Round Transition Logic
    if (data.round_id !== lastRoundId && lastRoundId !== 0) {
        userBetAmount = 0;
        userCashedOut = false;
        // Force a balance fetch after round transition
        window.fetchUserBalanceAndLastResult(); 
    }
    lastRoundId = data.round_id;
    
    // 2. State Handling
    if (data.state !== lastState) {
        handleStateTransition(data.state, data.multiplier); // Pass multiplier for CRASHED state
    }
    lastState = data.state;
    
    // 3. UI Visuals (using Polling data)
    if (data.state === 'BETTING') {
        // We use Math.ceil for the timer as Polling might be imprecise
        const timeLeft = Math.ceil(data.time_to_next_phase);
        updateBettingVisuals(timeLeft, data.round_id);
    } else if (data.state === 'RUNNING') {
        updateRunningVisuals(data.multiplier);
    } else if (data.state === 'CRASHED') {
        updateCrashedVisuals(data.multiplier);
    }

    // 4. Update User Info
    if (data.user_balance !== undefined) {
        dom.userBalance.innerText = data.user_balance.toLocaleString('en-US', {minimumFractionDigits: 2});
    }
    const betInfo = data.user_bet_info; // Using the new structure
    if (betInfo) {
        userBetAmount = betInfo.amount;
        userCashedOut = betInfo.is_cashed_out;
    } else {
        userBetAmount = 0;
        userCashedOut = false;
    }
    updateBetCashoutVisibility();
    updateHistoryRibbon(data.history || []);
    
    // Check for last result (pushed via API)
    if (data.last_result) {
        showResultModal(data.last_result);
    }
}


function handleStateTransition(newState, multiplier = 1.00) {
    // Ensure all DOM elements are accessible before trying to change them
    if (!dom.statusText || !dom.multiplierDisplay) return;

    if (newState === 'BETTING') {
        dom.statusText.innerText = "آماده ثبت شرط";
        dom.statusText.className = 'status-betting';
        if(document.getElementById('chart-loader')) {
            document.getElementById('chart-loader').classList.remove('fade-out');
        }
    } else if (newState === 'RUNNING') {
        dom.statusText.innerText = "در حال صعود...";
        dom.statusText.className = 'status-running';
        if(document.getElementById('chart-loader')) {
            document.getElementById('chart-loader').classList.add('fade-out');
        }
    } else if (newState === 'CRASHED') {
        // Display the final crash multiplier
        const crashX = multiplier.toFixed(2);
        dom.multiplierDisplay.innerText = crashX;
        dom.statusText.innerText = `CRASHED @ ${crashX}X`;
        dom.statusText.className = 'status-crashed';
        SoundFX.crash();
    } else if (newState === 'WAITING') {
        dom.statusText.innerText = "آماده‌سازی...";
        dom.statusText.className = 'status-waiting';
        dom.multiplierDisplay.innerText = '1.00';
    }
}

function updateBettingVisuals(timeLeft, roundId) {
    if (!dom.multiplierDisplay) return;
    dom.multiplierDisplay.innerText = '1.00';
    dom.multiplierDisplay.className = 'crash-multiplier'; 
    dom.timerDisplay.innerText = timeLeft;
    const duration = 10; // Betting Duration is 10s
    const progress = (duration - timeLeft) / duration;
    dom.timerCircle.style.strokeDashoffset = 283 - (progress * 283);
    dom.timerCircle.style.stroke = 'var(--gold-primary)';
    
    if(document.getElementById('round-id')) {
        document.getElementById('round-id').innerText = `#${roundId}`;
    }
}

function updateRunningVisuals(multiplier) {
    if (!dom.multiplierDisplay) return;
    dom.multiplierDisplay.innerText = multiplier.toFixed(2);
    dom.multiplierDisplay.className = 'crash-multiplier running';
    
    dom.timerDisplay.innerText = '';
    dom.timerCircle.style.strokeDashoffset = 283;
}

function updateCrashedVisuals(crashMultiplier) {
    if (!dom.multiplierDisplay) return;
    dom.multiplierDisplay.innerText = crashMultiplier.toFixed(2);
    dom.multiplierDisplay.className = 'crash-multiplier crashed-final';
}

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

// ... (setupEventListeners, showResultModal, etc. - keep your existing implementation for these utility functions)

window.placeBet = async function() {
    if (lastState !== 'BETTING' || userBetAmount > 0) return window.showToast('Cannot place bet now.');
    
    const amount = parseFloat(document.getElementById('bet-amount').value);
    const autoCashOutInput = document.getElementById('auto-cashout-multiplier'); 
    const auto_cash_out = (autoCashOutInput && autoCashOutInput.value) ? parseFloat(autoCashOutInput.value) : null;
    
    if (!amount || amount <= 0) return window.showToast('لطفاً مبلغ را وارد کنید');
    
    // Simplified betting logic (uses the existing API route)
    // NOTE: This uses the modern API route /webapp/game/bet, which talks to RoundManager
    // This maintains the financial integrity of the new system.
    try {
        const res = await fetch(`${API_BASE_URL}/webapp/game/bet`, {
             method: 'POST', headers: {'Content-Type': 'application/json'},
             body: JSON.stringify({ initData: tg.initData, amount: amount, auto_cash_out: auto_cash_out })
         });
         const result = await res.json();
         if (result.status === 'success') {
             userBetAmount = amount;
             window.fetchServerData(); // Force update
             window.showToast(`✅ شرط ثبت شد: $${amount.toFixed(2)}`);
         } else { window.showToast(`⚠️ ${result.message}`); }
    } catch(e) { window.showToast("خطای اتصال"); }
};

window.cashOut = async function() {
    if (lastState !== 'RUNNING' || userCashedOut) return window.showToast('نمی‌توانید نقد کنید.');
    // NOTE: This uses the modern API route /webapp/game/cashout, which talks to RoundManager
    try {
        const res = await fetch(`${API_BASE_URL}/webapp/game/cashout`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ initData: tg.initData }) 
        });
        const result = await res.json();
        if (result.status === 'success') {
            userCashedOut = true;
            window.fetchServerData(); // Force update
            const profit = parseFloat(result.payout) - userBetAmount;
            window.showToast(`🏆 نقد موفقیت‌آمیز! سود: $${profit.toFixed(2)}`);
        } else { window.showToast(`⚠️ ${result.message}`); }
    } catch(e) { window.showToast("خطای شبکه"); }
};


// --- Execution Start ---
initializeGame();