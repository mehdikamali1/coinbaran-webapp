/* webapp/game.js (v11.0 - Final Polish & Sound Fix) */
(function () {
    'use strict';
    const tg = window.Telegram.WebApp;
    const API_BASE_URL = window.location.origin;
    
    // --- سیستم صوتی پیشرفته ---
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    let audioCtx = new AudioContext();
    
    // آنلاک کردن صدا با اولین لمس کاربر (حیاتی برای موبایل)
    document.body.addEventListener('touchstart', function() {
        if (audioCtx.state === 'suspended') audioCtx.resume();
    }, { once: true });
    document.body.addEventListener('click', function() {
        if (audioCtx.state === 'suspended') audioCtx.resume();
    }, { once: true });

    const SoundFX = {
        play: function(type, freq, dur, vol = 0.1) {
            if (!audioCtx) return;
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
            gain.gain.setValueAtTime(vol, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start();
            osc.stop(audioCtx.currentTime + dur);
        },
        click: () => SoundFX.play('sine', 800, 0.1),
        tick: () => SoundFX.play('triangle', 1200, 0.05),
        win: () => {
            // ملودی برد
            setTimeout(() => SoundFX.play('sine', 523.25, 0.2), 0);
            setTimeout(() => SoundFX.play('sine', 659.25, 0.2), 150);
            setTimeout(() => SoundFX.play('sine', 783.99, 0.4), 300);
        },
        lose: () => {
            // صدای باخت
            setTimeout(() => SoundFX.play('sawtooth', 150, 0.4), 0);
            setTimeout(() => SoundFX.play('sawtooth', 100, 0.4), 300);
        }
    };

    let chart;
    let priceHistory = [];
    const MAX_POINTS = 30;
    let lastRoundId = -1;

    window.onload = function() {
        tg.ready();
        tg.expand();
        // اگر در تلگرام نبود، پیام بده
        if (!tg.initData) {
            document.body.innerHTML = "<h2 style='color:white;text-align:center;margin-top:50px'>⚠️ لطفاً از داخل ربات باز کنید</h2>";
            return;
        }
        
        initChart();
        // شروع حلقه بازی
        setInterval(fetchState, 1000);
    };

    function initChart() {
        const ctx = document.getElementById('btcChart').getContext('2d');
        const gradient = ctx.createLinearGradient(0, 0, 0, 400);
        gradient.addColorStop(0, 'rgba(54, 123, 255, 0.5)');
        gradient.addColorStop(1, 'rgba(54, 123, 255, 0.0)');

        chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: Array(MAX_POINTS).fill(''),
                datasets: [{
                    data: Array(MAX_POINTS).fill(null),
                    borderColor: '#367BFF', backgroundColor: gradient,
                    borderWidth: 2, pointRadius: 0, fill: true, tension: 0.4
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { x: { display: false }, y: { display: true, position: 'right', grid: { color: '#333' } } },
                animation: { duration: 0 }
            }
        });
    }

    async function fetchState() {
        try {
            const res = await fetch(`${API_BASE_URL}/webapp/game/state`, {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ initData: tg.initData })
            });
            if (res.ok) {
                const data = await res.json();
                updateUI(data);
            }
        } catch (e) { console.error(e); }
    }

    function updateUI(data) {
        const elPrice = document.getElementById('btc-price');
        const currentPrice = data.current_price;
        
        // 1. آپدیت قیمت و رنگ
        elPrice.textContent = `$${currentPrice.toLocaleString()}`;
        if (priceHistory.length > 0) {
            const lastPrice = priceHistory[priceHistory.length - 1];
            elPrice.className = currentPrice >= lastPrice ? 'text-up' : 'text-down';
        }

        // 2. آپدیت نمودار
        priceHistory.push(currentPrice);
        if (priceHistory.length > MAX_POINTS) priceHistory.shift();
        if (chart) {
            chart.data.datasets[0].data = priceHistory;
            const min = Math.min(...priceHistory) * 0.9995;
            const max = Math.max(...priceHistory) * 1.0005;
            chart.options.scales.y.min = min;
            chart.options.scales.y.max = max;
            chart.update();
        }

        // 3. لاجیک راند و تایمر
        if (data.round) {
            const elTimer = document.getElementById('timer-text');
            const elPath = document.getElementById('timer-path');
            const elStatus = document.getElementById('round-status');
            
            elTimer.textContent = data.round.time_left;
            const pct = (data.round.time_left / 60) * 100;
            elPath.style.strokeDasharray = `${pct}, 100`;

            // صدای تیک تاک در 5 ثانیه آخر
            if (data.round.time_left <= 5 && data.round.time_left > 0) {
                // چک کردن اینکه در این ثانیه صدا پخش شده یا نه (برای جلوگیری از رگبار صدا)
                if (!window['tick_' + data.round.time_left]) {
                    SoundFX.tick();
                    window['tick_' + data.round.time_left] = true;
                }
            }

            if (data.round.time_left <= 10) {
                elStatus.textContent = "⏳ بسته شد! منتظر نتیجه...";
                elStatus.style.color = "#FFD700";
                elPath.style.stroke = "#FFD700";
                toggleButtons(true);
            } else {
                elStatus.textContent = "🟢 شرط بندی باز است";
                elStatus.style.color = "#00E096";
                elPath.style.stroke = "#00E096";
                if(!data.user_bet) toggleButtons(false);
            }

            // بررسی نتیجه راند قبلی (Win/Loss Logic)
            checkResult(data.history);
        }

        // 4. نمایش وضعیت بت کاربر
        if(data.user_bet) {
            document.getElementById('round-status').textContent = `پوزیشن باز: ${data.user_bet.prediction}`;
            toggleButtons(true);
            // ذخیره بت در حافظه برای چک کردن نتیجه
            if(data.round) localStorage.setItem('last_bet_round', data.round.id);
            localStorage.setItem('last_bet_type', data.user_bet.prediction);
        }
    }

    function checkResult(history) {
        if (!history || history.length === 0) return;
        
        const lastBetRound = localStorage.getItem('last_bet_round');
        const lastBetType = localStorage.getItem('last_bet_type');
        
        if (lastBetRound && lastBetType) {
            // آیا راندی که بت بستیم تمام شده؟ (در هیستوری پیدایش کنیم)
            const finishedRound = history.find(r => r.round_id == lastBetRound);
            
            if (finishedRound) {
                // نتیجه مشخص شد!
                localStorage.removeItem('last_bet_round'); // پاک کردن تا دوباره آلرت ندهد
                
                if (finishedRound.result === lastBetType) {
                    SoundFX.win();
                    tg.showAlert(`🎉 تبریک! شما برنده شدید.`);
                    triggerConfetti();
                } else if (finishedRound.result === 'DRAW') {
                    tg.showAlert(`⚪️ مساوی شد. پول برگشت.`);
                } else {
                    SoundFX.lose();
                    tg.showAlert(`❌ متاسفانه باختید.`);
                }
            }
        }
        
        // نمایش تاریخچه (دایره‌های رنگی)
        const histContainer = document.getElementById('history-container');
        histContainer.innerHTML = '';
        history.slice(0, 10).reverse().forEach(h => {
            const div = document.createElement('div');
            div.className = `history-bubble ${h.result.toLowerCase()}`;
            histContainer.appendChild(div);
        });
    }

    window.placeBet = async function(pred) {
        const amount = document.getElementById('bet-amount').value;
        SoundFX.click();
        
        try {
            const res = await fetch(`${API_BASE_URL}/webapp/game/bet`, {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ initData: tg.initData, amount: parseFloat(amount), prediction: pred })
            });
            const result = await res.json();
            if (result.status === "success") {
                tg.HapticFeedback.notificationOccurred('success');
            } else {
                tg.showAlert(`❌ ${result.message}`);
            }
        } catch (e) { tg.showAlert("خطای اتصال"); }
    }

    function toggleButtons(disable) {
        const btnUp = document.getElementById('btn-up');
        const btnDown = document.getElementById('btn-down');
        btnUp.disabled = disable;
        btnDown.disabled = disable;
        if(disable) {
            btnUp.classList.remove('selected');
            btnDown.classList.remove('selected');
        }
    }
    
    function triggerConfetti() {
        if (typeof confetti === 'function') {
            confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
        }
    }
})();