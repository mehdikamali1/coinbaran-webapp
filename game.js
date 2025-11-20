(function () {
    'use strict';

    const tg = window.Telegram.WebApp;

    // --------------------------------------------------------------------
    // ✅ آدرس تانل (بدون https)
    const BASE_DOMAIN = "/played-amount-governments-lane.trycloudflare.com";
    
    const API_BASE_URL = "https://" + BASE_DOMAIN;
    const WS_BASE_URL = "wss://" + BASE_DOMAIN;
    // --------------------------------------------------------------------

    const elPrice = document.getElementById('btc-price');
    const elStatus = document.getElementById('round-status');
    
    let ws = null;
    let reconnectInterval = null;
    
    // متغیرهای نمودار
    let chartInstance = null;
    let mainSeries = null;
    let lastChartTime = 0;

    // سیستم صوتی
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    let audioCtx = new AudioCtx();
    function playSound(type) {
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain); gain.connect(audioCtx.destination);
        if (type === 'win') { osc.frequency.value = 523.25; osc.type='sine'; osc.start(); osc.stop(audioCtx.currentTime+0.15); }
        else if (type === 'lose') { osc.frequency.value = 150; osc.type='sawtooth'; osc.start(); osc.stop(audioCtx.currentTime+0.2); }
        else { osc.frequency.value = 800; osc.type='triangle'; osc.start(); osc.stop(audioCtx.currentTime+0.05); }
    }

    function init() {
        tg.ready();
        tg.expand();
        try { tg.setHeaderColor('#0F0F1A'); } catch(e){}
        
        document.body.addEventListener('click', () => {
            if (audioCtx.state === 'suspended') audioCtx.resume();
        }, { once: true });

        setupHistoryContainer();
        
        // تلاش برای ساخت نمودار با تاخیر کوتاه تا کتابخانه لود شود
        setTimeout(() => {
            try {
                createStylishChart();
            } catch (err) {
                console.error("Chart creation failed:", err);
                document.getElementById('chart-loader').textContent = "خطای لود نمودار";
            }
        }, 500);
        
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
    // 📊 ساخت نمودار شیک و حرفه‌ای
    // --------------------------------------------------------------------------
    function createStylishChart() {
        const container = document.getElementById('btcChart');
        if (!container) return;
        
        // اگر کتابخانه لود نشده بود
        if (typeof LightweightCharts === 'undefined') {
            document.getElementById('chart-loader').innerHTML = "<span style='color:red'>کتابخانه چارت لود نشد. اینترنت را چک کنید.</span>";
            return;
        }

        document.getElementById('chart-loader').style.display = 'none'; // مخفی کردن لودر
        container.innerHTML = '';

        // تنظیمات نمودار
        chartInstance = LightweightCharts.createChart(container, {
            layout: {
                background: { type: 'solid', color: 'transparent' },
                textColor: '#A0AEC0',
                fontFamily: 'Segoe UI',
            },
            grid: {
                vertLines: { visible: false },
                horzLines: { color: 'rgba(255, 255, 255, 0.05)', style: 2 }, // خطچین خیلی محو
            },
            rightPriceScale: {
                borderVisible: false,
                scaleMargins: { top: 0.2, bottom: 0.2 }, // فضای خالی بالا و پایین
            },
            timeScale: {
                timeVisible: true,
                secondsVisible: true,
                borderVisible: false,
                fixLeftEdge: true,
                fixRightEdge: true,
            },
            crosshair: {
                vertLine: { labelBackgroundColor: '#367BFF' },
                horzLine: { labelBackgroundColor: '#367BFF' },
            },
            handleScroll: { vertTouchDrag: false },
        });

        // ایجاد سری داده (Area) با رنگ‌بندی نئونی
        mainSeries = chartInstance.addAreaSeries({
            topColor: 'rgba(54, 123, 255, 0.6)',   // آبی پررنگ بالا
            bottomColor: 'rgba(54, 123, 255, 0.0)', // شفاف پایین
            lineColor: '#367BFF',
            lineWidth: 3,
            crosshairMarkerBorderColor: '#fff',
            crosshairMarkerBackgroundColor: '#367BFF',
            crosshairMarkerRadius: 6,
        });

        // ریسایز هوشمند
        new ResizeObserver(entries => {
            if (!entries[0]) return;
            const { width, height } = entries[0].contentRect;
            chartInstance.applyOptions({ width, height });
            chartInstance.timeScale().fitContent();
        }).observe(container);
    }

    function updateChart(price) {
        if (!mainSeries) return;

        let now = Math.floor(Date.now() / 1000);
        // جلوگیری از تکرار زمان (فیکس کردن باگ TradingView)
        if (now <= lastChartTime) now = lastChartTime + 1;
        lastChartTime = now;

        mainSeries.update({ time: now, value: price });
        
        // اسکرول نرم به سمت قیمت جدید
        // اگر تازه شروع شده، فیت کن، اگر نه اسکرول کن
        // chartInstance.timeScale().scrollToRealTime();
    }
    // --------------------------------------------------------------------------

    async function fetchGameStateHTTP() {
        try {
            const r = await fetch(`${API_BASE_URL}/webapp/game/state`, {
                method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ initData: tg.initData })
            });
            const d = await r.json();
            if (d.status === "success") updateUI(d);
        } catch (e) {
            elStatus.textContent = "⚠️ در حال تلاش برای اتصال...";
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
        // 1. قیمت (با رنگ سبز/قرمز)
        if (data.current_price) {
            const newPrice = data.current_price;
            // تعیین رنگ بر اساس تغییر قیمت
            const oldPrice = parseFloat(elPrice.dataset.lastPrice || "0");
            const color = newPrice >= oldPrice ? '#00E096' : '#FF4D4D'; // سبز یا قرمز
            
            // آپدیت متن قیمت
            elPrice.textContent = `$${newPrice.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
            elPrice.style.color = "#ffffff"; // رنگ اصلی سفید
            elPrice.style.textShadow = `0 0 20px ${color}80`; // سایه رنگی
            elPrice.dataset.lastPrice = newPrice;
            elPrice.classList.remove('loading');
            
            updateChart(newPrice);
        }

        if (data.round) {
            const { time_left, duration, id } = data.round;
            const percent = (time_left / duration) * 100;
            document.getElementById('timer-text').textContent = time_left;
            document.getElementById('timer-path').style.strokeDasharray = `${percent}, 100`;

            const myBet = localStorage.getItem(`bet_${id}`);
            if (time_left <= 5) {
                if (!window[`tick_${id}_${time_left}`]) { playSound('tick'); window[`tick_${id}_${time_left}`] = true; }
            }

            if (time_left <= 10) {
                 document.getElementById('timer-path').style.stroke = '#FF4D4D';
                 elStatus.textContent = "⏳ بسته شد";
                 elStatus.style.color = '#FFC107';
                 disableBetting(true);
            } else {
                 document.getElementById('timer-path').style.stroke = '#00E096';
                 if (myBet) {
                     elStatus.textContent = `پوزیشن شما: ${myBet==='UP'?'خرید 📈':'فروش 📉'}`;
                     elStatus.style.color = '#367BFF';
                     disableBetting(true);
                 } else {
                     elStatus.textContent = "🟢 آماده معامله";
                     elStatus.style.color = '#00E096';
                     disableBetting(false);
                 }
            }
        }

        if (data.history) checkWinLoss(data.history);
    }

    let lastProcessedId = -1;
    function checkWinLoss(history) {
        const container = document.getElementById('history-container');
        if (container) {
            let html = '<div class="history-bubbles">';
            history.forEach(r => {
                let cls = r.result === 'UP' ? 'up' : (r.result === 'DOWN' ? 'down' : 'draw');
                let icon = r.result === 'UP' ? '↑' : (r.result === 'DOWN' ? '↓' : '-');
                html += `<div class="history-bubble ${cls}">${icon}</div>`;
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
                    if (bet === last.result) {
                        playSound('win');
                        tg.showAlert(`🎉 تبریک!\nشما برنده شدید.`);
                        try { confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } }); } catch(e){}
                    } else if (last.result === 'DRAW') {
                        tg.showAlert("مساوی شد.");
                    } else {
                        playSound('lose');
                        tg.showAlert(`❌ متاسفانه باختید.`);
                    }
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
        playSound('tick');
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
                // برای واکنش سریع UI
                fetchGameStateHTTP().then(d => {
                    // گرفتن وضعیت برای ذخیره آیدی راند صحیح
                });
                // اینجا چون ID دقیق را نداریم، موقتا منتظر آپدیت بعدی می‌مانیم که امن‌تر است
                // اما برای تجربه کاربری بهتر، فرضی ذخیره می‌کنیم:
                // (در نسخه پروداکشن بهتر است ID از ریسپانس بیاید)
            } else {
                tg.showAlert(res.message);
                disableBetting(false);
            }
        } catch(e) { disableBetting(false); }
    };

    document.addEventListener("DOMContentLoaded", init);
})();