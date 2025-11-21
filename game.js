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
    let chart = null;
    let series = null;
    let lastTime = 0;

    function init() {
        tg.ready();
        tg.expand();
        
        // تاخیر کوچک برای اطمینان از لود شدن فایل لوکال
        setTimeout(() => {
            initChart();
        }, 100);

        fetchGameStateHTTP();
        connectWebSocket();
    }

    function initChart() {
        const container = document.getElementById('btcChart');
        
        if (typeof LightweightCharts === 'undefined') {
            container.innerHTML = "<p style='color:red;text-align:center;padding-top:100px'>فایل نمودار لود نشد</p>";
            return;
        }

        container.innerHTML = '';

        // تنظیمات ظاهری نمودار
        chart = LightweightCharts.createChart(container, {
            width: container.clientWidth || 300, // اگر سایز نگرفت، پیشفرض 300
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
                scaleMargins: { top: 0.2, bottom: 0.2 },
            },
            timeScale: {
                timeVisible: true,
                secondsVisible: true,
                borderVisible: false,
            },
            crosshair: {
                vertLine: { labelBackgroundColor: '#367BFF' },
                horzLine: { labelBackgroundColor: '#367BFF' },
            }
        });

        series = chart.addAreaSeries({
            topColor: 'rgba(54, 123, 255, 0.5)',
            bottomColor: 'rgba(54, 123, 255, 0.0)',
            lineColor: '#367BFF',
            lineWidth: 2,
        });

        // ریسایز ساده
        window.addEventListener('resize', () => {
            if (chart && container) {
                chart.resize(container.clientWidth, 260);
            }
        });
    }

    function updateChart(price) {
        if (!series) return;
        
        let now = Math.floor(Date.now() / 1000);
        if (now <= lastTime) now = lastTime + 1;
        lastTime = now;

        series.update({ time: now, value: price });
    }

    // --- اتصالات شبکه ---
    async function fetchGameStateHTTP() {
        try {
            const r = await fetch(`${API_BASE_URL}/webapp/game/state`, {
                method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ initData: tg.initData })
            });
            const d = await r.json();
            if (d.status === "success") updateUI(d);
        } catch (e) { elStatus.textContent = "⚠️ در حال تلاش..."; }
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
            updateChart(data.current_price);
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