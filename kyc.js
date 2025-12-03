/* webapp/kyc.js (v76.0 - Video KYC Logic) */
(function () {
    'use strict';

    const tg = window.Telegram.WebApp;
    const API_BASE_URL = window.location.origin;

    // Elements
    const loader = document.getElementById('loader');
    
    // Level 1 Inputs
    const videoInput = document.getElementById('video-file');
    const cardInput = document.getElementById('card-file');
    const btnSubmitLvl1 = document.getElementById('btn-submit-lvl1');

    window.onload = function() {
        tg.ready();
        tg.expand();
        tg.setHeaderColor('#050505');
        tg.setBackgroundColor('#050505');
        
        // Hide initial loader
        if(loader) loader.style.display = 'none';
        
        // Setup Tabs (If logic is needed outside HTML onclick)
        // Tabs are handled via inline onclick in HTML for speed
    };

    // --- توابع کمکی ---
    
    // این تابع در HTML صدا زده می‌شود (onclick)
    window.switchTab = function(tab) {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.level-container').forEach(c => c.style.display = 'none');
        
        if(tab === 'lvl1') {
            document.querySelector('.tab-btn:nth-child(1)').classList.add('active');
            document.getElementById('lvl1-content').style.display = 'block';
            tg.HapticFeedback.selectionChanged();
        } else {
            document.querySelector('.tab-btn:nth-child(2)').classList.add('active');
            document.getElementById('lvl2-content').style.display = 'block';
            tg.HapticFeedback.selectionChanged();
        }
    }

    // هندلر انتخاب فایل
    window.handleFileSelect = function(input, type) {
        const label = document.getElementById(type + '-label');
        const icon = document.getElementById(type + '-icon');
        const area = input.parentElement;
        
        if(input.files && input.files[0]) {
            const file = input.files[0];
            
            // چک کردن حجم ویدیو (حدود ۲۵ مگابایت)
            if(type === 'vid' && file.size > 25 * 1024 * 1024) {
                tg.showAlert("حجم ویدیو زیاد است (حداکثر ۲۵ مگابایت). لطفاً ویدیو کوتاه‌تری بگیرید.");
                input.value = ""; 
                return;
            }
            
            // نمایش نام فایل
            let fileName = file.name;
            if (fileName.length > 20) fileName = fileName.substring(0, 15) + '...';
            
            label.innerText = "✅ فایل آماده: " + fileName;
            label.style.color = "var(--accent-green)";
            
            // تغییر آیکون
            icon.className = "fas fa-check-circle upload-icon";
            icon.style.color = "var(--accent-green)";
            
            // افکت فعال شدن باکس
            area.classList.add('active');
            tg.HapticFeedback.notificationOccurred('success');
        }
    }

    // --- ارسال فرم سطح ۱ (ویدیو) ---
    window.submitLevel1 = async function() {
        if(!videoInput.files[0]) { 
            tg.showAlert("لطفاً ابتدا ویدیوی سلفی را ضبط کنید."); 
            tg.HapticFeedback.notificationOccurred('warning');
            return; 
        }
        if(!cardInput.files[0]) { 
            tg.showAlert("لطفاً تصویر کارت بانکی خود را انتخاب کنید."); 
            tg.HapticFeedback.notificationOccurred('warning');
            return; 
        }

        // تغییر ظاهر دکمه
        btnSubmitLvl1.disabled = true;
        const originalText = btnSubmitLvl1.innerHTML;
        btnSubmitLvl1.innerHTML = '<i class="fas fa-spinner fa-spin"></i> در حال آپلود...';
        btnSubmitLvl1.style.opacity = "0.8";
        
        tg.HapticFeedback.impactOccurred('heavy');

        const formData = new FormData();
        formData.append('initData', tg.initData || "");
        formData.append('video', videoInput.files[0]);
        formData.append('bank_card', cardInput.files[0]);

        try {
            const res = await fetch(`${API_BASE_URL}/webapp/submit_kyc_lite`, {
                method: 'POST',
                body: formData,
                headers: { 
                    'ngrok-skip-browser-warning': 'true' 
                }
            });
            
            let result;
            try { result = await res.json(); } 
            catch { throw new Error("خطای سرور یا شبکه"); }

            if (res.ok && result.status === 'success') {
                tg.HapticFeedback.notificationOccurred('success');
                tg.showAlert("✅ مدارک با موفقیت ارسال شد.\nنتیجه بررسی به زودی از طریق ربات اعلام می‌شود.", function() {
                    tg.close();
                });
            } else {
                throw new Error(result.message || "مشکل در ارسال");
            }

        } catch(e) {
            console.error("KYC Error:", e);
            tg.HapticFeedback.notificationOccurred('error');
            tg.showAlert("❌ خطا: " + e.message);
        } finally {
            // بازگرداندن دکمه به حالت اول
            btnSubmitLvl1.disabled = false;
            btnSubmitLvl1.innerHTML = originalText;
            btnSubmitLvl1.style.opacity = "1";
        }
    }

    // --- فرم سطح ۲ (فعلا نمایشی) ---
    window.submitLevel2 = function() {
        tg.showAlert("لطفاً ابتدا احراز هویت سطح ۱ (ویدیویی) را تکمیل کنید.");
    }

})();