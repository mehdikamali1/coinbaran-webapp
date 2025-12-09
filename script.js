/* webapp/script.js (v111.0 - Dashboard UI Logic with Fixed Logos) */
(function () {
    'use strict';

    // --- GLOBAL VARIABLES ---
    const tg = window.Telegram.WebApp;
    const API_BASE_URL = window.location.origin;
    let userFirstName = "کاربر";
    let isInitialized = false;
    let currentTomanBalance = "---";

    // --- LOGO MAPPING (اصلاح شده برای تفکیک USDT و UTOPIA) ---
    const logoMap = {
        'USDT': {
            src: 'webapp/images/usdt_logo.png', // آیکون تتر (USDT)
            alt: 'Tether Logo',
            color: '#50af95'
        },
        'BTC': {
            src: 'webapp/images/btc_logo.png',
            alt: 'Bitcoin Logo',
            color: '#f7931a'
        },
        'ETH': {
            src: 'webapp/images/eth_logo.png',
            alt: 'Ethereum Logo',
            color: '#627EEA'
        },
        'TON': {
            src: 'webapp/images/ton_logo.png',
            alt: 'Toncoin Logo',
            color: '#0098EA'
        },
        'NOT': {
            src: 'webapp/images/not_logo.png',
            alt: 'Notcoin Logo',
            color: '#FFCC00'
        },
        // فرض می‌کنیم یوتوپیا نیز یک Asset است
        'UTOPIA': {
            src: 'webapp/images/utopia_logo.png', // آیکون یوتوپیا
            alt: 'Utopia Coin',
            color: '#FFCC00'
        },
        // برای سایر موارد
        'DEFAULT': {
            src: 'webapp/images/default_coin.png',
            alt: 'Coin',
            color: '#999'
        }
    };

    // --- UTILITIES ---

    function showLoader() { document.getElementById('loader').style.display = 'flex'; }
    function hideLoader() { 
        document.getElementById('loader').style.opacity = '0';
        document.getElementById('loader').style.pointerEvents = 'none';
        document.getElementById('app-container').style.opacity = '1';
        setTimeout(() => { document.getElementById('loader').style.display = 'none'; }, 500);
    }
    
    function formatToman(value) {
        if (!value) return '0';
        return parseInt(String(value).replace(/,/g, '')).toLocaleString('fa-IR');
    }

    // --- INITIALIZATION ---
    window.onload = function() {
        if (!tg.initData) tg.initData = "query_id=TEST_DEV";
        
        try {
            tg.ready();
            tg.expand();
            tg.setHeaderColor('#050505'); 
            tg.setBackgroundColor('#050505');
        } catch (e) {
            console.log("Not inside Telegram WebApp:", e);
        }

        // فعال‌سازی دکمه‌های ریپل افکت
        document.querySelectorAll('.ripple-btn').forEach(btn => {
            btn.addEventListener('click', function(e) {
                const rect = btn.getBoundingClientRect();
                const size = Math.max(rect.width, rect.height);
                const x = e.clientX - rect.left - size / 2;
                const y = e.clientY - rect.top - size / 2;

                const ripple = document.createElement('span');
                ripple.style.width = ripple.style.height = size + 'px';
                ripple.style.left = x + 'px';
                ripple.style.top = y + 'px';
                ripple.className = 'ripple';

                btn.appendChild(ripple);
                setTimeout(() => ripple.remove(), 600);
            });
        });
        
        // شروع بارگذاری داده‌ها
        fetchUserData();
        fetchMarketRates();
        fetchGameState();
        
        // تنظیم اینتروال برای به‌روزرسانی نرخ‌ها
        setInterval(fetchMarketRates, 15000); // هر 15 ثانیه
        setInterval(fetchGameState, 1000);   // هر 1 ثانیه
    };
    
    // --- DATA FETCHING ---
    
    async function fetchUserData() {
        try {
            const res = await fetch(`${API_BASE_URL}/webapp/get_user_data`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
                body: JSON.stringify({ initData: tg.initData })
            });
            const data = await res.json();
            
            if (data.status === 'success') {
                userFirstName = data.first_name || "کاربر";
                currentTomanBalance = data.toman_balance;
                
                document.getElementById('user-name').innerText = ` ${userFirstName}، خوش آمدید`;
                document.getElementById('balance-toman-main').innerText = data.toman_balance;
                document.getElementById('balance-uusd-main').innerText = data.uusd_balance;
                document.getElementById('balance-xp-main').innerText = data.xp_balance;

                // نمایش وضعیت KYC
                const kycStatusElement = document.getElementById('kyc-status');
                const kycLevel = parseInt(data.kyc_level);
                let statusText = "";
                let statusIcon = "";
                let statusClass = "";

                if (kycLevel === 3) {
                    statusText = "VIP طلایی 💎";
                    statusIcon = "fas fa-gem";
                    statusClass = "status-gold";
                } else if (kycLevel === 2) {
                    statusText = "تایید کامل ✅";
                    statusIcon = "fas fa-check-circle";
                    statusClass = "status-success";
                } else if (data.kyc_status_code && data.kyc_status_code.startsWith('pending')) {
                    statusText = "در حال بررسی ⏳";
                    statusIcon = "fas fa-hourglass-half";
                    statusClass = "status-pending";
                } else {
                    statusText = "سطح ۱ (ناقص) ⚠️";
                    statusIcon = "fas fa-exclamation-triangle";
                    statusClass = "status-warning";
                }
                
                kycStatusElement.innerHTML = `<i class="${statusIcon}"></i> ${statusText}`;
                kycStatusElement.className = `stat-value ${statusClass}`;
            }
            
            if (!isInitialized) {
                hideLoader();
                isInitialized = true;
            }
        } catch (e) {
            console.error("User data fetch error:", e);
            if (!isInitialized) hideLoader();
        }
    }
    
    async function fetchMarketRates() {
        try {
            const res = await fetch(`${API_BASE_URL}/webapp/market/rates`, {
                headers: { 'ngrok-skip-browser-warning': 'true' }
            });
            const data = await res.json();
            
            if (data.status === 'success' && data.rates) {
                renderAssetCards(data.rates);
            }
        } catch (e) {
            console.error("Market rate fetch error:", e);
        }
    }

    // --- GAME STATE ---
    
    async function fetchGameState() {
         try {
            const res = await fetch(`${API_BASE_URL}/webapp/game/state`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
                body: JSON.stringify({ initData: tg.initData })
            });
            const data = await res.json();

            if (data.current_price) {
                // نمایش قیمت لحظه‌ای
                document.getElementById('btc-current-price').innerText = data.current_price.toFixed(2).toLocaleString('fa-IR');
                // نمایش زمان باقی‌مانده
                document.getElementById('round-time-left').innerText = data.round.time_left;
                
                // به‌روزرسانی تاریخچه
                renderGameHistory(data.history);
                
                // نمایش نتیجه شرط قبلی
                renderLastResult(data.last_result);
                
                // نمایش شرط کاربر در دور فعلی
                renderUserBet(data.user_bet);

                // به‌روزرسانی موجودی کاربر
                document.getElementById('game-user-balance').innerText = data.user_balance.toLocaleString('fa-IR', {minimumFractionDigits: 2});
            }
        } catch (e) {
            console.error("Game state fetch error:", e);
        }
    }

    // --- RENDERING FUNCTIONS ---

    function renderAssetCards(rates) {
        const container = document.getElementById('asset-cards-container');
        container.innerHTML = '';
        
        rates.forEach(rate => {
            // دریافت اطلاعات لوگو از Map
            const logoInfo = logoMap[rate.symbol] || logoMap['DEFAULT'];
            
            // تعیین کلاس رنگ بر اساس تغییرات ۲۴ ساعته
            const change = parseFloat(rate.change);
            let changeClass = 'change-neutral';
            if (change > 0) {
                changeClass = 'change-up';
            } else if (change < 0) {
                changeClass = 'change-down';
            }
            
            const card = document.createElement('div');
            card.className = 'asset-card ripple-effect';
            card.innerHTML = `
                <div class="asset-icon" style="background-color: ${logoInfo.color.replace(')', ', 0.1)')}; border: 1px solid ${logoInfo.color.replace(')', ', 0.2)')};">
                    <img src="${logoInfo.src}" alt="${logoInfo.alt}">
                </div>
                <div class="asset-details">
                    <span class="asset-symbol">${rate.symbol}</span>
                    <span class="asset-price">${rate.price}</span>
                </div>
                <div class="asset-change ${changeClass}">
                    ${change.toFixed(2)}%
                </div>
            `;
            container.appendChild(card);
        });
    }

    function renderGameHistory(history) {
        const container = document.getElementById('game-history-container');
        container.innerHTML = '';
        
        // نمایش فقط 5 نتیجه آخر
        const recentHistory = history.slice(-5).reverse(); 

        recentHistory.forEach(round => {
            const isUp = round.result === 'UP';
            const resultClass = isUp ? 'up-result' : 'down-result';
            const resultIcon = isUp ? '<i class="fas fa-arrow-up"></i>' : '<i class="fas fa-arrow-down"></i>';
            
            const item = document.createElement('div');
            item.className = `history-item ${resultClass}`;
            item.title = `قیمت بسته شدن: ${round.end_price.toFixed(2)}`;
            item.innerHTML = resultIcon; 
            
            container.appendChild(item);
        });
    }

    function renderLastResult(result) {
        const container = document.getElementById('last-result-container');
        if (result) {
            const isWin = result.status === 'WIN';
            const statusText = isWin ? `🥳 ${formatToman(result.payout)} $` : `😓 ${formatToman(result.bet_amount)} $`;
            const statusClass = isWin ? 'result-win' : 'result-loss';
            
            container.innerHTML = `<span class="${statusClass}">${statusText}</span>`;
            // نمایش هشدار تلگرام برای نتیجه
            if (isInitialized) {
                 tg.HapticFeedback.notificationOccurred(isWin ? 'success' : 'error');
            }
        } else {
            container.innerHTML = `<span class="result-none">نتیجه قبلی</span>`;
        }
    }

    function renderUserBet(bet) {
        const btnBetUp = document.getElementById('btn-bet-up');
        const btnBetDown = document.getElementById('btn-bet-down');
        
        btnBetUp.classList.remove('bet-active');
        btnBetDown.classList.remove('bet-active');

        if (bet) {
            const activeBtn = bet.prediction === 'UP' ? btnBetUp : btnBetDown;
            activeBtn.classList.add('bet-active');
            activeBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${bet.amount.toLocaleString()} $`;
        } else {
             btnBetUp.innerHTML = `<i class="fas fa-arrow-up"></i> بالا`;
             btnBetDown.innerHTML = `<i class="fas fa-arrow-down"></i> پایین`;
        }
    }

    // --- GAME INTERACTION ---
    
    // متغیرهای موقتی برای نگهداری مبلغ و جهت شرط
    let betAmount = 0.0;
    let betDirection = null;

    window.setBetAmount = function(amount) {
        betAmount = amount;
        document.querySelectorAll('.amount-btn').forEach(btn => btn.classList.remove('active'));
        document.getElementById(`btn-amount-${amount}`).classList.add('active');
        updateBetFooter();
    }
    
    window.selectBetDirection = function(direction) {
        betDirection = direction;
        document.querySelectorAll('.direction-btn').forEach(btn => btn.classList.remove('active'));
        document.getElementById(`btn-direction-${direction}`).classList.add('active');
        updateBetFooter();
    }

    function updateBetFooter() {
        const footer = document.getElementById('bet-footer');
        const submitBtn = document.getElementById('btn-submit-bet');
        const swapBtn = document.getElementById('btn-swap-usd');
        
        if (betAmount > 0 && betDirection) {
            submitBtn.style.display = 'block';
            swapBtn.style.display = 'none';
            submitBtn.disabled = false;
            submitBtn.innerHTML = `ثبت شرط ${betAmount.toLocaleString()} $ (جهت: ${betDirection === 'UP' ? 'بالا' : 'پایین'})`;
            footer.style.backgroundColor = 'var(--primary-gold)';
            submitBtn.style.color = '#000';
            tg.HapticFeedback.selectionChanged();
        } else {
             // اگر شرط ناقص بود یا مبلغ ۰ بود، دکمه تبدیل را نمایش دهید.
            if (currentTomanBalance.replace(/,/g, '') > 50000 && betAmount === 0) {
                 submitBtn.style.display = 'none';
                 swapBtn.style.display = 'block';
                 footer.style.backgroundColor = 'rgba(255,255,255,0.1)';
                 swapBtn.style.color = '#fff';
            } else {
                 submitBtn.style.display = 'block';
                 swapBtn.style.display = 'none';
                 submitBtn.disabled = true;
                 submitBtn.innerHTML = `مبلغ و جهت را انتخاب کنید`;
                 footer.style.backgroundColor = 'rgba(255,255,255,0.1)';
                 submitBtn.style.color = '#aaa';
            }
        }
    }
    
    window.submitBet = async function() {
        if (!betAmount || !betDirection) return;
        
        const btn = document.getElementById('btn-submit-bet');
        btn.disabled = true;
        btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> در حال ارسال...`;
        tg.HapticFeedback.impactOccurred('heavy');

        try {
            const res = await fetch(`${API_BASE_URL}/webapp/game/bet`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
                body: JSON.stringify({ initData: tg.initData, amount: betAmount, prediction: betDirection })
            });
            
            const data = await res.json();

            if (data.status === 'success') {
                tg.showAlert(`✅ شرط ${betAmount}$ در قیمت ${data.entry_price.toFixed(2)} ثبت شد!`);
                tg.HapticFeedback.notificationOccurred('success');
                // ری‌رندر برای نمایش شرط کاربر
                fetchGameState();
                // ریست UI
                betAmount = 0; betDirection = null;
                document.querySelectorAll('.amount-btn').forEach(btn => btn.classList.remove('active'));
                document.querySelectorAll('.direction-btn').forEach(btn => btn.classList.remove('active'));
            } else {
                tg.showAlert(`❌ خطا در ثبت شرط: ${data.message}`);
                tg.HapticFeedback.notificationOccurred('error');
            }
        } catch (e) {
            tg.showAlert("خطای ارتباط با سرور.");
        } finally {
            btn.disabled = false;
            updateBetFooter();
        }
    }

    // --- SWAP MODAL ---
    
    window.openSwapModal = function() {
        document.getElementById('swap-modal').classList.add('active');
        document.getElementById('swap-toman-input').value = '';
        document.getElementById('swap-usd-output').innerText = '۰.۰۰';
        document.getElementById('swap-rate').innerText = 'در حال دریافت...';
        tg.HapticFeedback.impactOccurred('medium');
        fetchSwapRate();
    }
    
    window.closeSwapModal = function() {
        document.getElementById('swap-modal').classList.remove('active');
        tg.HapticFeedback.impactOccurred('light');
    }
    
    let currentSwapRate = 0;

    async function fetchSwapRate() {
        try {
            // فرض می‌کنیم USDT/TMN نرخ فروش است
            const res = await fetch(`${API_BASE_URL}/webapp/get_tether_price_sell`); 
            const rateData = await res.json();
            
            if (rateData.status === 'success') {
                currentSwapRate = rateData.rate;
                document.getElementById('swap-rate').innerText = currentSwapRate.toLocaleString('fa-IR');
            } else {
                 document.getElementById('swap-rate').innerText = 'خطا در نرخ';
            }
        } catch(e) {
             document.getElementById('swap-rate').innerText = 'خطا در شبکه';
        }
    }
    
    window.updateSwapOutput = function(input) {
        const tomanAmount = parseInt(input.value) || 0;
        const usdOutput = document.getElementById('swap-usd-output');
        const submitBtn = document.getElementById('btn-confirm-swap');
        
        if (currentSwapRate > 0 && tomanAmount > 0) {
            const usdAmount = (tomanAmount / currentSwapRate).toFixed(2);
            usdOutput.innerText = usdAmount.toLocaleString('fa-IR', {minimumFractionDigits: 2});
            
            // اعتبارسنجی
            const currentToman = parseInt(currentTomanBalance.replace(/,/g, ''));
            if (tomanAmount < 50000) {
                 submitBtn.disabled = true;
                 submitBtn.innerText = 'حداقل مبلغ ۵۰,۰۰۰ تومان است';
            } else if (tomanAmount > currentToman) {
                 submitBtn.disabled = true;
                 submitBtn.innerText = 'موجودی تومان کافی نیست';
            } else {
                 submitBtn.disabled = false;
                 submitBtn.innerText = `تبدیل به ${usdAmount} $`;
            }
        } else {
            usdOutput.innerText = '۰.۰۰';
            submitBtn.disabled = true;
            submitBtn.innerText = 'مبلغ را وارد کنید';
        }
    }
    
    window.submitSwap = async function() {
        const tomanAmount = parseInt(document.getElementById('swap-toman-input').value) || 0;
        if (!tomanAmount || tomanAmount < 50000) return;
        
        const btn = document.getElementById('btn-confirm-swap');
        btn.disabled = true;
        btn.innerText = 'در حال پردازش...';
        tg.HapticFeedback.impactOccurred('heavy');
        
        try {
            const res = await fetch(`${API_BASE_URL}/webapp/game/swap-to-usd`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
                body: JSON.stringify({ initData: tg.initData, amount_toman: tomanAmount })
            });
            
            const data = await res.json();
            
            if (data.status === 'success') {
                tg.showAlert(`✅ ${data.message}`);
                tg.HapticFeedback.notificationOccurred('success');
                closeSwapModal();
                fetchUserData(); 
                fetchGameState(); // برای آپدیت بالانس بازی
            } else {
                tg.showAlert(`❌ خطا: ${data.message}`);
                tg.HapticFeedback.notificationOccurred('error');
            }
        } catch (e) {
            tg.showAlert("خطای ارتباط با سرور.");
        } finally {
            btn.disabled = false;
            btn.innerText = 'تایید تبدیل';
            updateSwapOutput(document.getElementById('swap-toman-input'));
        }
    }
    
    // --- Initial Call to set footer state ---
    // این تابع باید بعد از لود اولیه داده ها فراخوانی شود
    setTimeout(() => updateBetFooter(), 1500);

})();