/* webapp/game.js (v16.1 - History Modal Fixed) */

// متغیرهای سراسری
const tg = window.Telegram.WebApp;
const API_BASE_URL = window.location.origin;
let chart;
let priceHistory = [];
const MAX_POINTS = 30;

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
    tick: () => SoundFX.playTone(1000, 'triangle', 0.05),
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

// --- توابع عمومی (متصل به window) ---

// 1. باز کردن تاریخچه (اصلاح شده برای انیمیشن صحیح)
window.openHistory = async function() {
    console.log("History clicked!"); 
    const modal = document.getElementById('history-modal');
    const list = document.getElementById('history-list');
    
    // --- FIX START ---
    if (modal) {
        // ابتدا display: none را برمیداریم
        modal.classList.remove('hidden');
        // کمی صبر میکنیم تا مرورگر رندر کند، سپس انیمیشن را فعال میکنیم
        setTimeout(() => {
            modal.classList.add('active');
        }, 10);
    }
    // --- FIX END ---

    if (list) list.innerHTML = '<div style="text-align:center;padding:20px;color:#888">⏳ در حال دریافت...</div>';

    try {
        const res = await fetch(`${API_BASE_URL}/webapp/game/user-history`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ initData: tg.initData })
        });
        
        if (!res.ok) throw new Error("Network error");
        
        const data = await res.json();
        
        if(data.status === 'success') {
            renderHistory(data.history);
        } else {
            list.innerHTML = '<div style="text-align:center;color:red">خطا در دریافت</div>';
        }
    } catch(e) {
        console.error(e);
        if (list) list.innerHTML = '<div style="text-align:center;color:red">خطای شبکه</div>';
    }
};

// 2. بستن تاریخچه (اصلاح شده)
window.closeHistory = function() {
    const modal = document.getElementById('history-modal');
    if (modal) {
        // ابتدا انیمیشن خروج را اجرا میکنیم
        modal.classList.remove('active');
        
        // صبر میکنیم تا انیمیشن (0.3 ثانیه) تمام شود، سپس مخفی میکنیم
        setTimeout(() => {
            modal.classList.add('hidden');
        }, 300);
    }
};

// 3. ثبت شرط
window.placeBet = async function(pred) {
    const amount = document.getElementById('bet-amount').value;
    initAudio();
    SoundFX.tick();

    try {
        const res = await fetch(`${API_BASE_URL}/webapp/game/bet`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ initData: tg.initData, amount: parseFloat(amount), prediction: pred })
        });
        const result = await res.json();
        if (result.status === "success") {
            tg.HapticFeedback.impactOccurred('medium');
            // آلرت ساده برای تایید
            alert("✅ " + result.message);
        } else {
            tg.showAlert(`❌ ${result.message}`);
        }
    } catch (e) { tg.showAlert("خطای اتصال"); }
};

// --- توابع داخلی ---

function renderHistory(items) {
    const list = document.getElementById('history-list');
    if (!list) return;
    
    list.innerHTML = '';
    
    if(!items || items.length === 0) {
        list.innerHTML = '<div style="text-align:center;padding:20px;color:#888">هنوز شرطی نبسته‌اید!</div>';
        return;
    }

    items.forEach(item => {
        const div = document.createElement('div');
        div.className = 'history-item';
        
        const isWin = item.status === 'WON';
        const statusText = item.status === 'WON' ? 'برد' : (item.status === 'LOST' ? 'باخت' : (item.status === 'REFUND' ? 'برگشت' : 'در جریان'));
        const statusClass = item.status; // WON, LOST, PENDING
        const directionIcon = item.prediction === 'UP' ? '📈' : '📉';
        const amountDisplay = isWin ? '+' + parseFloat(item.payout).toLocaleString() : parseFloat(item.amount).toLocaleString();
        
        div.innerHTML = `
            <div class="h-left">
                <div style="direction:ltr"><span class="h-round">#${item.round_id}</span> ${directionIcon}</div>
                <span class="h-time">${item.time}</span>
            </div>
            <div class="h-right">
                <div class="badge ${statusClass}">${statusText}</div>
                <div style="margin-top:4px; font-size:0.9rem; direction:ltr">
                    ${amountDisplay} $
                </div>
            </div>
        `;
        list.appendChild(div);
    });
}

function toggleButtons(disable) {
    const btnUp = document.getElementById('btn-up');
    const btnDown = document.getElementById('btn-down');
    if(btnUp) btnUp.disabled = disable;
    if(btnDown) btnDown.disabled = disable;
    
    if(!disable) {
        if(btnUp) btnUp.classList.remove('selected');
        if(btnDown) btnDown.classList.remove('selected');
    }
}

function triggerConfetti() {
    if (typeof confetti === 'function') confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });
}

function initChart() {
    const canvas = document.getElementById('btcChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, 'rgba(54, 123, 255, 0.5)');
    gradient.addColorStop(1, 'rgba(54, 123, 255, 0.0)');

    chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: Array(MAX_POINTS).fill(''),
            datasets: [{
                data: Array(MAX_POINTS).fill(null),
                borderColor: '#367BFF', backgroundColor: gradient,
                borderWidth: 2, pointRadius: 0, fill: true, tension: 0.4
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { x: { display: false }, y: { display: true, position: 'right', grid: { color: '#333' } } },
            animation: { duration: 0 }
        }
    });
}

async function fetchState() {
    try {
        const res = await fetch(`${API_BASE_URL}/webapp/game/state`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ initData: tg.initData })
        });
        if (res.ok) updateUI(await res.json());
    } catch (e) { console.error(e); }
}

function updateUI(data) {
    const elPrice = document.getElementById('btc-price');
    const currentPrice = data.current_price;
    
    if(elPrice) {
        elPrice.textContent = `$${currentPrice.toLocaleString()}`;
        elPrice.classList.remove('loading');
        
        if (priceHistory.length > 0) {
            const lastPrice = priceHistory[priceHistory.length - 1];
            if (currentPrice > lastPrice) elPrice.className = 'text-up';
            else if (currentPrice < lastPrice) elPrice.className = 'text-down';
            else elPrice.className = 'text-white';
        }
    }

    priceHistory.push(currentPrice);
    if (priceHistory.length > MAX_POINTS) priceHistory.shift();
    if (chart) {
        chart.data.datasets[0].data = priceHistory;
        const min = Math.min(...priceHistory) * 0.9995;
        const max = Math.max(...priceHistory) * 1.0005;
        chart.options.scales.y.min = min;
        chart.options.scales.y.max = max;
        chart.update();
    }

    if (data.round) {
        const elTimer = document.getElementById('timer-text');
        const elPath = document.getElementById('timer-path');
        const elStatus = document.getElementById('round-status');
        
        if(elTimer) elTimer.textContent = data.round.time_left;
        if(elPath) {
            const pct = (data.round.time_left / 60) * 100;
            elPath.style.strokeDasharray = `${pct}, 100`;
            
            // تغییر رنگ در ثانیه‌های آخر
            if (data.round.time_left <= 10) elPath.style.stroke = "#FFD700";
            else elPath.style.stroke = "#00E096";
        }

        if (data.round.time_left <= 5 && data.round.time_left > 0) {
            if (!window['tick_' + data.round.time_left]) {
                SoundFX.tick();
                window['tick_' + data.round.time_left] = true;
            }
        }

        if (data.round.time_left <= 10) {
            if(elStatus) {
                elStatus.textContent = "⏳ بسته شد! منتظر نتیجه...";
                elStatus.style.color = "#FFD700";
            }
            toggleButtons(true);
        } else {
            if(elStatus) {
                elStatus.textContent = "🟢 شرط بندی باز است";
                elStatus.style.color = "#00E096";
            }
            if(!data.user_bet) toggleButtons(false);
        }
    }

    if(data.user_bet) {
        const elStatus = document.getElementById('round-status');
        const typeText = data.user_bet.prediction === 'UP' ? 'خرید (LONG) 📈' : 'فروش (SHORT) 📉';
        if(elStatus) elStatus.textContent = `پوزیشن باز: ${typeText}`;
        toggleButtons(true);
        
        if(data.round) {
            localStorage.setItem('last_bet_round_id', String(data.round.id));
            localStorage.setItem('last_bet_prediction', data.user_bet.prediction);
        }
    }

    if (data.history) {
        updateHistoryBubbles(data.history);
        checkResult(data.history);
    }
}

function updateHistoryBubbles(history) {
    const container = document.getElementById('history-container');
    if(!container) return;
    
    container.innerHTML = '';
    history.slice(0, 10).forEach(h => {
        const div = document.createElement('div');
        div.className = 'history-bubble ' + (h.result === 'UP' ? 'up' : (h.result === 'DOWN' ? 'down' : 'draw'));
        div.textContent = h.result === 'UP' ? '↑' : (h.result === 'DOWN' ? '↓' : '-');
        container.appendChild(div);
    });
}

function checkResult(history) {
    const myRoundId = localStorage.getItem('last_bet_round_id');
    const myPrediction = localStorage.getItem('last_bet_prediction');

    if (!myRoundId || !myPrediction) return;

    const finishedRound = history.find(h => String(h.round_id) === String(myRoundId));

    if (finishedRound) {
        localStorage.removeItem('last_bet_round_id'); 
        localStorage.removeItem('last_bet_prediction');

        if (finishedRound.result === myPrediction) {
            SoundFX.win();
            tg.showAlert(`🎉 تبریک! شما برنده شدید.\nقیمت بسته شدن: ${finishedRound.end_price}`);
            triggerConfetti();
            tg.HapticFeedback.notificationOccurred('success');
        } else if (finishedRound.result === 'DRAW') {
            tg.showAlert(`⚪️ مساوی شد. مبلغ برگشت داده شد.`);
        } else {
            SoundFX.lose();
            tg.showAlert(`❌ متاسفانه باختید.\nپیش‌بینی شما: ${myPrediction}\nنتیجه: ${finishedRound.result}`);
            tg.HapticFeedback.notificationOccurred('error');
        }
    }
}

// شروع برنامه
window.onload = function() {
    tg.ready();
    tg.expand();
    tg.setHeaderColor('#1C1C2E');

    if (!tg.initData) {
        document.body.innerHTML = "<h3 style='color:white;text-align:center;margin-top:50px'>لطفاً از داخل ربات باز کنید</h3>";
        return;
    }

    initChart();
    setInterval(fetchState, 1000);
};