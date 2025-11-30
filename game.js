/* webapp/game.js (v33.0 - Final Logic with Auto-Format & Result Modal) */

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
const EST_USDT_RATE = 90000; // نرخ تقریبی برای نمایش در کلاینت

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
    
    // دریافت دیتای زنده
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

    // --- لاجیک فرمت 3 رقم (50,000) ---
    const swapInput = document.getElementById('swap-input-toman');
    if(swapInput) {
        swapInput.addEventListener('input', function(e) {
            // 1. حذف کاماها برای محاسبه
            let rawValue = e.target.value.replace(/,/g, '');
            // 2. حذف کاراکترهای غیر عددی
            if(!/^\d*$/.test(rawValue)) { rawValue = rawValue.replace(/\D/g, ''); }
            
            // 3. فرمت کردن (اضافه کردن کاما)
            if (rawValue) {
                e.target.value = parseInt(rawValue).toLocaleString('en-US');
            } else {
                e.target.value = '';
            }
            
            // 4. محاسبه دلاری
            const tomans = parseFloat(rawValue) || 0;
            const usd = tomans / EST_USDT_RATE;
            document.getElementById('swap-calc-usd').innerText = usd.toFixed(2);
        });
    }
};

// =========================================
// 1. تنظیمات چارت (Area Chart - Mobile Optimized)
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
// 2. دریافت دیتا و آپدیت
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
    const domPrice = document.getElementById('btc-price');

    // [NEW] آپدیت موجودی کاربر در هدر
    if (data.user_balance !== undefined) {
        document.getElementById('user-balance-display').innerText = data.user_balance.toLocaleString('en-US', {minimumFractionDigits: 2});
    }

    // لود اولیه بدون گپ
    if (isFirstLoad && serverPrice > 0) {
        const historyData = generateHistoryFromRealPrice(serverPrice);
        areaSeries.setData(historyData);
        lastTime = Math.floor(Date.now() / 1000);
        areaSeries.update({ time: lastTime, value: serverPrice });
        chart.timeScale().fitContent(); 
        document.getElementById('chart-loader').classList.add('fade-out');
        isFirstLoad = false;
        lastPrice = serverPrice;
    }

    // تغییر رنگ بر اساس قیمت
    if (serverPrice !== lastPrice) {
        const isUp = serverPrice >= lastPrice;
        const color = isUp ? '#0ECB81' : '#F6465D';
        
        domPrice.style.color = color;
        domPrice.innerText = serverPrice.toLocaleString('en-US', {minimumFractionDigits: 2});
        
        document.querySelector('.blink-dot').style.backgroundColor = color;
        
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

    // لاجیک بازی
    if (data.round) {
        updateTimerCircle(data.round.time_left);
        updateRoundStatus(data);
    }
    if (data.history) {
        updateHistoryRibbon(data.history);
        checkWinLoss(data.history); // بررسی نتیجه
    }
}

function simulateSmoothLocalMovement() {
    if (isFirstLoad) return;
    const move = (Math.random() - 0.5) * 1.5;
    const newPrice = lastPrice + move;
    
    document.getElementById('btc-price').innerText = newPrice.toFixed(2);
    
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
// 3. تایمر و وضعیت راند
// =========================================
function updateTimerCircle(timeLeft) {
    const elText = document.getElementById('timer-text');
    const elCircle = document.getElementById('timer-progress');
    const elRing = document.querySelector('.timer-progress');
    
    elText.innerText = timeLeft;
    const offset = 283 - (timeLeft / ROUND_DURATION) * 283;
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
// 4. لاجیک شرط‌بندی و تبدیل (Swap)
// =========================================
window.setAmount = function(val) {
    document.getElementById('bet-amount').value = val;
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    const chips = Array.from(document.querySelectorAll('.chip'));
    const targetChip = chips.find(c => c.innerText.trim() === String(val));
    if(targetChip) targetChip.classList.add('active');
    tg.HapticFeedback.selectionChanged();
};

window.openSwapModal = () => document.getElementById('swap-modal').classList.add('active');
window.closeSwapModal = () => document.getElementById('swap-modal').classList.remove('active');
window.closeResultModal = () => document.getElementById('result-modal').classList.remove('active');

window.performSwap = async function() {
    // خواندن مقدار (حذف کاماها قبل از ارسال)
    const rawVal = document.getElementById('swap-input-toman').value.replace(/,/g, '');
    const amountToman = parseFloat(rawVal);
    
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
            // ذخیره برای بررسی نتیجه
            localStorage.setItem('last_bet_round_id', result.round_id || "CURRENT"); 
            localStorage.setItem('last_bet_prediction', pred);
            localStorage.setItem('last_bet_amount', amount);
        } else {
            showToast(`⚠️ ${result.message}`);
            SoundFX.lose();
        }
    } catch(e) { 
        showToast("Connection Error");
    }
};

// =========================================
// 5. تشخیص برد/باخت (Result Logic)
// =========================================
function checkWinLoss(history) {
    const myRoundId = localStorage.getItem('last_bet_round_id');
    const myPrediction = localStorage.getItem('last_bet_prediction');
    
    if (!myRoundId || !myPrediction) return;

    // پیدا کردن راند در تاریخچه
    // نکته: چون آیدی سرور ممکن است کمی تاخیر داشته باشد، آخرین مورد را هم چک میکنیم
    const round = history.find(h => String(h.round_id) === String(myRoundId)) || history[history.length - 1]; 

    // اگر نتیجه این راند مشخص شده است
    if (round && round.result) {
        // برای جلوگیری از نمایش تکراری
        const processedKey = 'processed_' + round.round_id;
        if (localStorage.getItem(processedKey)) return;
        
        // مارک کردن به عنوان پردازش شده
        localStorage.setItem(processedKey, 'true');
        
        // پاک کردن وضعیت شرط فعلی
        localStorage.removeItem('last_bet_round_id');
        localStorage.removeItem('last_bet_prediction');
        
        const amount = parseFloat(localStorage.getItem('last_bet_amount') || 0);
        const elModal = document.getElementById('result-modal');
        const elTitle = document.getElementById('res-title');
        const elAmount = document.getElementById('res-amount');
        const elIcon = document.getElementById('res-icon');
        const elMsg = document.getElementById('res-message');

        if (round.result === myPrediction) {
            // --- حالت برد ---
            SoundFX.win();
            tg.HapticFeedback.notificationOccurred('success');
            confetti({ particleCount: 200, spread: 100, origin: { y: 0.6 } });
            
            elTitle.innerText = "YOU WON!";
            elTitle.style.color = "#0ECB81"; // سبز
            elAmount.className = "res-amount res-win";
            elAmount.innerText = `+$${(amount * 1.95).toFixed(2)}`;
            elIcon.innerText = "🏆";
            elMsg.innerText = `Price moved ${round.result}. Great job!`;
            
            elModal.classList.add('active');
        } else {
            // --- حالت باخت ---
            SoundFX.lose();
            tg.HapticFeedback.notificationOccurred('error');
            
            elTitle.innerText = "LIQUIDATED";
            elTitle.style.color = "#F6465D"; // قرمز
            elAmount.className = "res-amount res-loss";
            elAmount.innerText = `-$${amount.toFixed(2)}`;
            elIcon.innerText = "📉";
            elMsg.innerText = `Market went against you. Try again!`;
            
            elModal.classList.add('active');
        }
    }
}

// ابزارها
function toggleButtons(disable) {
    const btns = document.querySelectorAll('.trade-btn');
    btns.forEach(b => b.disabled = disable);
}

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
    toast.innerText = msg;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 3000);
}

window.openHistory = () => document.getElementById('history-modal').classList.add('active');
window.closeHistory = () => document.getElementById('history-modal').classList.remove('active');
window.openLeaderboard = () => document.getElementById('leaderboard-modal').classList.add('active');
window.closeLeaderboard = () => document.getElementById('leaderboard-modal').classList.remove('active');