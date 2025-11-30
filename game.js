/* webapp/game.js (v31.0 - Final with Swap Feature) */

const tg = window.Telegram.WebApp;
const API_BASE_URL = window.location.origin;

// متغیرهای چارت
let chart;
let areaSeries;
let lastPrice = 0;
let isFirstLoad = true;
let lastTime = 0;

// متغیرهای بازی
const LOCKOUT_TIME = 15;
const ROUND_DURATION = 60;
const EST_USDT_RATE = 70000; // نرخ تقریبی جهت نمایش (محاسبه دقیق در سرور انجام می‌شود)

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
    
    setInterval(fetchServerData, 1000);
    fetchServerData();

    // هندل کردن دکمه‌ها (Haptic)
    document.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => {
            if(!btn.disabled) tg.HapticFeedback.impactOccurred('light');
        });
    });

    // لیسنر برای محاسبه مقدار دلاری در مودال
    const swapInput = document.getElementById('swap-input-toman');
    if(swapInput) {
        swapInput.addEventListener('input', function(e) {
            const tomans = parseFloat(e.target.value) || 0;
            // این فقط یک نمایش تقریبی است
            const usd = tomans / EST_USDT_RATE;
            document.getElementById('swap-calc-usd').innerText = usd.toFixed(2);
        });
    }
};

// =========================================
// 1. تنظیمات چارت (Mobile Perfect)
// =========================================
function initChart() {
    const container = document.getElementById('tv-chart-container');
    
    chart = LightweightCharts.createChart(container, {
        width: container.clientWidth,
        height: container.clientHeight,
        layout: {
            background: { type: 'solid', color: '#171B26' },
            textColor: '#848E9C',
            fontFamily: "'Roboto Mono', monospace",
        },
        grid: { vertLines: { visible: false }, horzLines: { visible: false } },
        rightPriceScale: {
            borderColor: 'transparent',
            visible: true,
            scaleMargins: { top: 0.1, bottom: 0.05 },
        },
        timeScale: {
            borderColor: 'transparent',
            timeVisible: true,
            secondsVisible: true,
            rightOffset: 5,
            fixLeftEdge: true,
        },
        crosshair: {
            vertLine: { width: 1, color: 'rgba(240, 185, 11, 0.5)', style: 0, labelBackgroundColor: '#171B26' },
            horzLine: { width: 1, color: 'rgba(240, 185, 11, 0.5)', style: 0, labelBackgroundColor: '#171B26' },
        },
        handleScroll: { mouseWheel: false, pressedMouseMove: true },
        handleScale: { axisPressedMouseMove: false, mouseWheel: false, pinch: false },
    });

    areaSeries = chart.addAreaSeries({
        topColor: 'rgba(14, 203, 129, 0.56)',
        bottomColor: 'rgba(14, 203, 129, 0.04)',
        lineColor: 'rgba(14, 203, 129, 1)',
        lineWidth: 2,
        crosshairMarkerVisible: true,
        crosshairMarkerRadius: 4,
    });

    new ResizeObserver(entries => {
        if (entries.length === 0 || entries[0].target !== container) return;
        const newRect = entries[0].contentRect;
        chart.applyOptions({ height: newRect.height, width: newRect.width });
        chart.timeScale().fitContent();
    }).observe(container);
}

// =========================================
// 2. تولید تاریخچه
// =========================================
function generateHistoryFromRealPrice(realPrice) {
    const res = [];
    let currentPrice = realPrice;
    const timeNow = Math.floor(Date.now() / 1000);
    
    for (let i = 1; i <= 60; i++) {
        const volatility = 3; 
        const move = (Math.random() - 0.5) * volatility;
        const value = currentPrice - move;
        res.push({ time: timeNow - i, value: value });
        currentPrice = value;
    }
    return res.reverse();
}

// =========================================
// 3. دریافت دیتا و آپدیت
// =========================================
async function fetchServerData() {
    try {
        const res = await fetch(`${API_BASE_URL}/webapp/game/state`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ initData: tg.initData })
        });
        if (res.ok) updateGameUI(await res.json());
    } catch (e) {
        if (!isFirstLoad) simulateSmoothLocalMovement();
    }
}

function updateGameUI(data) {
    const serverPrice = data.current_price;
    const domPrice = document.getElementById('btc-price');

    // لود اولیه بدون گپ
    if (isFirstLoad && serverPrice > 0) {
        const historyData = generateHistoryFromRealPrice(serverPrice);
        areaSeries.setData(historyData);
        lastTime = Math.floor(Date.now() / 1000);
        areaSeries.update({ time: lastTime, value: serverPrice });
        chart.timeScale().fitContent(); 
        
        const loader = document.getElementById('chart-loader');
        if(loader) loader.classList.add('fade-out');
        
        isFirstLoad = false;
        lastPrice = serverPrice;
    }

    // آپدیت قیمت
    if (serverPrice !== lastPrice) {
        const isUp = serverPrice >= lastPrice;
        const color = isUp ? '#0ECB81' : '#F6465D';
        domPrice.style.color = color;
        domPrice.innerText = serverPrice.toLocaleString('en-US', {minimumFractionDigits: 2});
        
        const dot = document.querySelector('.blink-dot');
        if(dot) dot.style.backgroundColor = color;
        
        areaSeries.applyOptions({
            lineColor: color,
            topColor: isUp ? 'rgba(14, 203, 129, 0.5)' : 'rgba(246, 70, 93, 0.5)',
            bottomColor: isUp ? 'rgba(14, 203, 129, 0.01)' : 'rgba(246, 70, 93, 0.01)',
            crosshairMarkerBackgroundColor: color
        });

        lastPrice = serverPrice;
    }

    // آپدیت چارت
    if (!isFirstLoad) {
        const now = Math.floor(Date.now() / 1000);
        if (now > lastTime) {
            lastTime = now;
            areaSeries.update({ time: now, value: serverPrice });
        } else {
            areaSeries.update({ time: lastTime, value: serverPrice });
        }
    }

    if (data.round) {
        updateTimerCircle(data.round.time_left);
        updateRoundStatus(data);
    }
    if (data.history) {
        updateHistoryRibbon(data.history);
        checkWinLoss(data.history);
    }
}

function simulateSmoothLocalMovement() {
    if (isFirstLoad) return;
    const move = (Math.random() - 0.5) * 1.5;
    const newPrice = lastPrice + move;
    
    const domPrice = document.getElementById('btc-price');
    domPrice.innerText = newPrice.toFixed(2);
    
    const now = Math.floor(Date.now() / 1000);
    if (now > lastTime) {
        lastTime = now;
        areaSeries.update({ time: now, value: newPrice });
    } else {
        areaSeries.update({ time: lastTime, value: newPrice });
    }
    lastPrice = newPrice;
}

// =========================================
// 4. تایمر و وضعیت
// =========================================
function updateTimerCircle(timeLeft) {
    const elText = document.getElementById('timer-text');
    const elCircle = document.getElementById('timer-progress');
    const elRing = document.querySelector('.timer-progress');
    
    elText.innerText = timeLeft;
    const maxDash = 283;
    const offset = maxDash - (timeLeft / ROUND_DURATION) * maxDash;
    elCircle.style.strokeDashoffset = offset;

    if (timeLeft <= 5) {
        elRing.style.stroke = '#F6465D';
        elText.style.color = '#F6465D';
        if (!window[`tick_${timeLeft}`]) {
            SoundFX.tick();
            tg.HapticFeedback.impactOccurred('soft');
            window[`tick_${timeLeft}`] = true;
        }
    } else {
        elRing.style.stroke = '#F0B90B';
        elText.style.color = '#EAECEF';
        for(let i=1; i<=5; i++) window[`tick_${i}`] = false;
    }
}

function updateRoundStatus(data) {
    const elStatus = document.getElementById('round-status');
    const elRoundId = document.getElementById('round-id');
    const timeLeft = data.round.time_left;

    elRoundId.innerText = `ROUND #${data.round.id}`;
    const isLocked = timeLeft <= LOCKOUT_TIME;
    const hasBet = !!data.user_bet;

    if (hasBet) {
        const type = data.user_bet.prediction === 'UP' ? 'LONG' : 'SHORT';
        const color = data.user_bet.prediction === 'UP' ? '#0ECB81' : '#F6465D';
        elStatus.innerHTML = `<span style="color:${color}">POSITION: ${type}</span>`;
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
    const chips = Array.from(document.querySelectorAll('.chip'));
    const targetChip = chips.find(c => c.innerText.trim() === String(val));
    if(targetChip) targetChip.classList.add('active');
    tg.HapticFeedback.selectionChanged();
};

// --- توابع جدید تبدیل ارز ---
window.openSwapModal = () => document.getElementById('swap-modal').classList.add('active');
window.closeSwapModal = () => document.getElementById('swap-modal').classList.remove('active');

window.performSwap = async function() {
    const amountToman = parseFloat(document.getElementById('swap-input-toman').value);
    
    if (!amountToman || amountToman < 50000) {
        showToast("⚠️ حداقل مبلغ ۵۰,۰۰۰ تومان است");
        return;
    }

    tg.HapticFeedback.impactOccurred('medium');
    
    try {
        const res = await fetch(`${API_BASE_URL}/webapp/game/swap-to-usd`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ 
                initData: tg.initData, 
                amount_toman: amountToman 
            })
        });
        const result = await res.json();
        
        if (result.status === 'success') {
            showToast(`✅ ${result.message}`);
            window.closeSwapModal();
            // پاک کردن اینپوت
            document.getElementById('swap-input-toman').value = '';
            document.getElementById('swap-calc-usd').innerText = '0.00';
        } else {
            showToast(`❌ ${result.message}`);
        }
    } catch(e) {
        showToast("خطای اتصال");
    }
};

window.placeBet = async function(pred) {
    const amount = document.getElementById('bet-amount').value;
    tg.HapticFeedback.impactOccurred('heavy'); 

    try {
        const res = await fetch(`${API_BASE_URL}/webapp/game/bet`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ 
                initData: tg.initData, 
                amount: parseFloat(amount), 
                prediction: pred 
            })
        });
        const result = await res.json();
        
        if (result.status === 'success') {
            showToast(`✅ Position Open: ${pred} $${amount}`);
            localStorage.setItem('last_bet_round_id', result.round_id || "CURRENT"); 
            localStorage.setItem('last_bet_prediction', pred);
        } else {
            showToast(`⚠️ ${result.message}`);
            SoundFX.lose();
        }
    } catch(e) { 
        showToast("Connection Error");
    }
};

function toggleButtons(disable) {
    const btns = document.querySelectorAll('.trade-btn');
    btns.forEach(b => b.disabled = disable);
}

// =========================================
// 6. تاریخچه و ابزارها
// =========================================
function updateHistoryRibbon(history) {
    const container = document.getElementById('history-container');
    container.innerHTML = '';
    history.slice().reverse().slice(0, 15).forEach(h => {
        const div = document.createElement('div');
        div.className = `hist-pill ${h.result === 'UP' ? 'up' : 'down'}`;
        container.appendChild(div);
    });
}

function checkWinLoss(history) {
    const myRoundId = localStorage.getItem('last_bet_round_id');
    const myPrediction = localStorage.getItem('last_bet_prediction');
    if (!myRoundId || !myPrediction) return;

    const round = history.find(h => String(h.round_id) === String(myRoundId)); 
    if (round) {
        localStorage.removeItem('last_bet_round_id');
        localStorage.removeItem('last_bet_prediction');
        if (round.result === myPrediction) {
            SoundFX.win();
            tg.HapticFeedback.notificationOccurred('success');
            confetti({ particleCount: 150, spread: 80, origin: { y: 0.7 } });
            showToast(`🎉 WIN! Settlement Complete.`);
        } else {
            SoundFX.lose();
            tg.HapticFeedback.notificationOccurred('error');
            showToast(`❌ Position Closed.`);
        }
    }
}

function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.innerText = msg;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 3000);
}

window.openHistory = () => document.getElementById('history-modal').classList.add('active');
window.closeHistory = () => document.getElementById('history-modal').classList.remove('active');
window.openLeaderboard = () => document.getElementById('leaderboard-modal').classList.add('active');
window.closeLeaderboard = () => document.getElementById('leaderboard-modal').classList.remove('active');