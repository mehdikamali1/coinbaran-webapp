/* webapp/script.js (v8.0 - Debug Mode & Force Load) */
(function () {
    'use strict';

    const tg = window.Telegram.WebApp;
    const API_BASE_URL = window.location.origin;

    const loader = document.getElementById('loader');
    const appContainer = document.getElementById('app-container');

    // عناصر صفحه
    const elements = {
        welcomeName: document.getElementById('welcome-name'),
        tomanBalance: document.getElementById('toman-balance'),
        xpBalance: document.getElementById('xp-balance'),
        levelName: document.getElementById('level-name'),
        kycStatus: document.getElementById('kyc-status'),
        kycText: document.getElementById('kyc-text'),
        kycIcon: document.getElementById('kyc-icon'),
        leaderboardContainer: document.getElementById('leaderboard-container'),
        predictionsContainer: document.getElementById('predictions-container'),
        campaignsContainer: document.getElementById('campaigns-container'),
        leaderboardSection: document.getElementById('leaderboard-section'),
        predictionsSection: document.getElementById('predictions-section'),
        campaignsSection: document.getElementById('campaigns-section')
    };
    
    async function init() {
        try {
            tg.ready();
            tg.expand();
        } catch(e) { console.log("Telegram not ready yet"); }
        
        // 1. تست حالت مهمان
        if (!tg.initData) {
            console.log("Debug: Generating Guest Data");
            tg.initData = "query_id=TEST&user=%7B%22id%22%3A111111111%2C%22first_name%22%3A%22DebugUser%22%7D&auth_date=1700000000&hash=fake";
        }

        showLoader();
        
        // تایمر اضطراری: اگر بعد از 4 ثانیه اطلاعات نیامد، لودر را حذف کن
        setTimeout(() => {
            if (!appContainer.classList.contains('hidden') === false) {
                // اگر هنوز مخفی است
                console.warn("Force loading dashboard due to timeout");
                hideLoader();
                // پر کردن با دیتای ساختگی برای اینکه صفحه خالی نباشد
                if(elements.welcomeName.textContent === "...") {
                    updateDashboard({
                        first_name: "کاربر (حالت آفلاین)",
                        toman_balance: "0",
                        xp_balance: "0",
                        kyc_status_code: "pending",
                        kyc_status_text: "خطای اتصال",
                        level_name: "Guest",
                        level_progress_bar: "0%"
                    });
                    alert("⚠️ اتصال به سرور کند است یا قطع شده، اما داشبورد باز شد.");
                }
            }
        }, 4000);

        await fetchAllData();
    }

    async function fetchAllData() {
        try {
            console.log("Debug: Sending request to " + API_BASE_URL);
            
            const response = await fetch(`${API_BASE_URL}/webapp/get_user_data`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ initData: tg.initData })
            });

            if (!response.ok) {
                throw new Error(`Server Error: ${response.status}`);
            }

            const userData = await response.json();
            console.log("Debug: Data received", userData);
            
            updateDashboard(userData);

            // دریافت گیمیفیکیشن (بدون انتظار برای بلاک نشدن)
            fetchGamification();

        } catch (error) {
            console.error("API Error:", error);
            // اینجا آلرت نمی‌دهیم چون تایمر اضطراری بالاخره صفحه را باز می‌کند
            // فقط متن لودر را عوض می‌کنیم که بفهمیم خطا چیست
            const loaderText = document.querySelector('#loader p');
            if(loaderText) loaderText.innerHTML = `<span style="color:red; direction:ltr">${error.message}</span>`;
        } finally {
            hideLoader();
        }
    }

    function fetchGamification() {
        fetch(`${API_BASE_URL}/webapp/get_gamification_data`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ initData: tg.initData })
        }).then(r => r.json()).then(data => updateGamification(data)).catch(e => console.log(e));
    }

    function updateDashboard(data) {
        if(elements.welcomeName) {
            elements.welcomeName.textContent = `سلام، ${data.first_name}`;
            elements.welcomeName.classList.remove('loading');
        }
        if(elements.tomanBalance) {
            elements.tomanBalance.textContent = `${data.toman_balance} تومان`;
            elements.tomanBalance.classList.remove('loading');
        }
        if(elements.xpBalance) {
            elements.xpBalance.textContent = `${data.xp_balance} XP`;
            elements.xpBalance.classList.remove('loading');
        }
        if(elements.levelName) {
            elements.levelName.textContent = data.level_name;
            elements.levelName.classList.remove('loading');
        }
        
        // آپدیت KYC
        if(elements.kycStatus) {
            elements.kycStatus.classList.remove('loading');
            elements.kycIcon.classList.remove('fa-spinner', 'fa-spin');
            elements.kycText.textContent = data.kyc_status_text || 'وضعیت نامشخص';
            elements.kycStatus.className = 'kyc-status'; // ریست کلاس‌ها
            elements.kycStatus.classList.add(data.kyc_status_code || 'not_submitted');
            
            const iconMap = { 'approved': 'fa-check-circle', 'pending': 'fa-clock', 'rejected': 'fa-times-circle', 'not_submitted': 'fa-file-alt' };
            elements.kycIcon.classList.add('fas', iconMap[data.kyc_status_code || 'not_submitted']);
        }
    }

    function updateGamification(data) {
        // کد خلاصه شده برای جلوگیری از خطا
        if(data.leaderboard && elements.leaderboardContainer) {
            elements.leaderboardContainer.innerHTML = '';
            data.leaderboard.forEach((u, i) => {
                elements.leaderboardContainer.innerHTML += `<div class="leaderboard-row"><span class="leaderboard-rank">${i+1}</span><span>${u.name}</span><span>${u.points}</span></div>`;
            });
            elements.leaderboardSection.classList.remove('hidden');
        }
    }

    function showLoader() {
        if(loader) loader.classList.remove('hidden');
        if(appContainer) appContainer.classList.add('hidden');
    }

    function hideLoader() {
        if(loader) loader.classList.add('hidden');
        if(appContainer) appContainer.classList.remove('hidden');
    }

    document.addEventListener("DOMContentLoaded", init);
})();