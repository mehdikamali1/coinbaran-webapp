/* webapp/game.js
(function () {
    'use strict';

    const tg = window.Telegram.WebApp;
    
    // 🚨 اصلاح مهم: آدرس را بدون https:// بنویسید
    const DOMAIN = "https://army-occupations-mistakes-chen.trycloudflare.com"; 
    
    const API_BASE_URL = `https://${DOMAIN}`;
    const WS_BASE_URL = `wss://${DOMAIN}`;

    // عناصر صفحه
    const elPrice = document.getElementById('btc-price');
    const elTimerText = document.getElementById('timer-text');
    const elTimerPath = document.getElementById('timer-path');
    const elStatus = document.getElementById('round-status');
    const btnUp = document.getElementById('btn-up');
    const btnDown = document.getElementById('btn-down');
    const inpAmount = document.getElementById('bet-amount');
    
    let historyContainer = document.getElementById('history-container');

    let currentMinBet = 1.0;
    let currentRoundDuration = 60; 
    let ws = null;
    let reconnectInterval = null;

    // --- سیستم صوتی ---
    const SoundFX = {
        ctx: new (window.AudioContext || window.webkitAudioContext)(),
        init: function() { if (this.ctx.state === 'suspended') this.ctx.resume(); },
        playTone: function(freq, type, duration) {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = type;
            osc.frequency.value = freq;
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start();
            gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
            osc.stop(this.ctx.currentTime + duration);
        },
        click: function() { this.init(); this.playTone(800, 'sine', 0.1); },
        tick: function() { this.init(); this.playTone(1200, 'triangle', 0.05); },
        win: function() { this.init(); this.playTone(523.25, 'sine', 0.1); setTimeout(()=>this.playTone(784, 'sine', 0.2), 100); },
        lose: function() { this.init(); this.playTone(150, 'sawtooth', 0.3); }
    };

    let chart; 
    let priceHistory = []; 
    const MAX_DATA_POINTS = 30;
    let currentRoundId = null; 
    let lastProcessedRoundId = -1; 

    function init() {
        tg.ready();
        tg.expand();
        try { tg.setHeaderColor('#0F0F1A'); } catch(e){}
        
        if (!historyContainer && document.getElementById('game-container')) {
             const hc = document.createElement('div');
             hc.id = 'history-container';
             hc.className = 'history-container';
             const container = document.getElementById('game-container');
             const controls = document.querySelector('.bet-controls');
             if(container && controls) container.insertBefore(hc, controls);
        }

        initChart();
        
        // 1. دریافت وضعیت اولیه
        fetchGameStateHTTP();
        
        // 2. اتصال به سوکت
        connectWebSocket();
    }

    function connectWebSocket() {
        if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

        const encodedInitData = btoa(tg.initData || "");
        // اتصال به وب‌سوکت با آدرس صحیح
        ws = new WebSocket(`${WS_BASE_URL}/ws/0/${encodedInitData}`);

        ws.onopen = () => {
            console.log("✅ WebSocket Connected");
            elStatus.textContent = "🟢 متصل به بازار زنده";
            elStatus.style.color = "#00E096";
            if (reconnectInterval) {
                clearInterval(reconnectInterval);
                reconnectInterval = null;
            }
        };

        ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                if (msg.type === 'game_update') {
                    updateUI(msg);
                }
            } catch (e) { console.error(e); }
        };

        ws.onclose = () => {
            console.log("⚠️ WebSocket Disconnected");
            elStatus.textContent = "⚠️ در حال اتصال...";
            elStatus.style.color = "#FFC107";
            if (!reconnectInterval) {
                reconnectInterval = setInterval(connectWebSocket, 3000);
            }
        };
        
        ws.onerror = (err) => {
            console.error("WebSocket Error:", err);
            ws.close();
        };
    }

    async function fetchGameStateHTTP() {
        try {
            const response = await fetch(`${API_BASE_URL}/webapp/game/state`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ initData: tg.initData })
            });
            if (response.ok) {
                const data = await response.json();
                if (data.status === "success") updateUI(data);
            }
        } catch (e) { console.error("HTTP Fetch Error:", e); }
    }

    function updateUI(data) {
        // تنظیمات
        if (data.settings && data.settings.min_bet) {
            currentMinBet = parseFloat(data.settings.min_bet);
        }
        
        // قیمت
        const price = data.current_price;
        elPrice.textContent = `$${price.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
        elPrice.classList.remove('loading');
        
        if (priceHistory.length > 0) {
            const lastPrice = priceHistory[priceHistory.length - 1];
            elPrice.style.color = price >= lastPrice ? '#00E096' : '#FF4D4D';
        }
        updateChartData(price);

        // راند
        if (data.round) {
            currentRoundId = data.round.id;
            const timeLeft = data.round.time_left;
            const totalDuration = data.round.duration || currentRoundDuration;
            currentRoundDuration = totalDuration; 

            elTimerText.textContent = timeLeft;
            const percentage = (timeLeft / totalDuration) * 100;
            elTimerPath.style.strokeDasharray = `${percentage}, 100`;
            
            // افکت صوتی تیک‌تاک
            if (timeLeft <= 5 && timeLeft > 0) {
                 if (!window[`tick_played_${timeLeft}`]) {
                      SoundFX.tick();
                      window[`tick_played_${timeLeft}`] = true;
                      // پاک کردن کلید قبلی برای جلوگیری از پر شدن حافظه
                      delete window[`tick_played_${timeLeft + 1}`];
                 }
            }

            if (timeLeft <= 10) {
                elTimerPath.style.stroke = '#FF4D4D';
                elStatus.textContent = "⏳ بسته شد!";
                elStatus.style.color = '#FFC107';
                disableBetting(true);
            } else {
                elTimerPath.style.stroke = '#00E096';
                // اگر کاربر شرط ندارد، وضعیت را باز نشان بده
                const myBet = localStorage.getItem(`bet_${currentRoundId}`);
                if (!myBet) {
                    elStatus.textContent = "🟢 باز";
                    elStatus.style.color = '#00E096';
                    disableBetting(false);
                }
            }
        } 

        // بررسی وضعیت شرط کاربر
        const myBet = localStorage.getItem(`bet_${currentRoundId}`);
        if (myBet) {
             disableBetting(true);
             const typeText = myBet === 'UP' ? 'خرید (LONG)' : 'فروش (SHORT)';
             elStatus.textContent = `پوزیشن شما: ${typeText}`;
             elStatus.style.color = '#367BFF';
             if (myBet === 'UP') btnUp.classList.add('selected');
             if (myBet === 'DOWN') btnDown.classList.add('selected');
        }

        // تاریخچه
        if (data.history) {
            updateHistoryDisplay(data.history);
            checkWinLoss(data.history);
        }
    }

    // --- توابع گرافیکی و چارت ---
    
    function initChart() {
        const canvas = document.getElementById('btcChart');
        if(!canvas) return;
        const ctx = canvas.getContext('2d');
        const gradient = ctx.createLinearGradient(0,0,0,400);
        gradient.addColorStop(0,'rgba(54,123,255,0.5)');
        gradient.addColorStop(1,'rgba(54,123,255,0.0)');
        
        chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: Array(MAX_DATA_POINTS).fill(''),
                datasets: [{
                    label: 'BTC',
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
                plugins: { legend: {display: false} },
                scales: {
                    x: { display: false },
                    y: { display: true, position: 'right', grid: {color: '#333'}, ticks: {color: '#888'} }
                },
                animation: { duration: 0 }
            }
        });
    }

    function updateChartData(price) {
        priceHistory.push(price);
        if(priceHistory.length > MAX_DATA_POINTS) priceHistory.shift();
        
        if(chart){
            chart.data.datasets[0].data = priceHistory;
            // زوم داینامیک روی نمودار
            const min = Math.min(...priceHistory) * 0.9995;
            const max = Math.max(...priceHistory) * 1.0005;
            chart.options.scales.y.min = min;
            chart.options.scales.y.max = max;
            chart.update();
        }
    }

    function updateHistoryDisplay(h) {
        const c = document.getElementById('history-container');
        if(!c) return;
        c.innerHTML = '';
        const d = document.createElement('div');
        d.className = 'history-bubbles';
        h.forEach(r => {
            const b = document.createElement('div');
            b.className = 'history-bubble';
            if(r.result === 'UP') { b.classList.add('up'); b.textContent = '↑'; }
            else if(r.result === 'DOWN') { b.classList.add('down'); b.textContent = '↓'; }
            else { b.classList.add('draw'); b.textContent = '-'; }
            d.appendChild(b);
        });
        c.appendChild(d);
    }

    function checkWinLoss(h) {
        if(h.length === 0) return;
        const last = h[0];
        // جلوگیری از پخش تکراری صدا برای یک راند
        if(last.round_id === lastProcessedRoundId) return;
        lastProcessedRoundId = last.round_id;
        
        const bet = localStorage.getItem(`bet_${last.round_id}`);
        if(bet) {
            // پاک کردن شرط از حافظه چون تمام شد
            localStorage.removeItem(`bet_${last.round_id}`);
            if(bet === last.result) {
                SoundFX.win();
                triggerConfetti();
                tg.showAlert("🎉 تبریک! شما برنده شدید.");
            } else {
                SoundFX.lose();
                tg.showAlert("❌ متاسفانه باختید.");
            }
        }
    }

    function triggerConfetti() {
        if(typeof confetti === 'function') {
            confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
        }
    }

    function disableBetting(d) {
        if(btnUp) btnUp.disabled = d;
        if(btnDown) btnDown.disabled = d;
        if(inpAmount) inpAmount.disabled = d;
        if(!d) {
            if(btnUp) btnUp.classList.remove('selected');
            if(btnDown) btnDown.classList.remove('selected');
        }
    }

    // تابع گلوبال برای دکمه‌های HTML
    window.placeBet = async function(p) {
        const a = parseFloat(inpAmount.value);
        if(!a || a < currentMinBet) {
            tg.showAlert(`حداقل مبلغ ورودی ${currentMinBet} دلار است.`);
            return;
        }
        
        disableBetting(true);
        
        try {
            const r = await fetch(`${API_BASE_URL}/webapp/game/bet`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ initData: tg.initData, amount: a, prediction: p })
            });
            const res = await r.json();
            
            if(res.status === 'success') {
                tg.showAlert("✅ پوزیشن شما با موفقیت ثبت شد");
                // ذخیره موقت برای نمایش وضعیت در UI
                if(currentRoundId) {
                    localStorage.setItem(`bet_${currentRoundId}`, p);
                    updateUI({ round: { id: currentRoundId } }); // رفرش ظاهری
                }
            } else {
                tg.showAlert(res.message);
                disableBetting(false);
            }
        } catch(e) {
            console.error(e);
            tg.showAlert("خطا در ارتباط با سرور");
            disableBetting(false);
        }
    };

    document.addEventListener("DOMContentLoaded", init);
})();