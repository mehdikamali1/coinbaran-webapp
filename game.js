/* webapp/game.js (v27.0 - Gap-Free Pro Chart) */

// --- تنظیمات سراسری ---
const tg = window.Telegram.WebApp;
const API_BASE_URL = window.location.origin;

// متغیرهای چارت
let chart;
let candleSeries;
let currentBar = null;
let lastPrice = 0;
let isFirstLoad = true; // فلگ مهم برای جلوگیری از گپ قیمت

// متغیرهای بازی
const LOCKOUT_TIME = 15;
const ROUND_DURATION = 60;

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
    
    // دریافت دیتا
    setInterval(fetchServerData, 1000);
    fetchServerData();

    // فیدبک دکمه‌ها
    document.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => {
            if(!btn.disabled) tg.HapticFeedback.impactOccurred('light');
        });
    });
};

// =========================================
// 1. تنظیمات چارت (بدون دیتای اولیه)
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
        grid: {
            vertLines: { visible: false },
            horzLines: { color: 'rgba(255, 255, 255, 0.02)', style: 1 },
        },
        rightPriceScale: {
            borderColor: 'rgba(255, 255, 255, 0.08)',
            scaleMargins: { top: 0.25, bottom: 0.25 },
        },
        timeScale: {
            borderColor: 'rgba(255, 255, 255, 0.08)',
            timeVisible: true,
            secondsVisible: true,
            rightOffset: 10,
        },
        crosshair: {
            mode: LightweightCharts.CrosshairMode.Normal,
            vertLine: { color: '#F0B90B', width: 1, style: 3, labelBackgroundColor: '#171B26' },
            horzLine: { color: '#F0B90B', width: 1, style: 3, labelBackgroundColor: '#171B26' },
        },
    });

    candleSeries = chart.addCandlestickSeries({
        upColor: '#171B26',           // بدنه توخالی (Professional Style)
        downColor: '#F6465D',         
        borderUpColor: '#0ECB81',     
        borderDownColor: '#F6465D',   
        wickUpColor: '#0ECB81',       
        wickDownColor: '#F6465D',     
    });

    // ریسپانسیو
    new ResizeObserver(entries => {
        if (entries.length === 0 || entries[0].target !== container) return;
        const newRect = entries[0].contentRect;
        chart.applyOptions({ height: newRect.height, width: newRect.width });
    }).observe(container);
}

// =========================================
// 2. تولید تاریخچه هوشمند (Smart Backfill)
// =========================================
function generateHistoryFromRealPrice(realPrice) {
    const res = [];
    let currentPrice = realPrice;
    const timeNow = Math.floor(Date.now() / 1000);
    
    // ما از قیمت واقعی شروع می‌کنیم و به عقب برمی‌گردیم
    // تا مطمئن شویم آخرین کندل دقیقاً به قیمت واقعی ختم می‌شود
    for (let i = 1; i <= 60; i++) {
        const volatility = 5; // نوسان معقول
        const move = (Math.random() - 0.5) * volatility * 2;
        
        const close = currentPrice;
        const open = currentPrice - move; // برعکس محاسبه می‌کنیم
        
        // محاسبه High/Low
        const high = Math.max(open, close) + Math.random() * 2;
        const low = Math.min(open, close) - Math.random() * 2;
        
        res.push({
            time: timeNow - (i * 60),
            open: open,
            high: high,
            low: low,
            close: close
        });
        
        currentPrice = open; // قیمت شروع کندل قبلی می‌شود قیمت پایان کندل ماقبل آن
    }
    
    return res.reverse(); // آرایه را معکوس می‌کنیم تا زمانی درست شود
}

// =========================================
// 3. ارتباط با سرور
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
        // اگر هنوز دیتای اول لود نشده، شبیه‌سازی نکن تا چارت خراب نشود
        if (!isFirstLoad) simulateSmoothLocalMovement();
    }
}

function updateGameUI(data) {
    const serverPrice = data.current_price;
    const domPrice = document.getElementById('btc-price');

    // --- مدیریت اولین لود (جلوگیری از گپ) ---
    if (isFirstLoad && serverPrice > 0) {
        const historyData = generateHistoryFromRealPrice(serverPrice);
        candleSeries.setData(historyData);
        
        // تنظیم آخرین بار
        currentBar = {
            time: Math.floor(Date.now() / 1000),
            open: serverPrice, high: serverPrice, low: serverPrice, close: serverPrice
        };
        candleSeries.update(currentBar);
        
        // حذف لودر
        const loader = document.getElementById('chart-loader');
        if(loader) loader.classList.add('fade-out');
        
        isFirstLoad = false;
        lastPrice = serverPrice;
    }
    // ------------------------------------------

    // آپدیت قیمت
    if (serverPrice !== lastPrice) {
        const color = serverPrice >= lastPrice ? '#0ECB81' : '#F6465D';
        domPrice.style.color = color;
        domPrice.innerText = serverPrice.toLocaleString('en-US', {minimumFractionDigits: 2});
        
        const dot = document.querySelector('.blink-dot');
        if(dot) dot.style.backgroundColor = color;
        
        lastPrice = serverPrice;
    }

    // آپدیت کندل جاری
    if (currentBar && !isFirstLoad) {
        const now = Math.floor(Date.now() / 1000);
        
        // اگر بیشتر از 60 ثانیه گذشته، کندل جدید بساز
        if (now > currentBar.time + 60) {
            currentBar = {
                time: currentBar.time + 60,
                open: currentBar.close, // شروع از بسته شدن قبلی
                high: serverPrice,
                low: serverPrice,
                close: serverPrice
            };
        } else {
            currentBar.close = serverPrice;
            currentBar.high = Math.max(currentBar.high, serverPrice);
            currentBar.low = Math.min(currentBar.low, serverPrice);
        }
        candleSeries.update(currentBar);
    }

    // سایر آپدیت‌ها
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
    if (!currentBar) return;
    const move = (Math.random() - 0.5) * 2; // نوسان ریز
    const newPrice = currentBar.close + move;
    
    const domPrice = document.getElementById('btc-price');
    domPrice.innerText = newPrice.toFixed(2);
    
    currentBar.close = newPrice;
    currentBar.high = Math.max(currentBar.high, newPrice);
    currentBar.low = Math.min(currentBar.low, newPrice);
    candleSeries.update(currentBar);
}

// =========================================
// 4. انیمیشن تایمر و وضعیت
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
// 5. هندلینگ شرط‌ها
// =========================================
window.setAmount = function(val) {
    document.getElementById('bet-amount').value = val;
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    const chips = Array.from(document.querySelectorAll('.chip'));
    const targetChip = chips.find(c => c.innerText.trim() === String(val));
    if(targetChip) targetChip.classList.add('active');
    tg.HapticFeedback.selectionChanged();
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
// 6. تاریخچه و مودال‌ها
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