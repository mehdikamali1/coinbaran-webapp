(function () {
    'use strict';

    const tg = window.Telegram.WebApp;

    // --------------------------------------------------------------------
    // ✅ آدرس تانل (بدون https)
    const BASE_DOMAIN = "played-amount-governments-lane.trycloudflare.com";
    
    const API_BASE_URL = "https://" + BASE_DOMAIN;
    const WS_BASE_URL = "wss://" + BASE_DOMAIN;
    // --------------------------------------------------------------------

    const elPrice = document.getElementById('btc-price');
    const elStatus = document.getElementById('round-status');
    
    let ws = null;
    let reconnectInterval = null;
    
    // متغیرهای مربوط به TradingView
    let tvChart = null;
    let areaSeries = null;
    let lastTime = 0; // برای اطمینان از ترتیب زمانی داده‌ها

    // --- سیستم صوتی ---
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    let audioCtx = new AudioCtx();
    const SoundFX = {
        playTone: function(freq, type, duration) {
            if (audioCtx.state === 'suspended') audioCtx.resume();
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = type; osc.frequency.value = freq;
            osc.connect(gain); gain.connect(audioCtx.destination);
            osc.start(); gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
            osc.stop(audioCtx.currentTime + duration);
        },
        click: function() { this.playTone(600, 'sine', 0.1); },
        tick: function() { this.playTone(800, 'triangle', 0.05); },
        win: function() { this.playTone(523.25, 'sine', 0.1); setTimeout(()=>this.playTone(784, 'sine', 0.2), 100); setTimeout(()=>this.playTone(1046, 'sine', 0.4), 200); },
        lose: function() { this.playTone(300, 'sawtooth', 0.2); setTimeout(()=>this.playTone(150, 'sawtooth', 0.4), 200); }
    };

    function init() {
        tg.ready();
        tg.expand();
        
        document.body.addEventListener('click', () => {
            if (audioCtx.state === 'suspended') audioCtx.resume();
        }, { once: true });

        setupHistoryContainer();
        
        // راه‌اندازی نمودار TradingView
        initTradingViewChart();
        
        fetchGameStateHTTP();
        connectWebSocket();
    }

    function setupHistoryContainer() {
        if (!document.getElementById('history-container') && document.getElementById('game-container')) {
             const hc = document.createElement('div');
             hc.id = 'history-container'; hc.className = 'history-container';
             const container = document.getElementById('game-container');
             const controls = document.querySelector('.bet-controls');
             if(container && controls) container.insertBefore(hc, controls);
        }
    }

    // --------------------------------------------------------------------------
    // 📊 بخش جدید: تنظیمات نمودار TradingView
    // --------------------------------------------------------------------------
    function initTradingViewChart() {
        const chartContainer = document.getElementById('btcChart');
        if (!chartContainer) return;

        // پاک کردن محتویات قبلی اگر وجود داشت
        chartContainer.innerHTML = '';

        // ساخت نمودار با تم تاریک
        tvChart = LightweightCharts.createChart(chartContainer, {
            layout: {
                background: { type: 'solid', color: 'transparent' }, // پس‌زمینه شفاف
                textColor: '#A0AEC0', // رنگ متن‌ها
            },
            grid: {
                vertLines: { color: 'rgba(43, 59, 82, 0.4)' }, // خطوط عمودی محو
                horzLines: { color: 'rgba(43, 59, 82, 0.4)' }, // خطوط افقی محو
            },
            rightPriceScale: {
                borderColor: 'rgba(43, 59, 82, 0.8)',
                scaleMargins: {
                    top: 0.1,
                    bottom: 0.1,
                },
            },
            timeScale: {
                borderColor: 'rgba(43, 59, 82, 0.8)',
                timeVisible: true,
                secondsVisible: true,
            },
            crosshair: {
                mode: LightweightCharts.CrosshairMode.Normal,
            },
        });

        // افزودن سری داده از نوع Area (ناحیه‌ای) برای زیبایی بیشتر
        areaSeries = tvChart.addAreaSeries({
            topColor: 'rgba(54, 123, 255, 0.4)',
            bottomColor: 'rgba(54, 123, 255, 0.0)',
            lineColor: '#367BFF',
            lineWidth: 2,
        });

        // تنظیم سایز خودکار
        new ResizeObserver(entries => {
            if (entries.length === 0 || !entries[0].target) return;
            const newRect = entries[0].contentRect;
            tvChart.applyOptions({ height: newRect.height, width: newRect.width });
        }).observe(chartContainer);
    }

    // تابع آپدیت داده‌های نمودار
    function updateChartData(price) {
        if (!areaSeries) return;

        // دریافت زمان فعلی به ثانیه
        let time = Math.floor(Date.now() / 1000);

        // اطمینان از اینکه زمان همیشه رو به جلو می‌رود (جلوگیری از داده تکراری در یک ثانیه)
        if (time <= lastTime) {
            time = lastTime + 1;
        }
        lastTime = time;

        // آپدیت نمودار با فرمت {time: ..., value: ...}
        areaSeries.update({
            time: time,
            value: price
        });
    }
    // --------------------------------------------------------------------------

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
        // آپدیت قیمت و نمودار
        if (data.current_price) {
            const price = data.current_price;
            if(elPrice) {
                elPrice.textContent = `$${price.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
                elPrice.classList.remove('loading');
            }
            // فراخوانی تابع جدید آپدیت نمودار
            updateChartData(price);
        }

        // ... (بقیه کدهای تایمر و وضعیت راند بدون تغییر مانده است) ...
        if (data.round) {
            const timeLeft = data.round.time_left;
            const total = data.round.duration || 60;
            const percent = (timeLeft / total) * 100;
            
            const elTimerText = document.getElementById('timer-text');
            const elTimerPath = document.getElementById('timer-path');

            if(elTimerText) elTimerText.textContent = timeLeft;
            if(elTimerPath) elTimerPath.style.strokeDasharray = `${percent}, 100`;

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
        
        if (data.history) {
            updateHistoryDisplay(data.history);
            checkWinLoss(data.history);
        }
    }

    let lastProcessedRoundId = -1;
    function checkWinLoss(history) {
        if (!history || history.length === 0) return;
        const lastFinishedRound = history[0];
        if (lastFinishedRound.round_id === lastProcessedRoundId) return;
        lastProcessedRoundId = lastFinishedRound.round_id;

        const myBet = localStorage.getItem(`bet_${lastFinishedRound.round_id}`);
        if (myBet) {
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
        SoundFX.click();
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
                const state = await fetch(`${API_BASE_URL}/webapp/game/state`, {
                    method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ initData: tg.initData })
                }).then(res => res.json());
                if (state.round) localStorage.setItem(`bet_${state.round.id}`, p);
            }
            else { tg.showAlert(res.message); disableBetting(false); }
        } catch(e){ disableBetting(false); }
    };

    document.addEventListener("DOMContentLoaded", init);
})();