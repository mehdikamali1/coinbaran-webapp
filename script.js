// webapp/script.js
(function () {
    const tg = window.Telegram.WebApp;
    
    // --- <<< شروع تغییر: استفاده از آدرس تونل امن >>> ---
    const API_BASE_URL = "https://purchases-mercy-billy-jeffrey.trycloudflare.com"; // <-- آدرس جدید Cloudflare
    // --- <<< پایان تغییر >>> ---

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
            // این برای تست مستقیم در مرورگر است
            // return spoofUserData(); 
            document.getElementById('loader').innerHTML = '<p style="color: red;">خطا: لطفاً این صفحه را فقط از داخل ربات تلگرام باز کنید.</p>';
            return;
        }

        try {
            const response = await fetch(`${API_BASE_URL}/webapp/get_user_data`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ initData: tg.initData })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            
            if (data.status === "success") {
                updateDashboard(data);
            } else {
                throw new Error(data.message || "Failed to load user data.");
            }

        } catch (error) {
            console.error("Error fetching user data:", error);
            document.getElementById('loader').innerHTML = `<p style="color: red;">خطا در بارگذاری اطلاعات: ${error.message}</p>`;
        }
    }

    // تابع تست (در صورت نیاز)
    function spoofUserData() {
         console.warn("SPOOFING USER DATA FOR BROWSER TEST");
         const data = {
             "status": "success",
             "first_name": "مهدی تست",
             "toman_balance": "5,120,000",
             "xp_balance": "1,250",
             "kyc_status_text": "✅ تایید شده",
             "kyc_status_code": "approved",
             "level_name": "Gold 🥇",
             "level_progress_bar": "██████░░░░ 65% تا سطح Platinum 💎"
         };
         updateDashboard(data);
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

        // دکمه‌ها را از حالت لودینگ خارج کن
        document.querySelectorAll('.action-btn').forEach(btn => btn.classList.remove('loading'));

        hideLoader();
    }

    // --- Event Listeners for Buttons ---
    document.getElementById('btn-deposit').addEventListener('click', () => {
        // این دستور یک "رویداد" به ربات پایتون می‌فرستد
        tg.sendData("action_deposit");
        tg.close();
    });

    document.getElementById('btn-withdraw').addEventListener('click', () => {
        tg.sendData("action_withdraw");
        tg.close();
    });

    document.getElementById('btn-trade').addEventListener('click', () => {
        tg.sendData("action_trade");
        tg.close();
    });

    // --- Entry Point ---
    document.addEventListener("DOMContentLoaded", () => {
        initTelegram();
        showLoader();
        fetchUserData();
    });

})();