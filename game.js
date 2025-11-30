/* webapp/game.js (v24.0 - Robust Chart Loading) */

const tg = window.Telegram.WebApp;
const API_BASE_URL = window.location.origin;

let chart;
let candleSeries;
let currentBar = null;
const LOCKOUT_TIME = 15;

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
    tick: () => playBeep(1000, 0.05),
    win: () => playBeep(600, 0.3),
    lose: () => playBeep(150, 0.4)
};

function playBeep(freq, dur) {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.frequency.value = freq;
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + dur);
    osc.stop(audioCtx.currentTime + dur);
}

// --- شروع برنامه ---
window.onload = function() {
    tg.ready();
    tg.expand();
    tg.setHeaderColor('#161616');
    
    if (!tg.initData) tg.initData = "query_id=TEST"; 

    // بررسی لود شدن کتابخانه
    if (typeof LightweightCharts === 'undefined') {
        alert("خطا: کتابخانه نمودار لود نشد. لطفاً اینترنت خود را چک کنید (VPN).");
        return;
    }

    initChart();
    
    // دریافت اطلاعات از سرور
    setInterval(fetchServerData, 1000);
    fetchServerData();
};

function initChart() {
    const container = document.getElementById('tv-chart-container');
    if (!container) return;

    // تنظیمات چارت
    chart = LightweightCharts.createChart(container, {
        width: container.clientWidth,
        height: 300,
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
            secondsVisible: false,
            borderColor: '#333',
        },
        rightPriceScale: {
            borderColor: '#333',
        },
    });

    candleSeries = chart.addCandlestickSeries({
        upColor: '#10B981',
        downColor: '#EF4444',
        borderVisible: false,
        wickUpColor: '#10B981',
        wickDownColor: '#EF4444',
    });

    // دیتای اولیه (Local Mock) برای نمایش فوری
    const data = generateInitialBars();
    candleSeries.setData(data);
    currentBar = data[data.length - 1];

    window.addEventListener('resize', () => {
        chart.resize(container.clientWidth, 300);
    });
}

function generateInitialBars() {
    const initialPrice = 96500;
    let price = initialPrice;
    const res = [];
    const timeNow = Math.floor(Date.now() / 1000);
    
    // ساخت 40 کندل ۱ دقیقه‌ای
    for (let i = 40; i > 0; i--) {
        const open = price;
        const close = open + (Math.random() - 0.5) * 50;
        const high = Math.max(open, close) + Math.random() * 15;
        const low = Math.min(open, close) - Math.random() * 15;
        
        res.push({
            time: timeNow - (i * 60),
            open: open, high: high, low: low, close: close
        });
        price = close;
    }
    return res;
}

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
        // Fallback: حرکت مصنوعی اگر سرور قطع بود
        simulateLocalMovement();
    }
}

function updateGameUI(data) {
    const serverPrice = data.current_price;
    const domPrice = document.getElementById('btc-price');
    
    // 1. آپدیت قیمت UI
    if (domPrice) {
        const prev = parseFloat(domPrice.dataset.prev || serverPrice);
        domPrice.style.color = serverPrice >= prev ? '#10B981' : '#EF4444';
        domPrice.innerText = `$${serverPrice.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
        domPrice.dataset.prev = serverPrice;
    }

    // 2. آپدیت چارت
    if (currentBar) {
        const now = Math.floor(Date.now() / 1000);
        // منطق ساده: هر 60 ثانیه کندل جدید
        // برای دقیق‌تر شدن باید تایم سرور را چک کرد
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

    // 3. آپدیت وضعیت راند
    if (data.round) {
        const elTimer = document.getElementById('timer-text');
        const elStatus = document.getElementById('round-status');
        const elRoundId = document.getElementById('round-id');

        if(elTimer) elTimer.innerText = data.round.time_left + "s";
        if(elRoundId) elRoundId.innerText = `Round #${data.round.id}`;
        
        const isLocked = data.round.time_left <= LOCKOUT_TIME;
        
        if(elStatus) {
            elStatus.innerHTML = isLocked ? "بسته شد 🔒" : "باز است 🟢";
            elStatus.style.color = isLocked ? '#EF4444' : '#10B981';
        }
        
        // قفل دکمه‌ها
        toggleButtons(isLocked || !!data.user_bet);

        // صدا
        if (data.round.time_left <= 5 && data.round.time_left > 0) {
             if (!window['tick_' + data.round.time_left]) {
                 SoundFX.tick();
                 window['tick_' + data.round.time_left] = true;
             }
        }
    }

    // 4. نمایش شرط
    if(data.user_bet) {
        const elStatus = document.getElementById('round-status');
        const dir = data.user_bet.prediction === 'UP' ? 'خرید (LONG)' : 'فروش (SHORT)';
        if(elStatus) {
            elStatus.innerHTML = `<span style="color:#3B82F6">شرط شما: ${dir}</span>`;
        }
    }

    // 5. تاریخچه
    if(data.history) {
        updateHistory(data.history);
        checkResult(data.history);
    }
}

function simulateLocalMovement() {
    if (!currentBar) return;
    const move = (Math.random() - 0.5) * 15;
    const newPrice = currentBar.close + move;
    
    // آپدیت UI
    const domPrice = document.getElementById('btc-price');
    if(domPrice) domPrice.innerText = `$${newPrice.toFixed(2)}`;
    
    currentBar.close = newPrice;
    currentBar.high = Math.max(currentBar.high, newPrice);
    currentBar.low = Math.min(currentBar.low, newPrice);
    candleSeries.update(currentBar);
}

function updateHistory(history) {
    const container = document.getElementById('history-container');
    if(!container) return;
    container.innerHTML = '';
    
    history.slice().reverse().slice(0, 10).forEach(h => {
        const div = document.createElement('div');
        const color = h.result === 'UP' ? '#10B981' : '#EF4444';
        const arrow = h.result === 'UP' ? '↑' : '↓';
        div.style.cssText = `min-width:24px; height:24px; background:${color}; border-radius:6px; display:flex; align-items:center; justify-content:center; color:black; font-weight:bold; font-size:12px;`;
        div.innerText = arrow;
        container.appendChild(div);
    });
}

function checkResult(history) {
    const myRoundId = localStorage.getItem('last_bet_round_id');
    const myPrediction = localStorage.getItem('last_bet_prediction');
    if (!myRoundId) return;
    
    const round = history.find(h => String(h.round_id) === String(myRoundId));
    if (round) {
        localStorage.removeItem('last_bet_round_id');
        if (round.result === myPrediction) {
            SoundFX.win();
            tg.showAlert(`🎉 تبریک! برنده شدید.\nقیمت بسته شدن: ${round.end_price}`);
            confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
        } else {
            SoundFX.lose();
            tg.showAlert(`❌ متاسفانه باختید.`);
        }
    }
}

// --- دکمه‌ها ---
window.setAmount = function(val) {
    document.getElementById('bet-amount').value = val;
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    if(event.target) event.target.classList.add('active');
    SoundFX.tick();
};

window.placeBet = async function(pred) {
    const amount = document.getElementById('bet-amount').value;
    SoundFX.tick();
    try {
        const res = await fetch(`${API_BASE_URL}/webapp/game/bet`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ initData: tg.initData, amount: parseFloat(amount), prediction: pred })
        });
        const result = await res.json();
        if(result.status === 'success') tg.showAlert("✅ شرط ثبت شد");
        else tg.showAlert("⚠️ " + result.message);
    } catch(e) { tg.showAlert("خطای اتصال"); }
};

function toggleButtons(disable) {
    document.getElementById('btn-up').disabled = disable;
    document.getElementById('btn-down').disabled = disable;
}

// مودال‌ها
window.openHistory = () => document.getElementById('history-modal').classList.add('active');
window.closeHistory = () => document.getElementById('history-modal').classList.remove('active');
window.openLeaderboard = () => document.getElementById('leaderboard-modal').classList.add('active');
window.closeLeaderboard = () => document.getElementById('leaderboard-modal').classList.remove('active');