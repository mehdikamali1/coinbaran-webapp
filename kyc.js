/* webapp/kyc.js (v101.0 - Final Production Logic) */
(function () {
    'use strict';

    const tg = window.Telegram.WebApp;
    const API_BASE_URL = window.location.origin;
    
    // متغیرهای وضعیت سراسری
    let currentTab = 'lvl1'; 
    let userKycLevel = 1;     // 1: مهمان, 2: ویدیو تایید شده, 3: کامل
    let kycStatus = 'none';   // وضعیت دقیق (pending_lite, approved_lite, pending_full, etc)

    // المان‌های اصلی رابط کاربری
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
            // اضافه کردن پارامتر زمان برای جلوگیری از کش شدن توسط مرورگر تلگرام
            const timestamp = new Date().getTime();
            const res = await fetch(`${API_BASE_URL}/webapp/get_user_data?t=${timestamp}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'ngrok-skip-browser-warning': 'true'
                },
                body: JSON.stringify({ initData: tg.initData })
            });
            
            const data = await res.json();
            
            // تبدیل وضعیت‌ها به فرمت استاندارد
            userKycLevel = parseInt(data.kyc_level) || 1;
            kycStatus = data.kyc_status_code || 'none';

            console.log("User Status Loaded:", userKycLevel, kycStatus);

            // رندر کردن صفحه بر اساس وضعیت
            renderPageBasedOnStatus();

        } catch (e) {
            console.error("Error fetching user status:", e);
            tg.showAlert("خطا در ارتباط با سرور. لطفاً اینترنت خود را بررسی کنید.");
        }
    }

    // --- لاجیک اصلی نمایش کارت‌ها و فرم‌ها ---
    function renderPageBasedOnStatus() {
        const f1 = document.getElementById('lvl1-form');
        const p1 = document.getElementById('lvl1-pending');
        const s1 = document.getElementById('lvl1-success');
        
        const lock2 = document.getElementById('lvl2-lock');
        const f2 = document.getElementById('lvl2-form');

        // سناریو ۱: کاربر سطح ۱ را پاس کرده است (سطح ۲ یا ۳)
        if (userKycLevel >= 2) {
            // --- وضعیت تب ۱ ---
            f1.style.display = 'none';
            p1.classList.remove('show');
            s1.classList.add('show'); // نمایش کارت سبز تایید
            
            // --- وضعیت تب ۲ ---
            lock2.style.display = 'none'; // قفل باز است
            
            if (userKycLevel === 3) {
                // سطح ۳ کامل شده
                f2.innerHTML = `
                    <div class="status-card card-success show">
                        <i class="fas fa-gem success-icon"></i>
                        <h2 style="color:#fff; margin-bottom:10px;">تایید نهایی شد 💎</h2>
                        <p style="color:#eee; font-size:0.9rem;">تبریک! حساب شما کاملاً وریفای شده است.</p>
                    </div>`;
                footer.style.display = 'none';
            } 
            else if (kycStatus === 'pending_full') {
                // سطح ۲ ارسال شده و منتظر تایید است
                f2.innerHTML = `
                    <div class="status-card card-pending show">
                        <i class="fas fa-hourglass-half pending-icon"></i>
                        <h2 style="color:#fff; margin-bottom:10px;">مدارک در حال بررسی...</h2>
                        <p style="color:#ddd; font-size:0.9rem;">مدارک کامل شما دریافت شد. لطفاً منتظر تایید ادمین باشید.</p>
                    </div>`;
                footer.style.display = 'none';
            } 
            else {
                // سطح ۲ باز است و باید پر شود
                f2.style.display = 'block';
                // اگر تب ۲ فعال است، فوتر را نشان بده
                if(currentTab === 'lvl2') {
                    footer.style.display = 'flex';
                    updateFooterState();
                } else {
                    footer.style.display = 'none';
                }
            }
        }
        
        // سناریو ۲: کاربر ویدیو فرستاده و منتظر تایید سطح ۱ است
        else if (kycStatus === 'pending_lite' || kycStatus === 'pending') {
            f1.style.display = 'none';
            s1.classList.remove('show');
            p1.classList.add('show'); // کارت طلایی انتظار
            
            lock2.style.display = 'flex'; // سطح ۲ قفل است
            footer.style.display = 'none'; // دکمه مخفی
        }
        
        // سناریو ۳: حالت اولیه (مهمان)
        else {
            f1.style.display = 'block';
            p1.classList.remove('show');
            s1.classList.remove('show');
            
            lock2.style.display = 'flex';
            
            // اگر تب ۱ فعال است، دکمه را نشان بده
            if (currentTab === 'lvl1') footer.style.display = 'flex';
            else footer.style.display = 'none';
        }
    }

    // --- مدیریت تب‌ها ---
    window.switchTab = function(tab) {
        currentTab = tab;
        
        // تغییر استایل دکمه‌های تب
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        
        if (tab === 'lvl1') {
            document.getElementById('tab-lvl1').classList.add('active');
            document.getElementById('lvl1-content').style.display = 'block';
            document.getElementById('lvl2-content').style.display = 'none';
            
            // آیا دکمه پایین باید نمایش داده شود؟
            if (userKycLevel < 2 && kycStatus !== 'pending_lite') {
                footer.style.display = 'flex';
                updateFooterState();
            } else {
                footer.style.display = 'none';
            }
        } else {
            document.getElementById('tab-lvl2').classList.add('active');
            document.getElementById('lvl1-content').style.display = 'none';
            document.getElementById('lvl2-content').style.display = 'block';
            
            // آیا دکمه پایین باید نمایش داده شود؟ (فقط اگر سطح ۲ باز باشد و پندینگ نباشد)
            if (userKycLevel >= 2 && kycStatus !== 'pending_full' && userKycLevel < 3) {
                footer.style.display = 'flex';
                updateFooterState();
            } else {
                footer.style.display = 'none';
            }
        }
        
        tg.HapticFeedback.selectionChanged();
    }

    // --- آپدیت متن و رنگ دکمه شناور (Global Function) ---
    window.updateFooterState = function() {
        if (currentTab === 'lvl1') {
            const vid = document.getElementById('video-file').files.length > 0;
            const card = document.getElementById('card-file').files.length > 0;
            
            if (vid && card) {
                enableBtn('ارسال و فعال‌سازی آنی 🚀', 'آماده ارسال');
            } else {
                disableBtn('مدارک ناقص ⚠️', 'ارسال مدارک');
            }
        } 
        else if (currentTab === 'lvl2') {
            // بررسی تمام فیلدها برای سطح ۲
            const name = document.getElementById('full_name').value.trim();
            const nid = document.getElementById('national_id').value.trim();
            const birth = document.getElementById('birth_date').value.trim();
            const phone = document.getElementById('phone_number').value.trim();
            
            const f1 = document.getElementById('id_front').files.length > 0;
            const f2 = document.getElementById('id_back').files.length > 0;
            const f3 = document.getElementById('bank_card_2').files.length > 0;
            const f4 = document.getElementById('selfie_2').files.length > 0;
            
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
        statusText.style.color = "#10b981"; // Green
    }

    function disableBtn(statusMsg, text) {
        btnSubmit.classList.remove('ready'); 
        btnSubmit.disabled = true;
        btnSubmit.innerHTML = `<span>${text}</span><i class="fas fa-arrow-up"></i>`;
        statusText.innerText = statusMsg; 
        statusText.style.color = "#888"; // Grey
    }

    // --- هندلر انتخاب فایل ---
    window.handleFileSelect = function(input, type, lvl) {
        if (input.files && input.files[0]) {
            const file = input.files[0];
            
            // چک حجم برای ویدیو
            if (type === 'vid' && file.size > 25 * 1024 * 1024) {
                tg.showAlert("حجم ویدیو زیاد است (حداکثر ۲۵ مگابایت).");
                input.value = ""; return;
            }
            
            // افکت انتخاب شدن باکس
            const area = input.parentElement;
            area.classList.add('active');
            
            // تغییر آیکون و متن
            const icon = area.querySelector(lvl === 1 ? '.upload-icon' : '.mini-icon');
            const title = area.querySelector(lvl === 1 ? '.upload-title' : '.mini-label');
            
            if(icon) {
                icon.style.color = "#fff"; 
                icon.innerHTML = '<i class="fas fa-check"></i>';
            }
            if(title) {
                let name = file.name;
                if (name.length > 12) name = name.substring(0, 12) + '...';
                title.innerText = "آماده: " + name;
                title.style.color = "#10b981";
            }
            
            tg.HapticFeedback.notificationOccurred('success');
        }
        updateFooterState();
    }
    
    window.handleFileSelect2 = function(input, type) {
        window.handleFileSelect(input, type, 2);
    }

    // --- هندلر کلیک دکمه اصلی ---
    window.handleSubmit = function() {
        if (currentTab === 'lvl1') submitLevel1();
        else submitLevel2();
    }

    // --- ارسال سطح ۱ (ویدیو) ---
    async function submitLevel1() {
        const vidInput = document.getElementById('video-file');
        const cardInput = document.getElementById('card-file');

        btnSubmit.disabled = true;
        btnSubmit.innerHTML = '<i class="fas fa-spinner fa-spin"></i> در حال آپلود...';
        
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
                // تغییر وضعیت محلی برای آپدیت سریع UI
                kycStatus = 'pending_lite'; 
                renderPageBasedOnStatus(); 
                tg.showAlert("✅ مدارک ارسال شد. منتظر بررسی ادمین باشید.");
            } else {
                throw new Error(result.message);
            }

        } catch (e) {
            tg.showAlert("❌ خطا: " + e.message);
            // ریست دکمه
            btnSubmit.disabled = false;
            updateFooterState();
        }
    }

    // --- ارسال سطح ۲ (کامل) ---
    async function submitLevel2() {
        btnSubmit.disabled = true;
        btnSubmit.innerHTML = '<i class="fas fa-spinner fa-spin"></i> آپلود سنگین...';
        
        const formData = new FormData();
        formData.append('initData', tg.initData);
        formData.append('full_name', document.getElementById('full_name').value);
        formData.append('national_id', document.getElementById('national_id').value);
        formData.append('birth_date', document.getElementById('birth_date').value || '-');
        formData.append('phone_number', document.getElementById('phone_number').value || '-');
        formData.append('card_number', 'Pending');
        
        // فایل‌ها
        formData.append('id_front_file', document.getElementById('id_front').files[0]);
        formData.append('id_back_file', document.getElementById('id_back').files[0]);
        formData.append('bank_card_file', document.getElementById('bank_card_2').files[0]);
        formData.append('selfie_file', document.getElementById('selfie_2').files[0]);

        try {
            const res = await fetch(`${API_BASE_URL}/webapp/submit_full_kyc`, {
                method: 'POST',
                body: formData,
                headers: { 'ngrok-skip-browser-warning': 'true' }
            });
            
            const result = await res.json();
            
            if (res.ok && result.status === 'success') {
                tg.HapticFeedback.notificationOccurred('success');
                kycStatus = 'pending_full';
                renderPageBasedOnStatus(); // آپدیت فوری برای نمایش کارت انتظار سطح ۲
                tg.showAlert("✅ مدارک کامل ارسال شد.");
            } else {
                throw new Error(result.message);
            }

        } catch (e) {
            tg.showAlert("❌ خطا: " + e.message);
            btnSubmit.disabled = false;
            updateFooterState();
        }
    }

})();