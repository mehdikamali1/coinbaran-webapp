(function () {
    'use strict';

    const tg = window.Telegram.WebApp;

    // --------------------------------------------------------------------
    // آدرس تانل
    const BASE_DOMAIN = "program-rhythm-oil-aka.trycloudflare.com";
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
        
        // ساخت اولیه نمودار (خالی)
        initChart();

        // دریافت دیتای اولیه (شامل تاریخچه نمودار)
        fetchGameStateHTTP();
        
        // اتصال به سوکت
        connectWebSocket();
    }

    function initChart() {
        const container = document.getElementById('btcChart');
        
        if (!window.LightweightCharts) {
            container.innerHTML = "<p style='color:red;text-align:center;padding-top:100px'>کتابخانه نمودار لود نشد. اتصال اینترنت را بررسی کنید.</p>";
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

        // استفاده از Candlestick (کندل شمعی)
        series = chart.addCandlestickSeries({
            upColor: '#00E096', 
            downColor: '#FF4D4D', 
            borderVisible: false, 
            wickUpColor: '#00E096', 
            wickDownColor: '#FF4D4D' 
        });

        window.addEventListener('resize', () => {
            if (chart && container) {
                chart.resize(container.clientWidth, 260);
            }
        });
    }

    // --- اتصالات شبکه ---
    async function fetchGameStateHTTP() {
        try {
            const r = await fetch(`${API_BASE_URL}/webapp/game/state`, {
                method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ initData: tg.initData })
            });
            const d = await r.json();
            if (d.status === "success") {
                // اگر سرور تاریخچه نمودار را فرستاد، نمودار را پر کن
                if (d.chart_history && series) {
                    // مرتب‌سازی بر اساس زمان (احتیاطی)
                    const sortedData = d.chart_history.sort((a, b) => a.time - b.time);
                    // حذف تکراری‌ها با استفاده از Map (اگر دیتای کثیف بیاید)
                    const uniqueData = [...new Map(sortedData.map(item => [item['time'], item])).values()];
                    series.setData(uniqueData);
                }
                updateUI(d);
            }
        } catch (e) { 
            console.error(e);
            elStatus.textContent = "⚠️ خطا در دریافت اطلاعات..."; 
        }
    }

    function connectWebSocket() {
        if (ws && ws.readyState === 1) return;
        ws = new WebSocket(`${WS_BASE_URL}/ws/0/${btoa(tg.initData || "")}`);
        ws.onopen = () => { if(reconnectInterval) clearInterval(reconnectInterval); };
        ws.onmessage = (e) => { try { updateUI(JSON.parse(e.data)); } catch(err){} };
        ws.onclose = () => { if(!reconnectInterval) reconnectInterval = setInterval(connectWebSocket, 2000); };
    }

    function updateUI(data) {
        if (data.current_price) {
            elPrice.textContent = `$${data.current_price.toLocaleString()}`;
        }

        // آپدیت زنده نمودار (کندل جاری)
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
                 elStatus.textContent = "⏳ بسته شد";
                 elStatus.style.color = '#FFC107';
                 disableBetting(true);
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

        if (history.length > 0) {
            const last = history[0];
            if (last.round_id !== lastProcessedId) {
                lastProcessedId = last.round_id;
                const bet = localStorage.getItem(`bet_${last.round_id}`);
                if (bet) {
                    localStorage.removeItem(`bet_${last.round_id}`);
                    if (bet === last.result) tg.showAlert(`🎉 برد!`);
                    else if (last.result === 'DRAW') tg.showAlert("مساوی.");
                    else tg.showAlert(`❌ باخت.`);
                }
            }
        }
    }

    function disableBetting(d) {
        document.getElementById('btn-up').disabled = d;
        document.getElementById('btn-down').disabled = d;
        document.getElementById('bet-amount').disabled = d;
    }

    window.placeBet = async function(p) {
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
                fetchGameStateHTTP().then(d => {
                    if(d.round) localStorage.setItem(`bet_${d.round.id}`, p);
                });
            } else {
                tg.showAlert(res.message);
                disableBetting(false);
            }
        } catch(e) { disableBetting(false); }
    };

    document.addEventListener("DOMContentLoaded", init);
})();