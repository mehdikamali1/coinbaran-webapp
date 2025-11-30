/* webapp/game.js (v25.0 - Final Luxury Engine) */

// --- تنظیمات سراسری ---
const tg = window.Telegram.WebApp;
const API_BASE_URL = window.location.origin;

// متغیرهای چارت
let chart;
let candleSeries;
let currentBar = null;
let lastPrice = 0;

// متغیرهای بازی
const LOCKOUT_TIME = 15; // ثانیه قفل شدن دکمه‌ها
const ROUND_DURATION = 60; // طول کل راند برای محاسبه دایره تایمر
let isChartLoaded = false;

// --- سیستم صوتی (Audio Context) ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const SoundFX = {
    tick: () => playTone(800, 'sine', 0.05),
    lock: () => playTone(400, 'sawtooth', 0.2),
    win: () => playTone(1200, 'triangle', 0.1, 2), // دو بوق خوشحال
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
    // تنظیمات تلگرام
    tg.ready();
    tg.expand();
    tg.setHeaderColor('#171B26'); // همرنگ هدر
    tg.setBackgroundColor('#171B26');
    
    // اگر خارج از تلگرام تست می‌کنید
    if (!tg.initData) tg.initData = "query_id=TEST_DEV_MODE";

    // راه‌اندازی چارت
    initChart();

    // شروع دریافت دیتا
    setInterval(fetchServerData, 1000);
    fetchServerData();

    // هندل کردن کلیک‌ها برای فیدبک لمسی
    document.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => {
            if(!btn.disabled) tg.HapticFeedback.impactOccurred('light');
        });
    });
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
            background: { type: 'solid', color: '#171B26' }, // همرنگ پس‌زمینه
            textColor: '#848E9C',
            fontFamily: "'Roboto Mono', monospace",
        },
        grid: {
            vertLines: { visible: false }, // حذف خطوط عمودی
            horzLines: { color: 'rgba(255, 255, 255, 0.03)' }, // خطوط افقی بسیار محو
        },
        rightPriceScale: {
            borderColor: 'rgba(255, 255, 255, 0.1)',
            scaleMargins: { top: 0.2, bottom: 0.2 }, // فاصله از بالا و پایین
        },
        timeScale: {
            borderColor: 'rgba(255, 255, 255, 0.1)',
            timeVisible: true,
            secondsVisible: true,
        },
        crosshair: {
            mode: LightweightCharts.CrosshairMode.Magnet, // حالت مگنت برای حس حرفه‌ای
            vertLine: { color: '#F0B90B', width: 1, style: 3, labelBackgroundColor: '#F0B90B' },
            horzLine: { color: '#F0B90B', width: 1, style: 3, labelBackgroundColor: '#F0B90B' },
        },
    });

    candleSeries = chart.addCandlestickSeries({
        upColor: '#0ECB81',
        downColor: '#F6465D',
        borderVisible: false,
        wickUpColor: '#0ECB81',
        wickDownColor: '#F6465D',
    });

    // دیتای ساختگی اولیه تا لود شدن سرور (برای خالی نبودن صفحه)
    const data = generateInitialBars();
    candleSeries.setData(data);
    currentBar = data[data.length - 1];

    // حذف لودر وقتی چارت آماده شد
    setTimeout(() => {
        document.getElementById('chart-loader').classList.add('fade-out');
        isChartLoaded = true;
    }, 1000);

    // ریسپانسیو کردن چارت با تغییر سایز پنجره
    new ResizeObserver(entries => {
        if (entries.length === 0 || entries[0].target !== container) return;
        const newRect = entries[0].contentRect;
        chart.applyOptions({ height: newRect.height, width: newRect.width });
    }).observe(container);
}

// =========================================
// 2. دریافت و پردازش دیتا از سرور
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
        // اگر سرور قطع بود، حرکت مصنوعی بده تا چارت فریز نشود
        simulateLocalMovement();
    }
}

function updateGameUI(data) {
    const serverPrice = data.current_price;
    const domPrice = document.getElementById('btc-price');

    // الف) آپدیت قیمت و رنگ (سبز/قرمز)
    if (serverPrice !== lastPrice) {
        const color = serverPrice >= lastPrice ? '#0ECB81' : '#F6465D';
        domPrice.style.color = color;
        domPrice.innerText = serverPrice.toLocaleString('en-US', {minimumFractionDigits: 2});
        
        // افکت چشمک زن زنده
        const dot = document.querySelector('.blink-dot');
        if(dot) dot.style.backgroundColor = color;
        
        lastPrice = serverPrice;
    }

    // ب) آپدیت کندل‌ها
    if (currentBar) {
        const now = Math.floor(Date.now() / 1000);
        // لاجیک ساده: هر 60 ثانیه یک کندل جدید (سمت کلاینت)
        // برای دقت صددرصد، باید تایم کندل را هم از سرور بگیرید
        if (now > currentBar.time + 60) {
            currentBar = {
                time: currentBar.time + 60,
                open: serverPrice, high: serverPrice, low: serverPrice, close: serverPrice
            };
        } else {
            currentBar.close = serverPrice;
            currentBar.high = Math.max(currentBar.high, serverPrice);
            currentBar.low = Math.min(currentBar.low, serverPrice);
        }
        candleSeries.update(currentBar);
    }

    // ج) وضعیت راند و تایمر
    if (data.round) {
        updateTimerCircle(data.round.time_left);
        updateRoundStatus(data);
    }

    // د) تاریخچه نتایج
    if (data.history) {
        updateHistoryRibbon(data.history);
        checkWinLoss(data.history);
    }
}

// =========================================
// 3. انیمیشن تایمر و وضعیت راند
// =========================================
function updateTimerCircle(timeLeft) {
    const elText = document.getElementById('timer-text');
    const elCircle = document.getElementById('timer-progress');
    const elRing = document.querySelector('.timer-progress');
    
    elText.innerText = timeLeft;

    // محاسبه دایره SVG (محیط = 283)
    const maxDash = 283;
    const offset = maxDash - (timeLeft / ROUND_DURATION) * maxDash;
    elCircle.style.strokeDashoffset = offset;

    // تغییر رنگ بر اساس زمان
    if (timeLeft <= 5) {
        elRing.style.stroke = '#F6465D'; // قرمز در 5 ثانیه آخر
        elText.style.color = '#F6465D';
        
        // صدای تیک تاک در ثانیه‌های آخر
        if (!window[`tick_${timeLeft}`]) {
            SoundFX.tick();
            tg.HapticFeedback.impactOccurred('soft');
            window[`tick_${timeLeft}`] = true;
        }
    } else {
        elRing.style.stroke = '#F0B90B'; // طلایی عادی
        elText.style.color = '#EAECEF';
        // ریست کردن فلگ صدا برای راند بعدی
        window[`tick_5`] = false; 
        window[`tick_4`] = false; 
        window[`tick_3`] = false; 
        window[`tick_2`] = false; 
        window[`tick_1`] = false; 
    }
}

function updateRoundStatus(data) {
    const elStatus = document.getElementById('round-status');
    const elRoundId = document.getElementById('round-id');
    const timeLeft = data.round.time_left;

    elRoundId.innerText = `ROUND #${data.round.id}`;

    const isLocked = timeLeft <= LOCKOUT_TIME;
    const hasBet = !!data.user_bet;

    // متن وضعیت
    if (hasBet) {
        const type = data.user_bet.prediction === 'UP' ? 'LONG (BUY)' : 'SHORT (SELL)';
        elStatus.innerHTML = `<span style="color:#3B82F6">POSITION: ${type}</span>`;
    } else if (isLocked) {
        elStatus.innerHTML = `<span style="color:#F6465D">LOCKED 🔒</span>`;
    } else {
        elStatus.innerHTML = `<span style="color:#0ECB81">OPEN FOR BET 🟢</span>`;
    }

    // قفل کردن دکمه‌ها
    toggleButtons(isLocked || hasBet);
}

// =========================================
// 4. لاجیک شرط‌بندی و دکمه‌ها
// =========================================
window.setAmount = function(val) {
    document.getElementById('bet-amount').value = val;
    
    // آپدیت کلاس Active چیپ‌ها
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    // پیدا کردن چیپی که کلیک شده (اگر با کلیک بوده)
    const chips = document.querySelectorAll('.chip');
    chips.forEach(c => {
        if(c.innerText == val) c.classList.add('active');
    });

    tg.HapticFeedback.selectionChanged();
};

window.placeBet = async function(pred) {
    const amount = document.getElementById('bet-amount').value;
    
    // ویبره سنگین برای حس ثبت سفارش
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
            showToast(`✅ Order Confirmed: ${pred} $${amount}`);
            // ذخیره برای چک کردن نتیجه در آینده
            localStorage.setItem('last_bet_round_id', result.round_id || "CURRENT"); 
            localStorage.setItem('last_bet_prediction', pred);
        } else {
            showToast(`⚠️ ${result.message}`);
            SoundFX.lose(); // صدای خطا
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
// 5. تاریخچه و نتایج
// =========================================
function updateHistoryRibbon(history) {
    const container = document.getElementById('history-container');
    container.innerHTML = ''; // پاک کردن قبلی‌ها
    
    // نمایش 15 مورد آخر
    history.slice().reverse().slice(0, 15).forEach(h => {
        const div = document.createElement('div');
        div.className = `hist-pill ${h.result === 'UP' ? 'up' : 'down'}`;
        // اگر این همان راندی است که کاربر برده، کلاس win اضافه کن
        container.appendChild(div);
    });
}

function checkWinLoss(history) {
    const myRoundId = localStorage.getItem('last_bet_round_id'); // اینجا باید آیدی واقعی از سرور بیاد
    const myPrediction = localStorage.getItem('last_bet_prediction');
    
    if (!myRoundId || !myPrediction) return;

    // پیدا کردن راند در تاریخچه
    // نکته: چون در نسخه فعلی بک‌ند شاید round_id دقیق در ریسپانس bet نباشد، 
    // بهتر است آخرین آیتم تاریخچه را چک کنیم اگر تازه اضافه شده.
    // اما اینجا فرض می‌کنیم لاجیک سرور round_id دارد.
    
    const round = history.find(h => String(h.round_id) === String(myRoundId)); 
    // اگر آیدی نداشتید، می‌توانید آخرین نتیجه را چک کنید (با احتیاط)

    if (round) {
        localStorage.removeItem('last_bet_round_id');
        localStorage.removeItem('last_bet_prediction');

        if (round.result === myPrediction) {
            SoundFX.win();
            tg.HapticFeedback.notificationOccurred('success');
            confetti({ particleCount: 150, spread: 80, origin: { y: 0.7 } });
            showToast(`🎉 WIN! Payout Received.`);
        } else {
            SoundFX.lose();
            tg.HapticFeedback.notificationOccurred('error');
            showToast(`❌ Position Liquidated.`);
        }
    }
}

// =========================================
// 6. ابزارهای کمکی (Helpers)
// =========================================
function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.innerText = msg;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 3000);
}

function simulateLocalMovement() {
    if (!currentBar) return;
    const move = (Math.random() - 0.5) * 20; // نوسان رندوم
    const newPrice = currentBar.close + move;
    
    const domPrice = document.getElementById('btc-price');
    domPrice.innerText = newPrice.toFixed(2);
    
    currentBar.close = newPrice;
    currentBar.high = Math.max(currentBar.high, newPrice);
    currentBar.low = Math.min(currentBar.low, newPrice);
    candleSeries.update(currentBar);
}

function generateInitialBars() {
    const initialPrice = 96500;
    let price = initialPrice;
    const res = [];
    const timeNow = Math.floor(Date.now() / 1000);
    // ساخت 50 کندل گذشته برای پر بودن چارت
    for (let i = 50; i > 0; i--) {
        const open = price;
        const close = open + (Math.random() - 0.5) * 50;
        const high = Math.max(open, close) + Math.random() * 10;
        const low = Math.min(open, close) - Math.random() * 10;
        res.push({ time: timeNow - (i * 60), open, high, low, close });
        price = close;
    }
    return res;
}

// مودال‌ها
window.openHistory = () => document.getElementById('history-modal').classList.add('active');
window.closeHistory = () => document.getElementById('history-modal').classList.remove('active');
window.openLeaderboard = () => document.getElementById('leaderboard-modal').classList.add('active');
window.closeLeaderboard = () => document.getElementById('leaderboard-modal').classList.remove('active');