(function () {
    'use strict';

    const tg = window.Telegram.WebApp;

    // ✅ آدرس تانل (بدون https)
    const BASE_DOMAIN = "/played-amount-governments-lane.trycloudflare.com";
    const API_BASE_URL = "https://" + BASE_DOMAIN;
    const WS_BASE_URL = "wss://" + BASE_DOMAIN;

    const elPrice = document.getElementById('btc-price');
    const elStatus = document.getElementById('round-status');
    
    let ws = null;
    let reconnectInterval = null;
    let chartSeries = null; // سری داده نمودار
    let lastChartTime = 0;

    // --- 1. راه اندازی اولیه ---
    function init() {
        tg.ready();
        tg.expand();

        // الف) تلاش برای ساخت نمودار (با محافظت خطا)
        try {
            initChart();
        } catch (e) {
            console.error("Chart Error:", e);
            document.getElementById('btcChart').innerHTML = "<p style='color:red;text-align:center;padding-top:100px'>خطای نمایش نمودار</p>";
        }

        // ب) اتصال به سرور (حتی اگر نمودار خراب باشد این اجرا می‌شود)
        fetchGameStateHTTP();
        connectWebSocket();
    }

    // --- 2. تنظیمات نمودار TradingView ---
    function initChart() {
        const container = document.getElementById('btcChart');
        if (!container) return;

        const chart = LightweightCharts.createChart(container, {
            layout: { background: { type: 'solid', color: 'transparent' }, textColor: '#A0AEC0' },
            grid: { vertLines: { visible: false }, horzLines: { color: 'rgba(255, 255, 255, 0.1)' } },
            rightPriceScale: { borderVisible: false },
            timeScale: { timeVisible: true, secondsVisible: true, borderVisible: false },
            crosshair: { mode: 0 }, // Magnet mode
        });

        // استفاده از نمودار ناحیه‌ای (Area)
        chartSeries = chart.addAreaSeries({
            topColor: 'rgba(54, 123, 255, 0.5)',
            bottomColor: 'rgba(54, 123, 255, 0.0)',
            lineColor: '#367BFF',
            lineWidth: 2,
        });

        // تنظیم ریسایز خودکار
        new ResizeObserver(entries => {
            if (entries.length === 0 || !entries[0].target) return;
            const { width, height } = entries[0].contentRect;
            chart.applyOptions({ width, height });
        }).observe(container);
    }

    function updateChart(price) {
        if (!chartSeries) return;
        
        // ترفند: مطمئن می‌شویم زمان همیشه جلو می‌رود
        let now = Math.floor(Date.now() / 1000);
        if (now <= lastChartTime) now = lastChartTime + 1;
        lastChartTime = now;

        chartSeries.update({ time: now, value: price });
    }

    // --- 3. اتصالات شبکه ---
    async function fetchGameStateHTTP() {
        try {
            const r = await fetch(`${API_BASE_URL}/webapp/game/state`, {
                method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ initData: tg.initData })
            });
            const d = await r.json();
            if (d.status === "success") updateUI(d);
        } catch (e) {
            elStatus.textContent = "⚠️ خطای اتصال اولیه";
        }
    }

    function connectWebSocket() {
        if (ws && ws.readyState === 1) return;
        ws = new WebSocket(`${WS_BASE_URL}/ws/0/${btoa(tg.initData || "")}`);
        
        ws.onopen = () => { if(reconnectInterval) clearInterval(reconnectInterval); };
        ws.onmessage = (e) => {
            try {
                const msg = JSON.parse(e.data);
                if (msg.type === 'game_update') updateUI(msg);
            } catch(err){}
        };
        ws.onclose = () => {
            if(!reconnectInterval) reconnectInterval = setInterval(connectWebSocket, 2000);
        };
    }

    // --- 4. آپدیت رابط کاربری ---
    function updateUI(data) {
        // آپدیت قیمت
        if (data.current_price) {
            elPrice.textContent = `$${data.current_price.toLocaleString()}`;
            elPrice.classList.remove('loading');
            updateChart(data.current_price);
        }

        // آپدیت تایمر و راند
        if (data.round) {
            const { time_left, duration, id } = data.round;
            const percent = (time_left / duration) * 100;
            
            document.getElementById('timer-text').textContent = time_left;
            document.getElementById('timer-path').style.strokeDasharray = `${percent}, 100`;
            
            // منطق وضعیت
            const myBet = localStorage.getItem(`bet_${id}`);
            if (time_left <= 5) {
                elStatus.textContent = "⏳ بسته شد";
                elStatus.style.color = "#FFC107";
                disableBetting(true);
            } else if (myBet) {
                elStatus.textContent = `پوزیشن شما: ${myBet === 'UP' ? 'خرید' : 'فروش'}`;
                elStatus.style.color = "#367BFF";
                disableBetting(true);
            } else {
                elStatus.textContent = "🟢 آماده معامله";
                elStatus.style.color = "#00E096";
                disableBetting(false);
            }
        }
        
        // آپدیت تاریخچه
        if (data.history) updateHistory(data.history);
    }

    // --- 5. تاریخچه و برد/باخت ---
    let lastProcessedId = -1;
    function updateHistory(history) {
        const container = document.getElementById('history-container');
        if (!container) return;
        
        // ساخت حباب‌ها
        let html = '<div class="history-bubbles">';
        history.forEach(r => {
            let cls = r.result === 'UP' ? 'up' : (r.result === 'DOWN' ? 'down' : 'draw');
            let txt = r.result === 'UP' ? '↑' : (r.result === 'DOWN' ? '↓' : '-');
            html += `<div class="history-bubble ${cls}">${txt}</div>`;
        });
        html += '</div>';
        container.innerHTML = html;

        // بررسی نتیجه آخرین راند
        if (history.length > 0) {
            const last = history[0];
            if (last.round_id !== lastProcessedId) {
                lastProcessedId = last.round_id;
                const bet = localStorage.getItem(`bet_${last.round_id}`);
                if (bet) {
                    localStorage.removeItem(`bet_${last.round_id}`);
                    if (bet === last.result) tg.showAlert(`🎉 برد! قیمت: ${last.end_price}`);
                    else tg.showAlert(`❌ باخت. قیمت: ${last.end_price}`);
                }
            }
        }
    }

    function disableBetting(disable) {
        document.getElementById('btn-up').disabled = disable;
        document.getElementById('btn-down').disabled = disable;
    }

    // تابع گلوبال برای دکمه‌ها
    window.placeBet = async function(pred) {
        const amt = document.getElementById('bet-amount').value;
        disableBetting(true);
        try {
            const r = await fetch(`${API_BASE_URL}/webapp/game/bet`, {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ initData: tg.initData, amount: parseFloat(amt), prediction: pred })
            });
            const res = await r.json();
            if(res.status === 'success') {
                tg.showAlert("✅ ثبت شد");
                // برای اینکه سریع در UI اعمال شود، موقتا ذخیره میکنیم
                // (در آپدیت بعدی سوکت، ID راند دقیق می آید و هماهنگ میشود)
                // اما چون ID راند فعلی را نداریم، منتظر آپدیت بعدی میمانیم یا
                // بهتر است یک درخواست state بزنیم:
                fetchGameStateHTTP().then(() => {
                   // اینجا که دیتا آمد، ID راند را داریم.
                   // اما برای سادگی، فقط منتظر سوکت میمانیم.
                });
            } else {
                tg.showAlert(res.message);
                disableBetting(false);
            }
        } catch(e) { disableBetting(false); }
    };

    document.addEventListener("DOMContentLoaded", init);
})();