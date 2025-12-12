/* webapp/admin_script.js (v1.0 - Admin Dashboard Logic) */
(function () {
    'use strict';

    const tg = window.Telegram.WebApp;
    const API_BASE_URL = window.location.origin;

    // المان‌های DOM
    const loader = document.getElementById('loader');
    const appContainer = document.getElementById('app-container');
    const els = {
        statKycLite: document.getElementById('stat-pending-kyc-lite'),
        statKycFull: document.getElementById('stat-pending-kyc-full'),
        statDeposit: document.getElementById('stat-pending-deposit'),
        statWithdrawal: document.getElementById('stat-pending-withdrawal'),
        statNewUsers: document.getElementById('stat-new-users'),
        statTotalVolume: document.getElementById('stat-total-volume'),
        reviewGrid: document.querySelector('.quick-stats-grid'),
    };

    // --- 1. Main Initialization ---
    window.onload = async function() {
        try {
            tg.ready();
            tg.expand();
            tg.setHeaderColor('#050505');
            tg.setBackgroundColor('#050505');
            
            // در حالت توسعه، اگر initData نبود، از ادمین تست استفاده کن
            if (!tg.initData) {
                console.warn("Using Admin Test Data");
                // فرض می‌کنیم در حالت تست، admin_id را در initData قرار داده‌ایم
                tg.initData = "query_id=TEST_DEV_MODE&user=%7B%22id%22%3A" + 
                                (prompt("Enter Admin ID:", "161180613") || "111111111") + 
                                "%2C%22is_bot%22%3Afalse%2C%22first_name%22%3A%22Admin%22%2C%22language_code%22%3A%22fa%22%7D&auth_date=1700000000&hash=fake";
            }

            // چک کردن احراز هویت و بارگذاری آمار
            await fetchDashboardStats();
            
            // مخفی کردن لودر و نمایش محتوا
            hideLoader();
            initHapticFeedback(); 

        } catch (error) {
            console.error("Admin Init Error:", error);
            showError("خطای حیاتی: پنل بارگذاری نشد.");
            hideLoader();
        }
    };

    // --- 2. Admin Check & Data Fetching ---
    async function fetchDashboardStats() {
        try {
            const response = await fetch(`${API_BASE_URL}/admin/dashboard/stats`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ initData: tg.initData })
            });

            if (response.status === 403) {
                showError("⚠️ دسترسی غیرمجاز. شما ادمین نیستید.");
                return;
            }

            if (!response.ok) throw new Error("Server returned non-200 status.");

            const data = await response.json();

            if (data.status === 'success') {
                updateDashboardUI(data);
            } else {
                showError("❌ خطا در دریافت آمار: " + (data.message || "پاسخ نامعتبر"));
            }

        } catch (error) {
            console.error("Stats Fetch Error:", error);
            showError("❌ خطای اتصال به API ادمین.");
        }
    }

    // --- 3. UI Updater ---
    function updateDashboardUI(data) {
        // --- 1. آمار نیازمند بررسی ---
        if (els.statKycLite) els.statKycLite.innerText = data.pending_counts.kyc_lite.toLocaleString();
        if (els.statKycFull) els.statKycFull.innerText = data.pending_counts.kyc_full.toLocaleString();
        if (els.statDeposit) els.statDeposit.innerText = data.pending_counts.deposit.toLocaleString();
        if (els.statWithdrawal) els.statWithdrawal.innerText = data.pending_counts.withdrawal.toLocaleString();
        
        // --- 2. آمار عملکرد امروز ---
        if (els.statNewUsers) els.statNewUsers.innerText = data.performance.new_users.toLocaleString();
        if (els.statTotalVolume) els.statTotalVolume.innerText = formatters.formatTomanToMillion(data.performance.total_volume);

        // --- 3. افزودن شنونده کلیک به کارت‌ها (Navigation) ---
        document.querySelectorAll('.stat-card').forEach(card => {
            const action = card.getAttribute('data-onclick');
            if (action) {
                card.style.cursor = 'pointer';
                card.onclick = () => handleStatCardClick(action);
            }
        });
    }

    // --- 4. Navigation & Helper Functions ---

    // ترجمه اکشن‌های کارت‌ها به آدرس‌های وب‌اپ
    function handleStatCardClick(action) {
        switch (action) {
            case 'list_kyc_lite':
            case 'list_kyc_full':
                window.location.href = '/admin/kyc'; 
                break;
            case 'list_deposits':
                window.location.href = '/admin/reviews?type=deposit';
                break;
            case 'list_withdrawals':
                window.location.href = '/admin/reviews?type=withdrawal';
                break;
            default:
                tg.showAlert(`دکمه ${action} به زودی پیاده سازی می‌شود.`);
                break;
        }
    }

    function hideLoader() {
        if (loader) {
            loader.style.opacity = '0';
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
            loader.style.opacity = '1';
            loader.style.display = 'flex';
            loader.innerHTML = `<div class="loader-content" style="padding:20px; text-align:center;">
                <i class="fas fa-exclamation-triangle" style="font-size:2rem; color:var(--accent-red); margin-bottom:15px;"></i>
                <p style="color:var(--accent-red); font-size:1rem;">${msg}</p>
                <button onclick="window.location.href='/'" class="btn-admin-action" style="width:auto; margin-top:15px; background:var(--primary-gold); color:#000;">
                    بازگشت به داشبورد کاربر
                </button>
                </div>`;
        }
    }

    function initHapticFeedback() {
        document.querySelectorAll('.stat-card, .btn-admin-action').forEach(el => {
            el.addEventListener('click', () => { tg.HapticFeedback.impactOccurred('medium'); });
        });
    }

    // --- Helper for Toman Formatting (Inspired by wallet.html) ---
    const formatters = {
        formatTomanToMillion: (amount) => {
            if (typeof amount === 'string') amount = parseFloat(amount.replace(/,/g, ''));
            if (amount >= 1000000) {
                return `${(amount / 1000000).toLocaleString('en-US', { maximumFractionDigits: 1 })} M T`;
            }
            return `${amount.toLocaleString('en-US', { maximumFractionDigits: 0 })} T`;
        }
    };

})();