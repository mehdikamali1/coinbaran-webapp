(function () {
    'use strict';

    const tg = window.Telegram.WebApp;

    // --------------------------------------------------------------------
    // 🚨 آدرس مستقیم (دقیقاً همان آدرسی که داشبورد با آن کار می‌کند)
    // --------------------------------------------------------------------
    const BASE_DOMAIN = "loans-products-effects-ministers.trycloudflare.com";
    
    const API_BASE_URL = "https://" + BASE_DOMAIN;
    const WS_BASE_URL = "wss://" + BASE_DOMAIN;
    // --------------------------------------------------------------------

    // عناصر صفحه
    const elPrice = document.getElementById('btc-price');
    const elStatus = document.getElementById('round-status');
    
    let ws = null;
    let reconnectInterval = null;
    let currentMinBet = 1.0;
    let chart;
    let priceHistory = [];
    const MAX_DATA_POINTS = 30;

    function init() {
        tg.ready();
        tg.expand();
        
        // اطمینان از وجود کانتینر تاریخچه
        if (!document.getElementById('history-container') && document.getElementById('game-container')) {
             const hc = document.createElement('div');
             hc.id = 'history-container';
             hc.className = 'history-container';
             const container = document.getElementById('game-container');
             const controls = document.querySelector('.bet-controls');
             if(container && controls) container.insertBefore(hc, controls);
        }

        initChart();
        
        // 1. درخواست وضعیت اولیه (HTTP)
        fetchGameStateHTTP();
        
        // 2. اتصال سوکت (WebSocket)
        connectWebSocket();
    }

    async function fetchGameStateHTTP() {
        try {
            // تست درخواست ساده
            const response = await fetch(`${API_BASE_URL}/webapp/game/state`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ initData: tg.initData })
            });

            if (!response.ok) {
                throw new Error(`HTTP Error: ${response.status}`);
            }

            const data = await response.json();
            if (data.status === "success") {
                updateUI(data);
            } else {
                elStatus.textContent = "خطای سرور: " + data.message;
            }
        } catch (e) {
            console.error(e);
            // اگر اینجا ارور داد، یعنی آدرس API_BASE_URL غلط است یا تانل قطع شده
            elStatus.textContent = "❌ عدم دسترسی به سرور";
            elStatus.style.color = "red";
            tg.showAlert("خطای اتصال: " + e.message + "\nآدرس: " + API_BASE_URL);
        }
    }

    function connectWebSocket() {
        if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

        // ساخت آدرس سوکت
        const encodedInitData = btoa(tg.initData || "");
        const socketUrl = `${WS_BASE_URL}/ws/0/${encodedInitData}`;
        
        console.log("Connecting to WS:", socketUrl);
        ws = new WebSocket(socketUrl);

        ws.onopen = () => {
            console.log("✅ WS Connected");
            if (reconnectInterval) { clearInterval(reconnectInterval); reconnectInterval = null; }
        };

        ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                if (msg.type === 'game_update') updateUI(msg);
            } catch (e) { console.error(e); }
        };

        ws.onclose = () => {
            console.log("WS Closed");
            if (!reconnectInterval) reconnectInterval = setInterval(connectWebSocket, 3000);
        };
        
        ws.onerror = (err) => {
            console.error("WS Error:", err);
        };
    }

    function updateUI(data) {
        // قیمت
        if (data.current_price) {
            const price = data.current_price;
            if(elPrice) {
                elPrice.textContent = `$${price.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
                elPrice.classList.remove('loading');
            }
            updateChartData(price);
        }

        // تنظیمات
        if (data.settings) {
            currentMinBet = parseFloat(data.settings.min_bet || 1.0);
        }

        // راند
        if (data.round) {
            const timeLeft = data.round.time_left;
            const total = data.round.duration || 60;
            const percent = (timeLeft / total) * 100;
            
            const elTimerText = document.getElementById('timer-text');
            const elTimerPath = document.getElementById('timer-path');

            if(elTimerText) elTimerText.textContent = timeLeft;
            if(elTimerPath) elTimerPath.style.strokeDasharray = `${percent}, 100`;

            if (timeLeft <= 10) {
                 if(elTimerPath) elTimerPath.style.stroke = '#FF4D4D';
                 elStatus.textContent = "⏳ بسته شد";
                 elStatus.style.color = '#FFC107';
                 disableBetting(true);
            } else {
                 if(elTimerPath) elTimerPath.style.stroke = '#00E096';
                 // اگر کاربر شرط ندارد، باز باشد
                 const myBet = localStorage.getItem(`bet_${data.round.id}`);
                 if (!myBet) {
                    elStatus.textContent = "🟢 باز";
                    elStatus.style.color = '#00E096';
                    disableBetting(false);
                 }
            }
        }
        
        // هیستوری
        if (data.history) updateHistoryDisplay(data.history);
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
                    label: 'BTC',
                    data: Array(MAX_DATA_POINTS).fill(null),
                    borderColor: '#367BFF',
                    borderWidth: 2,
                    pointRadius: 0,
                    fill: false,
                    tension: 0.4
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
    }

    window.placeBet = async function(p) {
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
            if(res.status==='success') tg.showAlert("✅ ثبت شد");
            else { tg.showAlert(res.message); disableBetting(false); }
        } catch(e){ disableBetting(false); }
    };

    document.addEventListener("DOMContentLoaded", init);
})();