(function () {
    const tg = window.Telegram.WebApp;
    
    const API_BASE_URL = "https://arise-literally-computational-footwear.trycloudflare.com"; // <-- آدرس تونل شما

    // --- <<< شروع تغییر: تعریف هزینه‌های فروشگاه در JS >>> ---
    // این مقادیر باید با config.py هماهنگ باشند
    const XP_COST_FOR_VOUCHER = 100;
    const USER_LEVELS_XP_COST = {
        'bronze': 500,  // هزینه ارتقا به Silver
        'silver': 2500, // هزینه ارتقا به Gold
        'gold': 10000,  // هزینه ارتقا به Platinum
        'platinum': Infinity
    };
    // --- <<< پایان تغییر >>> ---

    const loader = document.getElementById('loader');
    const appContainer = document.getElementById('app-container');

    // آبجکت سراسری برای نگهداری اطلاعات کاربر
    let currentUserData = {};

    function showLoader() {
        loader.classList.remove('hidden');
        appContainer.classList.add('hidden');
    }

    function hideLoader() {
        loader.classList.add('hidden');
        appContainer.classList.remove('hidden');
    }

    function initTelegram() {
        tg.ready();
        tg.expand();
        tg.setHeaderColor('secondary_bg_color');
        tg.setBackgroundColor('bg_color');
    }

    async function fetchUserData() {
        if (!tg.initData) {
            console.error("Telegram initData not available.");
            document.getElementById('loader').innerHTML = '<p style="color: red;">خطا: لطفاً این صفحه را فقط از داخل ربات تلگرام باز کنید.</p>';
            return;
        }

        try {
            // --- مرحله 1: دریافت اطلاعات اصلی کاربر ---
            const userDataResponse = await fetch(`${API_BASE_URL}/webapp/get_user_data`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ initData: tg.initData })
            });

            if (!userDataResponse.ok) {
                if (userDataResponse.status === 401) throw new Error("خطای اعتبارسنجی (401).");
                throw new Error(`خطای سرور کاربر (${userDataResponse.status})`);
            }
            
            const userData = await userDataResponse.json();
            if (userData.status === "success") {
                currentUserData = userData; // <-- ذخیره اطلاعات کاربر در متغیر سراسری
                updateDashboard(userData); 
            } else {
                throw new Error(userData.message || "خطا در دریافت اطلاعات کاربر.");
            }

            // --- مرحله 2: دریافت اطلاعات گیمیفیکیشن ---
            const gamificationDataResponse = await fetch(`${API_BASE_URL}/webapp/get_gamification_data`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ initData: tg.initData })
            });

            if (!gamificationDataResponse.ok) {
                 throw new Error(`خطای سرور گیمیفیکیشن (${gamificationDataResponse.status})`);
            }

            const gamificationData = await gamificationDataResponse.json();
            if (gamificationData.status === "success") {
                updateGamification(gamificationData); 
                updateLeaderboards(gamificationData.leaderboards, userData);
                updateAchievements(gamificationData.achievements);
                // --- <<< شروع تغییر: فراخوانی تابع جدید فروشگاه >>> ---
                updateStore(userData); // <-- تابع جدید فراخوانی می‌شود
                // --- <<< پایان تغییر >>> ---
            } else {
                throw new Error(gamificationData.message || "خطا در دریافت اطلاعات گیمیفیکیشن.");
            }

            // --- مرحله 3: نمایش کامل برنامه ---
            hideLoader();

        } catch (error) {
            // مدیریت خطای نهایی
            console.error("Error fetching data:", error);
            if (error.message.includes("Failed to fetch")) {
                 document.getElementById('loader').innerHTML = `<p style="color: red;">خطا در بارگذاری (Load failed):<br>اتصال به سرور API برقرار نشد. لطفاً مطمئن شوید تونل Cloudflare فعال است.</p>`;
            } else {
                 document.getElementById('loader').innerHTML = `<p style="color: red;">خطا در بارگذاری اطلاعات: ${error.message}</p>`;
            }
        }
    }

    function updateDashboard(data) {
        // Header
        document.getElementById('welcome-name').textContent = `سلام، ${data.first_name}`;
        document.getElementById('welcome-name').classList.remove('loading');
        
        const kycStatusEl = document.getElementById('kyc-status');
        const kycIconEl = document.getElementById('kyc-icon');
        
        kycStatusEl.classList.remove('loading');
        kycIconEl.classList.remove('fa-spinner', 'fa-spin');

        document.getElementById('kyc-text').textContent = data.kyc_status_text;
        kycStatusEl.className = 'kyc-status'; // Reset classes
        kycStatusEl.classList.add(data.kyc_status_code || 'not_submitted');
        
        const iconMap = {
            'approved': 'fa-check-circle',
            'pending': 'fa-clock',
            'rejected': 'fa-times-circle',
            'not_submitted': 'fa-file-alt'
        };
        kycIconEl.classList.add('fas', iconMap[data.kyc_status_code || 'not_submitted']);

        // Balance Card
        // --- <<< شروع تغییر: آپدیت موجودی XP از متغیر سراسری >>> ---
        const xpBalanceNum = parseFloat(data.xp_balance.replace(/,/g, '')) || 0;
        currentUserData.numeric_xp_balance = xpBalanceNum; // ذخیره عددی
        document.getElementById('toman-balance').textContent = `${data.toman_balance} تومان`;
        document.getElementById('xp-balance').textContent = `${xpBalanceNum.toLocaleString('fa-IR', { maximumFractionDigits: 0 })} XP`;
        // --- <<< پایان تغییر >>> ---
        document.getElementById('toman-balance').classList.remove('loading');
        document.getElementById('xp-balance').classList.remove('loading');

        // Level Card
        document.getElementById('level-name').textContent = data.level_name;
        document.getElementById('level-name').classList.remove('loading');
        
        document.getElementById('progress-text').textContent = data.level_progress_bar;
        document.getElementById('progress-text').classList.remove('loading');

        // Animate progress bar
        const progressBar = document.getElementById('progress-bar');
        const percentage = parseFloat(data.level_progress_bar.match(/(\d+(\.\d+)?)%/)?.[1] || 0);
        progressBar.style.width = `${percentage}%`;
    }
    
    function updateGamification(data) {
        const predictionsContainer = document.getElementById('predictions-container');
        const campaignsContainer = document.getElementById('campaigns-container');
        const predictionsSection = document.getElementById('predictions-section');
        const campaignsSection = document.getElementById('campaigns-section');

        predictionsContainer.innerHTML = '';
        campaignsContainer.innerHTML = '';

        // 1. ساخت کارت‌های پیش‌بینی
        if (data.predictions && data.predictions.length > 0) {
            data.predictions.forEach(match => {
                const card = document.createElement('div');
                card.className = 'card prediction-card';
                card.dataset.matchId = match.id; 

                let optionsHtml = '';
                match.options.forEach(opt => {
                    optionsHtml += `<button class="card-btn prediction-btn" data-option-key="${opt.key}">${opt.text}</button>`;
                });

                card.innerHTML = `
                    <div class="card-header">
                        <span class="card-title">${match.title}</span>
                        <span class="card-subtitle">${match.subtitle}</span>
                    </div>
                    <p class="card-question">${match.question}</p>
                    <div class="card-options">
                        ${optionsHtml}
                    </div>
                `;
                predictionsContainer.appendChild(card);
            });
            predictionsSection.classList.remove('hidden');
        } else {
            predictionsSection.classList.add('hidden');
        }

        // 2. ساخت کارت‌های کمپین
        if (data.campaigns && data.campaigns.length > 0) {
            data.campaigns.forEach(campaign => {
                const card = document.createElement('div');
                card.className = 'card campaign-card';
                card.dataset.productTarget = campaign.product_target; 
                
                card.innerHTML = `
                    <div class="card-header">
                        <span class="card-title">${campaign.title}</span>
                    </div>
                    <p class="card-subtitle">${campaign.subtitle}</p>
                    <div class="card-options">
                        <button class="card-btn campaign-btn">
                            <i class="fas fa-percent"></i> استفاده از تخفیف
                        </button>
                    </div>
                `;
                campaignsContainer.appendChild(card);
            });
            campaignsSection.classList.remove('hidden');
        } else {
            campaignsSection.classList.add('hidden');
        }

        // 3. افزودن Event Listener ها پس از ساخت کارت‌ها
        addCardListeners();
    }
    
    function updateLeaderboards(leaderboardData, userData) {
        const leaderboardSection = document.getElementById('leaderboard-section');
        
        // 1. پر کردن رتبه خود کاربر
        const tradeRankEl = document.getElementById('user-trade-rank');
        const tradeValueEl = document.getElementById('user-trade-value');
        tradeRankEl.textContent = `#${userData.user_rank_trade || 'N/A'}`;
        tradeValueEl.textContent = `${userData.user_rank_trade_value} تومان`;
        tradeRankEl.classList.remove('loading');
        tradeValueEl.classList.remove('loading');

        const predRankEl = document.getElementById('user-prediction-rank');
        const predValueEl = document.getElementById('user-prediction-value');
        predRankEl.textContent = `#${userData.user_rank_prediction || 'N/A'}`;
        predValueEl.textContent = `${userData.user_rank_prediction_value} برد`;
        predRankEl.classList.remove('loading');
        predValueEl.classList.remove('loading');

        // 2. پر کردن لیست برترین معامله‌گران
        const tradersListEl = document.getElementById('top-traders-list');
        tradersListEl.innerHTML = ''; // پاک کردن لودر
        if (leaderboardData.trade_volume && leaderboardData.trade_volume.length > 0) {
            leaderboardData.trade_volume.forEach(user => {
                const li = document.createElement('li');
                li.textContent = `${user.display_name} (${parseFloat(user.total_volume_toman).toLocaleString('fa-IR', { maximumFractionDigits: 0 })} ت)`;
                tradersListEl.appendChild(li);
            });
        } else {
            tradersListEl.innerHTML = "<li>هنوز رتبه‌بندی وجود ندارد.</li>";
        }

        // 3. پر کردن لیست برترین پیش‌بینی‌کنندگان
        const predictorsListEl = document.getElementById('top-predictors-list');
        predictorsListEl.innerHTML = ''; // پاک کردن لودر
        if (leaderboardData.prediction_wins && leaderboardData.prediction_wins.length > 0) {
            leaderboardData.prediction_wins.forEach(user => {
                const li = document.createElement('li');
                li.textContent = `${user.display_name} (${user.win_count} برد)`;
                predictorsListEl.appendChild(li);
            });
        } else {
            predictorsListEl.innerHTML = "<li>هنوز رتبه‌بندی وجود ندارد.</li>";
        }
        
        leaderboardSection.classList.remove('hidden');
    }

    function updateAchievements(achievementsData) {
        const achievementsContainer = document.getElementById('achievements-container');
        const achievementsSection = document.getElementById('achievements-section');
        
        achievementsContainer.innerHTML = ''; 

        if (achievementsData && achievementsData.length > 0) {
            achievementsData.forEach(ach => {
                const card = document.createElement('div');
                card.className = 'achievement-card';
                if (!ach.is_earned) {
                    card.classList.add('locked');
                }
                
                card.innerHTML = `
                    <span class="ach-icon">${ach.icon}</span>
                    <span class="ach-name">${ach.name}</span>
                    <span class="ach-xp">+${ach.xp_reward} XP</span>
                `;
                
                card.title = ach.description; 
                
                achievementsContainer.appendChild(card);
            });
            achievementsSection.classList.remove('hidden'); 
        } else {
            achievementsSection.classList.add('hidden'); 
        }
    }

    // --- <<< شروع تابع جدید: ساخت فروشگاه >>> ---
    function updateStore(userData) {
        const storeContainer = document.getElementById('store-container');
        const storeSection = document.getElementById('store-section');
        storeContainer.innerHTML = ''; // پاک کردن لودرها

        const currentXP = userData.numeric_xp_balance;
        const currentLevel = userData.kyc_status_code === 'approved' ? userData.level_name.split(' ')[0].toLowerCase() : 'bronze';

        let itemsAdded = 0;

        // 1. آیتم ارتقاء سطح
        if (currentLevel !== 'platinum') {
            const nextLevelXP = USER_LEVELS_XP_COST[currentLevel];
            const canAfford = currentXP >= nextLevelXP;
            
            const levelUpCard = document.createElement('div');
            levelUpCard.className = 'card store-card';
            levelUpCard.innerHTML = `
                <div class="store-item-info">
                    <span class="store-item-title">💎 ارتقاء به سطح بعدی</span>
                    <span class="store-item-desc">سطح خود را ارتقا دهید و کارمزد کمتری بپردازید.</span>
                </div>
                <button id="btn-buy-levelup" class="store-item-btn" data-item-id="buy_levelup" ${!canAfford ? 'disabled' : ''}>
                    ${nextLevelXP.toLocaleString('fa-IR')} <i class="fas fa-star xp-icon"></i>
                </button>
            `;
            storeContainer.appendChild(levelUpCard);
            itemsAdded++;
        }

        // 2. آیتم ووچر
        const canAffordVoucher = currentXP >= XP_COST_FOR_VOUCHER;
        const voucherCard = document.createElement('div');
        voucherCard.className = 'card store-card';
        voucherCard.innerHTML = `
            <div class="store-item-info">
                <span class="store-item-title">🎟️ ووچر ۱ دلاری یوتوپیا</span>
                <span class="store-item-desc">امتیاز خود را به ووچر تبدیل کنید.</span>
            </div>
            <button id="btn-buy-voucher" class="store-item-btn" data-item-id="buy_voucher" ${!canAffordVoucher ? 'disabled' : ''}>
                ${XP_COST_FOR_VOUCHER.toLocaleString('fa-IR')} <i class="fas fa-star xp-icon"></i>
            </button>
        `;
        storeContainer.appendChild(voucherCard);
        itemsAdded++;

        // 3. افزودن Listener ها
        if (itemsAdded > 0) {
            addStoreListeners();
            storeSection.classList.remove('hidden');
        } else {
            storeSection.classList.add('hidden');
        }
    }
    // --- <<< پایان تابع جدید >>> ---


    // --- <<< شروع تابع جدید: ارسال خرید از فروشگاه >>> ---
    async function submitStorePurchase(itemId, buttonElement) {
        tg.MainButton.showProgress();
        
        try {
            const response = await fetch(`${API_BASE_URL}/webapp/purchase_with_xp`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    initData: tg.initData,
                    item_id: itemId
                })
            });

            const result = await response.json();
            tg.MainButton.hideProgress();

            if (result.status === "success") {
                tg.showAlert(`✅ ${result.message}`);
                
                // به‌روزرسانی فوری موجودی XP در UI
                if (result.new_xp_balance) {
                    const newXPNum = parseFloat(result.new_xp_balance.replace(/,/g, '')) || 0;
                    currentUserData.numeric_xp_balance = newXPNum;
                    document.getElementById('xp-balance').textContent = `${newXPNum.toLocaleString('fa-IR', { maximumFractionDigits: 0 })} XP`;
                    // آپدیت کردن دکمه‌های فروشگاه بر اساس موجودی جدید
                    updateStoreButtonStatus();
                }
            } else {
                tg.showAlert(`⚠️ ${result.message}`);
            }

        } catch (error) {
            tg.MainButton.hideProgress();
            tg.showAlert("❌ خطایی در ارتباط با سرور رخ داد. لطفاً دوباره تلاش کنید.");
            console.error("Failed to submit store purchase:", error);
        }
    }
    
    // --- تابع کمکی برای آپدیت دکمه‌های فروشگاه ---
    function updateStoreButtonStatus() {
        const currentXP = currentUserData.numeric_xp_balance;
        
        const levelUpBtn = document.getElementById('btn-buy-levelup');
        if(levelUpBtn) {
            const currentLevel = currentUserData.level_name.split(' ')[0].toLowerCase();
            const cost = USER_LEVELS_XP_COST[currentLevel];
            levelUpBtn.disabled = currentXP < cost;
        }

        const voucherBtn = document.getElementById('btn-buy-voucher');
        if(voucherBtn) {
            voucherBtn.disabled = currentXP < XP_COST_FOR_VOUCHER;
        }
    }
    // --- <<< پایان توابع جدید >>> ---


    function addCardListeners() {
        // 1. Listener برای دکمه‌های پیش‌بینی
        document.querySelectorAll('.prediction-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const btn = e.currentTarget;
                const card = btn.closest('.prediction-card');
                const matchId = card.dataset.matchId;
                const outcome = btn.dataset.optionKey;
                
                tg.showConfirm(`آیا از ثبت پیش‌بینی «${btn.textContent}» مطمئن هستید؟`, (confirmed) => {
                    if (confirmed) {
                        submitPrediction(matchId, outcome, card);
                    }
                });
            });
        });

        // 2. Listener برای دکمه‌های کمپین
        document.querySelectorAll('.campaign-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const card = e.currentTarget.closest('.campaign-card');
                const target = card.dataset.productTarget;
                
                let action = '';
                if (target === 'usdt_buy') {
                    action = 'action_trade'; 
                } else if (target === 'utopia_voucher') {
                    action = 'action_trade'; 
                }

                if (action) {
                    tg.sendData(action);
                    tg.close();
                }
            });
        });
    }

    // --- <<< شروع تابع جدید: افزودن Listener برای فروشگاه >>> ---
    function addStoreListeners() {
        document.querySelectorAll('.store-item-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const btn = e.currentTarget;
                const itemId = btn.dataset.itemId;
                
                let confirmText = "";
                if (itemId === 'buy_levelup') {
                    const cost = btn.textContent.trim();
                    confirmText = `آیا مطمئن هستید که می‌خواهید با ${cost} امتیاز، سطح خود را ارتقا دهید؟`;
                } else if (itemId === 'buy_voucher') {
                    const cost = btn.textContent.trim();
                    confirmText = `آیا مطمئن هستید که می‌خواهید با ${cost} امتیاز، ووچر ۱ دلاری دریافت کنید؟`;
                }
                
                if (confirmText) {
                    tg.showConfirm(confirmText, (confirmed) => {
                        if (confirmed) {
                            submitStorePurchase(itemId, btn);
                        }
                    });
                }
            });
        });
    }
    // --- <<< پایان تابع جدید >>> ---

    // --- Entry Point ---
    document.addEventListener("DOMContentLoaded", () => {
        initTelegram();
        showLoader();
        fetchUserData();
    });

})();