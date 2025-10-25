(function () {
    const tg = window.Telegram.WebApp;
    
    const API_BASE_URL = "https://mine-maker-clinton-face.trycloudflare.com"; // <-- این آدرس تونل شماست

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
        // 1. اطمینان از اینکه initData وجود دارد
        if (!tg.initData) {
            console.error("Telegram initData not available.");
            document.getElementById('loader').innerHTML = '<p style="color: red;">خطا: لطفاً این صفحه را فقط از داخل ربات تلگرام باز کنید.</p>';
            return;
        }

        try {
            // 2. ارسال همزمان دو درخواست (یکی برای داشبورد، یکی برای گیمیفیکیشن)
            const [userDataResponse, gamificationDataResponse] = await Promise.all([
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

            // 3. مدیریت خطاهای شبکه یا سرور
            if (!userDataResponse.ok || !gamificationDataResponse.ok) {
                // بررسی خطای اعتبارسنجی (401)
                if (userDataResponse.status === 401 || gamificationDataResponse.status === 401) {
                    throw new Error("خطای اعتبارسنجی: امضا مطابقت ندارد.");
                }
                // بررسی خطاهای دیگر
                if (!userDataResponse.ok) throw new Error(`خطای دریافت اطلاعات کاربر: ${userDataResponse.statusText}`);
                if (!gamificationDataResponse.ok) throw new Error(`خطای دریافت اطلاعات گیمیفیکیشن: ${gamificationDataResponse.statusText}`);
            }

            // 4. مدیریت پاسخ موفق
            const userData = await userDataResponse.json();
            const gamificationData = await gamificationDataResponse.json();
            
            if (userData.status === "success") {
                updateDashboard(userData); // <-- فراخوانی تابع نمایش اطلاعات داشبورد
            } else {
                throw new Error(userData.message || "خطا در دریافت اطلاعات کاربر.");
            }
            
            if (gamificationData.status === "success") {
                updateGamification(gamificationData); // <-- فراخوانی تابع جدید گیمیفیکیشن
            } else {
                throw new Error(gamificationData.message || "خطا در دریافت اطلاعات گیمیفیکیشن.");
            }

        } catch (error) {
            // 5. مدیریت خطای نهایی (مثل قطع بودن تونل)
            console.error("Error fetching data:", error);
            if (error.message.includes("Failed to fetch")) {
                 document.getElementById('loader').innerHTML = `<p style="color: red;">خطا در بارگذاری (Load failed):<br>اتصال به سرور API برقرار نشد. لطفاً مطمئن شوید تونل Cloudflare فعال است.</p>`;
            } else {
                 document.getElementById('loader').innerHTML = `<p style="color: red;">خطا در بارگذاری اطلاعات: ${error.message}</p>`;
            }
        }
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
    
    // --- <<< شروع تابع جدید: ساخت کارت‌های گیمیفیکیشن >>> ---
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
                    // TODO: افزودن منطق ارسال پیش‌بینی با tg.sendData
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
    // --- <<< پایان تابع جدید >>> ---


    // --- Event Listeners for Buttons ---
    document.getElementById('btn-deposit').addEventListener('click', () => {
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
        // spoofUserData(); // برای تست در مرورگر
    });

})();