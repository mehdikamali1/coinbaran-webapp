(function () {
    'use strict';

    const tg = window.Telegram.WebApp;

    // --------------------------------------------------------------------
    // ✅ آدرس تانل شما (به این دست نزن اگر درست است)
    const BASE_DOMAIN = "loans-products-effects-ministers.trycloudflare.com";
    
    const API_BASE_URL = "https://" + BASE_DOMAIN;
    const WS_BASE_URL = "wss://" + BASE_DOMAIN;
    // --------------------------------------------------------------------

    const elPrice = document.getElementById('btc-price');
    const elStatus = document.getElementById('round-status');
    
    let ws = null;
    let reconnectInterval = null;
    let currentMinBet = 1.0;
    let chart;
    let priceHistory = [];
    const MAX_DATA_POINTS = 30;
    let lastProcessedRoundId = -1; // برای جلوگیری از تکرار پیام برد/باخت

    // --- سیستم صوتی اصلاح شده ---
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    let audioCtx = new AudioCtx();

    const SoundFX = {
        playTone: function(freq, type, duration) {
            if (audioCtx.state === 'suspended') audioCtx.resume();
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = type;
            osc.frequency.value = freq;
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start();
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
            osc.stop(audioCtx.currentTime + duration);
        },
        click: function() { this.playTone(600, 'sine', 0.1); },
        tick: function() { this.playTone(800, 'triangle', 0.05); },
        win: function() { 
            this.playTone(523.25, 'sine', 0.1); 
            setTimeout(()=>this.playTone(784, 'sine', 0.2), 100); 
            setTimeout(()=>this.playTone(1046, 'sine', 0.4), 200); 
        },
        lose: function() { 
            this.playTone(300, 'sawtooth', 0.2); 
            setTimeout(()=>this.playTone(150, 'sawtooth', 0.4), 200); 
        }
    };

    function init() {
        tg.ready();
        tg.expand();
        
        // فعال‌سازی صدا با اولین لمس صفحه
        document.body.addEventListener('click', () => {
            if (audioCtx.state === 'suspended') audioCtx.resume();
        }, { once: true });

        if (!document.getElementById('history-container') && document.getElementById('game-container')) {
             const hc = document.createElement('div');
             hc.id = 'history-container';
             hc.className = 'history-container';
             const container = document.getElementById('game-container');
             const controls = document.querySelector('.bet-controls');
             if(container && controls) container.insertBefore(hc, controls);
        }

        initChart();
        fetchGameStateHTTP();
        connectWebSocket();
    }

    async function fetchGameStateHTTP() {
        try {
            const response = await fetch(`${API_BASE_URL}/webapp/game/state`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ initData: tg.initData })
            });
            const data = await response.json();
            if (data.status === "success") updateUI(data);
        } catch (e) {
            elStatus.textContent = "❌ قطع ارتباط با سرور";
            elStatus.style.color = "red";
        }
    }

    function connectWebSocket() {
        if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
        const encodedInitData = btoa(tg.initData || "");
        ws = new WebSocket(`${WS_BASE_URL}/ws/0/${encodedInitData}`);

        ws.onopen = () => {
            if (reconnectInterval) { clearInterval(reconnectInterval); reconnectInterval = null; }
        };
        ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                if (msg.type === 'game_update') updateUI(msg);
            } catch (e) {}
        };
        ws.onclose = () => {
            if (!reconnectInterval) reconnectInterval = setInterval(connectWebSocket, 3000);
        };
    }

    function updateUI(data) {
        if (data.current_price) {
            const price = data.current_price;
            if(elPrice) {
                elPrice.textContent = `$${price.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
                elPrice.classList.remove('loading');
            }
            updateChartData(price);
        }

        if (data.settings) currentMinBet = parseFloat(data.settings.min_bet || 1.0);

        if (data.round) {
            const timeLeft = data.round.time_left;
            const total = data.round.duration || 60;
            const percent = (timeLeft / total) * 100;
            
            const elTimerText = document.getElementById('timer-text');
            const elTimerPath = document.getElementById('timer-path');

            if(elTimerText) elTimerText.textContent = timeLeft;
            if(elTimerPath) elTimerPath.style.strokeDasharray = `${percent}, 100`;

            // صدای تیک تاک در ۵ ثانیه آخر
            if (timeLeft <= 5 && timeLeft > 0) {
                 if (!window[`tick_${data.round.id}_${timeLeft}`]) {
                     SoundFX.tick();
                     window[`tick_${data.round.id}_${timeLeft}`] = true;
                 }
            }

            if (timeLeft <= 10) {
                 if(elTimerPath) elTimerPath.style.stroke = '#FF4D4D';
                 elStatus.textContent = "⏳ بسته شد";
                 elStatus.style.color = '#FFC107';
                 disableBetting(true);
            } else {
                 if(elTimerPath) elTimerPath.style.stroke = '#00E096';
                 const myBet = localStorage.getItem(`bet_${data.round.id}`);
                 if (myBet) {
                     elStatus.textContent = `شرط شما: ${myBet === 'UP' ? '↑ خرید' : '↓ فروش'}`;
                     elStatus.style.color = '#367BFF';
                     disableBetting(true);
                 } else {
                     elStatus.textContent = "🟢 شرط‌بندی باز است";
                     elStatus.style.color = '#00E096';
                     disableBetting(false);
                 }
            }
        }
        
        // بررسی برد و باخت با استفاده از تاریخچه
        if (data.history) {
            updateHistoryDisplay(data.history);
            checkWinLoss(data.history);
        }
    }

    function checkWinLoss(history) {
        if (!history || history.length === 0) return;
        
        const lastFinishedRound = history[0];
        
        // اگر این راند را قبلاً پردازش کرده‌ایم، بیخیال شو
        if (lastFinishedRound.round_id === lastProcessedRoundId) return;
        lastProcessedRoundId = lastFinishedRound.round_id;

        // آیا کاربر در این راند شرط داشته؟
        const myBet = localStorage.getItem(`bet_${lastFinishedRound.round_id}`);
        
        if (myBet) {
            // پاک کردن شرط از حافظه
            localStorage.removeItem(`bet_${lastFinishedRound.round_id}`);
            
            if (myBet === lastFinishedRound.result) {
                SoundFX.win();
                tg.showAlert(`🎉 تبریک! شما برنده شدید.\nقیمت نهایی: $${lastFinishedRound.end_price}`);
                try { confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } }); } catch(e){}
            } else if (lastFinishedRound.result === 'DRAW') {
                tg.showAlert("🤝 راند مساوی شد. پول برگشت داده شد.");
            } else {
                SoundFX.lose();
                tg.showAlert(`❌ متاسفانه باختید.\nجهت حرکت: ${lastFinishedRound.result}`);
            }
        }
    }

    function initChart() {
        const canvas = document.getElementById('btcChart');
        if(!canvas) return;
        const ctx = canvas.getContext('2d');
        if(typeof Chart === 'undefined') return;
        chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: Array(MAX_DATA_POINTS).fill(''),
                datasets: [{
                    label: 'BTC', data: Array(MAX_DATA_POINTS).fill(null),
                    borderColor: '#367BFF', borderWidth: 2, pointRadius: 0, fill: false, tension: 0.4
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: {display: false} },
                scales: { x: {display: false}, y: {display: true, position:'right'} },
                animation: { duration: 0 }
            }
        });
    }

    function updateChartData(price) {
        priceHistory.push(price);
        if(priceHistory.length > MAX_DATA_POINTS) priceHistory.shift();
        if(chart) {
            chart.data.datasets[0].data = priceHistory;
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
            if(r.result==='UP') {b.classList.add('up'); b.textContent='↑';}
            else if(r.result==='DOWN') {b.classList.add('down'); b.textContent='↓';}
            else {b.classList.add('draw'); b.textContent='-';}
            d.appendChild(b);
        });
        c.appendChild(d);
    }

    function disableBetting(d) {
        const btnUp = document.getElementById('btn-up');
        const btnDown = document.getElementById('btn-down');
        const inp = document.getElementById('bet-amount');
        if(btnUp) btnUp.disabled = d;
        if(btnDown) btnDown.disabled = d;
        if(inp) inp.disabled = d;
        if(!d) {
            if(btnUp) btnUp.classList.remove('selected');
            if(btnDown) btnDown.classList.remove('selected');
        }
    }

    window.placeBet = async function(p) {
        SoundFX.click(); // صدای کلیک
        const inp = document.getElementById('bet-amount');
        const a = parseFloat(inp.value);
        disableBetting(true);
        try {
            const r = await fetch(`${API_BASE_URL}/webapp/game/bet`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ initData: tg.initData, amount: a, prediction: p })
            });
            const res = await r.json();
            if(res.status==='success') {
                tg.showAlert("✅ ثبت شد");
                // ذخیره شرط در حافظه برای بررسی برد/باخت
                // ما نیاز به ID راند داریم، پس موقتا یک درخواست آپدیت میزنیم
                const state = await fetch(`${API_BASE_URL}/webapp/game/state`, {
                    method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ initData: tg.initData })
                }).then(res => res.json());
                
                if (state.round) {
                    localStorage.setItem(`bet_${state.round.id}`, p);
                }
            }
            else { tg.showAlert(res.message); disableBetting(false); }
        } catch(e){ disableBetting(false); }
    };

    document.addEventListener("DOMContentLoaded", init);
})();