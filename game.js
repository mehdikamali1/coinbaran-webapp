/* webapp/game.js (v23.0 - Full Features: Chart + Audio + History) */

const tg = window.Telegram.WebApp;
const API_BASE_URL = window.location.origin;

// --- متغیرهای سراسری چارت و بازی ---
let chart;
let candleSeries;
let currentBar = null; // آخرین کندل برای آپدیت زنده
const LOCKOUT_TIME = 15; // زمان قفل شدن شرط‌بندی

// --- سیستم صوتی پیشرفته (Web Audio API) ---
const AudioContext = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;

// راه‌اندازی سیستم صوتی (باید با تعامل کاربر باشد)
function initAudio() {
    if (!audioCtx) {
        audioCtx = new AudioContext();
        // پخش یک صدای بی‌صدا برای آنلاک کردن موتور صوتی مرورگر
        const buffer = audioCtx.createBuffer(1, 1, 22050);
        const source = audioCtx.createBufferSource();
        source.buffer = buffer;
        source.connect(audioCtx.destination);
        source.start(0);
    } else if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

// لیسنر برای اولین کلیک جهت فعال‌سازی صدا
document.addEventListener('click', initAudio, { once: true });
document.addEventListener('touchstart', initAudio, { once: true });

const SoundFX = {
    // تابع تولید فرکانس
    playTone: (freq, type, duration, startTime = 0) => {
        if (!audioCtx) return;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type;
        osc.frequency.value = freq;
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        
        const now = audioCtx.currentTime + startTime;
        osc.start(now);
        
        // افکت Fade out برای نرم شدن صدا
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.00001, now + duration);
        osc.stop(now + duration);
    },
    
    // صدای تیک ثانیه
    tick: () => SoundFX.playTone(1000, 'triangle', 0.05),
    
    // ملودی برد (پیروزی)
    win: () => {
        if(!audioCtx) return;
        // آرپژ ماژور (C Major)
        [523.25, 659.25, 783.99, 1046.50, 1318.51].forEach((freq, i) => {
            SoundFX.playTone(freq, 'sine', 0.3, i * 0.1);
        });
    },
    
    // ملودی باخت
    lose: () => {
        if(!audioCtx) return;
        // تن‌های پایین رونده
        [150, 130, 110].forEach((freq, i) => {
            SoundFX.playTone(freq, 'sawtooth', 0.4, i * 0.3);
        });
    }
};

// --- راه‌اندازی اولیه ---
window.onload = function() {
    tg.ready();
    tg.expand();
    // تنظیم رنگ هدر با رنگ پس‌زمینه چارت
    tg.setHeaderColor('#161616'); 
    
    if (!tg.initData) {
        // دیتای تستی برای اجرا در مرورگر
        tg.initData = "query_id=TEST"; 
    }

    // 1. ابتدا چارت را می‌سازیم و با دیتای فیک پر می‌کنیم (تا صفحه خالی نباشد)
    initTradingViewChart();
    
    // 2. سپس به سرور وصل می‌شویم (با فاصله 1 ثانیه)
    setInterval(fetchServerData, 1000);
    fetchServerData(); // اولین درخواست فوری
};

// --- توابع چارت (TradingView Lightweight Charts) ---
function initTradingViewChart() {
    const container = document.getElementById('tv-chart-container');
    if (!container) return;

    // ایجاد آبجکت چارت
    chart = LightweightCharts.createChart(container, {
        width: container.clientWidth,
        height: 280, // ارتفاع فیکس
        layout: {
            background: { type: 'solid', color: '#161616' }, // مشکی مات
            textColor: '#888',
        },
        grid: {
            vertLines: { color: 'rgba(255, 255, 255, 0.04)' },
            horzLines: { color: 'rgba(255, 255, 255, 0.04)' },
        },
        rightPriceScale: {
            borderColor: '#333',
            scaleMargins: { top: 0.1, bottom: 0.1 },
        },
        timeScale: {
            borderColor: '#333',
            timeVisible: true,
            secondsVisible: true,
        },
        crosshair: {
            mode: LightweightCharts.CrosshairMode.Normal,
        },
    });

    // افزودن سری کندل استیک
    candleSeries = chart.addCandlestickSeries({
        upColor: '#10B981',        // سبز
        downColor: '#EF4444',      // قرمز
        borderDownColor: '#EF4444',
        borderUpColor: '#10B981',
        wickDownColor: '#EF4444',
        wickUpColor: '#10B981',
    });

    // تولید دیتای اولیه (برای اینکه چارت خالی نباشد)
    const data = generateInitialBars();
    candleSeries.setData(data);
    currentBar = data[data.length - 1]; // آخرین کندل را نگه می‌داریم

    // ریسایز خودکار چارت با تغییر اندازه پنجره
    window.addEventListener('resize', () => {
        chart.resize(container.clientWidth, 280);
    });
}

// تولید کندل‌های مصنوعی برای پر کردن چارت در لحظه لود
function generateInitialBars() {
    const initialPrice = 96500;
    let price = initialPrice;
    const res = [];
    const timeNow = Math.floor(Date.now() / 1000);
    
    // تولید 50 کندل گذشته (هر کندل 1 دقیقه)
    for (let i = 50; i > 0; i--) {
        const open = price;
        const volatility = 30; // نوسان رندوم
        const close = open + (Math.random() - 0.5) * volatility;
        const high = Math.max(open, close) + Math.random() * 10;
        const low = Math.min(open, close) - Math.random() * 10;
        
        res.push({
            time: timeNow - (i * 60),
            open: open,
            high: high,
            low: low,
            close: close
        });
        price = close;
    }
    return res;
}

// --- دریافت اطلاعات از سرور ---
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
        // اگر سرور قطع بود، حرکت لوکال شبیه‌سازی شود تا چارت فریز نشود
        simulateLocalMovement();
    }
}

// --- آپدیت رابط کاربری و چارت ---
function updateGameUI(data) {
    const serverPrice = data.current_price;
    const domPrice = document.getElementById('btc-price');
    
    // 1. آپدیت عدد قیمت در هدر
    if (domPrice) {
        const prev = parseFloat(domPrice.dataset.prev || serverPrice);
        // تغییر رنگ بر اساس حرکت قیمت
        if (serverPrice > prev) domPrice.style.color = '#10B981';
        else if (serverPrice < prev) domPrice.style.color = '#EF4444';
        
        domPrice.innerText = `$${serverPrice.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
        domPrice.dataset.prev = serverPrice;
    }

    // 2. آپدیت کندل روی چارت
    if (currentBar) {
        const now = Math.floor(Date.now() / 1000);
        const candleInterval = 60; // هر کندل 60 ثانیه
        
        // اگر زمان کندل تمام شده، یک کندل جدید می‌سازیم
        if (now >= currentBar.time + candleInterval) {
            currentBar = {
                time: currentBar.time + candleInterval,
                open: serverPrice,
                high: serverPrice,
                low: serverPrice,
                close: serverPrice
            };
        } else {
            // آپدیت زنده کندل جاری
            currentBar.close = serverPrice;
            currentBar.high = Math.max(currentBar.high, serverPrice);
            currentBar.low = Math.min(currentBar.low, serverPrice);
        }
        
        candleSeries.update(currentBar);
    }

    // 3. آپدیت اطلاعات راند (تایمر و دکمه‌ها)
    if (data.round) {
        const elTimer = document.getElementById('timer-text');
        const elStatus = document.getElementById('round-status');
        const elRoundId = document.getElementById('round-id');

        if(elTimer) {
            elTimer.innerText = data.round.time_left + "s";
            // قرمز شدن تایمر در ثانیه‌های آخر
            elTimer.style.color = data.round.time_left <= 15 ? '#EF4444' : '#fff';
        }
        if(elRoundId) elRoundId.innerText = `Round #${data.round.id}`;
        
        // منطق قفل شدن
        const isLocked = data.round.time_left <= LOCKOUT_TIME;
        
        if(elStatus) {
            if (isLocked) {
                elStatus.innerHTML = '<span style="color:#EF4444">بسته شد 🔒</span>';
                toggleBetButtons(true);
            } else {
                elStatus.innerHTML = '<span style="color:#10B981">باز است 🟢</span>';
                // دکمه‌ها باز شوند، مگر اینکه کاربر قبلاً شرط بسته باشد
                if (!data.user_bet) toggleBetButtons(false);
            }
        }
        
        // پخش صدای تیک‌تاک در 5 ثانیه آخر
        if (data.round.time_left <= 5 && data.round.time_left > 0) {
             // یک فلگ ساده برای اینکه در هر ثانیه فقط یکبار صدا دهد
             if (!window['tick_' + data.round.time_left]) {
                 SoundFX.tick();
                 window['tick_' + data.round.time_left] = true;
             }
        } else {
             // ریست کردن فلگ‌ها برای راند بعد
             window['tick_5'] = false;
             window['tick_4'] = false;
             window['tick_3'] = false;
             window['tick_2'] = false;
             window['tick_1'] = false;
        }
    }

    // 4. نمایش شرط کاربر
    if(data.user_bet) {
        const elStatus = document.getElementById('round-status');
        const dir = data.user_bet.prediction === 'UP' ? 'صعودی 📈' : 'نزولی 📉';
        if(elStatus) {
            elStatus.innerHTML = `<span style="color:#3B82F6">شرط شما: ${dir}</span>`;
        }
        toggleBetButtons(true); // بعد از شرط بستن قفل شود
        
        // ذخیره در LocalStorage برای بررسی نتیجه در راند بعدی
        if(data.round) {
            localStorage.setItem('last_bet_round_id', String(data.round.id));
            localStorage.setItem('last_bet_prediction', data.user_bet.prediction);
        }
    }

    // 5. بروزرسانی تاریخچه و بررسی برد/باخت
    if(data.history) {
        updateHistory(data.history);
        checkResult(data.history);
    }
}

// تابع شبیه‌سازی حرکت قیمت (اگر سرور پاسخ نداد)
function simulateLocalMovement() {
    if (!currentBar) return;
    const move = (Math.random() - 0.5) * 10;
    const newPrice = currentBar.close + move;
    
    // آپدیت UI
    const domPrice = document.getElementById('btc-price');
    if(domPrice) domPrice.innerText = `$${newPrice.toFixed(2)}`;
    
    // آپدیت چارت
    currentBar.close = newPrice;
    currentBar.high = Math.max(currentBar.high, newPrice);
    currentBar.low = Math.min(currentBar.low, newPrice);
    candleSeries.update(currentBar);
}

// --- رندر تاریخچه (حباب‌ها) ---
function updateHistory(history) {
    const container = document.getElementById('history-container');
    const modalList = document.getElementById('history-list'); // لیست داخل مودال
    
    if(!container) return;
    container.innerHTML = '';
    
    // نمایش نتایج اخیر زیر چارت (کپسول‌های کوچک)
    // 15 تای آخر را معکوس می‌کنیم تا جدیدترین سمت چپ باشد
    history.slice().reverse().slice(0, 15).forEach(h => {
        const badge = document.createElement('div');
        const color = h.result === 'UP' ? '#10B981' : '#EF4444';
        const arrow = h.result === 'UP' ? '↑' : '↓';
        
        badge.style.cssText = `
            min-width: 28px; height: 28px; background: ${color}; 
            color: black; border-radius: 8px; display: flex; 
            align-items: center; justify-content: center; 
            font-size: 14px; font-weight: bold; margin-right: 6px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.3);
        `;
        badge.innerText = arrow;
        container.appendChild(badge);
    });

    // پر کردن لیست داخل مودال (کامل‌تر)
    if (modalList && document.getElementById('history-modal').classList.contains('active')) {
        let html = '';
        history.slice().reverse().forEach(h => {
            const colorClass = h.result === 'UP' ? 'text-up' : 'text-down';
            const icon = h.result === 'UP' ? '📈' : '📉';
            html += `
                <div style="display:flex; justify-content:space-between; padding:10px; border-bottom:1px solid rgba(255,255,255,0.05);">
                    <span>Round #${h.round_id}</span>
                    <span class="${colorClass}">${icon} ${h.result}</span>
                    <span>$${h.end_price.toFixed(2)}</span>
                </div>
            `;
        });
        modalList.innerHTML = html || '<div style="padding:20px;text-align:center">خالی</div>';
    }
}

// بررسی نتیجه شرط قبلی
function checkResult(history) {
    const myRoundId = localStorage.getItem('last_bet_round_id');
    const myPrediction = localStorage.getItem('last_bet_prediction');
    if (!myRoundId || !myPrediction) return;
    
    // جستجوی راند تمام شده در تاریخچه سرور
    const round = history.find(h => String(h.round_id) === String(myRoundId));
    
    if (round) {
        // پاک کردن استوریج
        localStorage.removeItem('last_bet_round_id');
        localStorage.removeItem('last_bet_prediction');
        
        if (round.result === myPrediction) {
            // برد
            SoundFX.win();
            tg.showAlert(`🎉 تبریک! شما برنده شدید.\nقیمت بسته شدن: ${round.end_price}`);
            triggerConfetti();
            tg.HapticFeedback.notificationOccurred('success');
        } else {
            // باخت
            SoundFX.lose();
            tg.showAlert(`❌ متاسفانه باختید.\nنتیجه: ${round.result}`);
            tg.HapticFeedback.notificationOccurred('error');
        }
    }
}

// --- تعاملات کاربر ---
window.setAmount = function(val) {
    document.getElementById('bet-amount').value = val;
    initAudio(); // تلاش برای فعال‌سازی صدا
    SoundFX.tick();
    tg.HapticFeedback.selectionChanged();
    
    // آپدیت استایل دکمه‌های چیپ
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    if(event.target) event.target.classList.add('active');
};

window.placeBet = async function(pred) {
    const amount = document.getElementById('bet-amount').value;
    initAudio();
    SoundFX.tick();
    tg.HapticFeedback.impactOccurred('medium');

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
            tg.showAlert("✅ شرط شما با موفقیت ثبت شد");
        } else {
            tg.showAlert("⚠️ " + result.message);
        }
    } catch (e) {
        tg.showAlert("خطای اتصال به سرور");
    }
};

// فعال/غیرفعال کردن دکمه‌ها
function toggleBetButtons(disable) {
    const btnUp = document.getElementById('btn-up');
    const btnDown = document.getElementById('btn-down');
    if(btnUp) btnUp.disabled = disable;
    if(btnDown) btnDown.disabled = disable;
    
    // تغییر ظاهر دکمه‌ها وقتی غیرفعال می‌شوند
    if(disable) {
        btnUp.style.opacity = '0.5';
        btnDown.style.opacity = '0.5';
    } else {
        btnUp.style.opacity = '1';
        btnDown.style.opacity = '1';
    }
}

// افکت کاغذ رنگی
function triggerConfetti() {
    if (typeof confetti === 'function') {
        confetti({ 
            particleCount: 150, 
            spread: 70, 
            origin: { y: 0.6 },
            colors: ['#FFD700', '#10B981', '#3B82F6']
        });
    }
}

// مدیریت مودال‌ها
window.openHistory = () => document.getElementById('history-modal').classList.add('active');
window.closeHistory = () => document.getElementById('history-modal').classList.remove('active');
window.openLeaderboard = () => document.getElementById('leaderboard-modal').classList.add('active');
window.closeLeaderboard = () => document.getElementById('leaderboard-modal').classList.remove('active');