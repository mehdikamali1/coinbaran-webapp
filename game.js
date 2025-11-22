/* webapp/game.js (Production Version) */
(function () {
    'use strict';
    const tg = window.Telegram.WebApp;
    const API_BASE_URL = window.location.origin;
    
    let chart;
    let priceHistory = [];
    const MAX_POINTS = 30;

    window.onload = function() {
        tg.ready();
        tg.expand();

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
        elPrice.textContent = `$${data.current_price.toLocaleString()}`;
        elPrice.classList.remove('loading');

        priceHistory.push(data.current_price);
        if (priceHistory.length > MAX_POINTS) priceHistory.shift();
        if (chart) {
            chart.data.datasets[0].data = priceHistory;
            const min = Math.min(...priceHistory) * 0.999;
            const max = Math.max(...priceHistory) * 1.001;
            chart.options.scales.y.min = min;
            chart.options.scales.y.max = max;
            chart.update();
        }

        const elStatus = document.getElementById('round-status');
        const elTimer = document.getElementById('timer-text');
        const elPath = document.getElementById('timer-path');

        if (data.round) {
            elTimer.textContent = data.round.time_left;
            const pct = (data.round.time_left / 60) * 100;
            elPath.style.strokeDasharray = `${pct}, 100`;

            if (data.round.time_left <= 10) {
                elStatus.textContent = "⏳ بسته شد";
                elStatus.style.color = "orange";
                elPath.style.stroke = "orange";
                toggleButtons(true);
            } else {
                elStatus.textContent = "🟢 باز";
                elStatus.style.color = "#00E096";
                elPath.style.stroke = "#00E096";
                if(!data.user_bet) toggleButtons(false);
            }
        }
        if(data.user_bet) {
            elStatus.textContent = `پوزیشن: ${data.user_bet.prediction}`;
            toggleButtons(true);
        }
    }

    window.placeBet = async function(pred) {
        const amount = document.getElementById('bet-amount').value;
        try {
            const res = await fetch(`${API_BASE_URL}/webapp/game/bet`, {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ initData: tg.initData, amount: parseFloat(amount), prediction: pred })
            });
            const result = await res.json();
            if (result.status === "success") alert("✅ ثبت شد");
            else alert(`❌ ${result.message}`);
        } catch (e) { alert("خطا"); }
    }

    function toggleButtons(disable) {
        document.getElementById('btn-up').disabled = disable;
        document.getElementById('btn-down').disabled = disable;
    }
})();