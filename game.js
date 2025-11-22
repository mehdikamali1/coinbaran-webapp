/* webapp/game.js (v7.0 - Final Developer Mode) */
(function () {
    'use strict';

    const tg = window.Telegram.WebApp;
    
    // 1. آدرس‌دهی هوشمند (کار با IP سرور یا لوکال)
    const API_BASE_URL = window.location.origin;

    // عناصر صفحه
    const elPrice = document.getElementById('btc-price');
    const elTimerText = document.getElementById('timer-text');
    const elTimerPath = document.getElementById('timer-path');
    const elStatus = document.getElementById('round-status');
    const btnUp = document.getElementById('btn-up');
    const btnDown = document.getElementById('btn-down');
    const inpAmount = document.getElementById('bet-amount');
    let historyContainer = document.getElementById('history-container');

    // --- سیستم صوتی (AudioContext) ---
    const SoundFX = {
        ctx: new (window.AudioContext || window.webkitAudioContext)(),
        init: function() { if (this.ctx.state === 'suspended') this.ctx.resume(); },
        playTone: function(freq, type, duration, startTime = 0) {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = type; osc.frequency.value = freq;
            osc.connect(gain); gain.connect(this.ctx.destination);
            osc.start(this.ctx.currentTime + startTime);
            gain.gain.setValueAtTime(0.1, this.ctx.currentTime + startTime);
            gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + startTime + duration);
            osc.stop(this.ctx.currentTime + startTime + duration);
        },
        click: function() { this.init(); this.playTone(800, 'sine', 0.1); },
        tick: function() { this.init(); this.playTone(1200, 'triangle', 0.05); },
        win: function() { 
            this.init(); 
            this.playTone(523.25, 'sine', 0.1, 0); 
            this.playTone(659.25, 'sine', 0.1, 0.1); 
            this.playTone(783.99, 'sine', 0.1, 0.2); 
            this.playTone(1046.50, 'sine', 0.4, 0.3); 
        },
        lose: function() { 
            this.init(); 
            this.playTone(150, 'sawtooth', 0.3, 0); 
            this.playTone(140, 'sawtooth', 0.3, 0.2); 
        }
    };

    let chart; 
    let priceHistory = []; 
    const MAX_DATA_POINTS = 30;
    let currentRoundId = null; 
    let lastProcessedRoundId = -1; 

    // راه‌اندازی اولیه
    function init() {
        tg.ready();
        tg.expand();
        tg.setHeaderColor('#1C1C2E'); 
        
        // --- بخش مهم: دور زدن تلگرام برای تست در مرورگر ---
        if (!tg.initData) {
            console.warn("⚠️ Game running in BROWSER MODE (No Telegram)");
            // ساخت دیتای فیک که سرور آن را قبول کند (چون سرور را آپدیت کردیم)
            tg.initData = "query_id=TEST&user=%7B%22id%22%3A111111111%2C%22first_name%22%3A%22Gamer%22%7D&auth_date=1700000000&hash=fake";
        }

        if (!historyContainer && document.getElementById('game-container')) {
             const hc = document.createElement('div');
             hc.id = 'history-container'; hc.className = 'history-container';
             const container = document.getElementById('game-container');
             container.insertBefore(hc, document.querySelector('.bet-controls'));
             historyContainer = hc;
        }

        initChart();
        // شروع لوپ دریافت وضعیت بازی
        setInterval(fetchGameState, 1000);
    }

    function triggerConfetti() {
        if (typeof confetti !== 'function') return;
        const duration = 3000;
        const animationEnd = Date.now() + duration;
        const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 9999 };
        const randomInRange = (min, max) => Math.random() * (max - min) + min;

        const interval = setInterval(function() {
            const timeLeft = animationEnd - Date.now();
            if (timeLeft <= 0) return clearInterval(interval);
            const particleCount = 50 * (timeLeft / duration);
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
                    label: 'BTC Price', data: Array(MAX_DATA_POINTS).fill(null),
                    borderColor: '#367BFF', backgroundColor: gradient,
                    borderWidth: 2, pointRadius: 0, fill: true, tension: 0.4
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { display: false },
                    y: { display: true, position: 'right', grid: { color: '#333' }, ticks: { color: '#888', callback: v => v.toFixed(0) } }
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
        } catch (e) { console.error("Game Sync error:", e); }
    }

    function updateUI(data) {
        const price = data.current_price;
        elPrice.textContent = `$${price.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
        elPrice.classList.remove('loading');
        
        if (priceHistory.length > 0) {
            const lastPrice = priceHistory[priceHistory.length - 1];
            elPrice.style.color = price >= lastPrice ? '#00E096' : '#FF4D4D';
        }
        updateChartData(price);

        if (data.round) {
            currentRoundId = data.round.id;
            const timeLeft = data.round.time_left;
            elTimerText.textContent = timeLeft;
            
            const percentage = (timeLeft / 60) * 100;
            elTimerPath.style.strokeDasharray = `${percentage}, 100`;
            
            if (timeLeft <= 5 && timeLeft > 0) {
                 if (!window[`tick_played_${timeLeft}`]) {
                     SoundFX.tick();
                     window[`tick_played_${timeLeft}`] = true;
                     delete window[`tick_played_${timeLeft + 1}`];
                 }
            }

            if (timeLeft <= 10) {
                elTimerPath.style.stroke = '#FF4D4D';
                elStatus.textContent = "⏳ بسته شد! منتظر کلوز کندل...";
                elStatus.style.color = '#FFC107';
                disableBetting(true);
            } else {
                elTimerPath.style.stroke = '#00E096';
                elStatus.textContent = "🟢 سشن معاملاتی باز است";
                elStatus.style.color = '#00E096';
                if (!data.user_bet) disableBetting(false);
            }
        } else {
            elStatus.textContent = "در انتظار شروع...";
            elTimerText.textContent = "--";
        }

        if (data.user_bet) {
            const type = data.user_bet.prediction; 
            disableBetting(true);
            const typeText = type === 'UP' ? 'خرید (LONG) 📈' : 'فروش (SHORT) 📉';
            elStatus.textContent = `پوزیشن باز شما: ${typeText}`;
            
            if (type === 'UP') btnUp.classList.add('selected');
            if (type === 'DOWN') btnDown.classList.add('selected');
            
            if (currentRoundId) localStorage.setItem(`bet_${currentRoundId}`, type);
        }

        if (data.history) {
            updateHistoryDisplay(data.history);
            checkWinLoss(data.history);
        }
    }

    function updateHistoryDisplay(historyData) {
        if (!historyContainer) return;
        historyContainer.innerHTML = ''; 
        
        const title = document.createElement('div');
        title.className = 'history-title';
        title.textContent = 'روند بازار (۱۰ کندل آخر):';
        historyContainer.appendChild(title);

        const bubblesDiv = document.createElement('div');
        bubblesDiv.className = 'history-bubbles';

        historyData.forEach(round => {
            const bubble = document.createElement('div');
            bubble.className = 'history-bubble';
            if (round.result === 'UP') {
                bubble.classList.add('up'); bubble.textContent = '↑';
            } else if (round.result === 'DOWN') {
                bubble.classList.add('down'); bubble.textContent = '↓';
            } else {
                bubble.classList.add('draw'); bubble.textContent = '-';
            }
            bubblesDiv.appendChild(bubble);
        });
        historyContainer.appendChild(bubblesDiv);
    }

    function checkWinLoss(historyData) {
        if (historyData.length === 0) return;
        const latestRound = historyData[0];
        
        if (latestRound.round_id === lastProcessedRoundId) return;
        lastProcessedRoundId = latestRound.round_id;
        
        const userBet = localStorage.getItem(`bet_${latestRound.round_id}`);
        if (userBet) {
            localStorage.removeItem(`bet_${latestRound.round_id}`);
            if (userBet === latestRound.result) {
                SoundFX.win(); triggerConfetti();
                alert("🎉 تبریک! پوزیشن شما با سود بسته شد.");
                try { tg.HapticFeedback.notificationOccurred('success'); } catch(e){}
            } else if (latestRound.result === 'DRAW') {
                alert("⚪️ بازار خنثی بود. مبلغ برگشت داده شد.");
            } else {
                SoundFX.lose();
                alert("❌ متاسفانه پیش‌بینی اشتباه بود.");
                try { tg.HapticFeedback.notificationOccurred('error'); } catch(e){}
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
        if (!amount || amount < 1) { alert("مبلغ نامعتبر"); return; }

        SoundFX.click();
        try { tg.HapticFeedback.impactOccurred('medium'); } catch(e){}
        
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
                alert(`✅ پوزیشن ${typeText} با موفقیت باز شد!`);
            } else {
                alert(`❌ خطا: ${result.message}`);
                disableBetting(false);
            }
        } catch (e) {
            alert("خطا در ارتباط با سرور معاملات.");
            disableBetting(false);
        } finally {
            btn.classList.remove('loading-btn');
        }
    };

    document.addEventListener("DOMContentLoaded", init);
})();