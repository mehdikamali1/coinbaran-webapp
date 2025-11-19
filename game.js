(function () {
    'use strict';

    const tg = window.Telegram.WebApp;
    
    // ❗️❗️❗️ آدرس تونل فعال خود را اینجا قرار دهید ❗️❗️❗️
    const API_BASE_URL = "https://before-surface-thehun-monkey.trycloudflare.com";

    // عناصر صفحه
    const elPrice = document.getElementById('btc-price');
    const elTimerText = document.getElementById('timer-text');
    const elTimerPath = document.getElementById('timer-path');
    const elStatus = document.getElementById('round-status');
    const btnUp = document.getElementById('btn-up');
    const btnDown = document.getElementById('btn-down');
    const inpAmount = document.getElementById('bet-amount');
    
    // کانتینر تاریخچه (باید در HTML وجود داشته باشد یا اینجا ساخته شود)
    const historyContainer = document.getElementById('history-container');

    // صداها
    const audioClick = document.getElementById('audio-click');
    const audioTick = document.getElementById('audio-tick');
    const audioWin = document.getElementById('audio-win');
    const audioLose = document.getElementById('audio-lose');

    let chart; 
    let priceHistory = []; 
    const MAX_DATA_POINTS = 30;
    let currentRoundId = null; // برای ذخیره ID راند جاری
    let lastProcessedRoundId = -1; // برای جلوگیری از تکرار افکت برد/باخت

    // راه‌اندازی اولیه
    function init() {
        tg.ready();
        tg.expand();
        tg.setHeaderColor('#0F0F1A'); 
        
        // اگر کانتینر تاریخچه وجود نداشت، می‌سازیمش (Fail-safe)
        if (!historyContainer && document.getElementById('game-container')) {
             const hc = document.createElement('div');
             hc.id = 'history-container';
             hc.className = 'history-container';
             const container = document.getElementById('game-container');
             container.insertBefore(hc, document.querySelector('.bet-controls'));
        }

        initChart();
        // شروع حلقه دریافت اطلاعات (Polling) هر 1 ثانیه
        setInterval(fetchGameState, 1000);
    }

    function playSound(audioElement) {
        try {
            if(audioElement) {
                audioElement.currentTime = 0;
                audioElement.play().catch(e => console.log("Audio play prevented (user interaction needed):", e));
            }
        } catch (e) { console.error(e); }
    }

    // انیمیشن کاغذ رنگی برای برد
    function triggerConfetti() {
        if (typeof confetti !== 'function') return; // اگر کتابخانه لود نشده بود

        const duration = 3000;
        const animationEnd = Date.now() + duration;
        const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 9999 };

        const randomInRange = (min, max) => Math.random() * (max - min) + min;

        const interval = setInterval(function() {
            const timeLeft = animationEnd - Date.now();
            if (timeLeft <= 0) return clearInterval(interval);

            const particleCount = 50 * (timeLeft / duration);
            // شلیک از دو طرف صفحه
            confetti(Object.assign({}, defaults, { particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } }));
            confetti(Object.assign({}, defaults, { particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } }));
        }, 250);
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
                labels: Array(MAX_DATA_POINTS).fill(''),
                datasets: [{
                    label: 'BTC Price',
                    data: Array(MAX_DATA_POINTS).fill(null),
                    borderColor: '#367BFF',
                    backgroundColor: gradient,
                    borderWidth: 2,
                    pointRadius: 0,
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { display: false },
                    y: { 
                        display: true, position: 'right',
                        grid: { color: '#333' },
                        ticks: { color: '#888', callback: value => value.toFixed(0) }
                    }
                },
                animation: { duration: 0 }
            }
        });
    }

    async function fetchGameState() {
        try {
            const response = await fetch(`${API_BASE_URL}/webapp/game/state`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ initData: tg.initData })
            });
            
            if (!response.ok) return;
            const data = await response.json();
            if (data.status === "success") updateUI(data);
        } catch (e) { console.error("Sync error:", e); }
    }

    function updateUI(data) {
        // 1. قیمت
        const price = data.current_price;
        elPrice.textContent = `$${price.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
        elPrice.classList.remove('loading');
        
        if (priceHistory.length > 0) {
            const lastPrice = priceHistory[priceHistory.length - 1];
            elPrice.style.color = price >= lastPrice ? '#00E096' : '#FF4D4D';
        }
        updateChartData(price);

        // 2. اطلاعات راند
        if (data.round) {
            currentRoundId = data.round.id; // ذخیره ID راند جاری
            const timeLeft = data.round.time_left;
            elTimerText.textContent = timeLeft;
            
            const percentage = (timeLeft / 60) * 100;
            elTimerPath.style.strokeDasharray = `${percentage}, 100`;
            
            // افکت صوتی تیک‌تاک (در 5 ثانیه آخر)
            if (timeLeft <= 5 && timeLeft > 0) playSound(audioTick);

            if (timeLeft <= 10) {
                elTimerPath.style.stroke = '#FF4D4D';
                elStatus.textContent = "⏳ ثبت پوزیشن بسته شد! منتظر کلوز کندل...";
                elStatus.style.color = '#FFC107';
                disableBetting(true);
            } else {
                elTimerPath.style.stroke = '#00E096';
                elStatus.textContent = "🟢 سشن معاملاتی باز است";
                elStatus.style.color = '#00E096';
                
                if (!data.user_bet) {
                    disableBetting(false);
                }
            }
        } else {
            elStatus.textContent = "در انتظار شروع سشن جدید...";
            elTimerText.textContent = "--";
        }

        // 3. وضعیت پوزیشن کاربر
        if (data.user_bet) {
            const type = data.user_bet.prediction; 
            disableBetting(true);
            const typeText = type === 'UP' ? 'خرید (LONG) 📈' : 'فروش (SHORT) 📉';
            elStatus.textContent = `پوزیشن باز شما: ${typeText}`;
            
            if (type === 'UP') btnUp.classList.add('selected');
            if (type === 'DOWN') btnDown.classList.add('selected');
            
            // ذخیره شرط در LocalStorage برای بررسی نتیجه در آینده
            if (currentRoundId) {
                localStorage.setItem(`bet_${currentRoundId}`, type);
            }
        }

        // 4. تاریخچه و بررسی برد/باخت
        if (data.history) {
            updateHistoryDisplay(data.history);
            checkWinLoss(data.history);
        }
    }

    function updateHistoryDisplay(historyData) {
        const container = document.getElementById('history-container');
        if (!container) return;

        container.innerHTML = ''; 
        
        const title = document.createElement('div');
        title.className = 'history-title';
        title.textContent = 'روند بازار (۱۰ کندل آخر):';
        container.appendChild(title);

        const bubblesDiv = document.createElement('div');
        bubblesDiv.className = 'history-bubbles';

        historyData.forEach(round => {
            const bubble = document.createElement('div');
            bubble.className = 'history-bubble';
            if (round.result === 'UP') {
                bubble.classList.add('up');
                bubble.textContent = '↑';
            } else if (round.result === 'DOWN') {
                bubble.classList.add('down');
                bubble.textContent = '↓';
            } else {
                bubble.classList.add('draw');
                bubble.textContent = '-';
            }
            bubblesDiv.appendChild(bubble);
        });
        container.appendChild(bubblesDiv);
    }

    // بررسی اینکه آیا آخرین راند تمام شده، راندی بوده که کاربر در آن شرط بسته؟
    function checkWinLoss(historyData) {
        if (historyData.length === 0) return;
        
        const latestRound = historyData[0]; // آخرین راند تمام شده
        
        // اگر این راند را قبلاً بررسی کردیم، دوباره کاری نکن
        if (latestRound.round_id === lastProcessedRoundId) return;
        
        lastProcessedRoundId = latestRound.round_id;
        
        // آیا کاربر روی این راند شرط بسته بود؟
        const userBet = localStorage.getItem(`bet_${latestRound.round_id}`);
        if (userBet) {
            // پاک کردن شرط از حافظه
            localStorage.removeItem(`bet_${latestRound.round_id}`);
            
            if (userBet === latestRound.result) {
                // برد!
                playSound(audioWin);
                triggerConfetti();
                tg.showAlert("🎉 تبریک! پوزیشن شما با سود بسته شد.");
                tg.HapticFeedback.notificationOccurred('success');
            } else if (latestRound.result === 'DRAW') {
                // مساوی (برگشت پول)
                tg.showAlert("⚪️ بازار خنثی بود. مبلغ برگشت داده شد.");
            } else {
                // باخت
                playSound(audioLose);
                tg.showAlert("❌ متاسفانه پیش‌بینی اشتباه بود.");
                tg.HapticFeedback.notificationOccurred('error');
            }
        }
    }

    function updateChartData(price) {
        priceHistory.push(price);
        if (priceHistory.length > MAX_DATA_POINTS) priceHistory.shift();
        
        if (chart && chart.data) {
            chart.data.datasets[0].data = priceHistory;
            const minPrice = Math.min(...priceHistory) * 0.9995;
            const maxPrice = Math.max(...priceHistory) * 1.0005;
            chart.options.scales.y.min = minPrice;
            chart.options.scales.y.max = maxPrice;
            chart.update();
        }
    }

    function disableBetting(disabled) {
        btnUp.disabled = disabled;
        btnDown.disabled = disabled;
        inpAmount.disabled = disabled;
        if (!disabled) {
            btnUp.classList.remove('selected');
            btnDown.classList.remove('selected');
        }
    }

    window.placeBet = async function(prediction) {
        const amount = parseInt(inpAmount.value);
        if (!amount || amount < 1) {
            tg.showAlert("لطفاً مبلغ ورود معتبری وارد کنید.");
            return;
        }

        tg.HapticFeedback.impactOccurred('medium');
        playSound(audioClick);
        
        disableBetting(true);
        const btn = prediction === 'UP' ? btnUp : btnDown;
        btn.classList.add('loading-btn');

        try {
            const response = await fetch(`${API_BASE_URL}/webapp/game/bet`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    initData: tg.initData,
                    amount: amount,
                    prediction: prediction
                })
            });
            
            const result = await response.json();
            
            if (result.status === "success") {
                const typeText = prediction === 'UP' ? 'خرید (LONG)' : 'فروش (SHORT)';
                tg.showAlert(`✅ پوزیشن ${typeText} با موفقیت باز شد!`);
            } else {
                tg.showAlert(`❌ خطا: ${result.message}`);
                disableBetting(false);
            }
        } catch (e) {
            tg.showAlert("خطا در ارتباط با سرور معاملات.");
            disableBetting(false);
        } finally {
            btn.classList.remove('loading-btn');
        }
    };

    document.addEventListener("DOMContentLoaded", init);

})();