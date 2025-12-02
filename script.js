/* webapp/script.js (v88.0 - 9s Smart Timer) */
(function () {
    'use strict';

    const tg = window.Telegram.WebApp;
    const API_BASE_URL = window.location.origin;
    
    // حداقل زمان نمایش لودینگ (۹ ثانیه)
    // این زمان باید با انیمیشن CSS هماهنگ باشد
    const MIN_SPLASH_TIME = 9000; 

    const loader = document.getElementById('loader');
    const appContainer = document.getElementById('app-container');
    
    const els = {
        welcomeName: document.getElementById('welcome-name'),
        tomanBalance: document.getElementById('toman-balance'),
        uusdBalance: document.getElementById('uusd-balance'),
        xpBalance: document.getElementById('xp-balance'),
        kycText: document.getElementById('kyc-text'),
        avatar: document.querySelector('.avatar-img')
    };

    window.onload = async function() {
        try {
            // شروع تایمر انیمیشن (وعده ۹ ثانیه‌ای)
            const splashTimer = new Promise(resolve => setTimeout(resolve, MIN_SPLASH_TIME));

            tg.ready();
            tg.expand();
            tg.setHeaderColor('#000000'); // مشکی مطلق برای زمان لودینگ
            tg.setBackgroundColor('#000000');

            if (!tg.initData) {
                console.warn("Using Test Data");
                tg.initData = "query_id=TEST_DEV_MODE"; 
            }

            // درخواست اطلاعات از سرور (همزمان با تایمر)
            const dataFetch = fetchData();

            // صبر کن تا **هم** تایمر ۹ ثانیه تمام شود **و هم** اطلاعات بیاید
            const [dataResult] = await Promise.all([dataFetch, splashTimer]);

            // بعد از اتمام هر دو، اگر اطلاعات معتبر بود، نمایش بده
            if (dataResult) {
                updateUI(dataResult);
                hideLoader();
                
                // برگرداندن رنگ هدر به رنگ اصلی برنامه (کمی روشن‌تر)
                tg.setHeaderColor('#050505');
                tg.setBackgroundColor('#050505');
            }

        } catch (error) {
            console.error("Critical Init Error:", error);
            showError("خطا در راه‌اندازی برنامه.");
        }
    };

    async function fetchData() {
        try {
            const response = await fetch(`${API_BASE_URL}/webapp/get_user_data`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ initData: tg.initData })
            });

            if (!response.ok) throw new Error("Server Error");
            const data = await response.json();
            
            if (data.status === 'error') {
                tg.showAlert(data.message);
                return null;
            }
            return data;
        } catch (error) {
            console.error(error);
            showError("عدم اتصال به سرور");
            return null;
        }
    }

    function updateUI(data) {
        if (els.welcomeName) els.welcomeName.innerText = data.first_name || "کاربر گرامی";
        if (els.tomanBalance) els.tomanBalance.innerText = data.toman_balance; 
        if (els.uusdBalance) els.uusdBalance.innerHTML = `${data.uusd_balance} <small>دلار</small>`;
        if (els.xpBalance) els.xpBalance.innerHTML = `${data.xp_balance} <small>XP</small>`;

        if (tg.initDataUnsafe?.user?.photo_url && els.avatar) {
            els.avatar.src = tg.initDataUnsafe.user.photo_url;
        }
        updateKycBadge(data.kyc_status_code);
    }

    function updateKycBadge(status) {
        if (!els.kycText) return;
        let text = "سطح برنزی";
        let color = "#848E9C";
        let bg = "rgba(255,255,255,0.05)";
        let border = "rgba(255,255,255,0.1)";

        switch (status) {
            case 'verified':
                text = "کاربر تایید شده ✅"; color = "#0ECB81"; bg = "rgba(14, 203, 129, 0.1)"; border = "rgba(14, 203, 129, 0.3)"; break;
            case 'pending':
                text = "در حال بررسی ⏳"; color = "#F0B90B"; bg = "rgba(240, 185, 11, 0.1)"; border = "rgba(240, 185, 11, 0.3)"; break;
            case 'rejected':
                text = "نیاز به اصلاح ❌"; color = "#F6465D"; bg = "rgba(246, 70, 93, 0.1)"; border = "rgba(246, 70, 93, 0.3)"; break;
        }
        els.kycText.innerText = text; els.kycText.style.color = color; els.kycText.style.background = bg; els.kycText.style.borderColor = border;
    }

    function hideLoader() {
        if (loader) {
            loader.style.opacity = '0';
            loader.style.pointerEvents = 'none';
            setTimeout(() => {
                loader.style.display = 'none';
                if (appContainer) {
                    appContainer.classList.remove('hidden-content');
                    appContainer.classList.add('fade-in-active');
                }
            }, 1000); // 1 ثانیه زمان محو شدن نرم
        }
    }

    function showError(msg) {
        if (loader) {
            loader.style.opacity = '1';
            loader.style.display = 'flex';
            loader.innerHTML = `
                <div class="loader-content" style="z-index:999;">
                    <p style="color:#F6465D; margin-bottom:20px; font-weight:bold; font-family:'Vazirmatn'">${msg}</p>
                    <button onclick="window.location.reload()" 
                        style="background:rgba(255,255,255,0.1); color:white; border:1px solid rgba(255,255,255,0.2); padding:10px 20px; border-radius:10px; cursor:pointer; font-family:'Vazirmatn';">
                        تلاش مجدد
                    </button>
                </div>
            `;
        }
    }
})();