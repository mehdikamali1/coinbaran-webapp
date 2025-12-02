/* webapp/game.js (v70.0 - Ultimate Interaction Logic) */

const tg = window.Telegram.WebApp;
const API_BASE_URL = window.location.origin;

// تنظیمات سراسری
const CONFIG = {
    ROUND_DURATION: 60,
    EST_USDT_RATE: 90000, // نرخ تقریبی برای محاسبه سریع
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

// متغیرهای وضعیت
let chart, areaSeries;
let lastPrice = 0;
let isFirstLoad = true;
let lastTime = 0;
let connectionLostTimeout;

// --- سیستم صوتی سینتی‌سایزر (بدون فایل) ---
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
    success: () => {
        SoundFX.playTone(600, 'sine', 0.1, 0.1);
        setTimeout(() => SoundFX.playTone(1200, 'sine', 0.2, 0.1), 100);
    },
    win: () => {
        const now = audioCtx.currentTime;
        [523.25, 659.25, 783.99, 1046.50].forEach((f, i) => {
            setTimeout(() => SoundFX.playTone(f, 'triangle', 0.3, 0.1), i * 80);
        });
    },
    lose: () => {
        setTimeout(() => SoundFX.playTone(300, 'sawtooth', 0.3, 0.1), 0);
        setTimeout(() => SoundFX.playTone(200, 'sawtooth', 0.4, 0.1), 200);
    }
};

// --- شروع برنامه ---
window.onload = function() {
    tg.ready();
    tg.expand();
    // بستن برنامه هنگام کشیدن به پایین را غیرفعال می‌کنیم تا تجربه اپلیکیشن واقعی بدهد
    tg.enableClosingConfirmation(); 
    
    // تنظیم رنگ هدر تلگرام با تم ما
    tg.setHeaderColor('#050505'); 
    tg.setBackgroundColor('#050505');
    
    if (!tg.initData) tg.initData = "query_id=TEST_DEV_MODE";

    initChart();
    setupEventListeners();
    
    // شروع لوپ دریافت دیتا
    fetchServerData();
    setInterval(fetchServerData, 1000);
};

// =========================================
// 1. تنظیمات چارت (Lightweight Charts)
// =========================================
function initChart() {
    const container = document.getElementById('tv-chart-container');
    
    chart = LightweightCharts.createChart(container, {
        width: container.clientWidth,
        height: container.clientHeight,
        layout: { 
            background: { type: 'solid', color: CONFIG.CHART_COLORS.bg }, 
            textColor: CONFIG.CHART_COLORS.text, 
            fontFamily: "'Roboto Mono', monospace" 
        },
        grid: { 
            vertLines: { visible: false }, 
            horzLines: { visible: false } 
        },
        rightPriceScale: { 
            borderColor: 'transparent', 
            visible: true, 
            scaleMargins: { top: 0.2, bottom: 0.1 } 
        },
        timeScale: { 
            borderColor: 'transparent', 
            timeVisible: true, 
            secondsVisible: true, 
            rightOffset: 2, 
            fixLeftEdge: true 
        },
        crosshair: { 
            vertLine: { width: 1, color: 'rgba(255, 255, 255, 0.1)', style: 3, labelBackgroundColor: '#171B26' }, 
            horzLine: { width: 1, color: 'rgba(255, 255, 255, 0.1)', style: 3, labelBackgroundColor: '#171B26' } 
        },
        handleScroll: { mouseWheel: false, pressedMouseMove: true },
        handleScale: { axisPressedMouseMove: false, mouseWheel: false, pinch: false },
    });

    areaSeries = chart.addAreaSeries({ 
        topColor: CONFIG.CHART_COLORS.areaTopUp, 
        bottomColor: CONFIG.CHART_COLORS.areaBottomUp, 
        lineColor: CONFIG.CHART_COLORS.up, 
        lineWidth: 2, 
        crosshairMarkerVisible: true, 
        crosshairMarkerRadius: 5 
    });

    // ریسپانسیو بودن چارت
    new ResizeObserver(entries => {
        if (entries.length === 0 || entries[0].target !== container) return;
        const newRect = entries[0].contentRect;
        chart.applyOptions({ height: newRect.height, width: newRect.width });
        chart.timeScale().fitContent();
    }).observe(container);
}

// =========================================
// 2. هسته مرکزی دیتا (Data Loop)
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
            setConnectionStatus(true);
        } else {
            setConnectionStatus(false);
        }
    } catch (e) {
        setConnectionStatus(false);
        // اگر دیتا نیامد، حرکت نرم مصنوعی ایجاد کن تا چارت خشک نشود
        if (!isFirstLoad) simulateSmoothLocalMovement();
    }
}

function setConnectionStatus(isConnected) {
    const el = document.getElementById('connection-status');
    const dot = el.querySelector('.status-dot');
    const txt = el.querySelector('.status-text');
    
    if (isConnected) {
        el.style.borderColor = 'rgba(14, 203, 129, 0.2)';
        el.style.background = 'rgba(14, 203, 129, 0.1)';
        dot.style.background = '#0ECB81';
        txt.style.color = '#0ECB81';
        txt.innerText = 'LIVE';
    } else {
        el.style.borderColor = 'rgba(246, 70, 93, 0.2)';
        el.style.background = 'rgba(246, 70, 93, 0.1)';
        dot.style.background = '#F6465D';
        txt.style.color = '#F6465D';
        txt.innerText = 'CONNECTING';
    }
}

function updateGameUI(data) {
    const serverPrice = data.current_price;
    
    // 1. موجودی
    if (data.user_balance !== undefined) {
        document.getElementById('user-balance-display').innerText = data.user_balance.toLocaleString('en-US', {minimumFractionDigits: 2});
    }

    // 2. وضعیت شرط کاربر
    const elEntry = document.getElementById('entry-display');
    if (data.user_bet && data.user_bet.entry_price) {
        elEntry.classList.remove('hidden');
        const isUp = data.user_bet.prediction === 'UP';
        const color = isUp ? CONFIG.CHART_COLORS.up : CONFIG.CHART_COLORS.down;
        const icon = isUp ? '▲' : '▼';
        elEntry.innerHTML = `
            <span style="color:${color}; font-weight:bold; margin-right:5px;">${icon} ${data.user_bet.prediction}</span> 
            <span class="mono-font">$${data.user_bet.entry_price.toLocaleString()}</span>
        `;
    } else {
        elEntry.classList.add('hidden');
    }

    // 3. نمایش نتیجه (Win/Loss)
    if (data.last_result) {
        showResultModal(data.last_result);
    }

    // 4. آپدیت چارت
    updateChartData(serverPrice);

    // 5. تایمر و وضعیت راند
    if (data.round) {
        updateTimerVisuals(data.round.time_left);
        document.getElementById('round-id').innerText = `#${data.round.id}`;
        
        // غیرفعال کردن دکمه‌ها در 10 ثانیه آخر یا اگر شرط داریم
        const isLocked = data.round.time_left <= 10;
        const hasBet = !!data.user_bet;
        toggleTradeButtons(isLocked || hasBet);
    }

    // 6. تاریخچه
    if (data.history) {
        updateHistoryRibbon(data.history);
    }
}

function updateChartData(serverPrice) {
    const domPrice = document.getElementById('btc-price');
    
    // بارگذاری اولیه (ساختن دیتای فیک قبل از قیمت فعلی برای زیبایی)
    if (isFirstLoad && serverPrice > 0) {
        const historyData = [];
        let tempPrice = serverPrice;
        const timeNow = Math.floor(Date.now() / 1000);
        for (let i = 60; i > 0; i--) {
            tempPrice = tempPrice + (Math.random() - 0.5) * 5;
            historyData.push({ time: timeNow - i, value: tempPrice });
        }
        // sort ascending time
        historyData.sort((a,b) => a.time - b.time);
        
        areaSeries.setData(historyData);
        lastTime = timeNow;
        areaSeries.update({ time: lastTime, value: serverPrice });
        
        document.getElementById('chart-loader').classList.add('fade-out');
        isFirstLoad = false;
        lastPrice = serverPrice;
    }

    // آپدیت زنده
    if (serverPrice !== lastPrice) {
        const isUp = serverPrice >= lastPrice;
        const color = isUp ? CONFIG.CHART_COLORS.up : CONFIG.CHART_COLORS.down;
        
        // تغییر رنگ قیمت اصلی
        domPrice.style.color = color;
        domPrice.innerText = serverPrice.toLocaleString('en-US', {minimumFractionDigits: 2});
        
        // تغییر رنگ چارت متناسب با روند
        areaSeries.applyOptions({ 
            lineColor: color, 
            topColor: isUp ? CONFIG.CHART_COLORS.areaTopUp : CONFIG.CHART_COLORS.areaTopDown, 
            bottomColor: isUp ? CONFIG.CHART_COLORS.areaBottomUp : CONFIG.CHART_COLORS.areaBottomDown,
            crosshairMarkerBackgroundColor: color 
        });
        
        lastPrice = serverPrice;
    }

    // اضافه کردن نقطه جدید به چارت
    if (!isFirstLoad) {
        const now = Math.floor(Date.now() / 1000);
        if (now > lastTime) { 
            lastTime = now; 
            areaSeries.update({ time: now, value: serverPrice }); 
        } else { 
            areaSeries.update({ time: lastTime, value: serverPrice }); 
        }
    }
}

function simulateSmoothLocalMovement() {
    if (isFirstLoad) return;
    const move = (Math.random() - 0.5) * 2;
    const newPrice = lastPrice + move;
    document.getElementById('btc-price').innerText = newPrice.toFixed(2);
    // آپدیت چارت انجام نمی‌شود تا دیتای غلط وارد هیستوری نشود، فقط عدد نمایش تغییر می‌کند
}

// =========================================
// 3. جلوه‌های بصری و تایمر
// =========================================
function updateTimerVisuals(timeLeft) {
    const elText = document.getElementById('timer-text');
    const elCircle = document.getElementById('timer-progress');
    
    elText.innerText = timeLeft;
    
    // محاسبه دایره ( محیط دایره r=45 برابر است با حدود 283)
    const offset = 283 - (timeLeft / CONFIG.ROUND_DURATION) * 283;
    elCircle.style.strokeDashoffset = offset;
    
    // تغییر رنگ در 5 ثانیه آخر
    if (timeLeft <= 5) {
        elCircle.style.stroke = CONFIG.CHART_COLORS.down;
        elText.style.color = CONFIG.CHART_COLORS.down;
        
        // صدای تیک تاک
        if (!window[`tick_${timeLeft}`]) { 
            SoundFX.tick(); 
            tg.HapticFeedback.impactOccurred('soft'); 
            window[`tick_${timeLeft}`] = true; 
        }
    } else {
        elCircle.style.stroke = CONFIG.PRIMARY_GOLD || '#F0B90B';
        elText.style.color = CONFIG.CHART_COLORS.text;
        // ریست کردن فلگ صدا
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
    container.innerHTML = ''; // پاک کردن قبلی‌ها
    
    // نمایش 15 تا آخر
    history.slice().reverse().slice(0, 15).forEach(h => {
        const div = document.createElement('div');
        const isUp = h.result === 'UP';
        div.className = `hist-pill ${isUp ? 'up' : 'down'}`;
        // اگر لازم بود تولتیپ اضافه شود، اینجا می‌توان title گذاشت
        container.appendChild(div);
    });
}

// =========================================
// 4. تعاملات کاربر (دکمه‌ها و مودال‌ها)
// =========================================
function setupEventListeners() {
    // افکت کلیک روی دکمه‌ها
    document.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => {
            if(!btn.disabled) {
                SoundFX.click();
                tg.HapticFeedback.impactOccurred('light');
            }
        });
    });

    // اینپوت تبدیل
    const swapInput = document.getElementById('swap-input-toman');
    if(swapInput) {
        swapInput.addEventListener('input', function(e) {
            let val = e.target.value.replace(/,/g, '').replace(/\D/g, '');
            if (val) {
                e.target.value = parseInt(val).toLocaleString('en-US');
                const usd = parseFloat(val) / CONFIG.EST_USDT_RATE;
                document.getElementById('swap-calc-usd').innerText = usd.toFixed(2) + ' USD';
            } else {
                e.target.value = '';
                document.getElementById('swap-calc-usd').innerText = '0.00 USD';
            }
        });
    }
}

// انتخاب مبلغ شرط
window.setAmount = function(val) {
    document.getElementById('bet-amount').value = val;
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    // پیدا کردن چیپ مربوطه
    Array.from(document.querySelectorAll('.chip')).forEach(c => {
        if (c.innerText.includes(val)) c.classList.add('active');
    });
    tg.HapticFeedback.selectionChanged();
};

// ثبت شرط
window.placeBet = async function(prediction) {
    const amount = document.getElementById('bet-amount').value;
    if (!amount || amount <= 0) return showToast('Please enter amount');
    
    tg.HapticFeedback.impactOccurred('heavy'); 
    
    try {
        const res = await fetch(`${API_BASE_URL}/webapp/game/bet`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ 
                initData: tg.initData, 
                amount: parseFloat(amount), 
                prediction: prediction 
            })
        });
        const result = await res.json();
        
        if (result.status === 'success') {
            SoundFX.success();
            showToast(`✅ ${prediction} Order Placed`);
        } else {
            showToast(`⚠️ ${result.message}`);
            SoundFX.lose(); // صدای خطا
        }
    } catch(e) {
        showToast("Connection Error");
    }
};

// تبدیل موجودی
window.performSwap = async function() {
    const rawVal = document.getElementById('swap-input-toman').value.replace(/,/g, '');
    const amount = parseFloat(rawVal);
    
    if (!amount || amount < 50000) { showToast("⚠️ Min: 50,000 Toman"); return; }
    
    tg.HapticFeedback.impactOccurred('medium');
    
    try {
        const res = await fetch(`${API_BASE_URL}/webapp/game/swap-to-usd`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ initData: tg.initData, amount_toman: amount })
        });
        const result = await res.json();
        if (result.status === 'success') {
            showToast("✅ Deposit Successful");
            window.closeSwapModal();
            SoundFX.success();
        } else {
            showToast(`❌ ${result.message}`);
        }
    } catch(e) { showToast("Network Error"); }
};

// =========================================
// 5. مدیریت مودال‌ها و پیام‌ها
// =========================================
window.openSwapModal = () => document.getElementById('swap-modal').classList.add('active');
window.closeSwapModal = () => document.getElementById('swap-modal').classList.remove('active');

window.openHistory = () => document.getElementById('history-modal').classList.add('active');
window.closeHistory = () => document.getElementById('history-modal').classList.remove('active');

window.openLeaderboard = () => document.getElementById('leaderboard-modal').classList.add('active');
window.closeLeaderboard = () => document.getElementById('leaderboard-modal').classList.remove('active');

// مودال نتیجه (مهمترین بخش)
function showResultModal(result) {
    const elModal = document.getElementById('result-modal');
    const elTitle = document.getElementById('res-title');
    const elAmount = document.getElementById('res-amount');
    const elIcon = document.getElementById('res-icon');
    const elMsg = document.getElementById('res-message');
    
    // پر کردن مقادیر
    document.getElementById('res-entry').innerText = `$${result.entry_price.toFixed(2)}`;
    document.getElementById('res-close').innerText = `$${result.close_price.toFixed(2)}`;

    if (result.status === 'WIN') {
        SoundFX.win();
        tg.HapticFeedback.notificationOccurred('success');
        
        // آتش بازی (Confetti)
        confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 }, zIndex: 3000 });
        
        elTitle.innerText = "YOU WON!";
        elTitle.style.color = CONFIG.CHART_COLORS.up;
        elAmount.className = "res-amount res-win";
        elAmount.innerText = `+$${result.profit.toFixed(2)}`;
        elIcon.innerText = "🏆";
        elMsg.innerText = "Target hit successfully.";
    } else {
        SoundFX.lose();
        tg.HapticFeedback.notificationOccurred('error');
        
        elTitle.innerText = "LIQUIDATED";
        elTitle.style.color = CONFIG.CHART_COLORS.down;
        elAmount.className = "res-amount res-loss";
        elAmount.innerText = `-$${Math.abs(result.profit).toFixed(2)}`;
        elIcon.innerText = "📉";
        elMsg.innerText = "Market went against you.";
    }
    
    elModal.classList.add('active');
}
window.closeResultModal = () => document.getElementById('result-modal').classList.remove('active');

function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.querySelector('.toast-message').innerText = msg;
    toast.classList.remove('hidden');
    
    // ویبره ریز برای نوتیف
    tg.HapticFeedback.impactOccurred('light');
    
    setTimeout(() => {
        toast.classList.add('hidden');
    }, 3000);
}