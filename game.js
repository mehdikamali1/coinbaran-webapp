/* webapp/game.js (نسخه 4.2 - WebSocket Client) */
(function () {
    'use strict';

    const tg = window.Telegram.WebApp;
    
    // ❗️ آدرس تونل خود را بدون https:// اینجا بگذارید (برای سوکت wss:// نیاز است)
    // مثال: "balance-computing-recommend-adds.trycloudflare.com"
    const DOMAIN = "https://complimentary-filing-mood-events.trycloudflare.com"; 
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
        tg.setHeaderColor('#0F0F1A'); 
        
        if (!historyContainer && document.getElementById('game-container')) {
             const hc = document.createElement('div');
             hc.id = 'history-container';
             hc.className = 'history-container';
             const container = document.getElementById('game-container');
             container.insertBefore(hc, document.querySelector('.bet-controls'));
        }

        initChart();
        
        // 1. یک بار درخواست HTTP برای دریافت وضعیت اولیه و تاریخچه
        fetchGameStateHTTP();
        
        // 2. اتصال به سوکت برای آپدیت‌های بعدی
        connectWebSocket();
    }

    function connectWebSocket() {
        if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

        // کد کردن initData برای ارسال در URL (الزامات سرور)
        const encodedInitData = btoa(tg.initData);
        // اتصال به اتاق 0 (بازی کندل)
        ws = new WebSocket(`${WS_BASE_URL}/ws/0/${encodedInitData}`);

        ws.onopen = () => {
            console.log("✅ WebSocket Connected");
            elStatus.textContent = "🟢 متصل به بازار زنده";
            if (reconnectInterval) clearInterval(reconnectInterval);
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
            console.log("⚠️ WebSocket Disconnected. Reconnecting...");
            elStatus.textContent = "⚠️ در حال اتصال مجدد...";
            // تلاش برای اتصال مجدد هر 3 ثانیه
            if (!reconnectInterval) {
                reconnectInterval = setInterval(connectWebSocket, 3000);
            }
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
        } catch (e) { console.error(e); }
    }

    function updateUI(data) {
        if (data.settings) {
            if (data.settings.min_bet) currentMinBet = parseFloat(data.settings.min_bet);
        }
        
        const price = data.current_price;
        elPrice.textContent = `$${price.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
        
        if (priceHistory.length > 0) {
            const lastPrice = priceHistory[priceHistory.length - 1];
            elPrice.style.color = price >= lastPrice ? '#00E096' : '#FF4D4D';
        }
        updateChartData(price);

        if (data.round) {
            currentRoundId = data.round.id;
            const timeLeft = data.round.time_left;
            const totalDuration = data.round.duration || currentRoundDuration;
            currentRoundDuration = totalDuration; 

            elTimerText.textContent = timeLeft;
            const percentage = (timeLeft / totalDuration) * 100;
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
                elStatus.textContent = "⏳ بسته شد!";
                elStatus.style.color = '#FFC107';
                disableBetting(true);
            } else {
                elTimerPath.style.stroke = '#00E096';
                elStatus.textContent = "🟢 باز";
                elStatus.style.color = '#00E096';
                // اگر کاربر شرط نبسته، دکمه‌ها باز باشند
                const myBet = localStorage.getItem(`bet_${currentRoundId}`);
                if (!myBet) disableBetting(false);
            }
        } 

        // اگر در دیتای سوکت bet کاربر هم بود (در آینده) اینجا هندل می‌شود
        // فعلا وضعیت شرط را از لوکال استوریج می‌خوانیم برای UI
        const myBet = localStorage.getItem(`bet_${currentRoundId}`);
        if (myBet) {
             disableBetting(true);
             const typeText = myBet === 'UP' ? 'خرید (LONG)' : 'فروش (SHORT)';
             elStatus.textContent = `پوزیشن شما: ${typeText}`;
             if (myBet === 'UP') btnUp.classList.add('selected');
             if (myBet === 'DOWN') btnDown.classList.add('selected');
        }

        if (data.history) {
            updateHistoryDisplay(data.history);
            checkWinLoss(data.history);
        }
    }

    // ... (بقیه توابع: updateHistoryDisplay, checkWinLoss, updateChartData, disableBetting, triggerConfetti همانند قبل) ...
    // برای کوتاه شدن کد، توابع تکراری بصری را حذف کردم چون در نسخه قبلی دارید و تغییر نکردند.
    // اما تابع placeBet تغییر نکرده و همچنان از HTTP استفاده میکند که عالی است.
    
    // ⚠️ نکته: توابع کمکی پایین فایل قبلی را حتما نگه دارید.

    function initChart() { /* ... کد قبلی ... */ const canvas = document.getElementById('btcChart'); if(!canvas) return; const ctx = canvas.getContext('2d'); const gradient = ctx.createLinearGradient(0,0,0,400); gradient.addColorStop(0,'rgba(54,123,255,0.5)'); gradient.addColorStop(1,'rgba(54,123,255,0.0)'); chart = new Chart(ctx, {type:'line', data:{labels:Array(MAX_DATA_POINTS).fill(''), datasets:[{label:'BTC', data:Array(MAX_DATA_POINTS).fill(null), borderColor:'#367BFF', backgroundColor:gradient, borderWidth:2, pointRadius:0, fill:true, tension:0.4}]}, options:{responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{x:{display:false}, y:{display:true, position:'right', grid:{color:'#333'}, ticks:{color:'#888'}}}, animation:{duration:0}}}); }
    function updateChartData(price) { priceHistory.push(price); if(priceHistory.length > MAX_DATA_POINTS) priceHistory.shift(); if(chart){ chart.data.datasets[0].data = priceHistory; const min = Math.min(...priceHistory)*0.9995; const max = Math.max(...priceHistory)*1.0005; chart.options.scales.y.min=min; chart.options.scales.y.max=max; chart.update(); } }
    function updateHistoryDisplay(h) { const c = document.getElementById('history-container'); if(!c)return; c.innerHTML=''; const d = document.createElement('div'); d.className='history-bubbles'; h.forEach(r=>{ const b=document.createElement('div'); b.className='history-bubble'; if(r.result==='UP'){b.classList.add('up');b.textContent='↑'}else if(r.result==='DOWN'){b.classList.add('down');b.textContent='↓'}else{b.classList.add('draw');b.textContent='-'} d.appendChild(b); }); c.appendChild(d); }
    function checkWinLoss(h) { if(h.length===0)return; const last=h[0]; if(last.round_id===lastProcessedRoundId)return; lastProcessedRoundId=last.round_id; const bet=localStorage.getItem(`bet_${last.round_id}`); if(bet){ localStorage.removeItem(`bet_${last.round_id}`); if(bet===last.result){ SoundFX.win(); tg.showAlert("🎉 برد!"); } else { SoundFX.lose(); tg.showAlert("❌ باخت."); } } }
    function disableBetting(d) { btnUp.disabled=d; btnDown.disabled=d; inpAmount.disabled=d; if(!d){ btnUp.classList.remove('selected'); btnDown.classList.remove('selected'); } }

    window.placeBet = async function(p) {
        const a = parseFloat(inpAmount.value);
        if(!a || a < currentMinBet) { tg.showAlert(`حداقل ${currentMinBet} دلار`); return; }
        disableBetting(true);
        try {
            const r = await fetch(`${API_BASE_URL}/webapp/game/bet`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({initData:tg.initData, amount:a, prediction:p}) });
            const res = await r.json();
            if(res.status==='success') tg.showAlert("✅ ثبت شد");
            else { tg.showAlert(res.message); disableBetting(false); }
        } catch(e){ disableBetting(false); }
    };

    document.addEventListener("DOMContentLoaded", init);
})();