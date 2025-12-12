/* webapp/admin_users_script.js (v1.0 - User Management Logic) */
(function () {
    'use strict';

    const tg = window.Telegram.WebApp;
    const API_BASE_URL = window.location.origin;

    // --- وضعیت سراسری ---
    let currentPage = 1;
    const USERS_PER_PAGE = 20;
    let totalUsers = 0;
    let currentSearchTerm = '';
    
    // المان‌های DOM
    const loader = document.getElementById('loader');
    const appContainer = document.getElementById('app-container');
    const els = {
        listContainer: document.getElementById('user-list-container'),
        userCount: document.getElementById('user-count'),
        searchInput: document.getElementById('user-search-input'),
        btnSearch: document.getElementById('btn-search-user'),
        btnPrev: document.getElementById('btn-prev-page'),
        btnNext: document.getElementById('btn-next-page'),
        pageInfo: document.getElementById('page-info'),
        profileModal: document.getElementById('user-profile-modal'),
        btnCloseProfileModal: document.getElementById('btn-close-profile-modal'),
        profileDetails: document.getElementById('profile-details'),
        btnToggleBan: document.getElementById('btn-toggle-ban'),
        btnManualCredit: document.getElementById('btn-manual-credit')
    };
    
    // --- 1. Main Initialization & Event Setup ---
    window.onload = async function() {
        try {
            tg.ready();
            tg.expand();
            tg.setHeaderColor('#050505');
            tg.setBackgroundColor('#050505');

            // در حالت توسعه، اگر initData نبود، از ادمین تست استفاده کن
            if (!tg.initData) tg.initData = "query_id=TEST_DEV_MODE&user=%7B%22id%22%3A161180613%7D&hash=fake&ADMIN";

            setupEventListeners();
            await fetchUsersList();
            
            hideLoader();

        } catch (error) {
            console.error("Admin Users Init Error:", error);
            showError("خطای حیاتی: پنل مدیریت کاربران بارگذاری نشد.");
            hideLoader();
        }
    };

    function setupEventListeners() {
        els.listContainer.addEventListener('click', handleListItemClick);
        els.btnSearch.addEventListener('click', handleSearch);
        els.searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleSearch();
        });
        
        els.btnPrev.addEventListener('click', () => changePage(-1));
        els.btnNext.addEventListener('click', () => changePage(1));

        els.btnCloseProfileModal.addEventListener('click', closeModal);
        els.btnToggleBan.addEventListener('click', handleToggleBan);
        els.btnManualCredit.addEventListener('click', handleManualCredit);
    }
    
    // --- 2. Data Fetching & Paging ---

    async function fetchUsersList() {
        const loadingMsg = document.getElementById('loading-message');
        if (loadingMsg) loadingMsg.style.display = 'block';

        const offset = (currentPage - 1) * USERS_PER_PAGE;
        const endpoint = `/admin/users/list?limit=${USERS_PER_PAGE}&offset=${offset}&search=${currentSearchTerm}`;

        try {
            const response = await fetch(`${API_BASE_URL}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ initData: tg.initData })
            });

            if (response.status === 403) throw new Error("Admin Access Required");

            const data = await response.json();

            if (data.status === 'success') {
                totalUsers = data.total_count;
                renderUserList(data.users);
            } else {
                tg.showAlert("خطا در دریافت لیست کاربران: " + (data.message || "پاسخ نامعتبر"));
                els.listContainer.innerHTML = '<p class="text-muted" style="text-align: center; padding: 20px;">❌ خطا در بارگذاری لیست.</p>';
            }

        } catch (error) {
            console.error("User List Fetch Error:", error);
            showError("❌ خطای اتصال به API مدیریت کاربران.");
        } finally {
            if (loadingMsg) loadingMsg.style.display = 'none';
        }
    }

    function handleSearch() {
        const term = els.searchInput.value.trim();
        if (term !== currentSearchTerm) {
            currentSearchTerm = term;
            currentPage = 1;
            fetchUsersList();
        }
    }

    function changePage(direction) {
        const newPage = currentPage + direction;
        const totalPages = Math.ceil(totalUsers / USERS_PER_PAGE);

        if (newPage >= 1 && newPage <= totalPages) {
            currentPage = newPage;
            fetchUsersList();
        }
    }

    // --- 3. List Rendering ---

    function renderUserList(users) {
        els.listContainer.innerHTML = '';
        els.userCount.innerText = totalUsers.toLocaleString();
        
        const totalPages = Math.ceil(totalUsers / USERS_PER_PAGE);
        els.pageInfo.innerText = `صفحه ${currentPage} از ${totalPages || 1}`;
        els.btnPrev.disabled = currentPage === 1;
        els.btnNext.disabled = currentPage === totalPages || totalUsers === 0;

        if (users.length === 0) {
            els.listContainer.innerHTML = '<p class="text-muted" style="text-align: center; padding: 20px;">هیچ کاربری یافت نشد.</p>';
            return;
        }

        users.forEach(user => {
            const item = document.createElement('div');
            item.className = 'user-list-item ripple-btn';
            item.setAttribute('data-user-id', user.user_id);
            item.onclick = () => openProfileModal(user.user_id); // باز کردن پروفایل کامل
            
            // تعیین وضعیت KYC و رنگ
            const kycStatus = user.kyc_status || 'none';
            const kycLevel = user.kyc_level || 1;
            let kycClass, kycText;

            if (kycStatus.includes('approved') && kycLevel === 3) {
                kycClass = 'kyc-approved'; kycText = 'تایید کامل (L3)';
            } else if (kycStatus.includes('approved_lite') || kycLevel === 2) {
                kycClass = 'kyc-approved'; kycText = 'تایید ویدیویی (L2)';
            } else if (kycStatus.includes('pending')) {
                kycClass = 'kyc-pending'; kycText = 'در انتظار بررسی';
            } else {
                kycClass = 'kyc-none'; kycText = 'تکمیل نشده';
            }

            // تعیین وضعیت حساب (فعال/مسدود)
            const accountStatus = user.status || 'active';
            const nameDisplay = user.kyc_full_name || user.first_name || `کاربر ${user.user_id}`;
            
            item.innerHTML = `
                <div class="user-name-col">
                    <h4>${nameDisplay}</h4>
                    <span>ID: ${user.user_id}</span>
                </div>
                <div class="user-kyc-col">
                    <span class="kyc-status-badge ${kycClass}">${kycText}</span>
                    <span class="balance-label" style="color: ${accountStatus === 'banned' ? 'var(--accent-red)' : 'var(--accent-green)'};">
                        وضعیت: ${accountStatus === 'banned' ? 'مسدود' : 'فعال'}
                    </span>
                </div>
                <div class="user-balance-col">
                    <span class="balance-value" style="color: var(--accent-green);">
                        ${user.toman_balance.toLocaleString('en-US', { maximumFractionDigits: 0 })} <small>T</small>
                    </span>
                    <span class="balance-label">موجودی تومان</span>
                </div>
            `;
            els.listContainer.appendChild(item);
        });
    }

    // --- 4. Profile Modal & Actions ---

    async function openProfileModal(userId) {
        els.profileModal.classList.add('active');
        els.profileDetails.innerHTML = '<p class="text-muted" style="text-align: center;"><i class="fas fa-spinner fa-spin"></i> در حال بارگذاری جزئیات...</p>';

        try {
            const response = await fetch(`${API_BASE_URL}/admin/users/details/${userId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ initData: tg.initData })
            });
            const data = await response.json();

            if (data.status === 'success') {
                renderUserProfile(data.details);
            } else {
                els.profileDetails.innerHTML = `<p class="text-muted" style="text-align: center; color: var(--accent-red);">❌ خطا: ${data.message || 'کاربر یافت نشد.'}</p>`;
            }
        } catch (error) {
            console.error("User Details Fetch Error:", error);
            els.profileDetails.innerHTML = '<p class="text-muted" style="text-align: center; color: var(--accent-red);">❌ خطای شبکه.</p>';
        }
    }

    function renderUserProfile(user) {
        let kycText, kycClass, banText;

        // وضعیت KYC
        if (user.kyc_level === 3) { kycText = 'تایید کامل (L3)'; kycClass = 'kyc-approved'; }
        else if (user.kyc_level === 2) { kycText = 'تایید ویدیویی (L2)'; kycClass = 'kyc-pending'; }
        else { kycText = 'تکمیل نشده'; kycClass = 'kyc-none'; }
        
        // وضعیت مسدودسازی
        const isBanned = user.wallet_status === 'banned';
        banText = isBanned ? 'بازگشایی حساب' : 'مسدود سازی';
        els.btnToggleBan.style.background = isBanned ? 'var(--accent-green)' : 'var(--accent-red)';
        els.btnToggleBan.innerHTML = `<i class="fas ${isBanned ? 'fa-lock-open' : 'fa-ban'}"></i> ${banText}`;
        els.btnToggleBan.setAttribute('data-status', user.wallet_status);
        
        // ذخیره اطلاعات کاربر فعلی در دکمه‌ها
        els.btnToggleBan.setAttribute('data-user-id', user.user_id);
        els.btnManualCredit.setAttribute('data-user-id', user.user_id);
        
        // ساختار HTML جزئیات
        els.profileDetails.innerHTML = `
            <div class="detail-row"><span>ID کاربر:</span> <strong><code>${user.user_id}</code></strong></div>
            <div class="detail-row"><span>نام (تلگرام):</span> <strong>${user.user_first_name}</strong></div>
            <div class="detail-row"><span>Username:</span> <strong>@${user.username || 'N/A'}</strong></div>
            
            <h4 style="color: var(--primary-gold); margin-top: 20px;">وضعیت مالی</h4>
            <div class="detail-row"><span>موجودی تومان:</span> <strong style="color: var(--accent-green);">${user.toman_balance.toLocaleString('en-US', { maximumFractionDigits: 0 })} T</strong></div>
            <div class="detail-row"><span>موجودی دلاری (UUSD):</span> <strong>${user.uusd_balance.toLocaleString('en-US', { maximumFractionDigits: 2 })} $</strong></div>
            <div class="detail-row"><span>امتیاز XP:</span> <strong>${user.xp_balance.toLocaleString()} XP</strong></div>
            <div class="detail-row"><span>حجم کل معاملات:</span> <strong>${user.total_volume_toman.toLocaleString('en-US', { maximumFractionDigits: 0 })} T</strong></div>

            <h4 style="color: var(--accent-blue); margin-top: 20px;">اطلاعات هویتی و KYC</h4>
            <div class="detail-row"><span>سطح KYC:</span> <strong class="${kycClass}" style="padding:2px 8px; border-radius:5px;">${kycText}</strong></div>
            <div class="detail-row"><span>نام تایید شده:</span> <strong>${user.submitted_full_name || 'تایید نشده'}</strong></div>
            <div class="detail-row"><span>کد ملی:</span> <strong><code>${user.national_id || 'N/A'}</code></strong></div>
            <div class="detail-row"><span>شماره کارت اصلی:</span> <strong><code>${user.typed_bank_card_number || 'N/A'}</code></strong></div>
            
            <h4 style="color: var(--accent-red); margin-top: 20px;">وضعیت امنیتی</h4>
            <div class="detail-row"><span>وضعیت حساب:</span> <strong style="color: ${isBanned ? 'var(--accent-red)' : 'var(--accent-green)'};">${user.wallet_status}</strong></div>
        `;
    }

    function closeModal() {
        els.profileModal.classList.remove('active');
    }

    // --- 5. Action Handlers (API Calls) ---
    async function handleToggleBan() {
        const userId = els.btnToggleBan.getAttribute('data-user-id');
        const currentStatus = els.btnToggleBan.getAttribute('data-status');
        const newStatus = currentStatus === 'banned' ? 'active' : 'banned';
        const actionText = newStatus === 'banned' ? 'مسدود' : 'فعال';

        if (!confirm(`آیا مطمئنید می‌خواهید حساب کاربر ${userId} را ${actionText} کنید؟`)) return;

        try {
            const response = await fetch(`${API_BASE_URL}/admin/users/set_status`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    initData: tg.initData, 
                    user_id: userId, 
                    new_status: newStatus 
                })
            });
            const data = await response.json();

            if (data.status === 'success') {
                tg.showAlert(`✅ حساب کاربر با موفقیت ${actionText} شد.`);
                openProfileModal(userId); // رفرش مودال
                fetchUsersList(); // رفرش لیست
            } else {
                tg.showAlert(`❌ خطا: ${data.message || 'عملیات ناموفق.'}`);
            }

        } catch (error) {
            tg.showAlert("❌ خطای شبکه در هنگام تغییر وضعیت حساب.");
        }
    }

    async function handleManualCredit() {
        const userId = els.btnManualCredit.getAttribute('data-user-id');
        const action = prompt(`لطفاً نوع عملیات و مبلغ را وارد کنید.\nمثال: ADD 100000\nمثال: SUB 50000\n\n(ADD: افزایش، SUB: کاهش)`, 'ADD ');
        
        if (!action) return;

        const parts = action.toUpperCase().split(' ');
        const type = parts[0];
        const amount = parseFloat(parts[1]);

        if (!['ADD', 'SUB'].includes(type) || isNaN(amount) || amount <= 0) {
            tg.showAlert("❌ فرمت نامعتبر است. از (ADD 1000) یا (SUB 500) استفاده کنید.");
            return;
        }

        if (!confirm(`آیا مطمئنید ${type === 'ADD' ? 'افزایش' : 'کاهش'} ${amount.toLocaleString()} تومان را برای کاربر ${userId} اعمال می‌کنید؟`)) return;

        try {
            const response = await fetch(`${API_BASE_URL}/admin/users/adjust_balance`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    initData: tg.initData, 
                    user_id: userId, 
                    amount: amount,
                    operation: type 
                })
            });
            const data = await response.json();

            if (data.status === 'success') {
                tg.showAlert(`✅ موجودی با موفقیت ${type === 'ADD' ? 'افزایش' : 'کاهش'} یافت.`);
                openProfileModal(userId); 
                fetchUsersList(); 
            } else {
                tg.showAlert(`❌ خطا: ${data.message || 'عملیات ناموفق.'}`);
            }

        } catch (error) {
            tg.showAlert("❌ خطای شبکه در هنگام تنظیم موجودی.");
        }
    }

    // --- Helper Functions ---
    
    function hideLoader() {
        // (همان منطق)
        const l = document.getElementById('loader');
        const a = document.getElementById('app-container');
        if (l) { l.style.opacity = '0'; setTimeout(() => { l.style.display = 'none'; a.classList.remove('hidden-content'); a.classList.add('fade-in-active'); }, 500); }
    }

    function showError(msg) {
        // (همان منطق)
        const l = document.getElementById('loader');
        if (l) {
            l.style.opacity = '1';
            l.style.display = 'flex';
            l.innerHTML = `<div class="loader-content" style="padding:20px; text-align:center;">
                <i class="fas fa-exclamation-triangle" style="font-size:2rem; color:var(--accent-red); margin-bottom:15px;"></i>
                <p style="color:var(--accent-red); font-size:1rem;">${msg}</p>
                </div>`;
        }
    }

})();