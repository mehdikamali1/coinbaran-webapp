/* webapp/script.js (Production Version) */
(function () {
    'use strict';
    const tg = window.Telegram.WebApp;
    const API_BASE_URL = window.location.origin;

    const loader = document.getElementById('loader');
    const appContainer = document.getElementById('app-container');
    const els = {
        welcomeName: document.getElementById('welcome-name'),
        tomanBalance: document.getElementById('toman-balance'),
        xpBalance: document.getElementById('xp-balance'),
        kycText: document.getElementById('kyc-text'),
        kycStatus: document.getElementById('kyc-status')
    };

    async function init() {
        tg.ready();
        tg.expand();

        if (!tg.initData) {
            // اگر خارج از تلگرام باز شود، فقط پیام خطا می‌دهد
            document.body.innerHTML = "<h3 style='color:white;text-align:center;margin-top:50px'>لطفاً از داخل ربات تلگرام باز کنید</h3>";
            return;
        }

        showLoader();
        await fetchAllData();
    }

    async function fetchAllData() {
        try {
            const response = await fetch(`${API_BASE_URL}/webapp/get_user_data`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ initData: tg.initData })
            });

            if (!response.ok) throw new Error(`Server Error: ${response.status}`);
            const userData = await response.json();
            updateDashboard(userData);
            
            // گیمیفیکیشن (اختیاری)
            fetch(`${API_BASE_URL}/webapp/get_gamification_data`, {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ initData: tg.initData })
            }).catch(e => console.log(e));

        } catch (error) {
            console.error(error);
            alert("خطا در دریافت اطلاعات. لطفاً مجدداً تلاش کنید.");
        } finally {
            hideLoader();
        }
    }

    function updateDashboard(data) {
        els.welcomeName.textContent = `سلام، ${data.first_name}`;
        els.welcomeName.classList.remove('loading');
        els.tomanBalance.textContent = `${data.toman_balance} تومان`;
        els.tomanBalance.classList.remove('loading');
        els.xpBalance.textContent = `${data.xp_balance} XP`;
        els.xpBalance.classList.remove('loading');
        els.kycText.textContent = data.kyc_status_text;
        els.kycStatus.classList.remove('loading');
        els.kycStatus.classList.add(data.kyc_status_code);
    }

    function showLoader() { loader.style.display = 'flex'; appContainer.classList.add('hidden'); }
    function hideLoader() { loader.style.display = 'none'; appContainer.classList.remove('hidden'); }

    document.addEventListener("DOMContentLoaded", init);
})();