(function () {
    'use strict';

    const tg = window.Telegram.WebApp;
    
    // ❗️❗️❗️ آدرس تونل خود را اینجا قرار دهید ❗️❗️❗️
    const API_BASE_URL = "https://restore-male-christmas-dates.trycloudflare.com";

    // عناصر صفحه
    const elPrice = document.getElementById('btc-price');
    const elTimerText = document.getElementById('timer-text');
    const elTimerPath = document.getElementById('timer-path');
    const elStatus = document.getElementById('round-status');
    const btnUp = document.getElementById('btn-up');
    const btnDown = document.getElementById('btn-down');
    const inpAmount = document.getElementById('bet-amount');

    let chart; // متغیر نمودار
    let priceHistory = []; // تاریخچه قیمت برای نمودار
    const MAX_DATA_POINTS = 30; // تعداد نقاط نمودار

    // راه‌اندازی اولیه
    function init() {
        tg.ready();
        tg.expand();
        tg.setHeaderColor('#0F0F1A'); // رنگ هدر مشکی برای بازی
        
        initChart();
        
        // شروع حلقه دریافت اطلاعات (Polling) هر 1 ثانیه
        setInterval(fetchGameState, 1000);
    }

    // ساخت نمودار با Chart.js
    function initChart() {
        const ctx = document.getElementById('btcChart').getContext('2d');
        
        // گرادیان زیر نمودار
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
                    tension: 0.4 // نرمی نمودار
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
                animation: { duration: 0 } // غیرفعال کردن انیمیشن برای آپدیت سریع
            }
        });
    }

    // دریافت وضعیت بازی از سرور
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

    // بروزرسانی رابط کاربری
    function updateUI(data) {
        // 1. قیمت
        const price = data.current_price;
        elPrice.textContent = `$${price.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
        elPrice.classList.remove('loading');
        
        // تغییر رنگ قیمت بر اساس تغییر (ساده)
        if (priceHistory.length > 0) {
            const lastPrice = priceHistory[priceHistory.length - 1];
            elPrice.style.color = price >= lastPrice ? '#00E096' : '#FF4D4D';
        }

        // آپدیت نمودار
        updateChartData(price);

        // 2. اطلاعات راند
        if (data.round) {
            const timeLeft = data.round.time_left;
            elTimerText.textContent = timeLeft;
            
            // محاسبه دایره پیشرفت (60 ثانیه کل)
            const percentage = (timeLeft / 60) * 100;
            elTimerPath.style.strokeDasharray = `${percentage}, 100`;
            
            // تغییر رنگ تایمر در 10 ثانیه آخر
            if (timeLeft <= 10) {
                elTimerPath.style.stroke = '#FF4D4D';
                elStatus.textContent = "⏳ شرط‌بندی بسته شد! منتظر نتیجه...";
                elStatus.style.color = '#FFC107';
                disableBetting(true);
            } else {
                elTimerPath.style.stroke = '#00E096';
                elStatus.textContent = "🟢 شرط‌بندی باز است";
                elStatus.style.color = '#00E096';
                
                // اگر کاربر قبلا شرط نبسته، دکمه‌ها فعال باشند
                if (!data.user_bet) {
                    disableBetting(false);
                }
            }
        } else {
            elStatus.textContent = "در انتظار شروع راند جدید...";
            elTimerText.textContent = "--";
        }

        // 3. وضعیت شرط کاربر
        if (data.user_bet) {
            const type = data.user_bet.prediction; // UP or DOWN
            disableBetting(true);
            elStatus.textContent = `شما روی ${type === 'UP' ? 'صعود 📈' : 'نزول 📉'} شرط بستید.`;
            
            // هایلایت کردن دکمه انتخاب شده
            if (type === 'UP') btnUp.classList.add('selected');
            if (type === 'DOWN') btnDown.classList.add('selected');
        }
    }

    function updateChartData(price) {
        priceHistory.push(price);
        if (priceHistory.length > MAX_DATA_POINTS) {
            priceHistory.shift();
        }
        
        chart.data.datasets[0].data = priceHistory;
        
        // مقیاس‌دهی پویا به محور Y برای نمایش بهتر تغییرات
        const minPrice = Math.min(...priceHistory) * 0.9995;
        const maxPrice = Math.max(...priceHistory) * 1.0005;
        chart.options.scales.y.min = minPrice;
        chart.options.scales.y.max = maxPrice;
        
        chart.update();
    }

    // فعال/غیرفعال کردن دکمه‌ها
    function disableBetting(disabled) {
        btnUp.disabled = disabled;
        btnDown.disabled = disabled;
        inpAmount.disabled = disabled;
        if (!disabled) {
            btnUp.classList.remove('selected');
            btnDown.classList.remove('selected');
        }
    }

    // تابع ارسال شرط (که به window متصل می‌شود تا در HTML صدا زده شود)
    window.placeBet = async function(prediction) {
        const amount = parseInt(inpAmount.value);
        if (!amount || amount < 1) {
            tg.showAlert("لطفاً مبلغ معتبری وارد کنید.");
            return;
        }

        tg.HapticFeedback.impactOccurred('medium');
        
        // حالت انتظار
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
                tg.showAlert(`✅ شرط شما با موفقیت روی ${prediction} ثبت شد!`);
                // UI در آپدیت بعدی خودکار درست می‌شود
            } else {
                tg.showAlert(`❌ خطا: ${result.message}`);
                disableBetting(false); // بازگشت به حالت قبل
            }
        } catch (e) {
            tg.showAlert("خطا در ارتباط با سرور.");
            disableBetting(false);
        } finally {
            btn.classList.remove('loading-btn');
        }
    };

    // شروع
    document.addEventListener("DOMContentLoaded", init);

})();