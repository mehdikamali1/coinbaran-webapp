/* webapp/script.js (نسخه 2.3 - اصلاح نهایی API_BASE_URL) */
(function () {
    'use strict';

    // --- 1. تنظیمات و دسترسی به عناصر ---
    const tg = window.Telegram.WebApp;
    
    // ❗️❗️❗️ آدرس صحیح تونل شما ❗️❗️❗️
    // (این آدرس از لاگ Cloudflare شما گرفته شد)
    const API_BASE_URL = "https://peter-protection-instructors-representations.trycloudflare.com";

    const loader = document.getElementById('loader');
    const appContainer = document.getElementById('app-container');

    // دسترسی به تمام عناصر قابل آپدیت
    const elements = {
        welcomeName: document.getElementById('welcome-name'),
        kycStatus: document.getElementById('kyc-status'),
        kycIcon: document.getElementById('kyc-icon'),
        kycText: document.getElementById('kyc-text'),
        tomanBalance: document.getElementById('toman-balance'),
        xpBalance: document.getElementById('xp-balance'),
        levelName: document.getElementById('level-name'),
        progressBar: document.getElementById('progress-bar'),
        progressText: document.getElementById('progress-text'),
        leaderboardSection: document.getElementById('leaderboard-section'),
        leaderboardContainer: document.getElementById('leaderboard-container'),
        predictionsSection: document.getElementById('predictions-section'),
        predictionsContainer: document.getElementById('predictions-container'),
        campaignsSection: document.getElementById('campaigns-section'),
        campaignsContainer: document.getElementById('campaigns-container')
    };
    
    // --- 2. توابع اصلی ---

    /**
     * برنامه را راه‌اندازی کرده و اطلاعات اولیه را واکشی می‌کند.
     */
    async function init() {
        tg.ready();
        tg.expand();
        tg.setHeaderColor('secondary_bg_color');
        tg.setBackgroundColor('bg_color');
        
        showLoader();
        await fetchAllData();
    }

    /**
     * هر دو اندپوینت اطلاعات کاربر و گیمیفیکیشن را به صورت همزمان واکشی می‌کند.
     */
    async function fetchAllData() {
        if (!tg.initData) {
            handleError("خطا: لطفاً این صفحه را فقط از داخل ربات تلگرام باز کنید.");
            return;
        }

        try {
            // هر دو درخواست را همزمان ارسال کن
            const [userResponse, gamificationResponse] = await Promise.all([
                fetch(`${API_BASE_URL}/webapp/get_user_data`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ initData: tg.initData })
                }),
                fetch(`${API_BASE_URL}/webapp/get_gamification_data`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ initData: tg.initData })
                })
            ]);

            // بررسی پاسخ اول (اطلاعات کاربر)
            if (!userResponse.ok) {
                if (userResponse.status === 401) throw new Error("خطای اعتبارسنجی (401).");
                throw new Error(`خطای سرور کاربر (${userResponse.status})`);
            }
            const userData = await userResponse.json();
            if (userData.status !== "success") {
                throw new Error(userData.message || "خطا در دریافت اطلاعات کاربر.");
            }

            // بررسی پاسخ دوم (گیمیفیکیشن)
            if (!gamificationResponse.ok) {
                throw new Error(`خطای سرور گیمیفیکیشن (${gamificationResponse.status})`);
            }
            const gamificationData = await gamificationResponse.json();
            if (gamificationData.status !== "success") {
                throw new Error(gamificationData.message || "خطا در دریافت اطلاعات گیمیفیکیشن.");
            }

            // اگر هر دو موفق بودند، رابط کاربری را آپدیت کن
            updateDashboard(userData);
            updateGamification(gamificationData);
            
            hideLoader();

        } catch (error) {
            console.error("Error fetching data:", error);
            let errorMsg = `خطا در بارگذاری اطلاعات: ${error.message}`;
            if (error.message.includes("Failed to fetch")) {
                errorMsg = `<p style="color: red;">خطا در بارگذاری (Load failed):<br>اتصال به سرور API برقرار نشد. (آدرس: ${API_BASE_URL})</p>`;
            }
            handleError(errorMsg);
        }
    }

    /**
     * بخش‌های اصلی داشبورد (موجودی، سطح، KYC) را به‌روزرسانی می‌کند.
     */
    function updateDashboard(data) {
        // هدر
        elements.welcomeName.textContent = `سلام، ${data.first_name}`;
        elements.welcomeName.classList.remove('loading');
        
        elements.kycStatus.classList.remove('loading');
        elements.kycIcon.classList.remove('fa-spinner', 'fa-spin');
        elements.kycText.textContent = data.kyc_status_text;
        elements.kycStatus.className = 'kyc-status'; // ریست کردن کلاس‌ها
        elements.kycStatus.classList.add(data.kyc_status_code || 'not_submitted');
        
        const iconMap = {
            'approved': 'fa-check-circle',
            'pending': 'fa-clock',
            'rejected': 'fa-times-circle',
            'not_submitted': 'fa-file-alt'
        };
        elements.kycIcon.classList.add('fas', iconMap[data.kyc_status_code || 'not_submitted']);

        // کارت موجودی (با فرمت فارسی)
        elements.tomanBalance.textContent = `${data.toman_balance.toLocaleString('fa-IR')} تومان`;
        elements.xpBalance.textContent = `${data.xp_balance.toLocaleString('fa-IR')} XP`;
        elements.tomanBalance.classList.remove('loading');
        elements.xpBalance.classList.remove('loading');

        // کارت سطح
        elements.levelName.textContent = data.level_name;
        elements.levelName.classList.remove('loading');
        
        elements.progressText.textContent = data.level_progress_bar;
        elements.progressText.classList.remove('loading');

        // استخراج درصد از متن
        const percentage = parseFloat(data.level_progress_bar.match(/(\d+(\.\d+)?)%/)?.[1] || 0);
        elements.progressBar.style.width = `${percentage}%`;
    }

    /**
     * بخش‌های گیمیفیکیشن (لیدربرد، پیش‌بینی‌ها، کمپین‌ها) را می‌سازد.
     */
    function updateGamification(data) {
        // 1. ساخت لیدربرد
        elements.leaderboardContainer.innerHTML = '';
        if (data.leaderboard && data.leaderboard.length > 0) {
            data.leaderboard.forEach((user, index) => {
                const rankElement = document.createElement('div');
                rankElement.className = 'leaderboard-row';
                rankElement.innerHTML = `
                    <span class="leaderboard-rank">${index + 1}</span> 
                    <span class="leaderboard-name">${user.name}</span>
                    <span class="leaderboard-points">${user.points.toLocaleString('fa-IR')}</span>
                `;
                elements.leaderboardContainer.appendChild(rankElement);
            });
            elements.leaderboardSection.classList.remove('hidden');
        } else {
            elements.leaderboardSection.classList.add('hidden');
        }

        // 2. ساخت کارت‌های پیش‌بینی
        elements.predictionsContainer.innerHTML = '';
        if (data.predictions && data.predictions.length > 0) {
            data.predictions.forEach(match => {
                const card = document.createElement('div');
                card.className = 'card prediction-card';
                card.dataset.matchId = match.id;
                // اگر کاربر قبلاً پیش‌بینی کرده
                if (match.user_prediction) {
                    card.classList.add('disabled');
                }

                let optionsHtml = '';
                match.options.forEach(opt => {
                    const isSelected = match.user_prediction === opt.key;
                    optionsHtml += `<button class="card-btn prediction-btn ${isSelected ? 'selected' : ''}" 
                                            data-option-key="${opt.key}" ${match.user_prediction ? 'disabled' : ''}>
                                        ${opt.text}
                                    </button>`;
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
                elements.predictionsContainer.appendChild(card);
            });
            elements.predictionsSection.classList.remove('hidden');
        } else {
            elements.predictionsSection.classList.add('hidden');
        }

        // 3. ساخت کارت‌های کمپین
        elements.campaignsContainer.innerHTML = '';
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
                elements.campaignsContainer.appendChild(card);
            });
            elements.campaignsSection.classList.remove('hidden');
        } else {
            elements.campaignsSection.classList.add('hidden');
        }

        // 4. افزودن Event Listener ها
        addCardListeners();
    }

    /**
     * Event Listener ها را به دکمه‌های کارت‌های داینامیک اضافه می‌کند.
     */
    function addCardListeners() {
        document.querySelectorAll('.prediction-btn:not(:disabled)').forEach(button => {
            button.addEventListener('click', (e) => {
                const btn = e.currentTarget;
                const card = btn.closest('.prediction-card');
                if (card.classList.contains('disabled')) return; // اگر کارت قبلاً غیرفعال شده بود

                const matchId = card.dataset.matchId;
                const outcome = btn.dataset.optionKey;
                
                tg.showConfirm(`آیا از ثبت پیش‌بینی «${btn.textContent}» مطمئن هستید؟`, (confirmed) => {
                    if (confirmed) {
                        submitPrediction(matchId, outcome, card, btn);
                    }
                });
            });
        });

        document.querySelectorAll('.campaign-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const card = e.currentTarget.closest('.campaign-card');
                const target = card.dataset.productTarget;
                
                // این اکشن‌ها باید با web_app_data_handler در ربات مطابقت داشته باشند
                let action = 'action_trade'; // هر دو کمپین به منوی ترید می‌روند

                if (action) {
                    tg.sendData(action);
                    tg.close();
                }
            });
        });
    }

    /**
     * پیش‌بینی کاربر را به سرور ارسال می‌کند.
     */
    async function submitPrediction(matchId, outcome, cardElement, buttonElement) {
        tg.MainButton.showProgress();
        
        try {
            const response = await fetch(`${API_BASE_URL}/webapp/submit_prediction`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    initData: tg.initData,
                    match_id: parseInt(matchId),
                    outcome: outcome
                })
            });

            const result = await response.json();
            tg.MainButton.hideProgress();

            if (result.status === "success") {
                tg.showAlert(`✅ ${result.message}`);
                cardElement.classList.add('disabled');
                // غیرفعال کردن همه دکمه‌های این کارت و هایلایت کردن دکمه انتخابی
                cardElement.querySelectorAll('.prediction-btn').forEach(btn => {
                    if (btn === buttonElement) {
                        btn.classList.add('selected');
                    }
                    btn.disabled = true;
                });
            } else {
                tg.showAlert(`⚠️ ${result.message}`);
                // اگر قبلاً ثبت شده، آن را غیرفعال کن
                if (result.code === "already_predicted" || result.code === "match_closed") {
                     cardElement.classList.add('disabled');
                     cardElement.querySelectorAll('.prediction-btn').forEach(btn => btn.disabled = true);
                }
            }

        } catch (error) {
            tg.MainButton.hideProgress();
            tg.showAlert("❌ خطایی در ارتباط با سرور رخ داد. لطفاً دوباره تلاش کنید.");
            console.error("Failed to submit prediction:", error);
        }
    }

    // --- 3. توابع کمکی ---
    function showLoader() {
        loader.classList.remove('hidden');
        appContainer.classList.add('hidden');
    }

    function hideLoader() {
        loader.classList.remove('hidden');
        appContainer.classList.remove('hidden');
    }

    function handleError(errorMessage) {
        loader.innerHTML = `<p style="color: var(--danger); padding: 20px; text-align: center;">${errorMessage}</p>`;
        loader.classList.remove('hidden');
        appContainer.classList.add('hidden');
    }

    // --- 4. راه‌اندازی برنامه ---
    document.addEventListener("DOMContentLoaded", init);

})();