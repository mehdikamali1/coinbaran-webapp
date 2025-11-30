/* webapp/game.js (v35.0 - Server-Driven Result & Entry Display) */

const tg = window.Telegram.WebApp;
const API_BASE_URL = window.location.origin;

// متغیرهای چارت
let chart;
let areaSeries;
let lastPrice = 0;
let isFirstLoad = true;
let lastTime = 0;

// متغیرهای بازی
const ROUND_DURATION = 60;
const EST_USDT_RATE = 90000;

// --- سیستم صوتی ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const SoundFX = {
    tick: () => playTone(800, 'sine', 0.05),
    lock: () => playTone(400, 'sawtooth', 0.2),
    win: () => playTone(1200, 'triangle', 0.1, 2),
    lose: () => playTone(150, 'sawtooth', 0.4)
};

function playTone(freq, type, dur, count = 1) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    for(let i=0; i<count; i++) {
        setTimeout(() => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start();
            gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);
            osc.stop(audioCtx.currentTime + dur);
        }, i * 150);
    }
}

// --- شروع برنامه ---
window.onload = function() {
    tg.ready();
    tg.expand();
    tg.setHeaderColor('#171B26');
    tg.setBackgroundColor('#171B26');
    
    if (!tg.initData) tg.initData = "query_id=TEST_DEV_MODE";

    initChart();
    
    // شروع دریافت دیتا
    setInterval(fetchServerData, 1000);
    fetchServerData();

    // هندل کردن ویبره دکمه‌ها
    document.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => {
            if(!btn.disabled && !btn.classList.contains('close-modal')) {
                tg.HapticFeedback.impactOccurred('light');
            }
        });
    });

    // فرمت دهی اینپوت تبدیل (50,000)
    const swapInput = document.getElementById('swap-input-toman');
    if(swapInput) {
        swapInput.addEventListener('input', function(e) {
            let rawValue = e.target.value.replace(/,/g, '');
            if(!/^\d*$/.test(rawValue)) { rawValue = rawValue.replace(/\D/g, ''); }
            
            if (rawValue) e.target.value = parseInt(rawValue).toLocaleString('en-US');
            else e.target.value = '';
            
            const tomans = parseFloat(rawValue) || 0;
            const usd = tomans / EST_USDT_RATE;
            document.getElementById('swap-calc-usd').innerText = usd.toFixed(2);
        });
    }
};

// =========================================
// 1. تنظیمات چارت
// =========================================
function initChart() {
    const container = document.getElementById('tv-chart-container');
    chart = LightweightCharts.createChart(container, {
        width: container.clientWidth,
        height: container.clientHeight,
        layout: { background: { type: 'solid', color: '#171B26' }, textColor: '#848E9C', fontFamily: "'Roboto Mono', monospace" },
        grid: { vertLines: { visible: false }, horzLines: { visible: false } },
        rightPriceScale: { borderColor: 'transparent', visible: true, scaleMargins: { top: 0.1, bottom: 0.05 } },
        timeScale: { borderColor: 'transparent', timeVisible: true, secondsVisible: true, rightOffset: 5, fixLeftEdge: true },
        crosshair: { vertLine: { width: 1, color: 'rgba(240, 185, 11, 0.5)', style: 0, labelBackgroundColor: '#171B26' }, horzLine: { width: 1, color: 'rgba(240, 185, 11, 0.5)', style: 0, labelBackgroundColor: '#171B26' } },
        handleScroll: { mouseWheel: false, pressedMouseMove: true },
        handleScale: { axisPressedMouseMove: false, mouseWheel: false, pinch: false },
    });
    areaSeries = chart.addAreaSeries({ topColor: 'rgba(14, 203, 129, 0.56)', bottomColor: 'rgba(14, 203, 129, 0.04)', lineColor: 'rgba(14, 203, 129, 1)', lineWidth: 2, crosshairMarkerVisible: true, crosshairMarkerRadius: 4 });
    new ResizeObserver(entries => {
        if (entries.length === 0 || entries[0].target !== container) return;
        const newRect = entries[0].contentRect;
        chart.applyOptions({ height: newRect.height, width: newRect.width });
        chart.timeScale().fitContent();
    }).observe(container);
}

function generateHistoryFromRealPrice(realPrice) {
    const res = []; let currentPrice = realPrice; const timeNow = Math.floor(Date.now() / 1000);
    for (let i = 1; i <= 60; i++) {
        const move = (Math.random() - 0.5) * 3; const value = currentPrice - move;
        res.push({ time: timeNow - i, value: value }); currentPrice = value;
    }
    return res.reverse();
}

// =========================================
// 2. دریافت دیتا و آپدیت UI
// =========================================
async function fetchServerData() {
    try {
        const res = await fetch(`${API_BASE_URL}/webapp/game/state`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ initData: tg.initData })
        });
        if (res.ok) {
            const data = await res.json();
            updateGameUI(data);
        }
    } catch (e) {
        if (!isFirstLoad) simulateSmoothLocalMovement();
    }
}

function updateGameUI(data) {
    const serverPrice = data.current_price;
    
    // 1. آپدیت موجودی
    if (data.user_balance !== undefined) {
        document.getElementById('user-balance-display').innerText = data.user_balance.toLocaleString('en-US', {minimumFractionDigits: 2});
    }

    // 2. نمایش قیمت ورود (Entry Price) اگر شرطی فعال باشد
    const elEntry = document.getElementById('entry-display');
    if (data.user_bet && data.user_bet.entry_price) {
        const dirArrow = data.user_bet.prediction === 'UP' ? '▲' : '▼';
        const color = data.user_bet.prediction === 'UP' ? '#0ECB81' : '#F6465D';
        elEntry.innerHTML = `<span style="color:${color}">${dirArrow} Entry: $${data.user_bet.entry_price.toLocaleString()}</span>`;
    } else {
        elEntry.innerHTML = ""; // خالی کردن اگر شرطی نیست
    }

    // 3. بررسی نتیجه قطعی از سرور (New Logic)
    if (data.last_result) {
        showResultModal(data.last_result);
    }

    // 4. آپدیت چارت و قیمت لحظه ای
    updateChartData(serverPrice);

    // 5. تایمر و تاریخچه
    if (data.round) {
        updateTimerCircle(data.round.time_left);
        updateRoundStatus(data);
    }
    if (data.history) {
        updateHistoryRibbon(data.history);
    }
}

function updateChartData(serverPrice) {
    const domPrice = document.getElementById('btc-price');
    
    if (isFirstLoad && serverPrice > 0) {
        const historyData = generateHistoryFromRealPrice(serverPrice);
        areaSeries.setData(historyData);
        lastTime = Math.floor(Date.now() / 1000);
        areaSeries.update({ time: lastTime, value: serverPrice });
        chart.timeScale().fitContent(); 
        document.getElementById('chart-loader').classList.add('fade-out');
        isFirstLoad = false; lastPrice = serverPrice;
    }

    if (serverPrice !== lastPrice) {
        const isUp = serverPrice >= lastPrice;
        const color = isUp ? '#0ECB81' : '#F6465D';
        domPrice.style.color = color;
        domPrice.innerText = serverPrice.toLocaleString('en-US', {minimumFractionDigits: 2});
        document.querySelector('.blink-dot').style.backgroundColor = color;
        areaSeries.applyOptions({ lineColor: color, topColor: isUp ? 'rgba(14, 203, 129, 0.5)' : 'rgba(246, 70, 93, 0.5)', bottomColor: isUp ? 'rgba(14, 203, 129, 0.01)' : 'rgba(246, 70, 93, 0.01)', crosshairMarkerBackgroundColor: color });
        lastPrice = serverPrice;
    }

    if (!isFirstLoad) {
        const now = Math.floor(Date.now() / 1000);
        if (now > lastTime) { lastTime = now; areaSeries.update({ time: now, value: serverPrice }); }
        else { areaSeries.update({ time: lastTime, value: serverPrice }); }
    }
}

function simulateSmoothLocalMovement() {
    if (isFirstLoad) return;
    const move = (Math.random() - 0.5) * 1.5; const newPrice = lastPrice + move;
    document.getElementById('btc-price').innerText = newPrice.toFixed(2);
    const now = Math.floor(Date.now() / 1000);
    if (now > lastTime) { lastTime = now; areaSeries.update({ time: now, value: newPrice }); }
    else { areaSeries.update({ time: lastTime, value: newPrice }); }
    lastPrice = newPrice;
}

// =========================================
// 3. نمایش نتیجه (Result Modal)
// =========================================
function showResultModal(result) {
    const elModal = document.getElementById('result-modal');
    const elTitle = document.getElementById('res-title');
    const elAmount = document.getElementById('res-amount');
    const elIcon = document.getElementById('res-icon');
    const elMsg = document.getElementById('res-message');
    
    // پر کردن جزئیات دقیق
    const elEntry = document.getElementById('res-entry');
    const elClose = document.getElementById('res-close');
    if(elEntry) elEntry.innerText = `$${result.entry_price.toLocaleString()}`;
    if(elClose) elClose.innerText = `$${result.close_price.toLocaleString()}`;

    if (result.status === 'WIN') {
        SoundFX.win();
        tg.HapticFeedback.notificationOccurred('success');
        confetti({ particleCount: 200, spread: 100, origin: { y: 0.6 } });
        
        elTitle.innerText = "YOU WON!";
        elTitle.style.color = "#0ECB81";
        elAmount.className = "res-amount res-win";
        elAmount.innerText = `+$${result.profit.toFixed(2)}`;
        elIcon.innerText = "🏆";
        elMsg.innerText = "Target hit successfully.";
    } else {
        SoundFX.lose();
        tg.HapticFeedback.notificationOccurred('error');
        
        elTitle.innerText = "LIQUIDATED";
        elTitle.style.color = "#F6465D";
        elAmount.className = "res-amount res-loss";
        elAmount.innerText = `-$${Math.abs(result.profit).toFixed(2)}`;
        elIcon.innerText = "📉";
        elMsg.innerText = "Market went against your position.";
    }
    
    elModal.classList.add('active');
}

// =========================================
// 4. تایمر و وضعیت
// =========================================
function updateTimerCircle(timeLeft) {
    const elText = document.getElementById('timer-text');
    const elCircle = document.getElementById('timer-progress');
    const elRing = document.querySelector('.timer-progress');
    elText.innerText = timeLeft;
    const offset = 283 - (timeLeft / ROUND_DURATION) * 283;
    elCircle.style.strokeDashoffset = offset;
    if (timeLeft <= 5) {
        elRing.style.stroke = '#F6465D'; elText.style.color = '#F6465D';
        if (!window[`tick_${timeLeft}`]) { SoundFX.tick(); tg.HapticFeedback.impactOccurred('soft'); window[`tick_${timeLeft}`] = true; }
    } else {
        elRing.style.stroke = '#F0B90B'; elText.style.color = '#EAECEF';
        for(let i=1; i<=5; i++) window[`tick_${i}`] = false;
    }
}

function updateRoundStatus(data) {
    const elStatus = document.getElementById('round-status');
    const elRoundId = document.getElementById('round-id');
    const timeLeft = data.round.time_left;
    elRoundId.innerText = `ROUND #${data.round.id}`;
    
    const isLocked = timeLeft <= 10; // قفل شدن در 10 ثانیه آخر
    const hasBet = !!data.user_bet;

    if (hasBet) {
        elStatus.innerHTML = `<span style="color:#0ECB81">POSITION OPEN</span>`;
    } else if (isLocked) {
        elStatus.innerHTML = `<span style="color:#F6465D">LOCKED 🔒</span>`;
    } else {
        elStatus.innerHTML = `<span style="color:#0ECB81">OPEN 🟢</span>`;
    }
    toggleButtons(isLocked || hasBet);
}

// =========================================
// 5. هندلینگ شرط‌ها و تبدیل (Swap)
// =========================================
window.setAmount = function(val) {
    document.getElementById('bet-amount').value = val;
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    Array.from(document.querySelectorAll('.chip')).find(c => c.innerText.trim() === String(val))?.classList.add('active');
    tg.HapticFeedback.selectionChanged();
};

window.openSwapModal = () => document.getElementById('swap-modal').classList.add('active');
window.closeSwapModal = () => document.getElementById('swap-modal').classList.remove('active');
window.closeResultModal = () => document.getElementById('result-modal').classList.remove('active');

window.performSwap = async function() {
    const rawVal = document.getElementById('swap-input-toman').value.replace(/,/g, '');
    const amountToman = parseFloat(rawVal);
    
    if (!amountToman || amountToman < 50000) { showToast("⚠️ حداقل ۵۰,۰۰۰ تومان"); return; }
    tg.HapticFeedback.impactOccurred('medium');
    
    try {
        const res = await fetch(`${API_BASE_URL}/webapp/game/swap-to-usd`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ initData: tg.initData, amount_toman: amountToman })
        });
        const result = await res.json();
        if (result.status === 'success') {
            showToast(`✅ ${result.message}`);
            window.closeSwapModal();
            document.getElementById('swap-input-toman').value = '';
        } else { showToast(`❌ ${result.message}`); }
    } catch(e) { showToast("خطای اتصال"); }
};

window.placeBet = async function(pred) {
    const amount = document.getElementById('bet-amount').value;
    tg.HapticFeedback.impactOccurred('heavy'); 
    try {
        const res = await fetch(`${API_BASE_URL}/webapp/game/bet`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ initData: tg.initData, amount: parseFloat(amount), prediction: pred })
        });
        const result = await res.json();
        if (result.status === 'success') {
            showToast(`✅ Order Open: ${pred} $${amount}`);
            // توجه: دیگر اینجا چیزی در localStorage ذخیره نمی‌کنیم برای برد/باخت
            // چون همه چیز از سرور می‌آید.
        } else { showToast(`⚠️ ${result.message}`); SoundFX.lose(); }
    } catch(e) { showToast("Connection Error"); }
};

function toggleButtons(disable) { document.querySelectorAll('.trade-btn').forEach(b => b.disabled = disable); }

function updateHistoryRibbon(history) {
    const container = document.getElementById('history-container');
    container.innerHTML = '';
    history.slice().reverse().slice(0, 15).forEach(h => {
        const div = document.createElement('div');
        div.className = `hist-pill ${h.result === 'UP' ? 'up' : 'down'}`;
        container.appendChild(div);
    });
}

function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.innerText = msg; toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 3000);
}

window.openHistory = () => document.getElementById('history-modal').classList.add('active');
window.closeHistory = () => document.getElementById('history-modal').classList.remove('active');
window.openLeaderboard = () => document.getElementById('leaderboard-modal').classList.add('active');
window.closeLeaderboard = () => document.getElementById('leaderboard-modal').classList.remove('active');