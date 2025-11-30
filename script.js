/* webapp/script.js (v52.0 - Final Production Logic) */
(function () {
    'use strict';

    // تنظیمات اولیه تلگرام و آدرس سرور
    const tg = window.Telegram.WebApp;
    const API_BASE_URL = window.location.origin; // آدرس فعلی (تانل یا سرور)

    // کش کردن عناصر صفحه برای سرعت بیشتر
    const loader = document.getElementById('loader');
    const appContainer = document.getElementById('app-container');
    const els = {
        welcomeName: document.getElementById('welcome-name'),
        tomanBalance: document.getElementById('toman-balance'),
        uusdBalance: document.getElementById('uusd-balance'),
        xpBalance: document.getElementById('xp-balance'),
        kycText: document.getElementById('kyc-text')
    };

    // تابع اصلی که هنگام لود شدن صفحه اجرا می‌شود
    window.onload = async function() {
        try {
            // ۱. راه‌اندازی تلگرام وب‌اپ
            tg.ready();
            tg.expand(); // تمام صفحه کردن
            
            // تنظیم رنگ هدر برای زیبایی (هماهنگ با تم مشکی)
            tg.setHeaderColor('#050505');
            tg.setBackgroundColor('#050505');

            // ۲. بررسی وجود اطلاعات احراز هویت تلگرام
            if (!tg.initData) {
                // اگر خارج از تلگرام باز شود (برای تست لوکال)
                console.warn("initData not found. Using Test Data.");
                // خط زیر را در پروداکشن واقعی می‌توانید کامنت کنید، اما برای تست لازم است
                tg.initData = "query_id=TEST&user=%7B%22id%22%3A111111111%2C%22first_name%22%3A%22Guest%22%7D&auth_date=1700000000&hash=fake";
            }

            // ۳. دریافت اطلاعات از سرور
            await fetchData();

        } catch (error) {
            console.error("Init Error:", error);
            showError("خطا در راه‌اندازی اولیه.");
        }
    };

    // تابع دریافت اطلاعات از API
    async function fetchData() {
        try {
            const response = await fetch(`${API_BASE_URL}/webapp/get_user_data`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                // ارسال initData برای امنیت Zero Trust
                body: JSON.stringify({ initData: tg.initData })
            });

            if (!response.ok) {
                throw new Error(`Server Error: ${response.status}`);
            }

            const data = await response.json();

            // بررسی وضعیت پاسخ سرور
            if (data.status === 'error') {
                tg.showAlert(data.message || "خطا در دریافت اطلاعات کاربر");
                return;
            }

            // ۴. نمایش اطلاعات در صفحه
            updateUI(data);

            // ۵. مخفی کردن لودر و نمایش برنامه
            hideLoader();

        } catch (error) {
            console.error(error);
            showError("خطا در اتصال به سرور. لطفاً اینترنت خود را بررسی کنید.");
        }
    }

    // تابع بروزرسانی رابط کاربری (UI)
    function updateUI(data) {
        // نام کاربر
        if (els.welcomeName) els.welcomeName.innerText = data.first_name;

        // موجودی تومانی (با جداکننده هزارگان)
        if (els.tomanBalance) els.tomanBalance.innerText = data.toman_balance;

        // موجودی دلاری
        if (els.uusdBalance) els.uusdBalance.innerText = `$ ${data.uusd_balance}`;

        // امتیاز XP
        if (els.xpBalance) els.xpBalance.innerText = data.xp_balance;

        // وضعیت احراز هویت
        if (els.kycText) {
            els.kycText.innerText = data.kyc_status_text;
            
            // تغییر رنگ بر اساس وضعیت
            if (data.kyc_status_code === 'verified') {
                els.kycText.style.color = '#10B981'; // سبز
                els.kycText.style.borderColor = 'rgba(16, 185, 129, 0.3)';
                els.kycText.style.background = 'rgba(16, 185, 129, 0.1)';
            } else if (data.kyc_status_code === 'rejected') {
                els.kycText.style.color = '#EF4444'; // قرمز
                els.kycText.style.borderColor = 'rgba(239, 68, 68, 0.3)';
            } else if (data.kyc_status_code === 'pending') {
                els.kycText.style.color = '#D4AF37'; // طلایی
                els.kycText.style.borderColor = 'rgba(212, 175, 55, 0.3)';
            }
        }
    }

    // تابع مخفی کردن لودر با انیمیشن نرم
    function hideLoader() {
        if (loader) {
            loader.style.opacity = '0';
            setTimeout(() => {
                loader.style.display = 'none';
                if (appContainer) appContainer.classList.remove('hidden');
            }, 500);
        }
    }

    // نمایش خطای کاربر پسند
    function showError(msg) {
        if (loader) {
            loader.innerHTML = `
                <div style="text-align:center; padding:20px;">
                    <p style="color:#EF4444; margin-bottom:15px;">${msg}</p>
                    <button onclick="window.location.reload()" 
                        style="background:#333; color:white; border:1px solid #555; padding:10px 20px; border-radius:10px; cursor:pointer;">
                        تلاش مجدد
                    </button>
                </div>
            `;
        }
    }

})();