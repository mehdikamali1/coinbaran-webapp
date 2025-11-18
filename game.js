(function () {
    'use strict';

    const tg = window.Telegram.WebApp;
    
    // ❗️❗️❗️ آدرس تونل فعال خود را اینجا قرار دهید ❗️❗️❗️
    const API_BASE_URL = "https://portions-hygiene-metallic-catalogue.trycloudflare.com";

    // عناصر صفحه
    const elPrice = document.getElementById('btc-price');
    const elTimerText = document.getElementById('timer-text');
    const elTimerPath = document.getElementById('timer-path');
    const elStatus = document.getElementById('round-status');
    const btnUp = document.getElementById('btn-up');
    const btnDown = document.getElementById('btn-down');
    const inpAmount = document.getElementById('bet-amount');
    
    // کانتینر جدید برای تاریخچه
    // (توجه: ما باید این المنت را در HTML هم اضافه کنیم، فعلاً در JS منطقش را می‌نویسیم)
    let historyContainer = document.getElementById('history-container');

    let chart; 
    let priceHistory = []; 
    const MAX_DATA_POINTS = 30; 

    // راه‌اندازی اولیه
    function init() {
        tg.ready();
        tg.expand();
        tg.setHeaderColor('#0F0F1A'); 
        
        // اگر کانتینر تاریخچه در HTML نبود، آن را دینامیک می‌سازیم (برای اطمینان)
        if (!historyContainer) {
            const gameContainer = document.getElementById('game-container');
            historyContainer = document.createElement('div');
            historyContainer.id = 'history-container';
            historyContainer.className = 'history-container';
            // اضافه کردن قبل از کنترل‌های شرط‌بندی
            gameContainer.insertBefore(historyContainer, document.querySelector('.bet-controls'));
        }

        initChart();
        setInterval(fetchGameState, 1000);
    }

    function initChart() {
        const ctx = document.getElementById('btcChart').getContext('2d');
        const gradient = ctx.createLinearGradient(0, 0, 0, 400);
        gradient.addColorStop(0, 'rgba(54, 123, 255, 0.5)');
        gradient.addColorStop(1, 'rgba(54, 123, 255, 0.0)');

        chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: Array(MAX_DATA_POINTS).fill(''),
                datasets: [{
                    label: 'BTC Price',
                    data: Array(MAX_DATA_POINTS).fill(null),
                    borderColor: '#367BFF',
                    backgroundColor: gradient,
                    borderWidth: 2,
                    pointRadius: 0,
                    fill: true,
                    tension: 0.4 
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { display: false },
                    y: { 
                        display: true, 
                        position: 'right',
                        grid: { color: '#333' },
                        ticks: { color: '#888', callback: function(value) { return value.toFixed(0); } }
                    }
                },
                animation: { duration: 0 } 
            }
        });
    }

    async function fetchGameState() {
        try {
            const response = await fetch(`${API_BASE_URL}/webapp/game/state`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ initData: tg.initData })
            });
            
            if (!response.ok) return;
            const data = await response.json();

            if (data.status === "success") {
                updateUI(data);
            }
        } catch (e) {
            console.error("Game sync error:", e);
        }
    }

    function updateUI(data) {
        // 1. قیمت
        const price = data.current_price;
        elPrice.textContent = `$${price.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
        elPrice.classList.remove('loading');
        
        if (priceHistory.length > 0) {
            const lastPrice = priceHistory[priceHistory.length - 1];
            elPrice.style.color = price >= lastPrice ? '#00E096' : '#FF4D4D';
        }

        updateChartData(price);

        // 2. اطلاعات راند
        if (data.round) {
            const timeLeft = data.round.time_left;
            elTimerText.textContent = timeLeft;
            
            const percentage = (timeLeft / 60) * 100;
            elTimerPath.style.strokeDasharray = `${percentage}, 100`;
            
            if (timeLeft <= 10) {
                elTimerPath.style.stroke = '#FF4D4D';
                elStatus.textContent = "⏳ ثبت پوزیشن بسته شد! منتظر کلوز کندل...";
                elStatus.style.color = '#FFC107';
                disableBetting(true);
            } else {
                elTimerPath.style.stroke = '#00E096';
                elStatus.textContent = "🟢 سشن معاملاتی باز است";
                elStatus.style.color = '#00E096';
                
                if (!data.user_bet) {
                    disableBetting(false);
                }
            }
        } else {
            elStatus.textContent = "در انتظار شروع سشن معاملاتی جدید...";
            elTimerText.textContent = "--";
        }

        // 3. وضعیت پوزیشن کاربر
        if (data.user_bet) {
            const type = data.user_bet.prediction; 
            disableBetting(true);
            const typeText = type === 'UP' ? 'خرید (LONG) 📈' : 'فروش (SHORT) 📉';
            elStatus.textContent = `پوزیشن باز شما: ${typeText}`;
            
            if (type === 'UP') btnUp.classList.add('selected');
            if (type === 'DOWN') btnDown.classList.add('selected');
        }

        // 4. بروزرسانی تاریخچه (بخش جدید)
        if (data.history) {
            updateHistoryDisplay(data.history);
        }
    }

    function updateHistoryDisplay(historyData) {
        historyContainer.innerHTML = ''; // پاک کردن قبلی‌ها
        
        // عنوان کوچک
        const title = document.createElement('div');
        title.className = 'history-title';
        title.textContent = 'روند بازار (۱۰ کندل آخر):';
        historyContainer.appendChild(title);

        const bubblesDiv = document.createElement('div');
        bubblesDiv.className = 'history-bubbles';

        historyData.forEach(round => {
            const bubble = document.createElement('div');
            bubble.className = 'history-bubble';
            
            if (round.result === 'UP') {
                bubble.classList.add('up');
                bubble.textContent = '↑';
            } else if (round.result === 'DOWN') {
                bubble.classList.add('down');
                bubble.textContent = '↓';
            } else {
                bubble.classList.add('draw');
                bubble.textContent = '-';
            }
            bubblesDiv.appendChild(bubble);
        });
        historyContainer.appendChild(bubblesDiv);
    }

    function updateChartData(price) {
        priceHistory.push(price);
        if (priceHistory.length > MAX_DATA_POINTS) {
            priceHistory.shift();
        }
        
        chart.data.datasets[0].data = priceHistory;
        
        const minPrice = Math.min(...priceHistory) * 0.9995;
        const maxPrice = Math.max(...priceHistory) * 1.0005;
        chart.options.scales.y.min = minPrice;
        chart.options.scales.y.max = maxPrice;
        
        chart.update();
    }

    function disableBetting(disabled) {
        btnUp.disabled = disabled;
        btnDown.disabled = disabled;
        inpAmount.disabled = disabled;
        if (!disabled) {
            btnUp.classList.remove('selected');
            btnDown.classList.remove('selected');
        }
    }

    window.placeBet = async function(prediction) {
        const amount = parseInt(inpAmount.value);
        if (!amount || amount < 1) {
            tg.showAlert("لطفاً مبلغ ورود معتبری وارد کنید.");
            return;
        }

        tg.HapticFeedback.impactOccurred('medium');
        
        disableBetting(true);
        const btn = prediction === 'UP' ? btnUp : btnDown;
        btn.classList.add('loading-btn');

        try {
            const response = await fetch(`${API_BASE_URL}/webapp/game/bet`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    initData: tg.initData,
                    amount: amount,
                    prediction: prediction
                })
            });
            
            const result = await response.json();
            
            if (result.status === "success") {
                const typeText = prediction === 'UP' ? 'خرید (LONG)' : 'فروش (SHORT)';
                tg.showAlert(`✅ پوزیشن ${typeText} با موفقیت باز شد!`);
            } else {
                tg.showAlert(`❌ خطا: ${result.message}`);
                disableBetting(false);
            }
        } catch (e) {
            tg.showAlert("خطا در ارتباط با سرور معاملات.");
            disableBetting(false);
        } finally {
            btn.classList.remove('loading-btn');
        }
    };

    document.addEventListener("DOMContentLoaded", init);

})();