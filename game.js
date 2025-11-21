(function () {
    'use strict';

    const tg = window.Telegram.WebApp;

    // --------------------------------------------------------------------
    // آدرس تانل
    const BASE_DOMAIN = "/program-rhythm-oil-aka.trycloudflare.com";
    const API_BASE_URL = "https://" + BASE_DOMAIN;
    const WS_BASE_URL = "wss://" + BASE_DOMAIN;
    // --------------------------------------------------------------------

    const elPrice = document.getElementById('btc-price');
    const elStatus = document.getElementById('round-status');
    
    let ws = null;
    let reconnectInterval = null;
    let chart = null;
    let series = null;
    
    function init() {
        tg.ready();
        tg.expand();
        
        initChart();
        fetchGameStateHTTP();
        connectWebSocket();
    }

    function initChart() {
        const container = document.getElementById('btcChart');
        
        if (!window.LightweightCharts) {
            container.innerHTML = "<p style='color:red;text-align:center;padding-top:100px'>کتابخانه نمودار لود نشد.</p>";
            return;
        }

        container.innerHTML = '';

        chart = LightweightCharts.createChart(container, {
            width: container.clientWidth || 300,
            height: 260,
            layout: {
                background: { type: 'solid', color: 'transparent' },
                textColor: '#A0AEC0',
            },
            grid: {
                vertLines: { visible: false },
                horzLines: { color: 'rgba(255,255,255,0.05)' },
            },
            rightPriceScale: {
                borderVisible: false,
                scaleMargins: { top: 0.1, bottom: 0.1 },
            },
            timeScale: {
                timeVisible: true,
                secondsVisible: false,
                borderVisible: false,
            },
        });

        series = chart.addCandlestickSeries({
            upColor: '#00E096', 
            downColor: '#FF4D4D', 
            borderVisible: false, 
            wickUpColor: '#00E096', 
            wickDownColor: '#FF4D4D' 
        });

        window.addEventListener('resize', () => {
            if (chart && container) chart.resize(container.clientWidth, 260);
        });
    }

    async function fetchGameStateHTTP() {
        try {
            const r = await fetch(`${API_BASE_URL}/webapp/game/state`, {
                method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ initData: tg.initData })
            });
            const d = await r.json();
            if (d.status === "success") {
                // پر کردن نمودار با دیتای اولیه
                if (d.chart_history && d.chart_history.length > 0 && series) {
                    // حذف دیتای تکراری و مرتب‌سازی
                    const uniqueData = [...new Map(d.chart_history.map(item => [item['time'], item])).values()]
                                       .sort((a, b) => a.time - b.time);
                    series.setData(uniqueData);
                }
                updateUI(d);
            }
        } catch (e) { 
            console.error(e);
        }
    }

    function connectWebSocket() {
        if (ws && ws.readyState === 1) return;

        // ✅ تغییر مهم: ارسال initData به عنوان پارامتر، نه در آدرس
        // استفاده از encodeURIComponent برای جلوگیری از خرابی آدرس با کاراکترهای خاص
        const safeInitData = encodeURIComponent(tg.initData || "");
        ws = new WebSocket(`${WS_BASE_URL}/ws/0?init_data=${safeInitData}`);

        ws.onopen = () => { 
            elStatus.textContent = "🟢 آنلاین";
            elStatus.style.color = "#00E096";
            if(reconnectInterval) clearInterval(reconnectInterval); 
        };
        
        ws.onmessage = (e) => { try { updateUI(JSON.parse(e.data)); } catch(err){} };
        
        ws.onclose = () => { 
            elStatus.textContent = "🔴 قطع شد";
            elStatus.style.color = "#FF4D4D";
            if(!reconnectInterval) reconnectInterval = setInterval(connectWebSocket, 3000); 
        };
    }

    function updateUI(data) {
        if (data.current_price) {
            elPrice.textContent = `$${data.current_price.toLocaleString()}`;
        }

        // آپدیت لحظه‌ای نمودار
        if (data.candle && series) {
            series.update(data.candle);
        }

        if (data.round) {
            const { time_left, duration, id } = data.round;
            const percent = (time_left / duration) * 100;
            
            document.getElementById('timer-text').textContent = time_left;
            document.getElementById('timer-path').style.strokeDasharray = `${percent}, 100`;

            if (time_left <= 10) {
                 document.getElementById('timer-path').style.stroke = '#FF4D4D';
                 disableBetting(true);
                 if (!localStorage.getItem(`bet_${id}`)) {
                     elStatus.textContent = "⏳ بسته شد";
                     elStatus.style.color = '#FFC107';
                 }
            } else {
                 document.getElementById('timer-path').style.stroke = '#00E096';
                 const myBet = localStorage.getItem(`bet_${id}`);
                 if (myBet) {
                     elStatus.textContent = `پوزیشن شما: ${myBet==='UP'?'خرید':'فروش'}`;
                     elStatus.style.color = '#367BFF';
                     disableBetting(true);
                 } else {
                     elStatus.textContent = "🟢 آماده";
                     elStatus.style.color = '#00E096';
                     disableBetting(false);
                 }
            }
        }
        
        if (data.history) updateHistory(data.history);
    }

    let lastProcessedId = -1;
    function updateHistory(history) {
        const container = document.getElementById('history-container');
        if (container) {
            let html = '<div class="history-bubbles">';
            history.forEach(r => {
                let cls = r.result === 'UP' ? 'up' : (r.result === 'DOWN' ? 'down' : 'draw');
                let txt = r.result === 'UP' ? '↑' : (r.result === 'DOWN' ? '↓' : '-');
                html += `<div class="history-bubble ${cls}">${txt}</div>`;
            });
            html += '</div>';
            container.innerHTML = html;
        }
    }

    function disableBetting(d) {
        const btnUp = document.getElementById('btn-up');
        const btnDown = document.getElementById('btn-down');
        
        // جلوگیری از پرپر زدن دکمه‌ها اگر وضعیت تغییر نکرده
        if (btnUp.disabled !== d) btnUp.disabled = d;
        if (btnDown.disabled !== d) btnDown.disabled = d;
    }

    // جلوگیری از کلیک رگباری
    let isBetting = false;

    window.placeBet = async function(p) {
        if (isBetting) return;
        isBetting = true;
        
        const amt = document.getElementById('bet-amount').value;
        disableBetting(true);
        
        try {
            const r = await fetch(`${API_BASE_URL}/webapp/game/bet`, {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ initData: tg.initData, amount: parseFloat(amt), prediction: p })
            });
            const res = await r.json();
            
            if(res.status === 'success') {
                tg.showAlert("✅ ثبت شد");
                // ذخیره موقت تا وقتی سوکت آپدیت کند
                fetchGameStateHTTP().then(d => {
                    if(d.round) {
                        localStorage.setItem(`bet_${d.round.id}`, p);
                        elStatus.textContent = `پوزیشن شما: ${p==='UP'?'خرید':'فروش'}`;
                    }
                });
            } else {
                tg.showAlert(res.message);
                disableBetting(false); // باز کردن مجدد در صورت خطا
            }
        } catch(e) { 
            disableBetting(false); 
        } finally {
            isBetting = false;
        }
    };

    document.addEventListener("DOMContentLoaded", init);
})();