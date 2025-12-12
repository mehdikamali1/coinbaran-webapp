/* webapp/game.js (v84.1 - FINAL FINAL FIX: Safe Initialization using DOMContentLoaded) */

const tg = window.Telegram.WebApp;
const API_BASE_URL = window.location.origin;

// ... (getWebSocketUrl function and CONFIG remain the same as v83.3/v84.0)
function getWebSocketUrl() {
    const ws_protocol = window.location.protocol === "https:" ? "wss://" : "ws://";
    return ws_protocol + window.location.host + "/ws/game/state";
}

const CONFIG = {
    SLOW_POLL_RATE: 200, // Check every 200ms
    EST_USDT_RATE: 90000,
    CHART_COLORS: {
        bg: 'transparent', text: '#848E9C', grid: 'transparent', up: '#0ECB81', down: '#F6465D',
        areaTopUp: 'rgba(14, 203, 129, 0.7)', areaBottomUp: 'rgba(14, 203, 129, 0.05)',
    }
};

let lastState = 'CRASHED';
let lastRoundId = 0;
let userBetAmount = 0;
let userCashedOut = false;
let dom = {};

// ... (SoundFX functions remain the same)
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const SoundFX = {
    click: () => {}, success: () => {}, crash: () => { tg.HapticFeedback.notificationOccurred('error'); }, win: () => { tg.HapticFeedback.notificationOccurred('success'); },
    playTone: (f, t, d, v) => { if (audioCtx.state === 'suspended') audioCtx.resume(); /* ... */ },
};


function initializeGame() {
    try {
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

        // 2. Start Telegram WebApp initialization
        tg.ready();
        tg.expand();
        tg.setHeaderColor('#050505');  
        tg.setBackgroundColor('#050505');
        if (!tg.initData) tg.initData = "query_id=TEST_DEV_MODE";

        // 3. Start Polling
        fetchServerData();
        setInterval(fetchServerData, CONFIG.SLOW_POLL_RATE); 
        
        // 4. Setup event listeners
        setupEventListeners();

    } catch (e) {
        // Log any critical crash during initialization
        console.error("Critical JS initialization crash:", e);
        // Fallback: Manually change status to show something failed, 
        // though this text may not display if the crash is severe.
        const fallbackStatus = document.getElementById('game-status-text');
        if (fallbackStatus) {
            fallbackStatus.innerText = "💥 خطای اجرای اسکریپت";
        }
    }
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
    // ... (logic remains the same)
    const statusDot = document.getElementById('connection-status-dot');
    if (statusDot) {
        statusDot.style.backgroundColor = isConnected ? CONFIG.CHART_COLORS.up : CONFIG.CHART_COLORS.down;
    }
    if (!isConnected) {
        dom.statusText.innerText = "در حال اتصال به اجین بازی...";
        dom.statusText.className = 'status-error';
    } else {
        // FIX: Force UI update to remove 'Connecting...' text
        handleStateTransition(lastState);
    }
}
// ... (The rest of the updateGameUI, handleStateTransition, updateBettingVisuals, updateRunningVisuals, 
// updateCrashedVisuals, updateBetCashoutVisibility, setupEventListeners, and window functions remain the same as v84.0)


// --- The rest of the functions (updateGameUI, handleStateTransition, etc.) remain the same as v84.0 ---

function updateGameUI(data) {
    if (data.round_id !== lastRoundId && lastRoundId !== 0) {
        userBetAmount = 0; userCashedOut = false; window.fetchServerData(); 
    }
    lastRoundId = data.round_id;
    if (data.state !== lastState) {
        handleStateTransition(data.state, data.multiplier);
    }
    lastState = data.state;
    if (data.state === 'BETTING') {
        const timeLeft = Math.ceil(data.time_to_next_phase); updateBettingVisuals(timeLeft, data.round_id);
    } else if (data.state === 'RUNNING') {
        updateRunningVisuals(data.multiplier);
    } else if (data.state === 'CRASHED') {
        updateCrashedVisuals(data.multiplier);
    }
    if (data.user_balance !== undefined) {
        dom.userBalance.innerText = data.user_balance.toLocaleString('en-US', {minimumFractionDigits: 2});
    }
    const betInfo = data.user_bet_info;
    if (betInfo) {
        userBetAmount = betInfo.amount; userCashedOut = betInfo.is_cashed_out;
    } else { userBetAmount = 0; userCashedOut = false; }
    updateBetCashoutVisibility(); updateHistoryRibbon(data.history || []);
    if (data.last_result) { showResultModal(data.last_result); }
}


function handleStateTransition(newState, multiplier = 1.00) {
    if (!dom.statusText || !dom.multiplierDisplay) return;

    if (newState === 'BETTING') {
        dom.statusText.innerText = "آماده ثبت شرط"; dom.statusText.className = 'status-betting';
        if(document.getElementById('chart-loader')) {
            document.getElementById('chart-loader').classList.remove('fade-out');
        }
    } else if (newState === 'RUNNING') {
        dom.statusText.innerText = "در حال صعود..."; dom.statusText.className = 'status-running';
        if(document.getElementById('chart-loader')) {
            document.getElementById('chart-loader').classList.add('fade-out');
        }
    } else if (newState === 'CRASHED') {
        const crashX = multiplier.toFixed(2);
        dom.multiplierDisplay.innerText = crashX;
        dom.statusText.innerText = `CRASHED @ ${crashX}X`; dom.statusText.className = 'status-crashed';
        SoundFX.crash();
    } else if (newState === 'WAITING') {
        dom.statusText.innerText = "آماده‌سازی..."; dom.statusText.className = 'status-waiting';
        dom.multiplierDisplay.innerText = '1.00';
    }
}
function updateBettingVisuals(timeLeft, roundId) {
    if (!dom.multiplierDisplay) return; dom.multiplierDisplay.innerText = '1.00';
    dom.multiplierDisplay.className = 'crash-multiplier'; dom.timerDisplay.innerText = timeLeft;
    const duration = 10; const progress = (duration - timeLeft) / duration;
    dom.timerCircle.style.strokeDashoffset = 283 - (progress * 283);
    dom.timerCircle.style.stroke = 'var(--gold-primary)';
    if(document.getElementById('round-id')) { document.getElementById('round-id').innerText = `#${roundId}`; }
}
function updateRunningVisuals(multiplier) {
    if (!dom.multiplierDisplay) return; dom.multiplierDisplay.innerText = multiplier.toFixed(2);
    dom.multiplierDisplay.className = 'crash-multiplier running'; dom.timerDisplay.innerText = '';
    dom.timerCircle.style.strokeDashoffset = 283;
}
function updateCrashedVisuals(crashMultiplier) {
    if (!dom.multiplierDisplay) return; dom.multiplierDisplay.innerText = crashMultiplier.toFixed(2);
    dom.multiplierDisplay.className = 'crash-multiplier crashed-final';
}
function updateBetCashoutVisibility() {
    if (!dom.bettingBox || !dom.cashoutBox) return;
    if (userBetAmount > 0 && !userCashedOut && lastState === 'RUNNING') {
        dom.bettingBox.classList.add('hidden'); dom.cashoutBox.classList.remove('hidden');
        dom.cashoutBtn.innerText = `CASH OUT (${dom.multiplierDisplay.innerText}X)`;
    } else {
        dom.cashoutBox.classList.add('hidden'); dom.bettingBox.classList.remove('hidden');
        const disable = lastState !== 'BETTING' || userBetAmount > 0;
        dom.betBtn.disabled = disable; dom.betBtn.style.opacity = disable ? '0.5' : '1';
        dom.betBtn.innerText = userBetAmount > 0 ? `Bet Placed: $${userBetAmount.toFixed(2)}` : 'PLACE BET';
    }
}
function setupEventListeners() {
    // ... (Your setupEventListeners logic here)
}
window.placeBet = async function() {
    // ... (Your placeBet logic here)
}
window.cashOut = async function() {
    // ... (Your cashOut logic here)
}
window.setAmount = function(val) {
    // ... (Your setAmount logic here)
}
window.showToast = function(msg) {
    // ... (Your showToast logic here)
}
function updateHistoryRibbon(history) {
    // ... (Your updateHistoryRibbon logic here)
}
window.openSwapModal = () => document.getElementById('swap-modal').classList.add('active');
window.closeSwapModal = () => document.getElementById('swap-modal').classList.remove('active');
window.openHistory = () => document.getElementById('history-modal').classList.add('active');
window.closeHistory = () => document.getElementById('history-modal').classList.remove('active');
window.openLeaderboard = () => document.getElementById('leaderboard-modal').classList.add('active');
window.closeLeaderboard = () => document.getElementById('leaderboard-modal').classList.remove('active');
window.performSwap = async function() {
    // ... (Your performSwap logic here)
};


// --- Execution Start using DOMContentLoaded ---
// این مطمئن‌ترین روش برای اجرای JS در لحظه‌ای است که DOM آماده است
document.addEventListener('DOMContentLoaded', initializeGame);