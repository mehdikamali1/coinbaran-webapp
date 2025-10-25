(function () {
    const tg = window.Telegram.WebApp;
    
    const API_BASE_URL = " https://relations-sea-exemption-sublime.trycloudflare.com"; // <-- آدرس تونل شما

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

    // --- <<< شروع بازنویسی کامل تابع fetchUserData >>> ---
    async function fetchUserData() {
        if (!tg.initData) {
            console.error("Telegram initData not available.");
            document.getElementById('loader').innerHTML = '<p style="color: red;">خطا: لطفاً این صفحه را فقط از داخل ربات تلگرام باز کنید.</p>';
            return;
        }

        try {
            // --- مرحله 1: دریافت اطلاعات اصلی کاربر ---
            const userDataResponse = await fetch(`${API_BASE_URL}/webapp/get_user_data`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ initData: tg.initData })
            });

            if (!userDataResponse.ok) {
                if (userDataResponse.status === 401) throw new Error("خطای اعتبارسنجی (401).");
                throw new Error(`خطای سرور کاربر (${userDataResponse.status})`);
            }
            
            const userData = await userDataResponse.json();
            if (userData.status === "success") {
                updateDashboard(userData); // اطلاعات داشبورد را بلافاصله نمایش بده
            } else {
                throw new Error(userData.message || "خطا در دریافت اطلاعات کاربر.");
            }

            // --- مرحله 2: دریافت اطلاعات گیمیفیکیشن ---
            // این درخواست *فقط* پس از موفقیت درخواست اول اجرا می‌شود
            const gamificationDataResponse = await fetch(`${API_BASE_URL}/webapp/get_gamification_data`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ initData: tg.initData })
            });

            if (!gamificationDataResponse.ok) {
                 throw new Error(`خطای سرور گیمیفیکیشن (${gamificationDataResponse.status})`);
            }

            const gamificationData = await gamificationDataResponse.json();
            if (gamificationData.status === "success") {
                updateGamification(gamificationData); // کارت‌های گیمیفیکیشن را اضافه کن
            } else {
                throw new Error(gamificationData.message || "خطا در دریافت اطلاعات گیمیفیکیشن.");
            }

            // --- مرحله 3: نمایش کامل برنامه ---
            // لودر فقط *بعد* از بارگذاری موفق هر دو بخش پنهان می‌شود
            hideLoader();

        } catch (error) {
            // مدیریت خطای نهایی
            console.error("Error fetching data:", error);
            if (error.message.includes("Failed to fetch")) {
                 document.getElementById('loader').innerHTML = `<p style="color: red;">خطا در بارگذاری (Load failed):<br>اتصال به سرور API برقرار نشد. لطفاً مطمئن شوید تونل Cloudflare فعال است.</p>`;
            } else {
                 document.getElementById('loader').innerHTML = `<p style="color: red;">خطا در بارگذاری اطلاعات: ${error.message}</p>`;
            }
        }
    }
    // --- <<< پایان بازنویسی کامل تابع fetchUserData >>> ---

    function updateDashboard(data) {
        // این تابع دیگر لودر را پنهان نمی‌کند
        
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
    }
    
    function updateGamification(data) {
        const predictionsContainer = document.getElementById('predictions-container');
        const campaignsContainer = document.getElementById('campaigns-container');
        const predictionsSection = document.getElementById('predictions-section');
        const campaignsSection = document.getElementById('campaigns-section');

        predictionsContainer.innerHTML = ''; // پاک کردن محتوای قبلی
        campaignsContainer.innerHTML = ''; // پاک کردن محتوای قبلی

        // 1. ساخت کارت‌های پیش‌بینی
        if (data.predictions && data.predictions.length > 0) {
            data.predictions.forEach(match => {
                let optionsHtml = '';
                match.options.forEach(opt => {
                    optionsHtml += `<button class="card-btn prediction-btn" data-match-id="${match.id}" data-option-key="${opt.key}">${opt.text}</button>`;
                });

                const cardHtml = `
                    <div class="card prediction-card">
                        <div class="card-header">
                            <span class="card-title">${match.title}</span>
                            <span class="card-subtitle">${match.subtitle}</span>
                        </div>
                        <p class="card-question">${match.question}</p>
                        <div class="card-options">
                            ${optionsHtml}
                        </div>
                    </div>
                `;
                predictionsContainer.innerHTML += cardHtml;
            });
            predictionsSection.classList.remove('hidden');
        } else {
            predictionsSection.classList.add('hidden');
        }

        // 2. ساخت کارت‌های کمپین
        if (data.campaigns && data.campaigns.length > 0) {
            data.campaigns.forEach(campaign => {
                const cardHtml = `
                    <div class="card campaign-card" data-product-target="${campaign.product_target}">
                        <div class="card-header">
                            <span class="card-title">${campaign.title}</span>
                        </div>
                        <p class="card-subtitle">${campaign.subtitle}</p>
                        <div class="card-options">
                            <button class="card-btn campaign-btn" data-product-target="${campaign.product_target}">
                                <i class="fas fa-percent"></i> استفاده از تخفیف
                            </button>
                        </div>
                    </div>
                `;
                campaignsContainer.innerHTML += cardHtml;
            });
            campaignsSection.classList.remove('hidden');
        } else {
            campaignsSection.classList.add('hidden');
        }
    }


    // --- Event Listeners for Buttons (حذف شده‌اند چون در HTML پاک شدند) ---
    // (اطمینان حاصل می‌کنیم که هیچ listener ای برای دکمه‌های حذف شده وجود ندارد)
    // --- <<< پایان حذف listener ها >>> ---


    // --- Entry Point ---
    document.addEventListener("DOMContentLoaded", () => {
        initTelegram();
        showLoader();
        fetchUserData();
        // spoofUserData(); // برای تست در مرورگر
    });

})();