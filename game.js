/* webapp/game.js (v21.0 - TradingView Candles Edition) */

const tg = window.Telegram.WebApp;
const API_BASE_URL = window.location.origin;

// --- تنظیمات چارت ---
let chart;
let candleSeries;
let currentCandle = null;
let lastServerTime = 0;

// --- سیستم صوتی ---
const AudioContext = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;

function initAudio() {
    if (!audioCtx) {
        audioCtx = new AudioContext();
        const buffer = audioCtx.createBuffer(1, 1, 22050);
        const source = audioCtx.createBufferSource();
        source.buffer = buffer;
        source.connect(audioCtx.destination);
        source.start(0);
    } else if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}
document.addEventListener('click', initAudio, { once: true });
document.addEventListener('touchstart', initAudio, { once: true });

const SoundFX = {
    playTone: (freq, type, duration) => {
        if (!audioCtx) return;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type;
        osc.frequency.value = freq;
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        gain.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + duration);
        osc.stop(audioCtx.currentTime + duration);
    },
    tick: () => SoundFX.playTone(1200, 'triangle', 0.05),
    win: () => {
        if(!audioCtx) return;
        const now = audioCtx.currentTime;
        [523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.frequency.value = freq;
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(now + i * 0.1);
            gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.1 + 0.3);
            osc.stop(now + i * 0.1 + 0.3);
        });
    },
    lose: () => {
        if(!audioCtx) return;
        const now = audioCtx.currentTime;
        [150, 100].forEach((freq, i) => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.value = freq;
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(now + i * 0.4);
            gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.4 + 0.4);
            osc.stop(now + i * 0.4 + 0.4);
        });
    }
};

// --- راه‌اندازی چارت تریدینگ‌ویو ---
function initTradingViewChart() {
    const container = document.getElementById('tv-chart-container');
    if (!container) return;

    // ساخت چارت
    chart = LightweightCharts.createChart(container, {
        width: container.clientWidth,
        height: container.clientHeight,
        layout: {
            background: { type: 'solid', color: '#161616' },
            textColor: '#888',
        },
        grid: {
            vertLines: { color: 'rgba(255, 255, 255, 0.05)' },
            horzLines: { color: 'rgba(255, 255, 255, 0.05)' },
        },
        timeScale: {
            timeVisible: true,
            secondsVisible: true,
            borderColor: '#333',
        },
        rightPriceScale: {
            borderColor: '#333',
        },
        crosshair: {
            mode: LightweightCharts.CrosshairMode.Normal,
        },
    });

    // افزودن سری کندل استیک
    candleSeries = chart.addCandlestickSeries({
        upColor: '#10B981',
        downColor: '#EF4444',
        borderVisible: false,
        wickUpColor: '#10B981',
        wickDownColor: '#EF4444',
    });

    // پر کردن داده‌های اولیه (فیک) برای اینکه چارت خالی نباشد
    const initialData = generateInitialData();
    candleSeries.setData(initialData);
    
    // آخرین کندل را نگه می‌داریم تا آپدیتش کنیم
    currentCandle = initialData[initialData.length - 1];

    // ریسایز خودکار
    window.addEventListener('resize', () => {
        chart.resize(container.clientWidth, container.clientHeight);
    });
}

function generateInitialData() {
    // تولید 30 کندل قبلی بر اساس قیمت حدودی سرور
    let price = 96500;
    const data = [];
    const now = Math.floor(Date.now() / 1000);
    
    for (let i = 30; i > 0; i--) {
        const open = price;
        const close = price + (Math.random() - 0.5) * 50;
        const high = Math.max(open, close) + Math.random() * 10;
        const low = Math.min(open, close) - Math.random() * 10;
        price = close;
        
        data.push({
            time: now - (i * 60), // هر کندل 1 دقیقه
            open: open,
            high: high,
            low: low,
            close: close
        });
    }
    return data;
}

// --- دریافت وضعیت از سرور ---
async function fetchState() {
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
        console.error("Connection Error:", e);
    }
}

function updateGameUI(data) {
    const currentPrice = data.current_price;
    const nowTimestamp = Math.floor(Date.now() / 1000); // زمان فعلی کلاینت

    // 1. آپدیت قیمت در هدر
    const elPrice = document.getElementById('btc-price');
    if(elPrice) {
        // تغییر رنگ بر اساس حرکت قیمت
        const prevPrice = parseFloat(elPrice.getAttribute('data-prev') || currentPrice);
        if (currentPrice > prevPrice) elPrice.style.color = '#10B981';
        else if (currentPrice < prevPrice) elPrice.style.color = '#EF4444';
        
        elPrice.innerText = `$${currentPrice.toLocaleString("en-US", {minimumFractionDigits: 2})}`;
        elPrice.setAttribute('data-prev', currentPrice);
    }

    // 2. آپدیت چارت (کندل زنده)
    if (candleSeries && currentCandle) {
        // اگر راند عوض شده یا زمان زیادی گذشته، کندل جدید بساز
        // اینجا فرض می‌کنیم هر راند یک کندل جدید است یا هر 60 ثانیه
        const candleTimeStep = 60; // هر کندل 1 دقیقه
        const nextCandleTime = currentCandle.time + candleTimeStep;

        if (nowTimestamp >= nextCandleTime) {
            // بستن کندل قبلی و شروع جدید
            currentCandle = {
                time: nextCandleTime,
                open: currentPrice,
                high: currentPrice,
                low: currentPrice,
                close: currentPrice
            };
        } else {
            // آپدیت کندل فعلی
            currentCandle.close = currentPrice;
            currentCandle.high = Math.max(currentCandle.high, currentPrice);
            currentCandle.low = Math.min(currentCandle.low, currentPrice);
        }
        
        candleSeries.update(currentCandle);
    }

    // 3. تایمر و وضعیت راند
    if (data.round) {
        const elTimer = document.getElementById('timer-text');
        const elStatus = document.getElementById('round-status');
        const elRoundId = document.getElementById('round-id');
        
        if(elRoundId) elRoundId.innerText = `Round #${data.round.id}`;
        if(elTimer) elTimer.innerText = data.round.time_left + "s";

        // مدیریت رنگ تایمر (هشدار در 15 ثانیه آخر)
        const isLocked = data.round.time_left <= 15;
        if(elTimer) elTimer.style.color = isLocked ? '#EF4444' : '#fff';

        if(elStatus) {
            if (isLocked) {
                elStatus.innerHTML = '<span style="color:#EF4444">بسته شد 🔒</span>';
                toggleButtons(true);
            } else {
                elStatus.innerHTML = '<span style="color:#10B981">باز است 🟢</span>';
                if (!data.user_bet) toggleButtons(false);
            }
        }

        // صدای تیک‌تاک
        if (data.round.time_left <= 5 && data.round.time_left > 0) {
            if (!window['tick_' + data.round.time_left]) {
                SoundFX.tick();
                window['tick_' + data.round.time_left] = true;
            }
        }
    }

    // 4. نمایش شرط کاربر
    if(data.user_bet) {
        const elStatus = document.getElementById('round-status');
        const dir = data.user_bet.prediction === 'UP' ? 'صعودی 📈' : 'نزولی 📉';
        if(elStatus) {
            elStatus.innerHTML = `<span style="color:#3B82F6">شرط شما: ${dir}</span>`;
        }
        toggleButtons(true);
        
        // ذخیره برای بررسی نتیجه
        if(data.round) {
            localStorage.setItem('last_bet_round_id', String(data.round.id));
            localStorage.setItem('last_bet_prediction', data.user_bet.prediction);
        }
    }

    // 5. تاریخچه نتایج (حباب‌ها)
    if(data.history) {
        updateHistory(data.history);
        checkResult(data.history);
    }
}

function updateHistory(history) {
    const container = document.getElementById('history-container');
    if(!container) return;
    container.innerHTML = '';
    
    // نمایش 10 نتیجه آخر
    history.slice().reverse().slice(0, 15).forEach(h => {
        const badge = document.createElement('div');
        const color = h.result === 'UP' ? '#10B981' : '#EF4444';
        const arrow = h.result === 'UP' ? '↑' : '↓';
        
        badge.style.cssText = `
            min-width: 24px; height: 24px; background: ${color}; 
            color: black; border-radius: 6px; display: flex; 
            align-items: center; justify-content: center; 
            font-size: 12px; font-weight: bold; margin-right: 4px;
        `;
        badge.innerText = arrow;
        container.appendChild(badge);
    });
}

function checkResult(history) {
    const myRoundId = localStorage.getItem('last_bet_round_id');
    const myPrediction = localStorage.getItem('last_bet_prediction');
    if (!myRoundId || !myPrediction) return;
    
    const round = history.find(h => String(h.round_id) === String(myRoundId));
    if (round) {
        localStorage.removeItem('last_bet_round_id');
        localStorage.removeItem('last_bet_prediction');
        
        if (round.result === myPrediction) {
            SoundFX.win();
            tg.showAlert(`🎉 تبریک! برنده شدید.\nقیمت بسته شده: ${round.end_price}`);
            confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
        } else {
            SoundFX.lose();
            tg.showAlert(`❌ متاسفانه باختید.\nنتیجه: ${round.result}`);
        }
    }
}

// --- تعاملات کاربر ---
window.setAmount = function(val) {
    document.getElementById('bet-amount').value = val;
    initAudio();
    SoundFX.tick();
    tg.HapticFeedback.selectionChanged();
    
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
            body: JSON.stringify({ initData: tg.initData, amount: parseFloat(amount), prediction: pred })
        });
        const result = await res.json();
        
        if (result.status === 'success') {
            tg.showAlert("✅ شرط ثبت شد");
        } else {
            tg.showAlert("⚠️ " + result.message);
        }
    } catch (e) {
        tg.showAlert("خطای اتصال");
    }
};

function toggleButtons(disabled) {
    document.getElementById('btn-up').disabled = disabled;
    document.getElementById('btn-down').disabled = disabled;
}

// مودال‌ها
window.openHistory = () => { document.getElementById('history-modal').classList.add('active'); }
window.closeHistory = () => { document.getElementById('history-modal').classList.remove('active'); }
window.openLeaderboard = () => { document.getElementById('leaderboard-modal').classList.add('active'); }
window.closeLeaderboard = () => { document.getElementById('leaderboard-modal').classList.remove('active'); }

// --- اجرا ---
window.onload = function() {
    tg.ready();
    tg.expand();
    tg.setHeaderColor('#161616'); // هماهنگ با هدر جدید
    
    if (!tg.initData) {
        // Mock data for browser testing
        tg.initData = "query_id=TEST"; 
    }
    
    initTradingViewChart();
    
    // لوپ آپدیت
    setInterval(fetchState, 1000);
    fetchState();
};