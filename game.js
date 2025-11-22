/* webapp/game.js (v13.0 - Full Logic Fix) */
(function () {
    'use strict';
    const tg = window.Telegram.WebApp;
    const API_BASE_URL = window.location.origin;
    
    // --- Sound System (Mobile Compatible) ---
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    let audioCtx = null;

    function initAudio() {
        if (!audioCtx) {
            audioCtx = new AudioContext();
            // پخش یک صدای صامت برای باز کردن قفل صدا در iOS/Android
            const buffer = audioCtx.createBuffer(1, 1, 22050);
            const source = audioCtx.createBufferSource();
            source.buffer = buffer;
            source.connect(audioCtx.destination);
            source.start(0);
        } else if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
    }

    // فعال‌سازی صدا با اولین لمس کاربر
    document.addEventListener('click', initAudio, { once: true });
    document.addEventListener('touchstart', initAudio, { once: true });

    const SoundFX = {
        playTone: (freq, type, duration) => {
            if (!audioCtx) return;
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = type;
            osc.frequency.value = freq;
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start();
            gain.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + duration);
            osc.stop(audioCtx.currentTime + duration);
        },
        tick: () => SoundFX.playTone(1000, 'triangle', 0.05),
        win: () => {
            if(!audioCtx) return;
            const now = audioCtx.currentTime;
            // آرپژ پیروزی
            [523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => {
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.frequency.value = freq;
                osc.connect(gain);
                gain.connect(audioCtx.destination);
                osc.start(now + i * 0.1);
                gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.1 + 0.3);
                osc.stop(now + i * 0.1 + 0.3);
            });
        },
        lose: () => {
            if(!audioCtx) return;
            const now = audioCtx.currentTime;
            // صدای باخت
            [150, 100].forEach((freq, i) => {
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.type = 'sawtooth';
                osc.frequency.value = freq;
                osc.connect(gain);
                gain.connect(audioCtx.destination);
                osc.start(now + i * 0.4);
                gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.4 + 0.4);
                osc.stop(now + i * 0.4 + 0.4);
            });
        }
    };

    let chart;
    let priceHistory = [];
    const MAX_POINTS = 30;

    window.onload = function() {
        tg.ready();
        tg.expand();
        tg.setHeaderColor('#1C1C2E');

        if (!tg.initData) {
            document.body.innerHTML = "<h3 style='color:white;text-align:center;margin-top:50px'>لطفاً از داخل ربات باز کنید</h3>";
            return;
        }

        initChart();
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
            if (res.ok) updateUI(await res.json());
        } catch (e) { console.error(e); }
    }

    function updateUI(data) {
        const elPrice = document.getElementById('btc-price');
        const currentPrice = data.current_price;
        
        // 1. آپدیت قیمت و رنگ (لاجیک فیکس شده)
        elPrice.textContent = `$${currentPrice.toLocaleString()}`;
        elPrice.classList.remove('loading');
        
        if (priceHistory.length > 0) {
            const lastPrice = priceHistory[priceHistory.length - 1];
            if (currentPrice > lastPrice) {
                elPrice.className = 'text-up';
            } else if (currentPrice < lastPrice) {
                elPrice.className = 'text-down';
            } else {
                elPrice.className = 'text-white';
            }
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

        // 3. وضعیت راند
        if (data.round) {
            const elTimer = document.getElementById('timer-text');
            const elPath = document.getElementById('timer-path');
            const elStatus = document.getElementById('round-status');
            
            elTimer.textContent = data.round.time_left;
            const pct = (data.round.time_left / 60) * 100;
            elPath.style.strokeDasharray = `${pct}, 100`;

            // صدای تیک تاک (فقط اگر صدا فعال باشد)
            if (data.round.time_left <= 5 && data.round.time_left > 0) {
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
        }

        // 4. نمایش وضعیت بت
        if(data.user_bet) {
            const elStatus = document.getElementById('round-status');
            const typeText = data.user_bet.prediction === 'UP' ? 'خرید (LONG) 📈' : 'فروش (SHORT) 📉';
            elStatus.textContent = `پوزیشن باز: ${typeText}`;
            toggleButtons(true);
            
            // ذخیره در حافظه برای چک کردن نتیجه
            if(data.round) {
                localStorage.setItem('last_bet_round_id', String(data.round.id));
                localStorage.setItem('last_bet_prediction', data.user_bet.prediction);
            }
        }

        // 5. چک کردن تاریخچه و برد/باخت
        if (data.history) {
            updateHistory(data.history);
            checkResult(data.history);
        }
    }

    function updateHistory(history) {
        const container = document.getElementById('history-container');
        container.innerHTML = '';
        // 10 تای آخر را نشان بده
        history.slice(0, 10).forEach(h => {
            const div = document.createElement('div');
            div.className = 'history-bubble ' + (h.result === 'UP' ? 'up' : (h.result === 'DOWN' ? 'down' : 'draw'));
            div.textContent = h.result === 'UP' ? '↑' : (h.result === 'DOWN' ? '↓' : '-');
            container.appendChild(div);
        });
    }

    function checkResult(history) {
        const myRoundId = localStorage.getItem('last_bet_round_id');
        const myPrediction = localStorage.getItem('last_bet_prediction');

        if (!myRoundId || !myPrediction) return;

        // آیا راند من در تاریخچه آمده؟ (تبدیل هر دو به String برای اطمینان)
        const finishedRound = history.find(h => String(h.round_id) === String(myRoundId));

        if (finishedRound) {
            // نتیجه مشخص شد!
            localStorage.removeItem('last_bet_round_id'); // پاک کردن برای جلوگیری از تکرار
            localStorage.removeItem('last_bet_prediction');

            if (finishedRound.result === myPrediction) {
                SoundFX.win();
                tg.showAlert(`🎉 تبریک! شما برنده شدید.\nقیمت بسته شدن: ${finishedRound.end_price}`);
                triggerConfetti();
                tg.HapticFeedback.notificationOccurred('success');
            } else if (finishedRound.result === 'DRAW') {
                tg.showAlert(`⚪️ مساوی شد. مبلغ برگشت داده شد.`);
            } else {
                SoundFX.lose();
                tg.showAlert(`❌ متاسفانه باختید.\nپیش‌بینی شما: ${myPrediction}\nنتیجه: ${finishedRound.result}`);
                tg.HapticFeedback.notificationOccurred('error');
            }
        }
    }

    window.placeBet = async function(pred) {
        const amount = document.getElementById('bet-amount').value;
        initAudio(); // اطمینان از فعال شدن صدا
        SoundFX.tick(); // صدای کلیک

        try {
            const res = await fetch(`${API_BASE_URL}/webapp/game/bet`, {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ initData: tg.initData, amount: parseFloat(amount), prediction: pred })
            });
            const result = await res.json();
            if (result.status === "success") {
                tg.HapticFeedback.impactOccurred('medium');
                // اینجا آلرت نمی‌دهیم تا بازی قطع نشود، فقط دکمه‌ها قفل می‌شوند
            } else {
                tg.showAlert(`❌ ${result.message}`);
            }
        } catch (e) { tg.showAlert("خطای اتصال"); }
    }

    function toggleButtons(disable) {
        document.getElementById('btn-up').disabled = disable;
        document.getElementById('btn-down').disabled = disable;
        if(!disable) {
            document.getElementById('btn-up').classList.remove('selected');
            document.getElementById('btn-down').classList.remove('selected');
        }
    }

    function triggerConfetti() {
        if (typeof confetti === 'function') confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });
    }
})();