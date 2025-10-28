(function () {
    const tg = window.Telegram.WebApp;
    
    const API_BASE_URL = "https://eos-nuclear-diana-conducting.trycloudflare.com"; // <-- آدرس تونل شما

    const loader = document.getElementById('loader');
    const appContainer = document.getElementById('app-container');

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
                updateDashboard(userData); // اطلاعات داشبورد را بلافاصله نمایش بده
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
                // --- <<< شروع تغییر: ارسال داده‌های لیدربورد به تابع >>> ---
                updateGamification(gamificationData); 
                updateLeaderboards(gamificationData.leaderboards, userData); // <-- تابع جدید فراخوانی می‌شود
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
        document.getElementById('toman-balance').textContent = `${data.toman_balance} تومان`;
        document.getElementById('xp-balance').textContent = `${data.xp_balance} XP`;
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
    
    // --- <<< شروع تابع جدید: پر کردن تابلوی امتیازات >>> ---
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
        
        // نمایش کل بخش تابلوی امتیازات
        leaderboardSection.classList.remove('hidden');
    }
    // --- <<< پایان تابع جدید >>> ---

    async function submitPrediction(matchId, outcome, cardElement) {
        tg.MainButton.showProgress();
        
        try {
            const response = await fetch(`${API_BASE_URL}/webapp/submit_prediction`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    initData: tg.initData,
                    match_id: parseInt(matchId.replace('match_', '')), 
                    outcome: outcome
                })
            });

            const result = await response.json();
            tg.MainButton.hideProgress();

            if (result.status === "success") {
                tg.showAlert(`✅ ${result.message}`);
                cardElement.classList.add('disabled');
                cardElement.querySelectorAll('.prediction-btn').forEach(btn => {
                    if (btn.dataset.optionKey === outcome) {
                        btn.classList.add('selected');
                    }
                    btn.disabled = true;
                });
            } else {
                tg.showAlert(`⚠️ ${result.message}`);
                cardElement.classList.add('disabled'); 
            }

        } catch (error) {
            tg.MainButton.hideProgress();
            tg.showAlert("❌ خطایی در ارتباط با سرور رخ داد. لطفاً دوباره تلاش کنید.");
            console.error("Failed to submit prediction:", error);
        }
    }

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

    // --- Entry Point ---
    document.addEventListener("DOMContentLoaded", () => {
        initTelegram();
        showLoader();
        fetchUserData();
    });

})();