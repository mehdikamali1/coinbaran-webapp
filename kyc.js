/* webapp/kyc.js (v85.0 - Final Smart Logic) */
(function () {
    'use strict';

    const tg = window.Telegram.WebApp;
    const API_BASE_URL = window.location.origin;
    
    // متغیرهای وضعیت سراسری
    let currentTab = 'lvl1'; 
    let userKycLevel = 1;     // سطح عددی (1, 2, 3)
    let kycStatus = 'none';   // وضعیت متنی (pending_lite, approved_lite, etc)

    // المان‌های اصلی
    const btnSubmit = document.getElementById('main-submit-btn');
    const footer = document.getElementById('main-footer');
    const statusText = document.getElementById('status-text');
    const loader = document.getElementById('loader');

    // --- شروع برنامه ---
    window.onload = async function() {
        tg.ready(); 
        tg.expand();
        tg.setHeaderColor('#050505'); 
        tg.setBackgroundColor('#050505');
        
        // 1. دریافت وضعیت کاربر از سرور
        await fetchUserStatus();
        
        // 2. مخفی کردن لودر
        if(loader) loader.style.display = 'none';
    };

    // --- دریافت وضعیت از سرور ---
    async function fetchUserStatus() {
        if (!tg.initData) return;
        
        try {
            const res = await fetch(`${API_BASE_URL}/webapp/get_user_data`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'ngrok-skip-browser-warning': 'true'
                },
                body: JSON.stringify({ initData: tg.initData })
            });
            
            const data = await res.json();
            
            userKycLevel = data.kyc_level || 1;
            kycStatus = data.kyc_status_code || 'none';

            console.log("User Status Loaded:", userKycLevel, kycStatus);

            // رندر کردن صفحه بر اساس وضعیت
            renderPageBasedOnStatus();

        } catch (e) {
            console.error("Error fetching user status:", e);
        }
    }

    // --- لاجیک اصلی نمایش کارت‌ها ---
    function renderPageBasedOnStatus() {
        const formDiv = document.getElementById('lvl1-form');
        const pendingCard = document.getElementById('lvl1-pending');
        const successCard = document.getElementById('lvl1-success');
        const lockL2 = document.getElementById('lvl2-lock'); // قفل سطح 2

        // سناریو ۱: کاربر تایید شده است (سطح ۲ یا بالاتر)
        if (userKycLevel >= 2) {
            formDiv.style.display = 'none';
            pendingCard.classList.remove('show');
            successCard.classList.add('show'); // نمایش کارت سبز
            
            // باز کردن قفل سطح ۲
            lockL2.style.display = 'none';
            
            // اگر در تب ۱ هستیم، دکمه پایین را مخفی کن (چون کاری نمانده)
            if (currentTab === 'lvl1') footer.style.display = 'none';
        }
        
        // سناریو ۲: کاربر ویدیو فرستاده و منتظر تایید است
        else if (kycStatus === 'pending_lite' || kycStatus === 'pending') {
            formDiv.style.display = 'none';
            successCard.classList.remove('show');
            pendingCard.classList.add('show'); // نمایش کارت طلایی
            
            // سطح ۲ همچنان قفل است
            lockL2.style.display = 'flex';
            
            // دکمه پایین را مخفی کن (تا نتواند دوباره بفرستد)
            footer.style.display = 'none';
        }
        
        // سناریو ۳: کاربر هنوز اقدامی نکرده یا رد شده (فرم باز است)
        else {
            formDiv.style.display = 'block';
            pendingCard.classList.remove('show');
            successCard.classList.remove('show');
            
            lockL2.style.display = 'flex';
            
            // دکمه پایین را نشان بده
            if (currentTab === 'lvl1') footer.style.display = 'flex';
        }
        
        // آپدیت وضعیت دکمه اگر نمایش داده می‌شود
        if (footer.style.display !== 'none') {
            updateFooterState();
        }
    }

    // --- مدیریت تب‌ها ---
    window.switchTab = function(tab) {
        currentTab = tab;
        
        // تغییر کلاس اکتیو دکمه‌های بالا
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        
        if (tab === 'lvl1') {
            document.getElementById('tab-lvl1').classList.add('active');
            document.getElementById('lvl1-content').style.display = 'block';
            document.getElementById('lvl2-content').style.display = 'none';
            
            // نمایش فوتر در تب ۱ فقط اگر فرم باز باشد
            if (userKycLevel < 2 && kycStatus !== 'pending_lite' && kycStatus !== 'pending') {
                footer.style.display = 'flex';
            } else {
                footer.style.display = 'none';
            }
        } else {
            document.getElementById('tab-lvl2').classList.add('active');
            document.getElementById('lvl1-content').style.display = 'none';
            document.getElementById('lvl2-content').style.display = 'block';
            
            // فعلاً در سطح ۲ دکمه شناور نداریم (فرم‌های داخل صفحه هستند)
            // اگر بخواهید دکمه شناور برای سطح ۲ هم باشد، اینجا شرط بگذارید
            footer.style.display = 'none';
        }
        
        tg.HapticFeedback.selectionChanged();
    }

    // --- آپدیت متن و رنگ دکمه شناور ---
    function updateFooterState() {
        // فقط برای سطح ۱
        if (currentTab === 'lvl1') {
            const vid = document.getElementById('video-file').files.length > 0;
            const card = document.getElementById('card-file').files.length > 0;
            
            if (vid && card) {
                btnSubmit.classList.add('ready'); // کلاس سبز و درخشان
                btnSubmit.disabled = false;
                btnSubmit.innerHTML = '<span>ارسال مدارک</span><i class="fas fa-paper-plane"></i>';
                statusText.innerText = "آماده ارسال ✅";
                statusText.style.color = "var(--accent-green)";
            } else {
                btnSubmit.classList.remove('ready'); // کلاس خاکستری
                btnSubmit.disabled = true;
                btnSubmit.innerHTML = '<span>ارسال مدارک</span><i class="fas fa-arrow-up"></i>';
                statusText.innerText = "مدارک ناقص ⚠️";
                statusText.style.color = "var(--text-muted)";
            }
        }
    }

    // --- هندلر انتخاب فایل ---
    window.handleFileSelect = function(input, type, lvl) {
        if (input.files && input.files[0]) {
            const file = input.files[0];
            
            // چک حجم ویدیو (۲۵ مگابایت)
            if (type === 'vid' && file.size > 25 * 1024 * 1024) {
                tg.showAlert("حجم ویدیو زیاد است. لطفاً کوتاهتر ضبط کنید.");
                input.value = ""; 
                return;
            }
            
            // تغییر ظاهر باکس آپلود
            const area = input.parentElement;
            const icon = area.querySelector('.upload-icon');
            const title = area.querySelector('.upload-title');
            
            area.classList.add('active');
            if(icon) {
                icon.style.color = "#fff"; 
                icon.innerHTML = '<i class="fas fa-check"></i>';
            }
            if(title) {
                // نمایش نام کوتاه شده فایل
                let name = file.name;
                if (name.length > 15) name = name.substring(0, 15) + '...';
                title.innerText = "آماده: " + name;
                title.style.color = "var(--accent-green)";
            }
            
            tg.HapticFeedback.notificationOccurred('success');
        }
        // بررسی مجدد دکمه
        updateFooterState();
    }
    
    // هندلر فایل‌های سطح ۲ (برای آینده)
    window.handleFileSelect2 = function(input, type) {
        window.handleFileSelect(input, type, 2);
    }

    // --- هندلر کلیک دکمه اصلی ---
    window.handleSubmit = function() {
        if (currentTab === 'lvl1') submitLevel1();
        // else submitLevel2();
    }

    // --- ارسال سطح ۱ (ویدیو) ---
    async function submitLevel1() {
        const vidInput = document.getElementById('video-file');
        const cardInput = document.getElementById('card-file');

        // تغییر دکمه به حالت لودینگ
        btnSubmit.disabled = true;
        btnSubmit.innerHTML = '<i class="fas fa-spinner fa-spin"></i> در حال آپلود...';
        
        tg.HapticFeedback.impactOccurred('heavy');

        const formData = new FormData();
        formData.append('initData', tg.initData);
        formData.append('video', vidInput.files[0]);
        formData.append('bank_card', cardInput.files[0]);

        try {
            const res = await fetch(`${API_BASE_URL}/webapp/submit_kyc_lite`, {
                method: 'POST',
                body: formData,
                headers: { 
                    'ngrok-skip-browser-warning': 'true' // هدر امنیتی نگراک
                }
            });
            
            const result = await res.json();
            
            if (res.ok && result.status === 'success') {
                tg.HapticFeedback.notificationOccurred('success');
                
                // تغییر وضعیت آنی (بدون رفرش)
                kycStatus = 'pending_lite'; // وضعیت را دستی تغییر می‌دهیم
                renderPageBasedOnStatus(); // صفحه را دوباره رندر می‌کنیم
                
                tg.showAlert("✅ مدارک ارسال شد. منتظر بررسی ادمین باشید.");
            } else {
                throw new Error(result.message || "خطا در سرور");
            }

        } catch (e) {
            console.error(e);
            tg.showAlert("❌ خطا: " + e.message);
            tg.HapticFeedback.notificationOccurred('error');
            
            // ریست دکمه در صورت خطا
            btnSubmit.disabled = false;
            updateFooterState();
        }
    }

})();