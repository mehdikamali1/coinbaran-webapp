/* webapp/game.js (v20.0 - Final Production Engine) */

// --- متغیرهای سراسری ---
const tg = window.Telegram.WebApp;
const API_BASE_URL = window.location.origin; // آدرس سرور (اتوماتیک)
let chart; // شیء نمودار
let priceHistory = []; // آرایه قیمت‌ها برای رسم نمودار
const MAX_POINTS = 30; // تعداد نقاط روی نمودار
const LOCKOUT_TIME = 15; // زمان قفل شدن شرط‌بندی (ثانیه)

// --- سیستم صوتی (Web Audio API) ---
const AudioContext = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;

// راه‌اندازی سیستم صوتی با اولین کلیک کاربر (محدودیت مرورگرها)
function initAudio() {
    if (!audioCtx) {
        audioCtx = new AudioContext();
        // پخش یک صدای بی‌صدا برای باز کردن قفل صوتی مرورگر
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
    tick: () => SoundFX.playTone(1000, 'triangle', 0.05), // صدای تیک ثانیه
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

// --- انیمیشن پرواز سکه ---
function animateFlyingChip(startElementId, targetElementId) {
    const startElem = document.getElementById(startElementId);
    const targetElem = document.getElementById(targetElementId);
    
    if (!startElem || !targetElem) return;

    const startRect = startElem.getBoundingClientRect();
    const targetRect = targetElem.getBoundingClientRect();

    const chip = document.createElement('div');
    chip.className = 'flying-chip';
    chip.innerHTML = '$'; 
    
    chip.style.left = (startRect.left + startRect.width / 2 - 15) + 'px';
    chip.style.top = (startRect.top + startRect.height / 2 - 15) + 'px';
    
    document.body.appendChild(chip);

    // شروع انیمیشن
    setTimeout(() => {
        chip.style.transition = 'all 0.8s cubic-bezier(0.175, 0.885, 0.32, 1.275)'; 
        chip.style.left = (targetRect.left + targetRect.width / 2 - 15) + 'px';
        chip.style.top = (targetRect.top + targetRect.height / 2 - 15) + 'px';
        chip.style.opacity = '0';
        chip.style.transform = 'scale(0.5)';
    }, 50);

    // حذف عنصر بعد از پایان انیمیشن
    setTimeout(() => {
        chip.remove();
    }, 900);
}

// --- توابع عمومی رابط کاربری ---

window.setAmount = function(val) {
    const input = document.getElementById('bet-amount');
    if (input) input.value = val;
    
    initAudio();
    SoundFX.tick();
    if(tg.HapticFeedback) tg.HapticFeedback.selectionChanged();
    
    // تغییر استایل دکمه‌های سریع
    const buttons = document.querySelectorAll('.chip');
    buttons.forEach(btn => btn.classList.remove('active'));
    
    if (event && event.target) {
        event.target.classList.add('active');
    }
};

// --- توابع نمودار (Chart.js) ---
function initChart() {
    const canvas = document.getElementById('btcChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    
    // گرادینت زیر نمودار
    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, 'rgba(54, 123, 255, 0.5)');
    gradient.addColorStop(1, 'rgba(54, 123, 255, 0.0)');

    chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: Array(MAX_POINTS).fill(''),
            datasets: [{
                data: Array(MAX_POINTS).fill(null),
                borderColor: '#3B82F6', // رنگ خط (آبی)
                backgroundColor: gradient,
                borderWidth: 2,
                pointRadius: 0,
                fill: true,
                tension: 0.4 // نرمی خط
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { display: false },
                y: { 
                    display: true, 
                    position: 'right', 
                    grid: { color: '#333', borderDash: [5, 5] },
                    ticks: { color: '#888', font: { family: 'monospace' } }
                }
            },
            animation: { duration: 0 } // غیرفعال کردن انیمیشن پیش‌فرض برای روانی حرکت
        }
    });
}

// --- هسته اصلی بازی (Game Loop) ---
async function fetchState() {
    try {
        const res = await fetch(`${API_BASE_URL}/webapp/game/state`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ initData: tg.initData }) // ارسال هویت
        });
        
        if (res.ok) {
            const data = await res.json();
            updateUI(data);
        }
    } catch (e) {
        console.error("Game State Error:", e);
    }
}

function updateUI(data) {
    const elPrice = document.getElementById('btc-price');
    const elPriceContainer = document.querySelector('.price-display');
    const currentPrice = data.current_price;
    
    // 1. بروزرسانی قیمت و فلش زدن
    if(elPrice) {
        elPrice.textContent = `$${currentPrice.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
        
        if (priceHistory.length > 0) {
            const lastPrice = priceHistory[priceHistory.length - 1];
            if (currentPrice > lastPrice) {
                elPrice.className = 'text-up'; // سبز
            } else if (currentPrice < lastPrice) {
                elPrice.className = 'text-down'; // قرمز
            } else {
                elPrice.className = 'text-white';
            }
        }
    }

    // 2. آپدیت نمودار
    priceHistory.push(currentPrice);
    if (priceHistory.length > MAX_POINTS) priceHistory.shift();
    
    if (chart) {
        chart.data.datasets[0].data = priceHistory;
        
        // تنظیم مقیاس عمودی نمودار برای زوم بهتر
        const min = Math.min(...priceHistory) * 0.9999;
        const max = Math.max(...priceHistory) * 1.0001;
        chart.options.scales.y.min = min;
        chart.options.scales.y.max = max;
        
        chart.update();
    }

    // 3. بروزرسانی تایمر و وضعیت راند
    if (data.round) {
        const elTimer = document.getElementById('timer-text');
        const elPath = document.getElementById('timer-path');
        const elStatus = document.getElementById('round-status');
        
        if(elTimer) elTimer.textContent = data.round.time_left;
        
        if(elPath) {
            // محاسبه درصد دایره
            const pct = (data.round.time_left / 60) * 100;
            elPath.style.strokeDasharray = `${pct}, 100`;
            
            // تغییر رنگ دایره در 15 ثانیه آخر
            if (data.round.time_left <= LOCKOUT_TIME) {
                elPath.style.stroke = "#EF4444"; // قرمز
            } else {
                elPath.style.stroke = "#10B981"; // سبز
            }
        }

        // صدای تیک‌تاک در 5 ثانیه آخر
        if (data.round.time_left <= 5 && data.round.time_left > 0) {
            if (!window['tick_' + data.round.time_left]) {
                SoundFX.tick();
                window['tick_' + data.round.time_left] = true;
            }
        }

        // 4. قفل کردن دکمه‌ها در 15 ثانیه آخر
        if (data.round.time_left <= LOCKOUT_TIME) {
            if(elStatus) {
                elStatus.textContent = "⏳ شرط‌بندی بسته شد! منتظر نتیجه...";
                elStatus.style.color = "#FFD700";
            }
            toggleButtons(true); // غیرفعال کردن دکمه‌ها
        } else {
            if(elStatus) {
                elStatus.textContent = "🟢 شرط‌بندی باز است";
                elStatus.style.color = "#10B981";
            }
            // اگر کاربر شرط نبسته، دکمه‌ها را فعال کن
            if(!data.user_bet) toggleButtons(false);
        }
    }

    // 5. نمایش وضعیت شرط کاربر
    if(data.user_bet) {
        const elStatus = document.getElementById('round-status');
        const typeText = data.user_bet.prediction === 'UP' ? 'خرید (LONG) 📈' : 'فروش (SHORT) 📉';
        if(elStatus) {
            elStatus.textContent = `پوزیشن باز شما: ${typeText}`;
            elStatus.style.color = "#3B82F6"; // آبی
        }
        toggleButtons(true);
        
        // ذخیره لوکال برای چک کردن نتیجه در راند بعدی
        if(data.round) {
            localStorage.setItem('last_bet_round_id', String(data.round.id));
            localStorage.setItem('last_bet_prediction', data.user_bet.prediction);
        }
    }

    // 6. بروزرسانی حباب‌های تاریخچه
    if (data.history) {
        updateHistoryBubbles(data.history);
        checkResult(data.history);
    }
}

// رسم حباب‌های تاریخچه (۱۰ تای آخر)
function updateHistoryBubbles(history) {
    const container = document.getElementById('history-container');
    if(!container) return;
    
    container.innerHTML = ''; // پاک کردن قبلی‌ها
    
    history.slice(0, 10).reverse().forEach(h => {
        const div = document.createElement('div');
        // کلاس استایل بر اساس نتیجه
        const resultClass = h.result === 'UP' ? 'up' : 'down';
        div.className = `history-bubble ${resultClass}`;
        div.textContent = h.result === 'UP' ? '↑' : '↓';
        container.appendChild(div);
    });
}

// بررسی نتیجه شرط قبلی کاربر
function checkResult(history) {
    const myRoundId = localStorage.getItem('last_bet_round_id');
    const myPrediction = localStorage.getItem('last_bet_prediction');
    
    if (!myRoundId || !myPrediction) return;
    
    // پیدا کردن راند تمام شده در تاریخچه
    const finishedRound = history.find(h => String(h.round_id) === String(myRoundId));
    
    if (finishedRound) {
        // پاک کردن استوریج تا دوباره چک نشود
        localStorage.removeItem('last_bet_round_id'); 
        localStorage.removeItem('last_bet_prediction');
        
        if (finishedRound.result === myPrediction) {
            // برنده!
            SoundFX.win();
            tg.showAlert(`🎉 تبریک! شما برنده شدید.\nقیمت بسته شدن: ${finishedRound.end_price}`);
            triggerConfetti(); // افکت کاغذ رنگی
            tg.HapticFeedback.notificationOccurred('success');
        } else {
            // بازنده!
            SoundFX.lose();
            tg.showAlert(`❌ متاسفانه باختید.\nپیش‌بینی شما: ${myPrediction}\nنتیجه: ${finishedRound.result}`);
            tg.HapticFeedback.notificationOccurred('error');
        }
    }
}

// فعال/غیرفعال کردن دکمه‌ها
function toggleButtons(disable) {
    const btnUp = document.getElementById('btn-up');
    const btnDown = document.getElementById('btn-down');
    if(btnUp) btnUp.disabled = disable;
    if(btnDown) btnDown.disabled = disable;
}

// افکت کاغذ رنگی (استفاده از کتابخانه canvas-confetti)
function triggerConfetti() {
    if (typeof confetti === 'function') {
        confetti({ 
            particleCount: 150, 
            spread: 80, 
            origin: { y: 0.6 },
            colors: ['#FFD700', '#10B981', '#3B82F6']
        });
    }
}

// --- ارسال شرط به سرور ---
window.placeBet = async function(pred) {
    const amount = document.getElementById('bet-amount').value;
    
    // انیمیشن پرتاب سکه
    const btnId = pred === 'UP' ? 'btn-up' : 'btn-down';
    animateFlyingChip(btnId, 'btcChart'); // پرتاب به سمت نمودار

    initAudio();
    SoundFX.tick();

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
        
        if (result.status === "success") {
            tg.HapticFeedback.impactOccurred('heavy');
            // پیام موفقیت نمی‌دهیم تا بازی متوقف نشود، فقط وضعیت آپدیت می‌شود
        } else {
            tg.showAlert(`❌ ${result.message}`);
        }
    } catch (e) { 
        tg.showAlert("خطای اتصال به سرور"); 
    }
};

// --- توابع مودال (تاریخچه و لیدربورد) ---

// 1. باز کردن تاریخچه
window.openHistory = async function() {
    const modal = document.getElementById('history-modal');
    const list = document.getElementById('history-list');
    
    if (modal) {
        modal.classList.remove('hidden');
        setTimeout(() => modal.classList.add('active'), 10); // انیمیشن
    }

    // لودینگ
    if (list) list.innerHTML = '<div style="text-align:center;padding:20px;color:#888">⏳ در حال دریافت...</div>';

    // درخواست به سرور (فعلاً ماک)
    try {
        const res = await fetch(`${API_BASE_URL}/webapp/game/user-history`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ initData: tg.initData })
        });
        const data = await res.json();
        
        if(data.status === 'success') {
            // رندر لیست تاریخچه (فعلاً خالی چون دیتابیس پر نیست)
            list.innerHTML = '<div style="text-align:center;padding:20px;color:#888">هنوز تاریخچه‌ای موجود نیست.</div>';
        }
    } catch(e) {
        list.innerHTML = '<div style="text-align:center;color:red">خطای شبکه</div>';
    }
};

// بستن تاریخچه
window.closeHistory = function() {
    const modal = document.getElementById('history-modal');
    if (modal) {
        modal.classList.remove('active');
        setTimeout(() => modal.classList.add('hidden'), 300);
    }
};

// 2. باز کردن لیدربورد
window.openLeaderboard = function() {
    const modal = document.getElementById('leaderboard-modal');
    if (modal) {
        modal.classList.remove('hidden');
        setTimeout(() => modal.classList.add('active'), 10);
    }
    // در فاز بعدی می‌توانید دیتای واقعی لیدربورد را اینجا فچ کنید
};

// بستن لیدربورد
window.closeLeaderboard = function() {
    const modal = document.getElementById('leaderboard-modal');
    if (modal) {
        modal.classList.remove('active');
        setTimeout(() => modal.classList.add('hidden'), 300);
    }
};

// --- نقطه شروع (Entry Point) ---
window.onload = function() {
    tg.ready();
    tg.expand();
    tg.setHeaderColor('#050505');
    
    if (!tg.initData) {
        document.body.innerHTML = "<h3 style='color:white;text-align:center;margin-top:50px'>لطفاً از داخل ربات باز کنید</h3>";
        return;
    }
    
    initChart(); // راه‌اندازی نمودار
    
    // شروع دریافت وضعیت بازی هر 1 ثانیه
    setInterval(fetchState, 1000);
    fetchState(); // اولین فراخوانی فوری
};