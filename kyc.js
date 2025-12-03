/* webapp/kyc.js (v80.0 - Smart Logic for KYC Levels) */
(function () {
    'use strict';

    const tg = window.Telegram.WebApp;
    const API_BASE_URL = window.location.origin;
    
    // متغیرهای وضعیت
    let currentTab = 'lvl1'; 
    let userKycLevel = 1; // 1: احراز نشده, 2: ویدیو تایید شده, 3: کامل

    // المان‌های اصلی
    const btnSubmit = document.getElementById('main-submit-btn');
    const statusText = document.getElementById('status-text');
    const loader = document.getElementById('loader');

    // --- شروع برنامه ---
    window.onload = async function() {
        tg.ready(); 
        tg.expand();
        tg.setHeaderColor('#050505'); 
        tg.setBackgroundColor('#050505');
        
        // دریافت اطلاعات کاربر برای تشخیص سطح فعلی
        await fetchUserLevel();
        
        // مخفی کردن لودر
        if(loader) loader.style.display = 'none';
    };

    // --- دریافت سطح کاربر از سرور ---
    async function fetchUserLevel() {
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
            
            // kyc_level در دیتابیس: 1 (پیش‌فرض), 2 (ویدیو تایید شده), 3 (کامل)
            userKycLevel = data.kyc_level || 1;
            const kycStatus = data.kyc_status_code || 'none';

            // اگر کاربر قبلاً ویدیو فرستاده و تایید شده (سطح ۲ یا ۳)
            if (userKycLevel >= 2) {
                // نمایش کارت موفقیت سطح ۱
                document.getElementById('lvl1-form').style.display = 'none';
                document.getElementById('lvl1-success').classList.add('show');
                document.getElementById('lvl1-verified-msg').style.display = 'block';
                
                // باز کردن قفل سطح ۲
                document.getElementById('lvl2-lock').style.display = 'none';
                
                // اگر سطح ۲ است، یعنی باید مدارک کامل را بفرستد -> تب ۲ را باز کن
                if (userKycLevel === 2) {
                    switchTab('lvl2');
                }
            } 
            // اگر کاربر ویدیو فرستاده ولی هنوز در انتظار بررسی است
            else if (kycStatus === 'pending_lite') {
                btnSubmit.innerHTML = 'در حال بررسی ⏳';
                btnSubmit.disabled = true;
                btnSubmit.style.background = "#333";
                statusText.innerText = "منتظر تایید ادمین";
                statusText.style.color = "var(--primary-gold)";
            }

            updateFooterState();

        } catch (e) {
            console.error("Error fetching user level:", e);
        }
    }

    // --- مدیریت تب‌ها ---
    window.switchTab = function(tab) {
        currentTab = tab;
        
        // آپدیت دکمه‌های بالا
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        if (tab === 'lvl1') {
            document.getElementById('tab-lvl1').classList.add('active');
            document.getElementById('lvl1-content').style.display = 'block';
            document.getElementById('lvl2-content').style.display = 'none';
        } else {
            document.getElementById('tab-lvl2').classList.add('active');
            document.getElementById('lvl1-content').style.display = 'none';
            document.getElementById('lvl2-content').style.display = 'block';
        }
        
        updateFooterState();
        tg.HapticFeedback.selectionChanged();
    }

    // --- آپدیت وضعیت دکمه شناور پایین ---
    function updateFooterState() {
        // حالت ۱: تب سطح ۱ فعال است
        if (currentTab === 'lvl1') {
            if (userKycLevel >= 2) {
                setButtonState('disabled', 'تکمیل شده ✅', 'تایید شده');
                return;
            }
            
            // چک کردن فایل‌های سطح ۱
            const vid = document.getElementById('video-file').files.length > 0;
            const card = document.getElementById('card-file').files.length > 0;
            
            if (vid && card) {
                setButtonState('active', 'ارسال و فعال‌سازی آنی 🚀', 'آماده ارسال');
            } else {
                setButtonState('disabled', 'ارسال مدارک (ویدیو + کارت)', 'مدارک ناقص');
            }
        }
        
        // حالت ۲: تب سطح ۲ فعال است
        else if (currentTab === 'lvl2') {
            if (userKycLevel < 2) {
                setButtonState('disabled', 'قفل شده 🔒', 'ابتدا سطح ۱ را تکمیل کنید');
                return;
            }
            
            // چک کردن فرم‌های سطح ۲
            const name = document.getElementById('full_name').value;
            const nid = document.getElementById('national_id').value;
            const f1 = document.getElementById('id_front').files.length > 0;
            const f2 = document.getElementById('id_back').files.length > 0;
            const f3 = document.getElementById('bank_card_2').files.length > 0;
            const f4 = document.getElementById('selfie_2').files.length > 0;

            if (name && nid && f1 && f2 && f3 && f4) {
                setButtonState('active', 'ارسال برای بررسی نهایی 💎', 'تکمیل شده');
            } else {
                setButtonState('disabled', 'تکمیل فرم سطح ۲', 'فرم ناقص');
            }
        }
    }

    function setButtonState(state, text, statusMsg) {
        if (state === 'active') {
            btnSubmit.classList.add('ready');
            btnSubmit.disabled = false;
            btnSubmit.innerHTML = text;
            statusText.innerText = statusMsg;
            statusText.style.color = "var(--accent-green)";
        } else {
            btnSubmit.classList.remove('ready');
            btnSubmit.disabled = true;
            btnSubmit.innerHTML = text;
            statusText.innerText = statusMsg;
            statusText.style.color = "var(--text-muted)";
        }
    }

    // --- هندلر انتخاب فایل (سطح ۱) ---
    window.handleFileSelect = function(input, type, lvl) {
        if(input.files && input.files[0]) {
            const file = input.files[0];
            // چک حجم ویدیو
            if(type === 'vid' && file.size > 25 * 1024 * 1024) {
                tg.showAlert("حجم ویدیو زیاد است (حداکثر ۲۵ مگابایت).");
                input.value = ""; return;
            }
            
            // تغییر استایل باکس
            const area = input.parentElement;
            area.classList.add('active');
            
            // پیدا کردن آیکون و متن برای تغییر رنگ
            const icon = area.querySelector(lvl === 1 ? '.upload-icon' : '.mini-icon');
            const title = area.querySelector(lvl === 1 ? '.upload-title' : '.mini-label');
            
            if(icon) {
                icon.style.color = "#fff"; 
                icon.innerHTML = '<i class="fas fa-check"></i>';
            }
            if(title) {
                title.innerText = file.name.length > 15 ? file.name.substring(0,12)+'...' : file.name;
                title.style.color = "var(--accent-green)";
            }
            
            tg.HapticFeedback.notificationOccurred('success');
        }
        updateFooterState();
    }
    
    // هندلر انتخاب فایل (سطح ۲ - آدرس‌دهی متفاوت)
    window.handleFileSelect2 = function(input, type) {
        window.handleFileSelect(input, type, 2);
    }

    // لیسنر برای ورودی‌های متنی سطح ۲
    const l2Inputs = ['full_name', 'national_id', 'birth_date', 'phone_number'];
    l2Inputs.forEach(id => {
        const el = document.getElementById(id);
        if(el) el.addEventListener('input', updateFooterState);
    });

    // --- هندلر کلیک دکمه اصلی ---
    window.handleSubmit = function() {
        if (currentTab === 'lvl1') submitLevel1();
        else submitLevel2();
    }

    // ارسال سطح ۱ (ویدیو)
    async function submitLevel1() {
        const vidInput = document.getElementById('video-file');
        const cardInput = document.getElementById('card-file');

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
                headers: { 'ngrok-skip-browser-warning': 'true' }
            });
            
            const result = await res.json();
            
            if (res.ok && result.status === 'success') {
                tg.HapticFeedback.notificationOccurred('success');
                tg.showAlert("✅ مدارک شما ارسال شد.\nنتیجه بررسی در ربات به شما اعلام می‌شود.", function() {
                    window.location.reload(); // ریلود برای دیدن وضعیت در انتظار
                });
            } else {
                throw new Error(result.message || "خطا در سرور");
            }
        } catch(e) {
            tg.showAlert("❌ خطا: " + e.message);
            btnSubmit.disabled = false;
            updateFooterState();
        }
    }

    // ارسال سطح ۲ (کامل)
    async function submitLevel2() {
        const formData = new FormData();
        formData.append('initData', tg.initData);
        formData.append('full_name', document.getElementById('full_name').value);
        formData.append('national_id', document.getElementById('national_id').value);
        formData.append('birth_date', document.getElementById('birth_date').value);
        formData.append('phone_number', document.getElementById('phone_number').value);
        formData.append('card_number', "Pending"); // فیلد اجباری بک‌اند
        
        formData.append('id_front_file', document.getElementById('id_front').files[0]);
        formData.append('id_back_file', document.getElementById('id_back').files[0]);
        formData.append('bank_card_file', document.getElementById('bank_card_2').files[0]);
        formData.append('selfie_file', document.getElementById('selfie_2').files[0]);

        btnSubmit.disabled = true;
        btnSubmit.innerHTML = '<i class="fas fa-spinner fa-spin"></i> آپلود سنگین...';

        try {
            const res = await fetch(`${API_BASE_URL}/webapp/submit_full_kyc`, {
                method: 'POST', body: formData, headers: {'ngrok-skip-browser-warning': 'true'}
            });
            const result = await res.json();
            if(res.ok && result.status === 'success') {
                tg.showAlert("✅ مدارک سطح ۲ ارسال شد. لطفاً منتظر تایید باشید.");
                setTimeout(() => tg.close(), 2000);
            } else throw new Error(result.message);
        } catch(e) {
            tg.showAlert("خطا: " + e.message);
            btnSubmit.disabled = false;
            updateFooterState();
        }
    }

})();