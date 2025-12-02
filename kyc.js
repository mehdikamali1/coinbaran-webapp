/* webapp/kyc.js (v74.0 - Persian Logic) */
(function () {
    'use strict';

    const tg = window.Telegram.WebApp;
    const API_BASE_URL = window.location.origin;

    // Elements
    const loader = document.getElementById('loader');
    const formContainer = document.getElementById('kyc-form-container');
    const form = document.getElementById('kyc-form');
    
    // Status Cards
    const cardVerified = document.getElementById('status-verified');
    const cardPending = document.getElementById('status-pending');

    // Inputs (Matches your original IDs)
    const inputs = {
        fullName: document.getElementById('full_name'),
        nationalId: document.getElementById('national_id'),
        birthDate: document.getElementById('birth_date'),
        phoneNumber: document.getElementById('phone_number'),
        cardNumber: document.getElementById('card_number'),
        idFront: document.getElementById('id_front_file'),
        idBack: document.getElementById('id_back_file'),
        bankCard: document.getElementById('bank_card_file'),
        selfie: document.getElementById('selfie_file')
    };

    window.onload = function() {
        tg.ready();
        tg.expand();
        tg.setHeaderColor('#050505');
        tg.setBackgroundColor('#050505');

        // تنظیم دکمه اصلی تلگرام
        tg.MainButton.setText("ارسال مدارک برای بررسی");
        tg.MainButton.setTextColor("#000000");
        tg.MainButton.setColor("#F0B90B"); // Gold
        tg.MainButton.hide(); 

        tg.MainButton.onClick(submitForm);

        // 1. بررسی وضعیت کاربر (آیا قبلاً مدارک فرستاده؟)
        checkUserStatus();

        // 2. تنظیم لیسنرها برای فرم
        setupFormListeners();
    };

    // --- بررسی وضعیت احراز هویت ---
    async function checkUserStatus() {
        if (!tg.initData) return;
        
        try {
            const res = await fetch(`${API_BASE_URL}/webapp/get_user_data`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ initData: tg.initData })
            });
            const data = await res.json();
            
            if (data.kyc_status_code === 'verified') {
                // اگر تایید شده، فرم مخفی و کارت سبز نمایش داده شود
                if(cardVerified) cardVerified.classList.add('visible');
                if(formContainer) formContainer.style.display = 'none'; 
                tg.MainButton.hide();
            } else if (data.kyc_status_code === 'pending') {
                // اگر در حال بررسی است، کارت زرد نمایش داده شود
                if(cardPending) cardPending.classList.add('visible');
                if(formContainer) formContainer.innerHTML = '<div style="text-align:center; padding:30px; color:#888; font-size:0.9rem;">مدارک شما با موفقیت دریافت شده و در حال بررسی توسط کارشناسان است.</div>';
                tg.MainButton.hide();
            } else {
                // اگر وضعیت نامشخص یا رد شده است، فرم نمایش داده شود
                if(formContainer) formContainer.style.opacity = '1';
            }
        } catch (e) {
            console.error("Status Check Error:", e);
        }
    }

    // --- مدیریت فرم ---
    function setupFormListeners() {
        // لیسنر برای فیلدهای متنی
        const textInputs = [inputs.fullName, inputs.nationalId, inputs.birthDate, inputs.phoneNumber, inputs.cardNumber];
        textInputs.forEach(input => {
            if(input) input.addEventListener('input', checkFormValidity);
        });

        // لیسنر برای فیلدهای فایل
        const fileInputs = [inputs.idFront, inputs.idBack, inputs.bankCard, inputs.selfie];
        fileInputs.forEach(input => {
            if(input) {
                input.addEventListener('change', function() {
                    const wrapper = this.closest('.file-upload-wrapper');
                    const textEl = wrapper.querySelector('.file-upload-text');
                    const iconEl = wrapper.querySelector('.file-upload-icon');

                    if (this.files && this.files.length > 0) {
                        // فایل انتخاب شد
                        wrapper.classList.add('file-selected');
                        textEl.innerText = this.files[0].name; // نمایش نام فایل
                        // تغییر آیکون به تیک سبز
                        iconEl.className = 'fas fa-check-circle file-upload-icon'; 
                        tg.HapticFeedback.selectionChanged();
                    } else {
                        // فایل حذف شد
                        wrapper.classList.remove('file-selected');
                        // متن پیش‌فرض بر اساس نوع اینپوت
                        let defaultText = "انتخاب فایل";
                        let defaultIcon = "fas fa-cloud-upload-alt";
                        
                        if(this.id.includes('selfie')) { defaultText = "سلفی با مدارک"; defaultIcon = "fas fa-camera"; }
                        else if(this.id.includes('bank')) { defaultText = "کارت بانکی"; defaultIcon = "fas fa-credit-card"; }
                        else if(this.id.includes('front')) { defaultText = "روی کارت ملی"; defaultIcon = "fas fa-id-card"; }
                        else if(this.id.includes('back')) { defaultText = "پشت کارت ملی"; defaultIcon = "fas fa-id-card"; }

                        textEl.innerText = defaultText;
                        iconEl.className = `${defaultIcon} file-upload-icon`;
                    }
                    checkFormValidity();
                });
            }
        });
    }

    function checkFormValidity() {
        let isValid = true;

        // بررسی پر بودن فیلدها
        if (!inputs.fullName.value.trim()) isValid = false;
        if (inputs.nationalId.value.length < 10) isValid = false;
        if (!inputs.birthDate.value.trim()) isValid = false;
        if (inputs.phoneNumber.value.length < 10) isValid = false;
        if (inputs.cardNumber.value.length < 16) isValid = false;

        // بررسی انتخاب فایل‌ها
        if (inputs.idFront.files.length === 0) isValid = false;
        if (inputs.idBack.files.length === 0) isValid = false;
        if (inputs.bankCard.files.length === 0) isValid = false;
        if (inputs.selfie.files.length === 0) isValid = false;

        // نمایش/مخفی کردن دکمه اصلی تلگرام
        if (isValid) {
            tg.MainButton.show();
            tg.MainButton.enable();
        } else {
            tg.MainButton.hide();
        }
    }

    async function submitForm() {
        tg.MainButton.showProgress();
        tg.MainButton.disable();
        
        // نمایش لودر داخلی
        if(loader) {
            loader.classList.remove('hidden');
            loader.style.display = 'flex';
            if(formContainer) formContainer.style.opacity = '0.3';
        }

        const formData = new FormData();
        // داده‌های امنیتی و متنی
        formData.append("initData", tg.initData || "");
        formData.append("full_name", inputs.fullName.value.trim());
        formData.append("national_id", inputs.nationalId.value.trim());
        formData.append("birth_date", inputs.birthDate.value.trim());
        formData.append("phone_number", inputs.phoneNumber.value.trim());
        formData.append("card_number", inputs.cardNumber.value.trim());

        // فایل‌ها
        formData.append("id_front_file", inputs.idFront.files[0]);
        formData.append("id_back_file", inputs.idBack.files[0]);
        formData.append("bank_card_file", inputs.bankCard.files[0]);
        formData.append("selfie_file", inputs.selfie.files[0]);

        try {
            const response = await fetch(`${API_BASE_URL}/webapp/submit_full_kyc`, {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (response.ok && result.status === 'success') {
                tg.HapticFeedback.notificationOccurred('success');
                tg.showAlert("✅ مدارک شما با موفقیت ارسال شد.\nنتیجه بررسی از طریق ربات به شما اطلاع داده می‌شود.", function() {
                    tg.close(); // بستن مینی‌اپ
                });
            } else {
                throw new Error(result.message || "آپلود ناموفق بود");
            }

        } catch (error) {
            console.error("KYC Error:", error);
            tg.HapticFeedback.notificationOccurred('error');
            tg.showAlert("⛔️ خطا در ارسال: " + error.message);
            
            // بازگرداندن حالت دکمه و فرم
            tg.MainButton.hideProgress();
            tg.MainButton.enable();
            if(loader) {
                loader.classList.add('hidden');
                loader.style.display = 'none';
                if(formContainer) formContainer.style.opacity = '1';
            }
        }
    }

})();