/* webapp/kyc.js (v95.0 - Final Full Production Logic) */
(function () {
    'use strict';

    const tg = window.Telegram.WebApp;
    const API_BASE_URL = window.location.origin;
    
    // متغیرهای وضعیت سراسری
    let currentTab = 'lvl1'; 
    let userKycLevel = 1;     // 1: مهمان, 2: ویدیو تایید شده, 3: کامل
    let kycStatus = 'none';   // وضعیت دقیق (pending_lite, pending_full, approved, ...)

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
            tg.showAlert("خطا در ارتباط با سرور. لطفاً مجدداً تلاش کنید.");
        }
    }

    // --- لاجیک اصلی نمایش کارت‌ها و فرم‌ها ---
    function renderPageBasedOnStatus() {
        // المان‌های سطح ۱
        const f1 = document.getElementById('lvl1-form');
        const p1 = document.getElementById('lvl1-pending');
        const s1 = document.getElementById('lvl1-success');
        
        // المان‌های سطح ۲
        const lock2 = document.getElementById('lvl2-lock');
        const f2 = document.getElementById('lvl2-form');
        // (در HTML فعلی کارت‌های پندینگ/ساکسس برای سطح ۲ مخفی هستند اما لاجیک آن اینجاست)
        
        // سناریو ۱: کاربر حداقل سطح ۲ است (یعنی ویدیو تایید شده)
        if (userKycLevel >= 2) {
            // --- مدیریت سطح ۱ (نمایش موفقیت) ---
            f1.style.display = 'none';
            p1.classList.remove('show');
            s1.classList.add('show'); // نمایش کارت سبز تایید سطح ۱
            
            // --- مدیریت سطح ۲ ---
            lock2.style.display = 'none'; // برداشتن قفل سطح ۲
            
            if (userKycLevel === 3) {
                // سطح ۳ کامل شده (نمایش پیام نهایی)
                f2.style.display = 'none';
                // اینجا می‌توان کارت موفقیت سطح ۲ را نمایش داد
                footer.style.display = 'none';
            } 
            else if (kycStatus === 'pending_full') {
                // سطح ۲ ارسال شده و منتظر بررسی است
                f2.style.display = 'none';
                // نمایش پیام انتظار برای سطح ۲ (می‌توانید یک div جدید در HTML اضافه کنید)
                lock2.innerHTML = '<h3 style="color:#fff">مدارک کامل در حال بررسی...</h3><p style="color:#aaa">لطفاً منتظر تایید ادمین باشید.</p>';
                lock2.style.display = 'flex'; // استفاده از کانتینر قفل برای نمایش پیام
                footer.style.display = 'none';
            } 
            else {
                // سطح ۲ باز است و فرم باید پر شود
                f2.style.display = 'block';
                // اگر تب ۲ باز باشد، دکمه را نشان بده
                if(currentTab === 'lvl2') footer.style.display = 'flex';
                else footer.style.display = 'none';
            }
        }
        
        // سناریو ۲: کاربر ویدیو فرستاده و منتظر تایید است (سطح ۱ پندینگ)
        else if (kycStatus === 'pending_lite' || kycStatus === 'pending') {
            f1.style.display = 'none';
            s1.classList.remove('show');
            p1.classList.add('show'); // نمایش کارت طلایی انتظار
            
            lock2.style.display = 'flex'; // سطح ۲ قفل است
            footer.style.display = 'none'; // دکمه مخفی
        }
        
        // سناریو ۳: کاربر هنوز اقدامی نکرده یا رد شده (فرم سطح ۱ باز است)
        else {
            f1.style.display = 'block';
            p1.classList.remove('show');
            s1.classList.remove('show');
            
            lock2.style.display = 'flex'; // سطح ۲ قفل است
            
            // اگر در تب ۱ هستیم دکمه را نشان بده
            if (currentTab === 'lvl1') footer.style.display = 'flex';
            else footer.style.display = 'none';
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
            
            // تصمیم‌گیری برای نمایش دکمه در تب ۱
            if (userKycLevel < 2 && kycStatus !== 'pending_lite' && kycStatus !== 'pending') {
                footer.style.display = 'flex';
                updateFooterState();
            } else {
                footer.style.display = 'none';
            }
        } else {
            document.getElementById('tab-lvl2').classList.add('active');
            document.getElementById('lvl1-content').style.display = 'none';
            document.getElementById('lvl2-content').style.display = 'block';
            
            // تصمیم‌گیری برای نمایش دکمه در تب ۲
            // فقط اگر سطح ۱ پاس شده باشد و سطح ۲ پندینگ نباشد
            if (userKycLevel >= 2 && kycStatus !== 'pending_full' && userKycLevel < 3) {
                footer.style.display = 'flex';
                updateFooterState();
            } else {
                footer.style.display = 'none';
            }
        }
        
        tg.HapticFeedback.selectionChanged();
    }

    // --- آپدیت متن و رنگ دکمه شناور (اصلی) ---
    // این تابع توسط رویدادهای oninput و onchange صدا زده می‌شود
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
            // بررسی ۸ فیلد سطح ۲
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
        statusText.style.color = "var(--accent-green)";
    }

    function disableBtn(statusMsg, text) {
        btnSubmit.classList.remove('ready'); 
        btnSubmit.disabled = true;
        btnSubmit.innerHTML = `<span>${text}</span><i class="fas fa-arrow-up"></i>`;
        statusText.innerText = statusMsg; 
        statusText.style.color = "var(--text-muted)";
    }

    // --- هندلر انتخاب فایل سطح ۱ ---
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
            area.classList.add('active');
            
            const icon = area.querySelector('.upload-icon');
            const title = area.querySelector('.upload-title');
            
            if(icon) { 
                icon.style.color = "#fff"; 
                icon.innerHTML = '<i class="fas fa-check"></i>'; 
            }
            if(title) {
                let name = file.name;
                if (name.length > 15) name = name.substring(0, 15) + '...';
                title.innerText = "آماده: " + name;
                title.style.color = "var(--accent-green)";
            }
            
            tg.HapticFeedback.notificationOccurred('success');
        }
        updateFooterState();
    }
    
    // --- هندلر انتخاب فایل سطح ۲ ---
    window.handleFileSelect2 = function(input, type) {
        if (input.files && input.files[0]) {
            const area = input.parentElement;
            area.classList.add('active');
            
            const icon = area.querySelector('.mini-icon');
            const label = area.querySelector('.mini-label');
            
            if(icon) {
                icon.style.color = "#fff";
                icon.className = "fas fa-check-circle mini-icon";
            }
            if(label) {
                label.style.color = "var(--accent-green)";
                label.innerText = "انتخاب شد";
            }
            tg.HapticFeedback.notificationOccurred('success');
        }
        updateFooterState();
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
                    'ngrok-skip-browser-warning': 'true'
                }
            });
            
            const result = await res.json();
            
            if (res.ok && result.status === 'success') {
                tg.HapticFeedback.notificationOccurred('success');
                kycStatus = 'pending_lite'; 
                renderPageBasedOnStatus(); // آپدیت فوری صفحه
                tg.showAlert("✅ مدارک ارسال شد. منتظر بررسی ادمین باشید.");
            } else {
                throw new Error(result.message || "خطا در سرور");
            }

        } catch (e) {
            console.error(e);
            tg.showAlert("❌ خطا: " + e.message);
            tg.HapticFeedback.notificationOccurred('error');
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
        formData.append('card_number', 'Pending'); // فیلد اجباری بک‌اند
        
        formData.append('id_front_file', document.getElementById('id_front').files[0]);
        formData.append('id_back_file', document.getElementById('id_back').files[0]);
        formData.append('bank_card_file', document.getElementById('bank_card_2').files[0]);
        formData.append('selfie_file', document.getElementById('selfie_2').files[0]);

        try {
            const res = await fetch(`${API_BASE_URL}/webapp/submit_full_kyc`, {
                method: 'POST', 
                body: formData, 
                headers: {'ngrok-skip-browser-warning':'true'}
            });
            const r = await res.json();
            if(res.ok && r.status === 'success') {
                tg.showAlert("✅ مدارک کامل ارسال شد. منتظر تایید نهایی باشید.");
                kycStatus = 'pending_full';
                renderPageBasedOnStatus(); // آپدیت فوری
            } else throw new Error(r.message);
        } catch(e) {
            tg.showAlert("خطا: "+e.message);
            btnSubmit.disabled = false;
            updateFooterState();
        }
    }

})();