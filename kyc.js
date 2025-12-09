/* webapp/kyc.js (v111.0 - Luxury KYC UI & Enhanced UX) */
(function () {
    'use strict';

    // --- GLOBAL ERROR TRAP ---
    window.onerror = function(msg, url, line, col, error) {
        var extra = !col ? '' : '\ncolumn: ' + col;
        extra += !error ? '' : '\nerror: ' + error;
        // به جای alert، از showAlert تلگرام استفاده می‌کنیم
        if(window.Telegram && window.Telegram.WebApp) {
            window.Telegram.WebApp.showAlert("⚠️ CRITICAL ERROR:\n" + msg + "\nline: " + line);
        } else {
             console.error("Critical JS Error:", error);
        }
        return false;
    };

    const tg = window.Telegram.WebApp;
    const API_BASE_URL = window.location.origin;
    
    // متغیرهای وضعیت سراسری
    let currentTab = 'lvl1'; 
    let userKycLevel = 1; 
    let kycStatus = 'none'; 

    // المان‌های اصلی رابط کاربری
    const btnSubmit = document.getElementById('main-submit-btn');
    const footer = document.getElementById('main-footer');
    const statusText = document.getElementById('status-text');
    const loader = document.getElementById('loader');

    // --- شروع برنامه ---
    window.onload = async function() {
        try {
            tg.ready(); 
            tg.expand();
            tg.setHeaderColor('#050505'); 
            tg.setBackgroundColor('#050505'); 
            
            // فعال سازی دکمه برگشت
            tg.BackButton.show();
            tg.BackButton.onClick(() => window.location.href = 'dashboard.html');

        } catch (e) {
            console.log("Not inside Telegram WebApp (or Ready Error):", e);
        }
        
        // 1. دریافت وضعیت کاربر از سرور
        await fetchUserStatus();
        
        // 2. مخفی کردن لودر
        if(loader) loader.style.display = 'none';

        // 3. تنظیم هندلرهای ورودی برای آپدیت لحظه‌ای وضعیت
        setupInputHandlers();
    };

    // --- توابع کمکی ---
    function setupInputHandlers() {
        // برای Level 2 Inputs
        const inputs = ['full_name', 'national_id', 'birth_date', 'phone_number'];
        inputs.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', updateFooterState);
                el.addEventListener('focus', () => tg.HapticFeedback.impactOccurred('light'));
            }
        });

        // Haptic Feedback برای کلیک‌های اصلی
        document.querySelectorAll('.tab-btn, .mini-upload, .upload-area').forEach(el => {
            el.addEventListener('click', () => {
                 try { tg.HapticFeedback.selectionChanged(); } catch(e){}
            });
        });
    }

    // --- دریافت وضعیت از سرور ---
    async function fetchUserStatus() {
        if (!tg.initData) {
            console.warn("No InitData found (Dev Mode?)");
        }
        
        try {
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
            
            if (data.status === 'success') {
                userKycLevel = parseInt(data.kyc_level) || 1;
                kycStatus = data.kyc_status_code || 'none';

                // اگر سطح ۲ تایید شده بود، تب را روی سطح ۲ می‌گذاریم.
                if (userKycLevel >= 3) {
                     currentTab = 'lvl2';
                     document.getElementById('tab-lvl2').classList.add('active');
                }
                
                renderPageBasedOnStatus();
            } else {
                tg.showAlert("خطا در دریافت اطلاعات: " + data.message);
            }

        } catch (e) {
            tg.showAlert("خطا در ارتباط با سرور. لطفاً اینترنت خود را چک کنید.");
        }
    }

    // --- لاجیک اصلی نمایش کارت‌ها و فرم‌ها ---
    function renderPageBasedOnStatus() {
        try {
            const f1 = document.getElementById('lvl1-form');
            const p1 = document.getElementById('lvl1-pending');
            const s1 = document.getElementById('lvl1-success');
            
            const lock2 = document.getElementById('lvl2-lock');
            const f2 = document.getElementById('lvl2-form');

            // --- Reset All ---
            [f1, p1, s1, lock2, f2].forEach(el => { if (el) el.style.display = 'none'; });
            [s1, p1].forEach(el => { if (el) el.classList.remove('show'); });

            // 1. نمایش محتوای تب فعال
            if (currentTab === 'lvl1') {
                document.getElementById('lvl1-content').style.display = 'block';
                document.getElementById('lvl2-content').style.display = 'none';
            } else { // lvl2
                document.getElementById('lvl1-content').style.display = 'none';
                document.getElementById('lvl2-content').style.display = 'block';
            }


            // --- تعیین وضعیت Tab 1 (Lite KYC) ---
            if (userKycLevel >= 2) {
                // تایید شده
                s1.classList.add('show');
                s1.style.display = 'block';
            } else if (kycStatus === 'pending_lite' || kycStatus === 'pending') {
                // در حال بررسی
                p1.classList.add('show'); 
                p1.style.display = 'block';
            } else {
                // فرم اولیه (نیاز به ارسال)
                f1.style.display = 'block';
            }

            // --- تعیین وضعیت Tab 2 (Full KYC) ---
            if (userKycLevel >= 2) {
                // قفل باز است
                lock2.style.display = 'none'; 
                if (userKycLevel === 3) {
                    // سطح ۳ کامل شده - نمایش پیام تبریک نهایی
                    f2.innerHTML = `
                        <div class="status-card card-success show" style="border-color:#FFCC00; background:rgba(255, 204, 0, 0.1);">
                            <i class="fas fa-gem success-icon" style="color:#FFCC00;"></i>
                            <h2 style="color:#fff; margin-bottom:10px;">تایید نهایی شد 💎</h2>
                            <p style="color:#eee; font-size:0.9rem;">تبریک! حساب شما کاملاً وریفای شده است و محدودیتی ندارید.</p>
                        </div>`;
                    f2.style.display = 'block';
                    if(footer) footer.style.display = 'none';
                } else if (kycStatus === 'pending_full') {
                    // سطح ۲ ارسال شده و منتظر تایید است
                    f2.innerHTML = `
                        <div class="status-card card-pending show">
                            <i class="fas fa-hourglass-half pending-icon"></i>
                            <h2 style="color:#fff; margin-bottom:10px;">مدارک کامل در حال بررسی...</h2>
                            <p style="color:#ddd; font-size:0.9rem;">به محض تایید، دسترسی نامحدود خواهید داشت.</p>
                        </div>`;
                     f2.style.display = 'block';
                     if(footer) footer.style.display = 'none';
                } else {
                    // سطح ۲ باز است و باید پر شود
                    f2.style.display = 'block';
                }
            } else {
                // قفل است
                lock2.style.display = 'flex'; 
                f2.style.display = 'none';
            }
            
            // مدیریت نمایش فوتر (دکمه ارسال)
            if (currentTab === 'lvl1' && userKycLevel < 2 && kycStatus !== 'pending_lite') {
                if(footer) footer.style.display = 'flex';
                updateFooterState(); // برای آپدیت دکمه بر اساس پر بودن فرم ۱
            } else if (currentTab === 'lvl2' && userKycLevel >= 2 && kycStatus !== 'pending_full' && userKycLevel < 3) {
                 if(footer) footer.style.display = 'flex';
                 updateFooterState(); // برای آپدیت دکمه بر اساس پر بودن فرم ۲
            } else {
                if(footer) footer.style.display = 'none';
            }

        } catch(e) {
            console.error("Render Error:", e);
        }
    }

    // --- مدیریت تب‌ها ---
    window.switchTab = function(tab) {
        currentTab = tab;
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.getElementById(`tab-${tab}`).classList.add('active');
        
        renderPageBasedOnStatus();
        
        try { tg.HapticFeedback.selectionChanged(); } catch(e){}
    }

    // --- آپدیت متن و رنگ دکمه شناور ---
    window.updateFooterState = function() {
        if(!btnSubmit || !statusText) return;

        if (currentTab === 'lvl1' && userKycLevel < 2 && kycStatus !== 'pending_lite') {
            const vidInput = document.getElementById('video-file');
            const cardInput = document.getElementById('card-file');
            
            const vid = vidInput && vidInput.files.length > 0;
            const card = cardInput && cardInput.files.length > 0;
            
            if (vid && card) {
                enableBtn('ارسال و فعال‌سازی آنی 🚀', 'آماده ارسال');
            } else {
                disableBtn('مدارک ناقص ⚠️', 'ارسال مدارک');
            }
        } 
        else if (currentTab === 'lvl2' && userKycLevel >= 2 && kycStatus !== 'pending_full' && userKycLevel < 3) {
            const nameEl = document.getElementById('full_name');
            const nidEl = document.getElementById('national_id');
            const birthEl = document.getElementById('birth_date');
            const phoneEl = document.getElementById('phone_number');
            
            if(!nameEl || !nidEl || !birthEl || !phoneEl) return;

            const name = nameEl.value.trim();
            const nid = nidEl.value.trim();
            const birth = birthEl.value.trim();
            const phone = phoneEl.value.trim();
            
            const f1 = document.getElementById('id_front').files.length > 0;
            const f2 = document.getElementById('id_back').files.length > 0;
            const f3 = document.getElementById('bank_card_2').files.length > 0;
            const f4 = document.getElementById('selfie_2').files.length > 0;
            
            if (name && nid.length >= 10 && birth && phone.length >= 10 && f1 && f2 && f3 && f4) {
                enableBtn('ارسال برای بررسی نهایی 💎', 'تکمیل شده', '#3B82F6');
            } else {
                disableBtn('فرم ناقص 📝', 'تکمیل فرم سطح ۲');
            }
        } else {
            // اگر در وضعیتی غیرقابل ارسال هستیم، دکمه را غیرفعال نمایش بده
            disableBtn('در حال بررسی/تایید شده', 'وضعیت نهایی');
        }
    }

    function enableBtn(text, statusMsg, color = "#F0B90B") {
        btnSubmit.classList.add('ready'); 
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = `<span>${text}</span><i class="fas fa-paper-plane"></i>`;
        statusText.innerText = statusMsg; 
        statusText.style.color = color; 
        btnSubmit.style.background = `linear-gradient(135deg, ${color} 0%, ${color.replace('#', '#99')} 100%)`;
        btnSubmit.style.boxShadow = `0 4px 20px ${color.replace('#', 'rgba(')}${', 0.5)'}`;
    }

    function disableBtn(statusMsg, text) {
        btnSubmit.classList.remove('ready'); 
        btnSubmit.disabled = true;
        btnSubmit.innerHTML = `<span>${text}</span><i class="fas fa-arrow-up"></i>`;
        statusText.innerText = statusMsg; 
        statusText.style.color = "#888"; 
        btnSubmit.style.background = 'rgba(255, 204, 0, 0.1)';
        btnSubmit.style.boxShadow = 'none';
    }

    // --- هندلر انتخاب فایل ---
    window.handleFileSelect = function(input, type, lvl) {
        if (input.files && input.files[0]) {
            const file = input.files[0];
            
            // چک کردن حجم برای ویدیو (25MB)
            if (type === 'vid' && file.size > 25 * 1024 * 1024) {
                tg.showAlert("حجم ویدیو زیاد است (حداکثر ۲۵ مگابایت).");
                input.value = ""; 
                try { tg.HapticFeedback.notificationOccurred('error'); } catch(e){}
                return;
            }
            
            const area = input.parentElement;
            area.classList.add('active');
            
            // تغییر آیکون و متن
            const icon = area.querySelector(lvl === 1 ? '.upload-icon' : '.mini-icon');
            const title = area.querySelector(lvl === 1 ? '.upload-title' : '.mini-label');
            
            if(icon) { icon.style.color = "#fff"; icon.innerHTML = '<i class="fas fa-check"></i>'; }
            if(title) { 
                let name = file.name;
                if (name.length > 12) name = name.substring(0, 12) + '...';
                title.innerText = "آماده: " + name; 
                title.style.color = "#10b981"; 
            }
            
            try { tg.HapticFeedback.notificationOccurred('success'); } catch(e){}
        }
        updateFooterState();
    }
    
    window.handleFileSelect2 = function(input, type) {
        window.handleFileSelect(input, type, 2);
    }

    // --- هندلر کلیک دکمه اصلی ---
    window.handleSubmit = function() {
         try { tg.HapticFeedback.impactOccurred('heavy'); } catch(e){}
        if (currentTab === 'lvl1') submitLevel1();
        else submitLevel2();
    }

    // --- ارسال سطح ۱ ---
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
                try { tg.HapticFeedback.notificationOccurred('success'); } catch(e){}
                kycStatus = 'pending_lite'; 
                renderPageBasedOnStatus(); 
                tg.showAlert("✅ مدارک ارسال شد. منتظر بررسی ادمین باشید.");
            } else {
                throw new Error(result.message);
            }

        } catch (e) {
            tg.showAlert("❌ خطا: " + e.message);
            btnSubmit.disabled = false;
            updateFooterState();
        }
    }

    // --- ارسال سطح ۲ ---
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
                try { tg.HapticFeedback.notificationOccurred('success'); } catch(e){}
                kycStatus = 'pending_full';
                renderPageBasedOnStatus();
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