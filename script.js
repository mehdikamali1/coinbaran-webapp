/* webapp/script.js (v73.0 - Final Production Logic + Luxury UI) */
(function () {
    'use strict';

    // تنظیمات اولیه تلگرام و آدرس سرور
    const tg = window.Telegram.WebApp;
    const API_BASE_URL = window.location.origin;

    // کش کردن عناصر صفحه
    const loader = document.getElementById('loader');
    const appContainer = document.getElementById('app-container');
    
    // المان‌های قابل آپدیت در داشبورد
    const els = {
        welcomeName: document.getElementById('welcome-name'),
        tomanBalance: document.getElementById('toman-balance'),
        uusdBalance: document.getElementById('uusd-balance'),
        xpBalance: document.getElementById('xp-balance'),
        kycText: document.getElementById('kyc-text'),
        avatar: document.querySelector('.avatar-img') // برای نمایش عکس پروفایل
    };

    // --- نقطه شروع برنامه ---
    window.onload = async function() {
        try {
            // ۱. راه‌اندازی تلگرام
            tg.ready();
            tg.expand();
            
            // تنظیم رنگ هدر برای یکپارچگی با تم مشکی
            tg.setHeaderColor('#050505');
            tg.setBackgroundColor('#050505');

            // ۲. بررسی دیتای احراز هویت
            if (!tg.initData) {
                console.warn("initData Missing. Using Test Mode.");
                tg.initData = "query_id=TEST_DEV_MODE"; 
            }

            // ۳. تلاش برای دریافت اطلاعات
            await fetchData();

        } catch (error) {
            console.error("Init Critical Error:", error);
            showError("خطا در راه‌اندازی برنامه.");
        }
    };

    // --- دریافت اطلاعات از سرور ---
    async function fetchData() {
        try {
            const response = await fetch(`${API_BASE_URL}/webapp/get_user_data`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ initData: tg.initData })
            });

            if (!response.ok) {
                throw new Error(`Server Error: ${response.status}`);
            }

            const data = await response.json();

            if (data.status === 'error') {
                tg.showAlert(data.message || "خطا در دریافت اطلاعات کاربر");
                return;
            }

            // ۴. بروزرسانی رابط کاربری
            updateUI(data);

            // ۵. نمایش داشبورد (حذف لودر)
            hideLoader();

        } catch (error) {
            console.error(error);
            showError("خطا در اتصال به سرور. لطفاً اینترنت خود را بررسی کنید.");
        }
    }

    // --- بروزرسانی المان‌های داشبورد ---
    function updateUI(data) {
        // نام کاربر
        if (els.welcomeName) els.welcomeName.innerText = data.first_name || "کاربر گرامی";

        // موجودی تومان (فرمت سه رقم سه رقم)
        if (els.tomanBalance) els.tomanBalance.innerText = data.toman_balance; 

        // موجودی دلاری (با رنگ‌بندی)
        if (els.uusdBalance) els.uusdBalance.innerHTML = `${data.uusd_balance} <small>USD</small>`;

        // امتیاز
        if (els.xpBalance) els.xpBalance.innerHTML = `${data.xp_balance} <small>XP</small>`;

        // عکس پروفایل (اگر تلگرام ارائه داده باشد)
        if (tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.photo_url) {
            if (els.avatar) els.avatar.src = tg.initDataUnsafe.user.photo_url;
        }

        // وضعیت احراز هویت (با استایل‌های جدید)
        updateKycBadge(data.kyc_status_code);
    }

    function updateKycBadge(status) {
        if (!els.kycText) return;

        let text = "سطح برنزی";
        let color = "#848E9C"; // خاکستری
        let bg = "rgba(255,255,255,0.05)";
        let border = "rgba(255,255,255,0.1)";

        switch (status) {
            case 'verified':
                text = "کاربر تایید شده ✅";
                color = "#0ECB81"; // سبز
                bg = "rgba(14, 203, 129, 0.1)";
                border = "rgba(14, 203, 129, 0.3)";
                break;
            case 'pending':
                text = "در حال بررسی ⏳";
                color = "#F0B90B"; // طلایی
                bg = "rgba(240, 185, 11, 0.1)";
                border = "rgba(240, 185, 11, 0.3)";
                break;
            case 'rejected':
                text = "نیاز به اصلاح ❌";
                color = "#F6465D"; // قرمز
                bg = "rgba(246, 70, 93, 0.1)";
                border = "rgba(246, 70, 93, 0.3)";
                break;
        }

        els.kycText.innerText = text;
        els.kycText.style.color = color;
        els.kycText.style.background = bg;
        els.kycText.style.borderColor = border;
    }

    // --- مدیریت لودر و خطا ---
    function hideLoader() {
        if (loader) {
            loader.style.opacity = '0';
            loader.style.pointerEvents = 'none'; // جلوگیری از کلیک حین محو شدن
            
            setTimeout(() => {
                loader.style.display = 'none';
                if (appContainer) {
                    appContainer.classList.remove('hidden-content');
                    appContainer.classList.add('fade-in-active');
                }
            }, 500);
        }
    }

    function showError(msg) {
        if (loader) {
            // نمایش پیام خطا داخل همان لودر مشکی و شیک
            loader.style.opacity = '1';
            loader.style.display = 'flex';
            
            loader.innerHTML = `
                <div class="loader-content">
                    <div style="font-size: 3rem; margin-bottom: 20px;">⚠️</div>
                    <p style="color:#F6465D; margin-bottom:20px; font-weight:bold;">${msg}</p>
                    <button onclick="window.location.reload()" 
                        style="background:rgba(255,255,255,0.1); color:white; border:1px solid rgba(255,255,255,0.2); padding:12px 24px; border-radius:12px; cursor:pointer; font-family:'Vazirmatn';">
                        تلاش مجدد
                    </button>
                </div>
            `;
        }
    }

})();