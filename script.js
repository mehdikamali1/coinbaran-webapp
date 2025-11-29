/* webapp/script.js (Production Version - Zero Trust Auth) */
(function () {
    'use strict';
    const tg = window.Telegram.WebApp;
    // استفاده از Origin برای سازگاری با تانل‌های Cloudflare
    const API_BASE_URL = window.location.origin;

    // کش کردن عناصر DOM برای پرفورمنس بهتر
    const loader = document.getElementById('loader');
    const appContainer = document.getElementById('app-container');
    const els = {
        welcomeName: document.getElementById('welcome-name'),
        tomanBalance: document.getElementById('toman-balance'),
        uusdBalance: document.getElementById('uusd-balance'), // اضافه شده
        xpBalance: document.getElementById('xp-balance'),
        kycText: document.getElementById('kyc-text'),
        // اگر المان وضعیت KYC در HTML دارید، اینجا اضافه کنید
    };

    async function init() {
        try {
            tg.ready();
            tg.expand();
            // تنظیم رنگ هدر برای یکپارچگی با تم
            tg.setHeaderColor('#050505'); 
            tg.setBackgroundColor('#050505');

            if (!tg.initData) {
                // جلوگیری از دسترسی خارج از تلگرام (لایه اول امنیتی کلاینت)
                document.body.innerHTML = "<div style='color:white;text-align:center;padding-top:50px;font-family:sans-serif;'>⛔️ دسترسی غیرمجاز<br>لطفاً از داخل ربات اجرا کنید.</div>";
                return;
            }

            // نمایش لودر و شروع دریافت دیتا
            await fetchAllData();

        } catch (e) {
            console.error("Init Error:", e);
        }
    }

    async function fetchAllData() {
        try {
            // درخواست به بک‌ند با ارسال initData برای احراز هویت
            const response = await fetch(`${API_BASE_URL}/webapp/get_user_data`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ initData: tg.initData })
            });

            if (!response.ok) throw new Error(`Server Error: ${response.status}`);
            
            const userData = await response.json();
            
            if (userData.status === 'error') {
                 tg.showAlert(userData.message || "خطا در دریافت اطلاعات کاربر");
                 return;
            }

            updateDashboard(userData);
            
            // مخفی کردن لودر با انیمیشن نرم
            setTimeout(() => {
                if(loader) loader.style.opacity = '0';
                setTimeout(() => {
                    hideLoader();
                }, 300);
            }, 500);

        } catch (error) {
            console.error(error);
            tg.showAlert("⚠️ خطای شبکه. لطفاً اتصال اینترنت خود را بررسی کنید.");
        }
    }

    function updateDashboard(data) {
        if (els.welcomeName) els.welcomeName.textContent = data.first_name;
        
        // فرمت‌دهی اعداد (جداکننده هزارگان)
        if (els.tomanBalance) els.tomanBalance.textContent = data.toman_balance; 
        if (els.uusdBalance) els.uusdBalance.textContent = `$ ${data.uusd_balance}`;
        if (els.xpBalance) els.xpBalance.textContent = data.xp_balance;
        
        if (els.kycText) {
            els.kycText.textContent = data.kyc_status_text;
            // تغییر رنگ بج بر اساس وضعیت (اختیاری)
            if (data.kyc_status_code === 'verified') {
                els.kycText.style.color = 'var(--success)';
                els.kycText.style.borderColor = 'rgba(16, 185, 129, 0.3)';
                els.kycText.style.background = 'rgba(16, 185, 129, 0.1)';
            }
        }
    }

    function hideLoader() { 
        if(loader) loader.style.display = 'none'; 
        if(appContainer) appContainer.classList.remove('hidden'); 
    }

    document.addEventListener("DOMContentLoaded", init);
})();