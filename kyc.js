/* webapp/kyc.js (v52.0 - Final Production Logic) */
(function () {
    'use strict';

    const tg = window.Telegram.WebApp;
    const API_BASE_URL = window.location.origin;

    // عناصر صفحه
    const loader = document.getElementById('loader');
    const formContainer = document.querySelector('.form-container');
    const form = document.getElementById('kyc-form');

    // لیست تمام ورودی‌ها (برای دسترسی آسان)
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

    // --- تابع اصلی (Entry Point) ---
    window.onload = function() {
        tg.ready();
        tg.expand();
        tg.setHeaderColor('#050505');
        tg.setBackgroundColor('#050505');

        // تنظیم دکمه اصلی تلگرام
        tg.MainButton.setText("ارسال مدارک برای بررسی");
        tg.MainButton.setTextColor("#000000");
        tg.MainButton.setColor("#D4AF37"); // رنگ طلایی
        tg.MainButton.hide(); // فعلاً مخفی تا فرم پر شود

        // افزودن لیسنر به دکمه اصلی
        tg.MainButton.onClick(submitForm);

        // راه‌اندازی لیسنرهای فرم
        setupFormListeners();
    };

    // --- مدیریت رویدادهای فرم ---
    function setupFormListeners() {
        // 1. برای فیلدهای متنی: بررسی پر شدن در هر تایپ
        const textInputs = [inputs.fullName, inputs.nationalId, inputs.birthDate, inputs.phoneNumber, inputs.cardNumber];
        textInputs.forEach(input => {
            input.addEventListener('input', checkFormValidity);
        });

        // 2. برای فایل‌ها: نمایش نام فایل و تغییر استایل
        const fileInputs = [inputs.idFront, inputs.idBack, inputs.bankCard, inputs.selfie];
        fileInputs.forEach(input => {
            input.addEventListener('change', function() {
                const wrapper = this.closest('.file-upload-wrapper');
                const textEl = wrapper.querySelector('.file-upload-text');
                const iconEl = wrapper.querySelector('.file-upload-icon');

                if (this.files && this.files.length > 0) {
                    // فایل انتخاب شده
                    wrapper.classList.add('file-selected');
                    textEl.innerText = this.files[0].name; // نمایش نام فایل
                    iconEl.classList.remove('fa-cloud-upload-alt'); 
                    iconEl.classList.add('fa-check-circle'); // تغییر آیکون به تیک
                } else {
                    // فایل حذف شده
                    wrapper.classList.remove('file-selected');
                    textEl.innerText = "برای انتخاب فایل کلیک کنید";
                    iconEl.classList.remove('fa-check-circle');
                }
                checkFormValidity();
            });
        });
    }

    // --- بررسی اعتبار فرم ---
    function checkFormValidity() {
        let isValid = true;

        // بررسی فیلدهای متنی
        if (!inputs.fullName.value.trim()) isValid = false;
        if (inputs.nationalId.value.length !== 10) isValid = false;
        if (!inputs.birthDate.value.trim()) isValid = false;
        if (inputs.phoneNumber.value.length < 10) isValid = false;
        if (inputs.cardNumber.value.length !== 16) isValid = false;

        // بررسی فایل‌ها
        if (inputs.idFront.files.length === 0) isValid = false;
        if (inputs.idBack.files.length === 0) isValid = false;
        if (inputs.bankCard.files.length === 0) isValid = false;
        if (inputs.selfie.files.length === 0) isValid = false;

        // فعال/غیرفعال کردن دکمه تلگرام
        if (isValid) {
            tg.MainButton.show();
            tg.MainButton.enable();
        } else {
            tg.MainButton.hide();
        }
    }

    // --- ارسال اطلاعات به سرور ---
    async function submitForm() {
        // جلوگیری از کلیک تکراری
        tg.MainButton.showProgress();
        tg.MainButton.disable();
        
        // نمایش لودر داخلی
        if(loader) {
            loader.classList.remove('hidden');
            formContainer.style.opacity = '0.3'; // کمرنگ کردن فرم
        }

        const formData = new FormData();
        
        // افزودن اطلاعات امنیتی
        formData.append("initData", tg.initData || "");

        // افزودن فیلدهای متنی
        formData.append("full_name", inputs.fullName.value.trim());
        formData.append("national_id", inputs.nationalId.value.trim());
        formData.append("birth_date", inputs.birthDate.value.trim());
        formData.append("phone_number", inputs.phoneNumber.value.trim());
        formData.append("card_number", inputs.cardNumber.value.trim());

        // افزودن فایل‌ها
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
                tg.showAlert("✅ " + result.message, function() {
                    tg.close(); // بستن مینی‌اپ بعد از موفقیت
                });
            } else {
                throw new Error(result.message || "خطا در ثبت اطلاعات");
            }

        } catch (error) {
            console.error("KYC Submit Error:", error);
            tg.HapticFeedback.notificationOccurred('error');
            tg.showAlert("⛔️ " + error.message);
            
            // بازگرداندن وضعیت به حالت عادی
            tg.MainButton.hideProgress();
            tg.MainButton.enable();
            if(loader) {
                loader.classList.add('hidden');
                formContainer.style.opacity = '1';
            }
        }
    }

})();