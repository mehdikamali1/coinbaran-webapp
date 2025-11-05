(function () {
    const tg = window.Telegram.WebApp;
    
    // ------------------------------------------------------------------------
    // ⚠️ قدم شما: این آدرس را با آدرس جدید Cloudflare خودتان جایگزین کنید
    // ------------------------------------------------------------------------
    const API_BASE_URL = " https://mia-practical-compaq-newfoundland.trycloudflare.com"; // <-- ❗️❗️❗️ اینجا را آپدیت کن

    // --- عناصر DOM ---
    const formContainer = document.getElementById('kyc-form-container');
    const loader = document.getElementById('loader');
    const form = document.getElementById('kyc-form');
    
    // --- لیست تمام فیلدهای ورودی ---
    const inputs = {
        full_name: document.getElementById('full_name'),
        national_id: document.getElementById('national_id'),
        birth_date: document.getElementById('birth_date'),
        phone_number: document.getElementById('phone_number'),
        card_number: document.getElementById('card_number')
    };

    /**
     * بررسی می‌کند که آیا تمام فیلدهای فرم پر شده‌اند یا خیر.
     */
    function validateForm() {
        for (const key in inputs) {
            if (!inputs[key].value || inputs[key].value.trim() === '') {
                return false; // اگر حتی یکی خالی بود، فرم نامعتبر است
            }
        }
        
        // Regex for YYYY/MM/DD format (e.g., 1370/05/14)
        const birthDateRegex = /^\d{4}\/\d{1,2}\/\d{1,2}$/;
        if (!birthDateRegex.test(inputs.birth_date.value.trim())) {
            return false;
        }

        if (inputs.national_id.value.length !== 10 || !/^\d+$/.test(inputs.national_id.value)) {
            return false;
        }
        if (inputs.card_number.value.length !== 16 || !/^\d+$/.test(inputs.card_number.value)) {
            return false;
        }
        if (inputs.phone_number.value.length !== 11 || !inputs.phone_number.value.startsWith('09')) {
            return false;
        }
        
        return true; // همه فیلدها معتبر هستند
    }

    /**
     * وضعیت دکمه اصلی تلگرام را بر اساس اعتبار فرم، به‌روزرسانی می‌کند.
     */
    function updateMainButtonState() {
        if (validateForm()) {
            tg.MainButton.setText("✅ ارسال اطلاعات متنی");
            tg.MainButton.enable();
            tg.MainButton.show();
        } else {
            tg.MainButton.setText("لطفاً تمام فیلدها را کامل کنید");
            tg.MainButton.disable();
            tg.MainButton.show();
        }
    }

    /**
     * اطلاعات فرم را به سرور (FastAPI) ارسال می‌کند.
     */
    async function submitKycData() {
        if (!validateForm()) {
            tg.showAlert("لطفاً تمام فیلدها را به درستی پر کنید (مخصوصاً فرمت تاریخ تولد YYYY/MM/DD).");
            return;
        }

        // نمایش لودر و مخفی کردن فرم
        formContainer.classList.add('hidden');
        loader.classList.remove('hidden');
        tg.MainButton.showProgress(); // نمایش لودینگ روی دکمه

        const formData = {
            initData: tg.initData,
            full_name: inputs.full_name.value.trim(),
            national_id: inputs.national_id.value.trim(),
            birth_date: inputs.birth_date.value.trim(),
            phone_number: inputs.phone_number.value.trim(),
            card_number: inputs.card_number.value.trim().replace(/\s/g, '') // حذف هرگونه فاصله
        };

        try {
            const response = await fetch(`${API_BASE_URL}/webapp/submit_kyc_text`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(formData)
            });

            const result = await response.json();

            if (response.ok && result.status === "success") {
                // موفقیت‌آمیز
                tg.showAlert("✅ اطلاعات متنی شما با موفقیت ثبت شد. لطفاً برای ارسال مدارک به ربات بازگردید.");
                tg.close(); // بستن وب‌اپ
            } else {
                // خطا از سمت سرور (مثلاً کد ملی تکراری)
                const errorMessage = result.message || (result.detail || "خطای ناشناخته از سرور.");
                tg.showAlert(`⚠️ خطا: ${errorMessage}`);
                // نمایش مجدد فرم
                loader.classList.add('hidden');
                formContainer.classList.remove('hidden');
                tg.MainButton.hideProgress();
            }

        } catch (error) {
            console.error("Failed to submit KYC data:", error);
            tg.showAlert("❌ خطایی در ارتباط با سرور رخ داد. لطفاً دوباره تلاش کنید.");
            // نمایش مجدد فرم
            loader.classList.add('hidden');
            formContainer.classList.remove('hidden');
            tg.MainButton.hideProgress();
        }
    }

    /**
     * راه‌اندازی اولیه صفحه
     */
    function init() {
        tg.ready();
        tg.expand();
        tg.setHeaderColor('secondary_bg_color');
        tg.setBackgroundColor('bg_color');

        // 1. نمایش دکمه اصلی
        tg.MainButton.setParams({
            is_active: false,
            is_visible: true,
            text: "لطفاً تمام فیلدها را کامل کنید"
        });

        // 2. افزودن event listener به دکمه اصلی
        tg.MainButton.onClick(submitKycData);

        // 3. افزودن event listener به تمام فیلدهای ورودی
        Object.values(inputs).forEach(input => {
            input.addEventListener('input', updateMainButtonState);
        });

        // 4. بررسی اولیه وضعیت فرم (برای زمانی که کاربر بازمی‌گردد)
        updateMainButtonState();
    }

    // --- Entry Point ---
    document.addEventListener("DOMContentLoaded", init);

})();