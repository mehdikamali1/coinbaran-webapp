/* webapp/kyc.js (v90.0 - Final Production - Full L2 Support) */
(function () {
    'use strict';

    const tg = window.Telegram.WebApp;
    const API_BASE_URL = window.location.origin;
    
    // متغیرهای وضعیت
    let currentTab = 'lvl1'; 
    let userKycLevel = 1;
    let kycStatus = 'none';

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
        
        // دریافت وضعیت کاربر
        await fetchUserStatus();
        
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

            console.log("Status:", userKycLevel, kycStatus);
            renderPageBasedOnStatus();

        } catch (e) {
            console.error("Error fetching status:", e);
        }
    }

    // --- رندر کردن صفحه بر اساس وضعیت ---
    function renderPageBasedOnStatus() {
        const formDiv = document.getElementById('lvl1-form');
        const pendingCard = document.getElementById('lvl1-pending');
        const successCard = document.getElementById('lvl1-success');
        const lockL2 = document.getElementById('lvl2-lock');
        const formL2 = document.getElementById('lvl2-form');

        // حالت ۱: تایید شده (سطح ۲ باز است)
        if (userKycLevel >= 2) {
            formDiv.style.display = 'none';
            pendingCard.classList.remove('show');
            successCard.classList.add('show');
            
            lockL2.style.display = 'none'; // برداشتن قفل
            formL2.style.display = 'block'; // نمایش فرم سطح ۲
        }
        // حالت ۲: در انتظار بررسی
        else if (kycStatus === 'pending_lite' || kycStatus === 'pending') {
            formDiv.style.display = 'none';
            successCard.classList.remove('show');
            pendingCard.classList.add('show');
            
            lockL2.style.display = 'flex'; // قفل سطح ۲ فعال
        }
        // حالت ۳: عادی (فرم سطح ۱ باز)
        else {
            formDiv.style.display = 'block';
            pendingCard.classList.remove('show');
            successCard.classList.remove('show');
            lockL2.style.display = 'flex';
        }
        
        // تنظیم نمایش اولیه دکمه
        handleTabVisibility();
    }

    // --- مدیریت تب‌ها ---
    window.switchTab = function(tab) {
        currentTab = tab;
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
        
        handleTabVisibility();
        tg.HapticFeedback.selectionChanged();
    }

    function handleTabVisibility() {
        // تصمیم‌گیری برای نمایش فوتر (دکمه شناور)
        if (currentTab === 'lvl1') {
            // اگر سطح ۱ کامل شده یا در انتظار است، دکمه نمی‌خواهیم
            if (userKycLevel >= 2 || kycStatus === 'pending_lite') {
                footer.style.display = 'none';
            } else {
                footer.style.display = 'flex';
                updateFooterState(); // بررسی وضعیت دکمه
            }
        } 
        else if (currentTab === 'lvl2') {
            // اگر سطح ۱ کامل شده، دکمه سطح ۲ را نشان بده
            if (userKycLevel >= 2) {
                footer.style.display = 'flex';
                updateFooterState(); // بررسی وضعیت دکمه برای سطح ۲
            } else {
                footer.style.display = 'none'; // چون قفل است
            }
        }
    }

    // --- بررسی وضعیت دکمه شناور (مهم‌ترین بخش) ---
    // این تابع توسط oninput در HTML صدا زده می‌شود (گلوبال شده)
    window.updateFooterState = function() {
        if (currentTab === 'lvl1') {
            const vid = document.getElementById('video-file').files.length > 0;
            const card = document.getElementById('card-file').files.length > 0;
            
            if (vid && card) enableBtn('ارسال و فعال‌سازی آنی 🚀', 'آماده ارسال');
            else disableBtn('مدارک ناقص ⚠️', 'ارسال مدارک');
        } 
        else if (currentTab === 'lvl2') {
            // بررسی ۸ فیلد سطح ۲
            const name = document.getElementById('full_name').value.trim();
            const nid = document.getElementById('national_id').value.trim();
            const birth = document.getElementById('birth_date').value.trim();
            const phone = document.getElementById('phone_number').value.trim();
            
            const f1 = document.getElementById('id_front').files.length > 0;
            const f2 = document.getElementById('id_back').files.length > 0;
            const f3 = document.getElementById('bank_card_2').files.length > 0;
            const f4 = document.getElementById('selfie_2').files.length > 0;
            
            // لاجیک اعتبار سنجی
            if (name && nid.length >= 10 && birth && phone.length >= 10 && f1 && f2 && f3 && f4) {
                enableBtn('ارسال برای بررسی نهایی 💎', 'تکمیل شده');
            } else {
                disableBtn('فرم ناقص 📝', 'تکمیل فرم سطح ۲');
            }
        }
    }

    function enableBtn(text, statusMsg) {
        btnSubmit.classList.add('ready');
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = `<span>${text}</span><i class="fas fa-paper-plane"></i>`;
        statusText.innerText = statusMsg;
        statusText.style.color = "var(--accent-green)";
    }

    function disableBtn(statusMsg, text) {
        btnSubmit.classList.remove('ready');
        btnSubmit.disabled = true;
        btnSubmit.innerHTML = `<span>${text}</span><i class="fas fa-arrow-up"></i>`;
        statusText.innerText = statusMsg;
        statusText.style.color = "var(--text-muted)";
    }

    // --- هندلر انتخاب فایل ---
    window.handleFileSelect = function(input, type, lvl) {
        if (input.files && input.files[0]) {
            const file = input.files[0];
            // چک حجم ویدیو
            if(type === 'vid' && file.size > 25*1024*1024) {
                tg.showAlert("حجم ویدیو زیاد است (حداکثر ۲۵ مگابایت).");
                input.value = ""; return;
            }
            
            // تغییر استایل باکس مربوطه
            const area = input.parentElement;
            area.classList.add('active');
            
            // پیدا کردن آیکون برای تیک زدن
            const icon = area.querySelector(lvl === 1 ? '.upload-icon' : '.mini-icon');
            const label = area.querySelector(lvl === 1 ? '.upload-title' : '.mini-label');

            if(icon) { 
                icon.innerHTML = '<i class="fas fa-check"></i>'; 
                icon.style.color = "#fff"; 
            }
            if(label && lvl === 2) {
                label.style.color = "var(--accent-green)";
                label.innerText = "انتخاب شد";
            }
            
            tg.HapticFeedback.notificationOccurred('success');
        }
        updateFooterState(); // بررسی مجدد دکمه
    }
    
    window.handleFileSelect2 = function(input, type) {
        window.handleFileSelect(input, type, 2);
    }

    // --- هندلر کلیک دکمه اصلی ---
    window.handleSubmit = function() {
        if (currentTab === 'lvl1') submitLevel1();
        else submitLevel2();
    }

    // --- ارسال سطح ۱ ---
    async function submitLevel1() {
        const vidInput = document.getElementById('video-file');
        const cardInput = document.getElementById('card-file');

        setLoading(true, 'در حال آپلود...');
        const fd = new FormData();
        fd.append('initData', tg.initData);
        fd.append('video', vidInput.files[0]);
        fd.append('bank_card', cardInput.files[0]);

        try {
            const res = await fetch(`${API_BASE_URL}/webapp/submit_kyc_lite`, {
                method: 'POST', body: fd, headers: {'ngrok-skip-browser-warning':'true'}
            });
            const r = await res.json();
            if(res.ok && r.status==='success') {
                tg.showAlert("✅ مدارک ارسال شد.");
                window.location.reload();
            } else throw new Error(r.message);
        } catch(e) {
            tg.showAlert("خطا: "+e.message);
            setLoading(false, 'ارسال مدارک');
        }
    }

    // --- ارسال سطح ۲ ---
    async function submitLevel2() {
        setLoading(true, 'آپلود سنگین...');
        const fd = new FormData();
        fd.append('initData', tg.initData);
        fd.append('full_name', document.getElementById('full_name').value);
        fd.append('national_id', document.getElementById('national_id').value);
        fd.append('birth_date', document.getElementById('birth_date').value || '-');
        fd.append('phone_number', document.getElementById('phone_number').value || '-');
        fd.append('card_number', 'Pending'); // فیلد فنی
        
        fd.append('id_front_file', document.getElementById('id_front').files[0]);
        fd.append('id_back_file', document.getElementById('id_back').files[0]);
        fd.append('bank_card_file', document.getElementById('bank_card_2').files[0]);
        fd.append('selfie_file', document.getElementById('selfie_2').files[0]);

        try {
            const res = await fetch(`${API_BASE_URL}/webapp/submit_full_kyc`, {
                method: 'POST', body: fd, headers: {'ngrok-skip-browser-warning':'true'}
            });
            const r = await res.json();
            if(res.ok && r.status==='success') {
                tg.showAlert("✅ مدارک سطح ۲ با موفقیت ارسال شد.\nلطفاً منتظر بررسی کارشناسان باشید.");
                setTimeout(() => tg.close(), 2000);
            } else throw new Error(r.message);
        } catch(e) {
            tg.showAlert("خطا: "+e.message);
            setLoading(false, 'ارسال برای بررسی نهایی 💎');
        }
    }

    function setLoading(isLoading, text) {
        if(isLoading) {
            btnSubmit.disabled = true;
            btnSubmit.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${text}`;
        } else {
            btnSubmit.disabled = false;
            btnSubmit.innerHTML = `<span>${text}</span><i class="fas fa-paper-plane"></i>`;
            updateFooterState();
        }
    }

})();