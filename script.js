/* webapp/script.js (نسخه 2.4 - مدیریت خطا و دیباگ) */
(function () {
    'use strict';

    const tg = window.Telegram.WebApp;
    
    // ❗️ آدرس تونل (بر اساس لاگ شما)
    const API_BASE_URL = "https://thinkpad-wars-deferred-tim.trycloudflare.com";

    const loader = document.getElementById('loader');
    const appContainer = document.getElementById('app-container');

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
    
    async function init() {
        tg.ready();
        tg.expand();
        tg.setHeaderColor('secondary_bg_color');
        tg.setBackgroundColor('bg_color');
        
        showLoader();
        await fetchAllData();
    }

    async function fetchAllData() {
        if (!tg.initData) {
            handleError("خطا: لطفاً این صفحه را فقط از داخل ربات تلگرام باز کنید.");
            return;
        }

        try {
            // دریافت همزمان داده‌ها
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

            if (!userResponse.ok) throw new Error(`خطای سرور کاربر (${userResponse.status})`);
            const userData = await userResponse.json();
            
            if (!gamificationResponse.ok) throw new Error(`خطای سرور گیمیفیکیشن (${gamificationResponse.status})`);
            const gamificationData = await gamificationResponse.json();

            // آپدیت داشبورد (موجودی و...)
            try {
                updateDashboard(userData);
            } catch (e) {
                console.error("Dashboard Error:", e);
                tg.showAlert(`خطا در نمایش داشبورد: ${e.message}`);
            }

            // آپدیت گیمیفیکیشن (لیدربرد و...)
            try {
                updateGamification(gamificationData);
            } catch (e) {
                console.error("Gamification Error:", e);
                // خطا را نشان نده تا برنامه باز شود، فقط در کنسول ثبت کن
            }

        } catch (error) {
            console.error("Network/API Error:", error);
            handleError(`خطا در ارتباط با سرور: ${error.message}`);
        } finally {
            // مهم: در هر صورت لودر را مخفی کن تا برنامه باز شود
            hideLoader();
        }
    }

    function updateDashboard(data) {
        elements.welcomeName.textContent = `سلام، ${data.first_name}`;
        elements.welcomeName.classList.remove('loading');
        
        elements.kycStatus.classList.remove('loading');
        elements.kycIcon.classList.remove('fa-spinner', 'fa-spin');
        elements.kycText.textContent = data.kyc_status_text;
        elements.kycStatus.className = 'kyc-status';
        elements.kycStatus.classList.add(data.kyc_status_code || 'not_submitted');
        
        const iconMap = {
            'approved': 'fa-check-circle',
            'pending': 'fa-clock',
            'rejected': 'fa-times-circle',
            'not_submitted': 'fa-file-alt'
        };
        elements.kycIcon.classList.add('fas', iconMap[data.kyc_status_code || 'not_submitted']);

        // تبدیل اعداد به فارسی (با فال‌بک به انگلیسی)
        const formatNum = (num) => {
            try { return parseFloat(num.toString().replace(/,/g, '')).toLocaleString('fa-IR'); } 
            catch { return num; }
        };

        elements.tomanBalance.textContent = `${formatNum(data.toman_balance)} تومان`;
        elements.xpBalance.textContent = `${formatNum(data.xp_balance)} XP`;
        
        elements.tomanBalance.classList.remove('loading');
        elements.xpBalance.classList.remove('loading');

        elements.levelName.textContent = data.level_name;
        elements.levelName.classList.remove('loading');
        elements.progressText.textContent = data.level_progress_bar;
        elements.progressText.classList.remove('loading');
        
        const percentage = parseFloat(data.level_progress_bar.match(/(\d+(\.\d+)?)%/)?.[1] || 0);
        elements.progressBar.style.width = `${percentage}%`;
    }

    function updateGamification(data) {
        // 1. لیدربرد
        elements.leaderboardContainer.innerHTML = '';
        if (data.leaderboard && data.leaderboard.length > 0) {
            data.leaderboard.forEach((user, index) => {
                const rankElement = document.createElement('div');
                rankElement.className = 'leaderboard-row';
                const points = user.points ? user.points.toLocaleString('fa-IR') : '0';
                rankElement.innerHTML = `
                    <span class="leaderboard-rank">${index + 1}</span> 
                    <span class="leaderboard-name">${user.name}</span>
                    <span class="leaderboard-points">${points}</span>
                `;
                elements.leaderboardContainer.appendChild(rankElement);
            });
            elements.leaderboardSection.classList.remove('hidden');
        } else {
            elements.leaderboardSection.classList.add('hidden');
        }

        // 2. پیش‌بینی‌ها
        elements.predictionsContainer.innerHTML = '';
        if (data.predictions && data.predictions.length > 0) {
            data.predictions.forEach(match => {
                const card = document.createElement('div');
                card.className = 'card prediction-card';
                card.dataset.matchId = match.id;
                if (match.user_prediction) card.classList.add('disabled');

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
                    <div class="card-options">${optionsHtml}</div>
                `;
                elements.predictionsContainer.appendChild(card);
            });
            elements.predictionsSection.classList.remove('hidden');
        } else {
            elements.predictionsSection.classList.add('hidden');
        }

        // 3. کمپین‌ها
        elements.campaignsContainer.innerHTML = '';
        if (data.campaigns && data.campaigns.length > 0) {
            data.campaigns.forEach(campaign => {
                const card = document.createElement('div');
                card.className = 'card campaign-card';
                card.dataset.productTarget = campaign.product_target;
                card.innerHTML = `
                    <div class="card-header"><span class="card-title">${campaign.title}</span></div>
                    <p class="card-subtitle">${campaign.subtitle}</p>
                    <div class="card-options">
                        <button class="card-btn campaign-btn"><i class="fas fa-percent"></i> استفاده از تخفیف</button>
                    </div>
                `;
                elements.campaignsContainer.appendChild(card);
            });
            elements.campaignsSection.classList.remove('hidden');
        } else {
            elements.campaignsSection.classList.add('hidden');
        }
        
        addCardListeners();
    }

    function addCardListeners() {
        document.querySelectorAll('.prediction-btn:not(:disabled)').forEach(button => {
            button.addEventListener('click', (e) => {
                const btn = e.currentTarget;
                const card = btn.closest('.prediction-card');
                if (card.classList.contains('disabled')) return;
                const matchId = card.dataset.matchId;
                const outcome = btn.dataset.optionKey;
                tg.showConfirm(`آیا از ثبت پیش‌بینی «${btn.textContent}» مطمئن هستید؟`, (confirmed) => {
                    if (confirmed) submitPrediction(matchId, outcome, card, btn);
                });
            });
        });
        
        document.querySelectorAll('.campaign-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                tg.sendData('action_trade');
                tg.close();
            });
        });
    }

    async function submitPrediction(matchId, outcome, cardElement, buttonElement) {
        tg.MainButton.showProgress();
        try {
            const response = await fetch(`${API_BASE_URL}/webapp/submit_prediction`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ initData: tg.initData, match_id: parseInt(matchId), outcome: outcome })
            });
            const result = await response.json();
            tg.MainButton.hideProgress();
            if (result.status === "success") {
                tg.showAlert(`✅ ${result.message}`);
                cardElement.classList.add('disabled');
                cardElement.querySelectorAll('.prediction-btn').forEach(btn => {
                    if (btn === buttonElement) btn.classList.add('selected');
                    btn.disabled = true;
                });
            } else {
                tg.showAlert(`⚠️ ${result.message}`);
            }
        } catch (error) {
            tg.MainButton.hideProgress();
            tg.showAlert("❌ خطایی در ارتباط با سرور رخ داد.");
        }
    }

    function showLoader() {
        loader.classList.remove('hidden');
        appContainer.classList.add('hidden');
    }

    function hideLoader() {
        loader.classList.add('hidden');
        appContainer.classList.remove('hidden');
    }

    function handleError(errorMessage) {
        loader.innerHTML = `<p style="color: var(--danger); padding: 20px; text-align: center;">${errorMessage}</p>`;
        loader.classList.remove('hidden');
        appContainer.classList.add('hidden');
    }

    document.addEventListener("DOMContentLoaded", init);

})();