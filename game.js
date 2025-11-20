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
    
    // متغیرهای نمودار
    let tvChart = null;
    let areaSeries = null;
    let lastTime = 0;

    // --- سیستم صوتی ---
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    let audioCtx = new AudioCtx();
    
    function playSound(type) {
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain); gain.connect(audioCtx.destination);
        
        if (type === 'win') {
            osc.frequency.value = 523.25; osc.type = 'sine';
            osc.start(); osc.stop(audioCtx.currentTime + 0.1);
        } else if (type === 'lose') {
            osc.frequency.value = 150; osc.type = 'sawtooth';
            osc.start(); osc.stop(audioCtx.currentTime + 0.2);
        } else {
            osc.frequency.value = 800; osc.type = 'triangle';
            osc.start(); osc.stop(audioCtx.currentTime + 0.05);
        }
    }

    function init() {
        tg.ready();
        tg.expand();
        
        document.body.addEventListener('click', () => {
            if (audioCtx.state === 'suspended') audioCtx.resume();
        }, { once: true });

        setupHistoryContainer();
        
        // ساخت نمودار
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
    // 📊 تنظیمات دقیق نمودار TradingView
    // --------------------------------------------------------------------------
    function initTradingViewChart() {
        const chartContainer = document.getElementById('btcChart');
        if (!chartContainer) return;

        chartContainer.innerHTML = '';

        // ایجاد نمودار
        tvChart = LightweightCharts.createChart(chartContainer, {
            width: chartContainer.clientWidth,
            height: 250, // ارتفاع ثابت برای اطمینان از نمایش
            layout: {
                background: { type: 'solid', color: 'transparent' },
                textColor: '#A0AEC0',
            },
            grid: {
                vertLines: { color: 'rgba(43, 59, 82, 0.2)' },
                horzLines: { color: 'rgba(43, 59, 82, 0.2)' },
            },
            timeScale: {
                borderColor: 'rgba(43, 59, 82, 0.8)',
                timeVisible: true,
                secondsVisible: true,
            },
            rightPriceScale: {
                borderColor: 'rgba(43, 59, 82, 0.8)',
            },
        });

        // اضافه کردن سری داده (Area Chart - مناسب برای دیتای تک قیمتی)
        areaSeries = tvChart.addAreaSeries({
            topColor: 'rgba(54, 123, 255, 0.5)',
            bottomColor: 'rgba(54, 123, 255, 0.0)',
            lineColor: '#367BFF',
            lineWidth: 2,
        });

        // ریسایز خودکار
        new ResizeObserver(entries => {
            if (entries.length === 0 || !entries[0].target) return;
            const newRect = entries[0].contentRect;
            tvChart.applyOptions({ width: newRect.width, height: newRect.height });
        }).observe(chartContainer);
    }

    function updateChartData(price) {
        if (!areaSeries) return;

        let time = Math.floor(Date.now() / 1000);
        // اصلاح زمان برای جلوگیری از ارور TradingView (تکرار زمان)
        if (time <= lastTime) {
            time = lastTime + 1;
        }
        lastTime = time;

        // آپدیت دیتا
        areaSeries.update({ time: time, value: price });
        
        // 🚨 نکته کلیدی: فیت کردن نمودار برای اینکه خط دیده شود
        // (اگر داده‌ها کم باشند، نمودار ممکن است خالی دیده شود مگر اینکه فیت شود)
        // tvChart.timeScale().fitContent(); 
        // یا اسکرول خودکار به آخرین نقطه:
        tvChart.timeScale().scrollToRealTime();
    }
    // --------------------------------------------------------------------------

    async function fetchGameStateHTTP() {
        try {
            const response = await fetch(`${API_BASE_URL}/webapp/game/state`, {
                method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ initData: tg.initData })
            });
            const data = await response.json();
            if (data.status === "success") updateUI(data);
        } catch (e) { elStatus.textContent = "❌ قطع ارتباط"; }
    }

    function connectWebSocket() {
        if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
        const encodedInitData = btoa(tg.initData || "");
        ws = new WebSocket(`${WS_BASE_URL}/ws/0/${encodedInitData}`);

        ws.onopen = () => { if (reconnectInterval) { clearInterval(reconnectInterval); reconnectInterval = null; } };
        ws.onmessage = (event) => { try { const msg = JSON.parse(event.data); if (msg.type === 'game_update') updateUI(msg); } catch (e) {} };
        ws.onclose = () => { if (!reconnectInterval) reconnectInterval = setInterval(connectWebSocket, 3000); };
    }

    function updateUI(data) {
        // 1. آپدیت قیمت و نمودار
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

            if (timeLeft <= 5 && timeLeft > 0) {
                 if (!window[`tick_${data.round.id}_${timeLeft}`]) {
                     playSound('tick');
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
                     elStatus.textContent = "🟢 باز";
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
        const last = history[0];
        if (last.round_id === lastProcessedRoundId) return;
        lastProcessedRoundId = last.round_id;

        const myBet = localStorage.getItem(`bet_${last.round_id}`);
        if (myBet) {
            localStorage.removeItem(`bet_${last.round_id}`);
            if (myBet === last.result) {
                playSound('win');
                tg.showAlert(`🎉 تبریک! بردید.\nقیمت: $${last.end_price}`);
                try { confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } }); } catch(e){}
            } else if (last.result === 'DRAW') {
                tg.showAlert("🤝 مساوی.");
            } else {
                playSound('lose');
                tg.showAlert(`❌ باختید.\nجهت: ${last.result}`);
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
        playSound('tick');
        const inp = document.getElementById('bet-amount');
        const a = parseFloat(inp.value);
        disableBetting(true);
        try {
            const r = await fetch(`${API_BASE_URL}/webapp/game/bet`, {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ initData: tg.initData, amount: a, prediction: p })
            });
            const res = await r.json();
            if(res.status==='success') {
                tg.showAlert("✅ ثبت شد");
                const state = await fetch(`${API_BASE_URL}/webapp/game/state`, {
                    method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ initData: tg.initData })
                }).then(res => res.json());
                if (state.round) localStorage.setItem(`bet_${state.round.id}`, p);
            } else { tg.showAlert(res.message); disableBetting(false); }
        } catch(e){ disableBetting(false); }
    };

    document.addEventListener("DOMContentLoaded", init);
})();