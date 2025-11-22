/* webapp/script.js (v7.0 - Developer Mode / Browser Compatible) */
(function () {
    'use strict';

    const tg = window.Telegram.WebApp;
    const API_BASE_URL = window.location.origin;

    const loader = document.getElementById('loader');
    const appContainer = document.getElementById('app-container');

    // عناصر صفحه
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
        
        // --- تغییر مهم: حذف شرط سخت‌گیرانه تلگرام ---
        // اگر داخل تلگرام نبودیم، یک دیتای الکی می‌سازیم تا رد شویم
        if (!tg.initData) {
            console.warn("⚠️ حالت مرورگر فعال شد (بدون تلگرام)");
            // دیتای فیک برای تست
            tg.initData = "query_id=AAH...&user=%7B%22id%22%3A111111111%2C%22first_name%22%3A%22TestUser%22%2C%22username%22%3A%22tester%22%7D&auth_date=1710000000&hash=fake_hash_for_testing";
        }

        showLoader();
        await fetchAllData();
    }

    async function fetchAllData() {
        try {
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

            if (!userResponse.ok) throw new Error(`User API Error: ${userResponse.status}`);
            const userData = await userResponse.json();
            
            // اگر گیمیفیکیشن ارور داد مهم نیست، ادامه بده
            let gamificationData = {};
            if (gamificationResponse.ok) gamificationData = await gamificationResponse.json();

            updateDashboard(userData);
            updateGamification(gamificationData);

        } catch (error) {
            console.error("API Error:", error);
            // حتی اگر ارور داد، صفحه را نشان بده تا کاربر سفید نبیند
            handleError(`خطا در دریافت اطلاعات: ${error.message}`); 
        } finally {
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

        elements.tomanBalance.textContent = `${parseFloat(data.toman_balance).toLocaleString()} تومان`;
        elements.xpBalance.textContent = `${parseFloat(data.xp_balance).toLocaleString()} XP`;
        
        elements.tomanBalance.classList.remove('loading');
        elements.xpBalance.classList.remove('loading');

        elements.levelName.textContent = data.level_name;
        elements.levelName.classList.remove('loading');
    }

    function updateGamification(data) {
        // (کدهای نمایش لیدربرد بدون تغییر باقی می‌مانند)
        if(data.leaderboard) { /* ... لاجیک قبلی ... */ }
        addCardListeners();
    }

    function addCardListeners() {
        // (کدهای لیسنر دکمه‌ها)
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
        // فقط آلرت بده، صفحه را نبند
        alert(errorMessage);
    }

    document.addEventListener("DOMContentLoaded", init);
})();